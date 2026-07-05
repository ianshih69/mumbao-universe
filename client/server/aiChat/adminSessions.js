const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const defaultLimit = 30;
const maxLimit = 50;

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

function getPositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

function getPage(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeSession(session) {
  return {
    id: session.id,
    session_id: session.id,
    visitor_id: session.visitor_id || "",
    line_user_id: session.line_user_id || "",
    line_display_name: session.line_display_name || "",
    visitor_name: session.line_display_name || "",
    line_picture_url: session.line_picture_url || "",
    source: session.source || "web",
    auth_user_id: session.auth_user_id || "",
    customer_profile_id: session.customer_profile_id || "",
    customer_email: session.customer_email || "",
    status: session.status || "ai_active",
    unread_count: Number(session.unread_count || 0),
    last_message: session.last_message || "",
    latest_message_at: session.latest_message_at || session.updated_at || session.created_at || "",
    created_at: session.created_at || "",
    updated_at: session.updated_at || "",
  };
}

async function loadLatestMessage(sessionId) {
  const messages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}&select=id,session_id,sender,message,created_at&order=created_at.desc&limit=10`
  );

  return (
    (messages || []).find((message) => String(message.message || "").trim()) ||
    messages?.[0] ||
    null
  );
}

async function applyLatestMessageFallbacks(sessions) {
  return Promise.all(
    sessions.map(async (session) => {
      if (session.last_message && session.latest_message_at) {
        return session;
      }

      const latestMessage = await loadLatestMessage(session.id);
      if (!latestMessage) {
        return session;
      }

      return {
        ...session,
        last_message: session.last_message || latestMessage.message || "",
        latest_message_at:
          session.latest_message_at ||
          latestMessage.created_at ||
          session.updated_at ||
          session.created_at ||
          "",
      };
    })
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
    const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
    const page = getPage(firstQueryValue(req.query?.page));
    const offset = page * limit;
    const select =
      "id,visitor_id,line_user_id,line_display_name,line_picture_url,source,auth_user_id,customer_profile_id,customer_email,status,unread_count,last_message,latest_message_at,created_at,updated_at";
    const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
    const searchFilter = search
      ? `&or=(line_display_name.ilike.${searchTerm},visitor_id.ilike.${searchTerm},line_user_id.ilike.${searchTerm},last_message.ilike.${searchTerm})`
      : "";
    const sessions = await supabaseRequest(
      `/chat_sessions?select=${select}${searchFilter}&order=latest_message_at.desc.nullslast,updated_at.desc.nullslast&limit=${
        limit + 1
      }&offset=${offset}`
    );
    const sessionPage = await applyLatestMessageFallbacks(sessions || []);
    const hasMore = sessionPage.length > limit;

    return sendJson(res, 200, {
      sessions: sessionPage
        .slice(0, limit)
        .map(normalizeSession)
        .sort((first, second) => {
          const firstTime = Date.parse(first.latest_message_at || first.updated_at || "") || 0;
          const secondTime = Date.parse(second.latest_message_at || second.updated_at || "") || 0;
          return secondTime - firstTime;
        }),
      page,
      limit,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (error) {
    console.error("admin chat sessions error:", error);
    return sendJson(res, error.status || 500, {
      error: error.status === 401 ? "Unauthorized." : "Failed to load chat sessions.",
    });
  }
}
