import { createHash } from "node:crypto";

export const AI_CHAT_LIMITS = Object.freeze({
  visitor: { per10Min: 20, perDay: 100 },
  member: { per10Min: 60, perDay: 300 },
  admin: { per10Min: 120, perDay: 1000 },
  global: { perDay: 3000 },
});

const RATE_LIMIT_MESSAGES = Object.freeze({
  user: "慢寶今天接待很多朋友，請稍後再試；也可以登入會員後繼續使用。",
  global: "慢寶今天已經接待很多朋友，請稍後再試，或留下訊息讓我們人工回覆。",
  unavailable: "慢寶暫時無法回覆，請稍後再試。",
});

const adminRateLimitRoles = new Set(["super_admin", "admin", "manager"]);
const tenMinutesMs = 10 * 60 * 1000;
const providerDefault = "deepseek";

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing for AI chat rate limit");
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    serviceRoleKey,
  };
}

async function supabaseRequest(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase rate limit request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function verifyAccessToken(accessToken) {
  if (!accessToken) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user?.id ? user : null;
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function getHeaderValue(req, headerName) {
  const value = req.headers?.[headerName.toLowerCase()] || req.headers?.[headerName] || "";
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return String(value || "");
}

function getClientIp(req) {
  const forwardedFor = getHeaderValue(req, "x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "";
  }

  return (
    getHeaderValue(req, "cf-connecting-ip") ||
    getHeaderValue(req, "x-real-ip") ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ""
  );
}

function hashValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const salt =
    process.env.AI_CHAT_RATE_LIMIT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "mumbao-ai-chat-rate-limit";

  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

function getTaipeiDayStartIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return new Date(`${year}-${month}-${day}T00:00:00+08:00`).toISOString();
}

function buildUsagePath({ sinceIso, filter, limit }) {
  const params = [
    "select=id",
    "event_type=eq.message",
    `created_at=gte.${encodeURIComponent(sinceIso)}`,
    `limit=${limit}`,
  ];

  if (filter) {
    params.push(filter);
  }

  return `/ai_chat_usage_events?${params.join("&")}`;
}

async function countUsageEvents({ sinceIso, filter, maxNeeded }) {
  const rows = await supabaseRequest(
    buildUsagePath({
      sinceIso,
      filter,
      limit: Math.max(1, maxNeeded + 1),
    })
  );

  return Array.isArray(rows) ? rows.length : 0;
}

async function countIdentityUsage({ identity, sinceIso, maxNeeded }) {
  const filters = [];

  if (identity.auth_user_id) {
    filters.push(`auth_user_id=eq.${encodeURIComponent(identity.auth_user_id)}`);
  }

  if (identity.visitor_id) {
    filters.push(`visitor_id=eq.${encodeURIComponent(identity.visitor_id)}`);
  }

  if (identity.ip_hash) {
    filters.push(`ip_hash=eq.${encodeURIComponent(identity.ip_hash)}`);
  }

  if (!filters.length) {
    return 0;
  }

  const counts = await Promise.all(
    filters.map((filter) => countUsageEvents({ sinceIso, filter, maxNeeded }))
  );

  return Math.max(...counts);
}

async function getActiveAdminProfile(authUserId) {
  if (!authUserId) {
    return null;
  }

  const rows = await supabaseRequest(
    `/admin_profiles?select=id,auth_user_id,email,display_name,role_code,is_active&auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&is_active=eq.true&limit=1`
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getActiveCustomerProfile(authUserId) {
  if (!authUserId) {
    return null;
  }

  const rows = await supabaseRequest(
    `/shop_customer_profiles?select=id,auth_user_id,email,name,is_active&auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&is_active=eq.true&limit=1`
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function resolveRateLimitIdentity(req, visitorId) {
  const accessToken = getBearerToken(req);
  const authUser = await verifyAccessToken(accessToken);
  const clientIp = getClientIp(req);
  const userAgent = getHeaderValue(req, "user-agent");

  const identity = {
    user_type: "visitor",
    auth_user_id: authUser?.id || null,
    visitor_id: visitorId || null,
    ip_hash: hashValue(clientIp),
    user_agent_hash: hashValue(userAgent),
    role_code: null,
  };

  if (!authUser?.id) {
    return identity;
  }

  const adminProfile = await getActiveAdminProfile(authUser.id);
  if (adminProfile && adminRateLimitRoles.has(adminProfile.role_code)) {
    return {
      ...identity,
      user_type: "admin",
      role_code: adminProfile.role_code,
    };
  }

  const customerProfile = await getActiveCustomerProfile(authUser.id);
  if (customerProfile) {
    return {
      ...identity,
      user_type: "member",
    };
  }

  return identity;
}

async function insertUsageEvent({ eventType, identity, sessionId, action, provider, model, metadata }) {
  const payload = {
    event_type: eventType,
    user_type: identity.user_type || "unknown",
    auth_user_id: identity.auth_user_id || null,
    visitor_id: identity.visitor_id || null,
    ip_hash: identity.ip_hash || null,
    user_agent_hash: identity.user_agent_hash || null,
    session_id: sessionId || null,
    action: action || null,
    provider: provider || providerDefault,
    model: model || null,
    metadata: metadata || {},
  };

  await supabaseRequest("/ai_chat_usage_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

function buildBlockedMetadata({ reason, tenMinuteCount, dayCount, globalDayCount, limits, identity }) {
  return {
    reason,
    ten_minute_count: tenMinuteCount,
    day_count: dayCount,
    global_day_count: globalDayCount,
    limits,
    role_code: identity.role_code || null,
  };
}

export async function enforceAiChatRateLimit(req, options = {}) {
  const now = new Date();
  const tenMinutesAgoIso = new Date(now.getTime() - tenMinutesMs).toISOString();
  const dayStartIso = getTaipeiDayStartIso(now);
  const action = options.action || "message";
  const provider = options.provider || providerDefault;
  const model = options.model || null;

  try {
    const identity = await resolveRateLimitIdentity(req, options.visitorId);
    const limits = AI_CHAT_LIMITS[identity.user_type] || AI_CHAT_LIMITS.visitor;
    const [tenMinuteCount, dayCount, globalDayCount] = await Promise.all([
      countIdentityUsage({
        identity,
        sinceIso: tenMinutesAgoIso,
        maxNeeded: limits.per10Min,
      }),
      countIdentityUsage({
        identity,
        sinceIso: dayStartIso,
        maxNeeded: limits.perDay,
      }),
      countUsageEvents({
        sinceIso: dayStartIso,
        maxNeeded: AI_CHAT_LIMITS.global.perDay,
      }),
    ]);

    let blockedReason = "";
    let message = RATE_LIMIT_MESSAGES.user;

    if (globalDayCount >= AI_CHAT_LIMITS.global.perDay) {
      blockedReason = "global_daily_limit";
      message = RATE_LIMIT_MESSAGES.global;
    } else if (tenMinuteCount >= limits.per10Min) {
      blockedReason = "user_ten_minute_limit";
    } else if (dayCount >= limits.perDay) {
      blockedReason = "user_daily_limit";
    }

    if (blockedReason) {
      try {
        await insertUsageEvent({
          eventType: "blocked",
          identity,
          sessionId: options.sessionId,
          action,
          provider,
          model,
          metadata: buildBlockedMetadata({
            reason: blockedReason,
            tenMinuteCount,
            dayCount,
            globalDayCount,
            limits,
            identity,
          }),
        });
      } catch (error) {
        console.warn("[ai-chat] Failed to write blocked usage event", error);
      }

      return {
        allowed: false,
        status: 429,
        message,
        reason: blockedReason,
        identity,
      };
    }

    await insertUsageEvent({
      eventType: "message",
      identity,
      sessionId: options.sessionId,
      action,
      provider,
      model,
      metadata: {
        role_code: identity.role_code || null,
      },
    });

    return {
      allowed: true,
      status: 200,
      identity,
    };
  } catch (error) {
    console.error("[ai-chat] Rate limit unavailable", error);
    return {
      allowed: false,
      status: 503,
      message: RATE_LIMIT_MESSAGES.unavailable,
      reason: "rate_limit_unavailable",
    };
  }
}
