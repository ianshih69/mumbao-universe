import { describe, expect, it, vi } from "vitest";
import { compileBookingTurnCandidates } from "./structuredBookingTurnCandidates.js";
import {
  assertStructuredTurnOutboundPayload,
  buildStructuredTurnProviderPayload,
  callStructuredBookingTurnInterpreter,
  validateStructuredTurnCandidateResolverResult,
} from "./structuredBookingTurnProvider.js";

const env = {
  DEEPSEEK_API_KEY: "benchmark-only-test-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.test",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
};

function providerResponse(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({
      choices: [{
        message: { content },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

function resolverPlan(message = "姓名王小明，電話0912-345-678，那改兩晚") {
  const plan = compileBookingTurnCandidates({
    message,
    context: {
      active_intent: "pricing",
      current_topic: "booking_price",
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 10,
      pet_count: 1,
      pet_type: "dog",
      pet_weights_kg: [22],
      quote_scenario: { scenario_id: "provider-test", context_version: 2 },
      email: "user@example.com",
    },
    previousTopic: "booking_price",
    dateInfo: { currentDate: "2026-09-06" },
    contextResolverEnabled: true,
  });
  return plan;
}

describe("structured booking turn semantic AST DeepSeek adapter", () => {
  it("sends only minimized candidates and accepts an exact provenance match", async () => {
    const logs = [];
    const plan = resolverPlan();
    const candidate = plan.candidates[0];
    const fetchImpl = vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      expect(request).toMatchObject({
        model: "deepseek-v4-flash",
        temperature: 0,
        stream: false,
      });
      expect(input).toMatchObject({
        current_date: "2026-09-06",
        timezone: "Asia/Taipei",
        scenario_version: 2,
        pending_summary: null,
        previous_transaction_topic: "booking_price",
        latest_user_message:
          "姓名[REDACTED_NAME],電話[REDACTED_PHONE],那改兩晚",
        goal_candidates: [{ goal_id: "request_quote" }],
        allowed_scenario_actions: ["continue"],
      });
      expect(input.deterministic_spans.length).toBeGreaterThan(0);
      expect(input.operation_candidates).toHaveLength(1);
      expect(input.operation_candidates[0]).toMatchObject({
        candidate_id: candidate.candidate_id,
        operation: "replace",
        entity: "stay",
        field: "stay.nights",
      });
      expect(input).not.toHaveProperty("faq_catalog");
      expect(input).not.toHaveProperty("answer");
      expect(input).not.toHaveProperty("internal_note");
      expect(options.headers.Authorization).toBe("Bearer benchmark-only-test-key");
      const semantic = input.operation_candidates[0];
      return providerResponse(JSON.stringify({
        goal_id: "request_quote",
        scenario_action: "continue",
        operation: semantic.operation,
        entity: semantic.entity,
        field: semantic.field,
        span_ids: semantic.span_ids,
        context_reference_ids: semantic.context_reference_ids,
        clarification_code: null,
        confidence: 0.97,
      }));
    });

    const response = await callStructuredBookingTurnInterpreter({
      plan,
      requestId: "test-case",
      fetchImpl,
      env,
      logger: (event, metadata) => logs.push({ event, metadata }),
    });

    expect(response.result).toMatchObject({
      goal_id: "request_quote",
      scenario_action: "continue",
      operation: "replace",
      entity: "stay",
      field: "stay.nights",
      clarification_code: null,
      confidence: 0.97,
      selected_candidate_ids: [candidate.candidate_id],
      intent_ids: ["request_quote"],
    });
    expect(response.metadata).toMatchObject({
      provider_status: 200,
      validation_outcome: "accepted",
      selected_candidate_count: 1,
    });
    expect(JSON.stringify(logs)).not.toContain("王小明");
    expect(JSON.stringify(logs)).not.toContain("benchmark-only-test-key");
  });

  it("rejects forbidden outbound fields before a provider call", () => {
    const { payload } = buildStructuredTurnProviderPayload({ plan: resolverPlan() });
    const input = JSON.parse(payload.messages[1].content);
    input.faq_catalog = [];
    payload.messages[1].content = JSON.stringify(input);
    expect(() => assertStructuredTurnOutboundPayload(payload)).toThrow(
      "structured_turn_forbidden_outbound_field",
    );
  });

  it("rejects markdown-wrapped JSON as malformed", async () => {
    await expect(callStructuredBookingTurnInterpreter({
      plan: resolverPlan(),
      fetchImpl: async () => providerResponse("```json\n{}\n```"),
      env,
    })).rejects.toMatchObject({
      structuredTurnFailureCode: "malformed_model_json",
    });
  });

  it("rejects model-generated operation values", async () => {
    const plan = resolverPlan();
    const semantic = buildStructuredTurnProviderPayload({ plan }).privacy.input
      .operation_candidates[0];
    await expect(callStructuredBookingTurnInterpreter({
      plan,
      fetchImpl: async () => providerResponse(JSON.stringify({
        goal_id: "request_quote",
        scenario_action: "continue",
        operation: semantic.operation,
        entity: semantic.entity,
        field: semantic.field,
        span_ids: semantic.span_ids,
        context_reference_ids: semantic.context_reference_ids,
        clarification_code: null,
        confidence: 1,
        value: 99,
      })),
      env,
    })).rejects.toMatchObject({
      structuredTurnFailureCode: "structured_turn_candidate_invalid_schema",
    });
  });

  it("rejects provenance not copied from one legal candidate and ambiguous mutations", () => {
    const plan = resolverPlan();
    const semantic = buildStructuredTurnProviderPayload({ plan }).privacy.input
      .operation_candidates[0];
    expect(() => validateStructuredTurnCandidateResolverResult({
      goal_id: "request_quote",
      scenario_action: "continue",
      operation: semantic.operation,
      entity: semantic.entity,
      field: semantic.field,
      span_ids: ["span-999"],
      context_reference_ids: semantic.context_reference_ids,
      clarification_code: null,
      confidence: 1,
    }, plan)).toThrow("structured_turn_candidate_no_exact_provenance_match");
    expect(() => validateStructuredTurnCandidateResolverResult({
      goal_id: "request_quote",
      scenario_action: "continue",
      operation: semantic.operation,
      entity: semantic.entity,
      field: semantic.field,
      span_ids: semantic.span_ids,
      context_reference_ids: semantic.context_reference_ids,
      clarification_code: "missing_entity",
      confidence: 0.4,
    }, plan)).toThrow("structured_turn_candidate_ambiguous_mutation");
  });

  it("refuses provider calls for deterministic plans", async () => {
    const fetchImpl = vi.fn();
    const plan = compileBookingTurnCandidates({
      message: "一隻22公斤狗",
      context: { adult_count: 10 },
    });
    await expect(callStructuredBookingTurnInterpreter({
      plan,
      fetchImpl,
      env,
    })).rejects.toThrow("structured_turn_provider_not_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
