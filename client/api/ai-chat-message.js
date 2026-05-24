const aiReply = "慢寶收到你的問題了，我正在慢慢想一下。";
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;

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
    const aiMessage = await insertMessage(session.id, "ai", aiReply, "mock");

    return sendJson(res, 200, {
      session,
      userMessage,
      aiMessage,
    });
  } catch (error) {
    console.error("ai-chat-message error:", error);
    return sendJson(res, 500, { error: "Failed to send chat message." });
  }
}
