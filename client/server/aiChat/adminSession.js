import {
  getAdminChatAuthErrorMessage,
  requireChatSupportAdmin,
} from "./adminAuth.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const allowedStatuses = new Set(["ai_active", "human_takeover", "closed"]);
const allowedSupportStatuses = new Set([
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

function getAction(req) {
  return String(firstQueryValue(req.query?.action) || "").trim();
}

function getSupportStatusFromAction(action) {
  switch (action) {
    case "human-takeover":
      return "human_takeover";
    case "restore-ai":
    case "reopen-session":
      return "ai_replying";
    case "close-session":
      return "closed";
    case "mark-replied":
      return "replied";
    default:
      return "";
  }
}

function getCoreStatusForSupportStatus(supportStatus) {
  if (supportStatus === "closed") return "closed";
  if (
    supportStatus === "needs_human" ||
    supportStatus === "human_takeover" ||
    supportStatus === "replied"
  ) {
    return "human_takeover";
  }
  return "ai_active";
}

function buildAdminSnapshot(admin) {
  return {
    handled_by_admin_id: admin.adminProfileId || null,
    handled_by_name: admin.displayName || "",
    handled_by_email: admin.email || "",
    handled_by_role: admin.roleCode || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const admin = await requireChatSupportAdmin(req);
    const sessionId = getSessionId(req);
    const body = await readBody(req);
    const actionSupportStatus = getSupportStatusFromAction(getAction(req));
    const requestedSupportStatus = String(
      body.support_status || body.supportStatus || actionSupportStatus || ""
    ).trim();
    const requestedStatus = String(body.status || "").trim();
    const status = requestedSupportStatus
      ? getCoreStatusForSupportStatus(requestedSupportStatus)
      : requestedStatus;

    if (!sessionId) {
      return sendJson(res, 400, { error: "session_id is required." });
    }

    if (requestedSupportStatus && !allowedSupportStatuses.has(requestedSupportStatus)) {
      return sendJson(res, 400, { error: "invalid support_status." });
    }

    if (!allowedStatuses.has(status)) {
      return sendJson(res, 400, { error: "invalid status." });
    }
    const now = new Date().toISOString();
    const patch = {
      status,
      support_status:
        requestedSupportStatus ||
        (status === "closed"
          ? "closed"
          : status === "human_takeover"
            ? "human_takeover"
            : "ai_replying"),
      should_ai_reply: status === "ai_active",
      support_status_updated_at: now,
      updated_at: now,
    };

    if (patch.support_status === "needs_human") {
      patch.should_ai_reply = false;
    }

    if (
      patch.support_status === "human_takeover" ||
      patch.support_status === "replied"
    ) {
      patch.should_ai_reply = false;
      Object.assign(patch, buildAdminSnapshot(admin));
      if (patch.support_status === "replied") {
        patch.handled_at = now;
        patch.unread_count = 0;
      }
    }

    if (patch.support_status === "closed") {
      patch.should_ai_reply = false;
      patch.closed_at = now;
      patch.closed_by_admin_id = admin.adminProfileId || null;
      patch.closed_by_name = admin.displayName || "";
      patch.closed_by_email = admin.email || "";
      patch.closed_by_role = admin.roleCode || "";
      if (!patch.handled_at) patch.handled_at = now;
      Object.assign(patch, buildAdminSnapshot(admin));
    }

    if (patch.support_status === "ai_replying") {
      patch.closed_at = null;
      patch.closed_by_admin_id = null;
      patch.closed_by_name = null;
      patch.closed_by_email = null;
      patch.closed_by_role = null;
    }

    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      }
    );

    if (!updatedSessions?.[0]) {
      return sendJson(res, 404, { error: "Chat session not found." });
    }

    return sendJson(res, 200, { session: updatedSessions[0] });
  } catch (error) {
    console.error("admin chat update session error:", error);
    return sendJson(res, error.status || 500, {
      error: getAdminChatAuthErrorMessage(error),
    });
  }
}
