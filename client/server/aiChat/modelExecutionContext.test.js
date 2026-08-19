import { describe, expect, it } from "vitest";
import {
  buildModelExecutionMetadata,
  createAiModelExecutionContext,
  createModelCallPlan,
  reserveModelCall,
  setModelCallPlan,
} from "./modelExecutionContext.js";

describe("AI chat model execution context", () => {
  it("allows one model call per incoming message and records the purpose", () => {
    const context = createAiModelExecutionContext({
      requestId: "request-1",
      incomingMessageId: "incoming-1",
    });

    reserveModelCall(context, "semantic_router");

    expect(buildModelExecutionMetadata(context)).toMatchObject({
      incoming_message_id: "incoming-1",
      model_call_budget: 1,
      model_call_count: 1,
      model_call_attempted: true,
      model_call_blocked_reason: null,
      model_call_purposes: ["semantic_router"],
    });
  });

  it("blocks a second model call without incrementing the count", () => {
    const context = createAiModelExecutionContext();
    setModelCallPlan(context, {
      strategy: "semantic_only",
      allowed_purpose: "semantic_router",
      reason: "test",
      model_call_budget: 1,
    });

    reserveModelCall(context, "semantic_router");

    expect(() => reserveModelCall(context, "semantic_router")).toThrow(
      "AI model call budget exceeded."
    );
    expect(buildModelExecutionMetadata(context)).toMatchObject({
      model_call_budget: 1,
      model_call_count: 1,
      model_call_attempted: true,
      model_call_blocked_reason: "model_call_budget_exceeded",
      model_call_purposes: ["semantic_router"],
    });
  });

  it("creates mutually exclusive model call plans by route mode", () => {
    expect(
      createModelCallPlan({
        semanticMode: "hybrid",
        canAnswerLocally: false,
        routeResult: { shouldCallDeepSeek: true },
      })
    ).toMatchObject({
      strategy: "semantic_only",
      allowed_purpose: "semantic_router",
      model_call_budget: 1,
    });

    expect(
      createModelCallPlan({
        semanticMode: "legacy",
        canAnswerLocally: false,
        routeResult: { shouldCallDeepSeek: true },
      })
    ).toMatchObject({
      strategy: "final_reply_only",
      allowed_purpose: "final_reply_provider",
      model_call_budget: 1,
    });

    expect(
      createModelCallPlan({
        semanticMode: "hybrid",
        canAnswerLocally: false,
        routeResult: {
          route: "semantic_verifier_required",
          shouldCallDeepSeek: true,
        },
      })
    ).toMatchObject({
      strategy: "faq_semantic_verifier_only",
      allowed_purpose: "faq_semantic_verifier",
      model_call_budget: 1,
    });

    expect(
      createModelCallPlan({
        semanticMode: "shadow",
        canAnswerLocally: true,
        routeResult: { shouldCallDeepSeek: true },
      })
    ).toMatchObject({
      strategy: "local_only",
      allowed_purpose: null,
      model_call_budget: 0,
    });
  });

  it("blocks a model purpose that does not match the selected plan", () => {
    const context = createAiModelExecutionContext();
    setModelCallPlan(
      context,
      createModelCallPlan({
        semanticMode: "hybrid",
        routeResult: { shouldCallDeepSeek: true },
      })
    );

    expect(() => reserveModelCall(context, "final_reply_provider")).toThrow(
      "AI model call purpose is not allowed for this route."
    );
    expect(buildModelExecutionMetadata(context)).toMatchObject({
      model_call_strategy: "semantic_only",
      model_call_allowed_purpose: "semantic_router",
      model_call_blocked_reason: "model_purpose_not_allowed",
      model_call_count: 0,
    });
  });
});
