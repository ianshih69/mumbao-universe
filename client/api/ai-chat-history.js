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
    const error = new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    error.reason = "missing env";
    throw error;
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
  let sessions;

  try {
    sessions = await supabaseRequest(
      `/chat_sessions?visitor_id=eq.${encodedVisitorId}&select=*&order=created_at.desc&limit=1`
    );
  } catch (error) {
    error.reason = error.reason || "supabase create session failed";
    throw error;
  }

  if (sessions?.[0]) {
    return sessions[0];
  }

  let createdSessions;

  try {
    createdSessions = await supabaseRequest("/chat_sessions", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId }),
    });
  } catch (error) {
    error.reason = error.reason || "supabase create session failed";
    throw error;
  }

  return createdSessions[0];
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(res, 500, { error: "missing env" });
    }

    const body = req.method === "POST" ? await readBody(req) : {};
    const visitorId = String(
      body.visitor_id || req.query?.visitor_id || ""
    ).trim();

    if (!visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    const session = await getOrCreateSession(visitorId);
    let messages;

    try {
      messages = await supabaseRequest(
        `/chat_messages?session_id=eq.${encodeURIComponent(session.id)}&select=*&order=created_at.asc`
      );
    } catch (error) {
      error.reason = error.reason || "supabase load messages failed";
      throw error;
    }

    return sendJson(res, 200, {
      session,
      messages: messages || [],
    });
  } catch (error) {
    console.error("chat history error:", error);

    const reason = error?.reason || "unknown error";
    if (reason === "missing env") {
      return sendJson(res, 500, { error: "missing env" });
    }

    return sendJson(res, 500, {
      error: "Failed to load chat history.",
      reason,
    });
  }
}
