import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { cn } from "@/lib/utils";

type ChatRole = "assistant" | "user" | "human" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  message: string;
  created_at?: string;
  provider_used?: string | null;
  isWelcome?: boolean;
};

type ApiMessage = {
  id?: string | number;
  sender?: string;
  message?: string;
  provider_used?: string | null;
  created_at?: string;
};

type LineProfile = {
  userId?: string;
  displayName?: string;
  pictureUrl?: string;
};

type LineIdentity = {
  idToken?: string;
  accessToken?: string;
};

type LiffSdk = {
  init: (options: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  isInClient?: () => boolean;
  login: (options?: { redirectUri?: string }) => void;
  getProfile: () => Promise<LineProfile>;
  getIDToken: () => string | null;
  getAccessToken?: () => string | null;
  getDecodedIDToken?: () => Record<string, unknown> | null;
};

type ChatSession = {
  id?: string | number;
  visitor_id?: string;
  source?: string;
  line_user_id?: string;
  line_display_name?: string;
  line_picture_url?: string;
};

type SessionRequestIdentity = {
  lineIdentity?: LineIdentity | null;
  anonymousVisitorId?: string;
};

type ChatWindowSize = {
  width: number;
  height: number;
};

type ResizeDirection = "left" | "top" | "top-left" | "bottom-right";

const visitorStorageKey = "mumbao-chat-visitor-id";
const legacyVisitorStorageKey = "mumbao_visitor_id";
const sessionStorageKey = "mumbao-chat-session-id";
const visitorCookieKey = "mumbao_chat_visitor_id";
const recentChatStorageKey = "mumbao_chat_recent_messages";
const chatWindowSizeStorageKey = "mumbao-chat-window-size";
const lineLiffSdkUrl = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const lineLoginRedirectUri = "https://www.mumbao.tw/chat";
const historyPageSize = 7;
const initialHistoryPageSize = 100;
const localCacheMessageLimit = 50;
const recentContextMessageLimit = 12;
const sessionMessagesCacheTtlMs = 10 * 60 * 1000;
const defaultDesktopWindowSize = { width: 420, height: 680 };
const minDesktopWindowSize = { width: 360, height: 480 };
const maxDesktopWindowSize = { width: 720, height: 900 };
const welcomeMessage =
  "嗨，我是慢寶。你可以問我住宿、包棟、寵物、停車、入住時間，或白雲基地的故事。";
const errorReply = "慢寶的雲朵訊號暫時不穩，請稍後再試。";
const chatDebugEnabled =
  String(
    (import.meta.env.NEXT_PUBLIC_CHAT_DEBUG || import.meta.env.VITE_CHAT_DEBUG || "")
  ).toLowerCase() === "true";

function logChatDebug(event: string, details: Record<string, unknown> = {}) {
  if (!chatDebugEnabled) return;

  console.info(`[MumbaoChat] ${event}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function getTimingNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function logChatTiming(
  event: string,
  startedAt: number,
  details: Record<string, unknown> = {}
) {
  logChatDebug(event, {
    durationMs: Math.round(getTimingNow() - startedAt),
    ...details,
  });
}

function createLocalId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function createMessage(role: ChatRole, message: string): ChatMessage {
  return {
    id: createLocalId(),
    role,
    message,
    created_at: new Date().toISOString(),
  };
}

function createWelcomeMessage() {
  return {
    ...createMessage("assistant", welcomeMessage),
    isWelcome: true,
  };
}

function getCookieValue(name: string) {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

function setCookieValue(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
}

function persistVisitorId(visitorId: string) {
  localStorage.setItem(visitorStorageKey, visitorId);
  setCookieValue(visitorCookieKey, visitorId);
}

function getVisitorIdentity() {
  const existingVisitorId =
    localStorage.getItem(visitorStorageKey) ||
    localStorage.getItem(legacyVisitorStorageKey) ||
    getCookieValue(visitorCookieKey);

  if (existingVisitorId) {
    persistVisitorId(existingVisitorId);
    return {
      visitorId: existingVisitorId,
      isExistingVisitor: true,
    };
  }

  const nextVisitorId = createLocalId();
  persistVisitorId(nextVisitorId);

  return {
    visitorId: nextVisitorId,
    isExistingVisitor: false,
  };
}

function isLineVisitorId(visitorId: string) {
  return visitorId.startsWith("line:");
}

function getStoredSessionId(visitorId: string) {
  const rawSession = localStorage.getItem(sessionStorageKey) || "";
  if (!rawSession) return "";

  try {
    const session = JSON.parse(rawSession) as {
      visitor_id?: string;
      session_id?: string;
    };

    return session.visitor_id === visitorId ? session.session_id || "" : "";
  } catch {
    return isLineVisitorId(visitorId) ? "" : rawSession;
  }
}

function saveSessionId(nextSessionId: string, visitorId: string) {
  if (!nextSessionId || !visitorId) return;
  localStorage.setItem(
    sessionStorageKey,
    JSON.stringify({
      visitor_id: visitorId,
      session_id: nextSessionId,
    })
  );
}

function clearSessionId() {
  localStorage.removeItem(sessionStorageKey);
}

function normalizeMessage(apiMessage: ApiMessage): ChatMessage {
  const sender = String(apiMessage.sender || "").toLowerCase();
  const role =
    sender === "user"
      ? "user"
      : sender === "human"
        ? "human"
        : sender === "system"
          ? "system"
          : "assistant";

  return {
    id: String(apiMessage.id || createLocalId()),
    role,
    message: String(apiMessage.message || ""),
    provider_used: apiMessage.provider_used,
    created_at: apiMessage.created_at,
  };
}

function getInitialMessages(messages: ChatMessage[]) {
  return messages.length > 0 ? messages : [createWelcomeMessage()];
}

function getCreatedTime(message: ChatMessage) {
  const time = Date.parse(message.created_at || "");
  return Number.isNaN(time) ? null : time;
}

function getTaipeiDateParts(value: string | Date | number) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
}

function getTaipeiDateKey(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return "";
  }

  const { year, month, day } = getTaipeiDateParts(value);
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function formatTaipeiDateLabel(value?: string) {
  const key = getTaipeiDateKey(value);
  if (!key || !value) return "";

  const todayKey = getTaipeiDateKey(new Date().toISOString());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getTaipeiDateKey(yesterday.toISOString());

  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";

  const { year, month, day } = getTaipeiDateParts(value);
  return `${year}/${month}/${day}`;
}

function formatTaipeiMessageTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function sortMessagesByCreatedAt(messages: ChatMessage[]) {
  return [...messages].sort((first, second) => {
    const firstTime = getCreatedTime(first);
    const secondTime = getCreatedTime(second);

    if (firstTime === null || secondTime === null) {
      return 0;
    }

    return firstTime - secondTime;
  });
}

function isRealChatMessage(message: ChatMessage) {
  return !message.isWelcome && message.message.trim().length > 0;
}

function dedupeMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const key = message.created_at
      ? `${message.created_at}:${message.role}:${message.message}`
      : message.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const merged = dedupeMessages([
    ...incoming,
    ...current.filter((message) => isRealChatMessage(message)),
  ]);

  return getInitialMessages(sortMessagesByCreatedAt(merged));
}

function getOldestCreatedAt(messages: ChatMessage[]) {
  return sortMessagesByCreatedAt(messages.filter(isRealChatMessage)).find(
    (message) => message.created_at
  )?.created_at;
}

function getNewestCreatedAt(messages: ChatMessage[]) {
  return sortMessagesByCreatedAt(messages.filter(isRealChatMessage))
    .reverse()
    .find((message) => message.created_at)?.created_at;
}

type RecentMessagesCache = {
  visitorId: string;
  sessionId: string;
  messages: ChatMessage[];
  source: "sessionStorage" | "localStorage";
};

function clearCachedMessages(reason: string, details: Record<string, unknown> = {}) {
  try {
    sessionStorage.removeItem(recentChatStorageKey);
    localStorage.removeItem(recentChatStorageKey);
    logChatDebug("cache cleared", { reason, ...details });
  } catch (error) {
    console.warn("Mumbao chat cache clear unavailable:", error);
  }
}

function readRecentMessagesCache(): RecentMessagesCache | null {
  try {
    const storageEntries: Array<["sessionStorage" | "localStorage", string | null]> = [
      ["sessionStorage", sessionStorage.getItem(recentChatStorageKey)],
      ["localStorage", localStorage.getItem(recentChatStorageKey)],
    ];

    for (const [source, rawCache] of storageEntries) {
      if (!rawCache) continue;

      const cache = JSON.parse(rawCache) as {
        visitor_id?: string;
        session_id?: string;
        expires_at?: number;
        messages?: ApiMessage[];
      };

      if (cache.expires_at && cache.expires_at < Date.now()) {
        if (source === "sessionStorage") {
          sessionStorage.removeItem(recentChatStorageKey);
        } else {
          localStorage.removeItem(recentChatStorageKey);
        }
        logChatDebug("cache read miss: expired", {
          source,
          cacheVisitorId: cache.visitor_id,
          cacheSessionId: cache.session_id,
        });
        continue;
      }

      if (!cache.session_id || !Array.isArray(cache.messages)) {
        logChatDebug("cache read miss: invalid payload", {
          source,
          cacheVisitorId: cache.visitor_id,
          cacheSessionId: cache.session_id,
          hasMessagesArray: Array.isArray(cache.messages),
        });
        continue;
      }

      const cachedMessages = sortMessagesByCreatedAt(
        cache.messages
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0)
      );

      if (cachedMessages.length === 0) {
        logChatDebug("cache read miss: no real messages", {
          source,
          cacheVisitorId: cache.visitor_id,
          cacheSessionId: cache.session_id,
        });
        continue;
      }

      logChatDebug("cache read hit", {
        source,
        cacheVisitorId: cache.visitor_id,
        cacheSessionId: cache.session_id,
        messageCount: cachedMessages.length,
      });

      return {
        visitorId: String(cache.visitor_id || ""),
        sessionId: String(cache.session_id || ""),
        messages: cachedMessages,
        source,
      };
    }

    logChatDebug("cache read miss: empty");
    return null;
  } catch (error) {
    console.warn("Mumbao chat cache unavailable:", error);
    return null;
  }
}

function loadCachedMessages(visitorId: string, sessionId = "") {
  const cache = readRecentMessagesCache();

  if (!cache) {
    return [];
  }

  if (cache.visitorId !== visitorId) {
    logChatDebug("cache read miss: visitor mismatch", {
      visitorId,
      sessionId,
      cacheVisitorId: cache.visitorId,
      cacheSessionId: cache.sessionId,
    });
    return [];
  }

  if (sessionId && cache.sessionId !== sessionId) {
    logChatDebug("cache read miss: session mismatch", {
      visitorId,
      sessionId,
      cacheSessionId: cache.sessionId,
    });
    return [];
  }

  return cache.messages;
}

function saveCachedMessages(
  visitorId: string,
  messages: ChatMessage[],
  sessionId = ""
) {
  const cacheMessages = messages
    .filter(isRealChatMessage)
    .slice(-localCacheMessageLimit)
    .map((message) => ({
      id: message.id,
      sender:
        message.role === "user"
          ? "user"
          : message.role === "human"
            ? "human"
            : message.role === "system"
              ? "system"
              : "ai",
      message: message.message,
      provider_used: message.provider_used,
      created_at: message.created_at,
    }));

  if (!visitorId || !sessionId || cacheMessages.length === 0) {
    logChatDebug("cache write skipped", {
      visitorId,
      sessionId,
      messageCount: cacheMessages.length,
    });
    return;
  }

  try {
    const cachePayload = JSON.stringify({
      visitor_id: visitorId,
      session_id: sessionId,
      expires_at: Date.now() + sessionMessagesCacheTtlMs,
      messages: cacheMessages,
    });
    sessionStorage.setItem(recentChatStorageKey, cachePayload);
    localStorage.setItem(recentChatStorageKey, cachePayload);
    logChatDebug("cache write success", {
      visitorId,
      sessionId,
      messageCount: cacheMessages.length,
    });
  } catch (error) {
    console.warn("Mumbao chat cache save unavailable:", error);
  }
}

function getRecentMessagesForApi(messages: ChatMessage[]) {
  return messages
    .filter(isRealChatMessage)
    .slice(-recentContextMessageLimit)
    .map((message) => ({
      sender: message.role === "user" ? "user" : "ai",
      message: message.message,
      created_at: message.created_at,
    }));
}

function getMaxDesktopWindowSize() {
  if (typeof window === "undefined") {
    return maxDesktopWindowSize;
  }

  return {
    width: Math.min(window.innerWidth * 0.9, maxDesktopWindowSize.width),
    height: Math.min(window.innerHeight * 0.9, maxDesktopWindowSize.height),
  };
}

function clampChatWindowSize(size: ChatWindowSize): ChatWindowSize {
  const maxSize = getMaxDesktopWindowSize();

  return {
    width: Math.round(
      Math.min(Math.max(size.width, minDesktopWindowSize.width), maxSize.width)
    ),
    height: Math.round(
      Math.min(Math.max(size.height, minDesktopWindowSize.height), maxSize.height)
    ),
  };
}

function loadChatWindowSize() {
  if (typeof window === "undefined") {
    return defaultDesktopWindowSize;
  }

  try {
    const rawSize = localStorage.getItem(chatWindowSizeStorageKey);
    if (!rawSize) {
      return clampChatWindowSize(defaultDesktopWindowSize);
    }

    const size = JSON.parse(rawSize) as Partial<ChatWindowSize>;
    return clampChatWindowSize({
      width: Number(size.width) || defaultDesktopWindowSize.width,
      height: Number(size.height) || defaultDesktopWindowSize.height,
    });
  } catch (error) {
    console.warn("Mumbao chat window size unavailable:", error);
    return clampChatWindowSize(defaultDesktopWindowSize);
  }
}

function saveChatWindowSize(size: ChatWindowSize) {
  try {
    localStorage.setItem(chatWindowSizeStorageKey, JSON.stringify(size));
  } catch (error) {
    console.warn("Mumbao chat window size save unavailable:", error);
  }
}

function getLineLiffId() {
  const env = import.meta.env as Record<string, string | undefined>;
  return String(env.NEXT_PUBLIC_LIFF_ID || env.VITE_LINE_LIFF_ID || "").trim();
}

function getWindowLiff() {
  return (window as Window & { liff?: LiffSdk }).liff;
}

function loadLineLiffSdk() {
  const existingLiff = getWindowLiff();
  if (existingLiff) {
    return Promise.resolve(existingLiff);
  }

  return import("@line/liff")
    .then((module) => (module.default || module) as LiffSdk)
    .catch(() => loadLineLiffSdkFromScript());
}

function loadLineLiffSdkFromScript() {
  return new Promise<LiffSdk>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${lineLiffSdkUrl}"]`
    );

    const resolveLoadedLiff = () => {
      const liff = getWindowLiff();
      if (liff) {
        resolve(liff);
      } else {
        reject(new Error("LIFF SDK did not initialize."));
      }
    };

    if (existingScript) {
      if (existingScript.dataset.liffLoaded === "true") {
        resolveLoadedLiff();
        return;
      }

      existingScript.addEventListener("load", resolveLoadedLiff, {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load LIFF SDK.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = lineLiffSdkUrl;
    script.async = true;
    script.onload = () => {
      script.dataset.liffLoaded = "true";
      resolveLoadedLiff();
    };
    script.onerror = () => reject(new Error("Failed to load LIFF SDK."));
    document.head.appendChild(script);
  });
}

function shouldRequestLineLogin(liff: LiffSdk) {
  const params = new URLSearchParams(window.location.search);
  const isLineLiffRedirect =
    params.has("liff.state") || document.referrer.includes("liff.line.me");
  const isExplicitLineEntry =
    params.get("liff") === "1" || params.get("fromLine") === "1";

  return Boolean(
    liff.isInClient?.() || isLineLiffRedirect || isExplicitLineEntry
  );
}

async function loadLineIdentity(): Promise<LineIdentity | null> {
  const liffId = getLineLiffId();
  if (!liffId) {
    return null;
  }

  let initStartedAt = 0;
  try {
    initStartedAt = getTimingNow();
    logChatDebug("liff.init start", { hasLiffId: Boolean(liffId) });
    const liff = await loadLineLiffSdk();
    await liff.init({ liffId });
    logChatTiming("liff.init end", initStartedAt, {
      status: "success",
      isLoggedIn: liff.isLoggedIn(),
      isInClient: Boolean(liff.isInClient?.()),
    });

    if (!liff.isLoggedIn()) {
      if (shouldRequestLineLogin(liff)) {
        liff.login({
          redirectUri: lineLoginRedirectUri,
        });
      }
      return null;
    }

    const tokenStartedAt = getTimingNow();
    logChatDebug("get token start", { isInClient: Boolean(liff.isInClient?.()) });
    await liff.getProfile().catch(() => null);
    const idToken = liff.getIDToken() || "";
    const accessToken = liff.getAccessToken?.() || "";
    logChatTiming("get token end", tokenStartedAt, {
      hasIdToken: Boolean(idToken),
      hasAccessToken: Boolean(accessToken),
    });

    if (!idToken && !accessToken) {
      return null;
    }

    return {
      idToken,
      accessToken,
    };
  } catch (error) {
    if (initStartedAt) {
      logChatTiming("liff.init end", initStartedAt, {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    console.warn("Mumbao chat LINE identity unavailable:", error);
    return null;
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

type MumbaoChatProps = {
  className?: string;
  compact?: boolean;
  isOpen?: boolean;
};

function buildLineRequestPayload(identity?: SessionRequestIdentity) {
  if (!identity?.lineIdentity) {
    return {};
  }

  return {
    anonymous_visitor_id: identity.anonymousVisitorId || undefined,
    line_id_token: identity.lineIdentity.idToken || undefined,
    line_access_token: identity.lineIdentity.accessToken || undefined,
  };
}

async function bindLineSession(
  identity: LineIdentity,
  visitorId: string,
  currentSessionId = ""
) {
  const startedAt = getTimingNow();
  logChatDebug("POST /api/line-liff-session start", {
    visitorId,
    currentSessionId,
    hasIdToken: Boolean(identity.idToken),
    hasAccessToken: Boolean(identity.accessToken),
  });

  try {
    const data = await fetchJsonWithTimeout<{
      session?: ChatSession;
    }>(
      "/api/line-liff-session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idToken: identity.idToken || undefined,
          accessToken: identity.accessToken || undefined,
          visitorId,
          currentSessionId: currentSessionId || undefined,
        }),
      },
      10000
    );

    logChatTiming("POST /api/line-liff-session end", startedAt, {
      status: "success",
      responseSessionId: data.session?.id ? String(data.session.id) : "",
      responseVisitorId: data.session?.visitor_id || "",
    });

    return data;
  } catch (error) {
    logChatTiming("POST /api/line-liff-session end", startedAt, {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function fetchSessionOnly(
  visitorId: string,
  forceNewSession = false,
  identity?: SessionRequestIdentity
) {
  return fetchJsonWithTimeout<{
    session?: ChatSession;
  }>(
    "/api/ai-chat?action=history",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_only: true,
        force_new_session: forceNewSession,
        ...buildLineRequestPayload(identity),
      }),
    },
    8000
  );
}

async function fetchLatestHistory(
  visitorId: string,
  sessionId: string,
  identity?: SessionRequestIdentity
) {
  const startedAt = getTimingNow();
  logChatDebug("history fetch start", {
    endpoint: "/api/ai-chat?action=history",
    visitorId,
    sessionId,
    hasLineIdentity: Boolean(identity?.lineIdentity),
    anonymousVisitorId: identity?.anonymousVisitorId || "",
  });

  try {
    const data = await fetchJsonWithTimeout<{
      session?: ChatSession;
      messages?: ApiMessage[];
      has_more?: boolean;
    }>(
      "/api/ai-chat?action=history",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visitor_id: visitorId,
          session_id: sessionId,
          limit: initialHistoryPageSize,
          ...buildLineRequestPayload(identity),
        }),
      },
      8000
    );

    logChatTiming("history fetch end", startedAt, {
      status: "success",
      endpoint: "/api/ai-chat?action=history",
      visitorId,
      sessionId,
      responseSessionId: data.session?.id ? String(data.session.id) : "",
      messageCount: data.messages?.length || 0,
      hasMore: Boolean(data.has_more),
    });

    return data;
  } catch (error) {
    logChatTiming("history fetch end", startedAt, {
      status: "error",
      endpoint: "/api/ai-chat?action=history",
      visitorId,
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function ChatHistorySkeleton() {
  return (
    <div className="space-y-3 px-1 py-1" aria-hidden="true">
      <div className="flex items-start gap-2">
        <div className="size-8 flex-none rounded-full bg-[#f1e7db]" />
        <div className="w-2/3 rounded-3xl rounded-bl-md border border-[#f0e3d4] bg-white px-4 py-3 shadow-sm">
          <div className="h-3 w-3/4 rounded-full bg-[#eee2d5]" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-[#f4eadf]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-1/2 rounded-3xl rounded-br-md bg-[#e1f0ea] px-4 py-3 shadow-sm">
          <div className="h-3 w-3/4 rounded-full bg-[#c7ded5]" />
        </div>
      </div>
    </div>
  );
}

export function MumbaoChat({
  className,
  compact = false,
  isOpen = true,
}: MumbaoChatProps) {
  const { session: customerSession } = useCustomerAuth();
  const customerAccessToken = customerSession?.access_token || "";
  const [visitorId, setVisitorId] = useState("");
  const [anonymousVisitorId, setAnonymousVisitorId] = useState("");
  const [lineIdentity, setLineIdentity] = useState<LineIdentity | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createWelcomeMessage(),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isInitialHistoryLoading, setIsInitialHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isDesktopResizable, setIsDesktopResizable] = useState(false);
  const [windowSize, setWindowSize] = useState<ChatWindowSize>(() =>
    loadChatWindowSize()
  );
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const messagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const historyFetchIdRef = useRef(0);
  const previousIsOpenRef = useRef(isOpen);
  const bootStartedAtRef = useRef(getTimingNow());
  const firstMessagesRenderLoggedRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const pendingScrollRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const nextResizeSizeRef = useRef<ChatWindowSize | null>(null);

  const hasDraftMessage = useMemo(() => input.trim().length > 0, [input]);
  const canResizeWindow = compact && isDesktopResizable;
  const realMessageCount = useMemo(
    () => messages.filter(isRealChatMessage).length,
    [messages]
  );
  const messageTimeline = useMemo(() => {
    let lastDateKey = "";

    return messages.flatMap((message) => {
      const items: Array<
        | { type: "date"; id: string; label: string }
        | { type: "message"; message: ChatMessage }
      > = [];
      const dateKey = getTaipeiDateKey(message.created_at);

      if (dateKey && dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        items.push({
          type: "date",
          id: `date-${dateKey}-${message.id}`,
          label: formatTaipeiDateLabel(message.created_at),
        });
      }

      items.push({ type: "message", message });
      return items;
    });
  }, [messages]);

  useEffect(() => {
    logChatDebug("mounted", { compact, initialIsOpen: isOpen });

    return () => {
      logChatDebug("unmounted", { compact });
    };
  }, []);

  useEffect(() => {
    if (previousIsOpenRef.current !== isOpen) {
      logChatDebug("isOpen changed", {
        previous: previousIsOpenRef.current,
        next: isOpen,
        visitorId,
        sessionId,
        messageCount: messages.filter(isRealChatMessage).length,
      });
      previousIsOpenRef.current = isOpen;
    }
  }, [isOpen, messages, sessionId, visitorId]);

  useEffect(() => {
    if (firstMessagesRenderLoggedRef.current || realMessageCount === 0) {
      return;
    }

    firstMessagesRenderLoggedRef.current = true;
    logChatTiming("first messages render time", bootStartedAtRef.current, {
      visitorId,
      sessionId,
      messageCount: realMessageCount,
    });
  }, [realMessageCount, sessionId, visitorId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateResizableState = () => {
      setIsDesktopResizable(mediaQuery.matches);
      setWindowSize((current) => clampChatWindowSize(current));
    };

    updateResizableState();
    mediaQuery.addEventListener("change", updateResizableState);
    window.addEventListener("resize", updateResizableState);

    return () => {
      mediaQuery.removeEventListener("change", updateResizableState);
      window.removeEventListener("resize", updateResizableState);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || hasInitializedRef.current) {
      if (isOpen && hasInitializedRef.current) {
        logChatDebug("initialization skipped: already initialized", {
          visitorId,
          sessionId,
        });
      }
      return;
    }
    hasInitializedRef.current = true;

    const coldStartCache = readRecentMessagesCache();
    if (coldStartCache) {
      messagesCacheRef.current.set(coldStartCache.sessionId, coldStartCache.messages);
      setMessages(getInitialMessages(coldStartCache.messages));
      logChatDebug("cold cache immediate render", {
        visitorId: coldStartCache.visitorId,
        sessionId: coldStartCache.sessionId,
        source: coldStartCache.source,
        messageCount: coldStartCache.messages.length,
      });
    } else {
      setIsInitialHistoryLoading(true);
    }

    const { visitorId: nextVisitorId, isExistingVisitor } = getVisitorIdentity();
    const existingSessionId = isExistingVisitor
      ? getStoredSessionId(nextVisitorId)
      : "";
    let isMounted = true;

    logChatDebug("initialization start", {
      nextVisitorId,
      isExistingVisitor,
      existingSessionId,
    });

    if (!isExistingVisitor) {
      clearSessionId();
    }

    setAnonymousVisitorId(nextVisitorId);
    setVisitorId(nextVisitorId);
    setSessionId(existingSessionId);
    const initialCachedMessages = loadCachedMessages(
      nextVisitorId,
      existingSessionId
    );
    const immediateMessages =
      initialCachedMessages.length > 0
        ? initialCachedMessages
        : coldStartCache?.messages || [];
    setMessages(getInitialMessages(immediateMessages));
    setIsInitialHistoryLoading(immediateMessages.length === 0);
    logChatDebug("initialization cache applied", {
      visitorId: nextVisitorId,
      sessionId: existingSessionId,
      messageCount: immediateMessages.length,
      strictCacheCount: initialCachedMessages.length,
      coldCacheSessionId: coldStartCache?.sessionId || "",
    });

    async function recoverSession() {
      if (existingSessionId || !isExistingVisitor) {
        if (isMounted) {
          setIsInitialHistoryLoading(false);
        }
        return;
      }

      try {
        const data = await fetchSessionOnly(nextVisitorId);
        const recoveredSessionId = data.session?.id
          ? String(data.session.id)
          : "";

        if (!isMounted || !recoveredSessionId) return;

        setSessionId(recoveredSessionId);
        saveSessionId(recoveredSessionId, nextVisitorId);
      } catch (error) {
        console.warn("Mumbao chat session recovery unavailable:", error);
      } finally {
        if (isMounted) {
          setIsInitialHistoryLoading(false);
        }
      }
    }

    async function initializeLineIdentity() {
      const identity = await loadLineIdentity();
      if (!isMounted) return;

      if (!identity) {
        recoverSession();
        return;
      }

      try {
        const boundLineSession = await bindLineSession(
          identity,
          nextVisitorId,
          existingSessionId
        );
        const effectiveVisitorId =
          boundLineSession.session?.visitor_id &&
          isLineVisitorId(String(boundLineSession.session.visitor_id))
            ? String(boundLineSession.session.visitor_id)
            : "";

        if (!effectiveVisitorId) {
          recoverSession();
          return;
        }

        const recoveredSessionId = boundLineSession.session?.id
          ? String(boundLineSession.session.id)
          : getStoredSessionId(effectiveVisitorId);

        if (!isMounted || !effectiveVisitorId || !recoveredSessionId) {
          return;
        }

        logChatDebug("line session bound", {
          anonymousVisitorId: nextVisitorId,
          effectiveVisitorId,
          recoveredSessionId,
        });

        if (
          coldStartCache?.sessionId &&
          coldStartCache.sessionId !== recoveredSessionId
        ) {
          messagesCacheRef.current.delete(coldStartCache.sessionId);
          clearCachedMessages("line session changed", {
            coldCacheSessionId: coldStartCache.sessionId,
            recoveredSessionId,
          });
          setMessages([createWelcomeMessage()]);
        }

        setIsInitialHistoryLoading(true);
        const cachedMessages =
          messagesCacheRef.current.get(recoveredSessionId) ||
          loadCachedMessages(effectiveVisitorId, recoveredSessionId);
        let latestMessages = cachedMessages;
        let hasMore = true;

        if (cachedMessages.length > 0) {
          setLineIdentity(identity);
          setVisitorId(effectiveVisitorId);
          setSessionId(recoveredSessionId);
          setMessages(getInitialMessages(cachedMessages));
          messagesCacheRef.current.set(recoveredSessionId, cachedMessages);
          saveSessionId(recoveredSessionId, effectiveVisitorId);
          logChatDebug("line cache applied before history", {
            visitorId: effectiveVisitorId,
            sessionId: recoveredSessionId,
            messageCount: cachedMessages.length,
          });
        }

        try {
          const historyData = await fetchLatestHistory(
            effectiveVisitorId,
            recoveredSessionId,
            {
              lineIdentity: identity,
              anonymousVisitorId: nextVisitorId,
            }
          );
          const historyMessages = (historyData.messages || [])
            .map(normalizeMessage)
            .filter((message) => message.message.trim().length > 0);

          latestMessages =
            historyMessages.length > 0
              ? sortMessagesByCreatedAt(historyMessages)
              : cachedMessages;
          hasMore = Boolean(historyData.has_more);
        } catch (error) {
          console.warn("Mumbao chat LINE history unavailable:", error);
        }

        setLineIdentity(identity);
        setVisitorId(effectiveVisitorId);
        setSessionId(recoveredSessionId);
        setMessages(getInitialMessages(latestMessages));
        setHasMoreHistory(hasMore);
        messagesCacheRef.current.set(recoveredSessionId, latestMessages);
        saveCachedMessages(effectiveVisitorId, latestMessages, recoveredSessionId);
        saveSessionId(recoveredSessionId, effectiveVisitorId);
        logChatDebug("line initialization completed", {
          visitorId: effectiveVisitorId,
          sessionId: recoveredSessionId,
          messageCount: latestMessages.length,
          hasMore,
        });
      } catch (error) {
        console.warn("Mumbao chat LINE session unavailable:", error);
        recoverSession();
      } finally {
        if (isMounted) {
          setIsInitialHistoryLoading(false);
        }
      }
    }

    initializeLineIdentity();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!visitorId) return;
    if (sessionId) {
      messagesCacheRef.current.set(
        sessionId,
        sortMessagesByCreatedAt(messages.filter(isRealChatMessage))
      );
    }
    saveCachedMessages(visitorId, messages, sessionId);
  }, [messages, sessionId, visitorId]);

  const refreshCurrentSessionHistory = useCallback(
    async ({
      showLoading = false,
      targetVisitorId = visitorId,
      targetSessionId = sessionId,
      targetLineIdentity = lineIdentity,
      targetAnonymousVisitorId = anonymousVisitorId,
    } = {}) => {
      if (!targetVisitorId || !targetSessionId) {
        logChatDebug("history refresh skipped: missing identity", {
          visitorId: targetVisitorId,
          sessionId: targetSessionId,
          showLoading,
        });
        return;
      }

      const fetchId = historyFetchIdRef.current + 1;
      historyFetchIdRef.current = fetchId;
      const cachedMessages =
        messagesCacheRef.current.get(targetSessionId) ||
        loadCachedMessages(targetVisitorId, targetSessionId);

      if (cachedMessages.length > 0) {
        logChatDebug("history refresh hydrate from cache", {
          visitorId: targetVisitorId,
          sessionId: targetSessionId,
          messageCount: cachedMessages.length,
        });
        setMessages(getInitialMessages(cachedMessages));
      } else if (showLoading) {
        setIsInitialHistoryLoading(true);
      }

      try {
        const data = await fetchLatestHistory(targetVisitorId, targetSessionId, {
          lineIdentity: targetLineIdentity,
          anonymousVisitorId: targetAnonymousVisitorId,
        });

        if (historyFetchIdRef.current !== fetchId) return;

        let effectiveSessionId = targetSessionId;
        let effectiveVisitorId = targetVisitorId;

        if (data.session?.id) {
          const nextSessionId = String(data.session.id);
          const nextVisitorId = data.session.visitor_id
            ? String(data.session.visitor_id)
            : targetVisitorId;

          if (nextVisitorId !== visitorId) {
            setVisitorId(nextVisitorId);
          }
          if (nextSessionId !== sessionId) {
            setSessionId(nextSessionId);
          }
          saveSessionId(nextSessionId, nextVisitorId);
          effectiveSessionId = nextSessionId;
          effectiveVisitorId = nextVisitorId;
        }

        const historyMessages = (data.messages || [])
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0);

        if (historyMessages.length > 0) {
          shouldAutoScrollRef.current = true;
          setMessages((current) => {
            const merged = getInitialMessages(
              sortMessagesByCreatedAt(
                dedupeMessages([
                  ...current.filter((message) => isRealChatMessage(message)),
                  ...historyMessages,
                ])
              )
            );
            messagesCacheRef.current.set(
              effectiveSessionId,
              merged.filter(isRealChatMessage)
            );
            saveCachedMessages(effectiveVisitorId, merged, effectiveSessionId);
            logChatDebug("history refresh merged messages", {
              visitorId: effectiveVisitorId,
              sessionId: effectiveSessionId,
              incomingCount: historyMessages.length,
              mergedCount: merged.filter(isRealChatMessage).length,
            });
            return merged;
          });
        } else {
          logChatDebug("history refresh no incoming messages", {
            visitorId: effectiveVisitorId,
            sessionId: effectiveSessionId,
          });
        }

        setHasMoreHistory(Boolean(data.has_more));
      } catch (error) {
        console.warn("Mumbao chat history refresh unavailable:", error);
      } finally {
        if (historyFetchIdRef.current === fetchId) {
          setIsInitialHistoryLoading(false);
        }
      }
    },
    [anonymousVisitorId, lineIdentity, sessionId, visitorId]
  );

  useEffect(() => {
    if (!isOpen) return;

    const { visitorId: storedVisitorId } = getVisitorIdentity();
    const effectiveVisitorId = visitorId || storedVisitorId;
    const storedSessionId = effectiveVisitorId
      ? getStoredSessionId(effectiveVisitorId)
      : "";
    const effectiveSessionId = sessionId || storedSessionId;

    logChatDebug("open hydrate start", {
      stateVisitorId: visitorId,
      stateSessionId: sessionId,
      storedVisitorId,
      storedSessionId,
      effectiveVisitorId,
      effectiveSessionId,
      hasInitialized: hasInitializedRef.current,
    });

    if (!visitorId && effectiveVisitorId) {
      setVisitorId(effectiveVisitorId);
    }
    if (!anonymousVisitorId && storedVisitorId) {
      setAnonymousVisitorId(storedVisitorId);
    }
    if (!sessionId && effectiveSessionId) {
      setSessionId(effectiveSessionId);
    }

    if (!effectiveVisitorId || !effectiveSessionId) {
      logChatDebug("open hydrate skipped: no session yet", {
        effectiveVisitorId,
        effectiveSessionId,
      });
      return;
    }

    const cachedMessages =
      messagesCacheRef.current.get(effectiveSessionId) ||
      loadCachedMessages(effectiveVisitorId, effectiveSessionId);

    if (cachedMessages.length > 0) {
      logChatDebug("open hydrate immediate messages", {
        visitorId: effectiveVisitorId,
        sessionId: effectiveSessionId,
        messageCount: cachedMessages.length,
      });
      setMessages(getInitialMessages(cachedMessages));
    } else {
      logChatDebug("open hydrate no cache, fetching history immediately", {
        visitorId: effectiveVisitorId,
        sessionId: effectiveSessionId,
      });
    }

    refreshCurrentSessionHistory({
      showLoading: cachedMessages.length === 0,
      targetVisitorId: effectiveVisitorId,
      targetSessionId: effectiveSessionId,
      targetLineIdentity: lineIdentity,
      targetAnonymousVisitorId: anonymousVisitorId || storedVisitorId,
    });
  }, [
    anonymousVisitorId,
    isOpen,
    lineIdentity,
    refreshCurrentSessionHistory,
    sessionId,
    visitorId,
  ]);

  useEffect(() => {
    if (!isOpen || !visitorId || !sessionId) return;

    let isCancelled = false;

    const loadNewMessages = async () => {
      const after = getNewestCreatedAt(messages);

      logChatDebug("polling tick", {
        endpoint: "/api/ai-chat?action=history",
        visitorId,
        sessionId,
        after: after || "",
        currentMessageCount: messages.filter(isRealChatMessage).length,
      });

      try {
        const data = await fetchJsonWithTimeout<{
          messages?: ApiMessage[];
        }>(
          "/api/ai-chat?action=history",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              visitor_id: visitorId,
              session_id: sessionId,
              limit: historyPageSize,
              after: after || undefined,
              ...buildLineRequestPayload({
                lineIdentity,
                anonymousVisitorId,
              }),
            }),
          },
          8000
        );

        if (isCancelled) return;

        const incomingMessages = (data.messages || [])
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0);

        if (incomingMessages.length === 0) {
          logChatDebug("polling no new messages", { visitorId, sessionId });
          return;
        }

        shouldAutoScrollRef.current = true;
        setMessages((current) =>
          getInitialMessages(
            sortMessagesByCreatedAt(
              dedupeMessages([
                ...current.filter((message) => isRealChatMessage(message)),
                ...incomingMessages,
              ])
            )
          )
        );
        logChatDebug("polling merged new messages", {
          visitorId,
          sessionId,
          incomingCount: incomingMessages.length,
        });
      } catch (error) {
        console.warn("Mumbao chat live messages unavailable:", error);
      }
    };

    logChatDebug("polling started", {
      intervalMs: 5000,
      visitorId,
      sessionId,
    });
    const timer = window.setInterval(loadNewMessages, 5000);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
      logChatDebug("polling stopped", { visitorId, sessionId });
    };
  }, [anonymousVisitorId, isOpen, lineIdentity, messages, sessionId, visitorId]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current || pendingScrollRestoreRef.current) {
      return;
    }

    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  useLayoutEffect(() => {
    const pendingScrollRestore = pendingScrollRestoreRef.current;
    const scrollElement = scrollRef.current;

    if (!pendingScrollRestore || !scrollElement) {
      return;
    }

    scrollElement.scrollTop =
      scrollElement.scrollHeight -
      pendingScrollRestore.scrollHeight +
      pendingScrollRestore.scrollTop;
    pendingScrollRestoreRef.current = null;
  }, [messages]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [input]);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const resizeStart = resizeStartRef.current;
      if (!resizeStart) return;

      const deltaX = event.clientX - resizeStart.startX;
      const deltaY = event.clientY - resizeStart.startY;
      const nextSize = {
        width: resizeStart.width,
        height: resizeStart.height,
      };

      if (
        resizeStart.direction === "left" ||
        resizeStart.direction === "top-left"
      ) {
        nextSize.width = resizeStart.width - deltaX;
      }

      if (resizeStart.direction === "bottom-right") {
        nextSize.width = resizeStart.width + deltaX;
      }

      if (
        resizeStart.direction === "top" ||
        resizeStart.direction === "top-left"
      ) {
        nextSize.height = resizeStart.height - deltaY;
      }

      if (resizeStart.direction === "bottom-right") {
        nextSize.height = resizeStart.height + deltaY;
      }

      nextResizeSizeRef.current = clampChatWindowSize(nextSize);

      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (nextResizeSizeRef.current) {
          setWindowSize(nextResizeSizeRef.current);
        }
      });
    };

    const handlePointerUp = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      const finalSize = nextResizeSizeRef.current;
      nextResizeSizeRef.current = null;
      resizeStartRef.current = null;
      setIsResizing(false);
      setWindowSize((current) => {
        const nextSize = clampChatWindowSize(finalSize || current);
        saveChatWindowSize(nextSize);
        return nextSize;
      });
    };

    document.body.classList.add("select-none");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.classList.remove("select-none");
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      nextResizeSizeRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isResizing]);

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: ResizeDirection
  ) => {
    if (!canResizeWindow || event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      width: windowSize.width,
      height: windowSize.height,
    };
    setIsResizing(true);
  };

  const handleLoadHistory = async () => {
    if (!visitorId || isHistoryLoading || !hasMoreHistory) return;

    const scrollElement = scrollRef.current;
    if (scrollElement) {
      pendingScrollRestoreRef.current = {
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop,
      };
    }

    shouldAutoScrollRef.current = false;
    setIsHistoryLoading(true);

    try {
      const before = getOldestCreatedAt(messages);
      const data = await fetchJsonWithTimeout<{
        session?: ChatSession;
        messages?: ApiMessage[];
        has_more?: boolean;
      }>(
        "/api/ai-chat?action=history",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            visitor_id: visitorId,
            session_id: sessionId || undefined,
            limit: historyPageSize,
            before,
            ...buildLineRequestPayload({
              lineIdentity,
              anonymousVisitorId,
            }),
          }),
        },
        8000
      );

      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        const nextVisitorId = data.session.visitor_id
          ? String(data.session.visitor_id)
          : visitorId;
        if (nextVisitorId !== visitorId) {
          setVisitorId(nextVisitorId);
        }
        setSessionId(nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
      }

      const historyMessages = (data.messages || [])
        .map(normalizeMessage)
        .filter((message) => message.message.trim().length > 0);

      if (historyMessages.length === 0) {
        pendingScrollRestoreRef.current = null;
        setHasMoreHistory(false);
        return;
      }

      setMessages((current) => mergeMessages(current, historyMessages));
      setHasMoreHistory(
        Boolean(data.has_more) && historyMessages.length >= historyPageSize
      );
    } catch (error) {
      pendingScrollRestoreRef.current = null;
      console.warn("Mumbao chat history unavailable:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const question = input.trim();
    if (!question || isLoading || !visitorId) return;

    const pendingUserMessage = createMessage("user", question);

    shouldAutoScrollRef.current = true;
    setMessages((current) => [
      ...current.filter((message) => isRealChatMessage(message)),
      pendingUserMessage,
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const data = await fetchJsonWithTimeout<{
        session?: ChatSession;
        userMessage?: ApiMessage;
        aiMessage?: ApiMessage | null;
        answer?: string;
        humanTakeover?: boolean;
      }>(
        "/api/ai-chat?action=message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(customerAccessToken
              ? { Authorization: `Bearer ${customerAccessToken}` }
              : {}),
          },
          body: JSON.stringify({
            visitor_id: visitorId,
            session_id: sessionId || undefined,
            message: question,
            recentMessages: getRecentMessagesForApi(messages),
            ...buildLineRequestPayload({
              lineIdentity,
              anonymousVisitorId,
            }),
          }),
        },
        30000
      );

      const savedUserMessage = data.userMessage
        ? normalizeMessage(data.userMessage)
        : pendingUserMessage;
      const savedAiMessage = data.humanTakeover
        ? null
        : data.aiMessage
        ? normalizeMessage(data.aiMessage)
        : data.answer
          ? createMessage("assistant", data.answer)
          : createMessage("assistant", errorReply);

      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        const nextVisitorId = data.session.visitor_id
          ? String(data.session.visitor_id)
          : visitorId;
        if (nextVisitorId !== visitorId) {
          setVisitorId(nextVisitorId);
        }
        setSessionId(nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
      }

      setMessages((current) =>
        sortMessagesByCreatedAt(
          [
          ...current.filter(
            (message) =>
              isRealChatMessage(message) && message.id !== pendingUserMessage.id
          ),
          savedUserMessage,
          savedAiMessage,
        ].filter(Boolean) as ChatMessage[]
        )
      );
    } catch (error) {
      console.warn("Mumbao chat message unavailable:", error);
      const assistantErrorMessage =
        error instanceof Error && error.message.includes("慢寶")
          ? error.message
          : errorReply;

      setMessages((current) => [
        ...current.filter((message) => isRealChatMessage(message)),
        createMessage("assistant", assistantErrorMessage),
      ]);
    } finally {
      setIsLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleTextareaKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    const shouldSubmitWithEnter = window.matchMedia("(min-width: 768px)").matches;
    if (!shouldSubmitWithEnter) {
      return;
    }

    event.preventDefault();
    if (!input.trim() || isLoading) return;

    event.currentTarget.form?.requestSubmit();
  };

  const desktopWindowStyle = canResizeWindow
    ? {
        width: `${windowSize.width}px`,
        height: `${windowSize.height}px`,
        minWidth: `${minDesktopWindowSize.width}px`,
        minHeight: `${minDesktopWindowSize.height}px`,
        maxWidth: "min(90vw, 720px)",
        maxHeight: "min(90dvh, 900px)",
      }
    : undefined;

  return (
    <section
      style={desktopWindowStyle}
      className={cn(
        "relative box-border flex h-full max-h-[100dvh] min-h-0 flex-col overflow-hidden border border-white/80 bg-[#fffaf2]/95 shadow-[0_24px_80px_rgba(111,88,71,0.18)] backdrop-blur-2xl",
        compact ? "rounded-[28px]" : "rounded-[32px]",
        isResizing && "select-none",
        isResizing && "[&_*]:!transition-none",
        className
      )}
      aria-label="問慢寶 AI客服"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fffdf8] px-4 pb-[calc(env(safe-area-inset-bottom,0px)_+_1.5rem)] pt-5"
      >
        <div className="sticky top-0 z-10 flex justify-center bg-gradient-to-b from-[#fffdf8] via-[#fffdf8]/95 to-transparent pb-2 pt-1">
          {hasMoreHistory ? (
            <Button
              type="button"
              onClick={handleLoadHistory}
              disabled={isHistoryLoading}
              className="h-9 rounded-full border border-[#ead8c6] bg-white/95 px-4 text-sm font-medium text-[#7a6758] shadow-sm hover:bg-[#fff7ec] disabled:opacity-70"
            >
              {isHistoryLoading ? "載入中…" : "↑ 查看歷史紀錄"}
            </Button>
          ) : (
            <span className="rounded-full border border-[#f0e3d4] bg-white/80 px-4 py-2 text-xs text-[#9b897a]">
              沒有更早紀錄
            </span>
          )}
        </div>

        {isInitialHistoryLoading && realMessageCount === 0 && (
          <div className="space-y-3 py-3">
            <div className="flex justify-center">
              <span className="rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-[#9b897a] shadow-sm">
                正在載入對話紀錄…
              </span>
            </div>
            <ChatHistorySkeleton />
          </div>
        )}

        {messageTimeline.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.id} className="flex justify-center py-2">
                <span className="rounded-full bg-[#eee8df] px-3 py-1 text-xs font-medium text-[#9a8b7d]">
                  {item.label}
                </span>
              </div>
            );
          }

          const { message } = item;
          const messageTime = formatTaipeiMessageTime(message.created_at);
          const isUserMessage = message.role === "user";
          const isHumanMessage = message.role === "human";
          const senderName = isUserMessage
            ? "我"
            : isHumanMessage
              ? "慢慢蒔光管家"
              : "慢寶";

          return (
            <div
              key={message.id}
              className={cn(
                "flex w-full",
                isUserMessage ? "justify-end" : "justify-start"
              )}
            >
              {!isUserMessage && (
                <div className="mr-2 -mt-0.5 flex size-9 flex-none items-center justify-center overflow-hidden rounded-full border border-white/90 bg-[#fff4e4] shadow-[0_6px_14px_rgba(111,88,71,0.12)] sm:size-10">
                  <img
                    src="/images/stand.png"
                    alt=""
                    className="h-full w-full object-cover object-top"
                    draggable={false}
                  />
                </div>
              )}

              <div
                className={cn(
                  "flex max-w-[82%] flex-col gap-1",
                  isUserMessage ? "items-end" : "items-start"
                )}
              >
                <span
                  className={cn(
                    "px-1 text-[11px] font-medium leading-none text-[#a99a8c]",
                    isUserMessage ? "text-right" : "text-left"
                  )}
                >
                  {senderName}
                </span>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-[22px] px-4 py-3 text-sm leading-7 shadow-[0_8px_20px_rgba(111,88,71,0.08)]",
                    isUserMessage
                      ? "rounded-tr-md bg-[#e99554] text-[#fffaf2]"
                      : isHumanMessage
                        ? "rounded-tl-md border border-[#e1eadf] bg-[#f6fbf4] text-[#546456]"
                        : "rounded-tl-md border border-[#f0e3d4] bg-white text-[#5f544b]"
                  )}
                >
                  {message.message}
                </div>
                {messageTime && (
                  <span
                    className={cn(
                      "px-1 text-[10px] leading-none text-[#b9ada2]",
                      isUserMessage ? "text-right" : "text-left"
                    )}
                  >
                    {messageTime}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex w-full justify-start">
            <div className="mr-2 -mt-0.5 flex size-9 flex-none items-center justify-center overflow-hidden rounded-full border border-white/90 bg-[#fff4e4] shadow-[0_6px_14px_rgba(111,88,71,0.12)] sm:size-10">
              <img
                src="/images/stand.png"
                alt=""
                className="h-full w-full object-cover object-top"
                draggable={false}
              />
            </div>
            <div className="flex max-w-[82%] flex-col items-start gap-1">
              <span className="px-1 text-[11px] font-medium leading-none text-[#a99a8c]">
                慢寶
              </span>
              <div className="rounded-[22px] rounded-tl-md border border-[#f0e3d4] bg-white px-4 py-3 text-sm text-[#8a796a] shadow-[0_8px_20px_rgba(111,88,71,0.08)]">
                慢寶正在想一下…
              </div>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="box-border flex w-full flex-none items-end gap-2 border-t border-white/70 bg-[#f8efe3]/90 px-3 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="輸入想問慢寶的問題"
          rows={1}
          className="max-h-[120px] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border border-[#ead8c6] bg-white px-4 py-2.5 text-base leading-6 text-[#5c5147] shadow-inner outline-none transition focus:border-[#9ec7b8] focus:ring-4 focus:ring-[#9ec7b8]/20 md:text-sm"
        />
        <Button
          type="submit"
          disabled={!hasDraftMessage}
          className="h-11 min-h-11 w-11 min-w-11 flex-none shrink-0 rounded-full bg-[#8dbbad] p-0 text-white shadow-md hover:bg-[#7aaea0] disabled:opacity-60"
          aria-label="送出訊息"
        >
          <Send className="size-5" aria-hidden="true" />
        </Button>
      </form>

      {canResizeWindow && (
        <>
          <button
            type="button"
            onPointerDown={(event) => handleResizePointerDown(event, "left")}
            className="absolute -left-1 top-6 z-20 hidden h-[calc(100%-3rem)] w-3 cursor-ew-resize touch-none rounded-l-[28px] border-0 bg-transparent p-0 md:block"
            aria-label="調整客服視窗寬度"
          />
          <button
            type="button"
            onPointerDown={(event) => handleResizePointerDown(event, "top")}
            className="absolute -top-1 left-6 z-20 hidden h-3 w-[calc(100%-3rem)] cursor-ns-resize touch-none rounded-t-[28px] border-0 bg-transparent p-0 md:block"
            aria-label="調整客服視窗高度"
          />
          <button
            type="button"
            onPointerDown={(event) => handleResizePointerDown(event, "top-left")}
            className="absolute -left-1 -top-1 z-30 hidden size-6 cursor-nwse-resize touch-none rounded-tl-[28px] border-0 bg-transparent p-0 text-[#bda98d] opacity-55 transition hover:opacity-90 md:block"
            aria-label="調整客服視窗寬度與高度"
          >
            <span className="pointer-events-none absolute left-2 top-2 size-3 border-l-2 border-t-2 border-current" />
          </button>
          <button
            type="button"
            onPointerDown={(event) =>
              handleResizePointerDown(event, "bottom-right")
            }
            className="absolute bottom-1 right-1 z-20 hidden size-6 cursor-nwse-resize touch-none items-end justify-end rounded-br-[22px] border-0 bg-transparent p-0 text-[#bda98d] opacity-70 transition hover:opacity-100 md:flex"
            aria-label="調整客服視窗大小"
          >
            <span className="pointer-events-none absolute bottom-2 right-2 size-3 border-b-2 border-r-2 border-current" />
            <span className="pointer-events-none absolute bottom-2 right-2 size-5 border-b border-r border-current opacity-45" />
          </button>
        </>
      )}
    </section>
  );
}
