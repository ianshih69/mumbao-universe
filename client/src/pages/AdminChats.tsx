import {
  KeyboardEvent,
  UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bot, PauseCircle, RefreshCw, Search, Send, ShieldCheck, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  clearAdminToken as clearStoredAdminToken,
  getAdminIdentity,
  getAdminToken,
  isAdminAuthError,
  type AdminIdentity,
} from "@/lib/shop/adminAuth";
import { ensureFreshAdminSession } from "@/lib/shop/adminIdentityApi";

type ChatSessionStatus = "ai_active" | "human_takeover" | "closed";
type ChatSupportStatus =
  | "ai_replying"
  | "needs_human"
  | "human_takeover"
  | "replied"
  | "closed";
type PauseDuration = "30m" | "1h" | "manual";
type ChatSessionFilter =
  | "all"
  | "needs_human"
  | "human_takeover"
  | "replied"
  | "closed"
  | "line"
  | "website"
  | "member"
  | "visitor";

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
  support_status?: ChatSupportStatus;
  ai_mode?: "ai_active" | "human_takeover" | string;
  ai_paused_until?: string | null;
  should_ai_reply?: boolean;
  unread_count?: number;
  last_message?: string;
  latest_message_sender?: string;
  latest_message_at?: string;
  support_status_updated_at?: string;
  handled_at?: string;
  handled_by_name?: string;
  handled_by_email?: string;
  handled_by_role?: string;
  closed_at?: string;
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

const sessionListLimit = 30;
const chatSupportRoles = new Set(["super_admin", "admin", "manager"]);
const pauseDurationOptions: Array<{
  value: PauseDuration;
  label: string;
  description: string;
}> = [
  {
    value: "30m",
    label: "暫停 30 分鐘",
    description: "預設選項，適合短時間由管家接手確認。",
  },
  {
    value: "1h",
    label: "暫停 1 小時",
    description: "適合付款、退款或需要稍長處理時間的對話。",
  },
  {
    value: "manual",
    label: "持續暫停，直到手動恢復",
    description: "只用在客訴或需管家全程處理的特殊情況。",
  },
];

const supportStatusLabels: Record<ChatSupportStatus, string> = {
  ai_replying: "AI 回覆中",
  needs_human: "人工待辦",
  human_takeover: "AI 已暫停",
  replied: "已回覆",
  closed: "已關閉",
};

const supportStatusStyles: Record<ChatSupportStatus, string> = {
  ai_replying: "bg-stone-100 text-stone-600",
  needs_human: "bg-[#fff0d9] text-[#9a5a22]",
  human_takeover: "bg-[#efe6d9] text-[#7a5b41]",
  replied: "bg-[#e5f2ec] text-[#4b7a63]",
  closed: "bg-stone-200 text-stone-500",
};

const sessionFilters: Array<{ value: ChatSessionFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "needs_human", label: "人工待辦" },
  { value: "human_takeover", label: "AI 已暫停" },
  { value: "replied", label: "已回覆" },
  { value: "closed", label: "已關閉" },
  { value: "line", label: "LINE 圖文入口" },
  { value: "website", label: "網站問慢寶" },
  { value: "member", label: "會員登入" },
  { value: "visitor", label: "一般網站訪客" },
];

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
  return "一般網站訪客";
}

function getSupportStatus(session?: AdminChatSession): ChatSupportStatus {
  if (session?.status === "closed" || session?.support_status === "closed") {
    return "closed";
  }

  if (session?.support_status) return session.support_status;
  if (session?.latest_message_sender === "human") return "replied";

  if (session?.status === "human_takeover" || session?.should_ai_reply === false) {
    return Number(session?.unread_count || 0) > 0
      ? "needs_human"
      : "human_takeover";
  }

  return "ai_replying";
}

function canViewChatSupport(identity: AdminIdentity | null) {
  return chatSupportRoles.has(identity?.role_code || "");
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

function getPauseRemainingLabel(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "";

  const remainingMs = Date.parse(value) - Date.now();
  if (remainingMs <= 0) return "即將自動恢復";

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) return `剩餘 ${remainingMinutes} 分鐘`;

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes ? `剩餘 ${hours} 小時 ${minutes} 分鐘` : `剩餘 ${hours} 小時`;
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
  const activeToken = await ensureFreshAdminSession(token);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(activeToken),
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
  const [, setLocation] = useLocation();
  const [token, setToken] = useState(() => getAdminToken());
  const [identity, setIdentity] = useState<AdminIdentity | null>(() =>
    getAdminIdentity()
  );
  const [sessions, setSessions] = useState<AdminChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<ChatSessionFilter>("needs_human");
  const [reply, setReply] = useState("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isMoreSessionsLoading, setIsMoreSessionsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);
  const [sessionPage, setSessionPage] = useState(0);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
  const [pauseDuration, setPauseDuration] = useState<PauseDuration>("30m");
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(
    () => new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesCacheRef = useRef<Map<string, AdminChatMessage[]>>(new Map());
  const canAccessChatSupport = canViewChatSupport(identity);

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

  const handleAuthFailure = useCallback(() => {
    clearStoredAdminToken();
    messagesCacheRef.current.clear();
    setToken("");
    setIdentity(null);
    setSessions([]);
    setMessages([]);
    setSelectedSessionId("");
  }, []);

  const loadSessions = useCallback(
    async ({
      page = 0,
      append = false,
      silent = false,
    }: { page?: number; append?: boolean; silent?: boolean } = {}) => {
      if (!token || !canAccessChatSupport) return;
      if (append) {
        setIsMoreSessionsLoading(true);
      } else if (!silent) {
        setIsSessionsLoading(true);
      }

      try {
        const params = new URLSearchParams({
          limit: String(sessionListLimit),
          page: String(page),
          filter: activeFilter,
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
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
        }
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
    [activeFilter, canAccessChatSupport, handleAuthFailure, search, token]
  );

  const loadMessages = useCallback(
    async (
      sessionId = selectedSessionId,
      { silent = false, incremental = false } = {}
    ) => {
      if (!token || !sessionId || !canAccessChatSupport) return;

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
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
        }
        setError(
          loadError instanceof Error ? loadError.message : "載入訊息失敗"
        );
      } finally {
        if (!silent && cachedMessages.length === 0) {
          setIsMessagesLoading(false);
        }
      }
    },
    [canAccessChatSupport, handleAuthFailure, selectedSessionId, token]
  );

  useEffect(() => {
    if (!token || !canAccessChatSupport) return;

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
  }, [activeFilter, canAccessChatSupport, loadSessions, token]);

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

  const logout = () => {
    clearStoredAdminToken();
    messagesCacheRef.current.clear();
    setFailedAvatarIds(new Set());
    setToken("");
    setIdentity(null);
    setSessions([]);
    setMessages([]);
    setSelectedSessionId("");
    setLocation("/admin/shop/login?redirect=/admin/chats");
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

  const updateSupportStatus = async (
    supportStatus: ChatSupportStatus,
    options: { pauseDuration?: PauseDuration } = {}
  ) => {
    if (!selectedSessionId || !token || !canAccessChatSupport) return;

    const actionByStatus: Record<ChatSupportStatus, string> = {
      ai_replying:
        selectedSession?.status === "closed" ? "reopen-session" : "restore-ai",
      needs_human: "update-session-status",
      human_takeover: "human-takeover",
      replied: "mark-replied",
      closed: "close-session",
    };

    try {
      setError("");
      setStatusNotice("");
      await fetchAdminJson(
        `/api/admin-chat?action=${actionByStatus[supportStatus]}&sessionId=${encodeURIComponent(selectedSessionId)}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            support_status: supportStatus,
            ...(supportStatus === "human_takeover"
              ? { pause_duration: options.pauseDuration || "30m" }
              : {}),
          }),
        }
      );
      await loadSessions({ page: 0, silent: true });
      if (supportStatus === "ai_replying") {
        setStatusNotice(
          "已恢復目前這段對話的慢寶自動回答，其他客人不受影響。"
        );
      } else if (supportStatus === "human_takeover") {
        setIsPauseDialogOpen(false);
        setStatusNotice("已暫停目前這段對話的慢寶自動回答，其他客人不受影響。");
      }
    } catch (statusError) {
      if (isAdminAuthError(statusError)) {
        handleAuthFailure();
      }
      setStatusNotice("");
      setError(
        statusError instanceof Error ? statusError.message : "更新狀態失敗"
      );
    }
  };

  const confirmPauseAi = () => {
    void updateSupportStatus("human_takeover", { pauseDuration });
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (
      !content ||
      !selectedSessionId ||
      isSending ||
      !token ||
      !canAccessChatSupport
    ) {
      return;
    }

    setIsSending(true);
    try {
      const data = await fetchAdminJson<{ message?: AdminChatMessage }>(
        `/api/admin-chat?action=send-human-message&sessionId=${encodeURIComponent(selectedSessionId)}`,
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
      if (isAdminAuthError(sendError)) {
        handleAuthFailure();
      }
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
        <section className="w-full max-w-md border border-stone-200 bg-white p-7 text-center shadow-xl shadow-stone-200/70">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-stone-900 text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-left">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="text-2xl font-semibold">網站問慢寶客服後台</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-stone-600">
            請先使用正式後台帳號登入，才可查看問慢寶客服對話。
          </p>
          <Button asChild className="mt-5 h-11 w-full rounded-none">
            <Link href="/admin/shop/login?redirect=/admin/chats">
              前往後台登入
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  if (!canAccessChatSupport) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f6f1ea] px-5 text-stone-900">
        <section className="w-full max-w-md border border-stone-200 bg-white p-7 text-center shadow-xl shadow-stone-200/70">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-stone-100 text-stone-600">
            <ShieldCheck className="size-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            MUMBAO Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold">你沒有問慢寶客服後台權限</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            此後台僅開放 super_admin、admin、manager 使用。
          </p>
          <Button asChild variant="outline" className="mt-5 h-11 w-full rounded-none">
            <Link href="/account">回會員中心</Link>
          </Button>
        </section>
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
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {sessionFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.value);
                  setSessions([]);
                  setSelectedSessionId("");
                  setMessages([]);
                }}
                className={cn(
                  "flex-none rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  activeFilter === filter.value
                    ? "border-[#9b7654] bg-[#9b7654] text-white"
                    : "border-stone-200 bg-white text-stone-500 hover:border-[#c7a47f] hover:text-[#8a6a4f]"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={handleSessionScroll}>
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              目前沒有符合條件的對話
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = selectedSessionId === session.id;
              const hasLineAvatar =
                Boolean(session.line_picture_url) &&
                !failedAvatarIds.has(String(session.id));
              const supportStatus = getSupportStatus(session);

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
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px]",
                          supportStatusStyles[supportStatus]
                        )}
                      >
                        {supportStatusLabels[supportStatus]}
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
          (() => {
            const selectedSupportStatus = getSupportStatus(selectedSession);
            const isClosed = selectedSupportStatus === "closed";
            const pauseUntil = selectedSession.ai_paused_until || "";
            const pauseUntilLabel = formatMessageTime(pauseUntil);
            const pauseRemainingLabel = getPauseRemainingLabel(pauseUntil);

            return (
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
                <span
                  className={cn(
                    "inline-flex flex-none whitespace-nowrap rounded-full px-3 py-1 text-xs",
                    supportStatusStyles[selectedSupportStatus]
                  )}
                >
                  {supportStatusLabels[selectedSupportStatus]}
                </span>
                {isClosed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateSupportStatus("ai_replying")}
                    className="flex-none whitespace-nowrap"
                  >
                    重新開啟對話
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateSupportStatus("needs_human")}
                      className="flex-none whitespace-nowrap"
                    >
                      加入人工待辦
                    </Button>
                    {selectedSupportStatus === "human_takeover" ||
                    selectedSupportStatus === "needs_human" ||
                    selectedSupportStatus === "replied" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateSupportStatus("ai_replying")}
                        className="flex-none whitespace-nowrap"
                      >
                        立即恢復 AI
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPauseDuration("30m");
                        setIsPauseDialogOpen(true);
                      }}
                      className="flex-none whitespace-nowrap border-[#d8c4ad] text-[#7a5b41]"
                    >
                      <PauseCircle className="mr-1 size-4" aria-hidden="true" />
                      {selectedSupportStatus === "human_takeover"
                        ? "調整暫停時間"
                        : "暫停此對話的 AI"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateSupportStatus("replied")}
                      className="flex-none whitespace-nowrap"
                    >
                      標記已回覆
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateSupportStatus("closed")}
                      className="flex-none whitespace-nowrap"
                    >
                      關閉對話
                    </Button>
                  </>
                )}
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
              <p className="mt-1 font-medium text-[#5f4937]">
                此操作只影響目前選中的對話，其他客人不受影響。
              </p>
              {selectedSupportStatus === "human_takeover" && (
                <div className="mt-1 space-y-1">
                  <p>此對話的 AI 已暫停。</p>
                  {pauseUntilLabel ? (
                    <p>
                      將於 {pauseUntilLabel} 自動恢復
                      {pauseRemainingLabel ? `（${pauseRemainingLabel}）` : ""}。
                    </p>
                  ) : (
                    <p>此對話的 AI 已持續暫停，直到管理員手動恢復。</p>
                  )}
                </div>
              )}
              {selectedSupportStatus === "needs_human" && (
                <p className="mt-1">
                  只加入客服待辦，慢寶仍會繼續回答。客服可視需要回覆或改為暫停此對話的 AI。
                </p>
              )}
              {selectedSupportStatus === "closed" && selectedSession.closed_at && (
                <p className="mt-1">
                  此對話已於 {formatDateLabel(selectedSession.closed_at)}{" "}
                  {formatMessageTime(selectedSession.closed_at)} 關閉。
                </p>
              )}
              {isLineEntrySession(selectedSession) && (
                <p className="mt-1">
                  此客人是從 LINE 圖文選單開啟問慢寶，但目前系統不會將人工回覆推送到 LINE。
                </p>
              )}
            </div>

            <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
              <DialogContent className="max-w-md bg-[#fffaf2]">
                <DialogHeader>
                  <DialogTitle>暫停此對話的 AI</DialogTitle>
                  <DialogDescription className="leading-6">
                    僅適用於退款、客訴、付款或需要由管家全程處理的特殊情況。此操作只影響目前這段對話，其他客人不受影響。
                  </DialogDescription>
                </DialogHeader>
                <RadioGroup
                  value={pauseDuration}
                  onValueChange={(value) => setPauseDuration(value as PauseDuration)}
                  className="gap-2"
                >
                  {pauseDurationOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer gap-3 rounded-lg border border-[#ead8c6] bg-white px-3 py-3 text-sm text-[#5f4937] transition hover:bg-[#fff6e8]"
                    >
                      <RadioGroupItem value={option.value} className="mt-0.5" />
                      <span>
                        <span className="block font-medium">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#8a796a]">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsPauseDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="button" onClick={confirmPauseAi}>
                    確認暫停 AI
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {error && (
              <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            {statusNotice && (
              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-700">
                {statusNotice}
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
                  placeholder={
                    isClosed
                      ? "此對話已關閉，重新開啟後才能回覆"
                      : "輸入要顯示在網站問慢寶聊天視窗的人工回覆，Enter 送出，Shift + Enter 換行"
                  }
                  disabled={isClosed}
                  className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl"
                />
                <Button
                  type="button"
                  onClick={sendReply}
                  disabled={isClosed || !reply.trim() || isSending}
                  className="h-12 flex-none gap-2 rounded-full px-4"
                  aria-label="回覆到網站聊天"
                >
                  <Send className="size-5" />
                  <span className="hidden sm:inline">回覆到網站聊天</span>
                </Button>
              </div>
            </footer>
          </>
            );
          })()
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
