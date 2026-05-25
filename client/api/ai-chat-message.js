const systemPrompt = `你是「慢慢蒔光｜白雲基地」的 AI 客服小幫手。
回答要溫柔、清楚、簡短，使用繁體中文。
你要幫客人理解包棟、訂房、入住、退房、設施、寵物友善、白雲基地與慢寶 MUMBAO 相關問題。
如果不確定答案，不要亂編，請引導客人私訊官方 LINE 或等人工客服確認。
每次回答盡量控制在 80～180 字。`;
const aiErrorReply = "慢寶的雲朵訊號暫時不穩，請稍後再試。";
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const deepSeekTimeoutMs = 20000;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
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
            content: systemPrompt,
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
