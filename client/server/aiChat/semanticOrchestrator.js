import {
  buildContextualKnowledgeGapReply,
  buildContextualKnowledgeRouteOverride,
  getConversationContextForStorage,
  getMissingBookingContextFields,
  normalizePendingInteraction,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  buildDeepSeekRequestPayload,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import {
  buildModelExecutionMetadata,
  reserveModelCall,
} from "./modelExecutionContext.js";
import {
  aiChatPromptBudget,
  buildPromptBudgetMetadata,
  measurePromptPayloadChars,
  limitFaqItemsForPrompt,
  limitMessagesForPrompt,
} from "./promptBudget.js";
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

export const allowedTurnActions = new Set([
  "request_quote",
  "update_quote",
  "confirm_quote",
  "explain_quote",
  "lodging_only_quote",
  "confirm_pending",
  "reject_pending",
  "modify_pending",
  "answer_pending",
  "ask_information",
  "casual_conversation",
  "switch_topic",
  "acknowledge",
  "human_takeover",
  "reset_context",
  "out_of_scope",
  "knowledge_gap",
]);

export const allowedPendingResolutionActions = new Set([
  "none",
  "confirm",
  "reject",
  "modify",
  "answer_field",
  "unrelated",
]);

const legacyPendingActionToResolution = new Map([
  ["confirm_pending", "confirm"],
  ["reject_pending", "reject"],
  ["modify_pending", "modify"],
  ["answer_pending", "answer_field"],
]);

const pendingResolutionToTurnAction = new Map([
  ["confirm", "confirm_pending"],
  ["reject", "reject_pending"],
  ["modify", "modify_pending"],
  ["answer_field", "answer_pending"],
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
  "semantic_direct",
  "semantic_verified",
  "faq_grounded_fallback",
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

export function normalizePendingResolutionAction(value) {
  const action = String(value || "").trim();
  return allowedPendingResolutionActions.has(action) ? action : "";
}

export function pendingResolutionToLegacyTurnAction(value) {
  return pendingResolutionToTurnAction.get(normalizePendingResolutionAction(value)) || "";
}

function normalizeCompactProtocolText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function hasPendingConfirmationSignal(message) {
  const text = normalizeCompactProtocolText(message);
  if (!text) return false;
  return /^(?:對|是|好|好的|可以|沒錯|正確|yes|y|ok|okay)(?:，|,|。|\.|！|!|、)?/.test(text);
}

function hasPendingRejectionSignal(message) {
  const text = normalizeCompactProtocolText(message);
  if (!text) return false;
  return /^(?:不是|不對|否|no|n)(?:，|,|。|\.|！|!|、)?/.test(text);
}

function contextPatchTouchesProposedField(contextPatch, pendingInteraction) {
  const pending = normalizePendingInteraction(pendingInteraction);
  if (!pending) return false;
  const patch = contextPatch && typeof contextPatch === "object" ? contextPatch : {};
  return Object.keys(pending.proposed_values || {}).some((field) =>
    Object.prototype.hasOwnProperty.call(patch, field)
  );
}

function inferNormalTurnActionForPending({
  rawTurnAction,
  route,
  intent,
  pendingInteraction,
}) {
  const action = normalizeTurnAction(rawTurnAction);
  const pending = normalizePendingInteraction(pendingInteraction);
  if (legacyPendingActionToResolution.has(action)) {
    return normalizeTurnAction(pending?.resume_action) || inferTurnAction({ route, intent });
  }
  return action || inferTurnAction({ route, intent });
}

export function validateAndNormalizeSemanticTurn({
  semanticResult,
  pendingInteraction = null,
  currentMessage = "",
  deterministicPatch = null,
} = {}) {
  const semantic =
    semanticResult && typeof semanticResult === "object" && !Array.isArray(semanticResult)
      ? semanticResult
      : {};
  const pending = normalizePendingInteraction(pendingInteraction);
  const contextPatch =
    semantic.context_patch && typeof semantic.context_patch === "object"
      ? semantic.context_patch
      : deterministicPatch && typeof deterministicPatch === "object"
        ? deterministicPatch
        : {};
  const rawTurnAction = String(
    semantic.semantic_turn_action_raw || semantic.turn_action || ""
  ).trim();
  const rawPendingResolution = String(
    semantic.semantic_pending_resolution_raw ||
      (semantic.pending_resolution_action &&
      semantic.pending_resolution_action !== "none"
        ? semantic.pending_resolution_action
        : "") ||
      ""
  ).trim();
  const route = String(semantic.route || "").trim();
  const intent = String(semantic.intent || "unknown").trim();
  const validationErrors = [];
  let normalizationReason = "";

  let pendingResolution = rawPendingResolution
    ? normalizePendingResolutionAction(rawPendingResolution) || "none"
    : legacyPendingActionToResolution.get(normalizeTurnAction(rawTurnAction)) ||
      "none";

  if (!pending) {
    if (pendingResolution !== "none") {
      validationErrors.push("pending_resolution_without_pending");
      normalizationReason = "pending_resolution_without_pending";
      pendingResolution = "none";
    }
  } else if (pending.required_response_type === "confirmation") {
    const hasConfirmation = hasPendingConfirmationSignal(currentMessage);
    const hasRejection = hasPendingRejectionSignal(currentMessage);
    const touchesProposal = contextPatchTouchesProposedField(contextPatch, pending);

    if (pendingResolution === "answer_field") {
      if (hasConfirmation) {
        pendingResolution = "confirm";
        normalizationReason = "confirmation_pending_with_additional_field";
      } else if (hasRejection) {
        pendingResolution = touchesProposal ? "modify" : "reject";
        normalizationReason = touchesProposal
          ? "rejection_pending_with_replacement_fields"
          : "rejection_pending_without_replacement_fields";
      } else {
        normalizationReason = "confirmation_pending_answered_field_only";
      }
    } else if (pendingResolution === "none") {
      if (hasConfirmation) {
        pendingResolution = "confirm";
        normalizationReason = "pending_protocol_confirm";
      } else if (hasRejection) {
        pendingResolution = touchesProposal ? "modify" : "reject";
        normalizationReason = touchesProposal
          ? "pending_protocol_modify"
          : "pending_protocol_reject";
      }
    } else if (pendingResolution === "modify" && !touchesProposal && !hasRejection) {
      validationErrors.push("modify_pending_without_replacement");
      normalizationReason = "modify_pending_without_replacement";
      pendingResolution = "answer_field";
    }
  } else if (pending.required_response_type === "fields") {
    if (["confirm", "reject", "modify"].includes(pendingResolution)) {
      normalizationReason = "field_pending_resolution_normalized_to_answer_field";
      pendingResolution = "answer_field";
    }
  }

  const normalizedTurnAction =
    inferNormalTurnActionForPending({
      rawTurnAction,
      route,
      intent,
      pendingInteraction: pending,
    }) || "ask_information";

  return {
    accepted: Boolean(normalizedTurnAction),
    normalizedPendingResolutionAction: pendingResolution,
    normalizedTurnAction,
    normalizedContextPatch: contextPatch,
    normalizationReason,
    validationErrors,
    semanticResult: {
      ...semantic,
      turn_action: normalizedTurnAction,
      pending_resolution_action: pendingResolution,
      semantic_turn_action_raw: rawTurnAction,
      semantic_pending_resolution_raw: rawPendingResolution,
      pending_protocol_normalization_reason: normalizationReason,
      semantic_validation_errors: validationErrors,
    },
  };
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
      state.room_count !== null ||
      Boolean(state.pending_interaction)
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
  const maxRecentMessages = Math.max(1, aiChatPromptBudget.maxRecentTurns * 2);
  const maxMessageChars = Math.max(
    200,
    Math.floor(aiChatPromptBudget.maxRecentMessageChars / maxRecentMessages)
  );
  return limitMessagesForPrompt(recentMessages, aiChatPromptBudget).messages
    .map((message) => ({
      sender: message?.sender === "user" ? "user" : "assistant",
      message: String(message?.message || "").slice(0, maxMessageChars),
    }))
    .filter((message) => message.message.trim());
}

function buildLatestAssistantSemanticMetadata(recentMessages) {
  const latestAssistant = [...(Array.isArray(recentMessages) ? recentMessages : [])]
    .reverse()
    .find((message) => String(message?.sender || "").toLowerCase() !== "user");
  const metadata =
    latestAssistant?.metadata && typeof latestAssistant.metadata === "object"
      ? latestAssistant.metadata
      : {};

  return {
    provider_used: String(latestAssistant?.provider_used || metadata.provider_used || "").slice(0, 80),
    final_route: String(metadata.final_route || "").slice(0, 80),
    validated_turn_action: String(metadata.validated_turn_action || "").slice(0, 80),
    pricing_reply_mode: String(metadata.pricing_reply_mode || "").slice(0, 80),
    lodging_price_status: String(metadata.lodging_price_status || "").slice(0, 80),
    lodging_price_amount: Number.isInteger(metadata.lodging_price_amount)
      ? metadata.lodging_price_amount
      : null,
    pricing_called: Boolean(metadata.pricing_called),
  };
}

export function limitSemanticFaqItems(items) {
  const eligibleItems = (Array.isArray(items) ? items : [])
    .filter(
      (item) =>
        isApprovedActiveFaqItem(item) ||
        (!("is_active" in Object(item)) &&
          !("status" in Object(item)) &&
          Boolean(String(item?.id || "").trim()) &&
          Boolean(String(item?.question || "").trim()) &&
          Boolean(String(item?.answer || "").trim()))
    );
  return limitFaqItemsForPrompt(eligibleItems, aiChatPromptBudget).items
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
4. 判斷本輪有限的 turn_action，讓後端執行固定、安全的業務流程。
5. 產生繁體中文 reply_draft，但只能使用提供 FAQ 中明確寫出的民宿事實。

不可自行推測或發明價格、房況、訂金、付款、退款、押金、寵物費、加人費或訂房是否成立。
房價、加人費與正式報價只能由後端 verified pricing calculator 計算；你只負責理解客人想做什麼。

輸出 schema：
{
  "pending_resolution_action": "none|confirm|reject|modify|answer_field|unrelated",
  "turn_action": "request_quote|update_quote|confirm_quote|explain_quote|lodging_only_quote|confirm_pending|reject_pending|modify_pending|answer_pending|ask_information|casual_conversation|switch_topic|acknowledge|human_takeover|reset_context|out_of_scope|knowledge_gap",
  "intent": "pricing|booking|availability|facilities|pet_policy|house_rules|payment|refund|general|human_support|unknown",
  "topic": "string",
  "is_follow_up": true,
  "mentioned_fields": [],
  "context_patch": {},
  "clear_fields": [],
  "uncertain_fields": [],
  "uses_relative_date": false,
  "selected_faq_ids": [],
  "missing_fields": [],
  "route": "grounded_reply|collect_info|knowledge_gap|human_takeover",
  "needs_human": false,
  "reply_draft": "string",
  "confidence": 0.0
}

turn_action 定義：
- request_quote：客人第一次詢問房價、總價、費用或報價。
- update_quote：客人補充或修改上一筆價格需求，例如日期、人數、房型、寵物條件。
- confirm_quote：客人確認上一則正式報價是否正確。
- explain_quote：客人詢問報價怎麼算或要求明細。
- lodging_only_quote：客人只問住宿小計，暫不含寵物或其他附加項目。
- confirm_pending：客人正在確認 pending_interaction 的提議值，例如同意慢寶上一輪確認的日期。
- reject_pending：客人否定 pending_interaction 的提議值。
- modify_pending：客人修正 pending_interaction 的提議值，例如改成另一組日期。
- answer_pending：客人回答 pending_interaction 正在等待的欄位，例如補上人數或寵物條件。
- ask_information：客人問設施、入住退房、寵物規則、附近資訊等一般住宿資訊。
- casual_conversation：客人問慢寶本身、打招呼或輕鬆聊天；不可發明真人年齡或民宿事實。
- switch_topic：客人想重新問、換題或問別的，但不是清除所有資料。
- acknowledge：客人只是在回覆好、謝謝、知道了、了解。
- human_takeover：客人要求人工客服或管家回答。
- reset_context：客人明確要求重新開始、全部重來、清除剛才資料。
- out_of_scope：只有明確與慢慢蒔光住宿服務無關時才使用。
- knowledge_gap：無法安全歸類或需要人工確認。

context_patch 只可使用這些欄位：
active_intent,current_topic,stay_type,check_in,check_out,guest_count,adult_count,child_count,pet_count,pet_type,room_count

mentioned_fields 代表客人本輪明確提到或試圖修改的欄位，即使值不確定也要列出。
uncertain_fields 代表客人提到該欄位但你無法安全解析成值；不要沿用舊值。
若客人使用今天、明天、後天、下週、下個月底、往後一天、改成星期五等相對日期，uses_relative_date 必須為 true。相對日期必須以 user payload 的 current_date 與 Asia/Taipei 解析，不可使用模型訓練日期。
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
          pending_interaction:
            normalizeConversationContext(context).pending_interaction || null,
          recent_messages: limitSemanticRecentMessages(recentMessages),
          latest_assistant_metadata: buildLatestAssistantSemanticMetadata(
            recentMessages
          ),
          current_message: String(message || ""),
          faq_candidates: limitSemanticFaqItems(faqItems),
          strict_rules: [
            "FAQ and approved database facts are the only trusted lodging facts.",
            "Do not invent prices, availability, fees, payment, refund or booking confirmation.",
            "Use selected_faq_ids only from faq_candidates.",
            "Use pending_resolution_action for pending_interaction resolution and turn_action for the business action after pending is resolved.",
            "One message can confirm pending values and add fields in context_patch. For pending date confirmation plus '對，10人', use pending_resolution_action=confirm, turn_action=request_quote, context_patch.guest_count=10.",
            "For pending date confirmation plus only '10人', use pending_resolution_action=answer_field and do not confirm proposed dates.",
            "For pending date confirmation plus '不是，是10/12到10/13，10人', use pending_resolution_action=modify and include replacement dates plus guest_count in context_patch.",
          ],
        },
        null,
        2
      ),
    },
  ];
}

function buildSemanticUserPayload({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
  includeLatestAssistantMetadata = true,
}) {
  const normalizedContext = normalizeConversationContext(context);
  return {
    current_date: dateInfo?.currentDate || "",
    timezone: dateInfo?.timeZone || "Asia/Taipei",
    conversation_context: normalizedContext,
    pending_interaction: normalizedContext.pending_interaction || null,
    recent_messages: recentMessages,
    ...(includeLatestAssistantMetadata
      ? { latest_assistant_metadata: buildLatestAssistantSemanticMetadata(recentMessages) }
      : {}),
    current_message: String(message || ""),
    faq_candidates: faqItems,
    strict_rules: [
      "FAQ and approved database facts are the only trusted lodging facts.",
      "Do not invent prices, availability, fees, payment, refund or booking confirmation.",
      "Use selected_faq_ids only from faq_candidates.",
      "Use pending_resolution_action for pending_interaction resolution and turn_action for the business action after pending is resolved.",
      "One message can confirm pending values and add fields in context_patch. For pending date confirmation plus '撠?10鈭?, use pending_resolution_action=confirm, turn_action=request_quote, context_patch.guest_count=10.",
      "For pending date confirmation plus only '10鈭?, use pending_resolution_action=answer_field and do not confirm proposed dates.",
      "For pending date confirmation plus '銝嚗10/12??0/13嚗?0鈭?, use pending_resolution_action=modify and include replacement dates plus guest_count in context_patch.",
    ],
  };
}

function buildSemanticMessagesFromPayload(payload) {
  return [
    {
      role: "system",
      content: buildSemanticSystemInstruction(),
    },
    {
      role: "user",
      content: JSON.stringify(payload, null, 2),
    },
  ];
}

function fitSemanticPromptToHardLimit({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
  buildPayload,
}) {
  const hardLimit = aiChatPromptBudget.maxTotalInputChars;
  const truncatedSections = [];
  const currentMessage = String(message || "").trim();
  let semanticRecentMessages = limitSemanticRecentMessages(recentMessages);
  let semanticFaqItems = limitSemanticFaqItems(faqItems);
  let includeLatestAssistantMetadata = true;

  const rebuild = () => {
    const semanticPayload = buildSemanticUserPayload({
      message: currentMessage,
      context,
      recentMessages: semanticRecentMessages,
      faqItems: semanticFaqItems,
      dateInfo,
      includeLatestAssistantMetadata,
    });
    const messages = buildSemanticMessagesFromPayload(semanticPayload);
    const payload = buildPayload(messages);
    return {
      messages,
      payload,
      promptChars: measurePromptPayloadChars(payload),
    };
  };

  let result = rebuild();

  while (
    result.promptChars > hardLimit &&
    semanticRecentMessages.length > 0
  ) {
    semanticRecentMessages = semanticRecentMessages.slice(1);
    truncatedSections.push("recent_messages_hard_limit");
    result = rebuild();
  }

  while (result.promptChars > hardLimit && semanticFaqItems.length > 0) {
    semanticFaqItems = semanticFaqItems.slice(0, -1);
    truncatedSections.push("faq_candidates_hard_limit");
    result = rebuild();
  }

  if (result.promptChars > hardLimit && includeLatestAssistantMetadata) {
    includeLatestAssistantMetadata = false;
    truncatedSections.push("assistant_metadata_hard_limit");
    result = rebuild();
  }

  if (result.promptChars > hardLimit) {
    const error = new Error("input_too_long");
    error.providerErrorCode = "input_too_long";
    error.promptBudgetMetadata = buildPromptBudgetMetadata({
      prompt: buildSemanticSystemInstruction(),
      messages: semanticRecentMessages,
      faqItems: semanticFaqItems,
      context: normalizeConversationContext(context),
      pendingInteraction:
        normalizeConversationContext(context).pending_interaction,
      currentMessage,
      actualPromptChars: result.promptChars,
      truncatedSections: [...truncatedSections, "current_message"],
      extraSections: [dateInfo || {}, "semantic_schema_and_strict_rules"],
    });
    throw error;
  }

  const normalizedContext = normalizeConversationContext(context);
  return {
    messages: result.messages,
    payload: result.payload,
    promptBudgetMetadata: buildPromptBudgetMetadata({
      prompt: buildSemanticSystemInstruction(),
      messages: semanticRecentMessages,
      faqItems: semanticFaqItems,
      context: normalizedContext,
      pendingInteraction: normalizedContext.pending_interaction,
      currentMessage,
      actualPromptChars: result.promptChars,
      truncatedSections,
      extraSections: [dateInfo || {}, "semantic_schema_and_strict_rules"],
    }),
  };
}

function buildSemanticPromptMetadata({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
}) {
  const normalizedContext = normalizeConversationContext(context);
  const recentLimit = limitMessagesForPrompt(recentMessages, aiChatPromptBudget);
  const faqLimit = limitFaqItemsForPrompt(faqItems, aiChatPromptBudget);

  return buildPromptBudgetMetadata({
    prompt: buildSemanticSystemInstruction(),
    messages: recentLimit.messages,
    faqItems: faqLimit.items,
    context: normalizedContext,
    pendingInteraction: normalizedContext.pending_interaction,
    currentMessage: message,
    extraSections: [
      String(message || ""),
      dateInfo || {},
      "semantic_schema_and_strict_rules",
    ],
    truncatedSections: [
      ...recentLimit.promptTruncationSections,
      ...faqLimit.promptTruncationSections,
    ],
  });
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

function normalizeFieldList(value) {
  if (!Array.isArray(value)) return [];
  const fields = [];
  for (const field of value.map((entry) => String(entry || "").trim())) {
    if (semanticContextFields.has(field) && !fields.includes(field)) {
      fields.push(field);
    }
  }
  return fields;
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

function inferTurnAction(value) {
  const route = String(value?.route || "").trim();
  const intent = String(value?.intent || "unknown").trim();

  if (route === "human_takeover" || intent === "human_support") {
    return "human_takeover";
  }
  if (route === "knowledge_gap") return "knowledge_gap";
  if (intent === "general" && route === "grounded_reply") return "casual_conversation";
  if (intent === "pricing") {
    return route === "collect_info" ? "request_quote" : "request_quote";
  }
  if (route === "grounded_reply" || route === "collect_info") {
    return "ask_information";
  }
  return "knowledge_gap";
}

export function normalizeTurnAction(value) {
  const action = String(value || "").trim();
  return allowedTurnActions.has(action) ? action : "";
}

export function validateSemanticResult(
  rawValue,
  {
    faqItems = [],
    pendingInteraction = null,
    currentMessage = "",
    deterministicPatch = null,
  } = {}
) {
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
  const turnAction = normalizeTurnAction(
    value.turn_action || inferTurnAction(value)
  );
  if (!turnAction) {
    throw new Error("semantic_orchestrator_invalid_turn_action");
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

  const semanticResult = {
    turn_action: turnAction,
    intent,
    topic: String(value.topic || "").trim().slice(0, 80),
    is_follow_up: Boolean(value.is_follow_up),
    pending_resolution_action: normalizePendingResolutionAction(
      value.pending_resolution_action
    ) || "none",
    semantic_turn_action_raw: String(value.turn_action || "").trim(),
    semantic_pending_resolution_raw: String(
      value.pending_resolution_action || ""
    ).trim(),
    context_patch: patch,
    clear_fields: clearFields,
    mentioned_fields: normalizeFieldList(value.mentioned_fields),
    uncertain_fields: normalizeFieldList(value.uncertain_fields),
    uses_relative_date: Boolean(value.uses_relative_date),
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

  return validateAndNormalizeSemanticTurn({
    semanticResult,
    pendingInteraction,
    currentMessage,
    deterministicPatch,
  }).semanticResult;
}

function writeSemanticSlotMeta(context, fields, { nowIso, sourceMessageId, confidence }) {
  const slotMeta = {
    ...(context?.slot_meta || {}),
  };

  for (const field of fields || []) {
    if (!semanticContextFields.has(field)) continue;
    slotMeta[field] = {
      source: "semantic",
      ...(sourceMessageId ? { source_message_id: sourceMessageId } : {}),
      updated_at: nowIso,
      ...(Number.isFinite(confidence) ? { confidence } : {}),
    };
  }

  return {
    ...context,
    slot_meta: slotMeta,
  };
}

export function mergeSemanticContext(baseContext, semanticResult, options = {}) {
  const nowIso =
    typeof options === "string"
      ? options
      : options?.nowIso || new Date().toISOString();
  const sourceMessageId =
    typeof options === "string" ? "" : String(options?.sourceMessageId || "");
  const context = normalizeConversationContext(baseContext);
  const touchedFields = new Set();

  for (const field of semanticResult.clear_fields || []) {
    if (semanticContextFields.has(field)) {
      context[field] = null;
      touchedFields.add(field);
    }
  }

  const merged = getConversationContextForStorage({
    ...context,
    ...(semanticResult.context_patch || {}),
  });
  for (const field of Object.keys(semanticResult.context_patch || {})) {
    if (semanticContextFields.has(field)) touchedFields.add(field);
  }
  const withSlotMeta = touchedFields.size
    ? writeSemanticSlotMeta(merged, [...touchedFields], {
        nowIso,
        sourceMessageId,
        confidence: semanticResult.confidence,
      })
    : merged;
  const changed =
    JSON.stringify(getConversationContextForStorage(baseContext)) !==
    JSON.stringify(withSlotMeta);

  if (changed) {
    withSlotMeta.last_updated_at = nowIso;
  }

  return {
    context: withSlotMeta,
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

  const approvedDirectItems = (Array.isArray(routeResult?.matchedFaqItems)
    ? routeResult.matchedFaqItems
    : []
  ).filter(
    (item) =>
      isApprovedActiveFaqItem(item) &&
      normalizeAnswerMode(item.answer_mode) === "direct" &&
      String(item.answer || "").trim()
  );
  if (approvedDirectItems.length > 0) {
    return {
      ...routeResult,
      route: "faq_grounded_fallback",
      providerUsed: "faq_direct",
      answer: approvedDirectItems
        .map((item) => String(item.answer || "").trim())
        .filter(Boolean)
        .join("\n\n"),
      notice: "",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
      aiSkipped: false,
      reason: "semantic_fallback_approved_faq",
      semanticMetadata: {
        ...(routeResult.semanticMetadata || {}),
        fallback_reason: fallbackReason,
        deterministic_fallback: "approved_faq",
      },
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
  provider = "",
  modelCalled = false,
  modelCallCount = 0,
  model = "",
  providerStatus = null,
  finishReason = "",
  usage = null,
  latencyMs = null,
  fallbackReason = "",
} = {}) {
  const providerName = provider || routeResult?.providerUsed || "";

  return {
    semantic_mode: getSemanticRouterMode(mode),
    model_called: Boolean(modelCalled || routeResult?.modelCalled),
    model_call_count: Number(routeResult?.modelCallCount ?? modelCallCount) || 0,
    final_route: routeResult?.route || "",
    ...(providerName ? { provider: providerName } : {}),
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

function buildSemanticObservationMetadata(semanticResult) {
  return {
    semantic_validator_result: "accepted",
    semantic_validator_accepted: true,
    semantic_turn_action_raw:
      semanticResult.semantic_turn_action_raw || semanticResult.turn_action,
    semantic_pending_resolution_raw:
      semanticResult.semantic_pending_resolution_raw || "",
    semantic_turn_action: semanticResult.turn_action,
    validated_turn_action: semanticResult.turn_action,
    normalized_pending_resolution:
      semanticResult.pending_resolution_action || "none",
    pending_protocol_normalization_reason:
      semanticResult.pending_protocol_normalization_reason || "",
    turn_action_validator_result: "accepted",
    semantic_route: semanticResult.route,
    semantic_intent: semanticResult.intent,
    ...(semanticResult.topic ? { semantic_topic: semanticResult.topic } : {}),
    semantic_is_follow_up: semanticResult.is_follow_up,
    mentioned_fields: semanticResult.mentioned_fields || [],
    uncertain_fields: semanticResult.uncertain_fields || [],
    uses_relative_date: semanticResult.uses_relative_date || false,
    semantic_context_patch: semanticResult.context_patch || {},
    semantic_clear_fields: semanticResult.clear_fields || [],
    semantic_selected_faq_ids: semanticResult.selected_faq_ids || [],
    semantic_missing_fields: semanticResult.missing_fields || [],
    semantic_needs_human: semanticResult.needs_human,
    semantic_confidence: semanticResult.confidence,
    ...(semanticResult.rejected_fields?.length
      ? { semantic_rejected_fields: semanticResult.rejected_fields }
      : {}),
    ...(semanticResult.semantic_validation_errors?.length
      ? { semantic_validation_errors: semanticResult.semantic_validation_errors }
      : {}),
  };
}

export async function callSemanticOrchestrator({
  message,
  context,
  recentMessages,
  faqItems,
  dateInfo,
  requestId,
  mode = "legacy",
  fetchImpl = fetch,
  executionContext = null,
}) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  const startedAt = Date.now();
  let providerResult = null;
  let promptBudgetMetadata = buildPromptBudgetMetadata();

  try {
    const budgetedPrompt = fitSemanticPromptToHardLimit({
      message,
      context,
      recentMessages,
      faqItems,
      dateInfo,
      buildPayload: (messages) =>
        buildDeepSeekRequestPayload({
          model,
          messages,
          temperature: 0.2,
          maxTokens: aiChatPromptBudget.maxOutputTokens,
        }),
    });
    const payload = budgetedPrompt.payload;
    promptBudgetMetadata = budgetedPrompt.promptBudgetMetadata;
    reserveModelCall(executionContext, "semantic_router");
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
    providerResult = parseDeepSeekResponseBody({
      ok: response.ok,
      status: response.status,
      body,
    });
    const semanticResult = validateSemanticResult(providerResult.answer, {
      faqItems,
      pendingInteraction: normalizeConversationContext(context).pending_interaction,
      currentMessage: message,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      semanticResult,
      providerResult,
      model,
      metadata: {
        ...buildModelUsageMetadata({
          mode,
          provider: "deepseek",
          modelCalled: executionContext?.model_call_attempted ?? true,
          modelCallCount: executionContext?.model_call_count || 1,
          model,
          providerStatus: providerResult.providerStatus,
          finishReason: providerResult.finishReason,
          usage: providerResult.usage,
          latencyMs,
        }),
        ...promptBudgetMetadata,
        ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
        ...buildSemanticObservationMetadata(semanticResult),
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const fallbackReason = error?.message || "semantic_orchestrator_failed";
    const validatorRejected = fallbackReason.startsWith(
      "semantic_orchestrator_invalid"
    );
    const effectivePromptBudgetMetadata =
      error?.promptBudgetMetadata &&
      typeof error.promptBudgetMetadata === "object"
        ? error.promptBudgetMetadata
        : promptBudgetMetadata;

    error.semanticMetadata = {
      ...buildModelUsageMetadata({
        mode,
        provider: "deepseek",
        modelCalled: executionContext ? executionContext.model_call_attempted : true,
        modelCallCount: executionContext ? executionContext.model_call_count : 1,
        model,
        providerStatus: providerResult?.providerStatus,
        finishReason: providerResult?.finishReason,
        usage: providerResult?.usage,
        latencyMs,
        fallbackReason,
      }),
      ...effectivePromptBudgetMetadata,
      ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
      semantic_validator_result: validatorRejected ? "rejected" : "not_run",
      semantic_validator_accepted: false,
    };
    error.requestId = requestId;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
