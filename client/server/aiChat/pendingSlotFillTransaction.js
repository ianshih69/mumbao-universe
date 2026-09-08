import { normalizeConversationContext } from "./conversationContext.js";
import { hasCompleteQuoteCore, isPendingInteractionCurrent } from "./quoteDialogueState.js";

const countEntities = new Set(["adult", "child", "infant", "pet", "breakfast"]);
const entityCandidates = Object.freeze(["adult", "child", "pet"]);

function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function addMinutes(isoText, minutes) {
  const parsed = Date.parse(String(isoText || ""));
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(base + minutes * 60 * 1000).toISOString();
}

function addIsoDays(dateText, days) {
  const date = new Date(`${String(dateText || "")}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(days)) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isExpired(pending, nowIso) {
  const expiresAt = Date.parse(String(pending?.expires_at || ""));
  const now = Date.parse(String(nowIso || ""));
  return Number.isFinite(expiresAt) &&
    expiresAt <= (Number.isFinite(now) ? now : Date.now());
}

function spansOfType(spans, type) {
  return (spans || []).filter((span) => span.normalized_type === type);
}

function operationFromSpans(spans) {
  const operations = unique(
    spansOfType(spans, "operation_cue").map((span) => span.normalized_value),
  );
  return operations.length === 1 ? operations[0] : null;
}

function quantityFromSpans(spans) {
  const quantities = spansOfType(spans, "generic_quantity");
  return quantities.length === 1 && Number.isInteger(quantities[0].normalized_value)
    ? quantities[0].normalized_value
    : null;
}

function entityFromAnswer(message, spans, allowedEntities = entityCandidates) {
  const allowed = new Set(allowedEntities || entityCandidates);
  const typedSpans = (spans || []).filter((span) =>
    [
      "adult_count",
      "child_count",
      "infant_count",
      "pet_count",
      "pet_weight",
      "pet_type",
      "breakfast_count",
    ].includes(span.normalized_type),
  );
  const hinted = unique(typedSpans.flatMap((span) => span.entity_hints || []))
    .filter((entity) => allowed.has(entity));
  if (hinted.length === 1) return hinted[0];

  const text = compact(message);
  const matches = [
    ["adult", /成人|大人/],
    ["child", /兒童|小孩|小朋友/],
    ["infant", /嬰幼兒|幼兒|嬰兒/],
    ["pet", /狗|犬|毛孩|寵物/],
    ["breakfast", /早餐/],
  ].filter(([entity, pattern]) => allowed.has(entity) && pattern.test(text));
  return matches.length === 1 ? matches[0][0] : null;
}

function petWeightsFromSpans(spans) {
  return spansOfType(spans, "pet_weight")
    .map((span) => Number(span.normalized_value))
    .filter((weight) => Number.isFinite(weight) && weight > 0 && weight <= 200);
}

function petTypeFromAnswer(message, spans) {
  const petTypes = spansOfType(spans, "pet_type").map(
    (span) => span.normalized_value,
  );
  if (petTypes.includes("dog") || /狗|犬/.test(compact(message))) return "dog";
  return petTypes[0] || null;
}

function targetPetFromAnswer(message, context) {
  const state = normalizeConversationContext(context);
  const weights = state.pet_weights_kg || [];
  const text = compact(message);
  const ordinal = text.match(/第([一二兩三四五六七八九十\d]+)隻/);
  if (ordinal) {
    const map = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const value = Number(ordinal[1]) || map[ordinal[1]] || null;
    if (value && value <= weights.length) return value - 1;
  }
  const mentionedWeight = petWeightsFromSpans(
    (weights || []).map((weight, index) => ({
      normalized_type: "pet_weight",
      normalized_value: text.includes(`${weight}公斤`) ? weight : null,
      index,
    })).filter((entry) => entry.normalized_value !== null),
  )[0];
  if (mentionedWeight !== undefined) {
    const matches = weights
      .map((weight, index) => weight === mentionedWeight ? index : -1)
      .filter((index) => index >= 0);
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function requiredSlots(partial, context) {
  const missing = [];
  if (!partial.operation) missing.push("operation");
  if (!partial.entity) missing.push("entity");
  if (partial.entity && countEntities.has(partial.entity) && !Number.isInteger(partial.count)) {
    missing.push("count");
  }
  if (partial.entity === "pet" && partial.operation === "add") {
    const requiredWeightCount = Number.isInteger(partial.count) ? partial.count : 1;
    if ((partial.weights_kg || []).length < requiredWeightCount) {
      missing.push("weights_kg");
    }
  }
  const state = normalizeConversationContext(context);
  if (
    partial.entity === "pet" &&
    ["replace", "remove"].includes(partial.operation) &&
    Number(state.pet_count || 0) > 1 &&
    !Number.isInteger(partial.target_pet) &&
    partial.target_scope !== "all"
  ) {
    missing.push("target_pet");
  }
  return unique(missing);
}

function finalizePartial(partial, context) {
  const next = {
    operation: partial.operation || null,
    entity: partial.entity || null,
    candidate_entities: unique(partial.candidate_entities),
    candidate_operations: unique(partial.candidate_operations),
    count: Number.isInteger(partial.count) ? partial.count : null,
    pet_type: partial.pet_type || null,
    weights_kg: (partial.weights_kg || []).filter(
      (weight) => Number.isFinite(Number(weight)) && Number(weight) > 0,
    ).map(Number),
    target_pet: Number.isInteger(partial.target_pet) ? partial.target_pet : null,
    target_scope: partial.target_scope === "all" ? "all" : null,
  };
  next.missing_slots = requiredSlots(next, context);
  next.filled_slots = [
    next.operation ? "operation" : null,
    next.entity ? "entity" : null,
    Number.isInteger(next.count) ? "count" : null,
    next.pet_type ? "pet_type" : null,
    next.weights_kg.length ? "weights_kg" : null,
    Number.isInteger(next.target_pet) ? "target_pet" : null,
    next.target_scope === "all" ? "target_scope" : null,
  ].filter(Boolean);
  return next;
}

export function buildSlotFillQuestion(partial) {
  const missing = new Set(partial?.missing_slots || []);
  if (missing.has("operation") && partial?.entity === "pet") {
    const weight = partial.weights_kg?.[0];
    return `請問是要新增一隻${weight ? `${weight}公斤` : ""}狗狗，還是修改原有狗狗的體重呢？`;
  }
  if (missing.has("entity")) {
    if (partial?.operation === "replace") {
      return "請問是要修改成人、兒童，還是狗狗呢？";
    }
    if (partial?.operation === "remove") {
      return "請問是要減少一位成人、一位兒童，還是一隻狗狗呢？";
    }
    return "請問是增加一位成人、一位兒童，還是一隻狗狗呢？";
  }
  if (missing.has("weights_kg")) return "請問狗狗大約幾公斤？";
  if (missing.has("target_pet")) {
    const weight = partial.weights_kg?.[0];
    if (partial.operation === "replace" && weight) {
      return `請回答「全部狗狗」，或告訴我要把哪一隻改成${weight}公斤。`;
    }
    if (partial.operation === "remove") {
      return "請回答「全部狗狗」，或告訴我要移除哪一隻。";
    }
    return "目前有多隻狗狗，請問要修改哪一隻狗狗的體重呢？";
  }
  if (missing.has("count")) return "請問要調整幾位或幾隻呢？";
  return "請再提供這次調整所缺少的資料。";
}

function provenanceEntry(sourceTurnId, evidence, filledSlots) {
  return {
    source_turn_id: String(sourceTurnId || "").slice(0, 120) || null,
    evidence: String(evidence || "").slice(0, 280),
    filled_slots: unique(filledSlots),
  };
}

function pendingFromPartial({
  partial,
  provenance,
  scenario,
  sourceTurnId,
  nowIso,
  transactionId,
  resumeAction = "request_quote",
}) {
  const requiredFields = partial.missing_slots.includes("weights_kg")
    ? ["pet_weights_kg"]
    : [];
  return {
    type: "slot_fill",
    action: "resolve_slot_fill",
    transaction_id:
      transactionId || `slot-fill:${String(sourceTurnId || "anonymous").slice(0, 120)}`,
    partial_operation: partial,
    operation: partial.operation,
    entity: partial.entity,
    filled_slots: partial.filled_slots,
    missing_slots: partial.missing_slots,
    candidate_references: unique([
      ...partial.candidate_entities.map((entity) => `entity:${entity}`),
      ...partial.candidate_operations.map(
        (operation) => `operation:${operation}`,
      ),
    ]),
    provenance,
    proposed_values: {},
    required_response_type: "slot_fill",
    ...(requiredFields.length ? { required_fields: requiredFields } : {}),
    resume_action: resumeAction,
    resume_goal: resumeAction,
    source_assistant_message_id: sourceTurnId || null,
    scenario_id: scenario?.scenario_id || null,
    context_version: scenario?.context_version ?? null,
    base_state_version: scenario?.context_version ?? null,
    asked_turn_id: sourceTurnId || null,
    created_turn_id: sourceTurnId || null,
    expires_after_turns: 1,
    created_at: nowIso,
    expires_at: addMinutes(nowIso, 30),
  };
}

function pendingStayDaysConfirmation({
  days,
  question,
  context,
  sourceTurnId,
  nowIso,
}) {
  const state = normalizeConversationContext(context);
  const scenario = state.quote_scenario;
  if (!scenario || !Number.isInteger(days) || days < 1) return null;
  const checkOut = state.check_in ? addIsoDays(state.check_in, days) : "";
  return {
    type: "confirmation",
    action: "confirm_stay_nights",
    transaction_id: `confirm-stay-nights:${String(sourceTurnId || "anonymous").slice(0, 120)}`,
    partial_operation: null,
    operation: "replace",
    entity: "stay",
    filled_slots: ["nights"],
    missing_slots: [],
    candidate_references: ["stay.nights"],
    provenance: [provenanceEntry(sourceTurnId, `${days}天`, ["nights"])],
    proposed_values: {
      stay_nights: days,
      ...(checkOut ? { check_out: checkOut } : {}),
    },
    required_response_type: "confirmation",
    resume_action: "request_quote",
    resume_goal: "request_quote",
    source_assistant_message_id: sourceTurnId || null,
    scenario_id: scenario.scenario_id,
    context_version: scenario.context_version,
    base_state_version: scenario.context_version,
    asked_turn_id: sourceTurnId || null,
    created_turn_id: sourceTurnId || null,
    expires_after_turns: 1,
    created_at: nowIso,
    expires_at: addMinutes(nowIso, 30),
    question,
  };
}

function ambiguityForPartial(partial) {
  return {
    code: "pending_slot_fill",
    evidence: "pending_slot_fill",
    question: buildSlotFillQuestion(partial),
  };
}

function staleTransactionResult() {
  return {
    status: "stale",
    pending: null,
    ambiguity: {
      code: "pending_slot_fill_stale",
      evidence: "pending_slot_fill",
      question: "剛才的資料補充已失效，請重新說明這次要調整的內容。",
    },
  };
}

function operationIntent(entity) {
  if (["adult", "child", "infant"].includes(entity)) return "update_party";
  if (entity === "pet") return "update_pet";
  return entity === "breakfast" ? "update_breakfast" : null;
}

function operationFromPartial(partial, provenance) {
  const operation = {
    operation: partial.operation,
    entity: partial.entity,
    ...(Number.isInteger(partial.count) ? { count: partial.count } : {}),
    ...(partial.pet_type ? { pet_type: partial.pet_type } : {}),
    ...(partial.weights_kg?.length ? { weights_kg: partial.weights_kg } : {}),
    ...(Number.isInteger(partial.target_pet)
      ? { target_pet: partial.target_pet }
      : {}),
    ...(partial.target_scope === "all" ? { target_scope: "all" } : {}),
    evidence: unique(provenance.map((entry) => entry.evidence)).join("、"),
  };
  return operation;
}

function resultForOperation(operation, resumeAction) {
  return {
    intents: unique([
      operationIntent(operation.entity),
      resumeAction === "request_quote" ? "request_quote" : null,
    ]),
    operations: [operation],
    missing_fields: [],
    ambiguities: [],
    confidence: 1,
  };
}

function createInitialPartial({ message, spans, result, context }) {
  const state = normalizeConversationContext(context);
  const operationCue = operationFromSpans(spans);
  const genericCount = quantityFromSpans(spans);
  const inferredEntity = entityFromAnswer(message, spans);
  const weights = petWeightsFromSpans(spans);
  const petType = petTypeFromAnswer(message, spans);
  const missingEntity = result.ambiguities.some(
    (ambiguity) => ambiguity.code === "missing_entity",
  );

  const petOperation = result.operations.find((operation) => operation.entity === "pet");
  if (
    petOperation &&
    ["replace", "remove"].includes(petOperation.operation) &&
    Number(state.pet_count || 0) > 1 &&
    !Number.isInteger(petOperation.target_pet) &&
    petOperation.target_scope !== "all"
  ) {
    return finalizePartial({
      ...petOperation,
      candidate_entities: ["pet"],
      candidate_operations: [petOperation.operation],
      target_pet: null,
      target_scope: null,
    }, state);
  }
  if (
    operationCue === "replace" &&
    weights.length &&
    Number(state.pet_count || 0) > 0 &&
    !petOperation
  ) {
    return finalizePartial({
      operation: "replace",
      entity: "pet",
      candidate_entities: ["pet"],
      candidate_operations: ["replace"],
      count: 1,
      pet_type: state.pet_type || "dog",
      weights_kg: [weights.at(-1)],
      target_pet: Number(state.pet_count || 0) === 1 ? 0 : null,
    }, state);
  }

  if (
    result.operations.length === 0 &&
    (missingEntity || (operationCue && Number.isInteger(genericCount) && !inferredEntity))
  ) {
    return finalizePartial({
      operation: operationCue,
      entity: null,
      candidate_entities: entityCandidates,
      candidate_operations: [],
      count: genericCount,
      pet_type: null,
      weights_kg: [],
      target_pet: null,
    }, state);
  }

  if (
    petOperation?.operation === "add" &&
    Number.isInteger(petOperation.count) &&
    (petOperation.weights_kg || []).length < petOperation.count
  ) {
    return finalizePartial({
      ...petOperation,
      candidate_entities: ["pet"],
      candidate_operations: ["add"],
      target_pet: null,
    }, state);
  }

  return null;
}

function fillPartialFromAnswer(partial, { message, spans, context }) {
  const next = { ...partial };
  const filled = [];
  const protocolText = compact(message).replace(/[。.!！、]+$/g, "");
  const protocol = /^(?:都是|全部|都|通通|所有(?:的)?)(?:狗狗?)?$/.test(protocolText)
    ? "all"
    : /^(?:對|是|沒錯|正確|可以|好|好的|嗯|就這樣|yes|y|ok|okay|不對|不是|否|no|n)$/.test(protocolText)
      ? "insufficient_scope"
      : "none";
  if (!next.operation) {
    const operation = operationFromSpans(spans);
    if (operation && (next.candidate_operations || []).includes(operation)) {
      next.operation = operation;
      filled.push("operation");
    }
  }
  if (!next.entity) {
    const entity = entityFromAnswer(message, spans, next.candidate_entities);
    if (entity) {
      next.entity = entity;
      filled.push("entity");
    }
  }
  if (!Number.isInteger(next.count)) {
    const quantity = quantityFromSpans(spans);
    if (Number.isInteger(quantity)) {
      next.count = quantity;
      filled.push("count");
    }
  }
  if (next.entity === "pet") {
    const petType = petTypeFromAnswer(message, spans);
    if (!next.pet_type && petType) {
      next.pet_type = petType;
      filled.push("pet_type");
    }
    const weights = petWeightsFromSpans(spans);
    if (weights.length) {
      const requiredCount = Number.isInteger(next.count) ? next.count : weights.length;
      next.weights_kg = [...(next.weights_kg || []), ...weights].slice(0, requiredCount);
      filled.push("weights_kg");
    }
    if (
      (next.missing_slots || []).includes("target_pet") &&
      !Number.isInteger(next.target_pet)
    ) {
      const target = targetPetFromAnswer(message, context);
      if (protocol === "all") {
        next.target_scope = "all";
        filled.push("target_scope");
      } else if (Number.isInteger(target)) {
        next.target_pet = target;
        filled.push("target_pet");
      }
    }
  }
  return {
    partial: finalizePartial(next, context),
    filled_slots: unique(filled),
    protocol_requires_scope: protocol === "insufficient_scope",
  };
}

export function planPendingSlotFillTransaction({
  message,
  spans,
  result,
  context,
  dialogueState,
  sourceTurnId,
  nowIso = new Date().toISOString(),
  scenario,
} = {}) {
  const state = normalizeConversationContext(context);
  const pending = state.pending_interaction;
  const completeSnapshot =
    dialogueState?.quote_scope === "snapshot" && hasCompleteQuoteCore(result);
  if (completeSnapshot && pending?.type === "slot_fill") {
    return { status: "cancelled_by_snapshot", pending: null };
  }

  if (pending?.type === "slot_fill") {
    if (!isPendingInteractionCurrent(state, pending) || isExpired(pending, nowIso)) {
      return staleTransactionResult();
    }
    if (state.quote_scenario?.last_applied_transaction_id === pending.transaction_id) {
      return {
        status: "duplicate",
        pending: null,
        ambiguity: {
          code: "pending_slot_fill_duplicate",
          evidence: "pending_slot_fill",
          question: "這筆調整已經套用，不會再次重複增加。",
        },
      };
    }
    const policyOnly = result.intents.includes("policy_question") &&
      !result.intents.includes("request_quote") &&
      result.operations.length === 0;
    if (policyOnly) return { status: "ignored_policy", pending };

    const filled = fillPartialFromAnswer(pending.partial_operation, {
      message,
      spans,
      context: state,
    });
    if (filled.protocol_requires_scope) {
      return {
        status: "updated",
        pending,
        ambiguity: {
          code: "pending_slot_fill",
          evidence: "pending_slot_fill",
          question: "請回答「全部狗狗」，或指定要修改哪一隻狗狗。",
        },
      };
    }
    if (!filled.filled_slots.length) return staleTransactionResult();
    const provenance = [
      ...(pending.provenance || []),
      provenanceEntry(sourceTurnId, message, filled.filled_slots),
    ];
    if (filled.partial.missing_slots.length) {
      return {
        status: "updated",
        pending: pendingFromPartial({
          partial: filled.partial,
          provenance,
          scenario: state.quote_scenario,
          sourceTurnId,
          nowIso,
          transactionId: pending.transaction_id,
          resumeAction: pending.resume_action,
        }),
        ambiguity: ambiguityForPartial(filled.partial),
      };
    }
    const operation = operationFromPartial(filled.partial, provenance);
    return {
      status: "completed",
      pending: null,
      transaction_id: pending.transaction_id,
      asked_turn_id: pending.asked_turn_id,
      applied_turn_id: sourceTurnId,
      partial_operation: filled.partial,
      provenance,
      evidence_message: provenance.map((entry) => entry.evidence).join("、"),
      result: resultForOperation(operation, pending.resume_action),
    };
  }

  const ambiguousStayDays = result.ambiguities.find(
    (ambiguity) => ambiguity.code === "ambiguous_stay_days",
  );
  if (ambiguousStayDays) {
    const dayValues = spansOfType(spans, "duration_days")
      .map((span) => Number(span.normalized_value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const days = dayValues.length === 1 ? dayValues[0] : null;
    const confirmation = pendingStayDaysConfirmation({
      days,
      question: ambiguousStayDays.question,
      context: state,
      sourceTurnId,
      nowIso,
    });
    if (confirmation) {
      return {
        status: "created",
        pending: confirmation,
        ambiguity: ambiguousStayDays,
      };
    }
  }

  const partial = createInitialPartial({ message, spans, result, context: state });
  if (!partial) return { status: "none", pending: null };
  const filledSlots = partial.filled_slots;
  const provenance = [provenanceEntry(sourceTurnId, message, filledSlots)];
  if (!partial.missing_slots.length) {
    const operation = operationFromPartial(partial, provenance);
    return {
      status: "direct_operation",
      pending: null,
      partial_operation: partial,
      provenance,
      evidence_message: message,
      result: resultForOperation(operation, "request_quote"),
    };
  }
  return {
    status: "created",
    pending: pendingFromPartial({
      partial,
      provenance,
      scenario,
      sourceTurnId,
      nowIso,
    }),
    ambiguity: ambiguityForPartial(partial),
  };
}
