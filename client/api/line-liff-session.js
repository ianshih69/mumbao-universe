const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const lineVerifyTimeoutMs = 8000;

function getTimingNow() {
  return Date.now();
}

function logApiTiming(event, startedAt, details = {}) {
  console.log(`[line-liff-session] ${event}`, {
    durationMs: Date.now() - startedAt,
    ...details,
  });
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
      console.warn("[line-liff-session] LINE ID token verify failed", {
        status: response.status,
        message: data?.error_description || data?.error,
      });
      return null;
    }

    return {
      line_user_id: String(data.sub),
      line_display_name: String(data.name || ""),
      line_picture_url: normalizeLinePictureUrl(data.picture),
    };
  } finally {
    clearTimeout(timeoutId);
  }
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
      console.warn("[line-liff-session] LINE access token verify failed", {
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
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyLineIdentity({ idToken, accessToken }) {
  return (
    (await verifyLineIdToken(idToken)) ||
    (await verifyLineAccessToken(accessToken))
  );
}

async function loadSessionById(sessionId) {
  if (!sessionId) return null;
  const sessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`
  );
  return sessions?.[0] || null;
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
  const activeSessions = await supabaseRequest(
    `/chat_sessions?line_user_id=eq.${encodeURIComponent(
      lineUserId
    )}&status=in.(ai_active,human_takeover)&select=*&order=updated_at.desc&limit=20`
  );

  const sessions = activeSessions?.length
    ? activeSessions
    : await supabaseRequest(
        `/chat_sessions?line_user_id=eq.${encodeURIComponent(
          lineUserId
        )}&select=*&order=updated_at.desc&limit=20`
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

async function loadLatestVisitorSession(visitorId) {
  if (!visitorId) return null;
  const sessions = await supabaseRequest(
    `/chat_sessions?visitor_id=eq.${encodeURIComponent(
      visitorId
    )}&select=*&order=updated_at.desc&limit=1`
  );
  return sessions?.[0] || null;
}

async function createLineSession(lineVisitorId) {
  const sessions = await supabaseRequest("/chat_sessions", {
    method: "POST",
    body: JSON.stringify({
      visitor_id: lineVisitorId,
      source: "line_liff",
    }),
  });
  return sessions?.[0] || null;
}

async function updateSessionLineIdentity(sessionId, lineProfile) {
  if (!sessionId) {
    throw new Error("Missing session id for LINE identity update.");
  }

  const lineVisitorId = `line:${lineProfile.line_user_id}`;
  const sessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        visitor_id: lineVisitorId,
        line_user_id: lineProfile.line_user_id,
        line_display_name: lineProfile.line_display_name,
        line_picture_url: lineProfile.line_picture_url,
        source: "line_liff",
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return sessions?.[0] || null;
}

function isSessionAttachable(session, visitorId, lineVisitorId) {
  if (!session) return false;
  const sessionVisitorId = String(session.visitor_id || "");
  return (
    !sessionVisitorId ||
    sessionVisitorId === visitorId ||
    sessionVisitorId === lineVisitorId
  );
}

export default async function handler(req, res) {
  const requestStartedAt = getTimingNow();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    console.log("[line-liff-session] request start", {
      hasIdToken: Boolean(body.idToken || body.id_token || body.line_id_token),
      hasAccessToken: Boolean(
        body.accessToken || body.access_token || body.line_access_token
      ),
      hasVisitorId: Boolean(body.visitorId || body.visitor_id),
      hasCurrentSessionId: Boolean(
        body.currentSessionId || body.current_session_id || body.session_id
      ),
    });
    const verifyStartedAt = getTimingNow();
    const lineProfile = await verifyLineIdentity({
      idToken: body.idToken || body.id_token || body.line_id_token,
      accessToken: body.accessToken || body.access_token || body.line_access_token,
    });
    logApiTiming("LINE token verify end", verifyStartedAt, {
      hasLineUserId: Boolean(lineProfile?.line_user_id),
    });

    if (!lineProfile?.line_user_id) {
      logApiTiming("request end", requestStartedAt, {
        status: 401,
        reason: "LINE identity verification failed",
      });
      return sendJson(res, 401, { error: "LINE identity verification failed." });
    }

    const visitorId = String(body.visitorId || body.visitor_id || "").trim();
    const currentSessionId = String(
      body.currentSessionId || body.current_session_id || body.session_id || ""
    ).trim();
    const lineVisitorId = `line:${lineProfile.line_user_id}`;
    console.log(
      "[line-liff-session] verified userId =",
      lineProfile.line_user_id
    );

    const bestLineSessionStartedAt = getTimingNow();
    const existingLineSession = await loadBestLineSession(
      lineProfile.line_user_id
    );
    logApiTiming("load best LINE session end", bestLineSessionStartedAt, {
      foundSessionId: existingLineSession?.session?.id || "",
      messagePresence: existingLineSession?.messageCount || 0,
    });

    if (existingLineSession?.session?.id) {
      console.log(
        "[line-liff-session] found existing session =",
        existingLineSession.session.id
      );
      console.log(
        "[line-liff-session] reused session reason = line_user_id match"
      );
      console.log(
        "[line-liff-session] selected session has message count =",
        existingLineSession.messageCount
      );

      const updateStartedAt = getTimingNow();
      const session = await updateSessionLineIdentity(
        existingLineSession.session.id,
        lineProfile
      );
      logApiTiming("update session identity end", updateStartedAt, {
        sessionId: session?.id || "",
      });
      logApiTiming("request end", requestStartedAt, {
        status: 200,
        sessionId: session?.id || "",
        reason: "line_user_id match",
      });
      return sendJson(res, 200, {
        session,
        lineProfile,
      });
    }

    const currentSessionStartedAt = getTimingNow();
    const currentSession = await loadSessionById(currentSessionId);
    logApiTiming("load current session end", currentSessionStartedAt, {
      requestedSessionId: currentSessionId,
      foundSessionId: currentSession?.id || "",
    });

    if (isSessionAttachable(currentSession, visitorId, lineVisitorId)) {
      const attachStartedAt = getTimingNow();
      const session = await updateSessionLineIdentity(currentSession.id, lineProfile);
      const messageCount = await countSessionMessages(session.id);
      logApiTiming("attach current session end", attachStartedAt, {
        sessionId: session?.id || "",
        messagePresence: messageCount,
      });
      console.log("[line-liff-session] found existing session =", session.id);
      console.log(
        "[line-liff-session] reused session reason = current session attach"
      );
      console.log(
        "[line-liff-session] selected session has message count =",
        messageCount
      );
      logApiTiming("request end", requestStartedAt, {
        status: 200,
        sessionId: session?.id || "",
        reason: "current session attach",
      });
      return sendJson(res, 200, {
        session,
        lineProfile,
      });
    }

    const visitorSessionStartedAt = getTimingNow();
    const existingVisitorSession = await loadLatestVisitorSession(lineVisitorId);
    const targetSession = existingVisitorSession || (await createLineSession(lineVisitorId));
    logApiTiming("load or create visitor session end", visitorSessionStartedAt, {
      foundExistingVisitorSession: Boolean(existingVisitorSession?.id),
      targetSessionId: targetSession?.id || "",
    });
    if (!targetSession?.id) {
      throw new Error("Failed to create LINE chat session.");
    }
    const updateVisitorStartedAt = getTimingNow();
    const session = await updateSessionLineIdentity(
      targetSession.id,
      lineProfile
    );
    const messageCount = await countSessionMessages(session.id);
    logApiTiming("update visitor session identity end", updateVisitorStartedAt, {
      sessionId: session?.id || "",
      messagePresence: messageCount,
    });

    if (existingVisitorSession?.id) {
      console.log("[line-liff-session] found existing session =", session.id);
      console.log(
        "[line-liff-session] reused session reason = line visitor_id match"
      );
    } else {
      console.log("[line-liff-session] created new session =", session.id);
    }
    console.log(
      "[line-liff-session] selected session has message count =",
      messageCount
    );

    logApiTiming("request end", requestStartedAt, {
      status: 200,
      sessionId: session?.id || "",
      reason: existingVisitorSession?.id
        ? "line visitor_id match"
        : "created line session",
    });
    return sendJson(res, 200, {
      session,
      lineProfile,
    });
  } catch (error) {
    console.error("[line-liff-session] error:", error);
    logApiTiming("request end", requestStartedAt, {
      status: 500,
      message: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 500, { error: "Failed to bind LINE session." });
  }
}
