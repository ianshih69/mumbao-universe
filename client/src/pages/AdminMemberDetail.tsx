import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Gem,
  Mail,
  RefreshCw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminToken,
  getInitialAdminAuthStatus,
  type AdminAuthStatus,
} from "@/lib/shop/adminAuth";
import {
  adjustAdminMemberPoints,
  deleteAdminMember,
  fetchAdminMemberDetail,
  fetchAdminSession,
  resendAdminMemberVerification,
  updateAdminMemberLevel,
  updateAdminMemberNote,
  type AdminMemberDetailResponse,
  type AdminMemberLevel,
} from "@/lib/shop/adminIdentityApi";
import { formatPrice } from "@/lib/shop/format";
import { cn } from "@/lib/utils";

const memberLevelOptions: Array<{ value: AdminMemberLevel; label: string }> = [
  { value: "normal", label: "普通會員" },
  { value: "vip", label: "VIP會員" },
  { value: "diamond", label: "鑽石會員" },
];

const tabs = [
  { key: "bookings", label: "住宿紀錄" },
  { key: "orders", label: "商品訂單" },
  { key: "points", label: "積分紀錄" },
  { key: "note", label: "內部備註" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

type DeleteDialogState = {
  confirmEmail: string;
  isDeleting: boolean;
  error: string;
};

function inputClassName(extra = "") {
  return `w-full rounded-[8px] border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8] ${extra}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatShortId(value?: string | null) {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatPoints(value: number) {
  return `${new Intl.NumberFormat("zh-TW").format(value)} 點`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function statusPillClass(status: string) {
  if (status === "normal" || status === "confirmed" || status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "email_not_verified" || status === "pending_review" || status === "pending") {
    return "bg-amber-100 text-amber-700";
  }
  if (status === "missing_profile" || status === "cancelled" || status === "failed" || status === "refunded") {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-stone-100 text-stone-700";
}

function levelPillClass(level: AdminMemberLevel) {
  if (level === "diamond") return "bg-sky-100 text-sky-700";
  if (level === "vip") return "bg-purple-100 text-purple-700";
  return "bg-stone-100 text-stone-700";
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-stone-900">{value || "-"}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[12px] border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p> : null}
    </div>
  );
}

export default function AdminMemberDetail() {
  const [, params] = useRoute("/admin/members/:memberId");
  const [, setLocation] = useLocation();
  const memberId = params?.memberId || "";
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<AdminMemberDetailResponse | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLevel, setIsSavingLevel] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isAdjustingPoints, setIsAdjustingPoints] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<AdminMemberLevel>("normal");
  const [adminNote, setAdminNote] = useState("");
  const [pointsForm, setPointsForm] = useState({ points: "", description: "" });
  const [activeTab, setActiveTab] = useState<TabKey>("bookings");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);

  async function loadDetail(nextToken = token) {
    if (!nextToken || !memberId) return;
    setIsLoading(true);
    setError("");
    try {
      await fetchAdminSession(nextToken);
      const data = await fetchAdminMemberDetail(nextToken, memberId);
      setDetail(data);
      setSelectedLevel(data.member.member_level);
      setAdminNote(data.member.admin_note || "");
      if (data.member.member_level !== "diamond" && activeTab === "points") {
        setActiveTab("bookings");
      }
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "會員資料暫時無法讀取，請稍後再試。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    const nextStatus = getInitialAdminAuthStatus();
    setAuthStatus(nextStatus);
    if (nextStatus === "loggedIn" && nextToken) void loadDetail(nextToken);
  }, [memberId]);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.key !== "points" || detail?.member.member_level === "diamond"),
    [detail?.member.member_level]
  );
  const canEditProfile = Boolean(detail?.member.has_profile && !detail.member.is_admin_user);
  const canDeleteSelected =
    Boolean(deleteDialog && detail?.deletion.can_delete) &&
    normalizeEmail(deleteDialog?.confirmEmail || "") === normalizeEmail(detail?.member.email || "");

  async function saveLevel() {
    if (!detail || !token) return;
    if (selectedLevel === detail.member.member_level) {
      setNotice("會員等級沒有變更。");
      return;
    }
    const confirmed = window.confirm(
      `確認將 ${detail.member.email} 的會員等級由 ${detail.member.member_level_label} 改為 ${
        memberLevelOptions.find((option) => option.value === selectedLevel)?.label || selectedLevel
      }？`
    );
    if (!confirmed) return;
    setIsSavingLevel(true);
    setNotice("");
    setError("");
    try {
      await updateAdminMemberLevel(token, detail.member.auth_user_id, selectedLevel);
      setNotice("會員等級已更新。");
      await loadDetail(token);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "會員等級更新失敗，請稍後再試。");
    } finally {
      setIsSavingLevel(false);
    }
  }

  async function saveNote() {
    if (!detail || !token) return;
    setIsSavingNote(true);
    setNotice("");
    setError("");
    try {
      await updateAdminMemberNote(token, detail.member.auth_user_id, adminNote);
      setNotice("會員內部備註已更新。");
      await loadDetail(token);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "會員內部備註更新失敗，請稍後再試。");
    } finally {
      setIsSavingNote(false);
    }
  }

  async function adjustPoints() {
    if (!detail || !token) return;
    setIsAdjustingPoints(true);
    setNotice("");
    setError("");
    try {
      await adjustAdminMemberPoints(token, detail.member.auth_user_id, {
        points: Number.parseInt(pointsForm.points, 10),
        description: pointsForm.description,
      });
      setPointsForm({ points: "", description: "" });
      setNotice("鑽石會員積分已更新。");
      await loadDetail(token);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "積分調整失敗，請稍後再試。");
    } finally {
      setIsAdjustingPoints(false);
    }
  }

  async function resendVerification() {
    if (!detail || !token) return;
    setIsResending(true);
    setNotice("");
    setError("");
    try {
      const result = await resendAdminMemberVerification(token, detail.member.auth_user_id);
      setNotice(result.message || "驗證信已重新寄出。");
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "驗證信寄送失敗，請稍後再試。");
    } finally {
      setIsResending(false);
    }
  }

  async function confirmDelete() {
    if (!detail || !deleteDialog || !token) return;
    setDeleteDialog({ ...deleteDialog, isDeleting: true, error: "" });
    try {
      await deleteAdminMember(token, detail.member.auth_user_id, deleteDialog.confirmEmail);
      setLocation("/admin/members");
    } catch (deleteError) {
      setDeleteDialog((current) =>
        current
          ? {
              ...current,
              isDeleting: false,
              error: deleteError instanceof Error ? deleteError.message : "會員帳號刪除失敗，請稍後再試。",
            }
          : current
      );
    }
  }

  if (authStatus === "checking" || isLoading) {
    return <main className="min-h-screen bg-[#f7f1e9] p-8 text-stone-600">讀取會員資料...</main>;
  }

  if (authStatus === "loggedOut") {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-md rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">請先登入後台</h1>
          <p className="mt-2 text-sm text-stone-600">會員管理需要後台權限。</p>
          <a
            className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white"
            href={`/admin/shop/login?redirect=${encodeURIComponent(`/admin/members/${memberId}`)}`}
          >
            前往登入
          </a>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-[16px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">找不到會員</h1>
          <p className="mt-3 text-sm text-stone-600">{error || "資料可能已被刪除或更新。"}</p>
          <Link className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" href="/admin/members">
            返回會員列表
          </Link>
        </div>
      </main>
    );
  }

  const { member, consumption_summary: summary } = detail;
  const accountStatus = member.profile_is_active === false ? "已停用" : member.has_profile ? "啟用中" : "缺少會員 profile";
  const isDiamond = member.member_level === "diamond";
  const recentShopConsumptionAt = summary.recent_shop_consumption_at || summary.recent_consumption_at;

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="members" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link className="inline-flex items-center gap-2 text-sm font-medium text-[#765d4a] hover:text-[#8b6f5b]" href="/admin/members">
              <ArrowLeft className="h-4 w-4" />
              返回會員列表
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-stone-900">{member.name || "未填姓名"}</h1>
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", levelPillClass(member.member_level))}>
                {member.member_level_label}
              </span>
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusPillClass(member.profile_status))}>
                {accountStatus}
              </span>
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", member.email_verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                Email {member.email_verified_label}
              </span>
            </div>
            <p className="mt-2 break-all text-sm text-stone-600">{member.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminShopHeaderLinks onRefresh={() => void loadDetail()} isRefreshing={isLoading} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-600 transition hover:bg-stone-50"
              onClick={() => void loadDetail()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
          </div>
        </div>

        {notice ? <div className="mt-5 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
        {error ? <div className="mt-5 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="商城累積消費" value={formatPrice(summary.cumulative_spend)} detail="目前不包含住宿消費。" />
          <SummaryCard label="住宿紀錄" value={`${summary.completed_stay_count} 次`} detail="依已確認且退房日期已過的住宿資料計算。" />
          <SummaryCard label="商品訂單數" value={`${summary.shop_order_count} 筆`} detail="已付款且未取消的商品訂單。" />
          <SummaryCard label="最近商城消費日期" value={recentShopConsumptionAt ? formatDateOnly(recentShopConsumptionAt) : "尚無商城消費紀錄"} />
        </section>

        {summary.limitations?.length ? (
          <div className="mt-4 rounded-[8px] border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {summary.limitations.join(" ")}
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-900">基本資料</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="姓名" value={member.name || "未填姓名"} />
              <Field label="手機" value={member.phone || "-"} />
              <Field label="Email" value={member.email} />
              <Field label="Email 是否完成驗證" value={member.email_verified ? "已驗證" : "尚未驗證"} />
              <Field label="會員等級" value={member.member_level_label} />
              <Field label="註冊日期" value={formatDate(member.registered_at)} />
              <Field label="最後登入時間" value={formatDate(member.last_login_at)} />
              <Field label="會員資料狀態" value={member.profile_status_label} />
              <Field label="Auth user ID" value={formatShortId(member.auth_user_id)} />
            </div>

            {member.coupon?.code ? (
              <div className="mt-5 rounded-[12px] border border-stone-200 bg-[#fffaf4] p-4">
                <h3 className="text-sm font-semibold text-stone-900">綁定優惠碼</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="優惠碼" value={member.coupon.code} />
                  <Field label="綁定日期" value={formatDate(member.coupon.bound_at)} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-900">會員等級</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">第一版會員等級由管理員手動調整。</p>
            <label className="mt-5 block text-sm font-medium text-stone-700">
              修改會員等級
              <select
                className={inputClassName("mt-2")}
                disabled={!canEditProfile}
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(event.target.value as AdminMemberLevel)}
              >
                {memberLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!canEditProfile ? (
              <p className="mt-3 rounded-[8px] bg-amber-50 px-3 py-2 text-sm text-amber-800">缺少會員 profile 或管理員帳號不可修改會員等級。</p>
            ) : null}
            <button
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#8b6f5b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canEditProfile || isSavingLevel}
              onClick={() => void saveLevel()}
              type="button"
            >
              <Save className="h-4 w-4" />
              {isSavingLevel ? "儲存中..." : "儲存等級"}
            </button>
          </div>
        </section>

        {isDiamond ? (
          <section className="mt-6 rounded-[16px] border border-sky-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                <Gem className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-stone-900">鑽石會員資料</h2>
                <p className="mt-1 text-sm text-stone-500">只在鑽石會員顯示。</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="合作店家名稱" value={detail.diamond_profile?.partner_name || "-"} />
              <Field label="專屬優惠碼" value={detail.diamond_profile?.exclusive_code || "-"} />
              <Field label="目前積分" value={formatPoints(detail.diamond_profile?.points_balance || 0)} />
              <Field label="合作狀態" value={detail.diamond_profile?.partnership_status || "-"} />
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[16px] border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-stone-100 p-4">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  activeTab === tab.key ? "bg-[#8b6f5b] text-white" : "bg-[#fffaf4] text-stone-600 hover:bg-[#f4ece2]"
                )}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "bookings" ? (
            <div className="p-5">
              {detail.booking_records.length === 0 ? (
                <p className="rounded-[8px] bg-[#fffaf4] px-4 py-8 text-center text-sm text-stone-500">目前沒有住宿紀錄。</p>
              ) : (
                <div className="grid gap-3">
                  {detail.booking_records.map((record) => (
                    <a
                      key={record.id}
                      className="rounded-[12px] border border-stone-200 bg-[#fffaf4] p-4 text-sm text-stone-700 transition hover:border-[#b99aa2] hover:bg-[#f4ece2]"
                      href="/admin/bookings"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-mono text-xs font-semibold text-stone-900">{formatShortId(record.booking_number)}</p>
                          <p className="mt-1 text-base font-semibold text-stone-900">{record.check_in || "-"} 至 {record.check_out || "-"}</p>
                          <p className="mt-1 text-xs text-stone-500">建立：{formatDate(record.created_at)}</p>
                        </div>
                        <span className={cn("w-fit rounded-full px-3 py-1 text-xs font-semibold", statusPillClass(record.status))}>{record.status}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="包棟或單間" value={record.stay_type_label} />
                        <Field label="入住人數" value={`${record.guest_count || 0} 人`} />
                        <Field label="住宿金額" value={record.lodging_amount == null ? "-" : formatPrice(record.lodging_amount)} />
                        <Field label="已付款金額" value={record.paid_amount == null ? "-" : formatPrice(record.paid_amount)} />
                        <Field label="訂房來源" value={record.source_label} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "orders" ? (
            <div className="p-5">
              {detail.shop_orders.length === 0 ? (
                <p className="rounded-[8px] bg-[#fffaf4] px-4 py-8 text-center text-sm text-stone-500">目前沒有商品購買紀錄。</p>
              ) : (
                <div className="grid gap-3">
                  {detail.shop_orders.map((order) => (
                    <a
                      key={order.id}
                      className="rounded-[12px] border border-stone-200 bg-[#fffaf4] p-4 text-sm text-stone-700 transition hover:border-[#b99aa2] hover:bg-[#f4ece2]"
                      href={`/admin/shop/orders?orderNumber=${encodeURIComponent(order.order_number)}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="font-mono text-xs font-semibold text-stone-900">{order.order_number}</p>
                          <p className="mt-1 text-base font-semibold text-stone-900">{order.items_summary}</p>
                          <p className="mt-1 text-xs text-stone-500">購買時間：{formatDate(order.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusPillClass(order.payment_status))}>{order.payment_status}</span>
                          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusPillClass(order.order_status))}>{order.order_status}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="商品總數量" value={`${order.total_quantity} 件`} />
                        <Field label="訂單總額" value={formatPrice(order.total)} />
                        <Field label="出貨或履約狀態" value={order.order_status} />
                        <Field label="付款狀態" value={order.payment_status} />
                      </div>
                      <div className="mt-4 grid gap-2">
                        {order.items.map((item) => (
                          <div key={item.id} className="grid gap-2 rounded-[8px] bg-white px-3 py-2 text-xs text-stone-600 sm:grid-cols-[minmax(0,1fr)_120px_80px_120px] sm:items-center">
                            <span className="font-medium text-stone-900">{item.product_name}{item.variant_option ? ` / ${item.variant_option}` : ""}</span>
                            <span>{formatPrice(item.unit_price)}</span>
                            <span>x {item.quantity}</span>
                            <span className="font-semibold text-stone-900">{formatPrice(item.line_total)}</span>
                          </div>
                        ))}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "points" && isDiamond ? (
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                {detail.points_ledger.length === 0 ? (
                  <p className="rounded-[8px] bg-[#fffaf4] px-4 py-8 text-center text-sm text-stone-500">目前沒有積分紀錄。</p>
                ) : (
                  <div className="grid gap-2">
                    {detail.points_ledger.map((row) => (
                      <div key={row.id} className="grid gap-2 rounded-[8px] border border-stone-200 bg-[#fffaf4] p-3 text-sm sm:grid-cols-[140px_120px_minmax(0,1fr)] sm:items-center">
                        <span className="text-stone-500">{formatDateOnly(row.created_at)}</span>
                        <span className={row.points >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                          {row.points >= 0 ? "+" : ""}{formatPoints(row.points)}
                        </span>
                        <span className="text-stone-800">{row.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-[12px] border border-stone-200 bg-[#fffaf4] p-4">
                <h3 className="text-base font-semibold text-stone-900">調整積分</h3>
                <p className="mt-1 text-sm leading-6 text-stone-500">1 點等於 NT$1，第一版只允許管理員人工調整，不會因退房日期自動入帳。</p>
                <label className="mt-4 block text-sm font-medium text-stone-700">
                  積分增減
                  <input
                    className={inputClassName("mt-2")}
                    placeholder="例如 2000 或 -3000"
                    value={pointsForm.points}
                    onChange={(event) => setPointsForm((form) => ({ ...form, points: event.target.value }))}
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-stone-700">
                  來源說明
                  <input
                    className={inputClassName("mt-2")}
                    placeholder="例如 訂單 MV-00125 完成入住"
                    value={pointsForm.description}
                    onChange={(event) => setPointsForm((form) => ({ ...form, description: event.target.value }))}
                  />
                </label>
                <button
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#8b6f5b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isAdjustingPoints}
                  onClick={() => void adjustPoints()}
                  type="button"
                >
                  <Star className="h-4 w-4" />
                  {isAdjustingPoints ? "儲存中..." : "新增積分紀錄"}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "note" ? (
            <div className="p-5">
              <div className="rounded-[12px] border border-stone-200 bg-[#fffaf4] p-4">
                <h3 className="text-base font-semibold text-stone-900">內部備註</h3>
                <p className="mt-1 text-sm text-stone-500">只有管理員可見，請避免記錄不必要的敏感個資。</p>
                <textarea
                  className={inputClassName("mt-4 min-h-40 resize-none")}
                  disabled={!canEditProfile}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                />
                <div className="mt-3 grid gap-3 text-xs text-stone-500 sm:grid-cols-2">
                  <span>最後更新時間：{formatDate(member.admin_note_updated_at)}</span>
                  <span>最後更新管理員：{formatShortId(member.admin_note_updated_by)}</span>
                </div>
                <button
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#8b6f5b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canEditProfile || isSavingNote}
                  onClick={() => void saveNote()}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  {isSavingNote ? "儲存中..." : "儲存備註"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">帳號管理</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {!member.email_verified ? (
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isResending}
                onClick={() => void resendVerification()}
                type="button"
              >
                <Mail className="h-4 w-4" />
                {isResending ? "寄送中..." : "重新寄送驗證信"}
              </button>
            ) : null}
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 text-sm font-semibold text-stone-400"
              disabled
              type="button"
            >
              <BadgeCheck className="h-4 w-4" />
              停用帳號尚未啟用
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={member.is_admin_user}
              onClick={() => setDeleteDialog({ confirmEmail: "", isDeleting: false, error: "" })}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              刪除帳號
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            停用帳號第一版暫不實作，因目前還需要完整設計登入、前台 API 與會員中心的停用攔截；不會用刪除假裝停用。
          </p>
        </section>
      </div>

      {deleteDialog ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-stone-950/45 px-4 py-8">
          <div className="w-full max-w-lg rounded-[24px] border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-stone-900">刪除會員</h2>
                <p className="mt-1 text-sm text-stone-600">此操作不可復原。</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl bg-[#fffaf4] p-4 text-sm text-stone-700">
              <Field label="姓名" value={member.name || "未填姓名"} />
              <Field label="Email" value={member.email} />
              <Field label="註冊日期" value={formatDate(member.registered_at)} />
              <Field label="是否已有訂單" value={detail.deletion.hasBusinessRecords ? "是" : "否"} />
              {!member.has_profile ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">會員資料不完整。</p>
              ) : null}
              {detail.deletion.hasBusinessRecords ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  此會員已有訂單或交易紀錄，為保留帳務資料，目前不能直接刪除。
                </p>
              ) : null}
            </div>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              請輸入完整 Email 確認刪除
              <input
                className={inputClassName("mt-2")}
                value={deleteDialog.confirmEmail}
                onChange={(event) =>
                  setDeleteDialog((current) =>
                    current ? { ...current, confirmEmail: event.target.value, error: "" } : current
                  )
                }
              />
            </label>

            {deleteDialog.error ? (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {deleteDialog.error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-700"
                onClick={() => setDeleteDialog(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-full bg-rose-700 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteDialog.isDeleting || !canDeleteSelected}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {deleteDialog.isDeleting ? "刪除中..." : "確認刪除會員"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
