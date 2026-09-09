import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureAiQualityTurn, isAiQualityObserverEnabled, observeAiQualityTurn, prepareAiQualityTurn } from "./observer.js";
import { buildAiQualityTurnSnapshot, classifyAiQualityProviderFailure } from "./snapshot.js";
import { deriveAiQualitySignals } from "./signals.js";
import { persistAiQualityTurn, aiQualityPersistenceTimeoutMs } from "./persistence.js";
import * as privacy from "./privacy.js";

const context = {
  check_in: "2026-11-01", check_out: "2026-11-02", stay_nights: 1,
  guest_count: 10, adult_count: 10, pet_count: 1, pet_weights_kg: [22],
  quote_scenario: { scenario_id: "synthetic-scenario", context_version: 1 },
};
const pending = {
  type: "slot_fill", action: "resolve_slot_fill", required_response_type: "slot_fill",
  resume_action: "modify_booking", operation: "replace", entity: "pet",
  missing_slots: ["target_pet"], scenario_id: "synthetic-scenario",
  context_version: 1, asked_turn_id: "synthetic-turn", transaction_id: "synthetic-pending",
};
const input = (extra = {}) => ({
  conversationId: "synthetic-conversation", turnId: "synthetic-turn",
  userText: "我的電話0988-123-456，11/1十個人帶22公斤狗住兩晚多少？",
  assistantText: "電話0988-123-456，請確認日期。",
  beforeContext: context, afterContext: context,
  responseAuthority: { allow_context_mutation: false },
  route: {}, metadata: { final_response_kind: "informational_answer", structured_mode: "active" },
  ...extra,
});
const snapshot = (extra) => buildAiQualityTurnSnapshot(input(extra));
const types = value => deriveAiQualitySignals(value).map(event => event.event_type);
beforeEach(() => {
  vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED", "true");
  vi.stubEnv("AI_QUALITY_HMAC_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-transport-credential");
  vi.stubEnv("VERCEL", "0");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("observer strict flag, privacy and failure boundary", () => {
  it.each([undefined, "", "false", "active", "1", "yes", "TRUE", " true", "true "])("OFF for %s without reading input", value => {
    vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED", value);
    const read = vi.fn(() => { throw new Error("must_not_read"); });
    expect(isAiQualityObserverEnabled()).toBe(false);
    expect(captureAiQualityTurn(read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("is ON only for literal true", () => expect(isAiQualityObserverEnabled()).toBe(true));
  it("sanitizes both texts before the only payload and discards unapproved runtime data", () => {
    const s = snapshot();
    s.metadata.raw_context = context;
    s.context.phone = "0988-123-456";
    const p = prepareAiQualityTurn(s);
    expect(p.user_text).toBe("我的電話[PHONE]，11/1十個人帶22公斤狗住兩晚多少?");
    expect(p.assistant_text).toBe("電話[PHONE]，請確認日期。");
    expect(p.conversation_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(p.turn_key_hash).not.toBe(p.conversation_key_hash);
    expect(JSON.stringify(p)).not.toMatch(/0988|synthetic-conversation|synthetic-turn|synthetic-scenario|raw_context/);
    expect(Object.keys(p)).toEqual(["conversation_key_hash", "turn_key_hash", "user_text", "assistant_text", "metadata", "context", "events"]);
  });
  it("deduplicates by scoped source turn, not text", () => {
    const one = prepareAiQualityTurn(snapshot());
    expect(prepareAiQualityTurn(snapshot()).turn_key_hash).toBe(one.turn_key_hash);
    expect(prepareAiQualityTurn(snapshot({ turnId: "other-turn" })).turn_key_hash).not.toBe(one.turn_key_hash);
    expect(prepareAiQualityTurn(snapshot({ conversationId: "other-conversation" })).turn_key_hash).not.toBe(one.turn_key_hash);
  });
  it.each(["hmac", "sanitizer", "snapshot"])("isolates %s failure without persistence or raw logging", async kind => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    if (kind === "hmac") vi.stubEnv("AI_QUALITY_HMAC_SECRET", undefined);
    if (kind === "sanitizer") vi.spyOn(privacy, "sanitizeAiQualityText").mockImplementation(() => { throw new Error("PRIVATE_RAW_ERROR"); });
    const s = kind === "snapshot" ? captureAiQualityTurn(() => { throw new Error("PRIVATE_RAW_ERROR"); }) : snapshot();
    await expect(observeAiQualityTurn(s)).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn.mock.calls.flat().join(" ")).toMatch(/^\[ai-quality\] observation_failed category=(snapshot|preparation)$/);
  });
  it.each([[404, "missing_schema"], [403, "permission"], [409, "conflict"], [500, "database"]])("isolates HTTP %i, never reads raw error", async (status, category) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_RAW_ERROR", { status })));
    await observeAiQualityTurn(snapshot());
    expect(console.warn).toHaveBeenCalledWith("[ai-quality] observation_failed category=" + category);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds even a fetch implementation ignoring abort, with no retry", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const result = persistAiQualityTurn(prepareAiQualityTurn(snapshot()), { fetchImpl });
    await vi.advanceTimersByTimeAsync(aiQualityPersistenceTimeoutMs);
    expect(await result).toBe("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("isolates thrown DB transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("PRIVATE_RAW_ERROR"); }));
    await observeAiQualityTurn(snapshot());
    expect(console.warn).toHaveBeenCalledWith("[ai-quality] observation_failed category=network");
  });
  it("registers background work with Vercel request lifetime without waiting on DB", async () => {
    vi.stubEnv("VERCEL", "1");
    let finish;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const deferred = [];
    const key = Symbol.for("@vercel/request-context");
    const original = globalThis[key];
    globalThis[key] = { get: () => ({ waitUntil: task => deferred.push(task) }) };
    try {
      await observeAiQualityTurn(snapshot());
      expect(deferred).toHaveLength(1);
      await Promise.resolve();
      finish(new Response(null, { status: 204 }));
      await deferred[0];
    } finally { if (original === undefined) delete globalThis[key]; else globalThis[key] = original; }
  });
});

describe("deterministic invariant signals", () => {
  it("normal policy has no events and anchors/timestamps do not count as mutation", () => {
    expect(types(snapshot({ afterContext: { ...context, last_updated_at: "2099-01-01", current_topic: "policy" } }))).toEqual([]);
  });
  it.each(["pet_weights_kg", "child_ages_years", "dog_over_20kg_count", "breakfast_count", "check_in"])("fingerprints the existing booking field %s without persisting it", field => {
    const values = { pet_weights_kg: [8], child_ages_years: [7], dog_over_20kg_count: 2, breakfast_count: 3, check_in: "2026-11-03" };
    const s = snapshot({ afterContext: { ...context, [field]: values[field] } });
    expect(types(s)).toContain("wrong_mutation_signal");
    expect(prepareAiQualityTurn(s).context).not.toHaveProperty(field);
  });
  it("does not label safe provider NONE or local fallback as provider errors", () => {
    for (const calls of [0, 1]) {
      const s = snapshot({
        route: { knowledgeGap: true }, executionContext: { model_call_count: calls },
        metadata: { fallback_reason: "faq_selector_none", faq_selector_result: "none" },
      });
      expect(types(s)).toEqual(["generic_fallback"]);
    }
    const shadow = snapshot({
      executionContext: { model_call_count: 1, model_call_purposes: ["semantic_router"] },
      metadata: { semantic_validator_result: "accepted", fallback_reason: "semantic_shadow" },
    });
    expect(types(shadow)).toEqual([]);
    expect(shadow.metadata.validation_outcome).toBe("accepted");
  });
  it("does not reinterpret text or mutate input objects", () => {
    const source = input();
    const before = structuredClone(source);
    const first = buildAiQualityTurnSnapshot(source);
    const second = buildAiQualityTurnSnapshot({ ...source, userText: "unrelated text", assistantText: "unrelated text" });
    expect(first.metadata).toEqual(second.metadata);
    expect(types(first)).toEqual(types(second));
    expect(source).toEqual(before);
  });
  it("detects injected read-only mutation even if scenario version was not advanced", () => {
    expect(types(snapshot({ afterContext: { ...context, adult_count: 11 } }))).toEqual(["wrong_mutation_signal"]);
  });
  it("valid mutation is not wrong mutation or context lost", () => {
    expect(types(snapshot({
      afterContext: { ...context, stay_nights: 2, quote_scenario: { ...context.quote_scenario, context_version: 2 } },
      responseAuthority: { allow_context_mutation: true },
      structured: { plan: { resolved_intent_ast: { scenario_action: "continue", operations: [{ operation: "replace" }] } } },
    }))).toEqual([]);
  });
  it("requires continuation authority before flagging lost context", () => {
    const s = snapshot({ afterContext: {}, responseAuthority: {}, structured: { plan: { resolved_intent_ast: { scenario_action: "continue" } } } });
    expect(types(s)).toEqual(["context_lost_signal"]);
    for (const action of ["new", "reset", "clear", "replace", "read_only", undefined]) {
      expect(types(snapshot({ afterContext: {}, responseAuthority: {}, structured: { plan: { resolved_intent_ast: { scenario_action: action } } } }))).not.toContain("context_lost_signal");
    }
  });
  it("detects requested already-known slots, not new replacement values", () => {
    const extra = { metadata: { final_response_kind: "clarification" }, route: { semanticMetadata: { final_missing_fields: ["check_in"] } } };
    expect(types(snapshot(extra))).toContain("unnecessary_clarification");
    expect(types(snapshot({ ...extra, beforeContext: {} }))).not.toContain("unnecessary_clarification");
    expect(types(snapshot({
      ...extra, beforeContext: { ...context, guest_count: null },
      route: { semanticMetadata: { final_missing_fields: ["guest_count"] } },
    }))).not.toContain("unnecessary_clarification");
    expect(types(snapshot({ ...extra, structured: { plan: { resolved_intent_ast: { operations: [{ operation: "replace" }] } } } }))).not.toContain("unnecessary_clarification");
  });
  it("detects pending disappearance only for valid neutral read-only turns", () => {
    const extra = { beforeContext: { ...context, pending_interaction: pending }, structured: { plan: { slot_fill_transaction: { status: "ignored_policy" } } } };
    expect(types(snapshot(extra))).toEqual(["context_lost_signal"]);
    for (const status of ["completed", "stale", "cancelled_by_snapshot"]) {
      expect(types(snapshot({ ...extra, structured: { plan: { slot_fill_transaction: { status } } } }))).toEqual([]);
    }
    expect(types(snapshot({ ...extra, beforeContext: { ...context, pending_interaction: { ...pending, expires_at: "2000-01-01" } } }))).toEqual([]);
  });
  it("records distinct events once and leaves repeated_question disabled", () => {
    const s = snapshot();
    Object.assign(s, { provider_schema_rejected: true, continuity_broken: true, pending_integrity_broken: true });
    Object.assign(s.metadata, { generic_fallback: true, provider_call_count: 2 });
    expect(types(s)).toEqual(["generic_fallback", "provider_schema_reject", "context_lost_signal", "possible_misunderstanding"]);
  });
  it.each([
    ["structured_turn_timeout", null, "timeout"], ["structured_turn_request_failed", null, "network"],
    [null, 429, "rate_limit"], [null, 503, "http_error"], ["invalid_json", null, "invalid_response"],
    ["PRIVATE_ERROR", null, "unknown"],
  ])("normalizes provider code %s", (code, status, expected) => {
    expect(classifyAiQualityProviderFailure(code, status)).toBe(expected);
  });
});
