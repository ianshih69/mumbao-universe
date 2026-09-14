import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversationContextForStorage } from "./conversationContext.js";
import { analyzeEntityAttributeAssertion } from "./dialogueReferenceSemantics.js";
import { setDiscourseAnchor, updatePetEntityReferences } from "./typedEntityReferences.js";
import { compileBookingTurnCandidates, extractBookingTurnSpans,
  materializeBookingTurnCandidate, resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";
import { validateSemanticTurnAst } from "./semanticTurnResolver.js";

const nowIso = "2026-09-13T10:00:00.000Z";
const dateInfo = { currentDate: "2026-09-13" };
function scenario(weights = [22], anchor = "pet_1") {
  const context = getConversationContextForStorage({
    active_intent: "pricing", current_topic: "booking_price", stay_type: "villa",
    check_in: "2026-11-01", check_out: "2026-11-03", stay_nights: 2,
    adult_count: 10, child_count: 0, infant_count: 0, breakfast_count: 0,
    pet_count: weights.length, pet_type: "dog", pet_weights_kg: weights,
    quote_scenario: { scenario_id: "attribute-scenario", context_version: 3 },
  });
  return setDiscourseAnchor(context, anchor ? [anchor] : [], "attribute-anchor");
}
async function turn(message, context, turnId = "attribute-correction") {
  const provider = vi.fn(() => { throw new Error("UNEXPECTED_PROVIDER_CALL"); });
  const result = await resolveStructuredBookingTurnCandidatePipeline({
    mode: "active", message, previousContext: context, legacyContext: context,
    sourceMessageId: turnId, dateInfo, nowIso, contextResolverEnabled: true,
    resolveCandidates: provider,
  });
  expect(provider).toHaveBeenCalledTimes(Number(result.plan.complexity_gate.triggered));
  if (result.plan.complexity_gate.triggered) expect(result.provider.contextual_fallback).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  return result;
}
const forms = [
  (n) => `牠其實${n}公斤`,
  (n) => `那隻其實${n}公斤`,
  (n) => `原本那隻改${n}公斤`,
  (n) => `狗狗重量改成${n}`,
  (n) => `剛剛那隻是${n}公斤才對`,
  (n) => `不是22，是${n}公斤`,
  (n) => `牠其實只有${n}公斤`,
  (n) => `那隻改成${n}公斤`,
];
const corrections = forms.flatMap((form) => [10, 10.1, 18, 20, 20.1, 25].map((weight) =>
  ({ message: form(weight), weight })));

describe("entity attribute assertion and reference separation", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); })));
  afterEach(() => vi.unstubAllGlobals());

  it.each(corrections)("composes $message with stable identity and exact value provenance", async ({ message, weight }) => {
    const before = scenario();
    const result = await turn(message, before);
    expect(result.context.pet_weights_kg).toEqual([weight]);
    expect(result.context.entity_references.pets).toEqual([{ id: "pet_1", type: "pet", weight_kg: weight }]);
    expect(result.context.quote_scenario).toMatchObject({ scenario_id: "attribute-scenario", context_version: 4 });
    expect(result.context).toMatchObject({ check_in: "2026-11-01", check_out: "2026-11-03",
      stay_nights: 2, adult_count: 10, child_count: 0, infant_count: 0, breakfast_count: 0,
      pet_count: 1, pending_interaction: null });
    expect(result.turn_delta.operations).toEqual([expect.objectContaining({
      operation: "replace", entity: "pet", weights_kg: [weight], target_entity_id: "pet_1", target_pet: 0,
    })]);
    const assertion = result.plan.entity_attribute_assertion;
    expect(assertion.value_span_ids).toHaveLength(1);
    const value = result.plan.spans.find((span) => span.span_id === assertion.value_span_ids[0]);
    expect(value.normalized_value).toBe(weight);
    expect(message.slice(value.start, value.end)).toBe(value.text);
    expect(result.plan.intent_ast.operations[0].span_bindings).toContain(value.span_id);
  });

  it.each([2, 3].flatMap((count) => ["pet_1", "pet_2", null].flatMap((anchor) =>
    ["牠其實只有20公斤", "那隻其實20公斤", "狗狗重量改成20"].map((message) => ({ count, anchor, message })))))
  ("resolves $count pets / $anchor / $message without guessing", async ({ count, anchor, message }) => {
    const before = scenario([22, 8, 12].slice(0, count), anchor);
    const result = await turn(message, before);
    const expected = [...before.pet_weights_kg];
    if (anchor) {
      expected[before.entity_references.pets.findIndex((pet) => pet.id === anchor)] = 20;
      expect(result.turn_delta.operations[0].target_entity_id).toBe(anchor);
      expect(result.context.quote_scenario.context_version).toBe(4);
    } else {
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.plan.entity_reference.clarification_code).toBe("missing_target_reference");
      expect(result.plan.intent_ast.turn_kind).toBe("clarification");
      expect(result.context.quote_scenario.context_version).toBe(3);
    }
    expect(result.context.pet_weights_kg).toEqual(expected);
    expect(result.context.entity_references.pets.map((pet) => pet.id)).toEqual(before.entity_references.pets.map((pet) => pet.id));
  });

  it.each(["退房時間是幾點？", "退房可以晚一小時嗎？", "狗可以上沙發嗎？", "早餐幾點供應？"])
  ("preserves the anchor across policy: %s", async (message) => {
    const before = scenario([22, 8], "pet_2");
    const policy = await turn(message, before, "policy-turn");
    expect(policy.context.entity_references).toEqual(before.entity_references);
    expect(policy.context.quote_scenario).toEqual(before.quote_scenario);
    const corrected = await turn("牠實際是18公斤", policy.context);
    expect(corrected.context.pet_weights_kg).toEqual([22, 18]);
    expect(corrected.turn_delta.operations[0].target_entity_id).toBe("pet_2");
  });

  it.each(["20公斤狗狗怎麼收費？", "狗狗20公斤住宿費多少？", "20公斤狗"])
  ("keeps an explicit informational weight read-only: %s", async (message) => {
    const before = scenario([22, 20], "pet_1");
    const result = await turn(message, before);
    expect(result.turn_delta.operations).toEqual([]);
    expect(result.context.quote_scenario).toEqual(before.quote_scenario);
    expect(result.context.pet_weights_kg).toEqual([22, 20]);
    expect(result.context.entity_references).toEqual(before.entity_references);
  });

  it("distinguishes a conditional quote from a contextless policy fragment", async () => {
    const quote = await turn("如果20公斤呢？", scenario());
    expect(quote.context.pet_weights_kg).toEqual([20]);
    const policy = await turn("如果20公斤呢？", getConversationContextForStorage({}));
    expect(policy.turn_delta.operations).toEqual([]);
    expect(policy.context.pet_count).toBeNull();
    expect(policy.context.quote_scenario).toBeNull();
  });

  it("does not reinterpret a pending target answer as a new weight", async () => {
    const pending = await turn("狗改20公斤", scenario([22, 8], null), "pending-weight");
    expect(pending.context.pending_interaction.partial_operation).toMatchObject({
      count: 1, weights_kg: [20], missing_slots: ["target_pet"],
    });
    const answer = await turn("8公斤那隻", pending.context, "pending-target");
    expect(answer.context.pet_weights_kg).toEqual([22, 20]);
    expect(answer.context.pending_interaction).toBeNull();
  });

  it("never rebinds a deleted pronoun to the remaining pet or reuses a removed ID", async () => {
    const before = scenario([22, 8], "pet_1");
    const removed = updatePetEntityReferences(before, { ...before, pet_count: 1, pet_weights_kg: [8] },
      { operation: "remove", entity: "pet", target_pet: 0 }, "delete");
    const correction = await turn("牠其實只有20公斤", removed);
    expect(correction.turn_delta.operations).toEqual([]);
    expect(correction.context.pet_weights_kg).toEqual([8]);
    for (const phrase of ["原本那隻其實20公斤", "剛才那隻是20公斤"]) {
      const dangling = await turn(phrase, removed);
      expect(dangling.turn_delta.operations).toEqual([]);
      expect(dangling.context.pet_weights_kg).toEqual([8]);
    }
    const added = updatePetEntityReferences(removed, { ...removed, pet_count: 2, pet_weights_kg: [8, 22] },
      { operation: "add", entity: "pet", count: 1 }, "add");
    expect(added.entity_references.pets.map((pet) => pet.id)).toEqual(["pet_2", "pet_3"]);
    expect((await turn("牠其實18公斤", added)).context.pet_weights_kg).toEqual([8, 18]);
    const fresh = await turn("牠其實只有20公斤", {});
    expect(fresh.turn_delta.operations).toEqual([]);
    expect(fresh.context.pet_count).toBeNull();
  });

  it("rejects forged span IDs and removed entity references in the formal validator", () => {
    const context = scenario();
    const plan = { ...compileBookingTurnCandidates({ message: "牠其實只有20公斤", context,
      dateInfo, nowIso, sourceTurnId: "validator-test", contextResolverEnabled: true }), context };
    expect(() => validateSemanticTurnAst(plan.intent_ast, { plan })).not.toThrow();
    const ast = structuredClone(plan.intent_ast);
    ast.operations[0].span_bindings = ["invented-span"];
    expect(() => validateSemanticTurnAst(ast, { plan })).toThrow("semantic_turn_unknown_span_id");
    ast.operations[0].span_bindings = plan.intent_ast.operations[0].span_bindings;
    ast.operations[0].context_bindings = ["pets.pet_999"];
    expect(() => validateSemanticTurnAst(ast, { plan })).toThrow("semantic_turn_invalid_context_binding");
  });

  it("materializes only the approved target and source value, including provider-only plans", () => {
    const plan = compileBookingTurnCandidates({ message: "牠其實只有20公斤", context: scenario(),
      dateInfo, nowIso, sourceTurnId: "candidate-test", contextResolverEnabled: true });
    expect(plan.requires_model).toBe(false);
    const candidate = plan.candidates[0];
    expect(materializeBookingTurnCandidate(candidate, plan)).toMatchObject({
      operation: "replace", entity: "pet", weights_kg: [20], target_entity_id: "pet_1",
    });
    const invented = structuredClone(plan);
    invented.slot_fill_transaction.result.operations[0].weights_kg = [25];
    expect(() => materializeBookingTurnCandidate(candidate, invented)).toThrow("structured_candidate_invalid_attribute_reference");
    const stale = structuredClone(plan);
    stale.reference_context.entities[0].id = "pet_2";
    expect(() => materializeBookingTurnCandidate(candidate, stale)).toThrow("structured_candidate_invalid_attribute_reference");
    const tampered = { ...candidate, context_refs: ["pets.pet_2"] };
    expect(() => materializeBookingTurnCandidate(tampered, plan)).toThrow("structured_candidate_invalid_attribute_reference");
  });

  it("intersects an explicit pronoun with its old-value constraint", async () => {
    const result = await turn("牠不是22，是20公斤", scenario([22, 8], "pet_2"));
    expect(result.turn_delta.operations).toEqual([]);
    expect(result.context.pet_weights_kg).toEqual([22, 8]);
    expect(result.plan.entity_reference.status).toBe("ambiguous");
  });

  it.each(["全部改成20公斤", "兩隻都改成20公斤", "那隻其實20公斤嗎？",
    "牠其實20公斤或25公斤", "牠其實只有20公斤，不要改報價"])
  ("never applies a singular correction to a plural, uncertain or rejected assertion: %s", async (message) => {
    const before = scenario([22, 8], "pet_1");
    const result = await turn(message, before);
    expect(result.turn_delta.operations).toEqual([]);
    expect(result.context.pet_weights_kg).toEqual([22, 8]);
    expect(result.context.quote_scenario.context_version).toBe(3);
  });

  // Composed after the runtime fix; none of these utterances appears in runtime rules.
  it.each(["它", "那隻", "原先那隻", "先前那隻", "剛才那隻"].flatMap((subject) =>
    ["實際上是", "其實是", "重量改成"].flatMap((predicate) => [12.5, 19].map((weight) =>
      ({ message: `請問，${subject}${predicate}${weight}公斤`, weight })))))
  ("held-out lexical composition: $message", async ({ message, weight }) => {
    const result = await turn(message, scenario([22, 8], "pet_2"));
    expect(result.turn_delta.operations).toEqual([expect.objectContaining({
      operation: "replace", entity: "pet", weights_kg: [weight], target_entity_id: "pet_2",
    })]);
    expect(result.context.pet_weights_kg).toEqual([22, weight]);
    expect(result.context.quote_scenario.context_version).toBe(4);
  });

  it.each(["牠最多20公斤", "牠不是20公斤", "牠可能20公斤", "牠其實只有20公斤但是不確定",
    "第一隻8公斤的", "另一隻15公斤", "跟上一個一樣", "其餘不變"])
  ("does not promote incomplete or unrelated grammar into an attribute assertion: %s", (message) => {
    expect(analyzeEntityAttributeAssertion(message, extractBookingTurnSpans(message))).toBeNull();
  });
});
