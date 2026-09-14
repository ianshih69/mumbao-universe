import { afterEach, describe, expect, it, vi } from "vitest";
import { compileBookingTurnCandidates, resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";
import { isPendingInteractionCurrent } from "./quoteDialogueState.js";
import { buildStructuredTurnProviderPayload, callStructuredBookingTurnInterpreter,
  validateContextualEvidence } from "./structuredBookingTurnProvider.js";
import { createAiModelExecutionContext } from "./modelExecutionContext.js";
import { normalizeConversationContext } from "./conversationContext.js";
import { evaluateBookingComplexity, bookingComplexityThreshold, bookingComplexityWeights } from "./bookingComplexityGate.js";

const now = "2026-09-14T04:00:00.000Z";
const state = normalizeConversationContext({
  active_intent: "pricing", current_topic: "booking_price", stay_type: "villa",
  check_in: "2026-12-25", check_out: "2026-12-26", stay_nights: 1,
  pet_count: 1, pet_type: "dog", pet_weights_kg: [12],
  quote_scenario: { scenario_id: "complexity-test", context_version: 1 },
  pending_interaction: { type: "clarification", action: "reconcile_headcount", required_response_type: "fields", resume_action: "request_quote",
    required_fields: ["guest_count", "adult_count", "child_count", "child_ages_years"],
    proposed_values: { guest_count: 14, adult_count: 5, child_count: 1, child_ages_years: [6] },
    scenario_id: "complexity-test", context_version: 1, created_turn_id: "turn-1", created_at: now,
    provenance: [{ source_turn_id: "turn-1", evidence: "14人、5大、1個6歲", filled_slots: ["count"] }] },
});
const compile = (message, context = {}) => compileBookingTurnCandidates({ message, context,
  dateInfo: { currentDate: "2026-09-14" }, nowIso: now, sourceTurnId: "turn-2", contextResolverEnabled: true });

const original = "14人入住12/25-12/26這樣2天多少錢5大1個6歲兒童1小狗12KG";
const env = { DEEPSEEK_API_KEY: "synthetic-contextual-fixture", DEEPSEEK_BASE_URL: "https://provider.test",
  DEEPSEEK_MODEL: "deepseek-v4-flash" };
function evidence(plan) {
  const input = JSON.parse(buildStructuredTurnProviderPayload({
    plan: { ...plan, requires_model: true, classification: "LLM_CANDIDATE_SELECTION" },
  }).payload.messages[1].content);
  return { intent: input.interpretation_contract.intent, scenario_action: input.allowed_scenario_actions[0],
    selected_candidate_ids: plan.candidates.map(candidate => candidate.candidate_id),
    evidence_span_ids: plan.spans.map(span => span.span_id), clarification_code: null, confidence: 0.99 };
}
function response(value) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof value === "string" ? value : JSON.stringify(value) },
    finish_reason: "stop" }] }), { status: 200 });
}
async function interpret(message, context, fetchImpl) {
  const executionContext = createAiModelExecutionContext();
  const resolveCandidates = vi.fn(({ plan }) => callStructuredBookingTurnInterpreter({ plan, fetchImpl, env, executionContext }));
  const result = await resolveStructuredBookingTurnCandidatePipeline({ mode: "active", message, previousContext: context,
    legacyContext: context, dateInfo: { currentDate: "2026-09-14" }, nowIso: now, sourceMessageId: "contextual-proof",
    contextResolverEnabled: true, resolveCandidates });
  return { result, executionContext, resolveCandidates };
}

describe("contextual complexity gate", () => {
  it("uses the centralized score threshold independently of hard triggers", () => {
    expect(bookingComplexityThreshold).toBe(4);
    expect(bookingComplexityWeights).toMatchObject({ pending: 5, quote: 3, ambiguity: 4, unparsed_date: 4 });
    const weight = { normalized_type: "pet_weight" };
    expect(evaluateBookingComplexity({ message: "", spans: [weight] })).toMatchObject({ triggered: false, score: 2 });
    expect(evaluateBookingComplexity({ message: "", spans: [weight, { normalized_type: "age" }] }))
      .toMatchObject({ triggered: true, score: 4 });
  });
  it("treats a compiler failure as a hard trigger even without extracted values", () => {
    expect(evaluateBookingComplexity({ message: "", compilerFailures: 1 }))
      .toMatchObject({ triggered: true, reasons: ["ambiguity"] });
  });
  it.each(["有停車場嗎", "幾點退房", "有 KTV 嗎", "可以帶狗嗎", "早餐多少錢", "有麻將嗎"])("keeps a simple FAQ local: %s", message => {
    expect(compile(message).complexity_gate).toMatchObject({ triggered: false });
  });
  it.each(["2026/12/25入住14人多少錢", "2026/2/30入住多少錢"])("triggers on structured complexity: %s", message => {
    expect(compile(message).complexity_gate).toMatchObject({ triggered: true });
  });
  it.each(["14人裡有1個6歲一個五歲", "小孩怎麼收費？", "其中一個6歲", "其他都是大人"])("triggers for a pending turn: %s", message => {
    expect(compile(message, state).complexity_gate).toMatchObject({ triggered: true });
  });
  it("keeps clarification evidence out of generic child policy", () => {
    const plan = compile("14人裡有1個6歲一個五歲", state);
    expect(plan.dialogue_goal_plan.primary_goal_id).not.toBe("child_policy_lookup");
    expect(plan.headcount_evidence.proposed_values).toMatchObject({ guest_count: 14, child_count: 2, child_ages_years: [6, 5] });
  });
  it("reads a legacy created-turn binding", () => {
    expect(isPendingInteractionCurrent(state, state.pending_interaction, now)).toBe(true);
  });
  it("rejects a mismatched scenario version", () => {
    const changed = { ...state, quote_scenario: { ...state.quote_scenario, context_version: 2 } };
    expect(isPendingInteractionCurrent(changed, changed.pending_interaction, now)).toBe(false);
  });
  it("rejects an expired canonical pending", () => {
    const expired = { ...state, pending_interaction: { ...state.pending_interaction,
      asked_turn_id: "turn-1", expires_at: "2026-09-14T03:59:00.000Z" } };
    expect(isPendingInteractionCurrent(expired, expired.pending_interaction, now)).toBe(false);
  });
  it("requires contextual interpretation for a multi-dimensional quote", () => {
    const plan = compileBookingTurnCandidates({
      message: "14人入住12/25-12/26這樣2天多少錢5大1個6歲兒童1小狗12KG",
      context: {}, dateInfo: { currentDate: "2026-09-14" },
      nowIso: "2026-09-14T04:00:00.000Z", contextResolverEnabled: true,
    });
    expect(plan.complexity_gate).toMatchObject({ triggered: true });
  });
});

describe("contextual interpreter evidence and failure boundary", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["provider_error", "invalid_json", "schema_failure", "invented_date", "invented_nights", "invented_price"])
  ("falls back without changing pricing authority: %s", async failure => {
    const fetchImpl = vi.fn(async (_url, request) => {
      if (failure === "provider_error") return new Response("synthetic failure", { status: 503 });
      if (failure === "invalid_json") return response("{broken");
      const input = JSON.parse(JSON.parse(request.body).messages[1].content);
      const value = { intent: input.interpretation_contract.intent, scenario_action: input.allowed_scenario_actions[0],
        selected_candidate_ids: input.operation_candidates.map(item => item.candidate_id),
        evidence_span_ids: input.deterministic_spans.map(item => item.span_id), clarification_code: null, confidence: .99 };
      if (failure === "schema_failure") delete value.intent;
      if (failure === "invented_date") value.check_in = "2027-01-01";
      if (failure === "invented_nights") value.stated_nights = 2;
      if (failure === "invented_price") value.price = 1;
      return response(value);
    });
    const { result, executionContext, resolveCandidates } = await interpret(original, {}, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(resolveCandidates).toHaveBeenCalledTimes(1);
    expect(executionContext.model_call_count).toBe(1);
    expect(result.provider.contextual_fallback).toBe(true);
    expect(result.context).toMatchObject({ check_in: "2026-12-25", check_out: "2026-12-26",
      stay_nights: 1, pet_weights_kg: [12], pending_interaction: { action: "reconcile_headcount" } });
  });
  it("aborts after the existing timeout with one attempt", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url, request) => new Promise((_resolve, reject) =>
      request.signal.addEventListener("abort", () => reject(Object.assign(new Error("synthetic timeout"), { name: "AbortError" })))));
    const pending = interpret("小孩怎麼收費？", state, fetchImpl);
    await vi.advanceTimersByTimeAsync(20001);
    const { result, executionContext } = await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(executionContext.model_call_count).toBe(1);
    expect(result.provider).toMatchObject({ contextual_fallback: true, failure_code: "structured_turn_timeout" });
    expect(result.context.pending_interaction).toEqual(state.pending_interaction);
    expect(result.context.quote_scenario.context_version).toBe(1);
  });
  it("sends the current pending for a policy interleave without consuming it", async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      const input = JSON.parse(JSON.parse(request.body).messages[1].content);
      expect(input.pending_summary).toMatchObject({ action: "reconcile_headcount", proposed_values: { guest_count: 14 } });
      expect(input).not.toHaveProperty("faq_catalog");
      return response({ intent: "policy_lookup", scenario_action: "read_only", selected_candidate_ids: [],
        evidence_span_ids: [], clarification_code: null, confidence: .99 });
    });
    const { result } = await interpret("小孩怎麼收費？", state, fetchImpl);
    expect(result.provider).toMatchObject({ validation_outcome: "accepted", contextual_result_kind: "policy_lookup" });
    expect(result.context.pending_interaction).toEqual(state.pending_interaction);
    expect(result.context.quote_scenario.context_version).toBe(1);
  });
  it.each(["unknown_candidate", "unknown_span", "missing_provenance", "missing_fact", "duplicate_candidate", "wrong_intent"])
  ("rejects ungrounded evidence: %s", mutation => {
    const plan = { ...compile(original), provider_protocol: "contextual_evidence" };
    const value = evidence(plan);
    if (mutation === "unknown_candidate") value.selected_candidate_ids.push("cand-999-pet-add");
    if (mutation === "unknown_span") value.evidence_span_ids.push("span-999");
    if (mutation === "missing_provenance") value.evidence_span_ids = [];
    if (mutation === "missing_fact") value.selected_candidate_ids = [];
    if (mutation === "duplicate_candidate") value.selected_candidate_ids.push(value.selected_candidate_ids[0]);
    if (mutation === "wrong_intent") value.intent = "policy_lookup";
    expect(() => validateContextualEvidence(value, plan)).toThrow();
  });
  it("does not assume an exhaustive breakdown when ages are explicitly partial", () => {
    const plan = compile("14人裡至少有1個6歲一個五歲，其他年齡還不知道", state);
    expect(plan.headcount_evidence.derived_adult_count).toBeNull();
    expect(plan.reconciliation_resolved).toBe(false);
  });
  it("requires the typed reference contract even for an empty model selection", async () => {
    const pending = (await resolveStructuredBookingTurnCandidatePipeline({ mode: "active",
      message: "狗改20公斤", previousContext: { ...state, pending_interaction: null,
        pet_count: 2, pet_weights_kg: [22, 8], entity_references: null },
      dateInfo: { currentDate: "2026-09-14" }, nowIso: now, sourceMessageId: "reference-pending",
    })).context;
    const plan = { ...compile("另外一隻", pending), provider_protocol: "contextual_evidence" };
    expect(plan.reference_contract.resolution).toBe("ambiguous");
    const value = evidence(plan);
    expect(() => validateContextualEvidence(value, plan)).toThrow();
    expect(validateContextualEvidence({ ...value, clarification_code: "missing_target_reference" }, plan))
      .toMatchObject({ clarification_code: "missing_target_reference", selected_candidate_ids: [] });
  });
});
