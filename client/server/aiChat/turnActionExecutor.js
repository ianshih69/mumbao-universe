import {
  buildContextualKnowledgeRouteOverride,
  getMissingBookingContextFields,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  buildOfficialPricingRouteOverride,
  classifyPricingReplyIntent,
  getPricingRelevantChangedFields,
} from "./lodgingPricing.js";
import { normalizeTurnAction } from "./semanticOrchestrator.js";

const pricingIntentToTurnAction = new Map([
  ["initial_quote", "request_quote"],
  ["reprice_after_context_change", "update_quote"],
  ["quote_confirmation", "confirm_quote"],
  ["quote_confirmation_missing_context", "confirm_quote"],
  ["quote_breakdown", "explain_quote"],
  ["lodging_only_quote", "lodging_only_quote"],
  ["new_question_acknowledgement", "switch_topic"],
  ["casual_acknowledgement", "acknowledge"],
]);

function getLatestAssistantMessage(recentMessages = []) {
  return [...(Array.isArray(recentMessages) ? recentMessages : [])]
    .reverse()
    .find((message) => message?.sender === "ai");
}

export function hasLatestVerifiedPricingReply(recentMessages = []) {
  const latestAssistant = getLatestAssistantMessage(recentMessages);
  const metadata = latestAssistant?.metadata;
  if (!metadata || typeof metadata !== "object") return false;

  return (
    metadata.lodging_price_status === "resolved" ||
    metadata.price_calculation_route === "existing_official_pricing" ||
    metadata.pricing_override_applied === true ||
    Number.isInteger(metadata.lodging_price_amount)
  );
}

function hasPricingContext(context) {
  const state = normalizeConversationContext(context);
  return state.active_intent === "pricing" || state.current_topic === "booking_price";
}

function hasPricingSessionContext({ context, previousContext, recentMessages }) {
  return (
    hasPricingContext(context) ||
    hasPricingContext(previousContext) ||
    hasLatestVerifiedPricingReply(recentMessages)
  );
}

function buildResetContextPatch() {
  return {
    active_intent: null,
    stay_type: null,
    check_in: null,
    check_out: null,
    guest_count: null,
    adult_count: null,
    child_count: null,
    pet_count: null,
    pet_type: null,
    room_count: null,
    current_topic: null,
  };
}

function addExecutorMetadata(routeResult, metadata) {
  return {
    ...routeResult,
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      pricing_override_applied:
        routeResult?.semanticMetadata?.pricing_override_applied ?? false,
      ...metadata,
    },
  };
}

function buildControlRoute(
  routeResult,
  { action, answer, reason, contextPatch = null, metadata = {} }
) {
  return addExecutorMetadata(
    {
      ...routeResult,
      route: action,
      providerUsed: "local_intent",
      answer,
      notice: answer,
      answerMode: "direct",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
      aiSkipped: true,
      reason,
      conversationContextPatch: contextPatch,
    },
    metadata
  );
}

function buildCollectInfoRoute(routeResult, { answer, reason, metadata }) {
  return addExecutorMetadata(
    {
      ...routeResult,
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
      answer,
      notice: "",
      answerMode: "collect_info",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
      aiSkipped: true,
      reason,
    },
    metadata
  );
}

function buildMissingFieldsRoute(routeResult, context, metadata) {
  const contextual = buildContextualKnowledgeRouteOverride(context, {
    ...routeResult,
    route: "knowledge_gap",
    answer: routeResult?.answer || "",
    notice: routeResult?.notice || "",
    answerMode: null,
    knowledgeGap: true,
    shouldMarkNeedsHuman: true,
  });

  if (contextual) {
    return addExecutorMetadata(
      {
        ...routeResult,
        ...contextual,
        reason: contextual.reason,
      },
      metadata
    );
  }

  return buildCollectInfoRoute(routeResult, {
    answer: "收到，已先記下目前資訊。請問想了解房價、房況或其他住宿資訊呢？",
    reason: "turn_action_collect_info_missing_quote_context",
    metadata,
  });
}

function buildNeedsClarificationRoute(routeResult, metadata) {
  return buildControlRoute(routeResult, {
    action: "confirm_quote",
    answer: "想確認哪一項資訊呢？你可以把問題再告訴我，我再幫你確認。",
    reason: "turn_action_confirm_quote_without_verified_pricing",
    metadata,
  });
}

function inferFallbackTurnAction({
  message,
  routeResult,
  context,
  previousContext,
  recentMessages,
}) {
  const route = String(routeResult?.route || "");
  if (route === "scope_guard") return "out_of_scope";
  if (route === "ask_human" || route === "human_takeover") return "human_takeover";

  const pricingIntent = classifyPricingReplyIntent({
    message,
    recentMessages,
    previousContext,
    context,
  });
  if (pricingIntentToTurnAction.has(pricingIntent)) {
    return pricingIntentToTurnAction.get(pricingIntent);
  }

  if (route === "faq_direct" || route === "semantic_grounded") {
    return "ask_information";
  }
  if (route === "knowledge_gap") return "knowledge_gap";
  return "ask_information";
}

function resolveAction({
  semanticResult,
  message,
  routeResult,
  context,
  previousContext,
  recentMessages,
}) {
  const semanticAction = normalizeTurnAction(semanticResult?.turn_action);
  if (semanticAction) return semanticAction;

  return inferFallbackTurnAction({
    message,
    routeResult,
    context,
    previousContext,
    recentMessages,
  });
}

function isPricingAction(action) {
  return [
    "request_quote",
    "update_quote",
    "confirm_quote",
    "explain_quote",
    "lodging_only_quote",
  ].includes(action);
}

async function executePricingAction({
  action,
  context,
  previousContext,
  recentMessages,
  routeResult,
  message,
  metadata,
  changedFields,
}) {
  const missingFields = getMissingBookingContextFields(context);

  if (action === "confirm_quote" && !hasLatestVerifiedPricingReply(recentMessages)) {
    return buildNeedsClarificationRoute(routeResult, {
      ...metadata,
      action_executor_result: "confirm_quote_without_verified_pricing",
    });
  }

  if (
    ["confirm_quote", "explain_quote", "lodging_only_quote"].includes(action) &&
    !hasLatestVerifiedPricingReply(recentMessages)
  ) {
    return buildMissingFieldsRoute(routeResult, context, {
      ...metadata,
      action_executor_result: `${action}_missing_verified_pricing`,
    });
  }

  if (action === "update_quote") {
    const hasSessionPricing = hasPricingSessionContext({
      context,
      previousContext,
      recentMessages,
    });

    if (!hasSessionPricing) {
      return buildMissingFieldsRoute(routeResult, context, {
        ...metadata,
        action_executor_result: "update_quote_without_pricing_session",
      });
    }

    if (!changedFields.length) {
      return buildMissingFieldsRoute(routeResult, context, {
        ...metadata,
        action_executor_result: "update_quote_without_changed_fields",
      });
    }
  }

  if (missingFields.length) {
    return buildMissingFieldsRoute(routeResult, context, {
      ...metadata,
      action_executor_result: `${action}_missing_fields`,
    });
  }

  const pricingRoute = await buildOfficialPricingRouteOverride(context, routeResult, {
    message,
    recentMessages,
    previousContext,
    turnAction: action,
  });

  if (!pricingRoute) {
    return buildMissingFieldsRoute(routeResult, context, {
      ...metadata,
      action_executor_result: `${action}_pricing_unresolved`,
    });
  }

  return addExecutorMetadata(pricingRoute, {
    ...metadata,
    action_executor_result: `${action}_pricing_resolved`,
  });
}

export async function executeTurnAction({
  message,
  semanticResult = null,
  routeResult,
  context,
  previousContext,
  recentMessages = [],
} = {}) {
  const action = resolveAction({
    semanticResult,
    message,
    routeResult,
    context,
    previousContext,
    recentMessages,
  });
  const changedFields = getPricingRelevantChangedFields(previousContext, context);
  const metadata = {
    ...(semanticResult?.turn_action ? { semantic_turn_action: semanticResult.turn_action } : {}),
    validated_turn_action: action,
    turn_action_validator_result: normalizeTurnAction(action) ? "accepted" : "rejected",
    changed_fields: changedFields,
  };

  if (!normalizeTurnAction(action)) {
    return addExecutorMetadata(routeResult, {
      ...metadata,
      validated_turn_action: "knowledge_gap",
      turn_action_validator_result: "rejected",
      action_executor_result: "invalid_turn_action",
    });
  }

  if (isPricingAction(action)) {
    return executePricingAction({
      action,
      context,
      previousContext,
      recentMessages,
      routeResult,
      message,
      metadata,
      changedFields,
    });
  }

  if (action === "switch_topic") {
    return buildControlRoute(routeResult, {
      action,
      answer: "好的，請問你想重新了解哪個問題呢？",
      reason: "turn_action_switch_topic",
      contextPatch: {
        active_intent: null,
        current_topic: null,
      },
      metadata: {
        ...metadata,
        action_executor_result: "switch_topic_acknowledged",
      },
    });
  }

  if (action === "acknowledge") {
    return buildControlRoute(routeResult, {
      action,
      answer: "好的，需要再確認住宿、寵物或設施資訊時，都可以再問我喔。",
      reason: "turn_action_acknowledge",
      metadata: {
        ...metadata,
        action_executor_result: "acknowledge_replied",
      },
    });
  }

  if (action === "reset_context") {
    return buildControlRoute(routeResult, {
      action,
      answer: "好的，我們重新開始。請問你想了解什麼呢？",
      reason: "turn_action_reset_context",
      contextPatch: buildResetContextPatch(),
      metadata: {
        ...metadata,
        action_executor_result: "context_reset",
      },
    });
  }

  if (action === "human_takeover") {
    return addExecutorMetadata(
      {
        ...routeResult,
        route: "ask_human",
        providerUsed: "ask_human",
        shouldCallDeepSeek: false,
        shouldMarkNeedsHuman: true,
        knowledgeGap: false,
        aiSkipped: true,
        reason: "turn_action_human_takeover",
      },
      {
        ...metadata,
        action_executor_result: "human_takeover_requested",
      }
    );
  }

  if (action === "out_of_scope") {
    return addExecutorMetadata(routeResult, {
      ...metadata,
      action_executor_result: "out_of_scope_routed",
    });
  }

  if (action === "knowledge_gap") {
    return addExecutorMetadata(
      {
        ...routeResult,
        route: "knowledge_gap",
        providerUsed: routeResult?.providerUsed || "knowledge_gap",
        shouldCallDeepSeek: false,
        shouldMarkNeedsHuman: true,
        knowledgeGap: true,
        aiSkipped: true,
        reason: routeResult?.reason || "turn_action_knowledge_gap",
      },
      {
        ...metadata,
        action_executor_result: "knowledge_gap",
      }
    );
  }

  return addExecutorMetadata(routeResult, {
    ...metadata,
    action_executor_result: "ask_information_passthrough",
  });
}
