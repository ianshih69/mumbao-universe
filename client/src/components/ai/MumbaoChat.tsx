import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Cloud, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
const localCacheMessageLimit = 30;
const recentContextMessageLimit = 12;
const defaultDesktopWindowSize = { width: 420, height: 680 };
const minDesktopWindowSize = { width: 360, height: 480 };
const maxDesktopWindowSize = { width: 720, height: 900 };
const welcomeMessage =
  "嗨，我是慢寶。你可以問我住宿、包棟、寵物、停車、入住時間，或白雲基地的故事。";
const errorReply = "慢寶的雲朵訊號暫時不穩，請稍後再試。";

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
  if (!key) return "";

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

function loadCachedMessages(visitorId: string) {
  try {
    const rawCache = localStorage.getItem(recentChatStorageKey);
    if (!rawCache) return [];

    const cache = JSON.parse(rawCache) as {
      visitor_id?: string;
      messages?: ApiMessage[];
    };

    if (cache.visitor_id !== visitorId || !Array.isArray(cache.messages)) {
      return [];
    }

    return sortMessagesByCreatedAt(
      cache.messages
        .map(normalizeMessage)
        .filter((message) => message.message.trim().length > 0)
    );
  } catch (error) {
    console.warn("Mumbao chat cache unavailable:", error);
    return [];
  }
}

function saveCachedMessages(visitorId: string, messages: ChatMessage[]) {
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

  try {
    localStorage.setItem(
      recentChatStorageKey,
      JSON.stringify({
        visitor_id: visitorId,
        messages: cacheMessages,
      })
    );
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

  try {
    const liff = await loadLineLiffSdk();
    await liff.init({ liffId });

    if (!liff.isLoggedIn()) {
      if (shouldRequestLineLogin(liff)) {
        liff.login({
          redirectUri: lineLoginRedirectUri,
        });
      }
      return null;
    }

    await liff.getProfile().catch(() => null);
    const idToken = liff.getIDToken() || "";
    const accessToken = liff.getAccessToken?.() || "";

    if (!idToken && !accessToken) {
      return null;
    }

    return {
      idToken,
      accessToken,
    };
  } catch (error) {
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
  return fetchJsonWithTimeout<{
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
}

async function fetchSessionOnly(
  visitorId: string,
  forceNewSession = false,
  identity?: SessionRequestIdentity
) {
  return fetchJsonWithTimeout<{
    session?: ChatSession;
  }>(
    "/api/ai-chat-history",
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
  return fetchJsonWithTimeout<{
    session?: ChatSession;
    messages?: ApiMessage[];
    has_more?: boolean;
  }>(
    "/api/ai-chat-history",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_id: sessionId,
        limit: historyPageSize,
        ...buildLineRequestPayload(identity),
      }),
    },
    8000
  );
}

export function MumbaoChat({ className, compact = false }: MumbaoChatProps) {
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
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isDesktopResizable, setIsDesktopResizable] = useState(false);
  const [windowSize, setWindowSize] = useState<ChatWindowSize>(() =>
    loadChatWindowSize()
  );
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    const { visitorId: nextVisitorId, isExistingVisitor } = getVisitorIdentity();
    const existingSessionId = isExistingVisitor
      ? getStoredSessionId(nextVisitorId)
      : "";
    let isMounted = true;

    if (!isExistingVisitor) {
      clearSessionId();
    }

    setAnonymousVisitorId(nextVisitorId);
    setVisitorId(nextVisitorId);
    setSessionId(existingSessionId);
    setMessages(getInitialMessages(loadCachedMessages(nextVisitorId)));

    async function recoverSession() {
      if (existingSessionId || !isExistingVisitor) return;

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

        const cachedMessages = loadCachedMessages(effectiveVisitorId);
        let latestMessages = cachedMessages;
        let hasMore = true;

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
        saveSessionId(recoveredSessionId, effectiveVisitorId);
      } catch (error) {
        console.warn("Mumbao chat LINE session unavailable:", error);
        recoverSession();
      }
    }

    initializeLineIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!visitorId) return;
    saveCachedMessages(visitorId, messages);
  }, [messages, visitorId]);

  useEffect(() => {
    if (!visitorId || !sessionId) return;

    let isCancelled = false;

    const loadNewMessages = async () => {
      const after = getNewestCreatedAt(messages);

      try {
        const data = await fetchJsonWithTimeout<{
          messages?: ApiMessage[];
        }>(
          "/api/ai-chat-history",
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

        if (incomingMessages.length === 0) return;

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
      } catch (error) {
        console.warn("Mumbao chat live messages unavailable:", error);
      }
    };

    const timer = window.setInterval(loadNewMessages, 5000);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [anonymousVisitorId, lineIdentity, messages, sessionId, visitorId]);

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
        "/api/ai-chat-history",
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
        "/api/ai-chat-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
      <div className="relative flex-none overflow-hidden border-b border-white/70 bg-[#f8efe3] px-5 py-4">
        <div className="absolute right-4 top-3 flex text-[#d7b77a]" aria-hidden="true">
          <Sparkles className="size-4" />
          <Sparkles className="mt-5 size-3 opacity-70" />
        </div>
        <div className="absolute -left-8 -top-10 h-24 w-32 rounded-full bg-white/70 blur-sm" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-white text-[#88a9c7] shadow-inner">
            <Cloud className="size-7" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-wide text-[#5c5147]">問慢寶 AI客服</h2>
            <p className="text-sm text-[#8a796a]">白雲基地小幫手</p>
          </div>
        </div>
      </div>

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

          return (
            <div
              key={message.id}
              className={cn(
                "flex w-full flex-col gap-1",
                isUserMessage ? "items-end" : "items-start"
              )}
            >
              {isHumanMessage && (
                <span className="px-1 text-[11px] leading-none text-[#9b897a]">
                  慢慢蒔光管家
                </span>
              )}
              <div
                className={cn(
                  "max-w-[82%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm",
                  isUserMessage
                    ? "rounded-br-md bg-[#9ec7b8] text-white"
                    : isHumanMessage
                      ? "rounded-bl-md border border-[#d8eadf] bg-[#f2fbf6] text-[#4f645a]"
                      : "rounded-bl-md border border-[#f0e3d4] bg-white text-[#5f544b]"
                )}
              >
                {message.message}
              </div>
              {messageTime && (
                <span
                  className={cn(
                    "px-1 text-[11px] leading-none text-[#b2a69a]",
                    isUserMessage ? "text-right" : "text-left"
                  )}
                >
                  {messageTime}
                </span>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-3xl rounded-bl-md border border-[#f0e3d4] bg-white px-4 py-3 text-sm text-[#8a796a] shadow-sm">
              慢寶正在想一下…
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
