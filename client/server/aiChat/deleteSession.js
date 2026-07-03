import {
  buildCustomerSessionPatch,
  isSessionOwnedByCustomer,
  resolveCustomerIdentity,
} from "./customerIdentity.js";

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

async function loadSessionForDelete({ sessionId, visitorId, customerIdentity }) {
  const sessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(
      sessionId
    )}&deleted_at=is.null&select=*&limit=1`
  );
  const session = sessions?.[0];

  if (!session) {
    return null;
  }

  if (customerIdentity?.authUserId) {
    const canUseSession =
      isSessionOwnedByCustomer(session, customerIdentity) ||
      (!session.auth_user_id && session.visitor_id === visitorId);

    if (!canUseSession) {
      return null;
    }

    return session;
  }

  if (session.auth_user_id || session.visitor_id !== visitorId) {
    return null;
  }

  return session;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    const sessionId = String(body.session_id || body.sessionId || "").trim();
    const visitorId = String(body.visitor_id || body.visitorId || "").trim();
    const customerIdentity = await resolveCustomerIdentity(req);

    if (!sessionId) {
      return sendJson(res, 400, { error: "session_id is required." });
    }

    if (!customerIdentity?.authUserId && !visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    const session = await loadSessionForDelete({
      sessionId,
      visitorId,
      customerIdentity,
    });

    if (!session) {
      return sendJson(res, 403, { error: "session_id does not belong to requester." });
    }

    const deletedAt = new Date().toISOString();
    await supabaseRequest(
      `/chat_messages?session_id=eq.${encodeURIComponent(sessionId)}&deleted_at=is.null`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: deletedAt }),
      }
    );

    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...buildCustomerSessionPatch(customerIdentity, session),
          deleted_at: deletedAt,
          status: "closed",
          updated_at: deletedAt,
        }),
      }
    );

    return sendJson(res, 200, {
      session: updatedSessions?.[0] || { id: sessionId, deleted_at: deletedAt },
      deleted_at: deletedAt,
    });
  } catch (error) {
    console.error("ai-chat-delete-session error:", error);
    return sendJson(res, 500, {
      error: "慢寶暫時無法刪除這段對話，請稍後再試。",
    });
  }
}
