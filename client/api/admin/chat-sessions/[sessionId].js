const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const allowedStatuses = new Set(["ai_active", "human_takeover", "closed"]);

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

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    requireAdmin(req);
    const sessionId = getSessionId(req);
    const body = await readBody(req);
    const status = String(body.status || "").trim();

    if (!sessionId) {
      return sendJson(res, 400, { error: "session_id is required." });
    }

    if (!allowedStatuses.has(status)) {
      return sendJson(res, 400, { error: "invalid status." });
    }

    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status,
          should_ai_reply: status === "ai_active",
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updatedSessions?.[0]) {
      return sendJson(res, 404, { error: "Chat session not found." });
    }

    return sendJson(res, 200, { session: updatedSessions[0] });
  } catch (error) {
    console.error("admin chat update session error:", error);
    return sendJson(res, error.status || 500, {
      error: error.status === 401 ? "Unauthorized." : "Failed to update chat session.",
    });
  }
}
