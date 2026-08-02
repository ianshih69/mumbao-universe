import {
  buildContextualKnowledgeGapReply,
  buildContextualKnowledgeRouteOverride,
  getConversationContextForStorage,
  getMissingBookingContextFields,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  buildDeepSeekRequestPayload,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import {
  isApprovedActiveFaqItem,
  normalizeAnswerMode,
} from "./faqRetrieval.js";
import { knowledgeGapNotice } from "./knowledgeRouter.js";

const semanticContextFields = new Set([
  "active_intent",
  "current_topic",
  "stay_type",
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "pet_count",
  "pet_type",
  "room_count",
]);

const numericContextFields = new Set([
  "guest_count",
  "adult_count",
  "child_count",
  "pet_count",
  "room_count",
]);

const allowedRoutes = new Set([
  "grounded_reply",
  "collect_info",
  "knowledge_gap",
  "human_takeover",
]);

const allowedIntents = new Set([
  "pricing",
  "booking",
  "availability",
  "facilities",
  "pet_policy",
  "house_rules",
  "payment",
  "refund",
  "general",
  "human_support",
  "unknown",
]);

const safeLocalRoutes = new Set([
  "local_intent",
  "ask_human",
  "scope_guard",
  "human_takeover",
]);

const highRiskTerms = [
  "價格",
  "房價",
  "包棟價",
  "費用",
  "多少錢",
  "總共多少",
  "報價",
  "房況",
  "空房",
  "訂金",
  "付款",
  "退款",
  "取消",
  "押金",
  "寵物費",
  "加人費",
  "訂房成立",
  "稅",
  "法律",
  "安全承諾",
];

const explicitExternalScopeTerms = [
  "股票",
  "投資",
  "基金",
  "加密貨幣",
  "政治",
  "新聞",
  "總統",
  "選舉",
  "寫程式",
  "程式碼",
  "python",
  "javascript",
  "數學",
  "算命",
  "占卜",
  "塔羅",
  "法律",
  "醫療",
];

const localCommandPattern =
  /^(?:我要)?(?:人工客服|真人客服|找管家|重新開始|開始新對話|關閉對話)$/;
const followUpOrCorrectionPattern =
  /^(?:那|這樣|所以|剛剛|前面|上面|改成|改為|日期改|不是|不帶|沒有|無|可能|再多|總共|多少)/;
const collectInfoCuePattern =
  /請.{0,8}提供|入住日期|日期|人數|幾位|寵物|包棟|單間|房價|價格|費用/;
const priceLikePattern =
  /(?:NT\$|nt\$|\$)\s*\d|(?:新台幣|台幣)?\s*\d[\d,]*(?:\s*元|塊)|\d+\s*%/;

function normalizeCompact(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hasMultipleQuestionParts(message) {
  const text = String(message || "");
  const questionMarkCount = (text.match(/[?？]/g) || []).length;
  return (
    questionMarkCount > 1 ||
    /以及|還有|另外|順便|跟|和|與|、|並且/.test(text)
  );
}

function hasPricingContext(context) {
  const state = normalizeConversationContext(context);
  return (
    state.active_intent === "pricing" ||
    state.current_topic === "booking_price"
  );
}

function hasConversationStayContext(context) {
  const state = normalizeConversationContext(context);
  return Boolean(
    state.active_intent ||
      state.current_topic ||
      state.stay_type ||
      state.check_in ||
      state.check_out ||
      state.guest_count !== null ||
      state.adult_count !== null ||
      state.child_count !== null ||
      state.pet_count !== null ||
      state.room_count !== null
  );
}

function hasHighRiskText(message, routeResult) {
  const text = normalizeCompact(
    [
      message,
      routeResult?.answer,
      ...(routeResult?.matchedFaqItems || []).flatMap((item) => [
        item?.category,
        item?.question,
        item?.answer,
        ...(Array.isArray(item?.keywords) ? item.keywords : []),
      ]),
    ]
      .filter(Boolean)
      .join("\n")
  );

  return includesAny(text, highRiskTerms.map(normalizeCompact));
}

function isFollowUpOrCorrection(message) {
  const compact = normalizeCompact(message);
  return followUpOrCorrectionPattern.test(compact);
}

function isGenericCollectInfoAnswer(routeResult) {
  const text = [
    routeResult?.answer,
    routeResult?.notice,
    ...(routeResult?.matchedFaqItems || []).flatMap((item) => [
      item?.question,
      item?.answer,
      ...(Array.isArray(item?.keywords) ? item.keywords : []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  return collectInfoCuePattern.test(text);
}

export function getSemanticRouterMode(value = process.env.AI_SEMANTIC_ROUTER_MODE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "legacy";
  if (normalized === "hybrid" || normalized === "shadow" || normalized === "legacy") {
    return normalized;
  }
  return "legacy";
}

export function isSafeLocalKnowledgeRoute({ message, routeResult, context }) {
  const route = String(routeResult?.route || "");
  const answerMode = normalizeAnswerMode(routeResult?.answerMode);
  const matchedFaqItems = Array.isArray(routeResult?.matchedFaqItems)
    ? routeResult.matchedFaqItems
    : [];
  const compactMessage = normalizeCompact(message);

  if (localCommandPattern.test(compactMessage)) {
    return true;
  }

  if (route === "scope_guard") {
    const externalScope = includesAny(
      compactMessage,
      explicitExternalScopeTerms.map(normalizeCompact)
    );
    return externalScope && !hasConversationStayContext(context);
  }

  if (safeLocalRoutes.has(route)) {
    return true;
  }

  if (route !== "faq_direct") {
    return false;
  }

  return (
    matchedFaqItems.length === 1 &&
    routeResult?.confidence === "high" &&
    answerMode === "direct" &&
    routeResult?.reason === "single_high_confidence_direct_faq" &&
    !hasPricingContext(context) &&
    !isFollowUpOrCorrection(message) &&
    !hasMultipleQuestionParts(message) &&
    !hasHighRiskText(message, routeResult) &&
    !isGenericCollectInfoAnswer(routeResult)
  );
}

export function shouldUseSemanticOrchestrator({
  mode,
  message,
  routeResult,
  context,
}) {
  const semanticMode = getSemanticRouterMode(mode);
  if (semanticMode === "legacy") return false;
  return !isSafeLocalKnowledgeRoute({ message, routeResult, context });
}

export function limitSemanticRecentMessages(recentMessages) {
  return (Array.isArray(recentMessages) ? recentMessages : [])
    .slice(-12)
    .map((message) => ({
      sender: message?.sender === "user" ? "user" : "assistant",
      message: String(message?.message || "").slice(0, 500),
    }))
    .filter((message) => message.message.trim());
}

export function limitSemanticFaqItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        isApprovedActiveFaqItem(item) ||
        (!("is_active" in Object(item)) &&
          !("status" in Object(item)) &&
          Boolean(String(item?.id || "").trim()) &&
          Boolean(String(item?.question || "").trim()) &&
          Boolean(String(item?.answer || "").trim()))
    )
    .slice(0, 5)
    .map((item) => ({
      id: String(item.id || ""),
      category: String(item.category || ""),
      question: String(item.question || ""),
      answer: String(item.answer || ""),
      answer_mode: normalizeAnswerMode(item.answer_mode),
    }))
    .filter((item) => item.id && item.question && item.answer);
}

export function buildSemanticRetrievalText({ message, context, recentMessages }) {
  const state = normalizeConversationContext(context);
  const segments = [];

  if (state.active_intent === "pricing") segments.push("查詢住宿價格");
  if (state.current_topic === "booking_price") segments.push("訂房價格需求");
  if (state.stay_type === "villa") segments.push("包棟");
  if (state.stay_type === "room") segments.push("單間");
  if (state.check_in) segments.push(`${state.check_in}入住`);
  if (state.check_out) segments.push(`${state.check_out}退房`);
  if (state.guest_count !== null) segments.push(`${state.guest_count}人`);
  if (state.adult_count !== null) segments.push(`${state.adult_count}大人`);
  if (state.child_count !== null) segments.push(`${state.child_count}小孩`);
  if (state.pet_count !== null) {
    segments.push(
      state.pet_count === 0
        ? "不帶寵物"
        : `${state.pet_count}隻${state.pet_type === "dog" ? "狗" : "寵物"}`
    );
  }

  const recentUserMessages = (Array.isArray(recentMessages) ? recentMessages : [])
    .filter((item) => String(item?.sender || "").toLowerCase() === "user")
    .slice(-2)
    .map((item) => String(item?.message || "").trim())
    .filter(Boolean);

  return [...segments, ...recentUserMessages, `客人原句：${message}`]
    .filter(Boolean)
    .join("；");
}

function buildSemanticSystemInstruction() {
  return `你是慢慢蒔光 AI 客服的語意理解器。你只能輸出一個 JSON object，不可輸出 markdown 或解釋。

任務：
1. 理解客人訊息是否承接目前 conversation_context。
2. 抽取客人明確新增或修改的住宿需求條件。
3. 只從提供的 FAQ 候選中選擇 selected_faq_ids。
4. 產生繁體中文 reply_draft，但只能使用提供 FAQ 中明確寫出的民宿事實。

不可自行推測或發明價格、房況、訂金、付款、退款、押金、寵物費、加人費或訂房是否成立。

輸出 schema：
{
  "intent": "pricing|booking|availability|facilities|pet_policy|house_rules|payment|refund|general|human_support|unknown",
  "topic": "string",
  "is_follow_up": true,
  "context_patch": {},
  "clear_fields": [],
  "selected_faq_ids": [],
  "missing_fields": [],
  "route": "grounded_reply|collect_info|knowledge_gap|human_takeover",
  "needs_human": false,
  "reply_draft": "string",
  "confidence": 0.0
}

context_patch 只可使用這些欄位：
active_intent,current_topic,stay_type,check_in,check_out,guest_count,adult_count,child_count,pet_count,pet_type,room_count

需要清除舊值時只使用 clear_fields，不要用 null 代表未提到。`;
}

export function buildSemanticMessages({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
}) {
  return [
    {
      role: "system",
      content: buildSemanticSystemInstruction(),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          current_date: dateInfo?.currentDate || "",
          timezone: dateInfo?.timeZone || "Asia/Taipei",
          conversation_context: normalizeConversationContext(context),
          recent_messages: limitSemanticRecentMessages(recentMessages),
          current_message: String(message || ""),
          faq_candidates: limitSemanticFaqItems(faqItems),
          strict_rules: [
            "FAQ and approved database facts are the only trusted lodging facts.",
            "Do not invent prices, availability, fees, payment, refund or booking confirmation.",
            "Use selected_faq_ids only from faq_candidates.",
          ],
        },
        null,
        2
      ),
    },
  ];
}

function getDeepSeekConfig() {
  const aiMode = process.env.AI_MODE || "cloud_only";
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (aiMode !== "cloud_only") {
    throw new Error(`Unsupported AI_MODE: ${aiMode}`);
  }

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }

  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  };
}

function parseJsonObject(text) {
  const trimmed = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("semantic_orchestrator_invalid_json");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function isCheckoutAfterCheckin(checkIn, checkOut) {
  if (!checkIn || !checkOut) return true;
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return false;
  return Date.parse(`${checkOut}T00:00:00Z`) > Date.parse(`${checkIn}T00:00:00Z`);
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return number;
}

function validateContextPatch(value) {
  const patch = {};
  const rejectedFields = [];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { patch, rejectedFields };
  }

  for (const [field, rawValue] of Object.entries(value)) {
    if (!semanticContextFields.has(field)) {
      rejectedFields.push(field);
      continue;
    }

    if (numericContextFields.has(field)) {
      const integer = normalizeInteger(rawValue);
      if (integer === null) {
        rejectedFields.push(field);
        continue;
      }
      patch[field] = integer;
      continue;
    }

    if (field === "check_in" || field === "check_out") {
      if (!isIsoDate(rawValue)) {
        rejectedFields.push(field);
        continue;
      }
      patch[field] = String(rawValue);
      continue;
    }

    if (field === "stay_type" && !["villa", "room"].includes(String(rawValue))) {
      rejectedFields.push(field);
      continue;
    }

    if (
      field === "active_intent" &&
      !allowedIntents.has(String(rawValue || "unknown"))
    ) {
      rejectedFields.push(field);
      continue;
    }

    if (
      field === "pet_type" &&
      !["dog", "cat", "pet"].includes(String(rawValue))
    ) {
      rejectedFields.push(field);
      continue;
    }

    patch[field] = String(rawValue || "").trim().slice(0, 80);
  }

  if (!isCheckoutAfterCheckin(patch.check_in, patch.check_out)) {
    rejectedFields.push("check_out");
    delete patch.check_out;
  }

  return { patch, rejectedFields };
}

function normalizeClearFields(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((field) => semanticContextFields.has(String(field)));
}

function normalizeSelectedFaqIds(value, faqItems) {
  if (!Array.isArray(value)) {
    return { selectedFaqIds: [], invalidFaqIds: [] };
  }

  const candidateIds = new Set(limitSemanticFaqItems(faqItems).map((item) => item.id));
  const selectedFaqIds = [];
  const invalidFaqIds = [];

  for (const id of value.map((entry) => String(entry || "").trim()).filter(Boolean)) {
    if (candidateIds.has(id)) {
      if (!selectedFaqIds.includes(id)) selectedFaqIds.push(id);
    } else {
      invalidFaqIds.push(id);
    }
  }

  return { selectedFaqIds, invalidFaqIds };
}

export function validateSemanticResult(rawValue, { faqItems = [] } = {}) {
  const value =
    typeof rawValue === "string" ? parseJsonObject(rawValue) : rawValue || {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("semantic_orchestrator_invalid_json");
  }

  const route = String(value.route || "").trim();
  const intent = String(value.intent || "unknown").trim();
  if (!allowedRoutes.has(route)) {
    throw new Error("semantic_orchestrator_invalid_route");
  }
  if (!allowedIntents.has(intent)) {
    throw new Error("semantic_orchestrator_invalid_intent");
  }

  const { patch, rejectedFields } = validateContextPatch(value.context_patch);
  const clearFields = normalizeClearFields(value.clear_fields);
  const { selectedFaqIds, invalidFaqIds } = normalizeSelectedFaqIds(
    value.selected_faq_ids,
    faqItems
  );

  if (invalidFaqIds.length) {
    throw new Error("semantic_orchestrator_invalid_faq_id");
  }

  return {
    intent,
    topic: String(value.topic || "").trim().slice(0, 80),
    is_follow_up: Boolean(value.is_follow_up),
    context_patch: patch,
    clear_fields: clearFields,
    rejected_fields: rejectedFields,
    selected_faq_ids: selectedFaqIds,
    missing_fields: Array.isArray(value.missing_fields)
      ? value.missing_fields.map((field) => String(field || "").trim()).filter(Boolean)
      : [],
    route,
    needs_human: Boolean(value.needs_human),
    reply_draft: String(value.reply_draft || "").trim().slice(0, 900),
    confidence: Math.max(0, Math.min(Number(value.confidence || 0), 1)),
  };
}

export function mergeSemanticContext(baseContext, semanticResult, nowIso = new Date().toISOString()) {
  const context = normalizeConversationContext(baseContext);

  for (const field of semanticResult.clear_fields || []) {
    if (semanticContextFields.has(field)) {
      context[field] = null;
    }
  }

  const merged = getConversationContextForStorage({
    ...context,
    ...(semanticResult.context_patch || {}),
  });
  const changed =
    JSON.stringify(getConversationContextForStorage(baseContext)) !==
    JSON.stringify(merged);

  if (changed) {
    merged.last_updated_at = nowIso;
  }

  return {
    context: merged,
    changed,
  };
}

function getSelectedFaqItems(semanticResult, faqItems) {
  const ids = new Set(semanticResult.selected_faq_ids || []);
  return limitSemanticFaqItems(faqItems).filter((item) => ids.has(item.id));
}

function hasUnsupportedPriceDraft(replyDraft, selectedFaqItems) {
  const draft = String(replyDraft || "");
  if (!priceLikePattern.test(draft)) return false;

  const selectedText = selectedFaqItems
    .map((item) => `${item.question}\n${item.answer}`)
    .join("\n");
  const facts = normalizeCompact(selectedText);
  const numericFacts = draft.match(priceLikePattern) || [];

  return numericFacts.some((match) => !facts.includes(normalizeCompact(match)));
}

function hasInsufficientPricingGrounding(context, selectedFaqItems) {
  if (!hasPricingContext(context)) return false;
  const selectedText = selectedFaqItems
    .map((item) => `${item.question}\n${item.answer}`)
    .join("\n");

  return (
    !priceLikePattern.test(selectedText) ||
    selectedFaqItems.some(
      (item) =>
        normalizeAnswerMode(item.answer_mode) === "collect_info" ||
        collectInfoCuePattern.test(`${item.question}\n${item.answer}`)
    )
  );
}

function addSemanticRouteMetadata(routeResult, metadata) {
  return {
    ...routeResult,
    semanticMetadata: {
      ...(routeResult.semanticMetadata || {}),
      ...metadata,
    },
    modelCalled: true,
    modelCallCount: 1,
  };
}

export function buildSemanticKnowledgeRoute({
  semanticResult,
  context,
  faqItems,
  fallbackRoute,
  metadata = {},
}) {
  const selectedFaqItems = getSelectedFaqItems(semanticResult, faqItems);
  const pricingContext = hasPricingContext(context);
  const missingFields = pricingContext
    ? getMissingBookingContextFields(context)
    : [];
  const baseRoute = {
    ...fallbackRoute,
    route:
      semanticResult.route === "grounded_reply"
        ? "semantic_grounded"
        : semanticResult.route,
    providerUsed: "deepseek_semantic",
    matchedFaqItems: selectedFaqItems,
    matchedFaqIds: selectedFaqItems.map((item) => item.id),
    answerMode: selectedFaqItems[0]?.answer_mode || "",
    shouldCallDeepSeek: false,
    aiSkipped: false,
    knowledgeGap: false,
    shouldMarkNeedsHuman: false,
    reason: "semantic_orchestrator",
  };

  const contextualOverride = buildContextualKnowledgeRouteOverride(context, {
    ...baseRoute,
    route: missingFields.length ? "faq_collect_info" : "knowledge_gap",
    answer: semanticResult.reply_draft,
    notice: semanticResult.reply_draft,
    answerMode: missingFields.length ? "collect_info" : null,
    knowledgeGap: !missingFields.length,
    shouldMarkNeedsHuman: !missingFields.length,
    matchedFaqItems: selectedFaqItems,
  });

  if (contextualOverride && (missingFields.length || semanticResult.route !== "grounded_reply")) {
    return addSemanticRouteMetadata(
      {
        ...baseRoute,
        ...contextualOverride,
        providerUsed: "deepseek_semantic",
      },
      metadata
    );
  }

  if (
    semanticResult.route === "human_takeover" ||
    semanticResult.route === "knowledge_gap" ||
    semanticResult.needs_human ||
    !selectedFaqItems.length ||
    hasUnsupportedPriceDraft(semanticResult.reply_draft, selectedFaqItems) ||
    hasInsufficientPricingGrounding(context, selectedFaqItems)
  ) {
    const answer =
      (pricingContext && buildContextualKnowledgeGapReply(context)) ||
      semanticResult.reply_draft ||
      knowledgeGapNotice;
    return addSemanticRouteMetadata(
      {
        ...baseRoute,
        route: "knowledge_gap",
        providerUsed: "deepseek_semantic",
        answer,
        notice: answer,
        shouldMarkNeedsHuman: true,
        knowledgeGap: true,
        reason: "semantic_needs_human_or_unverified_facts",
        aiSkipped: true,
      },
      metadata
    );
  }

  return addSemanticRouteMetadata(
    {
      ...baseRoute,
      route: "semantic_grounded",
      providerUsed: "deepseek_semantic",
      answer: semanticResult.reply_draft || selectedFaqItems[0]?.answer || "",
      answerMode: selectedFaqItems[0]?.answer_mode || "direct",
      knowledgeGap: false,
      shouldMarkNeedsHuman: false,
      reason: "semantic_grounded_reply",
      aiSkipped: false,
    },
    metadata
  );
}

export function buildNoSecondCallFallbackRoute(routeResult, fallbackReason) {
  if (!routeResult?.shouldCallDeepSeek) {
    return {
      ...routeResult,
      semanticMetadata: {
        ...(routeResult?.semanticMetadata || {}),
        fallback_reason: fallbackReason,
      },
      shouldCallDeepSeek: false,
    };
  }

  return {
    ...routeResult,
    route: "knowledge_gap",
    providerUsed: "knowledge_gap",
    answer: knowledgeGapNotice,
    notice: knowledgeGapNotice,
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: true,
    knowledgeGap: true,
    aiSkipped: true,
    reason: "semantic_fallback_prevented_second_model_call",
    semanticMetadata: {
      ...(routeResult.semanticMetadata || {}),
      fallback_reason: fallbackReason,
    },
  };
}

export function buildModelUsageMetadata({
  mode,
  routeResult,
  modelCalled = false,
  modelCallCount = 0,
  model = "",
  providerStatus = null,
  finishReason = "",
  usage = null,
  latencyMs = null,
  fallbackReason = "",
} = {}) {
  return {
    semantic_mode: getSemanticRouterMode(mode),
    model_called: Boolean(modelCalled || routeResult?.modelCalled),
    model_call_count: Number(routeResult?.modelCallCount ?? modelCallCount) || 0,
    final_route: routeResult?.route || "",
    provider: routeResult?.providerUsed || "",
    ...(model ? { model } : {}),
    ...(Number.isInteger(providerStatus) ? { provider_status: providerStatus } : {}),
    ...(finishReason ? { finish_reason: finishReason } : {}),
    ...(Number.isInteger(latencyMs) ? { latency_ms: latencyMs } : {}),
    ...(usage
      ? {
          prompt_tokens: Number(usage.prompt_tokens || 0),
          completion_tokens: Number(usage.completion_tokens || 0),
          cache_hit_tokens: Number(usage.cache_hit_tokens || 0),
        }
      : {}),
    ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
    ...(routeResult?.semanticMetadata || {}),
  };
}

export async function callSemanticOrchestrator({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
  requestId,
  fetchImpl = fetch,
}) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const messages = buildSemanticMessages({
    message,
    context,
    recentMessages,
    faqItems,
    dateInfo,
  });
  const payload = buildDeepSeekRequestPayload({
    model,
    messages,
    temperature: 0.2,
    maxTokens: 500,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.text();
    const providerResult = parseDeepSeekResponseBody({
      ok: response.ok,
      status: response.status,
      body,
    });
    const semanticResult = validateSemanticResult(providerResult.answer, {
      faqItems,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      semanticResult,
      providerResult,
      model,
      metadata: buildModelUsageMetadata({
        mode: "hybrid",
        modelCalled: true,
        modelCallCount: 1,
        model,
        providerStatus: providerResult.providerStatus,
        finishReason: providerResult.finishReason,
        usage: providerResult.usage,
        latencyMs,
      }),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    error.semanticMetadata = buildModelUsageMetadata({
      mode: "hybrid",
      modelCalled: true,
      modelCallCount: 1,
      model,
      latencyMs,
      fallbackReason: error?.message || "semantic_orchestrator_failed",
    });
    error.requestId = requestId;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
