import {
  getAdminChatAuthErrorMessage,
  requireChatSupportAdmin,
} from "./adminAuth.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const defaultLimit = 30;
const maxLimit = 50;
const supportStatusValues = new Set([
  "ai_replying",
  "needs_human",
  "human_takeover",
  "replied",
  "closed",
]);

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
  const supportStatus = getSupportStatus(session);

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
    support_status: supportStatus,
    should_ai_reply: session.should_ai_reply !== false,
    unread_count: Number(session.unread_count || 0),
    last_message: session.last_message || "",
    latest_message_sender: session.latest_message_sender || "",
    latest_message_at: session.latest_message_at || session.updated_at || session.created_at || "",
    support_status_updated_at: session.support_status_updated_at || "",
    handled_at: session.handled_at || "",
    handled_by_name: session.handled_by_name || "",
    handled_by_email: session.handled_by_email || "",
    handled_by_role: session.handled_by_role || "",
    closed_at: session.closed_at || "",
    created_at: session.created_at || "",
    updated_at: session.updated_at || "",
  };
}

function getSupportStatus(session) {
  const persistedStatus = String(session.support_status || "").trim();

  if (session.status === "closed" || persistedStatus === "closed") {
    return "closed";
  }

  if (supportStatusValues.has(persistedStatus)) {
    return persistedStatus;
  }

  if (session.latest_message_sender === "human") return "replied";
  if (session.status === "human_takeover" || session.should_ai_reply === false) {
    return Number(session.unread_count || 0) > 0 ? "needs_human" : "human_takeover";
  }

  return "ai_replying";
}

async function loadLatestMessages(sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean).map(String))];

  if (!ids.length) return new Map();

  const messages = await supabaseRequest(
    `/chat_messages?session_id=in.(${ids
      .map((id) => encodeURIComponent(id))
      .join(",")})&deleted_at=is.null&select=id,session_id,sender,message,created_at&order=created_at.desc`
  );
  const bySession = new Map();

  for (const message of messages || []) {
    const sessionId = String(message.session_id || "");
    if (!sessionId || bySession.has(sessionId)) continue;
    bySession.set(sessionId, message);
  }

  return bySession;
}

async function applyLatestMessageFallbacks(sessions) {
  const latestMessages = await loadLatestMessages((sessions || []).map((session) => session.id));

  return (sessions || []).map((session) => {
    const latestMessage = latestMessages.get(String(session.id));

    if (!latestMessage) return session;

    return {
      ...session,
      last_message: session.last_message || latestMessage.message || "",
      latest_message_sender: latestMessage.sender || "",
      latest_message_at:
        session.latest_message_at ||
        latestMessage.created_at ||
        session.updated_at ||
        session.created_at ||
        "",
    };
  });
}

function getFilterQuery(filter) {
  switch (filter) {
    case "needs_human":
    case "human_takeover":
    case "replied":
    case "closed":
      return `&support_status=eq.${filter}`;
    case "line":
      return "&or=(source.eq.line_liff,source.eq.line,source.eq.liff,line_user_id.not.is.null)";
    case "website":
      return "&or=(source.eq.web,source.is.null)";
    case "member":
      return "&or=(auth_user_id.not.is.null,customer_profile_id.not.is.null,customer_email.not.is.null)";
    case "visitor":
      return "&auth_user_id=is.null&customer_profile_id=is.null&customer_email=is.null&line_user_id=is.null&or=(source.eq.web,source.is.null)";
    default:
      return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    await requireChatSupportAdmin(req);
    const search = String(firstQueryValue(req.query?.q) || "").trim().toLowerCase();
    const filter = String(firstQueryValue(req.query?.filter) || "all").trim();
    const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
    const page = getPage(firstQueryValue(req.query?.page));
    const offset = page * limit;
    const select =
      "id,visitor_id,line_user_id,line_display_name,line_picture_url,source,auth_user_id,customer_profile_id,customer_email,status,support_status,should_ai_reply,unread_count,last_message,latest_message_at,support_status_updated_at,handled_at,handled_by_name,handled_by_email,handled_by_role,closed_at,created_at,updated_at";
    const filterQuery = getFilterQuery(filter);
    const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
    const searchFilter = search && !filterQuery.includes("&or=")
      ? `&or=(line_display_name.ilike.${searchTerm},visitor_id.ilike.${searchTerm},line_user_id.ilike.${searchTerm},last_message.ilike.${searchTerm})`
      : "";
    const sessions = await supabaseRequest(
      `/chat_sessions?select=${select}${filterQuery}${searchFilter}&order=latest_message_at.desc.nullslast,updated_at.desc.nullslast&limit=${
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
      error: getAdminChatAuthErrorMessage(error),
    });
  }
}
