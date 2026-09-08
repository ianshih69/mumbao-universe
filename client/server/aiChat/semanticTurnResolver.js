import { z } from "zod";
import { normalizeConversationContext } from "./conversationContext.js";
import { matchSemanticDialogueCapabilities } from "./dialogueCapabilities.js";

export const semanticTurnKinds = Object.freeze([
  "informational",
  "transactional",
  "clarification",
  "confirmation",
  "unrelated",
]);
export const semanticScenarioActions = Object.freeze(["new", "continue", "none"]);

const semanticOperationSchema = z
  .object({
    operation: z.enum(["add", "replace", "remove", "set", "clear"]),
    entity: z.enum(["stay", "adult", "child", "infant", "pet", "breakfast"]),
    span_bindings: z.array(z.string().trim().min(1).max(80)).max(20),
    context_bindings: z.array(z.string().trim().min(1).max(120)).max(20),
  })
  .strict();

export const semanticTurnAstSchema = z
  .object({
    turn_kind: z.enum(semanticTurnKinds),
    goal_ids: z.array(z.string().trim().min(1).max(80)).max(20),
    scenario_action: z.enum(semanticScenarioActions),
    operations: z.array(semanticOperationSchema).max(20),
    references: z.array(z.string().trim().min(1).max(120)).max(20),
    missing_slots: z.array(z.string().trim().min(1).max(80)).max(20),
    clarification_code: z.string().trim().min(1).max(80).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const questionForm = /[？?嗎呢]$|^(?:請問|想問|想知道|可否|能否|是否)|怎麼|如何|何時|幾點|幾間|多少|有沒有|有無|最晚|規定|政策|會不會/;
const mutationForm = /再加|加上|增加|追加|另(?:外|[一二兩两三四五六七八九十\d])|改成|改為|改掉|換成|換|變成|調整|移除|拿掉|扣掉|減少|不要|取消|清除|少[一二兩两三四五六七八九十\d]/;
const continuationForm = /^(?:那|再|改|換|少|多|不要|取消|清除)|同樣|一樣|照(?:剛才|原本)|其他不變|原本/;
const resumeQuoteForm = /^(?:其他|其餘|剩下)(?:都)?(?:一樣|不變)(?:呢|[？?])?$|^(?:照|跟)(?:剛才|原本|前面)(?:一樣)?(?:呢|[？?])?$/;
const contextualTimingForm = /^(?:那)?(?:最晚|最早|幾點|時間)(?:呢|[？?])?$/;
const unresolvedReferenceForm = /^(?:原本|剛才|前面|上一(?:個|隻|筆))(?:那)?(?:一)?(?:個|隻|筆|項)?(?:呢|[？?])?$/;
const pendingAnswerForm = /^(?:都是|全部|都|通通|所有(?:的)?|對|是|沒錯|正確|不是|不對|否)(?:呢|[？?])?$/;
const quoteForm = /多少|多少錢|價格|房價|費用|報價|總共|試算|算一下/;
const availabilityForm = /有房|房況|空房|可訂|能訂|可以訂/;
const policyPriceForm = /押金|訂金|退款|取消費|違約|賠償|訪客費|延遲退房/;

function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isContextualTimingFragment(message) {
  return contextualTimingForm.test(compact(message));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function hasActiveScenario(context) {
  const state = normalizeConversationContext(context);
  return Boolean(
    state.quote_scenario?.scenario_id ||
      state.active_intent === "pricing" ||
      state.current_topic === "booking_price",
  );
}

function isPendingCurrent(context) {
  const state = normalizeConversationContext(context);
  const pending = state.pending_interaction;
  if (!pending) return false;
  if (!pending.scenario_id && !Number.isInteger(pending.context_version)) return true;
  return Boolean(
    state.quote_scenario?.scenario_id &&
      pending.scenario_id === state.quote_scenario.scenario_id &&
      pending.context_version === state.quote_scenario.context_version,
  );
}

function operationBinding(operation, spans) {
  const evidence = String(operation.evidence || "");
  const entitySpans = (spans || []).filter(
    (span) =>
      span.entity_hints?.includes(operation.entity) &&
      (!evidence || evidence.includes(span.text) || span.text.includes(evidence)),
  );
  const fallbackSpans = (spans || []).filter((span) =>
    span.entity_hints?.includes(operation.entity),
  );
  return {
    operation: operation.operation,
    entity: operation.entity,
    span_bindings: unique(
      (entitySpans.length ? entitySpans : fallbackSpans).map((span) => span.span_id),
    ),
    context_bindings: (() => {
      if (!["add", "replace", "remove"].includes(operation.operation)) {
        return [];
      }
      const refs = {
        stay: "stay.nights",
        adult: "party.adults",
        child: "party.children",
        infant: "party.infants",
        pet:
          operation.operation === "add"
            ? "pets.count"
            : "pets.individual_weights_kg",
        breakfast: "addons.breakfast_quantity",
      };
      return [refs[operation.entity], "quote_scenario.context_version"];
    })(),
  };
}

function hasCompleteSnapshot(operations, intents) {
  const stay = operations.find((operation) => operation.entity === "stay");
  const adult = operations.find((operation) => operation.entity === "adult");
  return Boolean(
    intents.includes("request_quote") &&
      stay?.check_in &&
      Number.isInteger(adult?.count),
  );
}

function isBarePetWeight(message, operations) {
  const text = compact(message);
  return Boolean(
    operations.some(
      (operation) =>
        operation.entity === "pet" && operation.weights_kg?.length,
    ) &&
      !mutationForm.test(text) &&
      !quoteForm.test(text)
  );
}

function minimalClarification(ambiguities) {
  return ambiguities?.[0]?.code || "low_confidence";
}

export function validateSemanticTurnAst(rawAst, { plan, minConfidence = 0.7 } = {}) {
  const ast = semanticTurnAstSchema.parse(rawAst);
  const spans = new Set((plan?.spans || []).map((span) => span.span_id));
  const context = normalizeConversationContext(plan?.context);
  const scenarioVersion = context.quote_scenario?.context_version ?? null;

  if (ast.confidence < minConfidence && ast.operations.length) {
    throw new Error("semantic_turn_low_confidence_mutation");
  }
  for (const operation of ast.operations) {
    if (!operation.span_bindings.length && !operation.context_bindings.length) {
      throw new Error("semantic_turn_operation_without_provenance");
    }
    if (operation.span_bindings.some((spanId) => !spans.has(spanId))) {
      throw new Error("semantic_turn_unknown_span_id");
    }
    if (
      operation.context_bindings.some(
        (binding) =>
          !/^(?:stay\.nights|party\.(?:adults|children|infants)|pets\.(?:count|individual_weights_kg)|addons\.breakfast_quantity|quote_scenario\.context_version)$/.test(binding),
      )
    ) {
      throw new Error("semantic_turn_invalid_context_binding");
    }
  }
  if (
    ast.scenario_action === "continue" &&
    scenarioVersion === null &&
    context.active_intent !== "pricing" &&
    context.current_topic !== "booking_price"
  ) {
    throw new Error("semantic_turn_missing_scenario");
  }
  if (ast.turn_kind !== "transactional" && ast.operations.length) {
    throw new Error("semantic_turn_read_only_mutation");
  }
  return ast;
}

export function resolveSemanticTurn({
  message,
  context,
  spans = [],
  deterministicResult,
  previousTopic = "",
} = {}) {
  const text = compact(message);
  const state = normalizeConversationContext(context);
  const rawOperations = deterministicResult?.operations || [];
  const intents = deterministicResult?.intents || [];
  const ambiguities = deterministicResult?.ambiguities || [];
  const activeScenario = hasActiveScenario(state);
  const pendingCurrent = isPendingCurrent(state);
  const capabilities = matchSemanticDialogueCapabilities(message);
  const controlledPreviousTopic = ["checkin_info", "checkout_info"].includes(
    previousTopic,
  )
    ? previousTopic
    : "";
  const contextualGoal = isContextualTimingFragment(text)
    ? controlledPreviousTopic
    : "";
  const resumeQuote = Boolean(activeScenario && resumeQuoteForm.test(text));
  const explicitMutation = Boolean(
    mutationForm.test(text) ||
      rawOperations.some((operation) =>
        ["add", "replace", "remove", "clear"].includes(operation.operation),
      ),
  );
  const explicitQuote = quoteForm.test(text) && !policyPriceForm.test(text);
  const completeSnapshot = hasCompleteSnapshot(rawOperations, intents);
  const valueBearingContinuation = Boolean(
    activeScenario &&
      rawOperations.length &&
      !questionForm.test(text) &&
      !isBarePetWeight(message, rawOperations),
  );
  const dayTypeQuote = Boolean(
    !activeScenario &&
      explicitQuote &&
      rawOperations.some(
        (operation) =>
          operation.entity === "stay" &&
          operation.date_type &&
          !operation.check_in,
      ),
  );
  const policyQuestion = Boolean(
    (capabilities.primary && !valueBearingContinuation) ||
      (intents.includes("policy_question") && !explicitMutation && !completeSnapshot),
  );
  const barePetWeight = isBarePetWeight(message, rawOperations);
  const canContinue = Boolean(
    activeScenario &&
      rawOperations.length &&
      (explicitMutation || continuationForm.test(text) || !barePetWeight),
  );

  let turnKind = "unrelated";
  let scenarioAction = "none";
  let selectedOperations = [];
  let clarificationCode = null;

  if (completeSnapshot) {
    turnKind = "transactional";
    scenarioAction = "new";
    selectedOperations = rawOperations.map((operation) => ({
      ...operation,
      operation: operation.operation === "clear" ? "clear" : "set",
    }));
  } else if (
    policyQuestion &&
    (!explicitMutation || (!rawOperations.length && !ambiguities.length))
  ) {
    turnKind = "informational";
  } else if (ambiguities.length && !pendingCurrent) {
    turnKind = "clarification";
    clarificationCode = minimalClarification(ambiguities);
  } else if (dayTypeQuote) {
    turnKind = "informational";
  } else if (explicitQuote && rawOperations.length && !activeScenario) {
    turnKind = "transactional";
    scenarioAction = "new";
    selectedOperations = rawOperations.map((operation) => ({
      ...operation,
      operation: operation.operation === "clear" ? "clear" : "set",
    }));
  } else if (explicitMutation && rawOperations.length && !activeScenario) {
    turnKind = "clarification";
    clarificationCode = "low_confidence";
  } else if (pendingCurrent && rawOperations.length) {
    turnKind = "transactional";
    scenarioAction = "continue";
    selectedOperations = rawOperations;
  } else if (canContinue) {
    turnKind = "transactional";
    scenarioAction = "continue";
    selectedOperations = rawOperations;
  } else if (resumeQuote) {
    turnKind = "transactional";
    scenarioAction = "continue";
  } else if (contextualGoal) {
    turnKind = "informational";
  } else if (policyQuestion || barePetWeight || capabilities.primary) {
    turnKind = "informational";
  } else if (availabilityForm.test(text)) {
    turnKind = "informational";
  } else if (!pendingCurrent && pendingAnswerForm.test(text)) {
    turnKind = "clarification";
    clarificationCode = "missing_reference";
  } else if (activeScenario && unresolvedReferenceForm.test(text)) {
    turnKind = "clarification";
    clarificationCode = "missing_entity";
  } else if (explicitMutation && !rawOperations.length) {
    turnKind = "clarification";
    clarificationCode = "missing_entity";
  } else if (rawOperations.length || intents.length) {
    turnKind = "informational";
  }

  const operationAsts = selectedOperations.map((operation) =>
    operationBinding(operation, spans),
  );
  const goalIds = unique([
    ...capabilities.goal_ids,
    contextualGoal,
    ...(turnKind === "transactional" ? ["request_quote"] : []),
    ...(capabilities.unknown_policy ? ["true_knowledge_gap"] : []),
  ]);
  const ast = validateSemanticTurnAst(
    {
      turn_kind: turnKind,
      goal_ids: goalIds,
      scenario_action: scenarioAction,
      operations: operationAsts,
      references: unique(operationAsts.flatMap((operation) => operation.context_bindings)),
      missing_slots: unique(deterministicResult?.missing_fields || []),
      clarification_code: clarificationCode,
      confidence: clarificationCode
        ? 0
        : selectedOperations.length
          ? Math.max(0.98, deterministicResult?.confidence ?? 0)
          : deterministicResult?.confidence ?? 1,
    },
    { plan: { spans, context: state } },
  );

  return {
    ast,
    operations: selectedOperations,
    capabilities,
    deterministic_fast_path_used: true,
    requires_model: false,
  };
}
