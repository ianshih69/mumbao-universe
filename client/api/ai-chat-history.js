const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const lineVerifyTimeoutMs = 8000;
const defaultHistoryLimit = 7;
const maxHistoryLimit = 30;

function createHttpError(message, status, reason) {
  const error = new Error(message);
  error.status = status;
  error.reason = reason;
  return error;
}

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

async function verifyLineIdToken(idToken) {
  const normalizedToken = String(idToken || "").trim();
  const channelId = String(process.env.LINE_CHANNEL_ID || "").trim();

  if (!normalizedToken || !channelId) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), lineVerifyTimeoutMs);

  try {
    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id_token: normalizedToken,
        client_id: channelId,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.sub) {
      console.warn("[ai-chat] LINE ID token verify failed", {
        status: response.status,
        message: data?.error_description || data?.error,
      });
      return null;
    }

    return {
      line_user_id: String(data.sub),
      line_display_name: String(data.name || ""),
      line_picture_url: String(data.picture || ""),
    };
  } catch (error) {
    console.warn("[ai-chat] LINE ID token verify unavailable", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveVisitorIdentity({ visitorId, anonymousVisitorId, lineIdToken }) {
  const verifiedLineProfile = await verifyLineIdToken(lineIdToken);

  if (verifiedLineProfile?.line_user_id) {
    return {
      visitorId: `line:${verifiedLineProfile.line_user_id}`,
      lineProfile: verifiedLineProfile,
    };
  }

  if (String(visitorId || "").startsWith("line:")) {
    return {
      visitorId: String(anonymousVisitorId || "").trim(),
      lineProfile: null,
    };
  }

  return {
    visitorId: String(visitorId || "").trim(),
    lineProfile: null,
  };
}

async function updateSessionLineIdentity(sessionId, lineProfile) {
  if (!sessionId || !lineProfile?.line_user_id) {
    return null;
  }

  try {
    const updatedSessions = await supabaseRequest(
      `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          visitor_id: `line:${lineProfile.line_user_id}`,
          line_user_id: lineProfile.line_user_id,
          line_display_name: lineProfile.line_display_name,
          line_picture_url: lineProfile.line_picture_url,
          source: "line",
        }),
      }
    );

    return updatedSessions?.[0] || null;
  } catch (error) {
    console.error("[ai-chat] failed to save LINE session identity:", error);
    return null;
  }
}

async function getOrCreateSession(visitorId) {
  const encodedVisitorId = encodeURIComponent(visitorId);
  let sessions;

  try {
    sessions = await supabaseRequest(
      `/chat_sessions?visitor_id=eq.${encodedVisitorId}&select=*&order=updated_at.desc&limit=1`
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

async function createSession(visitorId) {
  const createdSessions = await supabaseRequest("/chat_sessions", {
    method: "POST",
    body: JSON.stringify({ visitor_id: visitorId }),
  });

  return createdSessions[0];
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeLimit(value) {
  const parsedLimit = Number.parseInt(String(value || defaultHistoryLimit), 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return defaultHistoryLimit;
  }

  return Math.min(parsedLimit, maxHistoryLimit);
}

async function getSession({ visitorId, sessionId }) {
  if (!visitorId) {
    throw createHttpError(
      "visitor_id is required.",
      400,
      "missing visitor_id"
    );
  }

  if (sessionId) {
    const sessionFilters = [
      `id=eq.${encodeURIComponent(sessionId)}`,
      `visitor_id=eq.${encodeURIComponent(visitorId)}`,
    ]
      .filter(Boolean)
      .join("&");
    const sessions = await supabaseRequest(
      `/chat_sessions?${sessionFilters}&select=*&limit=1`
    );

    if (sessions?.[0]) {
      return sessions[0];
    }

    throw createHttpError(
      "session_id does not belong to visitor_id.",
      403,
      "session visitor mismatch"
    );
  }

  return getOrCreateSession(visitorId);
}

function getCreatedTime(message) {
  const time = Date.parse(message?.created_at || "");
  return Number.isNaN(time) ? null : time;
}

function sortMessagesByCreatedAt(messages) {
  return [...(messages || [])].sort((first, second) => {
    const firstTime = getCreatedTime(first);
    const secondTime = getCreatedTime(second);

    if (firstTime === null || secondTime === null) {
      return 0;
    }

    return firstTime - secondTime;
  });
}

async function resolveBeforeCreatedAt(sessionId, before) {
  const normalizedBefore = String(before || "").trim();
  if (!normalizedBefore) {
    return "";
  }

  if (!Number.isNaN(Date.parse(normalizedBefore))) {
    return normalizedBefore;
  }

  const cursorMessages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}&id=eq.${encodeURIComponent(normalizedBefore)}&select=created_at&limit=1`
  );

  return cursorMessages?.[0]?.created_at || null;
}

async function loadMessagesPage({ sessionId, limit, before }) {
  const beforeCreatedAt = await resolveBeforeCreatedAt(sessionId, before);

  if (before && !beforeCreatedAt) {
    return [];
  }

  const beforeFilter = beforeCreatedAt
    ? `&created_at=lt.${encodeURIComponent(beforeCreatedAt)}`
    : "";

  return supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}${beforeFilter}&select=id,sender,message,provider_used,created_at&order=created_at.desc&limit=${limit}`
  );
}

async function loadMessagesAfter({ sessionId, limit, after }) {
  const normalizedAfter = String(after || "").trim();
  const afterFilter =
    normalizedAfter && !Number.isNaN(Date.parse(normalizedAfter))
      ? `&created_at=gt.${encodeURIComponent(normalizedAfter)}`
      : "";

  return supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}${afterFilter}&select=id,sender,message,provider_used,created_at&order=created_at.asc&limit=${limit}`
  );
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
    const requestedVisitorId = String(
      body.visitor_id || firstQueryValue(req.query?.visitor_id) || ""
    ).trim();
    const anonymousVisitorId = String(
      body.anonymous_visitor_id ||
        firstQueryValue(req.query?.anonymous_visitor_id) ||
        ""
    ).trim();
    const lineIdToken = String(
      body.line_id_token || firstQueryValue(req.query?.line_id_token) || ""
    ).trim();
    const identity = await resolveVisitorIdentity({
      visitorId: requestedVisitorId,
      anonymousVisitorId,
      lineIdToken,
    });
    const visitorId = identity.visitorId;
    const sessionId = String(
      body.session_id || firstQueryValue(req.query?.session_id) || ""
    ).trim();
    const limit = normalizeLimit(body.limit || firstQueryValue(req.query?.limit));
    const before = String(
      body.before || firstQueryValue(req.query?.before) || ""
    ).trim();
    const after = String(
      body.after || firstQueryValue(req.query?.after) || ""
    ).trim();
    const sessionOnly =
      body.session_only === true ||
      firstQueryValue(req.query?.session_only) === "true";
    const forceNewSession =
      body.force_new_session === true ||
      firstQueryValue(req.query?.force_new_session) === "true";

    if (!visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    let session = forceNewSession
      ? await createSession(visitorId)
      : await getSession({ visitorId, sessionId });

    session =
      (await updateSessionLineIdentity(session.id, identity.lineProfile)) ||
      session;

    if (sessionOnly) {
      return sendJson(res, 200, {
        session,
        messages: [],
        limit,
        before: null,
        next_before: null,
        has_more: false,
      });
    }
    let messages;

    try {
      messages = after
        ? await loadMessagesAfter({
            sessionId: session.id,
            limit,
            after,
          })
        : await loadMessagesPage({
            sessionId: session.id,
            limit,
            before,
          });
    } catch (error) {
      error.reason = error.reason || "supabase load messages failed";
      throw error;
    }
    const sortedMessages = sortMessagesByCreatedAt(messages);

    return sendJson(res, 200, {
      session,
      messages: sortedMessages,
      limit,
      before: before || null,
      after: after || null,
      next_before: sortedMessages[0]?.created_at || null,
      has_more: !after && sortedMessages.length === limit,
    });
  } catch (error) {
    console.error("chat history error:", error);

    const reason = error?.reason || "unknown error";
    if (reason === "missing env") {
      return sendJson(res, 500, { error: "missing env" });
    }

    if (error?.status === 400 || error?.status === 403) {
      return sendJson(res, error.status, { error: error.message, reason });
    }

    return sendJson(res, 500, {
      error: "Failed to load chat history.",
      reason,
    });
  }
}
