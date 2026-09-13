import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeConversationContext } from "./conversationContext.js";
import { synchronizeQuoteMissingSlots } from "./pendingSlotFillTransaction.js";
import { resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";

const nowIso = "2026-09-13T10:00:00.000Z";
const dateInfo = { currentDate: "2026-09-13", timeZone: "Asia/Taipei" };
async function turn(message, context = {}, id = "fill", requireLocal = false) {
  const provider = vi.fn(() => { throw new Error("UNEXPECTED_PROVIDER_CALL"); });
  const result = await resolveStructuredBookingTurnCandidatePipeline({
    mode: "active", message, previousContext: context, legacyContext: context,
    conversationId: "synthetic-missing-slots", sourceMessageId: id, nowIso, dateInfo,
    contextResolverEnabled: requireLocal, resolveCandidates: requireLocal ? provider : null,
  });
  expect(provider).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  return result;
}
async function initial(count = 1) {
  return (await turn(`2026年11月1日，12位成人，帶${count}隻狗包棟多少錢？`, {}, "initial")).context;
}
function pets(context) { return context.entity_references.pets; }

describe("typed quote missing slots", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); })));
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["後天住", "2026-09-15", null, null],
    ["後天12人住", "2026-09-15", null, null],
    ["後天住一晚", "2026-09-15", 1, "2026-09-16"],
    ["後天住兩晚", "2026-09-15", 2, "2026-09-17"],
    ["9/15入住 9/17退房", "2026-09-15", 2, "2026-09-17"],
    ["9/15住", "2026-09-15", null, null],
    ["9/15住一晚", "2026-09-15", 1, "2026-09-16"],
    ["2026年11月1日，10位成人包棟多少？", "2026-11-01", null, null],
    ["明天1人包棟多少錢", "2026-09-14", null, null],
  ])("requires duration provenance for %s", async (message, date, nights, checkout) => {
    const result = await turn(message);
    expect(result.context).toMatchObject({ check_in: date, stay_nights: nights, check_out: checkout });
    expect(result.context.slot_meta.check_in.evidence_span_ids.length).toBeGreaterThan(0);
    const stay = result.turn_delta.operations.find((operation) => operation.entity === "stay");
    if (nights === null) {
      expect(stay.nights).toBeUndefined();
      expect(result.context.slot_meta.stay_nights.value).toBeNull();
    } else {
      const spans = result.plan.spans.filter((span) => ["date", "relative_date", "nights"].includes(span.normalized_type));
      expect(spans.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each([8, 10, 10.1, 15, 20, 20.1, 22].flatMap((weight) =>
    [`${weight}公斤`, `大概${weight}公斤`].map((phrase) => ({ weight, phrase }))))
  ("fills $phrase once using current spans, never an existing-weight lookup", async ({ weight, phrase }) => {
    const before = await initial();
    expect(pets(before)).toEqual([{ id: "pet_1", type: "pet", weight_kg: null }]);
    expect(before.pending_interaction).toMatchObject({
      action: "complete_quote_slots", candidate_references: ["pets.pet_1"],
      missing_slots: ["weights_kg", "nights"],
      partial_operation: { entity: "pet", target_entity_id: "pet_1" },
    });
    const result = await turn(phrase, before, "weight", true);
    expect(pets(result.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: weight }]);
    expect(result.context).toMatchObject({ adult_count: 12, stay_nights: null, check_out: null,
      pending_interaction: { missing_slots: ["nights"], required_fields: ["stay_nights"] } });
    expect(result.context.quote_scenario.context_version).toBe(before.quote_scenario.context_version + 1);
    const meta = result.context.slot_meta.pet_weights_kg;
    expect(meta.source_turn_id).toBe("weight");
    expect(meta.context_refs).toContain("pets.pet_1");
    const span = result.plan.spans.find((entry) => entry.span_id === meta.evidence_span_ids[0]);
    expect(span.normalized_value).toBe(weight);
    expect(phrase.slice(span.start, span.end)).toBe(span.text);
    expect(result.context.dialogue_events.filter((event) => event.turn_id === "weight" && event.type === "PetWeightChanged")).toHaveLength(1);
    const duplicate = await turn(phrase, result.context, "weight", true);
    expect(duplicate.context).toEqual(result.context);
  });

  it.each(["狗狗多重？", "早餐可以代訂嗎？", "退房時間是幾點？", "20公斤狗狗怎麼收費？",
    "2026年11月1日退房時間", "後天入住時段"])
  ("keeps typed targets across policy %s", async (policy) => {
    const before = await initial();
    const question = await turn(policy, before, "policy");
    expect(question.context.pending_interaction).toEqual(before.pending_interaction);
    expect(question.context.quote_scenario).toEqual(before.quote_scenario);
    expect(pets(question.context)).toEqual(pets(before));
    const result = await turn("20公斤", question.context, "weight", true);
    expect(pets(result.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: 20 }]);
  });

  it.each([2, 3])("does not guess among %i unknown pets", async (count) => {
    const before = await initial(count);
    const result = await turn("20公斤", before, "ambiguous", true);
    expect(pets(result.context)).toEqual(pets(before));
    expect(result.context.quote_scenario).toEqual(before.quote_scenario);
    expect(result.turn_delta.operations).toEqual([]);
    expect(result.result.ambiguities[0].code).toBe("missing_target_reference");
  });

  it("fills the only missing target without moving an existing weight", async () => {
    const both = await initial(2);
    const first = await turn("第一隻8公斤", both, "first", true);
    expect(pets(first.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: 8 }, { id: "pet_2", type: "pet", weight_kg: null }]);
    const second = await turn("20公斤", first.context, "second", true);
    expect(pets(second.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: 8 }, { id: "pet_2", type: "pet", weight_kg: 20 }]);
    expect(second.turn_delta.operations[0].target_entity_id).toBe("pet_2");
  });

  it("preserves an interior unknown weight when the second pet is filled first", async () => {
    const both = await initial(2);
    const second = await turn("第二隻20公斤", both, "second", true);
    expect(second.context.pet_weights_kg).toEqual([null, 20]);
    expect(pets(second.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: null }, { id: "pet_2", type: "pet", weight_kg: 20 }]);
    const first = await turn("8公斤", second.context, "first", true);
    expect(first.context.pet_weights_kg).toEqual([8, 20]);
    expect(first.turn_delta.operations[0].target_entity_id).toBe("pet_1");
  });

  it("fills two typed measurements in entity order with stable IDs", async () => {
    const before = await initial(2);
    const result = await turn("一隻8公斤，一隻20公斤", before, "both", true);
    expect(pets(result.context)).toEqual([{ id: "pet_1", type: "pet", weight_kg: 8 }, { id: "pet_2", type: "pet", weight_kg: 20 }]);
    expect(result.context.quote_scenario.context_version).toBe(before.quote_scenario.context_version + 1);
  });

  it("rejects an out-of-range ordinal instead of assigning its weight to a missing pet", async () => {
    const before = await initial();
    const result = await turn("第三隻20公斤", before, "bad-target", true);
    expect(pets(result.context)).toEqual(pets(before));
    expect(result.turn_delta.operations).toEqual([]);
  });

  it.each([["20公斤", "住兩晚"], ["住兩晚", "20公斤"]])
  ("completes independent typed slots in order %s then %s", async (a, b) => {
    const before = await initial();
    const first = await turn(a, before, "one", true);
    const second = await turn(b, first.context, "two", true);
    expect(second.context).toMatchObject({ check_in: "2026-11-01", check_out: "2026-11-03",
      stay_nights: 2, adult_count: 12, pet_count: 1, pet_weights_kg: [20], pending_interaction: null });
    expect(pets(second.context)[0].id).toBe(pets(before)[0].id);
  });

  it("invalidates a removed pet target and never reuses its ID", async () => {
    const before = await initial();
    const removed = await turn("狗狗都不要了", before, "remove");
    expect(pets(removed.context)).toEqual([]);
    expect(removed.context.pending_interaction.candidate_references).toEqual([]);
    const added = await turn("再加一隻狗", removed.context, "new-pet");
    expect(pets(added.context)).toEqual([{ id: "pet_2", type: "pet", weight_kg: null }]);
    expect(added.context.pending_interaction.candidate_references).toEqual(["pets.pet_2"]);
    const filled = await turn("20公斤", added.context, "fill-new", true);
    expect(pets(filled.context)).toEqual([{ id: "pet_2", type: "pet", weight_kg: 20 }]);
  });

  it("rejects stale pending targets and expired pending", async () => {
    const before = await initial();
    for (const pending of [
      { ...before.pending_interaction, candidate_references: ["pets.pet_99"] },
      { ...before.pending_interaction, expires_at: "2026-09-13T09:59:00Z" },
    ]) {
      const result = await turn("20公斤", { ...before, pending_interaction: pending }, "stale", true);
      expect(pets(result.context)).toEqual(pets(before));
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.pending_interaction).toBeNull();
    }
  });

  it("does not carry a previous conversation's pending into an empty session", async () => {
    await initial();
    const result = await turn("20公斤", {}, "fresh", true);
    expect(pets(result.context)).toEqual([]);
    expect(result.context.pending_interaction).toBeNull();
    expect(result.context.check_in).toBeNull();
  });

  it("keeps a non-quote pending contract and does not create a second pending store", async () => {
    const before = normalizeConversationContext({ pending_interaction: { type: "slot_fill", action: "resolve_slot_fill",
      entity: null, operation: "add", missing_slots: ["entity"] } });
    expect(synchronizeQuoteMissingSlots(before, { sourceTurnId: "no-scenario", nowIso })).toEqual(before);
  });

  it.each([
    ["8/15住一晚", "2027-08-15", "2027-08-16"],
    ["12/31入住 1/2退房", "2026-12-31", "2027-01-02"],
  ])("retains the existing inferred-year rules for %s", async (message, checkIn, checkOut) => {
    const result = await turn(message);
    expect(result.context).toMatchObject({ check_in: checkIn, check_out: checkOut });
  });
});
