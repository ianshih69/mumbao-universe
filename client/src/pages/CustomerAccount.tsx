import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ExternalLink, LogOut, MessageCircle, PackageSearch, RotateCcw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { fetchAdminSession } from "@/lib/shop/adminIdentityApi";
import {
  fetchCustomerOrderDetail,
  fetchCustomerOrders,
  type CustomerOrderDetail,
  type CustomerOrdersPage,
} from "@/lib/shop/customerOrdersApi";
import {
  fetchCustomerAdminAccess,
  type CustomerAdminAccess,
  type CustomerProfileUpdatePayload,
} from "@/lib/shop/customerProfileApi";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/shop/labels";

type AccountTab = "profile" | "address" | "orders" | "chat";

type ProfileFormState = Required<CustomerProfileUpdatePayload>;

type AccountChatSession = {
  id: string;
  visitor_id?: string | null;
  title?: string | null;
  preview_message?: string | null;
  last_message?: string | null;
  latest_message_at?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  source?: string | null;
  line_user_id?: string | null;
};

type AccountChatMessage = {
  id: string;
  sender: string;
  message: string;
  created_at: string;
};

type ChatHistoryResponse = {
  sessions?: AccountChatSession[];
  messages?: AccountChatMessage[];
};

const EMPTY_FORM: ProfileFormState = {
  name: "",
  phone: "",
  default_postal_code: "",
  default_city: "",
  default_district: "",
  default_address: "",
};

const DISABLED_ACCOUNT_MESSAGE = "此會員帳號目前已停用，請聯絡客服。";

function getProfileFormState(profile: ReturnType<typeof useCustomerAuth>["profile"]): ProfileFormState {
  if (!profile) return EMPTY_FORM;
  return {
    name: profile.name || "",
    phone: profile.phone || "",
    default_postal_code: profile.default_postal_code || "",
    default_city: profile.default_city || "",
    default_district: profile.default_district || "",
    default_address: profile.default_address || "",
  };
}

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function formatCurrency(value: number) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const chatVisitorStorageKey = "mumbao-chat-visitor-id";
const legacyChatVisitorStorageKey = "mumbao_visitor_id";

function getAccountChatVisitorId() {
  if (typeof window === "undefined") return "";

  const existing =
    window.localStorage.getItem(chatVisitorStorageKey) ||
    window.localStorage.getItem(legacyChatVisitorStorageKey);

  if (existing) return existing;

  const randomPart =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const visitorId = `visitor_${randomPart}`;
  window.localStorage.setItem(chatVisitorStorageKey, visitorId);
  return visitorId;
}

function truncateText(value: string, maxLength = 20) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;
  return `${chars.slice(0, maxLength).join("")}...`;
}

function getChatSessionTime(chatSession: AccountChatSession) {
  return (
    chatSession.latest_message_at ||
    chatSession.last_message_at ||
    chatSession.updated_at ||
    chatSession.created_at ||
    ""
  );
}

function getChatSessionTitle(chatSession: AccountChatSession) {
  const title = String(chatSession.title || "").trim();
  if (title) return title;

  const preview = String(chatSession.preview_message || chatSession.last_message || "").trim();
  return preview ? truncateText(preview) : "未命名對話";
}

function isLineChatSession(chatSession: AccountChatSession) {
  const source = String(chatSession.source || "").toLowerCase();
  return Boolean(
    chatSession.line_user_id ||
      source === "line_liff" ||
      source === "line" ||
      source === "liff"
  );
}

function getChatSourceLabel(chatSession: AccountChatSession) {
  return isLineChatSession(chatSession) ? "LINE 圖文入口" : "網站問慢寶";
}

function getChatSenderLabel(sender: string) {
  const normalized = String(sender || "").toLowerCase();
  if (normalized === "user") return "你";
  if (normalized === "human") return "人工客服";
  return "慢寶";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function fetchAccountChatSessions(accessToken: string) {
  const response = await fetch("/api/ai-chat?action=history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      list_only: true,
      session_only: true,
    }),
  });

  const data = await readJsonResponse<ChatHistoryResponse>(response);
  return Array.isArray(data.sessions) ? data.sessions : [];
}

async function fetchAccountChatMessages(accessToken: string, chatSession: AccountChatSession) {
  const response = await fetch("/api/ai-chat?action=history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      visitor_id: chatSession.visitor_id || getAccountChatVisitorId(),
      session_id: chatSession.id,
      limit: 100,
    }),
  });

  const data = await readJsonResponse<ChatHistoryResponse>(response);
  return Array.isArray(data.messages) ? data.messages : [];
}

async function deleteAccountChatSession(accessToken: string, chatSession: AccountChatSession) {
  const response = await fetch("/api/ai-chat?action=delete-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      session_id: chatSession.id,
      visitor_id: chatSession.visitor_id || getAccountChatVisitorId(),
    }),
  });

  await readJsonResponse(response);
}

export default function CustomerAccount() {
  const [, setLocation] = useLocation();
  const {
    user,
    session,
    profile,
    isLoading,
    isProfileLoading,
    isAuthenticated,
    profileError,
    refreshProfile,
    signOut,
    updateProfile,
  } = useCustomerAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersData, setOrdersData] = useState<CustomerOrdersPage | null>(null);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrderDetail | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [isOrderDetailLoading, setIsOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState("");
  const [chatSessions, setChatSessions] = useState<AccountChatSession[]>([]);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState("");
  const [chatMessages, setChatMessages] = useState<AccountChatMessage[]>([]);
  const [isChatSessionsLoading, setIsChatSessionsLoading] = useState(false);
  const [isChatMessagesLoading, setIsChatMessagesLoading] = useState(false);
  const [deletingChatSessionId, setDeletingChatSessionId] = useState("");
  const [chatHistoryError, setChatHistoryError] = useState("");
  const [hasLoadedChatSessions, setHasLoadedChatSessions] = useState(false);
  const [adminAccess, setAdminAccess] = useState<CustomerAdminAccess | null>(null);
  const [adminBridgeTarget, setAdminBridgeTarget] = useState("");

  useEffect(() => {
    setForm(getProfileFormState(profile));
  }, [profile]);

  useEffect(() => {
    let isCurrent = true;

    if (!isAuthenticated || !session?.access_token) {
      setAdminAccess(null);
      return () => {
        isCurrent = false;
      };
    }

    fetchCustomerAdminAccess(session.access_token)
      .then((nextAccess) => {
        if (!isCurrent) return;
        setAdminAccess(nextAccess.isStaff ? nextAccess : null);
      })
      .catch(() => {
        if (!isCurrent) return;
        setAdminAccess(null);
      });

    return () => {
      isCurrent = false;
    };
  }, [isAuthenticated, session?.access_token]);

  const readonlyEmail = useMemo(() => profile?.email || user?.email || "", [profile?.email, user?.email]);
  const isAccountDisabled = profileError === DISABLED_ACCOUNT_MESSAGE;
  const selectedChatSession = useMemo(
    () => chatSessions.find((item) => item.id === selectedChatSessionId) || null,
    [chatSessions, selectedChatSessionId],
  );

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  async function handleSignOut() {
    await signOut();
    setLocation("/shop");
  }

  async function openAdminLink(href: string) {
    if (!session?.access_token) {
      setLocation(`/admin/shop/login?redirect=${encodeURIComponent(href)}`);
      return;
    }

    setAdminBridgeTarget(href);
    try {
      const expiresAt = session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null;
      await fetchAdminSession(session.access_token, expiresAt, session.refresh_token);
      window.location.href = href;
    } catch {
      window.location.href = `/admin/shop/login?redirect=${encodeURIComponent(href)}`;
    } finally {
      setAdminBridgeTarget("");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      await updateProfile(form);
      setMessage("會員資料已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "會員資料暫時無法更新，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  }

  const loadOrders = useCallback(
    async (page = ordersPage) => {
      if (!session?.access_token) return;

      setIsOrdersLoading(true);
      setOrdersError("");

      try {
        const nextData = await fetchCustomerOrders(session.access_token, page);
        setOrdersData(nextData);
        setOrdersPage(nextData.page);
        setSelectedOrder(null);
        setSelectedOrderNumber("");
        setOrderDetailError("");
      } catch (loadError) {
        setOrdersError(loadError instanceof Error ? loadError.message : "會員訂單暫時無法讀取，請稍後再試。");
      } finally {
        setIsOrdersLoading(false);
      }
    },
    [ordersPage, session?.access_token],
  );

  const loadChatSessions = useCallback(async () => {
    if (!session?.access_token) return;

    setIsChatSessionsLoading(true);
    setChatHistoryError("");

    try {
      const nextSessions = await fetchAccountChatSessions(session.access_token);
      setChatSessions(nextSessions);
      setHasLoadedChatSessions(true);

      if (selectedChatSessionId && !nextSessions.some((item) => item.id === selectedChatSessionId)) {
        setSelectedChatSessionId("");
        setChatMessages([]);
      }
    } catch (loadError) {
      setChatHistoryError(loadError instanceof Error ? loadError.message : "問慢寶紀錄暫時無法載入。");
    } finally {
      setIsChatSessionsLoading(false);
    }
  }, [selectedChatSessionId, session?.access_token]);

  async function loadChatMessages(chatSession: AccountChatSession) {
    if (!session?.access_token) return;

    setSelectedChatSessionId(chatSession.id);
    setChatMessages([]);
    setChatHistoryError("");
    setIsChatMessagesLoading(true);

    try {
      const nextMessages = await fetchAccountChatMessages(session.access_token, chatSession);
      setChatMessages(nextMessages);
    } catch (loadError) {
      setChatHistoryError(loadError instanceof Error ? loadError.message : "這段問慢寶紀錄暫時無法載入。");
    } finally {
      setIsChatMessagesLoading(false);
    }
  }

  async function handleDeleteChatSession(chatSession: AccountChatSession) {
    if (!session?.access_token) return;

    const confirmed = window.confirm("刪除後，此段對話將不再顯示，慢寶也不會再用它接續回答。");
    if (!confirmed) return;

    setDeletingChatSessionId(chatSession.id);
    setChatHistoryError("");

    try {
      await deleteAccountChatSession(session.access_token, chatSession);
      setChatSessions((current) => current.filter((item) => item.id !== chatSession.id));

      if (selectedChatSessionId === chatSession.id) {
        setSelectedChatSessionId("");
        setChatMessages([]);
      }
    } catch (deleteError) {
      setChatHistoryError(deleteError instanceof Error ? deleteError.message : "刪除問慢寶紀錄失敗。");
    } finally {
      setDeletingChatSessionId("");
    }
  }

  async function loadOrderDetail(orderNumber: string) {
    if (!session?.access_token) return;

    setSelectedOrderNumber(orderNumber);
    setSelectedOrder(null);
    setOrderDetailError("");
    setIsOrderDetailLoading(true);

    try {
      const detail = await fetchCustomerOrderDetail(session.access_token, orderNumber);
      setSelectedOrder(detail);
    } catch (detailError) {
      setOrderDetailError(detailError instanceof Error ? detailError.message : "會員訂單暫時無法讀取，請稍後再試。");
    } finally {
      setIsOrderDetailLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "orders" && isAuthenticated && session?.access_token && !ordersData && !isOrdersLoading) {
      void loadOrders(1);
    }
  }, [activeTab, isAuthenticated, isOrdersLoading, loadOrders, ordersData, session?.access_token]);

  useEffect(() => {
    if (
      activeTab === "chat" &&
      isAuthenticated &&
      session?.access_token &&
      !isChatSessionsLoading &&
      !hasLoadedChatSessions
    ) {
      void loadChatSessions();
    }
  }, [
    activeTab,
    hasLoadedChatSessions,
    isAuthenticated,
    isChatSessionsLoading,
    loadChatSessions,
    session?.access_token,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOrdersData(null);
      setOrdersPage(1);
      setOrdersError("");
      setSelectedOrder(null);
      setSelectedOrderNumber("");
      setOrderDetailError("");
      setChatSessions([]);
      setSelectedChatSessionId("");
      setChatMessages([]);
      setChatHistoryError("");
      setHasLoadedChatSessions(false);
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">Member Center</p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">會員中心</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            管理你的會員基本資料與預設收件資訊。訪客結帳仍然可以照常使用。
          </p>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <p className="text-sm text-stone-500">正在讀取會員登入狀態...</p>
          </section>
        )}

        {!isLoading && !isAuthenticated && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl text-stone-900">請先登入會員</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
              登入後即可管理會員資料。尚未登入也可以繼續逛商城與完成訪客結帳。
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                <Link href="/account/login?returnTo=/account">登入</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
                <Link href="/account/register">建立會員帳號</Link>
              </Button>
            </div>
          </section>
        )}

        {!isLoading && isAuthenticated && (
          <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9f7868]">Signed in</p>
                  <p className="truncate text-sm font-medium text-stone-800">{readonlyEmail || "會員帳號"}</p>
                </div>
              </div>

              <nav className="mt-5 grid gap-2">
                {[
                  ["profile", "個人資料"],
                  ["address", "預設收件資料"],
                  ["orders", "歷史訂單"],
                  ["chat", "問慢寶紀錄"],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    className={`rounded-full px-4 py-2 text-left text-sm transition ${
                      activeTab === tab
                        ? "bg-[#8b6f5b] text-white"
                        : "bg-white text-stone-600 hover:bg-[#f3eadf]"
                    }`}
                    onClick={() => setActiveTab(tab as AccountTab)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {adminAccess?.isStaff && (
                <div className="mt-5 rounded-[8px] border border-[#d8c5b4] bg-[#f8efe4] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#8b6f5b]">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">管理入口</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">
                        你目前具有後台管理權限，可前往管理系統。
                      </p>
                    </div>
                  </div>

                  {adminAccess.adminLinks.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {adminAccess.adminLinks.map((link) => (
                        <button
                          key={link.href}
                          type="button"
                          disabled={adminBridgeTarget === link.href}
                          onClick={() => void openAdminLink(link.href)}
                          className="inline-flex items-center justify-between gap-2 rounded-full bg-white px-3 py-2 text-left text-xs font-medium text-[#765d4a] transition hover:bg-[#f3eadf] disabled:cursor-wait disabled:opacity-60"
                        >
                          <span>{adminBridgeTarget === link.href ? "正在進入..." : link.label}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-[8px] bg-white/75 px-3 py-2 text-xs leading-5 text-stone-500">
                      此角色的專屬後台入口尚未開放。
                    </p>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                className="mt-5 h-10 w-full rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                登出
              </Button>
            </aside>

            <div className="space-y-4">
              {isProfileLoading && (
                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <p className="text-sm text-stone-500">正在讀取會員資料...</p>
                </div>
              )}

              {!isProfileLoading && profileError && (
                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-serif text-2xl text-stone-900">
                        {isAccountDisabled ? "會員帳號已停用" : "會員資料讀取失敗"}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{profileError}</p>
                    </div>
                    {!isAccountDisabled && (
                      <Button
                        variant="outline"
                        className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                        onClick={() => void refreshProfile()}
                      >
                        <RotateCcw className="h-4 w-4" />
                        重新讀取
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!isProfileLoading && !profileError && (
                <>
                  {activeTab !== "orders" && activeTab !== "chat" && (
                    <form
                      className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60"
                      onSubmit={handleSave}
                    >
                      <div className="mb-5">
                        <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">
                          {activeTab === "profile" ? "Profile" : "Shipping"}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl text-stone-900">
                          {activeTab === "profile" ? "個人資料" : "預設收件資料"}
                        </h2>
                      </div>

                      {activeTab === "profile" && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-2 text-sm text-stone-600 sm:col-span-2">
                            Email
                            <input
                              className={`${fieldClassName()} bg-[#f7f0e8] text-stone-500`}
                              value={readonlyEmail}
                              readOnly
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            姓名
                            <input
                              className={fieldClassName()}
                              value={form.name}
                              maxLength={80}
                              onChange={(event) => updateField("name", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            手機
                            <input
                              className={fieldClassName()}
                              value={form.phone}
                              maxLength={40}
                              onChange={(event) => updateField("phone", event.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {activeTab === "address" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <label className="grid gap-2 text-sm text-stone-600">
                            郵遞區號
                            <input
                              className={fieldClassName()}
                              value={form.default_postal_code}
                              maxLength={20}
                              onChange={(event) => updateField("default_postal_code", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            縣市
                            <input
                              className={fieldClassName()}
                              value={form.default_city}
                              maxLength={80}
                              onChange={(event) => updateField("default_city", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            區域
                            <input
                              className={fieldClassName()}
                              value={form.default_district}
                              maxLength={80}
                              onChange={(event) => updateField("default_district", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600 sm:col-span-3">
                            詳細地址
                            <input
                              className={fieldClassName()}
                              value={form.default_address}
                              maxLength={300}
                              onChange={(event) => updateField("default_address", event.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
                      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="submit"
                          disabled={isSaving}
                          className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                        >
                          {isSaving ? "儲存中..." : "儲存會員資料"}
                        </Button>
                        <p className="text-xs leading-5 text-stone-500">
                          Email 由登入帳號管理，如需更改 Email，未來會提供獨立驗證流程。
                        </p>
                      </div>
                    </form>
                  )}

                  {activeTab === "orders" && (
                    <div className="space-y-4">
                      <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <PackageSearch className="mt-1 h-5 w-5 text-[#9f7868]" />
                            <div>
                              <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Orders</p>
                              <h2 className="mt-1 font-serif text-2xl text-stone-900">歷史訂單</h2>
                              <p className="mt-2 text-sm leading-6 text-stone-500">
                                只會顯示登入會員本人下單並已綁定會員的訂單。訪客訂單仍可使用查詢連結查看。
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                            disabled={isOrdersLoading}
                            onClick={() => void loadOrders(ordersPage)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            重新整理
                          </Button>
                        </div>

                        {isOrdersLoading && <p className="mt-6 text-sm text-stone-500">正在讀取歷史訂單...</p>}
                        {ordersError && <p className="mt-6 text-sm text-red-700">{ordersError}</p>}

                        {!isOrdersLoading && !ordersError && ordersData && ordersData.items.length === 0 && (
                          <div className="mt-6 rounded-[8px] border border-dashed border-[#d7c6b5] bg-white/70 p-6 text-center text-sm text-stone-500">
                            目前還沒有會員訂單。
                          </div>
                        )}

                        {!isOrdersLoading && !ordersError && ordersData && ordersData.items.length > 0 && (
                          <div className="mt-6 space-y-3">
                            {ordersData.items.map((order) => (
                              <article
                                key={order.order_number}
                                className="rounded-[8px] border border-[#eadfce] bg-white/80 p-4"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-stone-900">{order.order_number}</p>
                                    <p className="mt-1 text-xs text-stone-500">{formatDateTime(order.created_at)}</p>
                                    <p className="mt-2 text-sm text-stone-600">{order.item_summary}</p>
                                  </div>
                                  <div className="grid gap-2 text-sm text-stone-600 sm:grid-cols-3 md:min-w-[22rem]">
                                    <span>{getOrderStatusLabel(order.order_status)}</span>
                                    <span>{getPaymentStatusLabel(order.payment_status)}</span>
                                    <span className="font-semibold text-stone-900">{formatCurrency(order.total)}</span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 rounded-full border-[#eadfce] bg-[#fffdf8] px-4 hover:bg-[#f3eadf]"
                                    onClick={() => void loadOrderDetail(order.order_number)}
                                  >
                                    查看詳情
                                  </Button>
                                </div>
                              </article>
                            ))}

                            <div className="flex flex-col gap-3 border-t border-[#eadfce] pt-4 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
                              <span>
                                共 {ordersData.total} 筆，第 {ordersData.page} / {ordersData.totalPages} 頁
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                                  disabled={isOrdersLoading || ordersData.page <= 1}
                                  onClick={() => void loadOrders(Math.max(1, ordersData.page - 1))}
                                >
                                  上一頁
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                                  disabled={isOrdersLoading || ordersData.page >= ordersData.totalPages}
                                  onClick={() => void loadOrders(Math.min(ordersData.totalPages, ordersData.page + 1))}
                                >
                                  下一頁
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {(isOrderDetailLoading || orderDetailError || selectedOrder) && (
                        <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                          {isOrderDetailLoading && (
                            <p className="text-sm text-stone-500">
                              正在讀取 {selectedOrderNumber || "訂單"} 詳情...
                            </p>
                          )}

                          {!isOrderDetailLoading && orderDetailError && (
                            <p className="text-sm text-red-700">{orderDetailError}</p>
                          )}

                          {!isOrderDetailLoading && selectedOrder && (
                            <div className="space-y-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Order Detail</p>
                                  <h3 className="mt-1 font-serif text-2xl text-stone-900">
                                    {selectedOrder.order_number}
                                  </h3>
                                  <p className="mt-1 text-sm text-stone-500">
                                    {formatDateTime(selectedOrder.created_at)}
                                  </p>
                                </div>
                                <div className="grid gap-1 text-sm text-stone-600 sm:text-right">
                                  <span>訂單狀態：{getOrderStatusLabel(selectedOrder.order_status)}</span>
                                  <span>付款狀態：{getPaymentStatusLabel(selectedOrder.payment_status)}</span>
                                </div>
                              </div>

                              <div className="grid gap-3 rounded-[8px] border border-[#eadfce] bg-white/75 p-4 text-sm text-stone-600 sm:grid-cols-2">
                                <p>收件人：{selectedOrder.customer.name || "-"}</p>
                                <p>電話：{selectedOrder.customer.phone || "-"}</p>
                                <p>Email：{selectedOrder.customer.email || "-"}</p>
                                <p>地址：{selectedOrder.customer.address || "-"}</p>
                                <p>物流：{selectedOrder.shipping_carrier || "尚未出貨"}</p>
                                <p>單號：{selectedOrder.tracking_number || "-"}</p>
                              </div>

                              <div className="space-y-3">
                                {selectedOrder.items.map((item, index) => (
                                  <div
                                    key={`${item.product_name}-${item.variant_name}-${index}`}
                                    className="flex flex-col gap-2 rounded-[8px] border border-[#eadfce] bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-stone-900">
                                        {item.product_name || "未命名商品"}
                                      </p>
                                      <p className="mt-1 text-xs text-stone-500">
                                        {[item.variant_name, item.variant_option].filter(Boolean).join(" / ") ||
                                          "一般規格"}
                                      </p>
                                    </div>
                                    <div className="flex gap-4 text-sm text-stone-600">
                                      <span>x {item.quantity}</span>
                                      <span>{formatCurrency(item.unit_price)}</span>
                                      <span className="font-semibold text-stone-900">
                                        {formatCurrency(item.line_total)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="ml-auto max-w-xs space-y-2 rounded-[8px] bg-white/75 p-4 text-sm">
                                <div className="flex justify-between text-stone-500">
                                  <span>小計</span>
                                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-stone-500">
                                  <span>運費</span>
                                  <span>{formatCurrency(selectedOrder.shipping_fee)}</span>
                                </div>
                                <div className="flex justify-between border-t border-[#eadfce] pt-2 font-semibold text-stone-900">
                                  <span>總額</span>
                                  <span>{formatCurrency(selectedOrder.total)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "chat" && (
                    <div className="space-y-4">
                      <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Mumbao Chat</p>
                            <h2 className="mt-1 font-serif text-2xl text-stone-900">問慢寶紀錄</h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                              這裡會顯示你登入後與慢寶的對話紀錄。你可以查看或刪除不需要的對話。
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                            disabled={isChatSessionsLoading}
                            onClick={() => {
                              setHasLoadedChatSessions(false);
                              void loadChatSessions();
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                            重新整理
                          </Button>
                        </div>

                        {chatHistoryError && (
                          <p className="mt-5 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {chatHistoryError}
                          </p>
                        )}

                        {isChatSessionsLoading && (
                          <p className="mt-6 text-sm text-stone-500">正在載入問慢寶紀錄...</p>
                        )}

                        {!isChatSessionsLoading && chatSessions.length === 0 && (
                          <div className="mt-6 rounded-[8px] border border-dashed border-[#d7c6b5] bg-white/70 p-6 text-center">
                            <MessageCircle className="mx-auto h-6 w-6 text-[#9f7868]" />
                            <p className="mt-3 text-sm text-stone-500">目前還沒有問慢寶紀錄。</p>
                            <Button
                              asChild
                              variant="outline"
                              className="mt-5 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                            >
                              <Link href="/ai-chat">開始問慢寶</Link>
                            </Button>
                          </div>
                        )}

                        {!isChatSessionsLoading && chatSessions.length > 0 && (
                          <div className="mt-6 space-y-3">
                            {chatSessions.map((chatSession) => {
                              const isSelected = selectedChatSessionId === chatSession.id;
                              const isDeleting = deletingChatSessionId === chatSession.id;

                              return (
                                <article
                                  key={chatSession.id}
                                  className={`rounded-[8px] border p-4 transition ${
                                    isSelected
                                      ? "border-[#c7a485] bg-[#fff7ec]"
                                      : "border-[#eadfce] bg-white/80"
                                  }`}
                                >
                                  <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                      <h3 className="break-words text-base font-medium text-stone-900">
                                        {getChatSessionTitle(chatSession)}
                                      </h3>
                                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                                        <span>{formatDateTime(getChatSessionTime(chatSession))}</span>
                                        <span className="rounded-full bg-[#f3eadf] px-2 py-0.5 text-[#765d4a]">
                                          {getChatSourceLabel(chatSession)}
                                        </span>
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[#8a796a]">
                                          會員登入
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 rounded-full border-[#eadfce] bg-white px-4 hover:bg-[#f3eadf]"
                                        disabled={isChatMessagesLoading && isSelected}
                                        onClick={() => void loadChatMessages(chatSession)}
                                      >
                                        查看
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 rounded-full border-[#eadfce] bg-white px-4 text-[#9a5f4e] hover:bg-[#fff3e8]"
                                        disabled={Boolean(deletingChatSessionId)}
                                        onClick={() => void handleDeleteChatSession(chatSession)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        {isDeleting ? "刪除中" : "刪除此段"}
                                      </Button>
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>

                      {selectedChatSession && (
                        <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                          <div className="mb-5">
                            <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Conversation</p>
                            <h3 className="mt-1 break-words font-serif text-2xl text-stone-900">
                              {getChatSessionTitle(selectedChatSession)}
                            </h3>
                            <p className="mt-1 text-sm text-stone-500">
                              {getChatSourceLabel(selectedChatSession)} · {formatDateTime(getChatSessionTime(selectedChatSession))}
                            </p>
                          </div>

                          {isChatMessagesLoading && (
                            <p className="text-sm text-stone-500">正在載入這段對話...</p>
                          )}

                          {!isChatMessagesLoading && chatMessages.length === 0 && (
                            <p className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-white/70 p-5 text-center text-sm text-stone-500">
                              這段對話目前沒有可顯示的訊息。
                            </p>
                          )}

                          {!isChatMessagesLoading && chatMessages.length > 0 && (
                            <div className="space-y-3">
                              {chatMessages.map((chatMessage) => {
                                const senderLabel = getChatSenderLabel(chatMessage.sender);
                                const isUser = String(chatMessage.sender || "").toLowerCase() === "user";

                                return (
                                  <div
                                    key={chatMessage.id}
                                    className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
                                  >
                                    <div
                                      className={`max-w-full rounded-[14px] px-4 py-3 text-sm leading-7 shadow-sm md:max-w-[82%] ${
                                        isUser
                                          ? "bg-[#8b6f5b] text-white"
                                          : "border border-[#eadfce] bg-white text-stone-700"
                                      }`}
                                    >
                                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                                        <span>{senderLabel}</span>
                                        <span>{formatDateTime(chatMessage.created_at)}</span>
                                      </div>
                                      <p className="whitespace-pre-wrap break-words">{chatMessage.message}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
