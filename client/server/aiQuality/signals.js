import { assertAiQualityServerOnly } from "./privacy.js";

/** Deterministic invariants only; never inspects user/assistant text. */
export function deriveAiQualitySignals(snapshot) {
  assertAiQualityServerOnly();
  const events = new Map();
  const add = (event_type, severity, signal_code) => {
    if (!events.has(event_type)) events.set(event_type, { event_type, severity, signal_code });
  };
  const meta = snapshot.metadata;
  if (meta.generic_fallback) add("generic_fallback", "low");
  if (snapshot.provider_schema_rejected) add("provider_schema_reject", "medium");
  if (snapshot.provider_error_category) add("provider_error", "medium");
  if (meta.read_only_turn && meta.scenario_changed) add("wrong_mutation_signal", "high", "readonly_scenario_changed");
  if (snapshot.continuity_broken) add("context_lost_signal", "high", "continuation_lost");
  if (snapshot.pending_integrity_broken) add("context_lost_signal", "high", "pending_disappeared");
  if (meta.clarification && snapshot.requested_slots.some(slot =>
    snapshot.required_slots.includes(slot) && snapshot.known_slots_before.includes(slot))) {
    add("unnecessary_clarification", "medium", "known_slot_requested");
  }
  if (meta.provider_call_count > 1) add("possible_misunderstanding", "high", "provider_budget_exceeded");
  // No reliable cross-turn repeated-question authority exists yet.
  return [...events.values()];
}
