import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRuntime, fixtureContext, stateView } from "../../scripts/ai/runOwnerSemanticProviderBenchmark.mjs";
import { setDiscourseAnchor } from "./typedEntityReferences.js";

const runtime = await loadRuntime();
const NOW = "2026-09-08T04:00:00.000Z";

// Authored after the runtime freeze and the 201-test development/handler gate.
// Expectations come from identity/set relations, never from resolver output.
const forms = [
  ["另外一個", "alternate"], ["另外一隻", "alternate"], ["另一個", "alternate"], ["另一隻", "alternate"],
  ["另外那隻", "alternate"], ["另外那個", "alternate"], ["剩下那個", "alternate"], ["剩下那隻", "alternate"],
  ["原本的", "same"], ["原先那隻", "same"], ["剛才那個", "same"], ["剛剛那隻", "same"],
  ["上一隻", "same"], ["先前那個", "same"], ["那個", "same"], ["那隻", "same"],
  ["前一個", "before"], ["前一隻", "before"], ["後一個", "after"], ["後面那隻", "after"],
  ["兩隻都", "two"], ["全部狗狗", "all"], ["通通", "all"], ["所有狗狗", "all"],
  ["不是那隻", "reject"], ["不是那個", "reject"], ["不對", "reject"], ["对", "reject"],
  ["換另外那隻", "switch"], ["換另一個", "switch"], ["換另外一個", "switch"], ["換剩下那隻", "switch"],
];
const textCases = forms.flatMap(([phrase, relation]) => ["請問", "如果"].map((prefix) => ({
  message: `${prefix}${phrase}呢？`, relation,
})));
const cases = [];
for (const count of [2, 3]) for (const anchor of [null, "pet_1", "pet_2"]) for (const operation of ["replace", "remove"]) {
  for (const entry of textCases) cases.push({ ...entry, count, anchor, operation,
    name: `${count}/${anchor}/${operation}/${entry.message}` });
}

function expectedTargets({ count, anchor, operation, relation }) {
  const ids = Array.from({ length: count }, (_, index) => `pet_${index + 1}`);
  const position = ids.indexOf(anchor);
  if (relation === "all" || relation === "two" && count === 2) return ids;
  if (position < 0) return [];
  if (relation === "same") return [anchor];
  if (relation === "alternate" || relation === "switch" && operation === "replace") {
    const complement = ids.filter((id) => id !== anchor);
    return complement.length === 1 ? complement : [];
  }
  if (relation === "before" && position > 0) return [ids[position - 1]];
  if (relation === "after" && position + 1 < count) return [ids[position + 1]];
  return [];
}

describe("post-implementation reference holdout (no provider)", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("REAL_NETWORK_FORBIDDEN"); })));
  afterEach(() => vi.unstubAllGlobals());

  it("contains 64 distinct post-freeze utterances and 768 independent state combinations", () => {
    expect(new Set(textCases.map((entry) => entry.message)).size).toBe(64);
    expect(cases).toHaveLength(768);
  });

  it.each(cases)("held out $name", async (entry) => {
    const fixture = await fixtureContext(entry.operation === "replace" ? "pet-target" : "pet-remove", runtime);
    let before = runtime.normalizeConversationContext({ ...fixture, entity_references: null,
      pet_count: entry.count, pet_weights_kg: [22, 8, 12].slice(0, entry.count) });
    if (entry.anchor) before = setDiscourseAnchor(before, [entry.anchor], "holdout-anchor");
    const targets = expectedTargets(entry);
    const provider = vi.fn(() => { throw new Error("PROVIDER_FORBIDDEN"); });
    const result = await runtime.resolveStructuredBookingTurnCandidatePipeline({ mode: "active", message: entry.message,
      previousContext: before, legacyContext: before, sourceMessageId: "holdout-turn", nowIso: NOW,
      dateInfo: { currentDate: "2026-09-08" }, contextResolverEnabled: true, resolveCandidates: provider });
    const nextPets = before.entity_references.pets.flatMap((pet) => !targets.includes(pet.id) ? [pet] :
      entry.operation === "replace" ? [{ ...pet, weight_kg: 20 }] : []);
    expect(result.context.pet_weights_kg).toEqual(nextPets.map((pet) => pet.weight_kg));
    expect(result.context.pet_count).toBe(nextPets.length);
    expect(result.context.entity_references.pets).toEqual(nextPets);
    expect(stateView(result.context)).toEqual({ ...stateView(before), weights: nextPets.map((pet) => pet.weight_kg),
      pet_count: nextPets.length, pet_type: nextPets.length ? "dog" : null });
    expect(result.context.quote_scenario.scenario_id).toBe(before.quote_scenario.scenario_id);
    if (targets.length) {
      expect(result.turn_delta.operations).toHaveLength(1);
      expect(result.turn_delta.operations[0].operation).toBe(entry.operation);
      expect(result.context.pending_interaction).toBeNull();
      expect(result.context.quote_scenario.context_version).toBe(before.quote_scenario.context_version + 1);
    } else {
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.pending_interaction).toMatchObject({ operation: entry.operation, entity: "pet", missing_slots: ["target_pet"] });
      expect(result.context.quote_scenario.context_version).toBe(before.quote_scenario.context_version);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
