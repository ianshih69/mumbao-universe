import { describe, expect, it, vi } from "vitest";
import { interpretBookingTurnDeterministically } from "./structuredBookingTurn.js";
import { compileBookingTurnCandidates, extractBookingTurnSpans, resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";

const dateInfo = { currentDate: "2026-09-14", timeZone: "Asia/Taipei" };
async function resolve(message, context = {}, sourceMessageId = "range-case") {
  const provider = vi.fn(() => { throw new Error("UNEXPECTED_MODEL_CALL"); });
  const result = await resolveStructuredBookingTurnCandidatePipeline({
    mode: "active", message, previousContext: context, legacyContext: context,
    dateInfo, nowIso: "2026-09-14T04:00:00.000Z", sourceMessageId,
    conversationId: "synthetic-range-test", contextResolverEnabled: true, resolveCandidates: provider,
  });
  expect(provider).not.toHaveBeenCalled();
  return result;
}

describe("structured quote range and reconciliation regression", () => {
  it.each([
    "12/25-12/26", "12/25~12/26", "12/25～12/26", "12月25日-12月26日",
    "12月25到12月26", "2026/12/25-12/26", "2026/12/25-2026/12/26",
  ])("preserves both date provenance bindings for %s", async (range) => {
    const message = `10位大人入住${range}住2天多少錢`;
    const result = await resolve(message);
    expect(result.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1, adult_count: 10 });
    expect(result.plan.compiler_failures).toBe(0);
    expect(result.plan.spans.filter((span) => span.normalized_type === "date").map((span) => span.normalized_value))
      .toEqual(["2026-12-25", "2026-12-26"]);
    for (const span of result.plan.spans) expect(message.slice(span.start, span.end)).toBe(span.text);
  });

  it("uses existing year inference across New Year", async () => {
    expect((await resolve("10位大人入住12/31-1/1多少錢")).context)
      .toMatchObject({ check_in: "2026-12-31", check_out: "2027-01-01", stay_nights: 1 });
  });

  it.each(["2/30-3/1", "12/25-12/32", "2026/12/25-2026/12/24"])("rejects invalid range %s without inventing dates", async (range) => {
    const result = await resolve(`10位大人入住${range}多少錢`);
    expect(result.context.check_in).toBeNull();
    expect(result.context.check_out).toBeNull();
    expect(result.result.ambiguities.length).toBeGreaterThan(0);
  });

  it("keeps explicit nights distinct from calendar days", async () => {
    expect((await resolve("10位大人入住12/25-12/26住2天多少錢")).context.stay_nights).toBe(1);
    const days = interpretBookingTurnDeterministically({ message: "10位大人住2天多少錢", context: {}, dateInfo });
    expect(days.result.operations.some((op) => op.nights === 2)).toBe(false);
    expect((await resolve("10位大人12/25住2晚多少錢")).context)
      .toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-27", stay_nights: 2 });
  });

  it("does not silently reconcile a range with conflicting explicit nights", async () => {
    const result = await resolve("10位大人入住12/25-12/26住2晚多少錢");
    expect(result.result.ambiguities.map((item) => item.code)).toContain("date_night_conflict");
    expect(result.context.check_out).not.toBe("2026-12-27");
    expect(result.context.pending_interaction).not.toBeNull();
  });

  it.each(["1小狗12KG", "1隻狗12kg", "1隻12公斤的狗", "帶一隻狗，大概12公斤", "1隻12公斤狗"])
  ("does not count the weight twice in %s", async (pet) => {
    const message = `10位大人12/25-12/26入住，${pet}，多少錢`;
    const spans = extractBookingTurnSpans(message, dateInfo);
    const quantities = spans.filter((span) => span.normalized_type === "pet_count");
    const weights = spans.filter((span) => span.normalized_type === "pet_weight");
    expect(quantities.map((span) => span.normalized_value)).toEqual([1]);
    expect(weights.map((span) => span.normalized_value)).toEqual([12]);
    for (const quantity of quantities) for (const weight of weights)
      expect(quantity.end <= weight.start || quantity.start >= weight.end).toBe(true);
    expect((await resolve(message)).context).toMatchObject({ pet_count: 1, pet_weights_kg: [12] });
  });

  it("records conflicting total and breakdown evidence without choosing either", async () => {
    const result = await resolve("14人入住12/25-12/26，5大1小孩，1隻12公斤狗，多少錢");
    expect(result.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1, pet_count: 1, pet_weights_kg: [12] });
    expect(result.context.adult_count).toBeNull();
    expect(result.context.pending_interaction).toMatchObject({ action: "reconcile_headcount",
      proposed_values: { guest_count: 14, adult_count: 5, child_count: 1 } });
    expect(result.plan.intent_ast.turn_kind).toBe("transactional");
  });

  it("keeps the stay while a following turn adds a dog", async () => {
    const first = await resolve("10位大人12/25-12/26入住多少錢", {}, "stay-first");
    const second = await resolve("帶一隻狗，大概12公斤", first.context, "pet-next");
    expect(second.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1, adult_count: 10, pet_count: 1, pet_weights_kg: [12] });
    expect(second.context.quote_scenario.scenario_id).toBe(first.context.quote_scenario.scenario_id);
  });

  it("preserves dates and pet evidence while reconciling headcount", async () => {
    const result = await resolveStructuredBookingTurnCandidatePipeline({
      mode: "active", message: "14人入住12/25-12/26這樣2天多少錢5大1個6歲兒童1小狗12KG",
      previousContext: {}, legacyContext: {},
      dateInfo: { currentDate: "2026-09-14", timeZone: "Asia/Taipei" },
      nowIso: "2026-09-14T04:00:00.000Z", sourceMessageId: "range-test",
    });
    expect(result.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1, pet_count: 1, pet_weights_kg: [12] });
    expect(result.context.adult_count).toBeNull();
    expect(result.context.pending_interaction).toMatchObject({ action: "reconcile_headcount" });
  });

  it.each(["14人，5大1個13歲兒童", "14人，5大1個2歲兒童", "8人，5大2小孩，小孩一個4歲一個6歲"])
  ("retains declared guest evidence independently of billing ages: %s", async (party) => {
    const result = await resolve(`${party}入住12/25-12/26多少錢`);
    expect(result.context.adult_count).toBeNull();
    expect(result.context.pending_interaction.proposed_values).toMatchObject({
      adult_count: 5, child_count: party.startsWith("8人") ? 2 : 1,
    });
  });

  it("keeps a consistent total separate from adult count", async () => {
    const result = await resolve("6人，5大1個6歲兒童，入住12/25-12/26多少錢");
    expect(result.context).toMatchObject({ adult_count: 5, child_count: 1, child_ages_years: [6] });
    expect(result.context.pending_interaction?.action).not.toBe("reconcile_headcount");
  });

  it("preserves reconciliation across policy and pet turns, then clears only after explicit party resolution", async () => {
    const first = await resolve("14人入住12/25-12/26，5大1個6歲兒童，1隻12公斤狗，多少錢", {}, "conflict-first");
    const policy = await resolve("退房時間是幾點？", first.context, "policy-next");
    expect(policy.context.pending_interaction).toEqual(first.context.pending_interaction);
    const pet = await resolve("早餐三份", policy.context, "breakfast-next");
    expect(pet.context).toMatchObject({ adult_count: null, breakfast_count: 3 });
    expect(pet.context.pending_interaction.action).toBe("reconcile_headcount");
    const final = await resolve("5位大人1個6歲兒童", pet.context, "party-answer");
    expect(final.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1,
      adult_count: 5, child_count: 1, pet_count: 1, pet_weights_kg: [12] });
    expect(final.context.pending_interaction?.action).not.toBe("reconcile_headcount");
    expect(final.context.quote_scenario.scenario_id).toBe(first.context.quote_scenario.scenario_id);
    const repeated = await resolve("5位大人1個6歲兒童", final.context, "party-answer");
    expect(repeated.context).toEqual(final.context);
  });

  it("does not apply provider selections to quarantined party evidence", async () => {
    const result = await resolve("14人入住12/25-12/26，5大1小孩，多少錢");
    expect(result.plan.candidates.every((candidate) => !["adult", "child", "infant"].includes(candidate.entity))).toBe(true);
    expect(result.plan.reconciliation.conflicts.map((entry) => entry.code)).toEqual(["headcount_conflict"]);
  });

  it("retains both conflicts until their corresponding evidence is corrected", async () => {
    const first = await resolve("14人入住12/25-12/26住2晚，5大1小孩，1隻12公斤狗，多少錢", {}, "both");
    expect(first.result.ambiguities.map((entry) => entry.code).sort()).toEqual(["date_night_conflict", "headcount_conflict"]);
    expect(first.context.pending_interaction.required_fields).toContain("stay_nights");
    expect(first.context.pet_weights_kg).toEqual([12]);
    const party = await resolve("5位大人1個6歲兒童", first.context, "party-only");
    expect(party.context).toMatchObject({ adult_count: 5, child_count: 1, check_in: null });
    expect(party.context.pending_interaction.action).toBe("reconcile_stay");
  });

  it("does not convert a dated continuation's add into a snapshot set", async () => {
    const first = await resolve("10位大人入住12/25-12/26，1隻12公斤狗，多少錢", {}, "initial-pet");
    const plan = compileBookingTurnCandidates({ message: "12/25-12/26再加1隻8公斤狗，多少錢", context: first.context, dateInfo });
    expect(plan.intent_ast.scenario_action).toBe("continue");
    expect(plan.deterministic_result.operations.find((op) => op.entity === "pet").operation).toBe("add");
  });

  it("persists a dated partial quote without any adult evidence", async () => {
    const result = await resolve("入住12/25-12/26帶1隻12公斤狗，多少錢");
    expect(result.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1,
      adult_count: null, pet_count: 1, pet_weights_kg: [12] });
  });

  it.each(["1隻狗12kg", "1隻12公斤狗"])("does not reuse an adjacent pet's quantity as child evidence: %s", (pet) => {
    const spans = extractBookingTurnSpans(`5大1個6歲兒童${pet}`, dateInfo);
    const petCounts = spans.filter((span) => span.normalized_type === "pet_count");
    const childCounts = spans.filter((span) => span.normalized_type === "child_count");
    for (const child of childCounts) for (const dog of petCounts)
      expect(child.end <= dog.start || child.start >= dog.end).toBe(true);
  });
});
