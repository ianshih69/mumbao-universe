import {
  buildCustomerSessionPatch,
  isSessionOwnedByCustomer,
  resolveCustomerIdentity,
} from "./customerIdentity.js";
import {
  buildSessionErrorBody,
  createInvalidSessionIdError,
  createSessionOwnershipMismatchError,
  isValidSessionUuid,
} from "./sessionValidation.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const lineVerifyTimeoutMs = 8000;
const defaultHistoryLimit = 7;
const maxHistoryLimit = 100;
const chatDebugEnabled =
  String(process.env.NEXT_PUBLIC_CHAT_DEBUG || "").toLowerCase() === "true";

function logApiDebug(event, details = {}) {
  if (!chatDebugEnabled) return;

  console.log(`[ai-chat-history] ${event}`, details);
}

function getTimingNow() {
  return Date.now();
}

function logApiTiming(event, startedAt, details = {}) {
  logApiDebug(event, {
    durationMs: Date.now() - startedAt,
    ...details,
  });
}

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
  const channelId = getLineChannelId();

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

function normalizeLinePictureUrl(value) {
  const pictureUrl = String(value || "").trim();
  return pictureUrl.startsWith("https://profile.line-scdn.net/") ? pictureUrl : "";
}

function getLineChannelId() {
  const explicitChannelId = String(process.env.LINE_CHANNEL_ID || "").trim();
  if (explicitChannelId) {
    return explicitChannelId;
  }

  return String(process.env.NEXT_PUBLIC_LIFF_ID || "").split("-")[0].trim();
}

async function verifyLineAccessToken(accessToken) {
  const normalizedToken = String(accessToken || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), lineVerifyTimeoutMs);

  try {
    const response = await fetch("https://api.line.me/v2/profile", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.userId) {
      console.warn("[ai-chat] LINE access token verify failed", {
        status: response.status,
        message: data?.message,
      });
      return null;
    }

    return {
      line_user_id: String(data.userId),
      line_display_name: String(data.displayName || ""),
      line_picture_url: normalizeLinePictureUrl(data.pictureUrl),
    };
  } catch (error) {
    console.warn("[ai-chat] LINE access token verify unavailable", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyLineIdentity({ lineIdToken, lineAccessToken }) {
  const idTokenProfile = await verifyLineIdToken(lineIdToken);
  if (idTokenProfile?.line_user_id) {
    return {
      ...idTokenProfile,
      line_picture_url: normalizeLinePictureUrl(idTokenProfile.line_picture_url),
    };
  }

  return verifyLineAccessToken(lineAccessToken);
}

async function resolveVisitorIdentity({ visitorId, anonymousVisitorId, lineIdToken, lineAccessToken }) {
  const verifiedLineProfile = await verifyLineIdentity({
    lineIdToken,
    lineAccessToken,
  });

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
          source: "line_liff",
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return updatedSessions?.[0] || null;
  } catch (error) {
    console.error("[ai-chat] failed to save LINE session identity:", error);
    return null;
  }
}

async function countSessionMessages(sessionId) {
  if (!sessionId) return 0;

  const messages = await supabaseRequest(
    `/chat_messages?session_id=eq.${encodeURIComponent(
      sessionId
    )}&select=id&limit=1`
  );

  return Array.isArray(messages) ? messages.length : 0;
}

function getSessionSortTime(session) {
  const time = Date.parse(
    session?.latest_message_at || session?.updated_at || session?.created_at || ""
  );

  return Number.isNaN(time) ? 0 : time;
}

function selectBestLineSession(sessionEntries) {
  return [...sessionEntries].sort((first, second) => {
    const firstHumanPriority = first.session?.status === "human_takeover" ? 0 : 1;
    const secondHumanPriority = second.session?.status === "human_takeover" ? 0 : 1;
    if (firstHumanPriority !== secondHumanPriority) {
      return firstHumanPriority - secondHumanPriority;
    }

    const firstMessagePriority = first.messageCount > 0 ? 0 : 1;
    const secondMessagePriority = second.messageCount > 0 ? 0 : 1;
    if (firstMessagePriority !== secondMessagePriority) {
      return firstMessagePriority - secondMessagePriority;
    }

    return getSessionSortTime(second.session) - getSessionSortTime(first.session);
  })[0];
}

async function loadBestLineSession(lineUserId) {
  if (!lineUserId) return null;

  const activeSessions = await supabaseRequest(
    `/chat_sessions?line_user_id=eq.${encodeURIComponent(
      lineUserId
    )}&deleted_at=is.null&status=in.(ai_active,human_takeover)&select=*&order=updated_at.desc&limit=20`
  );

  const sessions = activeSessions?.length
    ? activeSessions
    : await supabaseRequest(
        `/chat_sessions?line_user_id=eq.${encodeURIComponent(
          lineUserId
        )}&deleted_at=is.null&select=*&order=updated_at.desc&limit=20`
      ).then((items) =>
        (items || []).filter((session) => session?.status !== "closed")
      );

  if (!sessions?.length) {
    return null;
  }

  const entries = await Promise.all(
    sessions.map(async (session) => ({
      session,
      messageCount: await countSessionMessages(session.id),
    }))
  );

  return selectBestLineSession(entries) || null;
}

function normalizeEntrySource(value) {
  const source = String(value || "").trim().toLowerCase();
  return source === "line_liff" || source === "line" || source === "liff"
    ? "line_liff"
    : "";
}

function buildCreateSessionPayload(visitorId, customerIdentity, entrySource = "") {
  return {
    visitor_id: visitorId,
    ...(entrySource ? { source: entrySource } : {}),
    ...buildCustomerSessionPatch(customerIdentity),
  };
}

async function linkSessionToEntrySource(session, entrySource) {
  if (!session?.id || !entrySource || session.source === entrySource) {
    return session;
  }

  const updatedSessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        source: entrySource,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return updatedSessions?.[0] || session;
}

async function linkSessionToCustomer(session, customerIdentity) {
  if (!session?.id || !customerIdentity?.authUserId) {
    return session;
  }

  if (session.auth_user_id && !isSessionOwnedByCustomer(session, customerIdentity)) {
    throw createHttpError(
      "session_id does not belong to customer.",
      403,
      "session customer mismatch"
    );
  }

  const patch = buildCustomerSessionPatch(customerIdentity, session);
  if (!Object.keys(patch).length) {
    return session;
  }

  const updatedSessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return updatedSessions?.[0] || session;
}

async function getLatestCustomerSession(customerIdentity) {
  if (!customerIdentity?.authUserId) {
    return null;
  }

  const sessions = await supabaseRequest(
    `/chat_sessions?auth_user_id=eq.${encodeURIComponent(
      customerIdentity.authUserId
    )}&deleted_at=is.null&select=*&order=latest_message_at.desc.nullslast,updated_at.desc&limit=1`
  );

  return sessions?.[0] || null;
}

async function loadCustomerSessions(customerIdentity) {
  if (!customerIdentity?.authUserId) {
    return [];
  }

  const sessions = await supabaseRequest(
    `/chat_sessions?auth_user_id=eq.${encodeURIComponent(
      customerIdentity.authUserId
    )}&deleted_at=is.null&select=id,visitor_id,last_message,latest_message_at,last_message_at,title,created_at,updated_at,source,line_user_id&order=latest_message_at.desc.nullslast,updated_at.desc&limit=8`
  );

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const previews = await Promise.all(
    sessions.map(async (session) => {
      if (!session?.id) return "";

      const messages = await supabaseRequest(
        `/chat_messages?session_id=eq.${encodeURIComponent(
          session.id
        )}&sender=eq.user&deleted_at=is.null&select=message,created_at&order=created_at.desc&limit=1`
      );

      return String(messages?.[0]?.message || "");
    })
  );

  return sessions.map((session, index) => ({
    ...session,
    preview_message: previews[index] || "",
  }));
}

async function getOrCreateSession(visitorId, customerIdentity, entrySource = "") {
  const latestCustomerSession = await getLatestCustomerSession(customerIdentity);
  if (latestCustomerSession) {
    return linkSessionToEntrySource(latestCustomerSession, entrySource);
  }

  const encodedVisitorId = encodeURIComponent(visitorId);
  let sessions;

  try {
    sessions = await supabaseRequest(
      `/chat_sessions?visitor_id=eq.${encodedVisitorId}&auth_user_id=is.null&deleted_at=is.null&select=*&order=updated_at.desc&limit=1`
    );
  } catch (error) {
    error.reason = error.reason || "supabase create session failed";
    throw error;
  }

  if (sessions?.[0]) {
    const customerSession = await linkSessionToCustomer(sessions[0], customerIdentity);
    return linkSessionToEntrySource(customerSession, entrySource);
  }

  let createdSessions;

  try {
    createdSessions = await supabaseRequest("/chat_sessions", {
      method: "POST",
      body: JSON.stringify(
        buildCreateSessionPayload(visitorId, customerIdentity, entrySource)
      ),
    });
  } catch (error) {
    error.reason = error.reason || "supabase create session failed";
    throw error;
  }

  return createdSessions[0];
}

async function createSession(visitorId, customerIdentity, entrySource = "") {
  const createdSessions = await supabaseRequest("/chat_sessions", {
    method: "POST",
    body: JSON.stringify(
      buildCreateSessionPayload(visitorId, customerIdentity, entrySource)
    ),
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

async function getSession({
  visitorId,
  sessionId,
  lineProfile,
  customerIdentity,
  entrySource = "",
}) {
  if (!visitorId) {
    throw createHttpError(
      "visitor_id is required.",
      400,
      "missing visitor_id"
    );
  }

  if (!sessionId && lineProfile?.line_user_id) {
    const existingLineSession = await loadBestLineSession(lineProfile.line_user_id);

    if (existingLineSession?.session?.id) {
      logApiDebug("reused session", {
        reason: "line_user_id match",
        selectedSessionHasMessageCount: existingLineSession.messageCount,
      });
      const customerSession = await linkSessionToCustomer(
        existingLineSession.session,
        customerIdentity
      );
      return linkSessionToEntrySource(customerSession, entrySource);
    }
  }

  if (sessionId) {
    if (!isValidSessionUuid(sessionId)) {
      throw createInvalidSessionIdError();
    }

    const sessionFilters = customerIdentity?.authUserId
      ? `id=eq.${encodeURIComponent(sessionId)}&deleted_at=is.null`
      : `id=eq.${encodeURIComponent(sessionId)}&visitor_id=eq.${encodeURIComponent(
          visitorId
        )}&auth_user_id=is.null&deleted_at=is.null`;
    const sessions = await supabaseRequest(
      `/chat_sessions?${sessionFilters}&select=*&limit=1`
    );

    const session = sessions?.[0];
    if (session) {
      if (customerIdentity?.authUserId) {
        const canUseSession =
          isSessionOwnedByCustomer(session, customerIdentity) ||
          (!session.auth_user_id && session.visitor_id === visitorId);

        if (canUseSession) {
          const customerSession = await linkSessionToCustomer(
            session,
            customerIdentity
          );
          return linkSessionToEntrySource(customerSession, entrySource);
        }
      } else {
        return linkSessionToEntrySource(session, entrySource);
      }
    }

    throw createSessionOwnershipMismatchError();
  }

  return getOrCreateSession(visitorId, customerIdentity, entrySource);
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
    )}&deleted_at=is.null&id=eq.${encodeURIComponent(normalizedBefore)}&select=created_at&limit=1`
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
    )}&deleted_at=is.null${beforeFilter}&select=id,sender,message,provider_used,created_at&order=created_at.desc&limit=${limit}`
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
    )}&deleted_at=is.null${afterFilter}&select=id,sender,message,provider_used,created_at&order=created_at.asc&limit=${limit}`
  );
}

export default async function handler(req, res) {
  const requestStartedAt = getTimingNow();
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
    const lineAccessToken = String(
      body.line_access_token || firstQueryValue(req.query?.line_access_token) || ""
    ).trim();
    const entrySource = normalizeEntrySource(
      body.source ||
        body.entry_source ||
        firstQueryValue(req.query?.source) ||
        firstQueryValue(req.query?.entry_source)
    );
    logApiDebug("request start", {
      method: req.method,
      hasVisitorId: Boolean(requestedVisitorId),
      hasSessionId: Boolean(body.session_id || firstQueryValue(req.query?.session_id)),
      hasLineIdToken: Boolean(lineIdToken),
      hasLineAccessToken: Boolean(lineAccessToken),
      entrySource,
    });
    const identityStartedAt = getTimingNow();
    const identity = await resolveVisitorIdentity({
      visitorId: requestedVisitorId,
      anonymousVisitorId,
      lineIdToken,
      lineAccessToken,
    });
    const customerIdentity = await resolveCustomerIdentity(req);
    logApiTiming("identity resolve end", identityStartedAt, {
      hasLineProfile: Boolean(identity.lineProfile?.line_user_id),
      resolvedVisitorId: identity.visitorId,
      hasCustomer: Boolean(customerIdentity?.authUserId),
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
    const listOnly =
      body.list_only === true ||
      firstQueryValue(req.query?.list_only) === "true";
    const forceNewSession =
      body.force_new_session === true ||
      firstQueryValue(req.query?.force_new_session) === "true";

    if (listOnly) {
      if (!customerIdentity?.authUserId) {
        return sendJson(res, 401, { error: "Login is required." });
      }

      const customerSessions = await loadCustomerSessions(customerIdentity);
      logApiTiming("request end", requestStartedAt, {
        listOnly: true,
        sessionCount: customerSessions.length,
      });

      return sendJson(res, 200, {
        session: null,
        sessions: customerSessions,
        messages: [],
        limit,
        before: null,
        next_before: null,
        has_more: false,
      });
    }

    if (!visitorId) {
      return sendJson(res, 400, { error: "visitor_id is required." });
    }

    const sessionStartedAt = getTimingNow();
    let session = forceNewSession
      ? await createSession(visitorId, customerIdentity, entrySource)
      : await getSession({
          visitorId,
          sessionId,
          lineProfile: identity.lineProfile,
          customerIdentity,
          entrySource,
        });

    session =
      (await updateSessionLineIdentity(session.id, identity.lineProfile)) ||
      session;
    logApiTiming("session resolve end", sessionStartedAt, {
      sessionId: session?.id || "",
      visitorId: session?.visitor_id || visitorId,
      forceNewSession,
      requestedSessionId: sessionId,
    });

    if (sessionOnly) {
      const customerSessions = await loadCustomerSessions(customerIdentity);
      logApiTiming("request end", requestStartedAt, {
        sessionOnly: true,
        sessionId: session.id,
      });
      return sendJson(res, 200, {
        session,
        sessions: customerSessions,
        messages: [],
        limit,
        before: null,
        next_before: null,
        has_more: false,
      });
    }
    let messages;

    try {
      const messagesStartedAt = getTimingNow();
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
      logApiTiming("messages query end", messagesStartedAt, {
        sessionId: session.id,
        limit,
        before: Boolean(before),
        after: Boolean(after),
        messageCount: Array.isArray(messages) ? messages.length : 0,
      });
    } catch (error) {
      error.reason = error.reason || "supabase load messages failed";
      throw error;
    }
    const sortedMessages = sortMessagesByCreatedAt(messages);
    const customerSessions = await loadCustomerSessions(customerIdentity);

    logApiTiming("request end", requestStartedAt, {
      sessionOnly: false,
      sessionId: session.id,
      limit,
      messageCount: sortedMessages.length,
      hasMore: !after && sortedMessages.length === limit,
    });

    return sendJson(res, 200, {
      session,
      sessions: customerSessions,
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

    if (error?.errorCode && (error?.status === 400 || error?.status === 403)) {
      return sendJson(res, error.status, buildSessionErrorBody(error));
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
