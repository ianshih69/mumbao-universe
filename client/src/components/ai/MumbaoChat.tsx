import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
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

type ChatRole = "assistant" | "user";

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

function getStoredSessionId() {
  return localStorage.getItem(sessionStorageKey) || "";
}

function saveSessionId(nextSessionId: string) {
  if (!nextSessionId) return;
  localStorage.setItem(sessionStorageKey, nextSessionId);
}

function clearSessionId() {
  localStorage.removeItem(sessionStorageKey);
}

function normalizeMessage(apiMessage: ApiMessage): ChatMessage {
  return {
    id: String(apiMessage.id || createLocalId()),
    role: apiMessage.sender === "user" ? "user" : "assistant",
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
      sender: message.role === "user" ? "user" : "ai",
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

async function fetchSessionOnly(visitorId: string, forceNewSession = false) {
  return fetchJsonWithTimeout<{
    session?: { id?: string | number };
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
      }),
    },
    8000
  );
}

export function MumbaoChat({ className, compact = false }: MumbaoChatProps) {
  const [visitorId, setVisitorId] = useState("");
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
  const inputRef = useRef<HTMLInputElement>(null);
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
    const existingSessionId = isExistingVisitor ? getStoredSessionId() : "";
    let isMounted = true;

    if (!isExistingVisitor) {
      clearSessionId();
    }

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
        saveSessionId(recoveredSessionId);
      } catch (error) {
        console.warn("Mumbao chat session recovery unavailable:", error);
      }
    }

    recoverSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!visitorId) return;
    saveCachedMessages(visitorId, messages);
  }, [messages, visitorId]);

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
        session?: { id?: string | number };
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
          }),
        },
        8000
      );

      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        setSessionId(nextSessionId);
        saveSessionId(nextSessionId);
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
        session?: { id?: string | number };
        userMessage?: ApiMessage;
        aiMessage?: ApiMessage;
        answer?: string;
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
          }),
        },
        30000
      );

      const savedUserMessage = data.userMessage
        ? normalizeMessage(data.userMessage)
        : pendingUserMessage;
      const savedAiMessage = data.aiMessage
        ? normalizeMessage(data.aiMessage)
        : data.answer
          ? createMessage("assistant", data.answer)
          : createMessage("assistant", errorReply);

      if (data.session?.id) {
        const nextSessionId = String(data.session.id);
        setSessionId(nextSessionId);
        saveSessionId(nextSessionId);
      }

      setMessages((current) =>
        sortMessagesByCreatedAt([
          ...current.filter(
            (message) =>
              isRealChatMessage(message) && message.id !== pendingUserMessage.id
          ),
          savedUserMessage,
          savedAiMessage,
        ])
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

  const handleEndConversation = async () => {
    if (!visitorId || isLoading || isHistoryLoading) return;

    clearSessionId();
    setSessionId("");
    setMessages([createWelcomeMessage()]);
    setHasMoreHistory(true);
    shouldAutoScrollRef.current = true;

    try {
      const data = await fetchSessionOnly(visitorId, true);
      const nextSessionId = data.session?.id ? String(data.session.id) : "";

      if (!nextSessionId) return;

      setSessionId(nextSessionId);
      saveSessionId(nextSessionId);
    } catch (error) {
      console.warn("Mumbao chat new session unavailable:", error);
    }
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
          <Button
            type="button"
            onClick={handleEndConversation}
            disabled={!visitorId || isLoading || isHistoryLoading}
            className="h-8 flex-none rounded-full border border-white/80 bg-white/70 px-3 text-xs font-medium text-[#8a796a] shadow-sm hover:bg-white disabled:opacity-60"
          >
            結束對話
          </Button>
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

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex w-full",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[82%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm",
                message.role === "user"
                  ? "rounded-br-md bg-[#9ec7b8] text-white"
                  : "rounded-bl-md border border-[#f0e3d4] bg-white text-[#5f544b]"
              )}
            >
              {message.message}
            </div>
          </div>
        ))}

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
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="輸入想問慢寶的問題"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-[#ead8c6] bg-white px-4 text-base text-[#5c5147] shadow-inner outline-none transition focus:border-[#9ec7b8] focus:ring-4 focus:ring-[#9ec7b8]/20 md:text-sm"
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
