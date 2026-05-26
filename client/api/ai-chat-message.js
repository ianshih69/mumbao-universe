const systemPrompt = `你是「慢慢蒔光｜白雲基地」的 AI 客服小幫手。
回答要溫柔、清楚、簡短，使用繁體中文。
你要幫客人理解包棟、訂房、入住、退房、設施、寵物友善、白雲基地與慢寶 MUMBAO 相關問題。
如果不確定答案，不要亂編，請引導客人私訊官方 LINE 或等人工客服確認。
每次回答盡量控制在 80～180 字。`;
const aiErrorReply = "慢寶的雲朵訊號暫時不穩，請稍後再試。";
const scopeGuardReply =
  "慢寶目前主要協助回答慢慢蒔光｜白雲基地的訂房、入住、設施、寵物與生活公約問題喔。若有其他問題，歡迎私訊官方 LINE，會有專人協助你。";
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const lineVerifyTimeoutMs = 8000;
const deepSeekTimeoutMs = 20000;
const recentMessagesLimit = 12;
const recentContextMaxChars = 4000;
let hasGuesthouseKnowledgeCache = false;
let guesthouseKnowledgeCache = "";

const supportScopeKeywords = [
  "慢慢蒔光",
  "白雲基地",
  "慢寶",
  "mumbao",
  "民宿",
  "住宿",
  "房間",
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
  "押金",
  "訪客",
  "寵物",
  "毛孩",
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

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

function createHttpError(message, status, reason) {
  const error = new Error(message);
  error.status = status;
  error.reason = reason;
  return error;
}

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
  const compactText = String(text || "").toLowerCase().replace(/\s+/g, "");

  return (
    /^\d{4}$/.test(compactText) ||
    /^\d{1,2}[/-]\d{1,2}$/.test(compactText) ||
    /\d+\s*(人|位|大人|小孩)/.test(compactText) ||
    /[一二三四五六七八九十兩]+(人|位|大人|小孩)/.test(compactText) ||
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

function isAllowedSupportScope(message, contextText = message) {
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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    restUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    serviceRoleKey,
  };
}

function getDeepSeekConfig() {
  const aiMode = process.env.AI_MODE || "cloud_only";
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (aiMode !== "cloud_only") {
    const error = new Error(`Unsupported AI_MODE: ${aiMode}`);
    error.reason = "unsupported ai mode";
    throw error;
  }

  if (!apiKey) {
    console.error("DEEPSEEK_API_KEY is missing");
    const error = new Error("DEEPSEEK_API_KEY is missing");
    error.reason = "missing deepseek api key";
    throw error;
  }

  return {
    aiMode,
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  };
}

function getTaipeiDateInfo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const currentYear = Number(values.year);

  return {
    currentDate: `${values.year}-${values.month}-${values.day}`,
    currentYear,
    nextYear: currentYear + 1,
    timeZone: "Asia/Taipei",
  };
}

async function loadGuesthouseKnowledge() {
  if (hasGuesthouseKnowledgeCache) {
    return guesthouseKnowledgeCache;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const cwd = process.cwd();
  const candidatePaths = [
    path.join(cwd, "api", "knowledge", "guesthouse-rules.md"),
    path.join(cwd, "client", "api", "knowledge", "guesthouse-rules.md"),
  ];

  for (const knowledgePath of candidatePaths) {
    try {
      guesthouseKnowledgeCache = await fs.readFile(knowledgePath, "utf8");
      hasGuesthouseKnowledgeCache = true;
      return guesthouseKnowledgeCache;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.error("[ai-chat] failed to load guesthouse knowledge:", {
          path: knowledgePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.error("[ai-chat] guesthouse knowledge file not found");
  hasGuesthouseKnowledgeCache = true;
  guesthouseKnowledgeCache = "";
  return guesthouseKnowledgeCache;
}

async function buildSystemPrompt(dateInfo) {
  const guesthouseKnowledge = (await loadGuesthouseKnowledge()).trim();

  return `${systemPrompt}

目前日期資訊：
- 目前日期：${dateInfo.currentDate}
- 目前年份：${dateInfo.currentYear}
- 明年：${dateInfo.nextYear}
- 時區：${dateInfo.timeZone}
- 使用者說「今年」時，請理解為 ${dateInfo.currentYear} 年；說「明年」時，請理解為 ${dateInfo.nextYear} 年。
- 若前後文已有月日、人數、包棟或價格條件，請把「今年／明年／那天／那多少」等短回覆與前文合併理解。
- 若只有日期如 5/30，且前後文完全沒有年份或「今年／明年」線索，才詢問年份。

客服知識庫使用規則：
- 回答住宿問題時，優先依照 guesthouse-rules.md 的內容。
- 如果 guesthouse-rules.md 沒有寫，不要推測或補充。
- 價格、空房、訂金、退款、寵物細節、特定日期等不確定資訊，請引導客人私訊官方 LINE。
- 不要直接提到你正在讀取 Markdown 檔案，也不要把知識庫原文整段貼給客人。

以下是慢慢蒔光｜白雲基地 AI 客服知識庫 guesthouse-rules.md：
${guesthouseKnowledge || "目前知識庫沒有可用內容。遇到不確定問題，請引導客人私訊官方 LINE。"}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function supabaseRequest(path, options = {}) {
  const { restUrl, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), supabaseTimeoutMs);

  try {
    const response = await fetch(`${restUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...options.headers,
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(data?.message || `Supabase request failed: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyLineIdToken(idToken) {
  const normalizedToken = String(idToken || "").trim();
  const channelId = getLineChannelId();

  if (!normalizedToken || !channelId) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), lineVerifyTimeoutMs);

  try {
    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id_token: normalizedToken,
        client_id: channelId,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.sub) {
      console.warn("[ai-chat] LINE ID token verify failed", {
        status: response.status,
        message: data?.error_description || data?.error,
      });
      return null;
    }

    return {
      line_user_id: String(data.sub),
      line_display_name: String(data.name || ""),
      line_picture_url: String(data.picture || ""),
    };
  } catch (error) {
    console.warn("[ai-chat] LINE ID token verify unavailable", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeLinePictureUrl(value) {
  const pictureUrl = String(value || "").trim();
  return pictureUrl.startsWith("https://profile.line-scdn.net/") ? pictureUrl : "";
}

function getLineChannelId() {
  const explicitChannelId = String(process.env.LINE_CHANNEL_ID || "").trim();
  if (explicitChannelId) {
    return explicitChannelId;
  }

  return String(process.env.NEXT_PUBLIC_LIFF_ID || "").split("-")[0].trim();
}

async function verifyLineAccessToken(accessToken) {
  const normalizedToken = String(accessToken || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), lineVerifyTimeoutMs);

  try {
    const response = await fetch("https://api.line.me/v2/profile", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.userId) {
      console.warn("[ai-chat] LINE access token verify failed", {
        status: response.status,
        message: data?.message,
      });
      return null;
    }

    return {
      line_user_id: String(data.userId),
      line_display_name: String(data.displayName || ""),
      line_picture_url: normalizeLinePictureUrl(data.pictureUrl),
    };
  } catch (error) {
    console.warn("[ai-chat] LINE access token verify unavailable", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyLineIdentity({ lineIdToken, lineAccessToken }) {
  const idTokenProfile = await verifyLineIdToken(lineIdToken);
  if (idTokenProfile?.line_user_id) {
    return {
      ...idTokenProfile,
      line_picture_url: normalizeLinePictureUrl(idTokenProfile.line_picture_url),
    };
  }

  return verifyLineAccessToken(lineAccessToken);
}

async function resolveVisitorIdentity({ visitorId, anonymousVisitorId, lineIdToken, lineAccessToken }) {
  const verifiedLineProfile = await verifyLineIdentity({
    lineIdToken,
    lineAccessToken,
  });

  if (verifiedLineProfile?.line_user_id) {
    return {
      visitorId: `line:${verifiedLineProfile.line_user_id}`,
      lineProfile: verifiedLineProfile,
    };
  }

  if (String(visitorId || "").startsWith("line:")) {
    return {
      visitorId: String(anonymousVisitorId || "").trim(),
      lineProfile: null,
    };
  }

  return {
    visitorId: String(visitorId || "").trim(),
    lineProfile: null,
  };
}

async function updateSessionLineIdentity(sessionId, lineProfile) {
  if (!sessionId || !lineProfile?.line_user_id) {
    return null;
  }

  try {
    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          visitor_id: `line:${lineProfile.line_user_id}`,
          line_user_id: lineProfile.line_user_id,
          line_display_name: lineProfile.line_display_name,
          line_picture_url: lineProfile.line_picture_url,
          source: "line_liff",
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return updatedSessions?.[0] || null;
  } catch (error) {
    console.error("[ai-chat] failed to save LINE session identity:", error);
    return null;
  }
}

function sortMessagesByCreatedAt(messages) {
  return [...(messages || [])].sort((first, second) => {
    const firstTime = Date.parse(first?.created_at || "");
    const secondTime = Date.parse(second?.created_at || "");

    if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
      return 0;
    }

    return firstTime - secondTime;
  });
}

async function loadRecentMessages(sessionId) {
  const encodedSessionId = encodeURIComponent(sessionId);
  const messages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodedSessionId}&select=sender,message,created_at&order=created_at.desc&limit=${recentMessagesLimit}`
  );

  return sortMessagesByCreatedAt(messages || []).filter((message) =>
    String(message?.message || "").trim()
  );
}

function normalizeRecentMessage(message) {
  const rawSender = String(message?.sender || message?.role || "").toLowerCase();
  const content = String(message?.message || "").trim();

  if (!content) {
    return null;
  }

  const sender = rawSender === "user" ? "user" : "ai";
  const createdAt = String(message?.created_at || "").trim();

  return {
    sender,
    message: content,
    created_at: createdAt || undefined,
  };
}

function normalizeClientRecentMessages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortMessagesByCreatedAt(
    value
      .slice(-recentMessagesLimit)
      .map(normalizeRecentMessage)
      .filter(Boolean)
  );
}

function buildContextText(recentMessages, currentMessage) {
  const text = [
    ...recentMessages.map(
      (message) => `${message.sender || "message"}: ${message.message || ""}`
    ),
    `user: ${currentMessage}`,
  ].join("\n");

  return text.length > recentContextMaxChars
    ? text.slice(text.length - recentContextMaxChars)
    : text;
}

function trimRecentMessagesForPrompt(recentMessages) {
  const selected = [];
  let totalLength = 0;

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    const content = String(message?.message || "").trim();

    if (!content) {
      continue;
    }

    if (totalLength + content.length > recentContextMaxChars) {
      break;
    }

    totalLength += content.length;
    selected.unshift(message);
  }

  return selected;
}

function buildDeepSeekMessages(prompt, recentMessages, userMessage) {
  const conversationMessages = trimRecentMessagesForPrompt(recentMessages).map(
    (message) => ({
      role: message.sender === "user" ? "user" : "assistant",
      content: String(message.message || ""),
    })
  );

  return [
    {
      role: "system",
      content: prompt,
    },
    ...conversationMessages,
    {
      role: "user",
      content: userMessage,
    },
  ];
}

async function callDeepSeek(userMessage, recentMessages, dateInfo) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const prompt = await buildSystemPrompt(dateInfo);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), deepSeekTimeoutMs);

  try {
    console.log("[ai-chat] provider=deepseek model=", model);

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: buildDeepSeekMessages(prompt, recentMessages, userMessage),
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    console.log("[ai-chat] deepseek status=", response.status);

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("DeepSeek API error:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });
      throw new Error(`DeepSeek request failed: ${response.status}`);
    }

    const answer = data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      console.error("DeepSeek API error:", {
        message: "Missing assistant answer",
        data,
      });
      throw new Error("DeepSeek response did not include an answer.");
    }

    return answer;
  } catch (error) {
    if (error?.name === "AbortError") {
      console.error("DeepSeek API error:", {
        message: "DeepSeek request timed out",
        timeoutMs: deepSeekTimeoutMs,
      });
    } else if (error?.reason !== "missing deepseek api key") {
      console.error("DeepSeek API error:", error);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getOrCreateSession(visitorId) {
  const encodedVisitorId = encodeURIComponent(visitorId);
  const sessions = await supabaseRequest(
    `/chat_sessions?visitor_id=eq.${encodedVisitorId}&select=*&order=updated_at.desc&limit=1`
  );

  if (sessions?.[0]) {
    return sessions[0];
  }

  const createdSessions = await supabaseRequest("/chat_sessions", {
    method: "POST",
    body: JSON.stringify({ visitor_id: visitorId }),
  });

  return createdSessions[0];
}

async function getSessionForMessage(visitorId, sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();

  if (normalizedSessionId) {
    const sessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(
        normalizedSessionId
      )}&visitor_id=eq.${encodeURIComponent(visitorId)}&select=*&limit=1`
    );

    if (sessions?.[0]) {
      return sessions[0];
    }

    throw createHttpError(
      "session_id does not belong to visitor_id.",
      403,
      "session visitor mismatch"
    );
  }

  return getOrCreateSession(visitorId);
}

async function insertMessage(sessionId, sender, message, providerUsed) {
  const inserted = await supabaseRequest("/chat_messages", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      sender,
      message,
      provider_used: providerUsed,
    }),
  });

  return inserted[0];
}

async function updateSessionAfterMessage(session, message, options = {}) {
  if (!session?.id || !message) {
    return session;
  }

  const unreadCount = options.incrementUnread
    ? Number(session.unread_count || 0) + 1
    : Number(session.unread_count || 0);

  try {
    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(session.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          last_message: message.message || "",
          latest_message_at: message.created_at || new Date().toISOString(),
          unread_count: unreadCount,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return updatedSessions?.[0] || session;
  } catch (error) {
    console.warn("[ai-chat] failed to update session summary:", error);
    return session;
  }
}

function shouldSkipAiReply(session) {
  return (
    session?.status === "human_takeover" ||
    session?.status === "closed" ||
    session?.should_ai_reply === false
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    const requestedVisitorId = String(body.visitor_id || "").trim();
    const anonymousVisitorId = String(body.anonymous_visitor_id || "").trim();
    const lineIdToken = String(body.line_id_token || "").trim();
    const lineAccessToken = String(body.line_access_token || "").trim();
    const identity = await resolveVisitorIdentity({
      visitorId: requestedVisitorId,
      anonymousVisitorId,
      lineIdToken,
      lineAccessToken,
    });
    const visitorId = identity.visitorId;
    const sessionId = String(body.session_id || "").trim();
    const message = String(body.message || "").trim();

    if (!visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    if (!message) {
      return sendJson(res, 400, { error: "message is required." });
    }

    let session = await getSessionForMessage(visitorId, sessionId);
    session =
      (await updateSessionLineIdentity(session.id, identity.lineProfile)) ||
      session;
    const dateInfo = getTaipeiDateInfo();
    console.log("[ai-chat] current year=", dateInfo.currentYear);

    const clientRecentMessages = normalizeClientRecentMessages(body.recentMessages);
    let recentMessages = clientRecentMessages;
    let contextSource = "client";
    let contextText = buildContextText(recentMessages, message);
    const isCurrentScopeAllowed = isAllowedSupportScope(message);
    let isContextScopeAllowed = isAllowedSupportScope(message, contextText);
    const isClearlyBlockedWithoutSupport =
      includesKeyword(message.toLowerCase(), blockedScopeKeywords) &&
      !hasSupportContext(message);
    const needsSupabaseFallback =
      !isClearlyBlockedWithoutSupport &&
      !isCurrentScopeAllowed &&
      (!clientRecentMessages.length || !isContextScopeAllowed);

    if (needsSupabaseFallback) {
      recentMessages = await loadRecentMessages(session.id);
      contextSource = "supabase_fallback";
      contextText = buildContextText(recentMessages, message);
      isContextScopeAllowed = isAllowedSupportScope(message, contextText);
    }

    if (contextSource === "client") {
      console.log("[ai-chat] context source=client");
    } else {
      console.log("[ai-chat] context source=supabase_fallback");
    }
    console.log("[ai-chat] recent messages count=", recentMessages.length);

    const userMessage = await insertMessage(session.id, "user", message, null);
    session = await updateSessionAfterMessage(session, userMessage, {
      incrementUnread: true,
    });

    if (shouldSkipAiReply(session)) {
      console.log("[ai-chat] human takeover active, skip ai reply");
      return sendJson(res, 200, {
        session,
        userMessage,
        aiMessage: null,
        answer: "",
        humanTakeover: true,
      });
    }

    if (!isContextScopeAllowed) {
      console.log("[ai-chat] scope=blocked");
      const aiMessage = await insertMessage(
        session.id,
        "ai",
        scopeGuardReply,
        "scope_guard"
      );
      session = await updateSessionAfterMessage(session, aiMessage);

      return sendJson(res, 200, {
        session,
        userMessage,
        aiMessage,
        answer: scopeGuardReply,
      });
    }

    console.log(
      isCurrentScopeAllowed
        ? "[ai-chat] scope=allowed"
        : "[ai-chat] scope=allowed by context"
    );
    const aiAnswer = await callDeepSeek(message, recentMessages, dateInfo);
    const aiMessage = await insertMessage(session.id, "ai", aiAnswer, "deepseek");
    session = await updateSessionAfterMessage(session, aiMessage);
    console.log("[ai-chat] saved assistant message");

    return sendJson(res, 200, {
      session,
      userMessage,
      aiMessage,
      answer: aiAnswer,
    });
  } catch (error) {
    console.error("ai-chat-message error:", error);

    if (error?.reason === "missing deepseek api key") {
      return sendJson(res, 500, { error: "DEEPSEEK_API_KEY is missing" });
    }

    if (error?.status === 403) {
      return sendJson(res, 403, {
        error: "session_id does not belong to visitor_id.",
      });
    }

    return sendJson(res, 500, { error: aiErrorReply });
  }
}
