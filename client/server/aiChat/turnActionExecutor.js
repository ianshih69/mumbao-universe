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
import {
  isDeterministicPricingRequest,
} from "./pricingIntent.js";
import {
  normalizePendingResolutionAction,
  normalizeTurnAction,
  pendingResolutionToLegacyTurnAction,
  validateAndNormalizeSemanticTurn,
} from "./semanticOrchestrator.js";
import {
  classifyConfirmationProtocol,
  isPendingInteractionCurrent,
} from "./quoteDialogueState.js";

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
  infant_count: "未滿4歲幼兒人數",
  stay_nights: "住宿晚數",
  pricing_day_type: "日期類型",
  requires_exact_date: "確切入住日期",
  room_count: "需要幾間房",
  pet_count: "是否攜帶寵物",
  pet_type: "寵物種類",
  dog_weights: "每隻狗狗體重",
};

const pricingGuardFields = new Set([
  "stay_type",
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "infant_count",
  "stay_nights",
  "pricing_day_type",
  "requires_exact_date",
  "room_count",
  "pet_count",
  "pet_type",
  "dog_under_10kg_count",
  "dog_10_to_20kg_count",
  "dog_over_20kg_count",
  "breakfast_count",
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
  context = null,
}) {
  const scenario = normalizeConversationContext(context).quote_scenario;
  return {
    action,
    proposed_values: proposedValues,
    required_response_type: requiredResponseType,
    resume_action: resumeAction,
    ...(requiredFields.length ? { required_fields: requiredFields } : {}),
    source_assistant_message_id: sourceMessageId || null,
    scenario_id: scenario?.scenario_id || null,
    context_version: scenario?.context_version ?? null,
    asked_turn_id: sourceMessageId || null,
    expires_after_turns: 1,
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

function buildMissingFieldsQuestion(
  context,
  prefix = "收到",
  missingFieldsOverride = null
) {
  const missingFields = Array.isArray(missingFieldsOverride)
    ? missingFieldsOverride
    : getMissingBookingContextFields(context);
  const labels = expandMissingContextFields(missingFields)
    .map((field) => pricingFieldLabels[field])
    .filter(Boolean);
  if (!labels.length) return "";
  return `${prefix}請問${labels.join("、")}呢？`;
}

function buildConciseMissingFieldsQuestion(missingFields) {
  const missing = [...new Set(missingFields || [])];
  const labels = [];
  if (missing.includes("stay_period")) {
    labels.push("入住日期或日期類型與住宿晚數");
  } else {
    if (missing.includes("exact_date")) labels.push("確切入住日期與年份");
    if (missing.includes("check_in")) labels.push("入住日期");
    if (missing.includes("check_out")) labels.push("退房日期");
    if (missing.includes("stay_nights")) labels.push("住宿晚數");
    if (missing.includes("pricing_day_type")) labels.push("日期類型");
  }
  if (missing.includes("stay_type")) labels.push("想包棟或訂單間");
  if (missing.includes("guest_count")) {
    labels.push("成人與4～12歲兒童各有幾位");
  }
  if (missing.includes("dog_weights")) labels.push("每隻狗狗體重");
  return labels.length ? `請問${labels.join("、")}？` : "";
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
  const missingFields = Array.isArray(options.missingFields)
    ? options.missingFields
    : Array.isArray(metadata?.final_missing_fields)
      ? metadata.final_missing_fields
      : getMissingBookingContextFields(context);
  const conciseQuestion = buildConciseMissingFieldsQuestion(missingFields);
  const pendingInteraction = buildCollectQuoteFieldsPending({
    context,
    missingFields,
    resumeAction: metadata?.resumed_turn_action || metadata?.validated_turn_action || "request_quote",
    nowIso: options.nowIso || new Date().toISOString(),
    sourceMessageId: options.sourceMessageId || "",
  });
  const pendingPatch = pendingInteraction
    ? { pending_interaction: pendingInteraction }
    : null;
  const contextual = buildContextualKnowledgeRouteOverride(
    context,
    {
      ...routeResult,
      route: "knowledge_gap",
      answer: routeResult?.answer || "",
      notice: routeResult?.notice || "",
      answerMode: null,
      knowledgeGap: true,
      shouldMarkNeedsHuman: true,
    },
    { missingFields }
  );

  if (contextual) {
    return addExecutorMetadata(
      {
        ...routeResult,
        ...contextual,
        ...(conciseQuestion
          ? {
              answer: conciseQuestion,
              notice: conciseQuestion,
              answerMode: "collect_info",
              shouldMarkNeedsHuman: false,
              knowledgeGap: false,
            }
          : {}),
        reason: contextual.reason,
        conversationContextPatch: pendingPatch,
      },
      metadata
    );
  }

  return buildCollectInfoRoute(routeResult, {
    answer:
      conciseQuestion || "請問想了解房價、房況或其他住宿資訊呢？",
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
    } else if (field === "stay_period") {
      fields.push("check_in", "check_out", "stay_nights", "pricing_day_type");
    } else if (field === "exact_date") {
      fields.push("check_in");
    } else if (field === "dog_weights") {
      fields.push("dog_under_10kg_count", "dog_10_to_20kg_count", "dog_over_20kg_count");
    } else {
      fields.push(field);
    }
  }
  return [...new Set(fields.filter((field) => pricingGuardFields.has(field)))];
}

function getPendingRequiredFields(pendingInteraction) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending) return [];
  if (Array.isArray(pending.required_fields) && pending.required_fields.length) {
    return expandMissingContextFields(pending.required_fields);
  }
  return expandMissingContextFields(getMissingBookingContextFields(pending.proposed_values || {}));
}

function hasFilledPendingQuoteField({ pendingInteraction, context, previousContext, semanticResult }) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending || pending.action !== "collect_quote_fields") return false;
  const requiredFields = getPendingRequiredFields(pending);
  if (!requiredFields.length) return false;

  const before = normalizeConversationContext(previousContext);
  const after = normalizeConversationContext(context);
  const mentionedFields = new Set([
    ...(Array.isArray(semanticResult?.mentioned_fields) ? semanticResult.mentioned_fields : []),
    ...(Array.isArray(semanticResult?.clear_fields) ? semanticResult.clear_fields : []),
  ]);

  return requiredFields.some((field) => {
    if (mentionedFields.has(field)) return true;
    const beforeValue = before[field];
    const afterValue = after[field];
    return (
      afterValue !== null &&
      afterValue !== undefined &&
      afterValue !== "" &&
      beforeValue !== afterValue
    );
  });
}

function shouldInterruptPendingQuote({
  pendingInteraction,
  routeResult,
  message,
  context,
  previousContext,
  recentMessages,
  semanticResult,
}) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending || pending.action !== "collect_quote_fields") return false;
  if (
    hasFilledPendingQuoteField({
      pendingInteraction: pending,
      context,
      previousContext,
      semanticResult,
    })
  ) {
    return false;
  }

  if (["faq_direct", "faq_collect_info", "ask_human"].includes(routeResult?.route)) {
    return true;
  }

  return (
    routeResult?.route === "faq_selector_required" &&
    !isDeterministicPricingRequest(message, {
      context,
      previousContext,
      recentMessages,
    })
  );
}

function shouldDeferWeakPricingActionToFaqSelector({
  action,
  routeResult,
  message,
  context,
  previousContext,
  recentMessages,
  trustedDeterministicSemantic,
}) {
  if (trustedDeterministicSemantic) return false;

  return (
    routeResult?.route === "faq_selector_required" &&
    ["request_quote", "update_quote"].includes(action) &&
    !isDeterministicPricingRequest(message, {
      context,
      previousContext,
      recentMessages,
    })
  );
}

function buildCollectQuoteFieldsPending({
  context,
  missingFields,
  resumeAction,
  nowIso,
  sourceMessageId,
}) {
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
    context,
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
        context: state,
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
      legacy_guest_adjustment_formatter_invoked:
        uncertainFields.includes("guest_count"),
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

function hasProtocolAffirmation(message) {
  return classifyConfirmationProtocol(message) === "confirm";
}

function hasProtocolRejection(message) {
  return classifyConfirmationProtocol(message) === "reject";
}

function hasPendingProposalConflict({ pendingInteraction, context }) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending) return false;
  const state = normalizeConversationContext(context);
  for (const [field, proposedValue] of Object.entries(pending.proposed_values || {})) {
    if (!pricingGuardFields.has(field)) continue;
    const currentValue = state[field];
    if (currentValue !== null && currentValue !== undefined && currentValue !== proposedValue) {
      return true;
    }
  }
  return false;
}

function inferPendingProtocolResolution({ pendingInteraction, message, context }) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending) return null;

  if (pending.required_response_type === "confirmation") {
    if (hasProtocolRejection(message) || hasPendingProposalConflict({ pendingInteraction: pending, context })) {
      return "modify";
    }
    if (hasProtocolAffirmation(message)) {
      return "confirm";
    }
    return "answer_field";
  }

  if (pending.required_response_type === "fields") {
    return "answer_field";
  }

  return "answer_field";
}

function buildResolvedContextSummary(context) {
  const state = normalizeConversationContext(context);
  const parts = [];
  if (state.active_intent) parts.push(`intent:${state.active_intent}`);
  if (state.current_topic) parts.push(`topic:${state.current_topic}`);
  if (state.stay_type) parts.push(`stay_type:${state.stay_type}`);
  if (state.check_in) parts.push(`check_in:${state.check_in}`);
  if (state.check_out) parts.push(`check_out:${state.check_out}`);
  if (state.guest_count !== null) parts.push(`guest_count:${state.guest_count}`);
  if (state.adult_count !== null) parts.push(`adult_count:${state.adult_count}`);
  if (state.child_count !== null) parts.push(`child_count:${state.child_count}`);
  if (state.room_count !== null) parts.push(`room_count:${state.room_count}`);
  if (state.pet_count !== null) parts.push(`pet_count:${state.pet_count}`);
  if (state.pet_type) parts.push(`pet_type:${state.pet_type}`);
  return parts.join("; ");
}

function buildPendingConfirmationReply(context, pendingInteraction) {
  const state = normalizeConversationContext(context);
  const pending = normalizePendingInteraction(pendingInteraction);
  const proposed = pending?.proposed_values || {};
  const parts = [];
  if (state.guest_count !== null) parts.push(`入住人數為${state.guest_count}位`);
  if (state.pet_count !== null) {
    parts.push(state.pet_count === 0 ? "不攜帶寵物" : `會攜帶${state.pet_count}隻寵物`);
  }
  const acknowledged = parts.length ? `收到，${parts.join("，")}。` : "收到。";
  if (proposed.check_in && proposed.check_out) {
    return `${acknowledged}請問日期是${formatDisplayDate(
      proposed.check_in
    )}入住、${formatDisplayDate(proposed.check_out)}退房嗎？`;
  }
  return `${acknowledged}請問剛才慢寶整理的資訊是否正確呢？`;
}

function resolveTurnState({
  semanticResult,
  message,
  routeResult,
  context,
  previousContext,
  recentMessages,
  pendingInteraction,
  nowIso,
}) {
  const normalizedPending = normalizePendingInteraction(pendingInteraction);
  const stalePendingInteraction = Boolean(
    normalizedPending &&
      !isPendingInteractionCurrent(context, normalizedPending),
  );
  const pending = stalePendingInteraction ? null : normalizedPending;
  const hasSemanticSignal = Boolean(
    normalizeTurnAction(semanticResult?.turn_action) ||
      normalizePendingResolutionAction(semanticResult?.pending_resolution_action)
  );
  const normalizedSemanticTurn = hasSemanticSignal
    ? validateAndNormalizeSemanticTurn({
        semanticResult,
        pendingInteraction: pending,
        currentMessage: message,
        deterministicPatch: semanticResult?.context_patch,
      })
    : null;
  const normalizedSemanticResult = normalizedSemanticTurn?.semanticResult || null;
  const semanticAction = normalizeTurnAction(normalizedSemanticResult?.turn_action);
  const semanticPendingResolution = normalizePendingResolutionAction(
    normalizedSemanticResult?.pending_resolution_action
  );
  const protocolPendingResolution =
    semanticPendingResolution && semanticPendingResolution !== "none"
      ? null
      : inferPendingProtocolResolution({ pendingInteraction: pending, message, context });
  const resolvedPendingResolution =
    semanticPendingResolution && semanticPendingResolution !== "none"
      ? semanticPendingResolution
      : protocolPendingResolution || "none";
  const pendingExecutorAction = pendingResolutionToLegacyTurnAction(
    resolvedPendingResolution
  );
  const fallbackAction =
    pendingExecutorAction ||
    semanticAction ||
    inferFallbackTurnAction({
      message,
      routeResult,
      context,
      previousContext,
      recentMessages,
    });
  const resolvedTurnAction = normalizeTurnAction(fallbackAction) || fallbackAction;
  const businessTurnAction =
    pendingExecutorAction
      ? semanticAction || normalizeTurnAction(pending?.resume_action) || "request_quote"
      : resolvedTurnAction;
  const proposedValues = pending?.proposed_values || {};
  const shouldApplyPendingProposal =
    resolvedPendingResolution === "confirm" &&
    pending &&
    !isPendingExpired(pending, nowIso);
  const shouldKeepConfirmationPending =
    pending &&
    pending.required_response_type === "confirmation" &&
    resolvedPendingResolution === "answer_field";
  const resolvedContext = normalizeConversationContext({
    ...context,
    ...(stalePendingInteraction ? { pending_interaction: null } : {}),
    ...(shouldApplyPendingProposal ? proposedValues : {}),
    ...(pending && isPendingAction(resolvedTurnAction) && !shouldKeepConfirmationPending
      ? { pending_interaction: null }
      : {}),
  });
  const finalMissingFields = isPricingAction(resolvedTurnAction) || isPendingAction(resolvedTurnAction)
    ? getMissingBookingContextFields(resolvedContext)
    : [];

  return {
    resolvedContext,
    resolvedPendingInteraction: pending,
    stalePendingInteraction,
    resolvedTurnAction,
    businessTurnAction,
    normalizedSemanticResult,
    pendingProtocolFallback: protocolPendingResolution,
    normalizedPendingResolution: resolvedPendingResolution,
    pendingProtocolNormalizationReason:
      normalizedSemanticResult?.pending_protocol_normalization_reason || "",
    semanticValidationErrors: normalizedSemanticResult?.semantic_validation_errors || [],
    resumedTurnAction:
      pending && isPendingAction(resolvedTurnAction)
        ? normalizeTurnAction(pending.resume_action) || semanticAction || "request_quote"
        : null,
    pendingResolution:
      resolvedPendingResolution === "confirm"
        ? "confirmed"
        : resolvedPendingResolution === "reject"
          ? "rejected"
          : resolvedPendingResolution === "modify"
            ? "modified"
            : resolvedPendingResolution === "answer_field"
              ? "answered"
              : resolvedPendingResolution === "unrelated"
                ? "unrelated"
                : null,
    changedFields: getPricingRelevantChangedFields(previousContext, resolvedContext),
    finalMissingFields,
    resolvedContextSummary: buildResolvedContextSummary(resolvedContext),
  };
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
  pricingOptions,
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

  if (
    action === "answer_pending" &&
    pending.required_response_type === "confirmation"
  ) {
    const answer = buildPendingConfirmationReply(context, pending);
    return buildCollectInfoRoute(routeResult, {
      answer,
      reason: "pending_confirmation_field_answered",
      metadata: {
        ...pendingMetadata,
        pending_resolution: "answered",
        action_executor_result: "pending_confirmation_field_answered",
      },
      contextPatch: { pending_interaction: pending },
    });
  }

  const resumeAction = normalizeTurnAction(pending.resume_action) || "request_quote";
  const proposedValues = pending.proposed_values || {};
  const currentScenario = normalizeConversationContext(context).quote_scenario;
  const confirmedScenario =
    action === "confirm_pending" && currentScenario
      ? {
          ...currentScenario,
          context_version: currentScenario.context_version + 1,
        }
      : currentScenario;
  const nextContext = normalizeConversationContext({
    ...context,
    ...(action === "confirm_pending" ? proposedValues : {}),
    ...(confirmedScenario ? { quote_scenario: confirmedScenario } : {}),
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
    pricingOptions,
  });

  const conversationContextPatch = {
    ...(action === "confirm_pending" ? proposedValues : {}),
    ...(confirmedScenario ? { quote_scenario: confirmedScenario } : {}),
    pending_interaction: null,
    ...(resumedRoute.conversationContextPatch || {}),
  };

  if (
    action === "confirm_pending" &&
    pending.action === "confirm_quote_dates" &&
    resumedRoute.route === "faq_collect_info"
  ) {
    const summary = buildConfirmedDateSummary(nextContext);
    const question = buildMissingFieldsQuestion(
      nextContext,
      "",
      resumedRoute.semanticMetadata?.final_missing_fields ||
        resumedMetadata.final_missing_fields
    );
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
  pricingOptions,
  slotFillCompletion,
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

  const pricingRoute = await buildOfficialPricingRouteOverride(context, routeResult, {
    message,
    recentMessages,
    previousContext,
    turnAction: action,
    slotFillCompletion,
    ...(pricingOptions || {}),
  });

  if (pricingRoute) {
    return addExecutorMetadata(pricingRoute, {
      ...metadata,
      action_executor_result: `${action}_pricing_resolved`,
      pricing_called: pricingRoute.semanticMetadata?.pricing_called ?? true,
    });
  }

  if (missingFields.length) {
    return buildMissingFieldsRoute(routeResult, context, {
      ...metadata,
      action_executor_result: `${action}_missing_fields`,
    }, { nowIso, sourceMessageId });
  }

  return buildMissingFieldsRoute(routeResult, context, {
    ...metadata,
    action_executor_result: `${action}_pricing_unresolved`,
    pricing_called: true,
  }, { nowIso, sourceMessageId });
}

export async function executeTurnAction({
  message,
  semanticResult = null,
  trustedDeterministicSemantic = false,
  routeResult,
  context,
  previousContext,
  recentMessages = [],
  freshnessGuard = null,
  nowIso = new Date().toISOString(),
  sourceMessageId = "",
  pricingOptions = {},
  slotFillCompletion = null,
} = {}) {
  const currentPending = normalizePendingInteraction(context?.pending_interaction);
  const previousPending = normalizePendingInteraction(
    previousContext?.pending_interaction,
  );
  const usePreviousConfirmation = Boolean(
    previousPending?.required_response_type === "confirmation" &&
      classifyConfirmationProtocol(message) !== "none",
  );
  const pendingInteraction = usePreviousConfirmation
    ? previousPending
    : currentPending;
  const contextForResolution = usePreviousConfirmation
    ? {
        ...context,
        quote_scenario: previousContext?.quote_scenario || null,
        pending_interaction: previousPending,
      }
    : context;
  const resolvedTurnState = resolveTurnState({
    semanticResult,
    message,
    routeResult,
    context: contextForResolution,
    previousContext,
    recentMessages,
    pendingInteraction,
    nowIso,
  });
  const action = resolvedTurnState.resolvedTurnAction;
  const executorContext = resolvedTurnState.resolvedContext;
  const changedFields = resolvedTurnState.changedFields;
  const normalizedSemanticResult = resolvedTurnState.normalizedSemanticResult;
  const metadata = {
    ...(semanticResult?.semantic_turn_action_raw || semanticResult?.turn_action
      ? {
          semantic_turn_action_raw:
            semanticResult.semantic_turn_action_raw || semanticResult.turn_action,
        }
      : {}),
    ...(semanticResult?.semantic_pending_resolution_raw ||
    semanticResult?.pending_resolution_action
      ? {
          semantic_pending_resolution_raw:
            semanticResult.semantic_pending_resolution_raw ||
            semanticResult.pending_resolution_action,
        }
      : {}),
    ...(normalizedSemanticResult?.turn_action
      ? { semantic_turn_action: normalizedSemanticResult.turn_action }
      : {}),
    validated_turn_action: resolvedTurnState.businessTurnAction,
    pending_executor_action: isPendingAction(action) ? action : null,
    normalized_pending_resolution: resolvedTurnState.normalizedPendingResolution,
    pending_protocol_normalization_reason:
      resolvedTurnState.pendingProtocolNormalizationReason,
    ...(resolvedTurnState.semanticValidationErrors?.length
      ? { semantic_validation_errors: resolvedTurnState.semanticValidationErrors }
      : {}),
    turn_action_validator_result: normalizeTurnAction(action) ? "accepted" : "rejected",
    mentioned_fields: freshnessGuard?.mentioned_fields || semanticResult?.mentioned_fields || [],
    uncertain_fields: freshnessGuard?.uncertain_fields || semanticResult?.uncertain_fields || [],
    changed_fields: changedFields,
    freshness_guard_result: freshnessGuard?.freshness_guard_result || "not_applied",
    stale_fields_blocked: freshnessGuard?.stale_fields_blocked || [],
    pending_action_before: pendingInteraction?.action || null,
    pending_source_message_id: pendingInteraction?.source_assistant_message_id || null,
    ...(resolvedTurnState.pendingProtocolFallback
      ? { pending_protocol_fallback: resolvedTurnState.pendingProtocolFallback }
      : {}),
    ...(resolvedTurnState.pendingResolution
      ? { pending_resolution: resolvedTurnState.pendingResolution }
      : {}),
    ...(resolvedTurnState.resumedTurnAction
      ? { resumed_turn_action: resolvedTurnState.resumedTurnAction }
      : {}),
    resolved_context_summary: resolvedTurnState.resolvedContextSummary,
    final_missing_fields: resolvedTurnState.finalMissingFields,
    uses_relative_date:
      freshnessGuard?.uses_relative_date || semanticResult?.uses_relative_date || false,
    pricing_called: false,
    pending_slot_fill_existed: Boolean(slotFillCompletion),
    pending_slot_fill_consumed: slotFillCompletion?.status === "completed",
    pending_transaction_id: slotFillCompletion?.transaction_id || null,
  };

  if (resolvedTurnState.stalePendingInteraction) {
    return buildCollectInfoRoute(routeResult, {
      answer: "剛才的確認已失效，請重新提供要確認的資料。",
      reason: "pending_interaction_scenario_stale",
      metadata: {
        ...metadata,
        pending_resolution: "stale",
        action_executor_result: "pending_stale_cleared",
      },
      contextPatch: clearPendingPatch(),
    });
  }

  if (!normalizeTurnAction(action)) {
    return addExecutorMetadata(routeResult, {
      ...metadata,
      validated_turn_action: "knowledge_gap",
      turn_action_validator_result: "rejected",
      action_executor_result: "invalid_turn_action",
    });
  }

  if (
    shouldInterruptPendingQuote({
      pendingInteraction,
      routeResult,
      message,
      context: executorContext,
      previousContext,
      recentMessages,
      semanticResult: normalizedSemanticResult,
    })
  ) {
    return addExecutorMetadata(
      {
        ...routeResult,
        conversationContextPatch: clearPendingPatch(),
      },
      {
        ...metadata,
        pending_resolution: "interrupted",
        action_executor_result: "pending_quote_interrupted_by_faq_route",
      }
    );
  }

  if (
    shouldDeferWeakPricingActionToFaqSelector({
      action,
      routeResult,
      message,
      context: executorContext,
      previousContext,
      recentMessages,
      trustedDeterministicSemantic,
    })
  ) {
    return addExecutorMetadata(routeResult, {
      ...metadata,
      action_executor_result: "faq_selector_deferred_weak_pricing_action",
      pricing_called: false,
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
      context: executorContext,
      previousContext,
      recentMessages,
      routeResult,
      message,
      metadata,
      nowIso,
      sourceMessageId,
      pricingOptions,
      slotFillCompletion,
    });
  }

  if (isPricingAction(action)) {
    return executePricingAction({
      action,
      context: executorContext,
      previousContext,
      recentMessages,
      routeResult,
      message,
      metadata,
      changedFields,
      freshnessGuard,
      nowIso,
      sourceMessageId,
      pricingOptions,
      slotFillCompletion,
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
