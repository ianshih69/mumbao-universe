import { semanticDialogueCapabilities } from "../aiChat/dialogueCapabilities.js";
import { assertAiQualityServerOnly } from "./privacy.js";

assertAiQualityServerOnly();

const capabilityIds = new Set(semanticDialogueCapabilities.map((entry) => entry.capability_id));
const responseKinds = new Set([
  "transactional_quote", "transactional_update", "confirmation", "clarification",
  "partial_answer", "informational_answer", "knowledge_gap", "action_request",
  "knowledge_candidate", "slot_fill_transaction", "quote_with_addons", "quote_only", "other",
]);
const booleanFields = [
  "provider_used", "scenario_changed", "pending_created", "pending_consumed",
  "generic_fallback", "clarification", "semantic_resolver_used",
];
const integerLimits = { provider_call_count: 32, latency_ms: 120000 };
const enumFields = {
  capability_id: capabilityIds,
  response_kind: responseKinds,
  structured_mode: new Set(["legacy", "shadow", "active"]),
  validation_outcome: new Set(["accepted", "rejected", "not_called"]),
  provider_error_type: new Set(["timeout", "network_error", "http_error", "schema_reject", "invalid_response", "unknown"]),
};
const pendingFields = new Set([
  "check_in", "check_out", "nights", "adults", "children", "infants",
  "pet_count", "pet_weight", "target_pet", "breakfast_quantity",
]);

function ownDataProperties(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return {};
  const result = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) result[key] = descriptor.value;
  }
  return result;
}

export function sanitizeAiQualityMetadata(value) {
  assertAiQualityServerOnly();
  const source = ownDataProperties(value);
  const safe = {};
  for (const key of booleanFields) {
    if (typeof source[key] === "boolean") safe[key] = source[key];
  }
  for (const [key, maximum] of Object.entries(integerLimits)) {
    if (Number.isInteger(source[key]) && source[key] >= 0 && source[key] <= maximum) safe[key] = source[key];
  }
  for (const [key, allowed] of Object.entries(enumFields)) {
    if (typeof source[key] === "string" && allowed.has(source[key])) safe[key] = source[key];
  }
  return safe;
}

// Diagnostic shape only: never copy a booking scenario, identifier, or transcript here.
export function sanitizeAiQualityContext(value) {
  assertAiQualityServerOnly();
  const source = ownDataProperties(value);
  const safe = {};
  for (const key of ["scenario_present", "pending_present"]) {
    if (typeof source[key] === "boolean") safe[key] = source[key];
  }
  if (Number.isInteger(source.scenario_version) && source.scenario_version >= 0 && source.scenario_version <= 1000000) {
    safe.scenario_version = source.scenario_version;
  }
  if (Array.isArray(source.pending_missing_fields)) {
    safe.pending_missing_fields = [...new Set(source.pending_missing_fields.filter((field) => pendingFields.has(field)))];
  }
  return safe;
}
