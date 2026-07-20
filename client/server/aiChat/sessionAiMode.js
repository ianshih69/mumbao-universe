const supportStatusValues = new Set([
  "ai_replying",
  "needs_human",
  "human_takeover",
  "replied",
  "closed",
]);

const pauseDurationMinutes = {
  "30m": 30,
  "1h": 60,
};

export const pauseDurationValues = new Set(["30m", "1h", "manual"]);
export const defaultPauseDuration = "30m";

export function normalizePauseDuration(value, fallback = defaultPauseDuration) {
  const duration = String(value || "").trim();
  return pauseDurationValues.has(duration) ? duration : fallback;
}

export function assertPauseDuration(value) {
  const duration = normalizePauseDuration(value, "");
  if (!duration) {
    const error = new Error("invalid pause_duration.");
    error.status = 400;
    throw error;
  }

  return duration;
}

export function getAiPausedUntilForDuration(
  pauseDuration,
  now = new Date()
) {
  const duration = normalizePauseDuration(pauseDuration);
  if (duration === "manual") return null;

  const minutes = pauseDurationMinutes[duration];
  const nowDate = getNowDate(now);
  return new Date(nowDate.getTime() + minutes * 60 * 1000).toISOString();
}

function getTime(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? null : time;
}

function getNowDate(now = new Date()) {
  return now instanceof Date ? now : new Date(now);
}

export function getSessionSupportStatus(session) {
  const persistedStatus = String(session?.support_status || "").trim();

  if (session?.status === "closed" || persistedStatus === "closed") {
    return "closed";
  }

  if (session?.status === "human_takeover") {
    return "human_takeover";
  }

  if (supportStatusValues.has(persistedStatus)) {
    return persistedStatus;
  }

  if (session?.latest_message_sender === "human") return "replied";
  if (session?.should_ai_reply === false) {
    return Number(session?.unread_count || 0) > 0
      ? "needs_human"
      : "human_takeover";
  }

  return "ai_replying";
}

export function getSessionAiMode(session) {
  return session?.status === "human_takeover" ? "human_takeover" : "ai_active";
}

export function getSessionAiPausedUntil(session) {
  if (session?.status !== "human_takeover") return null;

  const value = String(session?.ai_paused_until || "").trim();
  return value || null;
}

export function isTimedHumanTakeoverExpired(session, now = new Date()) {
  if (session?.status !== "human_takeover") return false;

  const pausedUntil = getTime(session?.ai_paused_until);
  if (pausedUntil === null) return false;

  return pausedUntil <= getNowDate(now).getTime();
}

export function buildExpiredHumanTakeoverPatch(now = new Date()) {
  const timestamp = getNowDate(now).toISOString();

  return {
    status: "ai_active",
    support_status: "needs_human",
    should_ai_reply: true,
    ai_paused_until: null,
    support_status_updated_at: timestamp,
    updated_at: timestamp,
  };
}

export function resolveSessionAiMode(
  session,
  { now = new Date(), expiredAndRestored = false } = {}
) {
  const expired =
    expiredAndRestored || isTimedHumanTakeoverExpired(session, now);

  if (expired) {
    return {
      effectiveStatus: "ai_active",
      supportStatus: "needs_human",
      aiMode: "ai_active",
      aiPausedUntil: null,
      expiredAndRestored: true,
    };
  }

  const aiMode = getSessionAiMode(session);

  return {
    effectiveStatus: aiMode === "human_takeover" ? "human_takeover" : "ai_active",
    supportStatus: getSessionSupportStatus(session),
    aiMode,
    aiPausedUntil: getSessionAiPausedUntil(session),
    expiredAndRestored: false,
  };
}

export function buildSessionModeBody(session, options = {}) {
  const resolved = resolveSessionAiMode(session, options);

  return {
    support_status: resolved.supportStatus,
    ai_mode: resolved.aiMode,
    ai_paused_until: resolved.aiPausedUntil,
    ...(resolved.expiredAndRestored
      ? { expired_human_takeover_restored: true }
      : {}),
  };
}

export async function normalizeExpiredHumanTakeover(
  session,
  { supabaseRequest, now = new Date() } = {}
) {
  if (!session?.id || !isTimedHumanTakeoverExpired(session, now)) {
    return session;
  }

  if (typeof supabaseRequest !== "function") {
    return {
      ...session,
      ...buildExpiredHumanTakeoverPatch(now),
    };
  }

  const timestamp = getNowDate(now).toISOString();
  const restoredSessions = await supabaseRequest(
    `/chat_sessions?id=eq.${encodeURIComponent(
      session.id
    )}&status=eq.human_takeover&ai_paused_until=not.is.null&ai_paused_until=lte.${encodeURIComponent(
      timestamp
    )}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildExpiredHumanTakeoverPatch(now)),
    }
  );

  return restoredSessions?.[0]
    ? restoredSessions[0]
    : {
        ...session,
        ...buildExpiredHumanTakeoverPatch(now),
      };
}

export async function normalizeExpiredHumanTakeovers(
  sessions,
  options = {}
) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  return Promise.all(
    sessions.map((session) => normalizeExpiredHumanTakeover(session, options))
  );
}
