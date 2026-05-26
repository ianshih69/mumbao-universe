const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

function requireAdmin(req) {
  const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedPassword = bearerToken || String(req.headers?.["x-admin-password"] || "").trim();

  if (!adminPassword) {
    const error = new Error("ADMIN_PASSWORD is not configured.");
    error.status = 500;
    throw error;
  }

  if (providedPassword !== adminPassword) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
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
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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

function getSessionId(req) {
  return String(req.query?.sessionId || req.query?.session_id || "").trim();
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRole(sender) {
  const normalized = String(sender || "").toLowerCase();
  if (normalized === "ai") return "assistant";
  if (normalized === "assistant") return "assistant";
  if (normalized === "human") return "human";
  if (normalized === "system") return "system";
  return "user";
}

function normalizeMessage(message) {
  return {
    id: message.id,
    session_id: message.session_id,
    role: normalizeRole(message.sender),
    sender: message.sender,
    content: message.message || "",
    message: message.message || "",
    provider_used: message.provider_used || null,
    created_at: message.created_at || "",
    read_by_admin: Boolean(message.read_by_admin),
    metadata: message.metadata || null,
  };
}

async function assertSessionExists(sessionId) {
  const sessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,status&limit=1`
  );

  if (!sessions?.[0]) {
    const error = new Error("Chat session not found.");
    error.status = 404;
    throw error;
  }

  return sessions[0];
}

async function markRead(sessionId) {
  await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&read_by_admin=eq.false`,
    {
      method: "PATCH",
      body: JSON.stringify({ read_by_admin: true }),
    }
  ).catch((error) => {
    console.warn("admin chat mark messages read failed:", error);
  });

  await supabaseRequest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ unread_count: 0, updated_at: new Date().toISOString() }),
  }).catch((error) => {
    console.warn("admin chat reset unread failed:", error);
  });
}

async function handleGet(req, res, sessionId) {
  await assertSessionExists(sessionId);
  const since = String(firstQueryValue(req.query?.since) || "").trim();
  const sinceFilter =
    since && !Number.isNaN(Date.parse(since))
      ? `&created_at=gt.${encodeURIComponent(since)}`
      : "";
  const messages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}${sinceFilter}&select=id,session_id,sender,message,provider_used,created_at,read_by_admin,metadata&order=created_at.asc`
  );

  await markRead(sessionId);

  return sendJson(res, 200, {
    messages: (messages || []).map(normalizeMessage),
    since: since || null,
  });
}

async function handlePost(req, res, sessionId) {
  await assertSessionExists(sessionId);
  const body = await readBody(req);
  const content = String(body.content || body.message || "").trim();

  if (!content) {
    return sendJson(res, 400, { error: "message is required." });
  }

  const insertedMessages = await supabaseRequest("/chat_messages", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      sender: "human",
      message: content,
      provider_used: "admin",
      read_by_admin: true,
      metadata: { source: "admin" },
    }),
  });
  const message = insertedMessages[0];

  await supabaseRequest(`/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "human_takeover",
      last_message: content,
      latest_message_at: message.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  return sendJson(res, 200, {
    message: normalizeMessage(message),
  });
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    requireAdmin(req);
    const sessionId = getSessionId(req);

    if (!sessionId) {
      return sendJson(res, 400, { error: "session_id is required." });
    }

    if (req.method === "GET") {
      return await handleGet(req, res, sessionId);
    }

    return await handlePost(req, res, sessionId);
  } catch (error) {
    console.error("admin chat messages error:", error);
    const message = String(error?.message || "");
    if (message.includes("chat_messages_sender_check")) {
      return sendJson(res, 500, {
        error:
          "Failed to send message: chat_messages sender constraint does not allow human. Please run the human sender migration.",
      });
    }

    return sendJson(res, error.status || 500, {
      error:
        error.status === 401
          ? "Unauthorized."
          : error.status === 404
            ? error.message
            : "Failed to process chat messages.",
    });
  }
}
