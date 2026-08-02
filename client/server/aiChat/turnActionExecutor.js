import {
  buildContextualKnowledgeRouteOverride,
  getMissingBookingContextFields,
  normalizePendingInteraction,
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

function addMinutes(isoText, minutes) {
  const base = Date.parse(isoText || "");
  const time = Number.isFinite(base) ? base : Date.now();
  return new Date(time + minutes * 60 * 1000).toISOString();
}

function isPendingExpired(pending, nowIso) {
  const expiresAt = Date.parse(pending?.expires_at || "");
  if (!Number.isFinite(expiresAt)) return false;
  const now = Date.parse(nowIso || "");
  return expiresAt <= (Number.isFinite(now) ? now : Date.now());
}

function buildPendingInteraction({
  action,
  proposedValues = {},
  requiredResponseType,
  resumeAction,
  requiredFields = [],
  sourceMessageId = "",
  nowIso,
}) {
  return {
    action,
    proposed_values: proposedValues,
    required_response_type: requiredResponseType,
    resume_action: resumeAction,
    ...(requiredFields.length ? { required_fields: requiredFields } : {}),
    source_assistant_message_id: sourceMessageId || null,
    created_at: nowIso,
    expires_at: addMinutes(nowIso, 30),
  };
}

function clearPendingPatch() {
  return { pending_interaction: null };
}

function buildConfirmedDateSummary(context) {
  const state = normalizeConversationContext(context);
  if (!state.check_in || !state.check_out) return "";
  const stayLabel = state.stay_type === "villa" ? "包棟" : "住宿";
  return `${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(
    state.check_out
  )}退房的${stayLabel}需求`;
}

function buildMissingFieldsQuestion(context, prefix = "收到") {
  const missingFields = getMissingBookingContextFields(context);
  const labels = expandMissingContextFields(missingFields)
    .map((field) => pricingFieldLabels[field])
    .filter(Boolean);
  if (!labels.length) return "";
  return `${prefix}請問${labels.join("、")}呢？`;
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
    pending_interaction: null,
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

function buildCollectInfoRoute(
  routeResult,
  { answer, reason, metadata, contextPatch = null }
) {
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
      conversationContextPatch: contextPatch,
    },
    metadata
  );
}

function buildMissingFieldsRoute(routeResult, context, metadata, options = {}) {
  const missingFields = getMissingBookingContextFields(context);
  const pendingInteraction = buildCollectQuoteFieldsPending({
    missingFields,
    resumeAction: metadata?.resumed_turn_action || metadata?.validated_turn_action || "request_quote",
    nowIso: options.nowIso || new Date().toISOString(),
    sourceMessageId: options.sourceMessageId || "",
  });
  const pendingPatch = pendingInteraction
    ? { pending_interaction: pendingInteraction }
    : null;
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
        conversationContextPatch: pendingPatch,
      },
      metadata
    );
  }

  return buildCollectInfoRoute(routeResult, {
    answer: "收到，已先記下目前資訊。請問想了解房價、房況或其他住宿資訊呢？",
    reason: "turn_action_collect_info_missing_quote_context",
    metadata,
    contextPatch: pendingPatch,
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

function expandMissingContextFields(missingFields) {
  const fields = [];
  for (const field of missingFields || []) {
    if (field === "dates") {
      fields.push("check_in", "check_out");
    } else {
      fields.push(field);
    }
  }
  return [...new Set(fields.filter((field) => pricingGuardFields.has(field)))];
}

function buildCollectQuoteFieldsPending({ missingFields, resumeAction, nowIso, sourceMessageId }) {
  const requiredFields = expandMissingContextFields(missingFields);
  if (!requiredFields.length) return null;

  return buildPendingInteraction({
    action: "collect_quote_fields",
    proposedValues: {},
    requiredResponseType: "fields",
    resumeAction,
    requiredFields,
    sourceMessageId,
    nowIso,
  });
}

function buildFreshnessGuardRoute(routeResult, context, freshnessGuard, metadata, options = {}) {
  const state = normalizeConversationContext(context);
  const uncertainFields = freshnessGuard?.uncertain_fields || [];
  let answer = "";
  let contextPatch = null;

  if (uncertainFields.includes("guest_count")) {
    answer = "收到，人數要調整。請問新的入住人數是幾位呢？";
  } else if (uncertainFields.includes("check_out") && state.check_in) {
    const checkIn = formatDisplayDate(state.check_in);
    const nextDate = formatDisplayDate(addDays(state.check_in, 1));
    answer = `收到，你想詢問${checkIn}的${
      state.stay_type === "villa" ? "包棟" : "住宿"
    }價格。請問是${checkIn}入住、${nextDate}退房嗎？`;
    contextPatch = {
      pending_interaction: buildPendingInteraction({
        action: "confirm_quote_dates",
        proposedValues: {
          active_intent: "pricing",
          current_topic: "booking_price",
          stay_type: state.stay_type,
          check_in: state.check_in,
          check_out: addDays(state.check_in, 1),
        },
        requiredResponseType: "confirmation",
        resumeAction: metadata?.validated_turn_action || "request_quote",
        sourceMessageId: options.sourceMessageId || "",
        nowIso: options.nowIso || new Date().toISOString(),
      }),
    };
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
    contextPatch,
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
  pendingInteraction,
}) {
  const semanticAction = normalizeTurnAction(semanticResult?.turn_action);
  if (semanticAction) return semanticAction;

  if (pendingInteraction) {
    return "answer_pending";
  }

  return inferFallbackTurnAction({
    message,
    routeResult,
    context,
    previousContext,
    recentMessages,
  });
}

async function executePendingAction({
  action,
  pendingInteraction,
  context,
  previousContext,
  recentMessages,
  routeResult,
  message,
  metadata,
  nowIso,
  sourceMessageId,
}) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending) {
    return buildCollectInfoRoute(routeResult, {
      answer: "我目前沒有正在等待確認的內容。請把想了解的問題再告訴我一次。",
      reason: "pending_action_without_pending",
      metadata: {
        ...metadata,
        pending_resolution: "missing",
        action_executor_result: "pending_missing",
      },
      contextPatch: clearPendingPatch(),
    });
  }

  const pendingMetadata = {
    ...metadata,
    pending_action_before: pending.action,
    pending_source_message_id: pending.source_assistant_message_id,
  };

  if (isPendingExpired(pending, nowIso)) {
    return buildCollectInfoRoute(routeResult, {
      answer: "剛剛等待確認的內容已過期，我們重新確認一次。請告訴我最新的入住日期、人數與寵物需求。",
      reason: "pending_interaction_expired",
      metadata: {
        ...pendingMetadata,
        pending_resolution: "expired",
        action_executor_result: "pending_expired",
      },
      contextPatch: clearPendingPatch(),
    });
  }

  if (action === "reject_pending") {
    return buildCollectInfoRoute(routeResult, {
      answer: "好的，先不套用剛剛的資料。請告訴我正確的入住日期、人數或寵物需求。",
      reason: "pending_interaction_rejected",
      metadata: {
        ...pendingMetadata,
        pending_resolution: "rejected",
        action_executor_result: "pending_rejected",
      },
      contextPatch: clearPendingPatch(),
    });
  }

  const resumeAction = normalizeTurnAction(pending.resume_action) || "request_quote";
  const proposedValues = pending.proposed_values || {};
  const nextContext = normalizeConversationContext({
    ...context,
    ...(action === "confirm_pending" ? proposedValues : {}),
    pending_interaction: null,
  });
  const changedFields = getPricingRelevantChangedFields(context, nextContext);
  const resumedMetadata = {
    ...pendingMetadata,
    pending_resolution:
      action === "confirm_pending"
        ? "confirmed"
        : action === "modify_pending"
          ? "modified"
          : "answered",
    resumed_turn_action: resumeAction,
  };

  const resumedRoute = await executePricingAction({
    action: resumeAction,
    context: nextContext,
    previousContext: action === "confirm_pending" ? context : previousContext,
    recentMessages,
    routeResult,
    message,
    metadata: resumedMetadata,
    changedFields,
    freshnessGuard: null,
    nowIso,
    sourceMessageId,
  });

  const conversationContextPatch = {
    ...(action === "confirm_pending" ? proposedValues : {}),
    pending_interaction: null,
    ...(resumedRoute.conversationContextPatch || {}),
  };

  if (
    action === "confirm_pending" &&
    pending.action === "confirm_quote_dates" &&
    resumedRoute.route === "faq_collect_info"
  ) {
    const summary = buildConfirmedDateSummary(nextContext);
    const question = buildMissingFieldsQuestion(nextContext, "");
    return {
      ...resumedRoute,
      answer: summary && question ? `好的，已確認為${summary}。${question}` : resumedRoute.answer,
      notice: summary && question ? `好的，已確認為${summary}。${question}` : resumedRoute.notice,
      conversationContextPatch,
      semanticMetadata: {
        ...resumedMetadata,
        ...(resumedRoute.semanticMetadata || {}),
      },
    };
  }

  return {
    ...resumedRoute,
    conversationContextPatch,
    semanticMetadata: {
      ...resumedMetadata,
      ...(resumedRoute.semanticMetadata || {}),
    },
  };
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

function isPendingAction(action) {
  return [
    "confirm_pending",
    "reject_pending",
    "modify_pending",
    "answer_pending",
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
  nowIso,
  sourceMessageId,
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
    }, { nowIso, sourceMessageId });
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
      }, { nowIso, sourceMessageId });
    }

    if (!changedFields.length) {
      return buildMissingFieldsRoute(routeResult, context, {
        ...metadata,
        action_executor_result: "update_quote_without_changed_fields",
      }, { nowIso, sourceMessageId });
    }
  }

  if (
    ["request_quote", "update_quote"].includes(action) &&
    uncertainPricingFields.length
  ) {
    return buildFreshnessGuardRoute(routeResult, context, freshnessGuard, {
      ...metadata,
      uncertain_fields: uncertainPricingFields,
    }, { nowIso, sourceMessageId });
  }

  if (missingFields.length) {
    return buildMissingFieldsRoute(routeResult, context, {
      ...metadata,
      action_executor_result: `${action}_missing_fields`,
    }, { nowIso, sourceMessageId });
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
    }, { nowIso, sourceMessageId });
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
  nowIso = new Date().toISOString(),
  sourceMessageId = "",
} = {}) {
  const pendingInteraction = normalizePendingInteraction(context?.pending_interaction);
  const action = resolveAction({
    semanticResult,
    message,
    routeResult,
    context,
    previousContext,
    recentMessages,
    pendingInteraction,
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
    pending_action_before: pendingInteraction?.action || null,
    pending_source_message_id: pendingInteraction?.source_assistant_message_id || null,
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

  if (action === "reset_context") {
    return buildControlRoute(routeResult, {
      action,
      answer: "好的，我們重新開始。請問你想了解什麼呢？",
      reason: "turn_action_reset_context",
      contextPatch: buildResetContextPatch(),
      metadata: {
        ...metadata,
        pending_resolution: pendingInteraction ? "cleared_by_reset" : null,
        action_executor_result: "context_reset",
      },
    });
  }

  if (isPendingAction(action)) {
    return executePendingAction({
      action,
      pendingInteraction,
      context,
      previousContext,
      recentMessages,
      routeResult,
      message,
      metadata,
      nowIso,
      sourceMessageId,
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
      nowIso,
      sourceMessageId,
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
        pending_interaction: null,
      },
      metadata: {
        ...metadata,
        pending_resolution: pendingInteraction ? "cleared_by_switch_topic" : null,
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
