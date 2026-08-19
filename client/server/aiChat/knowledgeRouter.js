import {
  normalizeAnswerMode,
  normalizeText,
  retrieveFaqItems,
} from "./faqRetrieval.js";
import { retrieveSemanticFaqItems } from "./faqSemanticRetrieval.js";

export const knowledgeGapNotice =
  "這個問題目前還沒有確認過的慢慢蒔光資料，我先幫你記錄，請管家協助確認喔。";

export const scopeGuardReply =
  "我主要能回答慢慢蒔光住宿、包棟、房型、寵物、停車、入住退房與相關服務問題。這題不在我能確認的住宿範圍內，就先不提供答案喔。";

const localIntentReplies = {
  greeting:
    "嗨，我是慢寶。你可以問我住宿、包棟、房型、寵物、停車、入住時間與慢慢蒔光相關問題喔。",
  thanks: "不客氣，慢寶在這裡陪你慢慢確認。",
  bye: "謝謝你來找慢寶，祝你有一個柔軟舒服的一天。",
  capabilities:
    "你可以問我慢慢蒔光的住宿、包棟、房型、寵物、停車、入住退房、早餐、設備與常見規定。",
  human_request:
    "我先幫你把這段對話加入管家待辦，請管家協助確認喔。",
};

const supportScopeKeywords = [
  "慢慢蒔光",
  "白雲基地",
  "慢寶",
  "mumbao",
  "民宿",
  "住宿",
  "包棟",
  "訂房",
  "預訂",
  "預約",
  "入住",
  "退房",
  "checkin",
  "check-in",
  "check out",
  "checkout",
  "早餐",
  "餐點",
  "訪客",
  "寵物",
  "毛孩",
  "狗",
  "狗狗",
  "貓",
  "貓咪",
  "大型犬",
  "小型犬",
  "犬",
  "設施",
  "烤肉",
  "麻將",
  "歡唱",
  "唱歌",
  "ktv",
  "禁菸",
  "抽菸",
  "公約",
  "生活公約",
  "規定",
  "入住規定",
  "付款",
  "付費",
  "訂金",
  "退款",
  "改期",
  "價格",
  "房價",
  "包棟價",
  "空房",
  "費用",
  "人數",
  "停車",
  "交通",
  "周邊景點",
  "附近景點",
  "官方 line",
  "官方line",
  "聯絡",
  "客服",
];

const yilanTravelKeywords = [
  "宜蘭",
  "羅東",
  "冬山",
  "五結",
  "礁溪",
  "景點",
  "旅遊",
  "行程",
  "附近",
  "周邊",
];

const lodgingContextKeywords = [
  "住宿",
  "民宿",
  "訂房",
  "包棟",
  "入住",
  "退房",
  "慢慢蒔光",
  "白雲基地",
  "慢寶",
  "mumbao",
  "附近",
  "周邊",
  "停車",
  "交通",
  "景點",
];

const blockedScopeKeywords = [
  "寫程式",
  "程式碼",
  "程式",
  "python",
  "javascript",
  "debug",
  "股票",
  "投資",
  "基金",
  "加密貨幣",
  "算命",
  "占卜",
  "塔羅",
  "星座",
  "閒聊",
  "作文",
  "寫作",
  "翻譯",
  "法律",
  "律師",
  "訴訟",
  "醫療",
  "醫生",
  "診斷",
  "處方",
  "政治",
  "選舉",
  "總統",
];

const contextFollowUpKeywords = [
  "今年",
  "明年",
  "後年",
  "那",
  "這樣",
  "可以",
  "怎麼訂",
  "怎麼預訂",
  "如何訂",
  "有空",
  "空房",
  "多少",
  "價格",
  "費用",
  "週五",
  "周五",
  "平日",
  "假日",
  "暑假",
  "寒假",
  "過年",
  "連假",
  "春節",
  "早餐",
  "押金",
  "停車",
  "寵物",
  "入住",
  "退房",
  "包棟",
  "訂房",
  "付款",
  "訂金",
  "退款",
  "改期",
  "訪客",
  "烤肉",
  "麻將",
  "歡唱",
  "禁菸",
];

const shortFollowUpMessages = [
  "可以",
  "好",
  "要",
  "不要",
  "需要",
  "不用",
  "ok",
  "okay",
  "yes",
  "no",
];

function includesKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasSupportContext(text) {
  const normalizedText = String(text || "").toLowerCase().trim();
  const hasSupportKeyword = includesKeyword(normalizedText, supportScopeKeywords);
  const hasYilanTravelKeyword = includesKeyword(
    normalizedText,
    yilanTravelKeywords
  );
  const hasLodgingContext = includesKeyword(
    normalizedText,
    lodgingContextKeywords
  );

  return hasSupportKeyword || (hasYilanTravelKeyword && hasLodgingContext);
}

function isDateOrPeopleFragment(text) {
  const compactText = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
  const month = String.raw`(?:0?[1-9]|1[0-2])`;
  const day = String.raw`(?:0?[1-9]|[12]\d|3[01])`;
  const year = String.raw`20\d{2}`;
  const monthDay = String.raw`${month}[\/.-]${day}`;
  const yearMonthDay = String.raw`${year}[\/.-]${month}[\/.-]${day}`;
  const dateRangeSeparator = String.raw`(?:-|~|～|〜|到|至)`;
  const numericToken = String.raw`(?:\d+|[零〇一二兩两三四五六七八九十]+)`;
  const singleDatePattern = new RegExp(
    String.raw`^(?:${yearMonthDay}|${monthDay})$`
  );
  const dateRangePattern = new RegExp(
    String.raw`^(?:${yearMonthDay}|${monthDay})${dateRangeSeparator}(?:(?:${year}[\/.-])?${month}[\/.-])?${day}$`
  );
  const peoplePattern = new RegExp(
    String.raw`^(?:改成|改為|改|不是|總共|共)?${numericToken}(?:人|位|大人|小孩)$`
  );
  const petPattern = new RegExp(
    String.raw`^${numericToken}(?:隻|只)?(?:狗|狗狗|犬|貓|貓咪|寵物|毛孩)$`
  );
  const nightsPattern = new RegExp(String.raw`^${numericToken}(?:晚|夜)$`);

  return (
    new RegExp(String.raw`^${year}$`).test(compactText) ||
    singleDatePattern.test(compactText) ||
    dateRangePattern.test(compactText) ||
    peoplePattern.test(compactText) ||
    petPattern.test(compactText) ||
    /^(?:不帶|沒有|無)(?:狗|狗狗|犬|貓|貓咪|寵物|毛孩)(?:了)?$/.test(compactText) ||
    nightsPattern.test(compactText) ||
    /[一二三四五六七八九十]+月[一二三四五六七八九十]+/.test(compactText) ||
    /(週|周)[一二三四五六日天]/.test(compactText)
  );
}

function isLikelyContextFollowUp(message) {
  const normalizedMessage = String(message || "").toLowerCase().trim();
  const compactMessage = normalizedMessage.replace(/\s+/g, "");

  if (!compactMessage) {
    return false;
  }

  if (shortFollowUpMessages.includes(compactMessage)) {
    return true;
  }

  if (includesKeyword(normalizedMessage, contextFollowUpKeywords)) {
    return true;
  }

  if (isDateOrPeopleFragment(normalizedMessage)) {
    return true;
  }

  return (
    compactMessage.length <= 24 &&
    /^(那|這|所以|請問|如果|不然|還有|另外)/.test(compactMessage)
  );
}

export function isAllowedSupportScope(message, contextText = message) {
  const normalizedMessage = String(message || "").toLowerCase().trim();
  const normalizedContext = String(contextText || "").toLowerCase().trim();

  if (!normalizedMessage) {
    return false;
  }

  const hasCurrentSupportContext = hasSupportContext(normalizedMessage);
  if (
    includesKeyword(normalizedMessage, blockedScopeKeywords) &&
    !hasCurrentSupportContext
  ) {
    return false;
  }

  if (hasCurrentSupportContext) {
    return true;
  }

  return (
    hasSupportContext(normalizedContext) &&
    isLikelyContextFollowUp(normalizedMessage)
  );
}

function detectLocalIntent(message) {
  const normalized = normalizeText(message);
  if (!normalized) return "";

  if (["hi", "hello", "嗨", "哈囉", "哈啰", "你好", "您好"].includes(normalized)) {
    return "greeting";
  }

  if (["謝謝", "謝啦", "感謝", "thanks", "thankyou"].includes(normalized)) {
    return "thanks";
  }

  if (["再見", "掰掰", "bye", "goodbye"].includes(normalized)) {
    return "bye";
  }

  if (
    normalized.includes("我可以問什麼") ||
    normalized.includes("可以問什麼") ||
    normalized.includes("能問什麼")
  ) {
    return "capabilities";
  }

  if (
    normalized.includes("人工客服") ||
    normalized.includes("真人客服") ||
    normalized.includes("管家") ||
    normalized.includes("人工")
  ) {
    return "human_request";
  }

  return "";
}

function hasMultipleQuestionParts(message) {
  const text = String(message || "");
  const questionMarkCount = (text.match(/[?？]/g) || []).length;
  return (
    questionMarkCount > 1 ||
    /以及|還有|另外|順便|跟|和|與|、|並且/.test(text)
  );
}

function buildPartialAnswer(answer) {
  return `${answer}\n\n其他沒有已核准資料支持的部分，我先幫你記錄，請管家協助確認喔。`;
}

function createRouteResult(overrides = {}) {
  const matchedFaqItems = overrides.matchedFaqItems || [];
  const topCandidate = overrides.topCandidate || matchedFaqItems[0] || null;
  const usedFaqItems =
    overrides.usedFaqItems ||
    (overrides.route === "knowledge_gap" || overrides.route === "scope_guard"
      ? []
      : matchedFaqItems);

  return {
    route: overrides.route || "knowledge_gap",
    confidence: overrides.confidence || topCandidate?.confidence || "none",
    matchedFaqItems: usedFaqItems,
    candidateFaqItems: matchedFaqItems,
    matchedFaqIds: usedFaqItems.map((item) => item.id),
    topCandidateIds: matchedFaqItems.slice(0, 3).map((item) => item.id),
    topCandidateScores: matchedFaqItems
      .slice(0, 3)
      .map((item) => Number(item.score || 0)),
    topScore: Number(topCandidate?.score || 0),
    scoreGap: Number(topCandidate?.scoreGap || 0),
    exactMatch: Boolean(topCandidate?.exactMatch),
    aliasMatch: Boolean(topCandidate?.aliasMatch),
    lexicalSafeDirect: Boolean(
      overrides.lexicalSafeDirect ?? topCandidate?.lexicalSafeDirect
    ),
    lexicalSafeDirectReason:
      overrides.lexicalSafeDirectReason ||
      topCandidate?.lexicalSafeDirectReason ||
      "",
    answerMode: overrides.answerMode || topCandidate?.answer_mode || "",
    shouldCallDeepSeek: Boolean(overrides.shouldCallDeepSeek),
    shouldMarkNeedsHuman: Boolean(overrides.shouldMarkNeedsHuman),
    reason: overrides.reason || "",
    answer: overrides.answer || "",
    notice: overrides.notice || "",
    providerUsed: overrides.providerUsed || overrides.route || "knowledge_gap",
    knowledgeGap: Boolean(overrides.knowledgeGap),
    aiSkipped: overrides.aiSkipped !== false,
    approvedKnowledgePrompt: overrides.approvedKnowledgePrompt || "",
    semanticMetadata:
      overrides.semanticMetadata && typeof overrides.semanticMetadata === "object"
        ? overrides.semanticMetadata
        : {},
  };
}

function isExplicitExternalScope(message) {
  const normalizedMessage = String(message || "").toLowerCase().trim();
  return (
    includesKeyword(normalizedMessage, blockedScopeKeywords) &&
    !hasSupportContext(normalizedMessage)
  );
}

function buildSemanticRetrievalMetadata(semanticResult = {}) {
  return {
    faq_semantic_retrieval_status: semanticResult.status || "not_run",
    faq_semantic_retrieval_reason: semanticResult.reason || "",
    faq_semantic_embedding_called: Boolean(semanticResult.embeddingCalled),
    faq_semantic_query_cache_hit: Boolean(semanticResult.queryEmbeddingCacheHit),
    faq_semantic_corpus_approved_count: Number(
      semanticResult.corpusApprovedCount || 0
    ),
    faq_semantic_corpus_needs_review_count: Number(
      semanticResult.corpusNeedsReviewCount || 0
    ),
    faq_semantic_embedding_model: semanticResult.embeddingModel || "",
    faq_semantic_vector_dimensions: Number(semanticResult.vectorDimensions || 0),
    faq_semantic_index_source_hash: semanticResult.sourceHash || "",
    faq_semantic_index_path: semanticResult.artifactPath || "",
  };
}

export async function routeKnowledge({
  message,
  session = null,
  contextText = message,
  retrievalMessage = message,
  faqItems,
  semanticRetrieval = null,
  limit = 8,
} = {}) {
  if (session?.status === "human_takeover") {
    return createRouteResult({
      route: "human_takeover",
      providerUsed: "human_takeover",
      shouldCallDeepSeek: false,
      reason: "human_takeover",
      aiSkipped: true,
    });
  }

  const localIntent = detectLocalIntent(message);
  if (localIntent && localIntent !== "human_request") {
    return createRouteResult({
      route: "local_intent",
      providerUsed: "local_intent",
      answer: localIntentReplies[localIntent],
      shouldCallDeepSeek: false,
      reason: localIntent,
      aiSkipped: true,
    });
  }

  if (localIntent === "human_request") {
    return createRouteResult({
      route: "ask_human",
      providerUsed: "ask_human",
      answer: localIntentReplies.human_request,
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      reason: "local_human_request",
      aiSkipped: true,
    });
  }

  const matchedFaqItems = await retrieveFaqItems(retrievalMessage || message, {
    limit,
    maxLimit: limit,
    items: faqItems,
  });
  const top = matchedFaqItems[0] || null;
  const lexicalSafeDirectTop = Boolean(top?.lexicalSafeDirect);
  const topAnswerMode = normalizeAnswerMode(top?.answer_mode);
  let semanticFallbackMetadata = {};
  let semanticFallbackReason = "";

  if (!lexicalSafeDirectTop && isExplicitExternalScope(message)) {
    return createRouteResult({
      route: "scope_guard",
      providerUsed: "scope_guard",
      answer: scopeGuardReply,
      shouldCallDeepSeek: false,
      reason: "out_of_scope",
      aiSkipped: true,
    });
  }

  if (!lexicalSafeDirectTop) {
    const semanticResult = await retrieveSemanticFaqItems(
      retrievalMessage || message,
      {
        ...(semanticRetrieval && typeof semanticRetrieval === "object"
          ? semanticRetrieval
          : {}),
        items: faqItems,
      }
    );
    const semanticMetadata = buildSemanticRetrievalMetadata(semanticResult);
    semanticFallbackMetadata = semanticMetadata;
    semanticFallbackReason = semanticResult.reason || "";
    const semanticTop = semanticResult.topCandidate || semanticResult.candidates?.[0];
    const semanticAnswerMode = normalizeAnswerMode(semanticTop?.answer_mode);

    if (semanticResult.status === "clear" && semanticTop) {
      if (semanticAnswerMode === "ask_human") {
        return createRouteResult({
          route: "ask_human",
          providerUsed: "semantic_direct",
          matchedFaqItems: [semanticTop],
          topCandidate: semanticTop,
          answer: semanticTop.answer || knowledgeGapNotice,
          answerMode: "ask_human",
          shouldCallDeepSeek: false,
          shouldMarkNeedsHuman: true,
          reason: "semantic_clear_ask_human_faq",
          aiSkipped: true,
          semanticMetadata,
        });
      }

      if (semanticAnswerMode === "collect_info") {
        return createRouteResult({
          route: "faq_collect_info",
          providerUsed: "semantic_direct",
          matchedFaqItems: [semanticTop],
          topCandidate: semanticTop,
          answer: semanticTop.answer,
          answerMode: "collect_info",
          shouldCallDeepSeek: false,
          reason: "semantic_clear_collect_info_faq",
          aiSkipped: true,
          semanticMetadata,
        });
      }

      return createRouteResult({
        route: "semantic_direct",
        providerUsed: "semantic_direct",
        matchedFaqItems: [semanticTop],
        topCandidate: semanticTop,
        answer: semanticTop.answer,
        answerMode: "direct",
        shouldCallDeepSeek: false,
        shouldMarkNeedsHuman: false,
        reason: "semantic_clear_approved_faq",
        knowledgeGap: false,
        aiSkipped: true,
        semanticMetadata,
      });
    }

    if (semanticResult.status === "ambiguous" && semanticResult.candidates?.length) {
      return createRouteResult({
        route: "semantic_verifier_required",
        providerUsed: "semantic_verifier_required",
        matchedFaqItems: semanticResult.candidates,
        topCandidate: semanticTop,
        answerMode: semanticAnswerMode || "direct",
        shouldCallDeepSeek: true,
        shouldMarkNeedsHuman: false,
        reason: "semantic_ambiguous_needs_verifier",
        aiSkipped: false,
        semanticMetadata,
      });
    }
  }

  if (!lexicalSafeDirectTop && !isAllowedSupportScope(message, contextText)) {
    return createRouteResult({
      route: "scope_guard",
      providerUsed: "scope_guard",
      answer: scopeGuardReply,
      shouldCallDeepSeek: false,
      reason: "out_of_scope",
      aiSkipped: true,
    });
  }

  if (!lexicalSafeDirectTop) {
    return createRouteResult({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      matchedFaqItems,
      topCandidate: top,
      usedFaqItems: [],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      reason:
        top?.lexicalSafeDirectReason ||
        top?.rejectionReason ||
        semanticFallbackReason ||
        "no_lexical_safe_direct_approved_faq",
      notice: knowledgeGapNotice,
      answer: knowledgeGapNotice,
      knowledgeGap: true,
      aiSkipped: true,
      semanticMetadata: semanticFallbackMetadata,
    });
  }

  if (topAnswerMode === "ask_human") {
    return createRouteResult({
      route: "ask_human",
      providerUsed: "ask_human",
      matchedFaqItems: [top],
      topCandidate: top,
      answer: top.answer || knowledgeGapNotice,
      answerMode: "ask_human",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      reason: `lexical_safe_direct_${top.lexicalSafeDirectReason}_ask_human`,
      aiSkipped: true,
    });
  }

  if (topAnswerMode === "collect_info") {
    return createRouteResult({
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
      matchedFaqItems: [top],
      topCandidate: top,
      answer: top.answer,
      answerMode: "collect_info",
      shouldCallDeepSeek: false,
      reason: `lexical_safe_direct_${top.lexicalSafeDirectReason}_collect_info`,
      aiSkipped: true,
    });
  }

  const multipleParts =
    hasMultipleQuestionParts(message) && !top.exactMatch && !top.aliasMatch;
  if (lexicalSafeDirectTop) {
    const answer = multipleParts ? buildPartialAnswer(top.answer) : top.answer;
    return createRouteResult({
      route: "faq_direct",
      providerUsed: "faq_direct",
      matchedFaqItems: [top],
      topCandidate: top,
      answer,
      answerMode: "direct",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: multipleParts,
      reason: multipleParts
        ? "single_supported_faq_with_possible_unsupported_parts"
        : `lexical_safe_direct_${top.lexicalSafeDirectReason}`,
      knowledgeGap: multipleParts,
      aiSkipped: true,
    });
  }

  return createRouteResult({
    route: "knowledge_gap",
    providerUsed: "knowledge_gap",
    matchedFaqItems,
    topCandidate: top,
    usedFaqItems: [],
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: true,
    reason: top?.lexicalSafeDirectReason || "no_lexical_safe_direct",
    notice: knowledgeGapNotice,
    answer: knowledgeGapNotice,
    knowledgeGap: true,
    aiSkipped: true,
  });
}

export function buildKnowledgeMetadata(routeResult, requestId) {
  return {
    requestId,
    provider_used: routeResult.providerUsed,
    matchedFaqIds: routeResult.matchedFaqIds,
    matchedFaqCount: routeResult.matchedFaqIds.length,
    matchConfidence: routeResult.confidence,
    exactMatch: routeResult.exactMatch,
    aliasMatch: routeResult.aliasMatch,
    topScore: routeResult.topScore,
    scoreGap: routeResult.scoreGap,
    lexical_safe_direct: routeResult.lexicalSafeDirect,
    lexical_safe_direct_reason: routeResult.lexicalSafeDirectReason,
    answerMode: routeResult.answerMode || null,
    knowledge_gap: routeResult.knowledgeGap,
    ai_skipped: routeResult.aiSkipped,
    routing_reason: routeResult.reason,
  };
}

export function buildKnowledgeGapMessageMetadata(routeResult) {
  return {
    knowledge_gap: true,
    match_confidence: routeResult.confidence,
    top_candidate_ids: routeResult.topCandidateIds,
    top_candidate_scores: routeResult.topCandidateScores,
    routing_reason: routeResult.reason || "no_high_confidence_approved_faq",
  };
}
