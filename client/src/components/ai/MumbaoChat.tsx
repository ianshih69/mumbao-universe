import {
  FormEvent,
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

const visitorStorageKey = "mumbao_visitor_id";
const recentChatStorageKey = "mumbao_chat_recent_messages";
const historyPageSize = 7;
const localCacheMessageLimit = 30;
const recentContextMessageLimit = 12;
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

function getVisitorId() {
  const existingVisitorId = localStorage.getItem(visitorStorageKey);
  if (existingVisitorId) {
    return existingVisitorId;
  }

  const nextVisitorId = createLocalId();
  localStorage.setItem(visitorStorageKey, nextVisitorId);
  return nextVisitorId;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const pendingScrollRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const hasDraftMessage = useMemo(() => input.trim().length > 0, [input]);

  useEffect(() => {
    const nextVisitorId = getVisitorId();
    setVisitorId(nextVisitorId);
    setMessages(getInitialMessages(loadCachedMessages(nextVisitorId)));
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
        setSessionId(String(data.session.id));
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
        setSessionId(String(data.session.id));
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

  return (
    <section
      className={cn(
        "box-border flex h-full max-h-[100dvh] min-h-0 flex-col overflow-hidden border border-white/80 bg-[#fffaf2]/95 shadow-[0_24px_80px_rgba(111,88,71,0.18)] backdrop-blur-2xl",
        compact ? "rounded-[28px]" : "rounded-[32px]",
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
          <div>
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
    </section>
  );
}
