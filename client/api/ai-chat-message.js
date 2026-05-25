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
const deepSeekTimeoutMs = 20000;
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
  "空房",
  "費用",
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
  "聊天",
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

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

function includesKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isAllowedSupportScope(message) {
  const normalizedMessage = String(message || "").toLowerCase().trim();

  if (!normalizedMessage) {
    return false;
  }

  if (includesKeyword(normalizedMessage, blockedScopeKeywords)) {
    return false;
  }

  const hasSupportKeyword = includesKeyword(
    normalizedMessage,
    supportScopeKeywords
  );
  const hasYilanTravelKeyword = includesKeyword(
    normalizedMessage,
    yilanTravelKeywords
  );
  const hasLodgingContext = includesKeyword(
    normalizedMessage,
    lodgingContextKeywords
  );

  return hasSupportKeyword || (hasYilanTravelKeyword && hasLodgingContext);
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

async function buildSystemPrompt() {
  const guesthouseKnowledge = (await loadGuesthouseKnowledge()).trim();

  return `${systemPrompt}

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

async function callDeepSeek(userMessage) {
  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const prompt = await buildSystemPrompt();
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
        messages: [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
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
    `/chat_sessions?visitor_id=eq.${encodedVisitorId}&select=*&order=created_at.desc&limit=1`
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    const visitorId = String(body.visitor_id || "").trim();
    const message = String(body.message || "").trim();

    if (!visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    if (!message) {
      return sendJson(res, 400, { error: "message is required." });
    }

    const session = await getOrCreateSession(visitorId);
    const userMessage = await insertMessage(session.id, "user", message, null);

    if (!isAllowedSupportScope(message)) {
      console.log("[ai-chat] scope=blocked");
      const aiMessage = await insertMessage(
        session.id,
        "ai",
        scopeGuardReply,
        "scope_guard"
      );

      return sendJson(res, 200, {
        session,
        userMessage,
        aiMessage,
        answer: scopeGuardReply,
      });
    }

    console.log("[ai-chat] scope=allowed");
    const aiAnswer = await callDeepSeek(message);
    const aiMessage = await insertMessage(session.id, "ai", aiAnswer, "deepseek");
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

    return sendJson(res, 500, { error: aiErrorReply });
  }
}
