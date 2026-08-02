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

const pricingFieldLabels = {
  stay_type: "想包棟或訂單間",
  check_in: "入住日期",
  check_out: "退房日期",
  guest_count: "共有幾位入住",
  adult_count: "大人人數",
  child_count: "小孩人數",
  room_count: "需要幾間房",
  pet_count: "是否攜帶寵物",
  pet_type: "寵物種類",
};

const pricingGuardFields = new Set([
  "stay_type",
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "room_count",
  "pet_count",
  "pet_type",
]);

function toDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function addDays(dateText, days) {
  const base = toDateOnly(dateText);
  if (!base) return "";
  const date = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatDisplayDate(value) {
  const date = toDateOnly(value);
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

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

function buildFreshnessGuardRoute(routeResult, context, freshnessGuard, metadata) {
  const state = normalizeConversationContext(context);
  const uncertainFields = freshnessGuard?.uncertain_fields || [];
  let answer = "";

  if (uncertainFields.includes("guest_count")) {
    answer = "收到，人數要調整。請問新的入住人數是幾位呢？";
  } else if (uncertainFields.includes("check_out") && state.check_in) {
    const checkIn = formatDisplayDate(state.check_in);
    const nextDate = formatDisplayDate(addDays(state.check_in, 1));
    answer = `收到，你想詢問${checkIn}的${
      state.stay_type === "villa" ? "包棟" : "住宿"
    }價格。請問是${checkIn}入住、${nextDate}退房嗎？`;
  } else if (
    uncertainFields.includes("check_in") ||
    uncertainFields.includes("check_out")
  ) {
    answer = "收到，日期要調整。請問新的入住與退房日期是什麼時候呢？";
  } else if (uncertainFields.includes("pet_count")) {
    answer = "收到，寵物條件要調整。請問這次是否會攜帶寵物呢？";
  } else {
    const labels = uncertainFields
      .map((field) => pricingFieldLabels[field])
      .filter(Boolean);
    answer = labels.length
      ? `收到，請再確認${labels.join("、")}。`
      : "收到，這次條件有調整，我需要再確認一下細節。";
  }

  return buildCollectInfoRoute(routeResult, {
    answer,
    reason: "context_freshness_guard_blocked_pricing",
    metadata: {
      ...metadata,
      action_executor_result: "freshness_guard_blocked_pricing",
      pricing_called: false,
    },
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
  freshnessGuard,
}) {
  const missingFields = getMissingBookingContextFields(context);
  const uncertainPricingFields = (freshnessGuard?.uncertain_fields || []).filter((field) =>
    pricingGuardFields.has(field)
  );

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

  if (
    ["request_quote", "update_quote"].includes(action) &&
    uncertainPricingFields.length
  ) {
    return buildFreshnessGuardRoute(routeResult, context, freshnessGuard, {
      ...metadata,
      uncertain_fields: uncertainPricingFields,
    });
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
      pricing_called: true,
    });
  }

  return addExecutorMetadata(pricingRoute, {
    ...metadata,
    action_executor_result: `${action}_pricing_resolved`,
    pricing_called: true,
  });
}

export async function executeTurnAction({
  message,
  semanticResult = null,
  routeResult,
  context,
  previousContext,
  recentMessages = [],
  freshnessGuard = null,
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
    mentioned_fields: freshnessGuard?.mentioned_fields || semanticResult?.mentioned_fields || [],
    uncertain_fields: freshnessGuard?.uncertain_fields || semanticResult?.uncertain_fields || [],
    changed_fields: changedFields,
    freshness_guard_result: freshnessGuard?.freshness_guard_result || "not_applied",
    stale_fields_blocked: freshnessGuard?.stale_fields_blocked || [],
    uses_relative_date:
      freshnessGuard?.uses_relative_date || semanticResult?.uses_relative_date || false,
    pricing_called: false,
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
      freshnessGuard,
    });
  }

  if (action === "casual_conversation") {
    return buildControlRoute(routeResult, {
      action,
      answer:
        "我是慢寶，沒有真正的年齡喔！我是慢慢蒔光裡陪你認識住宿與慢寶宇宙的小幫手。",
      reason: "turn_action_casual_conversation",
      metadata: {
        ...metadata,
        action_executor_result: "casual_conversation_replied",
      },
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
