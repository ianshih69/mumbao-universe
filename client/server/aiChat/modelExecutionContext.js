import { createAiChatFailure } from "./deepSeek.js";

export function createAiModelExecutionContext({
  requestId = "",
  incomingMessageId = "",
  modelCallBudget = 1,
} = {}) {
  return {
    requestId: String(requestId || ""),
    incoming_message_id: String(incomingMessageId || ""),
    model_call_budget: Math.max(0, Number(modelCallBudget || 0)),
    model_call_count: 0,
    model_call_attempted: false,
    model_call_blocked_reason: null,
    model_call_purposes: [],
    model_call_strategy: "",
    model_call_allowed_purpose: null,
    model_call_plan_reason: "",
  };
}

export function createModelCallPlan({
  semanticMode = "legacy",
  canAnswerLocally = false,
  routeResult = null,
} = {}) {
  const mode = String(semanticMode || "legacy").trim().toLowerCase();
  if (canAnswerLocally) {
    return {
      strategy: "local_only",
      allowed_purpose: null,
      reason: "safe_local_route",
      model_call_budget: 0,
    };
  }

  if (mode === "hybrid" || mode === "shadow") {
    return {
      strategy: "semantic_only",
      allowed_purpose: "semantic_router",
      reason: `${mode}_semantic_router`,
      model_call_budget: 1,
    };
  }

  if (routeResult?.shouldCallDeepSeek) {
    return {
      strategy: "final_reply_only",
      allowed_purpose: "final_reply_provider",
      reason: "legacy_final_reply_provider",
      model_call_budget: 1,
    };
  }

  return {
    strategy: "local_only",
    allowed_purpose: null,
    reason: "legacy_local_route",
    model_call_budget: 0,
  };
}

export function setModelCallPlan(executionContext, plan = null) {
  if (!executionContext) return;
  const normalizedPlan =
    plan && typeof plan === "object" ? plan : createModelCallPlan();

  executionContext.model_call_strategy = String(
    normalizedPlan.strategy || "local_only"
  );
  executionContext.model_call_allowed_purpose =
    normalizedPlan.allowed_purpose || null;
  executionContext.model_call_plan_reason = String(
    normalizedPlan.reason || ""
  );
  executionContext.model_call_budget = Math.max(
    0,
    Number(normalizedPlan.model_call_budget || 0)
  );
}

export function assertModelPurposeAllowed(
  executionContext,
  purpose = "deepseek"
) {
  if (!executionContext) return;
  const allowedPurpose = executionContext.model_call_allowed_purpose;
  const normalizedPurpose = String(purpose || "deepseek");

  if (allowedPurpose && normalizedPurpose === allowedPurpose) {
    return;
  }

  if (!allowedPurpose && executionContext.model_call_budget === 0) {
    executionContext.model_call_blocked_reason = "model_purpose_not_allowed";
    throw createAiChatFailure(
      "provider_request_failed",
      "AI model call purpose is not allowed for this route.",
      {
        providerErrorCode: "model_purpose_not_allowed",
      }
    );
  }

  if (allowedPurpose && normalizedPurpose !== allowedPurpose) {
    executionContext.model_call_blocked_reason = "model_purpose_not_allowed";
    throw createAiChatFailure(
      "provider_request_failed",
      "AI model call purpose is not allowed for this route.",
      {
        providerErrorCode: "model_purpose_not_allowed",
      }
    );
  }
}

export function reserveModelCall(executionContext, purpose = "deepseek") {
  if (!executionContext) {
    return;
  }

  assertModelPurposeAllowed(executionContext, purpose);

  if (executionContext.model_call_count >= executionContext.model_call_budget) {
    executionContext.model_call_blocked_reason = "model_call_budget_exceeded";
    throw createAiChatFailure(
      "provider_request_failed",
      "AI model call budget exceeded.",
      {
        providerErrorCode: "model_call_budget_exceeded",
      }
    );
  }

  executionContext.model_call_attempted = true;
  executionContext.model_call_count += 1;
  executionContext.model_call_purposes.push(String(purpose || "deepseek"));
}

export function buildModelExecutionMetadata(executionContext) {
  if (!executionContext) {
    return {
      model_call_budget: 1,
      model_call_count: 0,
      model_call_blocked_reason: null,
    };
  }

  return {
    incoming_message_id: executionContext.incoming_message_id || undefined,
    model_call_strategy: executionContext.model_call_strategy || "",
    model_call_allowed_purpose:
      executionContext.model_call_allowed_purpose || null,
    model_call_plan_reason: executionContext.model_call_plan_reason || "",
    model_call_budget: executionContext.model_call_budget,
    model_call_count: executionContext.model_call_count,
    model_call_attempted: executionContext.model_call_attempted,
    model_call_blocked_reason:
      executionContext.model_call_blocked_reason || null,
    model_call_purposes: executionContext.model_call_purposes || [],
  };
}
