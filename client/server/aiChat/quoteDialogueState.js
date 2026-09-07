import { normalizeConversationContext } from "./conversationContext.js";

export const quoteDialogueTurnTypes = Object.freeze([
  "quote_snapshot",
  "quote_patch",
  "confirmation",
  "correction",
  "clarification_answer",
  "availability_request",
  "policy_question",
  "unrelated",
]);

function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function classifyConfirmationProtocol(message) {
  const text = compact(message).replace(/[。.!！、]+$/g, "");
  if (!text) return "none";
  if (/^(?:不對|不是這天|不是|否|no|n)(?:[，,：:]|$)/.test(text)) {
    return "reject";
  }
  if (/^(?:對|是|沒錯|正確|可以|好|好的|嗯|就這樣|yes|y|ok|okay)(?:[，,：:]|$)/.test(text)) {
    return "confirm";
  }
  return "none";
}

export function getYearlessDateClarification(message) {
  const text = compact(message);
  if (/\d{4}(?:年|[/.\-])/.test(text)) return null;
  const match = text.match(/(?:^|[^\d])(\d{1,2})月(\d{1,2})(?:日|號)?/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const probe = new Date(Date.UTC(2024, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    evidence: `${month}月${day}日`,
    question: `請問是幾年的${month}月${day}日？`,
  };
}

export function getQuoteScenario(context) {
  const state = normalizeConversationContext(context);
  return state.quote_scenario || null;
}

export function isPendingInteractionCurrent(context, pendingInteraction) {
  const state = normalizeConversationContext(context);
  const pending = state.pending_interaction;
  if (!pending || !pendingInteraction) return false;

  const hasBinding = Boolean(
    pending.scenario_id ||
      Number.isInteger(pending.context_version),
  );
  if (!hasBinding) return true;

  const scenario = state.quote_scenario;
  return Boolean(
    scenario?.scenario_id &&
      pending.scenario_id === scenario.scenario_id &&
      Number.isInteger(pending.context_version) &&
      pending.context_version === scenario.context_version &&
      pending.asked_turn_id,
  );
}

export function hasCompleteQuoteCore(result) {
  const operations = Array.isArray(result?.operations) ? result.operations : [];
  const stay = operations.find((operation) => operation.entity === "stay");
  const adult = operations.find(
    (operation) =>
      operation.entity === "adult" && Number.isInteger(operation.count),
  );
  const hasDate = Boolean(stay?.check_in || stay?.date_type);
  const hasDuration = Boolean(stay?.check_out || stay?.nights);
  return Boolean(
    result?.intents?.includes("request_quote") &&
      adult &&
      stay &&
      hasDate &&
      (stay.check_in || hasDuration),
  );
}

function hasPatchSemantics(message, result) {
  const operations = Array.isArray(result?.operations) ? result.operations : [];
  if (
    operations.some((operation) =>
      ["add", "remove", "replace", "clear"].includes(operation.operation),
    )
  ) {
    return true;
  }
  return /再|同樣|一樣|照剛才|跟剛才|原本|不變|保留|改成|換成/.test(
    compact(message),
  );
}

function hasCorrectionSemantics(result) {
  return (result?.operations || []).some((operation) =>
    ["remove", "replace", "clear"].includes(operation.operation),
  );
}

export function classifyQuoteDialogueTurn({ message, context, result } = {}) {
  const state = normalizeConversationContext(context);
  const pending = state.pending_interaction;
  const confirmation = classifyConfirmationProtocol(message);
  if (confirmation !== "none") {
    return {
      turn_type: "confirmation",
      quote_scope: null,
      confirmation,
      pending_confirmation_existed: Boolean(
        pending?.required_response_type === "confirmation",
      ),
      pending_confirmation_current: Boolean(
        pending?.required_response_type === "confirmation" &&
          isPendingInteractionCurrent(state, pending),
      ),
    };
  }

  const intents = Array.isArray(result?.intents) ? result.intents : [];
  const operations = Array.isArray(result?.operations) ? result.operations : [];
  const completeQuoteCore = hasCompleteQuoteCore(result);
  const hasPriorQuote = Boolean(
    state.quote_scenario?.scenario_id ||
      state.active_intent === "pricing" ||
      state.current_topic === "booking_price",
  );
  const patchSemantics = hasPatchSemantics(message, result);

  if (completeQuoteCore) {
    return {
      turn_type: "quote_snapshot",
      quote_scope: "snapshot",
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (intents.includes("availability_request") && !intents.includes("request_quote")) {
    return {
      turn_type: "availability_request",
      quote_scope: null,
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (intents.includes("policy_question") && !intents.includes("request_quote")) {
    return {
      turn_type: "policy_question",
      quote_scope: null,
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (pending?.required_response_type === "fields" && operations.length) {
    return {
      turn_type: "clarification_answer",
      quote_scope: "patch",
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (hasPriorQuote && operations.length && hasCorrectionSemantics(result)) {
    return {
      turn_type: "correction",
      quote_scope: "patch",
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (hasPriorQuote && (operations.length || patchSemantics)) {
    return {
      turn_type: "quote_patch",
      quote_scope: "patch",
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  if (intents.includes("request_quote")) {
    return {
      turn_type: "quote_snapshot",
      quote_scope: "snapshot",
      confirmation: "none",
      pending_confirmation_existed: false,
      pending_confirmation_current: false,
    };
  }
  return {
    turn_type: "unrelated",
    quote_scope: null,
    confirmation: "none",
    pending_confirmation_existed: false,
    pending_confirmation_current: false,
  };
}

export function normalizeQuoteSnapshotOperations(operations) {
  return (operations || []).map((operation) =>
    operation.operation === "clear"
      ? operation
      : { ...operation, operation: "set" },
  );
}

function createScenarioId(sourceTurnId, previousVersion) {
  const source = String(sourceTurnId || "").trim();
  return source || `quote-scenario-${previousVersion + 1}`;
}

export function buildQuoteScopeBaseContext(
  context,
  dialogueState,
  sourceTurnId = "",
) {
  const state = normalizeConversationContext(context);
  if (dialogueState?.quote_scope !== "snapshot") return state;

  const previousVersion = state.quote_scenario?.context_version || 0;
  return normalizeConversationContext({
    active_intent: "pricing",
    current_topic: "booking_price",
    stay_type: null,
    check_in: null,
    check_out: null,
    guest_count: null,
    adult_count: null,
    child_count: 0,
    child_ages_years: [],
    infant_count: 0,
    stay_nights: null,
    pricing_day_type: null,
    requires_exact_date: null,
    pet_count: 0,
    pet_type: null,
    pet_weights_kg: [],
    dog_under_10kg_count: 0,
    dog_10_to_20kg_count: 0,
    dog_over_20kg_count: 0,
    breakfast_count: 0,
    room_count: null,
    pending_interaction: null,
    quote_scenario: {
      scenario_id: createScenarioId(sourceTurnId, previousVersion),
      context_version: 0,
    },
  });
}

export function finalizeQuoteScenarioContext({
  previousContext,
  context,
  dialogueState,
  sourceTurnId = "",
  changed = false,
} = {}) {
  const previous = normalizeConversationContext(previousContext);
  const next = normalizeConversationContext(context);
  const scope = dialogueState?.quote_scope;
  if (scope === "snapshot") {
    const baseScenario = next.quote_scenario;
    return normalizeConversationContext({
      ...next,
      pending_interaction: null,
      quote_scenario: {
        scenario_id:
          baseScenario?.scenario_id ||
          createScenarioId(
            sourceTurnId,
            previous.quote_scenario?.context_version || 0,
          ),
        context_version: 1,
      },
    });
  }
  if (scope !== "patch" || !changed || next.pending_interaction) return next;

  const priorScenario = previous.quote_scenario;
  return normalizeConversationContext({
    ...next,
    quote_scenario: {
      scenario_id:
        priorScenario?.scenario_id ||
        createScenarioId(sourceTurnId, priorScenario?.context_version || 0),
      context_version: (priorScenario?.context_version || 0) + 1,
    },
  });
}

export function countInheritedOptionalAddons(context, dialogueState) {
  if (dialogueState?.quote_scope !== "patch") return 0;
  const state = normalizeConversationContext(context);
  return Number((state.pet_count || 0) > 0) +
    Number((state.breakfast_count || 0) > 0);
}
