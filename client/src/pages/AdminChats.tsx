import {
  FormEvent,
  KeyboardEvent,
  UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bot, Lock, RefreshCw, Search, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatSessionStatus = "ai_active" | "human_takeover" | "closed";

type AdminChatSession = {
  id: string;
  session_id?: string;
  visitor_id?: string;
  visitor_name?: string;
  line_user_id?: string;
  line_display_name?: string;
  line_picture_url?: string;
  source?: string;
  auth_user_id?: string;
  customer_profile_id?: string;
  customer_email?: string;
  status?: ChatSessionStatus;
  unread_count?: number;
  last_message?: string;
  latest_message_at?: string;
  created_at?: string;
  updated_at?: string;
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
const sessionListLimit = 30;

const statusLabels: Record<string, string> = {
  ai_active: "AI 回覆中",
  human_takeover: "人工接手中",
  closed: "已關閉",
};

function isLineEntrySession(session?: AdminChatSession) {
  const source = String(session?.source || "").toLowerCase();
  return source === "line_liff" || source === "line" || Boolean(session?.line_user_id);
}

function isMemberSession(session?: AdminChatSession) {
  return Boolean(
    session?.auth_user_id ||
      session?.customer_profile_id ||
      session?.customer_email
  );
}

function getSourceLabel(session?: AdminChatSession) {
  const source = String(session?.source || "").toLowerCase();

  if (source === "line_liff") return "LINE 圖文入口";
  if (source === "line" || source === "liff") return "LIFF 入口";
  if (isMemberSession(session)) return "會員登入";
  if (source === "web" || !source) return "網站問慢寶";

  return source;
}

function getAudienceLabel(session?: AdminChatSession) {
  if (isMemberSession(session)) return "會員登入";
  if (isLineEntrySession(session)) return "LINE 訪客";
  return "訪客";
}

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
  if (!value) return "";

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
  return session?.line_display_name || session?.visitor_name || "訪客";
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

function getNewestCreatedAt(messages: AdminChatMessage[]) {
  return messages.reduce((newest, message) => {
    if (!message.created_at || Number.isNaN(Date.parse(message.created_at))) {
      return newest;
    }

    if (!newest || Date.parse(message.created_at) > Date.parse(newest)) {
      return message.created_at;
    }

    return newest;
  }, "");
}

function mergeMessages(
  current: AdminChatMessage[],
  incoming: AdminChatMessage[]
) {
  const byId = new Map<string, AdminChatMessage>();

  for (const message of [...current, ...incoming]) {
    byId.set(String(message.id), message);
  }

  return Array.from(byId.values()).sort((first, second) => {
    const firstTime = Date.parse(first.created_at || "") || 0;
    const secondTime = Date.parse(second.created_at || "") || 0;
    return firstTime - secondTime;
  });
}

function mergeSessions(
  current: AdminChatSession[],
  incoming: AdminChatSession[],
  replace = false
) {
  const byId = new Map<string, AdminChatSession>();

  for (const session of replace ? incoming : current) {
    byId.set(String(session.id), session);
  }

  if (!replace) {
    for (const session of incoming) {
      byId.set(String(session.id), {
        ...byId.get(String(session.id)),
        ...session,
      });
    }
  }

  return Array.from(byId.values()).sort((first, second) => {
    const firstTime =
      Date.parse(first.latest_message_at || first.updated_at || "") || 0;
    const secondTime =
      Date.parse(second.latest_message_at || second.updated_at || "") || 0;
    return secondTime - firstTime;
  });
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
  const [isMoreSessionsLoading, setIsMoreSessionsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [sessionPage, setSessionPage] = useState(0);
  const [error, setError] = useState("");
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(
    () => new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesCacheRef = useRef<Map<string, AdminChatMessage[]>>(new Map());

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

  const loadSessions = useCallback(
    async ({
      page = 0,
      append = false,
      silent = false,
    }: { page?: number; append?: boolean; silent?: boolean } = {}) => {
      if (!token) return;
      if (append) {
        setIsMoreSessionsLoading(true);
      } else if (!silent) {
        setIsSessionsLoading(true);
      }

      try {
        const params = new URLSearchParams({
          limit: String(sessionListLimit),
          page: String(page),
        });
        const trimmedSearch = search.trim();
        if (trimmedSearch) params.set("q", trimmedSearch);

        const data = await fetchAdminJson<{
          sessions?: AdminChatSession[];
          hasMore?: boolean;
          nextPage?: number | null;
        }>(`/api/admin-chat?action=sessions&${params.toString()}`, token);
        const nextSessions = data.sessions || [];

        setSessions((current) =>
          mergeSessions(current, nextSessions, !append && !silent)
        );
        setHasMoreSessions(Boolean(data.hasMore));
        setSessionPage(
          typeof data.nextPage === "number" ? data.nextPage : page + 1
        );
        setError("");

      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "載入對話列表失敗"
        );
      } finally {
        if (append) {
          setIsMoreSessionsLoading(false);
        } else if (!silent) {
          setIsSessionsLoading(false);
        }
      }
    },
    [search, token]
  );

  const loadMessages = useCallback(
    async (
      sessionId = selectedSessionId,
      { silent = false, incremental = false } = {}
    ) => {
      if (!token || !sessionId) return;

      const cachedMessages = messagesCacheRef.current.get(sessionId) || [];
      const since = incremental ? getNewestCreatedAt(cachedMessages) : "";

      if (!silent && cachedMessages.length > 0) {
        setMessages(cachedMessages);
      }

      if (!silent && cachedMessages.length === 0) {
        setIsMessagesLoading(true);
      }

      try {
        const params = new URLSearchParams({
          action: "messages",
          sessionId,
        });
        if (since) params.set("since", since);
        const data = await fetchAdminJson<{ messages?: AdminChatMessage[] }>(
          `/api/admin-chat?${params.toString()}`,
          token
        );
        const incomingMessages = data.messages || [];
        const mergedMessages = since
          ? mergeMessages(cachedMessages, incomingMessages)
          : mergeMessages([], incomingMessages);

        messagesCacheRef.current.set(sessionId, mergedMessages);
        if (sessionId === selectedSessionId) {
          setMessages(mergedMessages);
        }
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "載入訊息失敗"
        );
      } finally {
        if (!silent && cachedMessages.length === 0) {
          setIsMessagesLoading(false);
        }
      }
    },
    [selectedSessionId, token]
  );

  useEffect(() => {
    if (!token) return;

    setSessions([]);
    setSelectedSessionId("");
    setHasMoreSessions(true);
    setSessionPage(0);
    loadSessions({ page: 0 });
    const timer = window.setInterval(
      () => loadSessions({ page: 0, silent: true }),
      10000
    );
    return () => window.clearInterval(timer);
  }, [loadSessions, token]);

  useEffect(() => {
    if (!token || !selectedSessionId) return;

    const cachedMessages = messagesCacheRef.current.get(selectedSessionId);
    if (cachedMessages) {
      setMessages(cachedMessages);
      loadMessages(selectedSessionId, { silent: true, incremental: true });
    } else {
      setMessages([]);
      loadMessages(selectedSessionId);
    }

    const timer = window.setInterval(
      () => loadMessages(selectedSessionId, { silent: true, incremental: true }),
      5000
    );
    return () => window.clearInterval(timer);
  }, [loadMessages, selectedSessionId, token]);

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
    messagesCacheRef.current.clear();
    setFailedAvatarIds(new Set());
    setToken("");
    setPassword("");
    setSessions([]);
    setMessages([]);
    setSelectedSessionId("");
  };

  const loadNextSessionPage = () => {
    if (isMoreSessionsLoading || !hasMoreSessions) return;
    loadSessions({ page: sessionPage, append: true, silent: true });
  };

  const handleSessionScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remaining < 120) {
      loadNextSessionPage();
    }
  };

  const updateStatus = async (status: ChatSessionStatus) => {
    if (!selectedSessionId || !token) return;

    try {
      await fetchAdminJson(
        `/api/admin-chat?action=session&sessionId=${encodeURIComponent(selectedSessionId)}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      await loadSessions({ page: 0, silent: true });
    } catch (statusError) {
      setError(
        statusError instanceof Error ? statusError.message : "更新狀態失敗"
      );
    }
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (!content || !selectedSessionId || isSending || !token) return;

    setIsSending(true);
    try {
      const data = await fetchAdminJson<{ message?: AdminChatMessage }>(
        `/api/admin-chat?action=messages&sessionId=${encodeURIComponent(selectedSessionId)}`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );
      setReply("");
      if (data.message) {
        const cachedMessages =
          messagesCacheRef.current.get(selectedSessionId) || [];
        const mergedMessages = mergeMessages(cachedMessages, [data.message]);
        messagesCacheRef.current.set(selectedSessionId, mergedMessages);
        setMessages(mergedMessages);
      }
      await loadSessions({ page: 0, silent: true });
    } catch (sendError) {
      console.error("admin chat send reply failed:", sendError);
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
              <h1 className="text-2xl font-semibold">網站問慢寶客服後台</h1>
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
    <main className="flex h-[100svh] w-full max-w-[100vw] overflow-hidden overflow-x-hidden bg-[#f6f1ea] text-stone-900">
      <aside
        className={cn(
          "flex w-full max-w-none flex-col border-r border-stone-200 bg-white md:w-[390px] md:max-w-[390px]",
          selectedSessionId && "hidden md:flex"
        )}
      >
        <header className="border-b border-stone-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                Chat Console
              </p>
              <h1 className="text-xl font-semibold">網站問慢寶客服後台</h1>
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

        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={handleSessionScroll}>
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              目前沒有對話
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = selectedSessionId === session.id;
              const hasLineAvatar =
                Boolean(session.line_picture_url) &&
                !failedAvatarIds.has(String(session.id));

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
                    {hasLineAvatar ? (
                      <img
                        src={session.line_picture_url}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                        onError={() =>
                          setFailedAvatarIds((current) => {
                            const next = new Set(current);
                            next.add(String(session.id));
                            return next;
                          })
                        }
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-200 text-stone-500">
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
                        {formatSessionTime(
                          session.latest_message_at ||
                            session.updated_at ||
                            session.created_at
                        ) || "—"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-stone-500">
                      {session.last_message || "尚無訊息"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                        {statusLabels[session.status || "ai_active"] || session.status}
                      </span>
                      <span className="inline-flex rounded-full bg-[#f7efe6] px-2 py-0.5 text-[11px] text-[#8a6a4f]">
                        {getSourceLabel(session)}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {getAudienceLabel(session)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
          {isMoreSessionsLoading && (
            <div className="p-4 text-center text-xs text-stone-400">
              載入更多對話中...
            </div>
          )}
          {!hasMoreSessions && sessions.length > 0 && (
            <div className="p-4 text-center text-xs text-stone-300">
              已載入全部對話
            </div>
          )}
        </div>
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col overflow-x-hidden bg-[#fffdf8]",
          selectedSession ? "flex" : "hidden md:flex"
        )}
      >
        {selectedSession ? (
          <>
            <header className="flex flex-none flex-col gap-3 border-b border-stone-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-5 md:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSessionId("")}
                  className="h-8 flex-none px-2 text-sm md:hidden"
                >
                  ← 返回
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold md:text-lg">
                    {getDisplayName(selectedSession)}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span>{getSourceLabel(selectedSession)}</span>
                    <span>・</span>
                    <span>{getAudienceLabel(selectedSession)}</span>
                    {selectedSession.line_display_name && (
                      <>
                        <span>・</span>
                        <span>LINE 名稱：{selectedSession.line_display_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
                <span className="inline-flex flex-none whitespace-nowrap rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                  {statusLabels[selectedSession.status || "ai_active"]}
                </span>
                {selectedSession.status === "human_takeover" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateStatus("ai_active")}
                    className="flex-none whitespace-nowrap"
                  >
                    恢復 AI
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => updateStatus("human_takeover")}
                    className="flex-none whitespace-nowrap"
                  >
                    接手對話
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus("closed")}
                  className="flex-none whitespace-nowrap"
                >
                  關閉
                </Button>
              </div>
            </header>

            <div className="flex-none border-b border-stone-200 bg-[#fff8ec] px-4 py-3 text-xs leading-6 text-[#756357] md:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-[#4f4036]">
                  來源：{getSourceLabel(selectedSession)}
                </span>
                {selectedSession.customer_email && (
                  <span>會員：{selectedSession.customer_email}</span>
                )}
                {selectedSession.line_user_id && (
                  <span className="text-stone-500">
                    LINE ID：{selectedSession.line_user_id}
                  </span>
                )}
                {selectedSession.visitor_id && !selectedSession.line_user_id && (
                  <span className="text-stone-500">
                    訪客 ID：{selectedSession.visitor_id}
                  </span>
                )}
              </div>
              {selectedSession.status === "human_takeover" && (
                <p className="mt-1">
                  已切換人工接手。慢寶將暫停自動回答，此對話仍只在網站問慢寶中進行。
                </p>
              )}
              {isLineEntrySession(selectedSession) && (
                <p className="mt-1">
                  此客人是從 LINE 圖文選單開啟問慢寶，但目前系統不會將人工回覆推送到 LINE。
                </p>
              )}
            </div>

            {error && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div
              ref={scrollRef}
              className="min-h-0 w-full flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-5 md:py-5"
            >
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
                          {isGuest ? "客人" : isHuman ? "人工客服" : "AI 慢寶"}
                        </span>
                      )}
                      <div
                        className={cn(
                          "max-w-[78%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm md:max-w-[72%]",
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

            <footer
              className="flex-none border-t border-stone-200 bg-white px-3 pt-3 md:p-4"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
              }}
            >
              <p className="mb-2 text-xs leading-5 text-stone-500">
                此回覆只會顯示在網站問慢寶聊天視窗，不會傳送到 LINE 官方帳號聊天室。
              </p>
              <div className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  placeholder="輸入要顯示在網站問慢寶聊天視窗的人工回覆，Enter 送出，Shift + Enter 換行"
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl"
                />
                <Button
                  type="button"
                  onClick={sendReply}
                  disabled={!reply.trim() || isSending}
                  className="h-12 flex-none gap-2 rounded-full px-4"
                  aria-label="回覆到網站聊天"
                >
                  <Send className="size-5" />
                  <span className="hidden sm:inline">回覆到網站聊天</span>
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
