import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeConversationContext } from "./conversationContext.js";
import { setDiscourseAnchor, resolveTypedEntityReference } from "./typedEntityReferences.js";
import { compileBookingTurnCandidates, extractBookingTurnSpans, materializeBookingTurnCandidate,
  resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";
import { buildStructuredTurnProviderPayload, validateStructuredTurnCandidateResolverResult,
  assertStructuredTurnOutboundPayload } from "./structuredBookingTurnProvider.js";
import { validateSemanticTurnAst } from "./semanticTurnResolver.js";
import { applyScenarioTransition } from "./dialogueStateEngine.js";

const NOW = "2026-09-08T04:00:00.000Z";
export function referenceFixture({ count = 2, anchor = null, operation = "replace" } = {}) {
  let context = normalizeConversationContext({ active_intent: "pricing", current_topic: "booking_price",
    stay_type: "villa", check_in: "2026-11-01", check_out: "2026-11-02", stay_nights: 1,
    adult_count: 10, child_count: 0, infant_count: 0, breakfast_count: 0,
    pet_type: "dog", pet_count: count, pet_weights_kg: [22, 8, 12].slice(0, count),
    quote_scenario: { scenario_id: "reference-scenario", context_version: 2 },
    pending_interaction: { type: "slot_fill", action: "resolve_slot_fill", operation, entity: "pet",
      required_response_type: "slot_fill", resume_action: "request_quote",
      transaction_id: "reference-transaction", scenario_id: "reference-scenario", context_version: 2,
      asked_turn_id: "pending-reference", created_at: NOW, expires_at: "2026-09-08T04:30:00.000Z",
      candidate_references: ["entity:pet", `operation:${operation}`],
      missing_slots: ["target_pet"], filled_slots: ["operation", "entity", "count", "weights_kg"],
      partial_operation: { operation, entity: "pet", count: 1, pet_type: "dog",
        weights_kg: operation === "replace" ? [20] : [], target_pet: null,
        candidate_entities: ["pet"], candidate_operations: [operation],
        missing_slots: ["target_pet"], filled_slots: ["operation", "entity", "count", "weights_kg"] },
      provenance: [{ source_turn_id: "pending-reference",
        evidence: operation === "replace" ? "一隻狗改20公斤" : "移除一隻狗",
        filled_slots: ["operation", "entity", "count", "weights_kg"] }],
    } });
  if (anchor) context = setDiscourseAnchor(context, [anchor], "anchor-turn");
  return context;
}

export async function referenceTurn(message, context, turnId = "reference-answer") {
  const provider = vi.fn(() => { throw new Error("REFERENCE_PROVIDER_FORBIDDEN"); });
  const result = await resolveStructuredBookingTurnCandidatePipeline({ mode: "active", message,
    previousContext: context, legacyContext: context, contextResolverEnabled: true,
    dateInfo: { currentDate: "2026-09-08" }, sourceMessageId: turnId, nowIso: NOW, resolveCandidates: provider });
  expect(provider).not.toHaveBeenCalled();
  return result;
}

function compile(message, context) {
  return compileBookingTurnCandidates({ message, context, sourceTurnId: "contract-turn", nowIso: NOW,
    dateInfo: { currentDate: "2026-09-08" }, contextResolverEnabled: true });
}
function astFor(choice) {
  const { candidate_id: _id, ...ast } = choice;
  return { ...ast, confidence: 0.99 };
}

const matrix = [];
for (const count of [2, 3]) for (const anchor of [null, "pet_1"]) for (const operation of ["replace", "remove"]) {
  for (const [phrase, category] of [["另一隻", "alternate"], ["另外那個", "alternate"],
    ["剩下那隻", "alternate"], ["換另一個", "switch"], ["原本那個", "same"],
    ["剛才那隻", "same"], ["那隻", "same"], ["不是那個", "reject"]]) {
    const target = category === "same" && anchor ? "pet_1" :
      ["alternate", "switch"].includes(category) && count === 2 && anchor &&
      (category !== "switch" || operation === "replace") ? "pet_2" : null;
    matrix.push({ name: `${count}/${anchor}/${operation}/${phrase}`, count, anchor, operation, phrase, target });
  }
}

describe("typed entity identity and pending reference contract", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("REAL_NETWORK_FORBIDDEN"); })));
  afterEach(() => vi.unstubAllGlobals());

  it.each(matrix)("reference matrix $name", async ({ count, anchor, operation, phrase, target }) => {
    const before = referenceFixture({ count, anchor, operation });
    const result = await referenceTurn(phrase, before);
    const expectedWeights = [...before.pet_weights_kg];
    if (target) {
      const index = before.entity_references.pets.findIndex((pet) => pet.id === target);
      if (operation === "replace") expectedWeights[index] = 20;
      else expectedWeights.splice(index, 1);
      expect(result.context.pending_interaction).toBeNull();
      expect(result.turn_delta.operations).toHaveLength(1);
      expect(result.turn_delta.operations[0]).toMatchObject({ operation, entity: "pet", target_entity_id: target });
    } else {
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.pending_interaction).toMatchObject({ operation, entity: "pet", missing_slots: ["target_pet"] });
      expect(result.context.quote_scenario.context_version).toBe(before.quote_scenario.context_version);
    }
    expect(result.context.pet_weights_kg).toEqual(expectedWeights);
    expect(result.context.adult_count).toBe(10);
    expect(result.context.stay_nights).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects the observed read-only quote at the server contract, not only in the prompt", () => {
    const plan = compile("另外一隻呢", referenceFixture());
    expect(plan.reference_context.entities).toEqual([
      { id: "pet_1", type: "pet", weight_kg: 22 }, { id: "pet_2", type: "pet", weight_kg: 8 }]);
    expect(plan.reference_context.discourse_anchor).toBeNull();
    expect(plan.reference_contract.candidates.map((choice) => choice.candidate_id)).toEqual(["clarify_target_pet"]);
    const safe = astFor(plan.reference_contract.candidates[0]);
    expect(validateStructuredTurnCandidateResolverResult(safe, plan).semantic_ast.clarification_code).toBe("missing_target_reference");
    expect(() => validateStructuredTurnCandidateResolverResult({ ...safe, goal_id: "request_quote", clarification_code: null }, plan))
      .toThrow("structured_turn_pending_reference_contract_violation");
  });

  it.each(["replace", "remove"])("binds a unique complement through formal provider validation and reducer: %s", (operation) => {
    const before = referenceFixture({ anchor: "pet_1", operation });
    const plan = compile("另一隻", before);
    expect(plan.reference_contract.candidates).toHaveLength(2);
    const candidate = plan.reference_contract.candidates[0];
    expect(candidate).toMatchObject({ operation, context_reference_ids: ["pending.partial_operation", "pets.pet_2"] });
    const response = validateStructuredTurnCandidateResolverResult(astFor(candidate), plan);
    validateSemanticTurnAst(response.semantic_ast, { plan: { spans: plan.spans, context: before } });
    const operations = response.selected_candidate_ids.map((id) => materializeBookingTurnCandidate(plan.candidates.find((item) => item.candidate_id === id), plan));
    const reduction = applyScenarioTransition({ context: before, ast: response.semantic_ast, operations, plan,
      result: { intents: response.intent_ids, operations, missing_fields: [], ambiguities: [], confidence: 0.99 },
      sourceTurnId: "provider-certified", nowIso: NOW });
    expect(reduction.context.pet_weights_kg).toEqual(operation === "replace" ? [22, 20] : [22]);
    expect(() => validateStructuredTurnCandidateResolverResult({ ...astFor(candidate), context_reference_ids: ["pending.partial_operation", "pets.pet_1"] }, plan)).toThrow();
    expect(() => validateStructuredTurnCandidateResolverResult({ ...astFor(candidate), operation: "add" }, plan)).toThrow();
    expect(() => validateStructuredTurnCandidateResolverResult({ ...astFor(candidate), price: 1 }, plan)).toThrow();
  });

  it("preserves stable IDs after deletion, allocation, and JSON storage round trip", async () => {
    const before = referenceFixture({ count: 3, anchor: "pet_2", operation: "remove" });
    const removed = await referenceTurn("前一隻", before);
    expect(removed.context.entity_references.pets.map((pet) => pet.id)).toEqual(["pet_2", "pet_3"]);
    expect(removed.context.pet_weights_kg).toEqual([8, 12]);
    expect(removed.context.entity_references.anchor).toBeNull();
    const added = await referenceTurn("再加一隻7公斤狗", JSON.parse(JSON.stringify(removed.context)), "reference-add");
    expect(added.context.entity_references.pets.map((pet) => pet.id)).toEqual(["pet_2", "pet_3", "pet_4"]);
    expect(added.context.entity_references.anchor.last_referenced_entity_id).toBe("pet_4");
  });

  it("only updates the anchor for an explicitly identified entity, never a broad policy question", async () => {
    const before = { ...referenceFixture({ anchor: "pet_1" }), pending_interaction: null };
    const policy = await referenceTurn("狗狗可以洗澡嗎", before);
    expect(policy.context.entity_references.anchor).toEqual(before.entity_references.anchor);
    const explicit = await referenceTurn("第二隻狗狗可以洗澡嗎", before, "explicit-policy");
    expect(explicit.context.entity_references.anchor).toMatchObject({ last_referenced_entity_id: "pet_2", last_reference_turn: "explicit-policy" });
    expect(explicit.turn_delta.operations).toEqual([]);
    expect(explicit.context.pet_weights_kg).toEqual([22, 8]);
  });

  it.each(["全部", "兩隻都", "都是"])("applies matching all-scope without guessing a singular target: %s", async (phrase) => {
    const result = await referenceTurn(phrase, referenceFixture());
    expect(result.context.pet_weights_kg).toEqual([20, 20]);
    expect(result.context.entity_references.anchor).toBeNull();
    const countMismatch = await referenceTurn("兩隻都", referenceFixture({ count: 3 }));
    expect(countMismatch.turn_delta.operations).toEqual([]);
    expect(countMismatch.context.pet_weights_kg).toEqual([22, 8, 12]);
  });

  it("rejects duplicate-weight targeting, invalid IDs, stale pending, and unknown trailing instructions", async () => {
    const duplicate = normalizeConversationContext({ ...referenceFixture(), pet_weights_kg: [22, 22] });
    for (const [phrase, context] of [["22公斤那隻", duplicate], ["另外那隻外加不明項目", referenceFixture({ anchor: "pet_1" })],
      ["第九隻", referenceFixture()], ["另一隻", { ...referenceFixture({ anchor: "pet_1" }),
        quote_scenario: { scenario_id: "new-scenario", context_version: 3 } }]]) {
      const result = await referenceTurn(phrase, context);
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.pet_weights_kg).toEqual(context.pet_weights_kg);
    }
  });

  it("keeps raw source turn IDs and unapproved fields out of the outbound projection", () => {
    const before = referenceFixture({ anchor: "pet_1" });
    before.entity_references.anchor.last_reference_turn = "00000000-0000-4000-8000-000000000777";
    before.entity_references.pets[0].email = "private@example.test";
    const plan = { ...compile("另一隻", before), requires_model: true, classification: "LLM_CANDIDATE_SELECTION" };
    const { payload } = buildStructuredTurnProviderPayload({ plan });
    expect(JSON.stringify(payload)).not.toContain("private@example.test");
    expect(JSON.stringify(payload)).not.toContain(before.entity_references.anchor.last_reference_turn);
    const input = JSON.parse(payload.messages[1].content);
    expect(input.pending_summary.candidate_targets).toEqual(["pet_1", "pet_2"]);
    input.reference_context.entities[0].name = "private";
    const poisoned = { ...payload, messages: [payload.messages[0], { ...payload.messages[1], content: JSON.stringify(input) }] };
    expect(() => assertStructuredTurnOutboundPayload(poisoned)).toThrow();
  });

  it("intersects explicit attribute and ordinal constraints instead of letting an anchor override them", async () => {
    const before = referenceFixture({ anchor: "pet_1" });
    const explicit = await referenceTurn("8公斤那隻", before);
    expect(explicit.context.pet_weights_kg).toEqual([22, 20]);
    for (const phrase of ["第一隻8公斤的", "22公斤和8公斤那隻"]) {
      const result = await referenceTurn(phrase, before);
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.pet_weights_kg).toEqual([22, 8]);
    }
    const duplicate = normalizeConversationContext({ ...before, pet_weights_kg: [22, 22] });
    expect((await referenceTurn("22公斤那隻", duplicate)).turn_delta.operations).toEqual([]);
  });

  it("a new complete snapshot resets the previous scenario anchor", async () => {
    const before = referenceFixture({ anchor: "pet_1" });
    const result = await referenceTurn("2026年12月1日12人住一晚多少", before, "new-snapshot");
    expect(result.context.quote_scenario.scenario_id).not.toBe(before.quote_scenario.scenario_id);
    expect(result.context.entity_references).toMatchObject({ pets: [], anchor: null });
    expect(result.context.pending_interaction).toBeNull();
  });
});
