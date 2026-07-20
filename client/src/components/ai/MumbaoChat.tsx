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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  message: string;
  session_id?: string;
  created_at?: string;
  provider_used?: string | null;
  isWelcome?: boolean;
  isOptimistic?: boolean;
  isSystemNotice?: boolean;
  clientRequestId?: string;
  deleted_at?: string | null;
};

type ApiMessage = {
  id?: string | number;
  session_id?: string | number;
  role?: string;
  sender?: string;
  sender_type?: string;
  message?: string;
  content?: string;
  provider?: string | null;
  provider_used?: string | null;
  created_at?: string;
  deleted_at?: string | null;
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
  status?: "ai_active" | "human_takeover" | "closed" | string;
  support_status?: string;
  ai_mode?: "ai_active" | "human_takeover" | string;
  ai_paused_until?: string | null;
  should_ai_reply?: boolean;
  visitor_id?: string;
  source?: string;
  line_user_id?: string;
  line_display_name?: string;
  line_picture_url?: string;
  auth_user_id?: string;
  customer_profile_id?: string;
  customer_email?: string;
  deleted_at?: string | null;
};

type ChatMessageResponse = {
  session?: ChatSession;
  userMessage?: ApiMessage;
  aiMessage?: ApiMessage | null;
  answer?: string;
  humanTakeover?: boolean;
  ai_skipped?: boolean;
  provider_used?: string;
  notice?: string;
  support_status?: string;
  ai_mode?: string;
  ai_paused_until?: string | null;
};

type SessionRequestIdentity = {
  lineIdentity?: LineIdentity | null;
  anonymousVisitorId?: string;
  entrySource?: "line_liff" | "";
};

type ChatWindowSize = {
  width: number;
  height: number;
};

type ResizeDirection = "left" | "top" | "top-left" | "bottom-right";
type HumanSeenEntry = {
  message_id: string;
  created_at: string;
};
export type HumanSeenMap = Record<string, HumanSeenEntry>;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type HumanMessageLike = {
  id?: string | number;
  role?: string;
  sender?: string;
  sender_type?: string;
  provider?: string | null;
  provider_used?: string | null;
};
type HumanMessageSummary = Pick<
  ChatMessage,
  "id" | "message" | "created_at" | "session_id" | "role" | "provider_used"
>;
export type HumanUnreadState = {
  hasUnread: boolean;
  sessionId: string;
  latestHumanMessage: HumanMessageSummary | null;
};

const visitorStorageKey = "mumbao-chat-visitor-id";
const legacyVisitorStorageKey = "mumbao_visitor_id";
const sessionStorageKey = "mumbao-chat-session-id";
const visitorCookieKey = "mumbao_chat_visitor_id";
const recentChatStorageKey = "mumbao_chat_recent_messages";
const chatWindowSizeStorageKey = "mumbao-chat-window-size";
const chatStorageVersionKey = "mumbao-chat-storage-version";
export const humanSeenStorageKey = "mumbao-chat-human-seen-v1";
export const humanSeenChangeEventName = "mumbao-chat-human-seen-change";
const chatStorageVersion = "2";
const lineLiffSdkUrl = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const lineLoginRedirectUri = "https://www.mumbao.tw/chat?liff=1";
const historyPageSize = 7;
const initialHistoryPageSize = 100;
export const humanUnreadPollingIntervalMs = 25 * 1000;
const localCacheMessageLimit = 50;
const recentContextMessageLimit = 12;
const sessionMessagesCacheTtlMs = 10 * 60 * 1000;
const optimisticDuplicateWindowMs = 60 * 1000;
const defaultDesktopWindowSize = { width: 420, height: 680 };
const minDesktopWindowSize = { width: 360, height: 480 };
const maxDesktopWindowSize = { width: 720, height: 900 };
const welcomeMessage =
  "嗨，我是慢寶。你可以問我住宿、包棟、寵物、停車、入住時間，或白雲基地的故事。";
const errorReply = "慢寶的雲朵訊號暫時不穩，請稍後再試。";
const chatBuildMarker = "chat-debug-20260716-1";
const sessionReconnectReply = "對話已重新連線，請再試一次。";
const rateLimitReply = "慢寶現在收到較多問題，請稍後再問喔。";
const networkErrorReply = "目前網路連線不穩，請檢查網路後重試。";
const humanTakeoverNotice =
  "訊息已送達人工客服。管家會在這個聊天視窗回覆你。";
const humanTakeoverLabel = "人工客服處理中";
const envChatDebugEnabled =
  String(
    (import.meta.env.NEXT_PUBLIC_CHAT_DEBUG || import.meta.env.VITE_CHAT_DEBUG || "")
  ).toLowerCase() === "true";
let chatMountCount = 0;
let chatUnmountCount = 0;
let lastChatUnmountAt = "";

type ChatLiffStatus = "idle" | "initializing" | "ready" | "failed";
type ChatSendStatus = "idle" | "sending" | "success" | "error";
type ChatRenderContext = "mobile-portal" | "desktop-launcher" | "page";
type ChatAiMode = "ai_active" | "human_takeover";

type ChatDebugState = {
  lastMessagesUpdate: string;
  lastSessionUpdate: string;
  historyRequestSequence: number;
  historyResponseCount: number;
  sendStatus: ChatSendStatus;
  apiHttpStatus: number | null;
  timestamp: string;
};

declare global {
  interface Window {
    __MUMBAO_CHAT_BUILD__?: string;
  }
}

if (typeof window !== "undefined") {
  window.__MUMBAO_CHAT_BUILD__ = chatBuildMarker;
}

function isChatDebugEnabled() {
  if (envChatDebugEnabled) return true;
  if (typeof window === "undefined") return false;

  return new URLSearchParams(window.location.search).get("chatDebug") === "1";
}

function sanitizeChatDebugDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (/token|authorization|secret|password|email/i.test(key)) {
        return [key, typeof value === "boolean" ? value : "[redacted]"];
      }

      if (/id$/i.test(key) && typeof value !== "boolean") {
        return [key, maskDebugId(value as string | number | null)];
      }

      if (Array.isArray(value)) {
        return [key, value.map((item) =>
          item && typeof item === "object"
            ? sanitizeChatDebugDetails(item as Record<string, unknown>)
            : item
        )];
      }

      if (value && typeof value === "object") {
        return [key, sanitizeChatDebugDetails(value as Record<string, unknown>)];
      }

      return [key, value];
    })
  );
}

function logChatDebug(event: string, details: Record<string, unknown> = {}) {
  if (!isChatDebugEnabled()) return;

  console.info(`[MumbaoChat] ${event}`, {
    at: new Date().toISOString(),
    ...sanitizeChatDebugDetails(details),
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

function maskDebugId(value?: string | number | null) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return `${text.slice(0, 2)}...`;

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function getMessageDebugSummary(messages: ChatMessage[]) {
  const realMessages = messages.filter(isRealChatMessage);
  const lastMessage = realMessages[realMessages.length - 1];

  return {
    realCount: realMessages.length,
    optimisticCount: realMessages.filter((message) => message.isOptimistic)
      .length,
    lastRole: lastMessage?.role || "",
    lastId: maskDebugId(lastMessage?.id),
    lastCreatedAt: lastMessage?.created_at || "",
  };
}

function createLocalId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const chatUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidChatUuid(value: string) {
  return chatUuidPattern.test(String(value || "").trim());
}

function createVisitorUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16))
      .join("");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(
    3
  )}-${randomHex(12)}`;
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

export function createHumanTakeoverNoticeMessage(message = humanTakeoverNotice) {
  return {
    ...createMessage("system", message),
    provider_used: "human_takeover",
    isSystemNotice: true,
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

function clearCookieValue(name: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

function persistVisitorId(visitorId: string) {
  localStorage.setItem(visitorStorageKey, visitorId);
  setCookieValue(visitorCookieKey, visitorId);
}

function removeLegacyVisitorId() {
  localStorage.removeItem(legacyVisitorStorageKey);
}

function normalizeStoredVisitorId(value: string | null) {
  const visitorId = String(value || "").trim();
  return isValidChatUuid(visitorId) ? visitorId : "";
}

function ensureChatStorageVersion() {
  if (localStorage.getItem(chatStorageVersionKey) === chatStorageVersion) {
    return;
  }

  localStorage.setItem(chatStorageVersionKey, chatStorageVersion);
}

function getVisitorIdentity() {
  ensureChatStorageVersion();

  const currentVisitorId = normalizeStoredVisitorId(
    localStorage.getItem(visitorStorageKey)
  );
  if (currentVisitorId) {
    persistVisitorId(currentVisitorId);
    removeLegacyVisitorId();
    return {
      visitorId: currentVisitorId,
      isExistingVisitor: true,
    };
  }

  localStorage.removeItem(visitorStorageKey);

  const legacyVisitorId = normalizeStoredVisitorId(
    localStorage.getItem(legacyVisitorStorageKey)
  );
  if (legacyVisitorId) {
    persistVisitorId(legacyVisitorId);
    removeLegacyVisitorId();
    return {
      visitorId: legacyVisitorId,
      isExistingVisitor: true,
    };
  }

  removeLegacyVisitorId();

  const cookieVisitorId = normalizeStoredVisitorId(getCookieValue(visitorCookieKey));
  if (cookieVisitorId) {
    persistVisitorId(cookieVisitorId);
    return {
      visitorId: cookieVisitorId,
      isExistingVisitor: true,
    };
  }

  clearCookieValue(visitorCookieKey);

  const nextVisitorId = createVisitorUuid();
  persistVisitorId(nextVisitorId);

  return {
    visitorId: nextVisitorId,
    isExistingVisitor: false,
  };
}

function isLineVisitorId(visitorId: string) {
  return visitorId.startsWith("line:");
}

export function parseStoredChatSession(rawSession: string, visitorId: string) {
  const storedValue = String(rawSession || "").trim();
  const currentVisitorId = String(visitorId || "").trim();

  if (!storedValue || !currentVisitorId) {
    return {
      sessionId: "",
      shouldClear: false,
      shouldPersist: false,
    };
  }

  try {
    const session = JSON.parse(storedValue) as {
      visitor_id?: string;
      session_id?: string;
    };
    const storedVisitorId = String(session?.visitor_id || "").trim();
    const storedSessionId = String(session?.session_id || "").trim();

    if (!storedVisitorId || storedVisitorId !== currentVisitorId) {
      return {
        sessionId: "",
        shouldClear: true,
        shouldPersist: false,
      };
    }

    if (!isValidChatUuid(storedSessionId)) {
      return {
        sessionId: "",
        shouldClear: true,
        shouldPersist: false,
      };
    }

    return {
      sessionId: storedSessionId,
      shouldClear: false,
      shouldPersist: false,
    };
  } catch {
    if (isLineVisitorId(currentVisitorId) || !isValidChatUuid(storedValue)) {
      return {
        sessionId: "",
        shouldClear: true,
        shouldPersist: false,
      };
    }

    return {
      sessionId: storedValue,
      shouldClear: false,
      shouldPersist: true,
    };
  }
}

function getStoredSessionId(visitorId: string) {
  const rawSession = localStorage.getItem(sessionStorageKey) || "";
  const parsedSession = parseStoredChatSession(rawSession, visitorId);

  if (parsedSession.shouldClear) {
    clearSessionId();
    clearCachedMessages("stored session invalid", {
      visitorId,
    });
    return "";
  }

  if (parsedSession.shouldPersist && parsedSession.sessionId) {
    saveSessionId(parsedSession.sessionId, visitorId);
  }

  return parsedSession.sessionId;
}

function saveSessionId(nextSessionId: string, visitorId: string) {
  if (!nextSessionId || !visitorId) return;
  if (!isValidChatUuid(nextSessionId)) return;

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

function getLocalStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readStoredChatIdentity(
  storage: StorageLike | null = getLocalStorage()
) {
  if (!storage) {
    return {
      visitorId: "",
      sessionId: "",
    };
  }

  const storedVisitorId = normalizeStoredVisitorId(
    storage.getItem(visitorStorageKey)
  );
  const cookieVisitorId =
    typeof document === "undefined"
      ? ""
      : normalizeStoredVisitorId(getCookieValue(visitorCookieKey));
  const visitorId = storedVisitorId || cookieVisitorId;
  const parsedSession = parseStoredChatSession(
    storage.getItem(sessionStorageKey) || "",
    visitorId
  );

  return {
    visitorId,
    sessionId: parsedSession.sessionId,
  };
}

function createEmptyHumanSeenMap(storage: StorageLike | null) {
  if (storage) {
    try {
      storage.setItem(humanSeenStorageKey, "{}");
    } catch {
      // Ignore storage quota or privacy-mode failures.
    }
  }

  return {};
}

export function readHumanSeenMap(
  storage: StorageLike | null = getLocalStorage()
): HumanSeenMap {
  if (!storage) return {};

  try {
    const rawValue = storage.getItem(humanSeenStorageKey);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createEmptyHumanSeenMap(storage);
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, Partial<HumanSeenEntry>>)
        .map(([sessionId, entry]) => {
          const normalizedSessionId = String(sessionId || "").trim();
          const messageId = String(entry?.message_id || "").trim();
          const createdAt = String(entry?.created_at || "").trim();

          if (!normalizedSessionId || !messageId) return null;
          return [
            normalizedSessionId,
            {
              message_id: messageId,
              created_at: createdAt,
            },
          ] as const;
        })
        .filter(Boolean) as Array<[string, HumanSeenEntry]>
    );
  } catch {
    return createEmptyHumanSeenMap(storage);
  }
}

export function writeHumanSeenMap(
  seenMap: HumanSeenMap,
  storage: StorageLike | null = getLocalStorage()
) {
  if (!storage) return;

  try {
    storage.setItem(humanSeenStorageKey, JSON.stringify(seenMap));
  } catch (error) {
    console.warn("Mumbao chat human seen map save unavailable:", error);
  }
}

export function isHumanMessage(message: HumanMessageLike | null | undefined) {
  const role = String(message?.role || "").trim().toLowerCase();
  const sender = String(message?.sender || "").trim().toLowerCase();
  const senderType = String(message?.sender_type || "").trim().toLowerCase();
  const provider = String(
    message?.provider_used || message?.provider || ""
  ).trim().toLowerCase();

  return (
    role === "human" ||
    sender === "human" ||
    senderType === "human" ||
    (provider === "admin" && role !== "user" && sender !== "user")
  );
}

export function getLatestHumanMessage(messages: ChatMessage[]) {
  return sortMessagesByCreatedAt(
    messages.filter(
      (message) =>
        isRealChatMessage(message) &&
        isHumanMessage(message) &&
        Boolean(message.id)
    )
  ).at(-1) || null;
}

function isNewerThanSeen(
  latestHumanMessage: Pick<ChatMessage, "id" | "created_at">,
  seenEntry?: HumanSeenEntry
) {
  if (!seenEntry) return true;
  if (String(latestHumanMessage.id || "") !== seenEntry.message_id) return true;

  const latestTime = Date.parse(latestHumanMessage.created_at || "");
  const seenTime = Date.parse(seenEntry.created_at || "");

  return (
    !Number.isNaN(latestTime) &&
    (Number.isNaN(seenTime) || latestTime > seenTime)
  );
}

export function hasUnreadHumanMessage(
  sessionId: string,
  latestHumanMessage: Pick<ChatMessage, "id" | "created_at"> | null | undefined,
  seenMap: HumanSeenMap = readHumanSeenMap()
) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId || !latestHumanMessage?.id) return false;

  return isNewerThanSeen(
    latestHumanMessage,
    seenMap[normalizedSessionId]
  );
}

export function getHumanUnreadState(
  latestHumanMessages: Array<{
    sessionId: string;
    message: HumanMessageSummary | null | undefined;
  }>,
  seenMap: HumanSeenMap = readHumanSeenMap()
): HumanUnreadState {
  const unreadEntry = latestHumanMessages.find(({ sessionId, message }) =>
    hasUnreadHumanMessage(sessionId, message, seenMap)
  );

  return {
    hasUnread: Boolean(unreadEntry),
    sessionId: unreadEntry?.sessionId || "",
    latestHumanMessage: unreadEntry?.message || null,
  };
}

export function markHumanMessageSeen(
  sessionId: string,
  latestHumanMessage: Pick<ChatMessage, "id" | "created_at"> | null | undefined,
  storage: StorageLike | null = getLocalStorage()
) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId || !latestHumanMessage?.id) return;

  const nextSeenMap = {
    ...readHumanSeenMap(storage),
    [normalizedSessionId]: {
      message_id: String(latestHumanMessage.id),
      created_at: String(latestHumanMessage.created_at || ""),
    },
  };
  writeHumanSeenMap(nextSeenMap, storage);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(humanSeenChangeEventName, {
        detail: { sessionId: normalizedSessionId },
      })
    );
  }
}

function normalizeMessage(apiMessage: ApiMessage): ChatMessage {
  const sender = String(apiMessage.sender || "").toLowerCase();
  const role =
    isHumanMessage(apiMessage)
      ? "human"
      : sender === "user"
        ? "user"
        : sender === "system"
          ? "system"
          : "assistant";

  return {
    id: String(apiMessage.id || createLocalId()),
    session_id: apiMessage.session_id ? String(apiMessage.session_id) : undefined,
    role,
    message: String(apiMessage.message || apiMessage.content || ""),
    provider_used: apiMessage.provider_used || apiMessage.provider,
    created_at: apiMessage.created_at,
    deleted_at: apiMessage.deleted_at,
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

function getHumanTakeoverBanner(aiPausedUntil?: string | null) {
  const pausedUntilLabel = formatTaipeiMessageTime(aiPausedUntil || "");
  const newChatHint =
    "想詢問其他一般住宿問題，也可以開啟新對話，慢寶會繼續為你服務。";

  if (pausedUntilLabel) {
    return `這段對話目前由管家接手，慢寶將暫停自動回答至 ${pausedUntilLabel}。你的訊息仍會送達管家。\n${newChatHint}`;
  }

  return `這段對話目前由管家接手，慢寶已暫停自動回答。你的訊息仍會送達管家。\n${newChatHint}`;
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

export function isRealChatMessage(message: ChatMessage) {
  return (
    !message.isWelcome &&
    !message.isSystemNotice &&
    !message.deleted_at &&
    message.message.trim().length > 0
  );
}

function normalizeMessageContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function areDuplicateMessages(first: ChatMessage, second: ChatMessage) {
  if (first.id && second.id && first.id === second.id) {
    return true;
  }

  const optimisticCount =
    Number(Boolean(first.isOptimistic)) + Number(Boolean(second.isOptimistic));
  if (optimisticCount !== 1) {
    return false;
  }

  if (first.role !== second.role) {
    return false;
  }

  if (normalizeMessageContent(first.message) !== normalizeMessageContent(second.message)) {
    return false;
  }

  const firstTime = getCreatedTime(first);
  const secondTime = getCreatedTime(second);

  if (firstTime === null || secondTime === null) {
    return true;
  }

  return Math.abs(firstTime - secondTime) <= optimisticDuplicateWindowMs;
}

function choosePreferredMessage(current: ChatMessage, next: ChatMessage) {
  if (current.isOptimistic && !next.isOptimistic) {
    return next;
  }

  return current;
}

function dedupeMessages(messages: ChatMessage[]) {
  const result: ChatMessage[] = [];

  messages.forEach((message) => {
    const duplicateIndex = result.findIndex((existing) =>
      areDuplicateMessages(existing, message)
    );

    if (duplicateIndex >= 0) {
      result[duplicateIndex] = choosePreferredMessage(
        result[duplicateIndex],
        message
      );
      return;
    }

    result.push(message);
  });

  return result;
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const merged = dedupeMessages([
    ...current.filter((message) => isRealChatMessage(message)),
    ...incoming.filter((message) => isRealChatMessage(message)),
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

function hasHumanTakeoverNotice(messages: ChatMessage[]) {
  return messages.some(
    (message) =>
      message.isSystemNotice &&
      message.provider_used === "human_takeover" &&
      message.message.trim().length > 0
  );
}

function isNearScrollBottom(element: HTMLElement | null, threshold = 120) {
  if (!element) return true;

  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
  );
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
    .filter(isRealChatMessage);
  const dedupedCacheMessages = dedupeMessages(cacheMessages)
    .slice(-localCacheMessageLimit)
    .map((message) => ({
      id: message.id,
      session_id: message.session_id,
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

  if (!visitorId || !sessionId || dedupedCacheMessages.length === 0) {
    logChatDebug("cache write skipped", {
      visitorId,
      sessionId,
      messageCount: dedupedCacheMessages.length,
    });
    return;
  }

  try {
    const cachePayload = JSON.stringify({
      visitor_id: visitorId,
      session_id: sessionId,
      expires_at: Date.now() + sessionMessagesCacheTtlMs,
      messages: dedupedCacheMessages,
    });
    sessionStorage.setItem(recentChatStorageKey, cachePayload);
    localStorage.setItem(recentChatStorageKey, cachePayload);
    logChatDebug("cache write success", {
      visitorId,
      sessionId,
      messageCount: dedupedCacheMessages.length,
    });
  } catch (error) {
    console.warn("Mumbao chat cache save unavailable:", error);
  }
}

function getRecentMessagesForApi(messages: ChatMessage[]) {
  return dedupeMessages(messages.filter(isRealChatMessage))
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
  const isExplicitLineEntry = getChatEntrySource() === "line_liff";

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
  timeoutMs: number,
  onStatus?: (status: number) => void
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const handleExternalAbort = () => controller.abort();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", handleExternalAbort, {
          once: true,
        });
      }
    }

    const { signal: _externalSignal, ...requestOptions } = options;
    const response = await fetch(url, {
      ...requestOptions,
      signal: controller.signal,
    });
    onStatus?.(response.status);
    const data = (await response.json().catch(() => ({}))) as T &
      ChatApiErrorPayload;

    if (!response.ok) {
      throw new ChatApiError(data, response.status, response.headers);
    }

    return data;
  } finally {
    externalSignal?.removeEventListener("abort", handleExternalAbort);
    window.clearTimeout(timeoutId);
  }
}

type ChatApiErrorPayload = {
  error?: string;
  errorCode?: string;
  failureStage?: string;
  reason?: string;
  retryAfter?: string | number;
  metadata?: {
    requestId?: string;
    failureStage?: string;
    providerStatus?: number;
    retryAfter?: string | number;
  };
};

class ChatApiError extends Error {
  httpStatus: number;
  errorCode: string;
  failureStage: string;
  reason: string;
  requestId: string;
  retryAfter: string;

  constructor(payload: ChatApiErrorPayload, httpStatus: number, headers: Headers) {
    super(payload.error || `Request failed: ${httpStatus}`);
    this.name = "ChatApiError";
    this.httpStatus = httpStatus;
    this.errorCode = String(payload.errorCode || "");
    this.failureStage = String(
      payload.failureStage || payload.metadata?.failureStage || ""
    );
    this.reason = String(payload.reason || "");
    this.requestId = String(payload.metadata?.requestId || "");
    this.retryAfter = String(
      payload.retryAfter ||
        payload.metadata?.retryAfter ||
        headers.get("Retry-After") ||
        ""
    );
  }
}

const recoverableSessionErrorCodes = new Set([
  "invalid_session_id",
  "session_ownership_mismatch",
  "session_not_found",
  "deleted_session",
  "closed_session",
]);

function isRecoverableSessionError(error: unknown) {
  if (!(error instanceof ChatApiError)) return false;

  return (
    recoverableSessionErrorCodes.has(error.errorCode) ||
    error.failureStage === "session_validation" ||
    error.failureStage === "session_identity" ||
    error.reason === "session visitor mismatch"
  );
}

function getAssistantErrorMessage(error: unknown) {
  if (isRecoverableSessionError(error)) {
    return sessionReconnectReply;
  }

  if (error instanceof ChatApiError) {
    if (error.httpStatus === 429) {
      return rateLimitReply;
    }

    if (
      error.failureStage.startsWith("provider_") ||
      error.failureStage === "assistant_insert_failed" ||
      [500, 502, 503, 504].includes(error.httpStatus)
    ) {
      return errorReply;
    }

    return error.message || errorReply;
  }

  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TypeError")
  ) {
    return networkErrorReply;
  }

  return errorReply;
}

function normalizeAiMode(value?: string): ChatAiMode {
  return value === "human_takeover" ? "human_takeover" : "ai_active";
}

function getAiModeFromSession(
  session?: ChatSession | null,
  fallbackAiMode?: string
): ChatAiMode {
  if (session?.status === "human_takeover") {
    return "human_takeover";
  }

  return normalizeAiMode(session?.ai_mode || fallbackAiMode);
}

type MumbaoChatProps = {
  className?: string;
  compact?: boolean;
  isOpen?: boolean;
  preferredSessionId?: string;
  renderContext?: ChatRenderContext;
};

function buildLineRequestPayload(identity?: SessionRequestIdentity) {
  const source = identity?.entrySource || getChatEntrySource();

  return {
    source: source || undefined,
    anonymous_visitor_id: identity?.anonymousVisitorId || undefined,
    line_id_token: identity?.lineIdentity?.idToken || undefined,
    line_access_token: identity?.lineIdentity?.accessToken || undefined,
  };
}

function getChatEntrySource(): "line_liff" | "" {
  if (typeof window === "undefined") {
    return "";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("liff") === "1" || params.get("fromLine") === "1"
    ? "line_liff"
    : "";
}

function buildJsonHeaders(accessToken = "") {
  return {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function normalizeHumanMessageSummary(
  message:
    | (HumanMessageLike & {
        session_id?: string | number;
        created_at?: string;
      })
    | null
    | undefined,
  fallbackSessionId = ""
): HumanMessageSummary | null {
  if (!message?.id || !isHumanMessage(message)) return null;

  return {
    id: String(message.id),
    session_id: message.session_id
      ? String(message.session_id)
      : fallbackSessionId || undefined,
    role: "human",
    message: "",
    provider_used: message.provider_used || message.provider || "admin",
    created_at: String(message.created_at || ""),
  };
}

function collectLatestHumanMessages(data: {
  session?: (ChatSession & { latest_human_message?: ApiMessage | null }) | null;
  sessions?: Array<ChatSession & { latest_human_message?: ApiMessage | null }>;
  latest_human_message?: ApiMessage | null;
}) {
  const entries: Array<{
    sessionId: string;
    message: HumanMessageSummary | null;
  }> = [];

  if (data.session?.id) {
    const sessionId = String(data.session.id);
    entries.push({
      sessionId,
      message: normalizeHumanMessageSummary(
        data.session.latest_human_message || data.latest_human_message,
        sessionId
      ),
    });
  }

  (data.sessions || []).forEach((session) => {
    if (!session?.id) return;
    const sessionId = String(session.id);
    entries.push({
      sessionId,
      message: normalizeHumanMessageSummary(
        session.latest_human_message,
        sessionId
      ),
    });
  });

  return entries.filter((entry) => entry.message);
}

export async function fetchHumanUnreadState(accessToken = "") {
  const latestHumanMessages: Array<{
    sessionId: string;
    message: HumanMessageSummary | null;
  }> = [];

  if (accessToken) {
    const data = await fetchJsonWithTimeout<{
      sessions?: Array<ChatSession & { latest_human_message?: ApiMessage | null }>;
      latest_human_message?: ApiMessage | null;
    }>(
      "/api/ai-chat?action=history",
      {
        method: "POST",
        headers: buildJsonHeaders(accessToken),
        body: JSON.stringify({
          list_only: true,
          check_updates: true,
        }),
      },
      8000
    );

    latestHumanMessages.push(...collectLatestHumanMessages(data));
  }

  const storedIdentity = readStoredChatIdentity();
  if (storedIdentity.visitorId && storedIdentity.sessionId) {
    const data = await fetchJsonWithTimeout<{
      session?: ChatSession & { latest_human_message?: ApiMessage | null };
      latest_human_message?: ApiMessage | null;
    }>(
      "/api/ai-chat?action=history",
      {
        method: "POST",
        headers: buildJsonHeaders(accessToken),
        body: JSON.stringify({
          visitor_id: storedIdentity.visitorId,
          session_id: storedIdentity.sessionId,
          session_only: true,
          check_updates: true,
        }),
      },
      8000
    );

    latestHumanMessages.push(...collectLatestHumanMessages(data));
  }

  const dedupedLatestHumanMessages = Array.from(
    new Map(
      latestHumanMessages.map((entry) => [entry.sessionId, entry])
    ).values()
  ).sort((first, second) => {
    const firstTime = Date.parse(first.message?.created_at || "");
    const secondTime = Date.parse(second.message?.created_at || "");

    return (
      (Number.isNaN(secondTime) ? 0 : secondTime) -
      (Number.isNaN(firstTime) ? 0 : firstTime)
    );
  });

  return getHumanUnreadState(dedupedLatestHumanMessages);
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
  identity?: SessionRequestIdentity,
  accessToken = ""
) {
  return fetchJsonWithTimeout<{
    session?: ChatSession;
    sessions?: ChatSession[];
    support_status?: string;
    ai_mode?: string;
  }>(
    "/api/ai-chat?action=history",
    {
      method: "POST",
      headers: buildJsonHeaders(accessToken),
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
  identity?: SessionRequestIdentity,
  accessToken = ""
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
      support_status?: string;
      ai_mode?: string;
    }>(
      "/api/ai-chat?action=history",
      {
        method: "POST",
        headers: buildJsonHeaders(accessToken),
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

function getDebugSuffix(value: string) {
  return value ? `...${value.slice(-6)}` : "none";
}

function ChatDebugPanel({
  state,
  expanded,
  onToggle,
  instanceId,
  mountCount,
  unmountCount,
  renderContext,
  sessionId,
  hasVisitorId,
  source,
  liffStatus,
  messagesCount,
  aiMode,
}: {
  state: ChatDebugState;
  expanded: boolean;
  onToggle: () => void;
  instanceId: string;
  mountCount: number;
  unmountCount: number;
  renderContext: ChatRenderContext;
  sessionId: string;
  hasVisitorId: boolean;
  source: "web" | "line_liff";
  liffStatus: ChatLiffStatus;
  messagesCount: number;
  aiMode: ChatAiMode;
}) {
  return (
    <div className="rounded-xl border border-[#d8c6b4] bg-[#fff8eb] p-3 font-mono text-[10px] leading-5 text-[#66584f] shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left font-semibold"
        aria-expanded={expanded}
      >
        <span>Chat Debug</span>
        <span>{expanded ? "收合" : "展開"}</span>
      </button>
      {expanded && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-t border-[#e8d9ca] pt-2">
          <dt>Build</dt><dd className="break-all">{chatBuildMarker}</dd>
          <dt>Instance</dt><dd>{getDebugSuffix(instanceId)} / {renderContext}</dd>
          <dt>Mounts</dt><dd>{mountCount} (unmounts {unmountCount})</dd>
          <dt>Session</dt><dd>{getDebugSuffix(sessionId)}</dd>
          <dt>Visitor</dt><dd>{hasVisitorId ? "present" : "missing"}</dd>
          <dt>Source</dt><dd>{source}</dd>
          <dt>LIFF</dt><dd>{liffStatus}</dd>
          <dt>AI mode</dt><dd>{aiMode}</dd>
          <dt>Messages</dt><dd>{messagesCount}</dd>
          <dt>Last update</dt><dd className="break-all">{state.lastMessagesUpdate}</dd>
          <dt>Session update</dt><dd className="break-all">{state.lastSessionUpdate}</dd>
          <dt>History seq</dt><dd>{state.historyRequestSequence}</dd>
          <dt>History count</dt><dd>{state.historyResponseCount}</dd>
          <dt>Send</dt><dd>{state.sendStatus}</dd>
          <dt>API status</dt><dd>{state.apiHttpStatus ?? "-"}</dd>
          <dt>Unmounted</dt><dd>{unmountCount > 0 ? "yes" : "no"}</dd>
          <dt>SW controller</dt><dd>{typeof navigator !== "undefined" && navigator.serviceWorker?.controller ? "yes" : "no"}</dd>
          <dt>Timestamp</dt><dd className="break-all">{state.timestamp}</dd>
        </dl>
      )}
    </div>
  );
}

export function MumbaoChat({
  className,
  compact = false,
  isOpen = true,
  preferredSessionId = "",
  renderContext = "page",
}: MumbaoChatProps) {
  const { session: customerSession } = useCustomerAuth();
  const customerAccessToken = customerSession?.access_token || "";
  const debugEnabled = useMemo(() => isChatDebugEnabled(), []);
  const debugInstanceIdRef = useRef(createLocalId());
  const [debugExpanded, setDebugExpanded] = useState(true);
  const [debugMountCount, setDebugMountCount] = useState(chatMountCount);
  const [debugUnmountCount, setDebugUnmountCount] = useState(chatUnmountCount);
  const [liffStatus, setLiffStatus] = useState<ChatLiffStatus>("idle");
  const [debugState, setDebugState] = useState<ChatDebugState>(() => ({
    lastMessagesUpdate: "initial",
    lastSessionUpdate: "initial",
    historyRequestSequence: 0,
    historyResponseCount: 0,
    sendStatus: "idle",
    apiHttpStatus: null,
    timestamp: new Date().toISOString(),
  }));
  const [visitorId, setVisitorId] = useState("");
  const [anonymousVisitorId, setAnonymousVisitorId] = useState("");
  const [lineIdentity, setLineIdentity] = useState<LineIdentity | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [aiMode, setAiMode] = useState<ChatAiMode>("ai_active");
  const [aiPausedUntil, setAiPausedUntil] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createWelcomeMessage(),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isInitialHistoryLoading, setIsInitialHistoryLoading] = useState(false);
  const [isSessionActionLoading, setIsSessionActionLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isDesktopResizable, setIsDesktopResizable] = useState(false);
  const [windowSize, setWindowSize] = useState<ChatWindowSize>(() =>
    loadChatWindowSize()
  );
  const [isResizing, setIsResizing] = useState(false);
  const [hasNewHumanNotice, setHasNewHumanNotice] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const messagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const historyFetchIdRef = useRef(0);
  const historyRequestSequenceRef = useRef(0);
  const previousIsOpenRef = useRef(isOpen);
  const bootStartedAtRef = useRef(getTimingNow());
  const firstMessagesRenderLoggedRef = useRef(false);
  const lastCustomerAccessTokenRef = useRef("");
  const latestVisitorIdRef = useRef("");
  const latestSessionIdRef = useRef("");
  const isSendingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const pollingInFlightRef = useRef(false);
  const pollingAbortControllerRef = useRef<AbortController | null>(null);
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

  const recordDebug = useCallback(
    (patch: Partial<ChatDebugState>) => {
      if (!debugEnabled) return;

      setDebugState((current) => ({
        ...current,
        ...patch,
        timestamp: new Date().toISOString(),
      }));
    },
    [debugEnabled]
  );

  const updateSessionId = useCallback(
    (source: string, nextSessionId: string) => {
      const previousSessionId = latestSessionIdRef.current;
      latestSessionIdRef.current = nextSessionId;
      recordDebug({ lastSessionUpdate: source });
      logChatDebug("session id update", {
        source,
        previousSessionId: maskDebugId(previousSessionId),
        nextSessionId: maskDebugId(nextSessionId),
        sending: isSendingRef.current,
      });
      setSessionId(nextSessionId);
    },
    [recordDebug]
  );

  const applyAiModeFromResponse = useCallback(
    (
      source: string,
      data: {
        session?: ChatSession | null;
        ai_mode?: string;
        ai_paused_until?: string | null;
      }
    ) => {
      const nextAiMode = getAiModeFromSession(data.session, data.ai_mode);
      const nextAiPausedUntil =
        nextAiMode === "human_takeover"
          ? String(data.session?.ai_paused_until || data.ai_paused_until || "") ||
            null
          : null;
      setAiMode(nextAiMode);
      setAiPausedUntil(nextAiPausedUntil);
      logChatDebug("ai mode update", {
        source,
        aiMode: nextAiMode,
        aiPausedUntil: nextAiPausedUntil || "",
        sessionStatus: data.session?.status || "",
        supportStatus: data.session?.support_status || "",
      });
      return nextAiMode;
    },
    []
  );

  const updateMessages = useCallback(
    (
      source: string,
      updater: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])
    ) => {
      recordDebug({ lastMessagesUpdate: source });
      setMessages((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        logChatDebug("messages update", {
          source,
          before: getMessageDebugSummary(current),
          after: getMessageDebugSummary(next),
        });
        return next;
      });
    },
    [recordDebug]
  );

  const beginHistoryRequest = useCallback(
    (source: string) => {
      const sequence = historyRequestSequenceRef.current + 1;
      historyRequestSequenceRef.current = sequence;
      recordDebug({ historyRequestSequence: sequence });
      logChatDebug("history request sequence", { source, sequence });
      return sequence;
    },
    [recordDebug]
  );

  const completeHistoryRequest = useCallback(
    (source: string, sequence: number, responseCount: number) => {
      if (sequence !== historyRequestSequenceRef.current) {
        logChatDebug("stale history response ignored", {
          source,
          sequence,
          latestSequence: historyRequestSequenceRef.current,
          responseCount,
        });
        return;
      }

      recordDebug({
        historyRequestSequence: sequence,
        historyResponseCount: responseCount,
      });
      logChatDebug("history response received", {
        source,
        sequence,
        responseCount,
      });
    },
    [recordDebug]
  );

  const hasDraftMessage = useMemo(() => input.trim().length > 0, [input]);
  const isHumanTakeoverMode = aiMode === "human_takeover";
  const canResizeWindow = compact && isDesktopResizable;
  const visibleMessages = useMemo(
    () => getInitialMessages(sortMessagesByCreatedAt(dedupeMessages(messages))),
    [messages]
  );
  const latestVisibleHumanMessage = useMemo(
    () => getLatestHumanMessage(visibleMessages),
    [visibleMessages]
  );
  const mergeIncomingMessages = useCallback(
    (
      source: string,
      incomingMessages: ChatMessage[],
      details: Record<string, unknown> = {}
    ) => {
      const realIncomingMessages = incomingMessages.filter(isRealChatMessage);
      if (realIncomingMessages.length === 0) {
        logChatDebug("setMessages merge skipped: no incoming", {
          source,
          ...details,
        });
        return;
      }

      updateMessages(source, (current) => {
        const merged = mergeMessages(current, realIncomingMessages);
        logChatDebug("messages merged", {
          source,
          incomingCount: realIncomingMessages.length,
          before: getMessageDebugSummary(current),
          after: getMessageDebugSummary(merged),
          ...details,
        });
        return merged;
      });
    },
    [updateMessages]
  );
  const realMessageCount = useMemo(
    () => visibleMessages.filter(isRealChatMessage).length,
    [visibleMessages]
  );
  const messageTimeline = useMemo(() => {
    let lastDateKey = "";

    return visibleMessages.flatMap((message) => {
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
  }, [visibleMessages]);

  useEffect(() => {
    chatMountCount += 1;
    setDebugMountCount(chatMountCount);
    setDebugUnmountCount(chatUnmountCount);
    logChatDebug("mounted", {
      instanceId: maskDebugId(debugInstanceIdRef.current),
      mountCount: chatMountCount,
      compact,
      initialIsOpen: isOpen,
      route: window.location.pathname,
      isMobile: window.matchMedia("(max-width: 639px)").matches,
      isPortal: renderContext === "mobile-portal",
      source: getChatEntrySource() || "web",
    });

    return () => {
      chatUnmountCount += 1;
      lastChatUnmountAt = new Date().toISOString();
      logChatDebug("unmounted", {
        instanceId: maskDebugId(debugInstanceIdRef.current),
        unmountCount: chatUnmountCount,
        compact,
        route: window.location.pathname,
        isPortal: renderContext === "mobile-portal",
        source: getChatEntrySource() || "web",
        at: lastChatUnmountAt,
      });
    };
  }, []);

  useEffect(() => {
    latestVisitorIdRef.current = visitorId;
    latestSessionIdRef.current = sessionId;
  }, [sessionId, visitorId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    if (
      !isOpen ||
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      !latestVisibleHumanMessage
    ) {
      return;
    }

    const humanSessionId = latestVisibleHumanMessage.session_id || sessionId;
    if (!humanSessionId) return;

    markHumanMessageSeen(humanSessionId, latestVisibleHumanMessage);
    setHasNewHumanNotice(false);
  }, [isOpen, latestVisibleHumanMessage, sessionId]);

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

    const { visitorId: nextVisitorId, isExistingVisitor } = getVisitorIdentity();
    const existingSessionId = isExistingVisitor
      ? getStoredSessionId(nextVisitorId)
      : "";
    const coldStartCache = existingSessionId ? readRecentMessagesCache() : null;
    let isMounted = true;

    logChatDebug("initialization start", {
      nextVisitorId,
      isExistingVisitor,
      existingSessionId,
    });

    if (!isExistingVisitor) {
      clearSessionId();
    }
    if (!existingSessionId) {
      clearCachedMessages("initialization without active session", {
        visitorId: nextVisitorId,
      });
    }

    setAnonymousVisitorId(nextVisitorId);
    setVisitorId(nextVisitorId);
    updateSessionId("initialization", existingSessionId);
    const initialCachedMessages = loadCachedMessages(
      nextVisitorId,
      existingSessionId
    );
    const immediateMessages =
      initialCachedMessages.length > 0
        ? initialCachedMessages
        : [];
    mergeIncomingMessages("initialization cache applied", immediateMessages, {
      visitorId: maskDebugId(nextVisitorId),
      sessionId: maskDebugId(existingSessionId),
    });
    setIsInitialHistoryLoading(immediateMessages.length === 0);
    logChatDebug("initialization cache applied", {
      visitorId: maskDebugId(nextVisitorId),
      sessionId: maskDebugId(existingSessionId),
      messageCount: immediateMessages.length,
      strictCacheCount: initialCachedMessages.length,
      coldCacheSessionId: maskDebugId(coldStartCache?.sessionId),
    });

    async function recoverSession() {
      if (existingSessionId || !isExistingVisitor) {
        if (isMounted) {
          setIsInitialHistoryLoading(false);
        }
        return;
      }

      try {
        const data = await fetchSessionOnly(
          nextVisitorId,
          false,
          undefined,
          customerAccessToken
        );
        const recoveredSessionId = data.session?.id
          ? String(data.session.id)
          : "";

        if (!isMounted || !recoveredSessionId) return;

        applyAiModeFromResponse("session-recovery", data);
        updateSessionId("session-recovery", recoveredSessionId);
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
      const isLineEntry = getChatEntrySource() === "line_liff";
      if (isLineEntry) {
        setLiffStatus("initializing");
      }
      const identity = await loadLineIdentity();
      if (!isMounted) return;

      if (!identity) {
        if (isLineEntry) {
          setLiffStatus("failed");
        }
        recoverSession();
        return;
      }

      setLiffStatus("ready");
      try {
        const sessionIdForLineBind =
          latestSessionIdRef.current || existingSessionId;
        const boundLineSession = await bindLineSession(
          identity,
          nextVisitorId,
          sessionIdForLineBind
        );
        applyAiModeFromResponse("line-session-bind", boundLineSession);
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
          anonymousVisitorId: maskDebugId(nextVisitorId),
          effectiveVisitorId: maskDebugId(effectiveVisitorId),
          recoveredSessionId: maskDebugId(recoveredSessionId),
        });

        if (
          coldStartCache?.sessionId &&
          coldStartCache.sessionId !== recoveredSessionId
        ) {
          messagesCacheRef.current.delete(coldStartCache.sessionId);
          clearCachedMessages("line session changed", {
            coldCacheSessionId: maskDebugId(coldStartCache.sessionId),
            recoveredSessionId: maskDebugId(recoveredSessionId),
          });
          logChatDebug("line session changed: preserving current messages", {
            coldCacheSessionId: maskDebugId(coldStartCache.sessionId),
            recoveredSessionId: maskDebugId(recoveredSessionId),
            current: getMessageDebugSummary(messages),
          });
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
          updateSessionId("line-cache", recoveredSessionId);
          mergeIncomingMessages("line cache applied before history", cachedMessages, {
            visitorId: maskDebugId(effectiveVisitorId),
            sessionId: maskDebugId(recoveredSessionId),
          });
          messagesCacheRef.current.set(recoveredSessionId, cachedMessages);
          saveSessionId(recoveredSessionId, effectiveVisitorId);
          logChatDebug("line cache applied before history", {
            visitorId: maskDebugId(effectiveVisitorId),
            sessionId: maskDebugId(recoveredSessionId),
            messageCount: cachedMessages.length,
          });
        }

        const lineHistorySequence = beginHistoryRequest("line-initialization");
        try {
          const historyData = await fetchLatestHistory(
            effectiveVisitorId,
            recoveredSessionId,
            {
              lineIdentity: identity,
              anonymousVisitorId: nextVisitorId,
            },
            customerAccessToken
          );
          applyAiModeFromResponse("line-history", historyData);
          const historyMessages = (historyData.messages || [])
            .map(normalizeMessage)
            .filter((message) => message.message.trim().length > 0);
          completeHistoryRequest(
            "line-initialization",
            lineHistorySequence,
            historyMessages.length
          );

        latestMessages =
            historyMessages.length > 0
              ? sortMessagesByCreatedAt(historyMessages)
              : cachedMessages;
          hasMore = Boolean(historyData.has_more);
        } catch (error) {
          completeHistoryRequest("line-initialization", lineHistorySequence, 0);
          console.warn("Mumbao chat LINE history unavailable:", error);
        }

        if (
          isSendingRef.current &&
          !sessionIdForLineBind &&
          latestMessages.length === 0
        ) {
          setLineIdentity(identity);
          logChatDebug("line initialization deferred during active send", {
            anonymousVisitorId: maskDebugId(nextVisitorId),
            recoveredSessionId: maskDebugId(recoveredSessionId),
          });
          return;
        }

        setLineIdentity(identity);
        setVisitorId(effectiveVisitorId);
        updateSessionId("line-initialization", recoveredSessionId);
        mergeIncomingMessages("line initialization completed", latestMessages, {
          visitorId: maskDebugId(effectiveVisitorId),
          sessionId: maskDebugId(recoveredSessionId),
        });
        setHasMoreHistory(hasMore);
        messagesCacheRef.current.set(recoveredSessionId, latestMessages);
        saveCachedMessages(effectiveVisitorId, latestMessages, recoveredSessionId);
        saveSessionId(recoveredSessionId, effectiveVisitorId);
        logChatDebug("line initialization completed", {
          visitorId: maskDebugId(effectiveVisitorId),
          sessionId: maskDebugId(recoveredSessionId),
          messageCount: latestMessages.length,
          hasMore,
        });
      } catch (error) {
        setLiffStatus("failed");
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
  }, [
    beginHistoryRequest,
    completeHistoryRequest,
    customerAccessToken,
    isOpen,
    applyAiModeFromResponse,
    mergeIncomingMessages,
    updateSessionId,
  ]);

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
      targetAccessToken = customerAccessToken,
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
          visitorId: maskDebugId(targetVisitorId),
          sessionId: maskDebugId(targetSessionId),
          messageCount: cachedMessages.length,
        });
        mergeIncomingMessages("history refresh hydrate from cache", cachedMessages, {
          visitorId: maskDebugId(targetVisitorId),
          sessionId: maskDebugId(targetSessionId),
        });
      } else if (showLoading) {
        setIsInitialHistoryLoading(true);
      }

      const refreshHistorySequence = beginHistoryRequest("history-refresh");
      try {
        const data = await fetchLatestHistory(targetVisitorId, targetSessionId, {
          lineIdentity: targetLineIdentity,
          anonymousVisitorId: targetAnonymousVisitorId,
        }, targetAccessToken);
        completeHistoryRequest(
          "history-refresh",
          refreshHistorySequence,
          data.messages?.length || 0
        );

        if (historyFetchIdRef.current !== fetchId) return;

        applyAiModeFromResponse("history-refresh", data);
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
            updateSessionId("history-response", nextSessionId);
          }
          saveSessionId(nextSessionId, nextVisitorId);
          effectiveSessionId = nextSessionId;
          effectiveVisitorId = nextVisitorId;
        }

        const historyMessages = (data.messages || [])
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0);

        if (historyMessages.length > 0) {
          shouldAutoScrollRef.current = isNearScrollBottom(scrollRef.current);
          updateMessages("history-response", (current) => {
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
              visitorId: maskDebugId(effectiveVisitorId),
              sessionId: maskDebugId(effectiveSessionId),
              incomingCount: historyMessages.length,
              mergedCount: merged.filter(isRealChatMessage).length,
            });
            return merged;
          });
        } else {
          logChatDebug("history refresh no incoming messages", {
            visitorId: maskDebugId(effectiveVisitorId),
            sessionId: maskDebugId(effectiveSessionId),
          });
        }

        setHasMoreHistory(Boolean(data.has_more));
      } catch (error) {
        completeHistoryRequest("history-refresh", refreshHistorySequence, 0);
        if (isRecoverableSessionError(error)) {
          console.warn("Mumbao chat session expired during history refresh:", error);
          messagesCacheRef.current.delete(targetSessionId);
          clearSessionId();
          clearCachedMessages("history session invalid", {
            sessionId: targetSessionId,
          });
          updateMessages("history-session-reset", [createWelcomeMessage()]);
          setAiMode("ai_active");
          setAiPausedUntil(null);
          setHasMoreHistory(false);

          if (targetSessionId === latestSessionIdRef.current) {
            updateSessionId("history-session-reset", "");
          }

          try {
            const data = await fetchSessionOnly(
              targetVisitorId,
              false,
              {
                lineIdentity: targetLineIdentity,
                anonymousVisitorId: targetAnonymousVisitorId,
              },
              targetAccessToken
            );
            const nextSessionId = data.session?.id
              ? String(data.session.id)
              : "";
            const nextVisitorId = data.session?.visitor_id
              ? String(data.session.visitor_id)
              : targetVisitorId;

            if (nextSessionId) {
              applyAiModeFromResponse("history-session-recovered", data);
              if (nextVisitorId !== visitorId) {
                setVisitorId(nextVisitorId);
              }
              updateSessionId("history-session-recovered", nextSessionId);
              saveSessionId(nextSessionId, nextVisitorId);
            }
          } catch (sessionError) {
            console.warn("Mumbao chat session recovery unavailable:", sessionError);
          }
          return;
        }

        console.warn("Mumbao chat history refresh unavailable:", error);
      } finally {
        if (historyFetchIdRef.current === fetchId) {
          setIsInitialHistoryLoading(false);
        }
      }
    },
    [
      anonymousVisitorId,
      applyAiModeFromResponse,
      beginHistoryRequest,
      completeHistoryRequest,
      customerAccessToken,
      lineIdentity,
      mergeIncomingMessages,
      sessionId,
      updateSessionId,
      visitorId,
    ]
  );

  useEffect(() => {
    if (!isOpen || !visitorId || !customerAccessToken) return;
    if (lastCustomerAccessTokenRef.current === customerAccessToken) return;

    lastCustomerAccessTokenRef.current = customerAccessToken;
    let isCancelled = false;

    async function bindCustomerSession() {
      try {
        const data = await fetchSessionOnly(
          visitorId,
          false,
          {
            lineIdentity,
            anonymousVisitorId,
          },
          customerAccessToken
        );

        if (isCancelled || !data.session?.id) return;

        applyAiModeFromResponse("customer-bind", data);
        const nextSessionId = String(data.session.id);
        const nextVisitorId = data.session.visitor_id
          ? String(data.session.visitor_id)
          : visitorId;

        setVisitorId(nextVisitorId);
        updateSessionId("customer-bind", nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
        await refreshCurrentSessionHistory({
          showLoading: true,
          targetVisitorId: nextVisitorId,
          targetSessionId: nextSessionId,
          targetLineIdentity: lineIdentity,
          targetAnonymousVisitorId: anonymousVisitorId,
          targetAccessToken: customerAccessToken,
        });
      } catch (error) {
        console.warn("Mumbao chat customer session bind unavailable:", error);
      }
    }

    bindCustomerSession();

    return () => {
      isCancelled = true;
    };
  }, [
    anonymousVisitorId,
    applyAiModeFromResponse,
    customerAccessToken,
    isOpen,
    lineIdentity,
    refreshCurrentSessionHistory,
    updateSessionId,
    visitorId,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    const { visitorId: storedVisitorId } = getVisitorIdentity();
    const effectiveVisitorId = visitorId || storedVisitorId;
    const storedSessionId = effectiveVisitorId
      ? getStoredSessionId(effectiveVisitorId)
      : "";
    const unreadPreferredSessionId = isValidChatUuid(preferredSessionId)
      ? preferredSessionId
      : "";
    const effectiveSessionId =
      unreadPreferredSessionId || sessionId || storedSessionId;

    logChatDebug("open hydrate start", {
      stateVisitorId: maskDebugId(visitorId),
      stateSessionId: maskDebugId(sessionId),
      storedVisitorId: maskDebugId(storedVisitorId),
      storedSessionId: maskDebugId(storedSessionId),
      preferredSessionId: maskDebugId(unreadPreferredSessionId),
      effectiveVisitorId: maskDebugId(effectiveVisitorId),
      effectiveSessionId: maskDebugId(effectiveSessionId),
      hasInitialized: hasInitializedRef.current,
    });

    if (!visitorId && effectiveVisitorId) {
      setVisitorId(effectiveVisitorId);
    }
    if (!anonymousVisitorId && storedVisitorId) {
      setAnonymousVisitorId(storedVisitorId);
    }
    if (effectiveSessionId && effectiveSessionId !== sessionId) {
      updateSessionId("open-hydrate", effectiveSessionId);
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
        visitorId: maskDebugId(effectiveVisitorId),
        sessionId: maskDebugId(effectiveSessionId),
        messageCount: cachedMessages.length,
      });
      mergeIncomingMessages("open hydrate immediate messages", cachedMessages, {
        visitorId: maskDebugId(effectiveVisitorId),
        sessionId: maskDebugId(effectiveSessionId),
      });
    } else {
      logChatDebug("open hydrate no cache, fetching history immediately", {
        visitorId: maskDebugId(effectiveVisitorId),
        sessionId: maskDebugId(effectiveSessionId),
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
    mergeIncomingMessages,
    preferredSessionId,
    refreshCurrentSessionHistory,
    sessionId,
    updateSessionId,
    visitorId,
  ]);

  useEffect(() => {
    if (!isOpen || !visitorId || !sessionId) return;

    let isCancelled = false;

    const loadNewMessages = async (reason = "interval") => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        logChatDebug("polling skipped: document hidden", {
          reason,
          visitorId,
          sessionId,
        });
        return;
      }

      if (pollingInFlightRef.current) {
        logChatDebug("polling skipped: request in flight", {
          reason,
          visitorId,
          sessionId,
        });
        return;
      }

      const after = getNewestCreatedAt(messagesRef.current);
      const pollingHistorySequence = beginHistoryRequest("polling");
      const shouldScrollAfterMerge = isNearScrollBottom(scrollRef.current);
      const abortController = new AbortController();
      pollingInFlightRef.current = true;
      pollingAbortControllerRef.current = abortController;

      logChatDebug("polling tick", {
        reason,
        endpoint: "/api/ai-chat?action=history",
        visitorId,
        sessionId,
        after: after || "",
        currentMessageCount: messagesRef.current.filter(isRealChatMessage).length,
      });

      try {
        const data = await fetchJsonWithTimeout<{
          session?: ChatSession;
          messages?: ApiMessage[];
          support_status?: string;
          ai_mode?: string;
        }>(
          "/api/ai-chat?action=history",
          {
            method: "POST",
            headers: buildJsonHeaders(customerAccessToken),
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
            signal: abortController.signal,
          },
          8000
        );
        completeHistoryRequest(
          "polling",
          pollingHistorySequence,
          data.messages?.length || 0
        );

        if (isCancelled) return;

        applyAiModeFromResponse("polling", data);
        const incomingMessages = (data.messages || [])
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0);

        if (incomingMessages.length === 0) {
          logChatDebug("polling no new messages", { visitorId, sessionId });
          return;
        }

        shouldAutoScrollRef.current = shouldScrollAfterMerge;
        if (
          incomingMessages.some((message) => isHumanMessage(message)) &&
          !shouldScrollAfterMerge
        ) {
          setHasNewHumanNotice(true);
        }
        updateMessages("polling-response", (current) =>
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
        completeHistoryRequest("polling", pollingHistorySequence, 0);
        if (error instanceof Error && error.name === "AbortError") {
          logChatDebug("polling aborted", { reason, visitorId, sessionId });
          return;
        }

        if (isRecoverableSessionError(error)) {
          console.warn("Mumbao chat polling session expired:", error);
          messagesCacheRef.current.delete(sessionId);
          clearSessionId();
          clearCachedMessages("polling session invalid", { sessionId });
          updateSessionId("polling-session-reset", "");
          setAiMode("ai_active");
          setAiPausedUntil(null);
          setHasMoreHistory(false);
          return;
        }

        console.warn("Mumbao chat live messages unavailable:", error);
      } finally {
        if (pollingAbortControllerRef.current === abortController) {
          pollingAbortControllerRef.current = null;
        }
        pollingInFlightRef.current = false;
      }
    };

    logChatDebug("polling started", {
      intervalMs: humanUnreadPollingIntervalMs,
      visitorId,
      sessionId,
    });
    const timer = window.setInterval(
      () => void loadNewMessages("interval"),
      humanUnreadPollingIntervalMs
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadNewMessages("visible");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      pollingAbortControllerRef.current?.abort();
      pollingAbortControllerRef.current = null;
      pollingInFlightRef.current = false;
      logChatDebug("polling stopped", { visitorId, sessionId });
    };
  }, [
    anonymousVisitorId,
    applyAiModeFromResponse,
    beginHistoryRequest,
    completeHistoryRequest,
    customerAccessToken,
    isOpen,
    lineIdentity,
    sessionId,
    updateMessages,
    visitorId,
  ]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (isNearScrollBottom(scrollElement)) {
        setHasNewHumanNotice(false);
      }
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, []);

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
    const loadHistorySequence = beginHistoryRequest("load-history");

    try {
      const before = getOldestCreatedAt(messages);
    const data = await fetchJsonWithTimeout<{
      session?: ChatSession;
      sessions?: ChatSession[];
      messages?: ApiMessage[];
      has_more?: boolean;
      support_status?: string;
      ai_mode?: string;
      }>(
        "/api/ai-chat?action=history",
        {
          method: "POST",
          headers: buildJsonHeaders(customerAccessToken),
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
      completeHistoryRequest(
        "load-history",
        loadHistorySequence,
        data.messages?.length || 0
      );

      applyAiModeFromResponse("load-history", data);
      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        const nextVisitorId = data.session.visitor_id
          ? String(data.session.visitor_id)
          : visitorId;
        if (nextVisitorId !== visitorId) {
          setVisitorId(nextVisitorId);
        }
        updateSessionId("load-history", nextSessionId);
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

      updateMessages("load-history", (current) =>
        mergeMessages(current, historyMessages)
      );
      setHasMoreHistory(
        Boolean(data.has_more) && historyMessages.length >= historyPageSize
      );
    } catch (error) {
      completeHistoryRequest("load-history", loadHistorySequence, 0);
      pendingScrollRestoreRef.current = null;
      if (isRecoverableSessionError(error)) {
        console.warn("Mumbao chat session expired during history load:", error);
        if (sessionId) {
          messagesCacheRef.current.delete(sessionId);
        }
        clearSessionId();
        clearCachedMessages("load history session invalid", { sessionId });
        updateSessionId("load-history-session-reset", "");
        updateMessages("load-history-session-reset", [createWelcomeMessage()]);
        setAiMode("ai_active");
        setAiPausedUntil(null);
        setHasMoreHistory(false);
        return;
      }

      console.warn("Mumbao chat history unavailable:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleStartNewSession = async () => {
    if (!visitorId || isSessionActionLoading) return;

    setIsSessionActionLoading(true);
    shouldAutoScrollRef.current = true;

    try {
      const data = await fetchSessionOnly(
        visitorId,
        true,
        {
          lineIdentity,
          anonymousVisitorId,
        },
        customerAccessToken
      );
      const nextSessionId = data.session?.id ? String(data.session.id) : "";
      const nextVisitorId = data.session?.visitor_id
        ? String(data.session.visitor_id)
        : visitorId;

      applyAiModeFromResponse("new-chat", data);
      if (nextSessionId) {
        setVisitorId(nextVisitorId);
        updateSessionId("new-chat", nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
      }

      updateMessages("new-chat", [createWelcomeMessage()]);
      setHasMoreHistory(false);
    } catch (error) {
      console.warn("Mumbao chat new session unavailable:", error);
      updateMessages("new-chat-error", (current) => [
        ...current.filter((message) => isRealChatMessage(message)),
        createMessage("assistant", "慢寶暫時無法開始新對話，請稍後再試。"),
      ]);
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!visitorId || !sessionId || isSessionActionLoading) return;

    const confirmed = window.confirm(
      "刪除後，此段對話將不再顯示，慢寶也不會再用它接續回答。"
    );
    if (!confirmed) return;

    setIsSessionActionLoading(true);

    try {
      await fetchJsonWithTimeout<{ deleted_at?: string }>(
        "/api/ai-chat?action=delete-session",
        {
          method: "POST",
          headers: buildJsonHeaders(customerAccessToken),
          body: JSON.stringify({
            visitor_id: visitorId,
            session_id: sessionId,
          }),
        },
        8000
      );

      messagesCacheRef.current.delete(sessionId);
      clearCachedMessages("session deleted", { sessionId });
      clearSessionId();
      updateMessages("delete-session", [createWelcomeMessage()]);
      setHasMoreHistory(false);
      updateSessionId("delete-session", "");
      setAiMode("ai_active");
      setAiPausedUntil(null);

      const data = await fetchSessionOnly(
        visitorId,
        true,
        {
          lineIdentity,
          anonymousVisitorId,
        },
        customerAccessToken
      );
      const nextSessionId = data.session?.id ? String(data.session.id) : "";
      const nextVisitorId = data.session?.visitor_id
        ? String(data.session.visitor_id)
        : visitorId;

      applyAiModeFromResponse("delete-session-replacement", data);
      if (nextSessionId) {
        setVisitorId(nextVisitorId);
        updateSessionId("delete-session-replacement", nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
      }
    } catch (error) {
      console.warn("Mumbao chat delete session unavailable:", error);
      updateMessages("delete-session-error", (current) => [
        ...current.filter((message) => isRealChatMessage(message)),
        createMessage("assistant", "慢寶暫時無法刪除這段對話，請稍後再試。"),
      ]);
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const question = input.trim();
    if (!question || isLoading || !visitorId) return;

    const pendingUserMessage = {
      ...createMessage("user", question),
      isOptimistic: true,
      clientRequestId: createLocalId(),
    };

    logChatDebug("send start", {
      visitorId: maskDebugId(visitorId),
      sessionId: maskDebugId(sessionId),
      hasCustomerToken: Boolean(customerAccessToken),
      hasLineIdentity: Boolean(lineIdentity),
      anonymousVisitorId: maskDebugId(anonymousVisitorId),
      clientRequestId: maskDebugId(pendingUserMessage.clientRequestId),
      current: getMessageDebugSummary(messages),
    });

    shouldAutoScrollRef.current = true;
    recordDebug({ sendStatus: "sending", apiHttpStatus: null });
    updateMessages("optimistic-send", (current) => {
      const nextMessages = mergeMessages(current, [pendingUserMessage]);
      logChatDebug("optimistic user message inserted", {
        clientRequestId: maskDebugId(pendingUserMessage.clientRequestId),
        before: getMessageDebugSummary(current),
        after: getMessageDebugSummary(nextMessages),
      });
      return nextMessages;
    });
    setInput("");
    setIsLoading(true);
    isSendingRef.current = true;

    const sendMessageRequest = (targetSessionId: string) =>
      fetchJsonWithTimeout<ChatMessageResponse>(
        "/api/ai-chat?action=message",
        {
          method: "POST",
          headers: buildJsonHeaders(customerAccessToken),
          body: JSON.stringify({
            visitor_id: visitorId,
            session_id: targetSessionId || undefined,
            message: question,
            recentMessages: getRecentMessagesForApi(messages),
            ...buildLineRequestPayload({
              lineIdentity,
              anonymousVisitorId,
            }),
          }),
        },
        30000,
        (status) => recordDebug({ apiHttpStatus: status })
      );

    try {
      let data: ChatMessageResponse;

      try {
        data = await sendMessageRequest(sessionId);
      } catch (error) {
        if (!isRecoverableSessionError(error)) {
          throw error;
        }

        console.warn("Mumbao chat session expired during send:", error);
        if (sessionId) {
          messagesCacheRef.current.delete(sessionId);
        }
        clearSessionId();
        clearCachedMessages("message session invalid", { sessionId });
        updateSessionId("message-session-reset", "");
        setAiMode("ai_active");
        setAiPausedUntil(null);

        data = await sendMessageRequest("");
      }

      recordDebug({ sendStatus: "success" });

      const responseAiMode = applyAiModeFromResponse("message-response", data);
      const isAiSkipped = Boolean(
        data.ai_skipped ||
          data.humanTakeover ||
          data.provider_used === "human_takeover" ||
          responseAiMode === "human_takeover"
      );
      const savedUserMessage = data.userMessage
        ? normalizeMessage(data.userMessage)
        : pendingUserMessage;
      const savedAiMessage = isAiSkipped
        ? null
        : data.aiMessage
        ? normalizeMessage(data.aiMessage)
        : data.answer
          ? createMessage("assistant", data.answer)
          : createMessage("assistant", errorReply);
      const systemNoticeMessage = isAiSkipped
        ? createHumanTakeoverNoticeMessage(data.notice || humanTakeoverNotice)
        : null;

      logChatDebug("API response received", {
        clientRequestId: maskDebugId(pendingUserMessage.clientRequestId),
        responseSessionId: maskDebugId(data.session?.id),
        responseVisitorId: maskDebugId(data.session?.visitor_id),
        hasUserMessage: Boolean(data.userMessage),
        hasAiMessage: Boolean(data.aiMessage || data.answer),
        humanTakeover: Boolean(data.humanTakeover),
        aiSkipped: isAiSkipped,
      });

      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        const nextVisitorId = data.session.visitor_id
          ? String(data.session.visitor_id)
          : visitorId;
        if (nextVisitorId !== visitorId) {
          setVisitorId(nextVisitorId);
        }
        updateSessionId("message-response", nextSessionId);
        saveSessionId(nextSessionId, nextVisitorId);
      }

      updateMessages(isAiSkipped ? "human-takeover-response" : "api-response", (current) => {
        const nextMessages = mergeMessages(
          current,
          [savedUserMessage, savedAiMessage].filter(Boolean) as ChatMessage[]
        );
        const displayMessages =
          systemNoticeMessage && !hasHumanTakeoverNotice(nextMessages)
            ? [...nextMessages, systemNoticeMessage]
            : nextMessages;
        logChatDebug("AI message inserted", {
          clientRequestId: maskDebugId(pendingUserMessage.clientRequestId),
          before: getMessageDebugSummary(current),
          after: getMessageDebugSummary(displayMessages),
          aiSkipped: isAiSkipped,
        });
        return displayMessages;
      });
    } catch (error) {
      recordDebug({ sendStatus: "error" });
      console.warn("Mumbao chat message unavailable:", error);
      const assistantErrorMessage = getAssistantErrorMessage(error);

      updateMessages("send-error", (current) => {
        const nextMessages = mergeMessages(current, [
          createMessage("assistant", assistantErrorMessage),
        ]);
        logChatDebug("send error message inserted", {
          clientRequestId: maskDebugId(pendingUserMessage.clientRequestId),
          before: getMessageDebugSummary(current),
          after: getMessageDebugSummary(nextMessages),
        });
        return nextMessages;
      });
    } finally {
      isSendingRef.current = false;
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
      data-chat-build={chatBuildMarker}
      data-chat-context={renderContext}
      data-chat-instance={debugEnabled ? getDebugSuffix(debugInstanceIdRef.current) : undefined}
      className={cn(
        "relative box-border flex h-full max-h-[100dvh] min-h-0 flex-col overflow-hidden border border-white/80 bg-[#fffaf2]/95 shadow-[0_24px_80px_rgba(111,88,71,0.18)] backdrop-blur-2xl",
        compact ? "rounded-[28px]" : "rounded-[32px]",
        isResizing && "select-none",
        isResizing && "[&_*]:!transition-none",
        className
      )}
      aria-label="問慢寶 AI客服"
    >
      {debugEnabled && (
        <div className="flex-none bg-[#fffdf8] px-3 pt-3">
          <ChatDebugPanel
            state={debugState}
            expanded={debugExpanded}
            onToggle={() => setDebugExpanded((current) => !current)}
            instanceId={debugInstanceIdRef.current}
            mountCount={debugMountCount}
            unmountCount={debugUnmountCount}
            renderContext={renderContext}
            sessionId={sessionId}
            hasVisitorId={Boolean(visitorId)}
            source={getChatEntrySource() === "line_liff" ? "line_liff" : "web"}
            liffStatus={liffStatus}
            messagesCount={realMessageCount}
            aiMode={aiMode}
          />
        </div>
      )}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#fffdf8] px-4 pb-[calc(env(safe-area-inset-bottom,0px)_+_1.5rem)] pt-5 [-webkit-overflow-scrolling:touch]"
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

        <div className="rounded-2xl border border-[#f0e3d4] bg-white/80 px-4 py-3 text-xs leading-5 text-[#8a796a] shadow-sm">
          <p>
            {customerAccessToken
              ? "已登入，慢寶會保留你的對話紀錄，方便下次接續。"
              : "登入後可保留對話紀錄。"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartNewSession}
              disabled={isSessionActionLoading || isLoading || !visitorId}
              className="rounded-full border border-[#ead8c6] bg-[#fffaf2] px-3 py-1.5 text-[11px] font-medium text-[#7a6758] transition hover:bg-[#f8efe3] disabled:cursor-wait disabled:opacity-60"
            >
              新對話
            </button>
            <button
              type="button"
              onClick={handleDeleteSession}
              disabled={isSessionActionLoading || isLoading || !sessionId}
              className="rounded-full border border-[#ead8c6] bg-white px-3 py-1.5 text-[11px] font-medium text-[#9a6a55] transition hover:bg-[#fff3e8] disabled:cursor-wait disabled:opacity-60"
            >
              刪除此段
            </button>
          </div>
        </div>

        {isHumanTakeoverMode && (
          <div className="rounded-2xl border border-[#ead8c6] bg-[#fff7ea] px-4 py-3 text-xs leading-5 text-[#7a5a40] shadow-sm">
            <p className="font-semibold text-[#5f4937]">{humanTakeoverLabel}</p>
            <p className="mt-1 whitespace-pre-line">
              {getHumanTakeoverBanner(aiPausedUntil)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStartNewSession}
              disabled={isSessionActionLoading || isLoading || !visitorId}
              className="mt-3 h-8 rounded-full border-[#d8c3ad] bg-white px-3 text-xs text-[#6f5a45] hover:bg-[#fff2df] disabled:cursor-wait disabled:opacity-60"
            >
              開啟新對話
            </Button>
          </div>
        )}

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
          if (message.isSystemNotice || message.role === "system") {
            return (
              <div key={message.id} className="flex justify-center">
                <div className="max-w-[90%] rounded-2xl border border-[#ead8c6] bg-[#fff7ea] px-4 py-3 text-center text-xs leading-6 text-[#7a5a40] shadow-sm">
                  <p className="font-semibold text-[#5f4937]">
                    {humanTakeoverLabel}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    {message.message}
                  </p>
                </div>
              </div>
            );
          }

          const messageTime = formatTaipeiMessageTime(message.created_at);
          const isUserMessage = message.role === "user";
          const isHumanChatMessage = isHumanMessage(message);
          const senderName = isUserMessage
            ? "我"
            : isHumanChatMessage
              ? "人工客服"
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
                      : isHumanChatMessage
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

        {hasNewHumanNotice && (
          <div className="sticky bottom-3 z-10 flex justify-center">
            <button
              type="button"
              onClick={() => {
                shouldAutoScrollRef.current = true;
                setHasNewHumanNotice(false);
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
              className="rounded-full border border-[#ead8c6] bg-white/95 px-4 py-2 text-xs font-semibold text-[#7a5a40] shadow-[0_10px_24px_rgba(111,88,71,0.14)] backdrop-blur"
            >
              管家有新回覆
            </button>
          </div>
        )}

        {isLoading && !isHumanTakeoverMode && (
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
