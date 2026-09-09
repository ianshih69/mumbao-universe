import { createHash } from "node:crypto";
import { normalizeConversationContext } from "../aiChat/conversationContext.js";
import { isPendingInteractionCurrent } from "../aiChat/quoteDialogueState.js";
import { assertAiQualityServerOnly } from "./privacy.js";
import { sanitizeAiQualityMetadata, sanitizeAiQualityContext } from "./metadata.js";

assertAiQualityServerOnly();

/**
 * @typedef {Object} AiQualityTurnObservationInput
 * @property {string} conversation_source_id Process memory only.
 * @property {string} turn_source_id Incoming client ID, or persisted user message ID.
 * @property {string} user_text Sanitized by the observer before persistence.
 * @property {string} assistant_text Sanitized by the observer before persistence.
 * @property {Object} metadata Allowlisted execution metadata, not a runtime object.
 * @property {Object} context Safe diagnostic shape only.
 * @property {boolean} provider_schema_rejected
 * @property {string|null} provider_error_category
 * @property {boolean} continuity_broken
 * @property {boolean} pending_integrity_broken
 * @property {string[]} known_slots_before Slot names, never values.
 * @property {string[]} requested_slots
 * @property {string[]} required_slots
 */

const slotFields = {
  check_in: "check_in", check_out: "check_out", stay_nights: "nights", nights: "nights",
  adult_count: "adults", guest_count: "guest_count", adults: "adults",
  child_count: "children", children: "children", infant_count: "infants", infants: "infants",
  pet_count: "pet_count", dog_weights: "pet_weight", pet_weights_kg: "pet_weight", weights_kg: "pet_weight",
  pet_weight: "pet_weight", target_pet: "target_pet", breakfast_count: "breakfast_quantity",
  breakfast_quantity: "breakfast_quantity",
};
const slots = (values) => [...new Set((Array.isArray(values) ? values : [])
  .map(value => slotFields[value]).filter(Boolean))];
const scenarioFields = [
  "stay_type", "check_in", "check_out", "stay_nights", "pricing_day_type", "requires_exact_date",
  "guest_count", "adult_count", "child_count", "infant_count", "child_ages_years",
  "pet_count", "pet_type", "pet_weights_kg", "dog_under_10kg_count", "dog_10_to_20kg_count", "dog_over_20kg_count",
  "breakfast_count", "room_count",
];

// Only normalized booking values enter this ephemeral digest. Anchors, timestamps,
// provenance, transcripts and pending are deliberately not booking mutations.
export function fingerprintAiQualityScenario(normalizedState) {
  const projection = scenarioFields.map(field => [field, normalizedState[field] ?? null]);
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

export function classifyAiQualityProviderFailure(code, status, rejected = false) {
  if (["structured_turn_timeout", "faq_selector_timeout", "faq_semantic_verifier_timeout", "semantic_timeout"].includes(code)) return "timeout";
  if (status === 429 || code === "rate_limited" || code === "http_429") return "rate_limit";
  if ((Number.isInteger(status) && status >= 400) || /^http_[45]\d\d$/.test(code)) return "http_error";
  if (code === "structured_turn_request_failed") return "network";
  if (["malformed_model_json", "invalid_json", "faq_semantic_verifier_invalid_json", "empty_response_body", "empty_choices", "empty_content"].includes(code)) return "invalid_response";
  if (rejected) return null;
  return code ? "unknown" : null;
}

/** Project existing authorities only. No text matching, intent parsing or mutation. */
export function buildAiQualityTurnSnapshot({
  conversationId, turnId, userText, assistantText, beforeContext, afterContext,
  route = {}, metadata = {}, structured = null, responseAuthority = {}, executionContext = {},
  now = Date.now(),
}) {
  assertAiQualityServerOnly();
  const before = normalizeConversationContext(beforeContext);
  const after = normalizeConversationContext(afterContext);
  const plan = structured?.plan || {};
  const ast = plan.resolved_intent_ast || plan.intent_ast || {};
  const goalPlan = plan.dialogue_goal_plan || {};
  const routeMeta = route.semanticMetadata || {};
  const beforeScenario = before.quote_scenario;
  const afterScenario = after.quote_scenario;
  const pendingBefore = before.pending_interaction;
  const pendingAfter = after.pending_interaction;
  const provider = structured?.provider || {};
  const calls = executionContext.model_call_count ?? metadata.total_provider_calls ?? 0;
  const schemaRejected = metadata.semantic_validator_result === "rejected" ||
    (provider.validation_outcome === "rejected" &&
    (String(provider.failure_code || "").startsWith("structured_turn_candidate_") ||
     ["invalid_model_schema", "malformed_model_json"].includes(provider.failure_code)));
  const metadataProviderFailure = metadata.faq_selector_result === "error" ||
    metadata.semantic_verifier_result === "error" ||
    (executionContext.model_call_purposes?.includes("semantic_router") &&
     ["rejected", "not_run"].includes(metadata.semantic_validator_result) && metadata.fallback_reason);
  const providerError = calls > 0 ? classifyAiQualityProviderFailure(
    provider.failure_code || (metadataProviderFailure ? metadata.fallback_reason : null),
    provider.provider_status ?? metadata.provider_status, schemaRejected,
  ) : null;
  const action = ast.scenario_action;
  const pendingStatus = plan.slot_fill_transaction?.status;
  const events = structured?.reduction?.events || [];
  const eventTypes = events.map(event => event.type);
  const intentionalEnd = ["new", "reset", "clear", "replace"].includes(action) ||
    ["cancelled", "cancelled_by_snapshot", "stale"].includes(pendingStatus) ||
    ["rejected", "expired", "stale", "cleared_by_reset", "cleared_by_switch_topic"].includes(routeMeta.pending_resolution) ||
    eventTypes.some(type => ["ScenarioSuperseded", "PendingExpired"].includes(type));
  const changed = beforeScenario?.scenario_id !== afterScenario?.scenario_id ||
    beforeScenario?.context_version !== afterScenario?.context_version ||
    fingerprintAiQualityScenario(before) !== fingerprintAiQualityScenario(after);
  const readOnly = responseAuthority.allow_context_mutation === false ||
    (action === "read_only" && !(ast.operations?.length));
  const consumed = metadata.pending_slot_fill_consumed === true ||
    metadata.pending_confirmation_consumed === true || pendingStatus === "completed" ||
    eventTypes.includes("PendingResolved");
  const currentPending = pendingBefore && isPendingInteractionCurrent(before, pendingBefore) &&
    (!pendingBefore.expires_at || Date.parse(pendingBefore.expires_at) > now);
  const missing = slots(routeMeta.final_missing_fields || structured?.result?.missing_fields);
  const clarification = metadata.final_response_kind === "clarification" ||
    route.answerMode === "collect_info" || routeMeta.transactional_response_kind === "clarification";
  // Existing values do not satisfy requests for NEW replacement/addition values.
  const required = !intentionalEnd && !pendingBefore?.operation && !ast.operations?.length ? missing : [];
  const known = Object.entries({
    check_in: Boolean(before.check_in), check_out: Boolean(before.check_out),
    nights: before.stay_nights > 0, adults: before.adult_count > 0,
    guest_count: before.guest_count > 0,
    children: Number.isInteger(before.child_count), infants: Number.isInteger(before.infant_count),
    pet_count: Number.isInteger(before.pet_count),
    pet_weight: before.pet_count > 0 && before.pet_weights_kg.length === before.pet_count,
    breakfast_quantity: Number.isInteger(before.breakfast_count),
  }).filter(([, valid]) => valid).map(([field]) => field);
  const fallback = route.knowledgeGap === true || route.route === "knowledge_gap" ||
    metadata.final_response_kind === "knowledge_gap";
  const lane = goalPlan.lane || metadata.dialogue_lane;
  const goal = goalPlan.primary_goal_id || metadata.dialogue_primary_goal;
  const selectedCapability = (plan.semantic_capabilities || []).find(entry => entry.goal_id === goal);
  const semanticUsed = metadata.semantic_resolver_called === true || provider.called === true ||
    executionContext.model_call_purposes?.includes("semantic_router") === true;
  const validationAccepted = metadata.semantic_validator_result === "accepted" ||
    ["selected", "none"].includes(metadata.faq_selector_result) ||
    ["selected", "none"].includes(metadata.semantic_verifier_result);
  const safeMetadata = sanitizeAiQualityMetadata({
    capability_id: routeMeta.capability_id || metadata.capability_id || selectedCapability?.capability_id,
    goal_id: goal,
    response_kind: metadata.final_response_kind || routeMeta.transactional_response_kind || "other",
    structured_mode: metadata.structured_mode,
    provider_used: calls > 0, provider_call_count: calls,
    semantic_resolver_used: semanticUsed,
    provider_role: semanticUsed ? "semantic_resolver" :
      metadata.faq_selector_called ? "faq_selector" : calls > 0 ? "answer" : "unknown",
    validation_outcome: provider.validation_outcome ||
      (schemaRejected ? "rejected" : validationAccepted ? "accepted" : "not_called"),
    provider_error_type: providerError || (schemaRejected ? "schema_reject" : undefined),
    latency_ms: Math.round(provider.latency_ms ?? metadata.latency_ms ?? 0),
    scenario_changed: changed, before_version: beforeScenario?.context_version,
    after_version: afterScenario?.context_version, read_only_turn: readOnly,
    pending_created: Boolean(pendingAfter && (!pendingBefore ||
      pendingBefore.transaction_id !== pendingAfter.transaction_id)),
    pending_consumed: consumed, generic_fallback: fallback, clarification,
    route_kind: fallback ? "fallback" : ["informational", "transactional", "dialogue"].includes(lane) ? lane : "other",
  });
  /** @type {AiQualityTurnObservationInput} */
  const snapshot = {
    conversation_source_id: conversationId, turn_source_id: turnId,
    user_text: userText, assistant_text: assistantText,
    metadata: safeMetadata,
    context: sanitizeAiQualityContext({
      scenario_present: Boolean(afterScenario), pending_present: Boolean(pendingAfter),
      scenario_version: afterScenario?.context_version,
      pending_missing_fields: slots(pendingAfter?.missing_slots || pendingAfter?.required_fields),
    }),
    provider_schema_rejected: schemaRejected, provider_error_category: providerError,
    continuity_broken: !intentionalEnd && action === "continue" && Boolean(beforeScenario) &&
      (!afterScenario || afterScenario.scenario_id !== beforeScenario.scenario_id ||
       afterScenario.context_version < beforeScenario.context_version ||
       structured?.reduction?.reason === "stale_scenario_reference"),
    pending_integrity_broken: Boolean(currentPending && !pendingAfter && readOnly &&
      !consumed && !intentionalEnd && ["ignored_policy", "awaiting_resolver", "none"].includes(pendingStatus)),
    known_slots_before: known, requested_slots: clarification ? missing : [], required_slots: required,
  };
  return snapshot;
}
