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

function resolverPlan(message = "姓名王小明，電話0912-345-678，再加一個") {
  const plan = compileBookingTurnCandidates({
    message,
    context: { adult_count: 10, email: "user@example.com" },
    previousTopic: "booking_price",
    dateInfo: { currentDate: "2026-09-06" },
  });
  return {
    ...plan,
    classification: "LLM_CANDIDATE_SELECTION",
    requires_model: true,
  };
}

describe("structured booking turn candidate-ID DeepSeek adapter", () => {
  it("sends only the minimized allowlisted payload and accepts IDs only", async () => {
    const logs = [];
    const plan = resolverPlan();
    const adultCandidate = plan.candidates.find((candidate) => candidate.entity === "adult");
    const fetchImpl = vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.messages[1].content);
      expect(request).toMatchObject({
        model: "deepseek-v4-flash",
        temperature: 0,
        stream: false,
      });
      expect(input).toEqual({
        current_date: "2026-09-06",
        timezone: "Asia/Taipei",
        current_booking_context: {
          stay: {
            mode: null,
            check_in: null,
            check_out: null,
            nights: null,
            date_type: null,
          },
          party: {
            adults: 10,
            children: null,
            infants: null,
            child_ages_years: [],
          },
          pets: {
            species: null,
            count: null,
            individual_weights_kg: [],
          },
          addons: { breakfast_quantity: null },
        },
        pending_missing_fields: [],
        previous_transaction_topic: "booking_price",
        latest_user_message:
          "姓名[REDACTED_NAME],電話[REDACTED_PHONE],再加一個",
        allowed_candidate_ids: plan.candidates.map((candidate) => candidate.candidate_id),
        allowed_intent_ids: [],
      });
      expect(input).not.toHaveProperty("evidence_spans");
      expect(input).not.toHaveProperty("candidates");
      expect(options.headers.Authorization).toBe("Bearer benchmark-only-test-key");
      return providerResponse(JSON.stringify({
        selected_candidate_ids: [adultCandidate.candidate_id],
        intent_ids: [],
        clarification_code: "none",
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

    expect(response.result).toEqual({
      selected_candidate_ids: [adultCandidate.candidate_id],
      intent_ids: [],
      clarification_code: "none",
      confidence: 0.97,
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
    const adultCandidate = plan.candidates.find((candidate) => candidate.entity === "adult");
    await expect(callStructuredBookingTurnInterpreter({
      plan,
      fetchImpl: async () => providerResponse(JSON.stringify({
        selected_candidate_ids: [adultCandidate.candidate_id],
        intent_ids: [],
        clarification_code: "none",
        confidence: 1,
        operations: [{ entity: "adult", operation: "add", count: 99 }],
      })),
      env,
    })).rejects.toMatchObject({
      structuredTurnFailureCode: "structured_turn_candidate_invalid_schema",
    });
  });

  it("rejects unknown candidate IDs and ambiguous mutations", () => {
    const plan = resolverPlan();
    const adultCandidate = plan.candidates.find((candidate) => candidate.entity === "adult");
    expect(() => validateStructuredTurnCandidateResolverResult({
      selected_candidate_ids: ["cand-999-adult-add"],
      intent_ids: [],
      clarification_code: "none",
      confidence: 1,
    }, plan)).toThrow("structured_turn_candidate_unknown_candidate_id");
    expect(() => validateStructuredTurnCandidateResolverResult({
      selected_candidate_ids: [adultCandidate.candidate_id],
      intent_ids: [],
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
