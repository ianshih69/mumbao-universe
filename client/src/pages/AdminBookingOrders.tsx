import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Eye,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  cancelAdminBooking,
  fetchAdminBookingOrderDetail,
  fetchAdminBookingOrders,
  reviewBookingCancellation,
  type AdminBookingOrder,
  type BookingCancellationAudit,
} from "@/lib/bookings/adminBookingsApi";
import { getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";

type Filters = {
  query: string;
  status: string;
  cancellationStatus: string;
  checkIn: string;
  checkOut: string;
};

type OrderDetail = {
  order: AdminBookingOrder;
  cancellation_audits: BookingCancellationAudit[];
  payment_audits: BookingCancellationAudit[];
};

const emptyFilters: Filters = {
  query: "",
  status: "all",
  cancellationStatus: "all",
  checkIn: "",
  checkOut: "",
};

const bookingStatusLabels: Record<string, string> = {
  payment_hold: "待付款",
  payment_review: "匯款資料確認中",
  confirmed: "訂房已成立",
  expired: "付款期限已結束",
  cancelled: "訂房已取消",
  pending_review: "訂房確認中",
};

const paymentStatusLabels: Record<string, string> = {
  none: "尚無付款資料",
  reported: "已回報待確認",
  verified: "已確認入帳",
  rejected: "匯款資料未通過",
  cancelled: "付款流程已終止",
  expired: "付款期限已結束",
};

const cancellationStatusLabels: Record<string, string> = {
  none: "無取消申請",
  pending: "取消申請審核中",
  approved: "取消申請已核准",
  rejected: "取消申請未通過",
  withdrawn: "取消申請已撤回",
};

const auditActionLabels: Record<string, string> = {
  customer_booking_cancelled: "客人取消待付款訂單",
  customer_cancellation_requested: "客人提出取消申請",
  admin_booking_cancelled: "管理員直接取消訂單",
  admin_cancellation_approved: "管理員核准取消申請",
  admin_cancellation_rejected: "管理員駁回取消申請",
  bank_payment_confirmed: "管理員確認匯款",
};

function fieldClassName() {
  return "h-10 min-w-0 rounded-[8px] border border-[#ded5ca] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#a98870] focus:ring-2 focus:ring-[#eee4da]";
}

function textareaClassName() {
  return "min-h-24 w-full rounded-[8px] border border-[#ded5ca] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#a98870] focus:ring-2 focus:ring-[#eee4da]";
}

function formatTwd(value: number | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `TWD ${amount.toLocaleString("zh-TW")}` : "—";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function statusBadge(label: string, tone: "neutral" | "warning" | "success" = "neutral") {
  const colors =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-stone-200 bg-stone-50 text-stone-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${colors}`}>{label}</span>;
}

function auditLabel(audit: BookingCancellationAudit) {
  return auditActionLabels[audit.action] || audit.action;
}

export default function AdminBookingOrders() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [orders, setOrders] = useState<AdminBookingOrder[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [directCancelReason, setDirectCancelReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [publicNote, setPublicNote] = useState("");

  const redirectToLogin = useCallback(() => {
    setLocation("/admin/shop/login?redirect=/admin/bookings/orders");
  }, [setLocation]);

  const loadOrders = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      redirectToLogin();
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const response = await fetchAdminBookingOrders(token, appliedFilters);
      setOrders(response.orders);
    } catch (loadError) {
      if (isAdminAuthError(loadError)) return redirectToLogin();
      setError(loadError instanceof Error ? loadError.message : "目前無法載入官網訂單。");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, redirectToLogin]);

  const loadDetail = useCallback(
    async (id: string) => {
      const token = getAdminToken();
      if (!token) return redirectToLogin();
      setIsDetailLoading(true);
      setError("");
      try {
        const response = await fetchAdminBookingOrderDetail(token, id);
        setDetail({
          order: response.order,
          cancellation_audits: response.cancellation_audits,
          payment_audits: response.payment_audits,
        });
        setDirectCancelReason("");
        setAdminNote("");
        setPublicNote("");
      } catch (loadError) {
        if (isAdminAuthError(loadError)) return redirectToLogin();
        setError(loadError instanceof Error ? loadError.message : "目前無法載入訂單詳情。");
      } finally {
        setIsDetailLoading(false);
      }
    },
    [redirectToLogin],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setDetail(null);
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!detail) return;
    setIsActing(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await Promise.all([loadOrders(), loadDetail(detail.order.id)]);
    } catch (actionError) {
      if (isAdminAuthError(actionError)) return redirectToLogin();
      setError(actionError instanceof Error ? actionError.message : "操作失敗，請稍後再試。");
    } finally {
      setIsActing(false);
    }
  }

  function directCancel() {
    if (!detail || !directCancelReason.trim()) {
      setError("請填寫取消原因。");
      return;
    }
    if (!window.confirm("確定取消這筆已成立訂房？取消後日期會立即重新開放，且不代表已完成退款。")) return;
    const token = getAdminToken();
    if (!token) return redirectToLogin();
    void runAction(
      () => cancelAdminBooking(token, { id: detail.order.id, reason: directCancelReason }),
      "訂房已取消；付款真實狀態維持不變，退款尚未處理。",
    );
  }

  function reviewCancellation(decision: "approved" | "rejected") {
    const requestId = detail?.order.cancellation_request?.id;
    if (!requestId) return;
    const label = decision === "approved" ? "核准取消" : "駁回申請";
    if (!window.confirm(`確定${label}？${decision === "approved" ? "核准後日期會立即重新開放，且不代表已完成退款。" : "訂房狀態與房況將維持不變。"}`)) return;
    const token = getAdminToken();
    if (!token) return redirectToLogin();
    void runAction(
      () =>
        reviewBookingCancellation(token, {
          id: requestId,
          decision,
          adminNote,
          publicNote,
        }),
      decision === "approved"
        ? "取消申請已核准；退款尚未處理。"
        : "取消申請已駁回，訂房與房況維持原狀。",
    );
  }

  const order = detail?.order || null;
  const cancellation = order?.cancellation_request || null;
  const cancellationAudits = detail?.cancellation_audits || [];
  const paymentAudits = detail?.payment_audits || [];

  return (
    <div className="space-y-6">
      <section className="border-b border-stone-200 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">官網訂單管理</h1>
            <p className="mt-1 text-sm text-stone-500">查詢訂房、處理取消申請與檢視稽核紀錄。</p>
          </div>
          <Button variant="outline" onClick={() => void loadOrders()} disabled={isLoading} title="重新整理">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </div>
      </section>

      <form onSubmit={submitFilters} className="grid gap-3 border-b border-stone-200 pb-6 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(150px,1fr))_auto]">
        <label className="grid gap-1.5 text-xs font-medium text-stone-600">
          訂房編號／姓名／Email／電話
          <input className={fieldClassName()} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-stone-600">
          訂房狀態
          <select className={fieldClassName()} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="all">全部</option>
            {Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-stone-600">
          取消狀態
          <select className={fieldClassName()} value={filters.cancellationStatus} onChange={(event) => setFilters((current) => ({ ...current, cancellationStatus: event.target.value }))}>
            <option value="all">全部</option>
            {Object.entries(cancellationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-stone-600">
          入住日起
          <input type="date" className={fieldClassName()} value={filters.checkIn} onChange={(event) => setFilters((current) => ({ ...current, checkIn: event.target.value }))} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-stone-600">
          退房日至
          <input type="date" className={fieldClassName()} value={filters.checkOut} onChange={(event) => setFilters((current) => ({ ...current, checkOut: event.target.value }))} />
        </label>
        <Button type="submit" className="self-end bg-[#7b604e] hover:bg-[#674f40]">
          <Search className="mr-2 h-4 w-4" />查詢
        </Button>
      </form>

      {error && <p className="border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {message && <p className="border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}

      <section className="overflow-hidden border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">訂單清單</h2>
          <span className="text-xs text-stone-500">{orders.length} 筆</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">訂房編號</th>
                <th className="px-4 py-3 font-medium">客人</th>
                <th className="px-4 py-3 font-medium">入住／退房</th>
                <th className="px-4 py-3 font-medium">訂房狀態</th>
                <th className="px-4 py-3 font-medium">付款狀態</th>
                <th className="px-4 py-3 font-medium">取消狀態</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orders.map((item) => (
                <tr key={item.id} className="align-top hover:bg-stone-50/70">
                  <td className="px-4 py-3 font-semibold text-stone-900">{item.booking_reference || "—"}</td>
                  <td className="px-4 py-3 text-stone-700">
                    <p>{item.guest_name || "—"}</p>
                    <p className="text-xs text-stone-500">{item.guest_phone || item.guest_email || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{item.check_in}<br />{item.check_out}</td>
                  <td className="px-4 py-3">{statusBadge(bookingStatusLabels[item.status] || item.status, item.status === "confirmed" ? "success" : item.status === "payment_review" ? "warning" : "neutral")}</td>
                  <td className="px-4 py-3 text-stone-700">{paymentStatusLabels[item.payment_status] || item.payment_status}</td>
                  <td className="px-4 py-3">{statusBadge(cancellationStatusLabels[item.cancellation_status] || item.cancellation_status, item.cancellation_status === "pending" ? "warning" : "neutral")}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => void loadDetail(item.id)}>
                      <Eye className="mr-2 h-4 w-4" />詳情
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && orders.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-stone-500">查無符合條件的訂單。</td></tr>
              )}
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-stone-500">載入中...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isDetailLoading && <p className="py-8 text-center text-sm text-stone-500">載入訂單詳情...</p>}

      {order && !isDetailLoading && (
        <section className="space-y-6 border-t-2 border-stone-300 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-stone-500">訂房編號</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-900">{order.booking_reference || "—"}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusBadge(bookingStatusLabels[order.status] || order.status, order.status === "confirmed" ? "success" : "neutral")}
              {statusBadge(cancellationStatusLabels[order.cancellation_status] || order.cancellation_status, order.cancellation_status === "pending" ? "warning" : "neutral")}
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-5 border-y border-stone-200 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-stone-500">客人</p><p className="mt-1 font-medium text-stone-900">{order.guest_name || "—"}</p><p className="text-sm text-stone-600">{order.guest_email || "—"}<br />{order.guest_phone || "—"}</p></div>
            <div><p className="text-xs text-stone-500">入住／退房</p><p className="mt-1 font-medium text-stone-900">{order.check_in} 至 {order.check_out}</p><p className="text-sm text-stone-600">建立於 {formatDateTime(order.created_at)}</p></div>
            <div><p className="text-xs text-stone-500">人數</p><p className="mt-1 font-medium text-stone-900">成人 {order.adults}／孩童 {order.children}</p><p className="text-sm text-stone-600">房間 {order.room_count || "—"}／寵物 {order.has_pets ? order.pet_count || 1 : 0}</p></div>
            <div><p className="text-xs text-stone-500">金額</p><p className="mt-1 font-medium text-stone-900">總額 {formatTwd(order.quoted_total)}</p><p className="text-sm text-stone-600">訂金 {formatTwd(order.deposit_amount)}／尾款 {formatTwd(order.balance_amount)}</p></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="border border-stone-200 bg-white p-5">
              <h3 className="text-base font-semibold text-stone-900">付款資料</h3>
              <dl className="mt-4 grid grid-cols-[130px_minmax(0,1fr)] gap-y-2 text-sm">
                <dt className="text-stone-500">付款狀態</dt><dd className="text-stone-900">{paymentStatusLabels[order.payment_status] || order.payment_status}</dd>
                <dt className="text-stone-500">應付金額</dt><dd className="text-stone-900">{formatTwd(order.payment_record?.expected_amount)}</dd>
                <dt className="text-stone-500">帳號末五碼</dt><dd className="text-stone-900">{order.payment_record?.bank_last5 || "—"}</dd>
                <dt className="text-stone-500">匯款人</dt><dd className="text-stone-900">{order.payment_record?.payer_name || "—"}</dd>
                <dt className="text-stone-500">回報時間</dt><dd className="text-stone-900">{formatDateTime(order.payment_record?.reported_at)}</dd>
                <dt className="text-stone-500">退款狀態</dt><dd className="font-medium text-amber-800">尚未處理</dd>
              </dl>
              <p className="mt-4 text-xs leading-5 text-stone-500">取消訂房不代表已完成退款。</p>
            </section>

            <section className="border border-stone-200 bg-white p-5">
              <h3 className="text-base font-semibold text-stone-900">取消申請</h3>
              {cancellation ? (
                <dl className="mt-4 grid grid-cols-[130px_minmax(0,1fr)] gap-y-2 text-sm">
                  <dt className="text-stone-500">狀態</dt><dd className="text-stone-900">{cancellationStatusLabels[cancellation.status] || cancellation.status}</dd>
                  <dt className="text-stone-500">提出者</dt><dd className="text-stone-900">{cancellation.requested_by === "customer" ? "客人" : "管理員"}</dd>
                  <dt className="text-stone-500">原因</dt><dd className="text-stone-900">{cancellation.reason_text || cancellation.reason_code || "—"}</dd>
                  <dt className="text-stone-500">提出時間</dt><dd className="text-stone-900">{formatDateTime(cancellation.requested_at)}</dd>
                  <dt className="text-stone-500">內部備註</dt><dd className="text-stone-900">{cancellation.admin_note || "—"}</dd>
                  <dt className="text-stone-500">客人可見備註</dt><dd className="text-stone-900">{cancellation.public_note || "—"}</dd>
                </dl>
              ) : <p className="mt-4 text-sm text-stone-500">目前沒有取消申請。</p>}
            </section>
          </div>

          {order.status === "confirmed" && order.cancellation_status !== "pending" && (
            <section className="border border-red-200 bg-red-50/40 p-5">
              <div className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-700" /><h3 className="font-semibold text-red-900">取消已成立訂房</h3></div>
              <p className="mt-2 text-sm text-red-800">日期會立即重新開放；已確認的付款會維持已確認，不會自動退款。</p>
              <label className="mt-4 grid gap-1.5 text-sm font-medium text-stone-700">
                取消原因（必填）
                <textarea className={textareaClassName()} value={directCancelReason} onChange={(event) => setDirectCancelReason(event.target.value)} />
              </label>
              <Button variant="destructive" className="mt-4" onClick={directCancel} disabled={isActing}>
                <Ban className="mr-2 h-4 w-4" />取消訂房
              </Button>
            </section>
          )}

          {cancellation?.status === "pending" && (
            <section className="border border-amber-200 bg-amber-50/40 p-5">
              <h3 className="font-semibold text-stone-900">審核取消申請</h3>
              <p className="mt-2 text-sm text-stone-600">核准會取消訂房並立即釋放日期；駁回會保留目前訂房與房況。</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">內部備註<textarea className={textareaClassName()} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">客人可見備註<textarea className={textareaClassName()} value={publicNote} onChange={(event) => setPublicNote(event.target.value)} /></label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => reviewCancellation("approved")} disabled={isActing}><CheckCircle2 className="mr-2 h-4 w-4" />核准取消</Button>
                <Button variant="outline" className="border-red-300 text-red-800 hover:bg-red-50" onClick={() => reviewCancellation("rejected")} disabled={isActing}><XCircle className="mr-2 h-4 w-4" />駁回申請</Button>
              </div>
            </section>
          )}

          <section className="border-t border-stone-200 pt-5">
            <h3 className="font-semibold text-stone-900">Admin audit summary</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {[...cancellationAudits, ...paymentAudits]
                .sort((left, right) => String(right.action_at).localeCompare(String(left.action_at)))
                .map((audit) => (
                  <div key={audit.id} className="border-l-2 border-stone-300 pl-3 text-sm">
                    <p className="font-medium text-stone-900">{auditLabel(audit)}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(audit.action_at)}</p>
                    {audit.reason && <p className="mt-1 text-stone-600">{audit.reason}</p>}
                  </div>
                ))}
              {cancellationAudits.length + paymentAudits.length === 0 && <p className="text-sm text-stone-500">目前沒有稽核紀錄。</p>}
            </div>
          </section>
        </section>
      )}
    </div>
  );
}
