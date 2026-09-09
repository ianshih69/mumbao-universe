import { afterEach, describe, expect, it, vi } from "vitest";
import { semanticDialogueCapabilities } from "../aiChat/dialogueCapabilities.js";
import { sanitizeAiQualityContext, sanitizeAiQualityMetadata } from "./metadata.js";

afterEach(() => vi.unstubAllGlobals());
describe("quality metadata allowlist", () => {
  const safe = {
    capability_id: "pool_policy", response_kind: "informational_answer", provider_used: false,
    provider_call_count: 0, scenario_changed: false, pending_created: true, pending_consumed: false,
    generic_fallback: false, clarification: true, semantic_resolver_used: false, latency_ms: 10,
    structured_mode: "active", validation_outcome: "not_called", provider_error_type: "timeout",
  };
  it("accepts only explicit enums, booleans and bounded integers", () => {
    expect(sanitizeAiQualityMetadata(safe)).toEqual(safe);
    expect(sanitizeAiQualityMetadata(sanitizeAiQualityMetadata(safe))).toEqual(safe);
  });
  it.each(semanticDialogueCapabilities.map((entry) => entry.capability_id))("reuses capability %s", (id) => {
    expect(sanitizeAiQualityMetadata({capability_id: id})).toEqual({capability_id: id});
  });
  it.each(["request", "response", "headers", "Authorization", "cookies", "email", "phone",
    "booking", "payment", "bank", "prompt", "env", "raw_response", "incoming_message_id",
    "session_id", "conversation_context",
  ])("discards forbidden metadata field %s", (key) => {
    const unsafe = { [key]: { synthetic_private_data: "not-for-storage" }, ...safe };
    unsafe.circular = unsafe;
    expect(sanitizeAiQualityMetadata(unsafe)).toEqual(safe);
  });
  it.each([
    {provider_used: "true"}, {provider_call_count: "1"}, {provider_call_count: -1},
    {provider_call_count: 33}, {provider_call_count: 1.1}, {latency_ms: Infinity},
    {latency_ms: 120001}, {capability_id: "synthetic@example.invalid"},
    {response_kind: "arbitrary text"}, {structured_mode: "unexpected"},
    {provider_error_type: "raw exception text"}, {validation_outcome: null},
    {scenario_changed: {}}, {clarification: 1},
  ])("drops invalid types and arbitrary text %#", (value) => {
    expect(sanitizeAiQualityMetadata(value)).toEqual({});
  });
  it("never invokes getters or walks prototypes", () => {
    const getter = vi.fn(() => true);
    const input = Object.defineProperty({}, "provider_used", {get: getter});
    expect(sanitizeAiQualityMetadata(input)).toEqual({});
    expect(getter).not.toHaveBeenCalled();
    expect(sanitizeAiQualityMetadata(Object.create({provider_used: true}))).toEqual({});
    expect(sanitizeAiQualityMetadata([safe])).toEqual({});
  });
  it("copies a minimal diagnostic shape, not scenario or pending objects", () => {
    const input = {
      scenario_present: true, pending_present: true, scenario_version: 2,
      pending_missing_fields: ["target_pet", "adults", "target_pet", "booking_id", {}],
      pets: [{id: "private", weight: 22}], check_in: "2026-11-01",
      conversation_context: {message: "not-for-storage"},
    };
    const expected = {scenario_present: true, pending_present: true, scenario_version: 2,
      pending_missing_fields: ["target_pet", "adults"]};
    expect(sanitizeAiQualityContext(input)).toEqual(expected);
    expect(sanitizeAiQualityContext(expected)).toEqual(expected);
    expect(sanitizeAiQualityContext({scenario_version: -1, pending_present: "true"})).toEqual({});
  });
  it("is server only", () => {
    vi.stubGlobal("window", {});
    expect(() => sanitizeAiQualityMetadata(safe)).toThrow("ai_quality_server_only");
    expect(() => sanitizeAiQualityContext({})).toThrow("ai_quality_server_only");
  });
});
