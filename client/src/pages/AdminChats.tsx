import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Lock, RefreshCw, Search, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatSessionStatus = "ai_active" | "human_takeover" | "closed";

type AdminChatSession = {
  id: string;
  visitor_id?: string;
  line_user_id?: string;
  line_display_name?: string;
  line_picture_url?: string;
  source?: string;
  status?: ChatSessionStatus;
  unread_count?: number;
  last_message?: string;
  latest_message_at?: string;
  created_at?: string;
  updated_at?: string;
  last_role?: string;
};

type AdminChatMessage = {
  id: string | number;
  session_id: string;
  role: "user" | "assistant" | "human" | "system";
  content: string;
  provider_used?: string | null;
  created_at?: string;
};

const adminTokenKey = "mumbao-admin-chat-token";
const statusLabels: Record<string, string> = {
  ai_active: "AI 回覆中",
  human_takeover: "管家接手中",
  closed: "已關閉",
};

function getStoredAdminToken() {
  try {
    return sessionStorage.getItem(adminTokenKey) || "";
  } catch {
    return "";
  }
}

function saveAdminToken(token: string) {
  sessionStorage.setItem(adminTokenKey, token);
}

function clearAdminToken() {
  sessionStorage.removeItem(adminTokenKey);
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
  if (!value || Number.isNaN(Date.parse(value))) return "";
  const { year, month, day } = getTaipeiDateParts(value);
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function formatDateLabel(value?: string) {
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

function formatMessageTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatSessionTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "";

  const dateKey = getTaipeiDateKey(value);
  const todayKey = getTaipeiDateKey(new Date().toISOString());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getTaipeiDateKey(yesterday.toISOString());

  if (dateKey === todayKey) return formatMessageTime(value);
  if (dateKey === yesterdayKey) return "昨天";
  return formatDateLabel(value);
}

function getDisplayName(session?: AdminChatSession) {
  return session?.line_display_name || "訪客";
}

function buildHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchAdminJson<T>(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export default function AdminChats() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sessions, setSessions] = useState<AdminChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [selectedSessionId, sessions]
  );

  const messageTimeline = useMemo(() => {
    let lastDateKey = "";

    return messages.flatMap((message) => {
      const items: Array<
        | { type: "date"; id: string; label: string }
        | { type: "message"; message: AdminChatMessage }
      > = [];
      const dateKey = getTaipeiDateKey(message.created_at);

      if (dateKey && dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        items.push({
          type: "date",
          id: `date-${dateKey}-${message.id}`,
          label: formatDateLabel(message.created_at),
        });
      }

      items.push({ type: "message", message });
      return items;
    });
  }, [messages]);

  const loadSessions = async (silent = false) => {
    if (!token) return;
    if (!silent) setIsSessionsLoading(true);

    try {
      const query = search.trim()
        ? `?q=${encodeURIComponent(search.trim())}`
        : "";
      const data = await fetchAdminJson<{ sessions?: AdminChatSession[] }>(
        `/api/admin/chat-sessions${query}`,
        token
      );
      const nextSessions = data.sessions || [];
      setSessions(nextSessions);
      setError("");

      if (!selectedSessionId && nextSessions[0]?.id) {
        setSelectedSessionId(String(nextSessions[0].id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "載入對話失敗");
    } finally {
      if (!silent) setIsSessionsLoading(false);
    }
  };

  const loadMessages = async (sessionId = selectedSessionId, silent = false) => {
    if (!token || !sessionId) return;
    if (!silent) setIsMessagesLoading(true);

    try {
      const data = await fetchAdminJson<{ messages?: AdminChatMessage[] }>(
        `/api/admin/chat-sessions/${encodeURIComponent(sessionId)}/messages`,
        token
      );
      setMessages(data.messages || []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "載入訊息失敗");
    } finally {
      if (!silent) setIsMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    loadSessions();
    const timer = window.setInterval(() => loadSessions(true), 10000);
    return () => window.clearInterval(timer);
  }, [token, search]);

  useEffect(() => {
    if (!token || !selectedSessionId) return;

    loadMessages(selectedSessionId);
    const timer = window.setInterval(
      () => loadMessages(selectedSessionId, true),
      5000
    );
    return () => window.clearInterval(timer);
  }, [token, selectedSessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    const nextToken = password.trim();
    if (!nextToken) {
      setLoginError("請輸入管理密碼");
      return;
    }

    saveAdminToken(nextToken);
    setToken(nextToken);
    setLoginError("");
  };

  const logout = () => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setSessions([]);
    setMessages([]);
    setSelectedSessionId("");
  };

  const updateStatus = async (status: ChatSessionStatus) => {
    if (!selectedSessionId || !token) return;

    try {
      await fetchAdminJson(
        `/api/admin/chat-sessions/${encodeURIComponent(selectedSessionId)}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      await loadSessions(true);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新狀態失敗");
    }
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (!content || !selectedSessionId || isSending || !token) return;

    setIsSending(true);
    try {
      const data = await fetchAdminJson<{ message?: AdminChatMessage }>(
        `/api/admin/chat-sessions/${encodeURIComponent(selectedSessionId)}/messages`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );
      setReply("");
      if (data.message) {
        setMessages((current) => [...current, data.message as AdminChatMessage]);
      }
      await loadSessions(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "送出失敗");
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    sendReply();
  };

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f6f1ea] px-5 text-stone-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-stone-900 text-white">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="text-2xl font-semibold">慢寶客服後台</h1>
            </div>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="請輸入管理密碼"
            className="h-11 rounded-none"
          />
          {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
          <Button type="submit" className="mt-5 h-11 w-full rounded-none">
            進入客服後台
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex h-[100svh] overflow-hidden bg-[#f6f1ea] text-stone-900">
      <aside className="flex w-full max-w-[390px] flex-col border-r border-stone-200 bg-white">
        <header className="border-b border-stone-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                Chat Console
              </p>
              <h1 className="text-xl font-semibold">慢寶客服後台</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              登出
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3">
            <Search className="size-4 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋客人或訊息"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {isSessionsLoading && <RefreshCw className="size-4 animate-spin text-stone-400" />}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              目前沒有對話紀錄
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = selectedSessionId === session.id;

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSessionId(String(session.id))}
                  className={cn(
                    "flex w-full gap-3 border-b border-stone-100 px-4 py-3 text-left transition",
                    isActive ? "bg-[#f7efe6]" : "bg-white hover:bg-stone-50"
                  )}
                >
                  <div className="relative flex-none">
                    {session.line_picture_url ? (
                      <img
                        src={session.line_picture_url}
                        alt=""
                        className="size-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-full bg-stone-200 text-stone-500">
                        <UserRound className="size-5" />
                      </div>
                    )}
                    {Boolean(session.unread_count) && (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs font-semibold text-white">
                        {session.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {getDisplayName(session)}
                      </p>
                      <span className="flex-none text-xs text-stone-400">
                        {formatSessionTime(session.latest_message_at)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-stone-500">
                      {session.last_message || "尚無訊息"}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                      {statusLabels[session.status || "ai_active"] || session.status}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#fffdf8]">
        {selectedSession ? (
          <>
            <header className="flex flex-none items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {getDisplayName(selectedSession)}
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  {selectedSession.line_user_id || selectedSession.visitor_id}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                  {statusLabels[selectedSession.status || "ai_active"]}
                </span>
                {selectedSession.status === "human_takeover" ? (
                  <Button variant="outline" onClick={() => updateStatus("ai_active")}>
                    恢復 AI
                  </Button>
                ) : (
                  <Button onClick={() => updateStatus("human_takeover")}>
                    接手對話
                  </Button>
                )}
                <Button variant="outline" onClick={() => updateStatus("closed")}>
                  關閉
                </Button>
              </div>
            </header>

            {error && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {isMessagesLoading ? (
                <div className="py-10 text-center text-sm text-stone-400">
                  載入訊息中...
                </div>
              ) : (
                messageTimeline.map((item) => {
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
                  const isGuest = message.role === "user";
                  const isHuman = message.role === "human";
                  const isSystem = message.role === "system";

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full flex-col gap-1",
                        isGuest ? "items-start" : "items-end",
                        isSystem && "items-center"
                      )}
                    >
                      {!isSystem && (
                        <span className="px-1 text-[11px] text-stone-400">
                          {isGuest ? "客人" : isHuman ? "管家" : "AI 慢寶"}
                        </span>
                      )}
                      <div
                        className={cn(
                          "max-w-[72%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm",
                          isGuest && "rounded-bl-md border border-stone-200 bg-white text-stone-700",
                          message.role === "assistant" &&
                            "rounded-br-md bg-[#e9f2ee] text-stone-700",
                          isHuman && "rounded-br-md bg-[#9ec7b8] text-white",
                          isSystem && "rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500"
                        )}
                      >
                        {message.content}
                      </div>
                      {!isSystem && (
                        <span className="px-1 text-[11px] leading-none text-stone-400">
                          {formatMessageTime(message.created_at)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <footer className="flex-none border-t border-stone-200 bg-white p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  placeholder="輸入管家回覆，Enter 送出，Shift + Enter 換行"
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl"
                />
                <Button
                  type="button"
                  onClick={sendReply}
                  disabled={!reply.trim() || isSending}
                  className="size-12 rounded-full p-0"
                  aria-label="送出管家回覆"
                >
                  <Send className="size-5" />
                </Button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-stone-400">
            <Bot className="mb-3 size-10" />
            <p>請從左側選擇一個對話</p>
          </div>
        )}
      </section>
    </main>
  );
}
