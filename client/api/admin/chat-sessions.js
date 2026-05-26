const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const maxSessions = 80;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || "").trim();
}

function requireAdmin(req) {
  const adminPassword = getAdminPassword();
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

async function loadLatestMessage(sessionId) {
  const messages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}&select=id,sender,message,provider_used,created_at&order=created_at.desc&limit=1`
  );

  return messages?.[0] || null;
}

function getSessionSortTime(session, latestMessage) {
  return (
    Date.parse(session.latest_message_at || "") ||
    Date.parse(latestMessage?.created_at || "") ||
    Date.parse(session.updated_at || "") ||
    Date.parse(session.created_at || "") ||
    0
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    requireAdmin(req);
    const search = String(firstQueryValue(req.query?.q) || "").trim().toLowerCase();
    const sessions = await supabaseRequest(
      `/chat_sessions?select=*&order=updated_at.desc&limit=${maxSessions}`
    );
    const enrichedSessions = await Promise.all(
      (sessions || []).map(async (session) => {
        const latestMessage = await loadLatestMessage(session.id);
        const lastMessage = String(session.last_message || latestMessage?.message || "");
        const latestMessageAt =
          session.latest_message_at || latestMessage?.created_at || session.updated_at || session.created_at || "";

        return {
          id: session.id,
          visitor_id: session.visitor_id || "",
          line_user_id: session.line_user_id || "",
          line_display_name: session.line_display_name || "",
          line_picture_url: session.line_picture_url || "",
          source: session.source || "web",
          status: session.status || "ai_active",
          unread_count: Number(session.unread_count || 0),
          last_message: lastMessage,
          latest_message_at: latestMessageAt,
          created_at: session.created_at || "",
          updated_at: session.updated_at || "",
          last_role: normalizeRole(latestMessage?.sender),
          sort_time: getSessionSortTime(session, latestMessage),
        };
      })
    );

    const filteredSessions = search
      ? enrichedSessions.filter((session) =>
          [
            session.line_display_name,
            session.visitor_id,
            session.line_user_id,
            session.last_message,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search)
        )
      : enrichedSessions;

    filteredSessions.sort((first, second) => second.sort_time - first.sort_time);

    return sendJson(res, 200, {
      sessions: filteredSessions.map(({ sort_time, ...session }) => session),
    });
  } catch (error) {
    console.error("admin chat sessions error:", error);
    return sendJson(res, error.status || 500, {
      error: error.status === 401 ? "Unauthorized." : "Failed to load chat sessions.",
    });
  }
}
