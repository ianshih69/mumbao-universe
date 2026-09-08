import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  definitions, providerDefinitions, loadRuntime, fixtureContext, stateView,
  deterministicControls, runCase, certificationPlan, evaluateRuntime,
  classifyTurn, summarizeBenchmark,
} from "../../scripts/ai/runOwnerSemanticProviderBenchmark.mjs";
import { analyzeDialogueReferences } from "./dialogueReferenceSemantics.js";

const runtime = await loadRuntime();
const syntheticEnv = { DEEPSEEK_API_KEY: "synthetic-owner-fixture",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com", DEEPSEEK_MODEL: "deepseek-v4-flash" };

function mockTransport(entry, transform = (value) => value) {
  return vi.fn(async (_url, request) => {
    const payload = JSON.parse(request.body);
    const input = JSON.parse(payload.messages[1].content);
    const expected = entry.expected;
    const candidate = input.operation_candidates.find((item) =>
      item.entity === expected.entity && expected.operations.includes(item.operation) && expected.fields.includes(item.field));
    const clarify = ["clarification", "reject"].includes(expected.kind);
    const ast = { goal_id: clarify ? "none" : expected.goal,
      scenario_action: clarify ? "read_only" : "continue",
      operation: candidate?.operation || "none", entity: candidate?.entity || "none",
      field: candidate?.field || "none", span_ids: candidate?.span_ids || [],
      context_reference_ids: candidate?.context_reference_ids || [],
      clarification_code: clarify ? (input.reference_contract ? "missing_target_reference" : "missing_entity") : null, confidence: 0.99 };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(transform(ast)) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 120, completion_tokens: 30 } }), { status: 200 });
  });
}

describe("runtime/provider certification separation (synthetic transport only)", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("REAL_NETWORK_FORBIDDEN"); })));
  afterEach(() => vi.unstubAllGlobals());

  async function local(message, context, id = "generic-control") {
    const provider = vi.fn(() => { throw new Error("LOCAL_PROVIDER_FORBIDDEN"); });
    const result = await runtime.resolveStructuredBookingTurnCandidatePipeline({ mode: "active", message,
      previousContext: context, legacyContext: context, contextResolverEnabled: true,
      nowIso: "2026-09-08T04:00:00.000Z", sourceMessageId: id,
      dateInfo: { currentDate: "2026-09-08" }, resolveCandidates: provider });
    expect(provider).not.toHaveBeenCalled();
    return result;
  }

  it("composes reference and removal operators across lexical variations", async () => {
    const before = await fixtureContext("base", runtime);
    for (const reference of ["原本", "原先", "剛才", "先前"]) {
      for (const operation of ["不要", "移除", "拿掉"]) {
        const result = await local(`${reference}那隻${operation}了`, before);
        expect(stateView(result.context)).toEqual({ ...stateView(before), weights: [], pet_count: 0, pet_type: null });
        expect(result.result.ambiguities).toEqual([]);
      }
    }
  });

  it("requires a target when a pet reference is not unique", async () => {
    const before = await fixtureContext("pet-target", runtime);
    const context = { ...before, pending_interaction: null };
    const result = await local("先前那隻拿掉", context);
    expect(stateView(result.context)).toEqual(stateView(context));
    expect(result.context.pending_interaction.partial_operation).toMatchObject({ entity: "pet", operation: "remove" });
    expect(result.context.pending_interaction.partial_operation.missing_slots).toContain("target_pet");
    expect(result.result.ambiguities[0].question).toContain("哪一隻");
  });

  it("composes collective scope only with a matching pending operation and entity", async () => {
    const before = await fixtureContext("pet-remove", runtime);
    for (const scope of ["都", "全部", "通通", "所有"]) {
      for (const operation of ["不要", "拿掉", "移除"]) {
        const result = await local(`${scope}${operation}了`, before);
        expect(result.context.pet_count).toBe(0);
        expect(result.context.pet_weights_kg).toEqual([]);
        expect(result.context.adult_count).toBe(10);
        expect(result.context.pending_interaction).toBeNull();
      }
    }
    for (const message of ["全部早餐不要", "全部增加", "全部不明項目不要", "全部20公斤的不要"]) {
      const result = await local(message, before);
      expect(stateView(result.context)).toEqual(stateView(before));
      expect(result.result.operations).toEqual([]);
    }
  });

  it("resumes only fully covered references to the current scenario", async () => {
    const before = await fixtureContext("base", runtime);
    for (const scope of ["其他", "其餘", "剩下"]) {
      for (const continuation of ["一樣", "不變", "照舊"]) {
        const message = `${scope}${continuation}`;
        const result = await local(message, before);
        expect(result.plan.dialogue_goal_plan.lane).toBe("transactional");
        expect(stateView(result.context)).toEqual(stateView(before));
        expect(result.result.operations).toEqual([]);
        expect(result.result.ambiguities).toEqual([]);
        expect((await local(message, {})).plan.dialogue_goal_plan.lane).not.toBe("transactional");
      }
    }
    for (const message of ["其他價格不變嗎", "跟剛才一樣但換餐點", "原本那個", "另外那隻"]) {
      const spans = runtime.extractBookingTurnSpans(message);
      expect(analyzeDialogueReferences(message, spans).resume).toBe(false);
    }
  });

  it("keeps all 60 deterministic controls local", async () => {
    const controls = await deterministicControls(runtime);
    expect(controls).toHaveLength(60);
    expect(controls.every((row) => row.pass && row.attempts === 0)).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(definitions())("preserves runtime semantics for $id: $phrase", async (entry) => {
    const transport = mockTransport(entry);
    for (const repeat of [1, 2]) {
      const row = await runCase(entry, repeat, runtime, syntheticEnv, { calls: 0, fatal: false }, transport, "runtime");
      expect(row.reasons, JSON.stringify(row)).toEqual([]);
      expect(row.runtime_pass).toBe(true);
      expect(row.pass).toBe(true);
      expect(row.real_calls).toBeLessThanOrEqual(1);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(providerDefinitions())("certifies $id directly through the adapter without runtime routing", async (entry) => {
    const transport = mockTransport(entry);
    const pipeline = vi.fn((input) => {
      if (input.sourceMessageId.startsWith("fixture-")) return runtime.resolveStructuredBookingTurnCandidatePipeline(input);
      throw new Error("RUNTIME_ROUTING_FORBIDDEN_IN_PROVIDER_GATE");
    });
    for (const repeat of [1, 2]) {
      const row = await runCase(entry, repeat, { ...runtime, resolveStructuredBookingTurnCandidatePipeline: pipeline },
        syntheticEnv, { calls: 0, fatal: false }, transport, "provider");
      expect(row.provider_reasons, JSON.stringify(row)).toEqual([]);
      expect(row.reasons, JSON.stringify(row)).toEqual([]);
      expect(row.pass).toBe(true);
      expect(row.real_calls).toBe(1);
      expect(row.schema_valid).toBe(true);
      expect(row.provenance_valid).toBe(true);
    }
    // Fixture preparation can use deterministic routing; only the measured turn bypasses it.
    expect(pipeline.mock.calls.every(([input]) => input.sourceMessageId.startsWith("fixture-"))).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows a schema-valid read/resume AST with no mutation or fabricated provenance", async () => {
    const entry = definitions().find((item) => item.id === "resume-18");
    const before = await fixtureContext(entry.fixture, runtime);
    const plan = certificationPlan(runtime, entry, before, "schema-resume");
    const result = runtime.validateStructuredTurnCandidateResolverResult({ goal_id: "request_quote",
      scenario_action: "continue", operation: "none", entity: "none", field: "none",
      span_ids: [], context_reference_ids: [], clarification_code: null, confidence: 0.99 }, plan);
    expect(result.selected_candidate_ids).toEqual([]);
    expect(result.semantic_ast.operations).toEqual([]);
    expect(() => runtime.validateSemanticTurnAst(result.semantic_ast, { plan: { spans: plan.spans, context: before } })).not.toThrow();
  });

  it("stops before transport when the 40-call budget is exhausted", async () => {
    const transport = mockTransport(definitions()[0]);
    const budget = { calls: 40, fatal: false };
    const row = await runCase(definitions()[0], 1, runtime, syntheticEnv, budget, transport, "provider");
    expect(row.pass).toBe(false);
    expect(row.real_calls).toBe(0);
    expect(row.provider_error_type).toBe("CALL_BUDGET_REJECTED");
    expect(budget.calls).toBe(40);
    expect(budget.fatal).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ["bad-enum", (ast) => ({ ...ast, operation: "resume" }), "operation", "INVALID_SCHEMA"],
    ["bad-null", (ast) => ({ ...ast, clarification_code: "none" }), "clarification_code", "INVALID_SCHEMA"],
    ["untrusted-extra-field", (ast) => ({ ...ast, private_value: "untrusted-data" }), "$object", "INVALID_SCHEMA"],
    ["unknown-provenance", (ast) => ({ ...ast, span_ids: ["span-999"] }), null, "PROVENANCE_REJECTED"],
  ])("rejects %s without retry, leaked values, or a schema bypass", async (_id, transform, field, code) => {
    const entry = definitions()[0];
    const transport = mockTransport(entry, transform);
    const row = await runCase(entry, 1, runtime, syntheticEnv, { calls: 0, fatal: false }, transport, "provider");
    expect(row.pass).toBe(false);
    expect(row.real_calls).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(row.provider_error_type).toBe(code);
    if (field) expect(row.schema_diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    const serialized = JSON.stringify(row);
    for (const forbidden of [syntheticEnv.DEEPSEEK_API_KEY, "Authorization", "untrusted-data", "private_value"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not turn a zero-call no-op, lost context, or missing clarification into a pass", async () => {
    const entry = definitions().find((item) => item.id === "pet-08");
    const before = await fixtureContext("base", runtime);
    const bad = { context: before, reduction: { stale: false }, turn_delta: { operations: [] },
      result: { ambiguities: [] }, plan: { dialogue_goal_plan: { lane: "knowledge" }, dialogue_state: {} } };
    const reasons = evaluateRuntime(entry, before, bad);
    expect(reasons).toContain("EXPECTED_TRANSITION_MISSING");
    expect(reasons).toContain("WRONG_ROUTE");
    expect(classifyTurn({ realCalls: 0, runtimeReasons: reasons, providerReasons: [], schemaValid: null,
      expectedKind: entry.expected.kind })).toBe("LOCAL_RUNTIME_BUG");
    const clarify = definitions().find((item) => item.id === "party-16");
    expect(evaluateRuntime(clarify, before, bad)).toContain("MISSING_CLARIFICATION");
    expect(evaluateRuntime(entry, before, { ...bad, context: { ...before, quote_scenario: null } })).toContain("WRONG_REFERENCE");
  });

  it("uses provider calls, not all runtime turns, as the provider-quality denominator", () => {
    const rows = Array.from({ length: 40 }, (_unused, i) => ({ pass: i < 38, runtime_pass: i < 38,
      real_calls: i < 16 ? 1 : 0, provider_pass: i < 14 ? true : i < 16 ? false : null,
      schema_valid: i < 14 ? true : i < 16 ? false : null, provenance_valid: i < 14 ? true : null,
      reasons: [], provider_reasons: [], input_tokens: i < 16 ? 120 : null,
      output_tokens: i < 16 ? 30 : null, provider_error_type: null }));
    const controls = Array.from({ length: 60 }, () => ({ pass: true, attempts: 0 }));
    const summary = summarizeBenchmark(rows, controls, { calls: 16, fatal: false });
    expect(summary.provider_schema_valid_percent).toBe(87.5);
    expect(summary.provider_semantic_correct_percent).toBe(87.5);
    expect(summary.zero_call_percent).toBe(60);
    expect(summary.one_call_percent).toBe(40);
    expect(summary.average_calls_per_turn).toBe(0.4);
    expect(summary).not.toHaveProperty("semantic_accuracy_percent");
  });

  it.each([
    [0, [], [], null, "mutation", "LOCAL_CORRECT"],
    [0, ["WRONG_ROUTE"], [], null, "resume", "LOCAL_RUNTIME_BUG"],
    [1, [], [], true, "mutation", "PROVIDER_CORRECT"],
    [1, ["UNEXPECTED_CLARIFICATION"], ["INVALID_SCHEMA"], false, "resume", "PROVIDER_SCHEMA_BUG"],
    [1, ["WRONG_MUTATION"], ["WRONG_GOAL"], true, "mutation", "PROVIDER_SEMANTIC_BUG"],
    [0, [], [], null, "clarification", "SAFE_REJECT_CORRECT"],
  ])("classifies independent routing/runtime/provider outcomes: %s %s %s", (calls, reasons, providerReasons, schemaValid, expectedKind, classification) => {
    expect(classifyTurn({ realCalls: calls, runtimeReasons: reasons, providerReasons, schemaValid, expectedKind })).toBe(classification);
  });
});
