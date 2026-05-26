const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;
const lineVerifyTimeoutMs = 8000;

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

async function loadLatestLineSession(lineUserId) {
  const sessions = await supabaseRequest(
    `/chat_sessions?line_user_id=eq.${encodeURIComponent(
      lineUserId
    )}&status=neq.closed&select=*&order=updated_at.desc&limit=1`
  );
  return sessions?.[0] || null;
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(req);
    const lineProfile = await verifyLineIdentity({
      idToken: body.idToken || body.id_token || body.line_id_token,
      accessToken: body.accessToken || body.access_token || body.line_access_token,
    });

    if (!lineProfile?.line_user_id) {
      return sendJson(res, 401, { error: "LINE identity verification failed." });
    }

    const visitorId = String(body.visitorId || body.visitor_id || "").trim();
    const currentSessionId = String(
      body.currentSessionId || body.current_session_id || body.session_id || ""
    ).trim();
    const lineVisitorId = `line:${lineProfile.line_user_id}`;
    const currentSession = await loadSessionById(currentSessionId);

    if (isSessionAttachable(currentSession, visitorId, lineVisitorId)) {
      const session = await updateSessionLineIdentity(currentSession.id, lineProfile);
      return sendJson(res, 200, {
        session,
        lineProfile,
      });
    }

    const existingLineSession =
      (await loadLatestLineSession(lineProfile.line_user_id)) ||
      (await loadLatestVisitorSession(lineVisitorId));
    const targetSession = existingLineSession || (await createLineSession(lineVisitorId));
    if (!targetSession?.id) {
      throw new Error("Failed to create LINE chat session.");
    }
    const session = await updateSessionLineIdentity(
      targetSession.id,
      lineProfile
    );

    return sendJson(res, 200, {
      session,
      lineProfile,
    });
  } catch (error) {
    console.error("[line-liff-session] error:", error);
    return sendJson(res, 500, { error: "Failed to bind LINE session." });
  }
}
