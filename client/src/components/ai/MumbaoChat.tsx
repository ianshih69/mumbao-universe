import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  message: string;
  created_at?: string;
};

type ApiMessage = {
  id?: string | number;
  sender?: string;
  message?: string;
  created_at?: string;
};

const visitorStorageKey = "mumbao_visitor_id";
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
    created_at: apiMessage.created_at,
  };
}

function getInitialMessages(messages: ChatMessage[]) {
  return messages.length > 0 ? messages : [createMessage("assistant", welcomeMessage)];
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createMessage("assistant", welcomeMessage),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isLoading && !isHistoryLoading,
    [input, isLoading, isHistoryLoading]
  );

  useEffect(() => {
    let isMounted = true;
    const nextVisitorId = getVisitorId();
    setVisitorId(nextVisitorId);

    async function loadHistory() {
      try {
        const data = await fetchJsonWithTimeout<{ messages?: ApiMessage[] }>(
          "/api/ai-chat-history",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ visitor_id: nextVisitorId }),
          },
          4500
        );

        if (!isMounted) return;

        const historyMessages = (data.messages || [])
          .map(normalizeMessage)
          .filter((message) => message.message.trim().length > 0);

        setMessages(getInitialMessages(sortMessagesByCreatedAt(historyMessages)));
      } catch (error) {
        console.warn("Mumbao chat history unavailable:", error);
        if (isMounted) {
          setMessages([createMessage("assistant", welcomeMessage)]);
        }
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading, isHistoryLoading]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const question = input.trim();
    if (!question || isLoading || isHistoryLoading || !visitorId) return;

    const pendingUserMessage = createMessage("user", question);

    setMessages((current) => [...current, pendingUserMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const data = await fetchJsonWithTimeout<{
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
            message: question,
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

      setMessages((current) =>
        sortMessagesByCreatedAt([
          ...current.filter((message) => message.id !== pendingUserMessage.id),
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
        ...current,
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
        "flex h-full min-h-0 flex-col overflow-hidden border border-white/80 bg-[#fffaf2]/95 shadow-[0_24px_80px_rgba(111,88,71,0.18)] backdrop-blur-2xl",
        compact ? "rounded-[28px]" : "rounded-[32px]",
        className
      )}
      aria-label="問慢寶 AI客服"
    >
      <div className="relative overflow-hidden border-b border-white/70 bg-[#f8efe3] px-5 py-4">
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
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fffdf8] px-4 py-5"
      >
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

        {isHistoryLoading && (
          <div className="flex justify-start">
            <div className="rounded-3xl rounded-bl-md border border-[#f0e3d4] bg-white px-4 py-3 text-sm text-[#8a796a] shadow-sm">
              慢寶正在整理之前的對話…
            </div>
          </div>
        )}

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
        className="flex items-end gap-2 border-t border-white/70 bg-[#f8efe3]/90 p-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="輸入想問慢寶的問題"
          className="min-h-11 flex-1 rounded-full border border-[#ead8c6] bg-white px-4 text-base text-[#5c5147] shadow-inner outline-none transition focus:border-[#9ec7b8] focus:ring-4 focus:ring-[#9ec7b8]/20 md:text-sm"
        />
        <Button
          type="submit"
          disabled={!canSend}
          className="size-11 rounded-full bg-[#8dbbad] p-0 text-white shadow-md hover:bg-[#7aaea0]"
          aria-label="送出訊息"
        >
          <Send className="size-5" aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}
