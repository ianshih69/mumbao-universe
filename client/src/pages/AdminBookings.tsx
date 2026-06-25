import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  Inbox,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";
import {
  createExternalReservation,
  fetchBookingAlerts,
  fetchBookingCalendar,
  fetchBookingDashboard,
  fetchBookingReservations,
  fetchBookingSettings,
  handleBookingAlert,
  parseBookingEmail,
  saveBookingSettings,
  syncBookingIcal,
  type BookingAlert,
  type BookingCalendarDay,
  type BookingDashboard,
  type BookingEmailResult,
  type BookingPlatformSetting,
  type BookingReservation,
} from "@/lib/bookings/adminBookingsApi";
import { cn } from "@/lib/utils";

type ManualReservationForm = {
  source: string;
  reference_number: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_count: string;
  amount: string;
  status: string;
  notes: string;
};

const emptyManualForm: ManualReservationForm = {
  source: "booking",
  reference_number: "",
  check_in: "",
  check_out: "",
  guest_name: "",
  guest_count: "",
  amount: "",
  status: "confirmed",
  notes: "",
};

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function severityClass(severity: string) {
  if (severity === "P0") return "bg-red-100 text-red-700 border-red-200";
  if (severity === "P1") return "bg-orange-100 text-orange-700 border-orange-200";
  if (severity === "P2") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-stone-100 text-stone-700 border-stone-200";
}

function statusClass(status: string) {
  if (status.includes("撞期")) return "border-red-200 bg-red-50 text-red-700";
  if (status.includes("待確認")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (status.includes("可預約")) return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-stone-200 bg-white text-stone-700";
}

function DashboardCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "stone",
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ShieldAlert;
  tone?: "stone" | "green" | "red" | "amber" | "orange";
}) {
  const toneClass = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
  }[tone];

  return (
    <div className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-stone-900">{value}</p>
        </div>
        <div className={cn("flex size-10 items-center justify-center rounded-full", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
  );
}

function groupDaysByMonth(days: BookingCalendarDay[]) {
  return days.reduce<Record<string, BookingCalendarDay[]>>((groups, day) => {
    const key = day.date.slice(0, 7);
    groups[key] = groups[key] || [];
    groups[key].push(day);
    return groups;
  }, {});
}

export default function AdminBookings() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState(() => getAdminToken());
  const [dashboard, setDashboard] = useState<BookingDashboard | null>(null);
  const [days, setDays] = useState<BookingCalendarDay[]>([]);
  const [reservations, setReservations] = useState<BookingReservation[]>([]);
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [settings, setSettings] = useState<BookingPlatformSetting[]>([]);
  const [manualForm, setManualForm] = useState<ManualReservationForm>(emptyManualForm);
  const [emailForm, setEmailForm] = useState({ sender: "", subject: "", raw_email: "" });
  const [emailResult, setEmailResult] = useState<BookingEmailResult | null>(null);
  const [icalUrl, setIcalUrl] = useState("");
  const [icalEnabled, setIcalEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const bookingSetting = settings.find((setting) => setting.platform === "booking");
  const groupedMonths = useMemo(() => groupDaysByMonth(days), [days]);

  const loadAll = useCallback(async () => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    if (!nextToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const [dashboardData, calendarData, settingsData, alertsData, reservationsData] = await Promise.all([
        fetchBookingDashboard(nextToken),
        fetchBookingCalendar(nextToken),
        fetchBookingSettings(nextToken),
        fetchBookingAlerts(nextToken),
        fetchBookingReservations(nextToken),
      ]);
      setDashboard(dashboardData.dashboard);
      setDays(calendarData.calendar.days);
      setSettings(settingsData.settings);
      setAlerts(alertsData.alerts);
      setReservations(reservationsData.reservations);
      const nextBookingSetting = settingsData.settings.find((setting) => setting.platform === "booking");
      setIcalUrl(nextBookingSetting?.ical_url || "");
      setIcalEnabled(nextBookingSetting?.enabled || false);
    } catch (loadError) {
      if (isAdminAuthError(loadError)) {
        setLocation("/admin/shop/login?redirect=/admin/bookings");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "房況資料載入失敗。");
    } finally {
      setIsLoading(false);
    }
  }, [setLocation]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function submitManualReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      await createExternalReservation(token, manualForm);
      setManualForm(emptyManualForm);
      setMessage("外部訂房已建立，confirmed 訂房已同步封鎖官網日期。");
      await loadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "外部訂房建立失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitEmailDetection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      const result = await parseBookingEmail(token, emailForm);
      setEmailResult(result.result);
      setMessage(
        result.reservation
          ? "高信心 Booking 新訂單已建立外部訂房並封鎖官網日期。"
          : "信件已建立待人工確認紀錄。"
      );
      await loadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "信件解析失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      await saveBookingSettings(token, { platform: "booking", ical_url: icalUrl, enabled: icalEnabled });
      setMessage("Booking iCal 設定已更新。");
      await loadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "iCal 設定更新失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSyncIcal() {
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      const result = await syncBookingIcal(token);
      setMessage(`Booking iCal 同步完成：${result.eventsFound} 筆事件，寫入 ${result.blocksWritten} 筆 block。`);
      await loadAll();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Booking iCal 同步失敗。");
      await loadAll();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markAlertHandled(alert: BookingAlert) {
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      await handleBookingAlert(token, { id: alert.id, notes: alert.notes || "" });
      setMessage("提醒已標記為處理。");
      await loadAll();
    } catch (alertError) {
      setError(alertError instanceof Error ? alertError.message : "提醒更新失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token && !isLoading) {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-[16px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">房況管理</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">請先登入後台，再管理慢慢蒔光線上訂房與房況。</p>
          <Button className="mt-6 bg-[#8b6f5b] hover:bg-[#765d4a]" onClick={() => setLocation("/admin/shop/login?redirect=/admin/bookings")}>
            前往後台登入
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9] px-4 py-8 text-stone-900 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-[16px] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b08d73]">STime Villa Booking</p>
              <h1 className="mt-3 text-3xl font-semibold text-stone-900">線上訂房 / 房況管理</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                第 1 版只管理官網房況、Booking 訂單信判斷與 iCal 手動同步；不爬 Booking 後台，也不自動操作平台關房。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/shop">文創商城後台</Link>
              </Button>
              <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" onClick={() => void loadAll()} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新整理
              </Button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DashboardCard
            title="今日房況安全"
            value={dashboard?.safetyStatus === "danger" ? "高風險" : dashboard?.safetyStatus === "warning" ? "需確認" : "安全"}
            detail="依 P0/P1/P2 未處理提醒判斷。"
            icon={ShieldAlert}
            tone={dashboard?.safetyStatus === "danger" ? "red" : dashboard?.safetyStatus === "warning" ? "orange" : "green"}
          />
          <DashboardCard
            title="未來 90 天"
            value={dashboard?.future90DaysHasIssues ? "有不一致" : "無明顯異常"}
            detail={`${dashboard?.confirmedBlockCount90Days || 0} 筆 confirmed block。`}
            icon={CalendarDays}
            tone={dashboard?.future90DaysHasIssues ? "amber" : "green"}
          />
          <DashboardCard
            title="iCal 最後同步"
            value={dashboard?.bookingIcalLastSyncedAt ? formatDateTime(dashboard.bookingIcalLastSyncedAt) : "尚未同步"}
            detail={dashboard?.bookingIcalLastError || "Booking iCal 手動同步狀態。"}
            icon={RefreshCw}
          />
          <DashboardCard title="待人工確認 Email" value={String(dashboard?.pendingEmailCount || 0)} detail="取消、修改或低信心信件不自動關房。" icon={Inbox} tone="amber" />
          <DashboardCard
            title="P0 / P1 / P2"
            value={`${dashboard?.p0Count || 0} / ${dashboard?.p1Count || 0} / ${dashboard?.p2Count || 0}`}
            detail="P0 撞期、P1 官網未關、P2 平台同步提醒。"
            icon={AlertTriangle}
            tone={(dashboard?.p0Count || 0) > 0 ? "red" : "stone"}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">房況日曆</h2>
                <p className="mt-1 text-sm text-stone-500">支援未來 12 個月，包棟 villa 同一天不可有兩組 confirmed booking。</p>
              </div>
              {isLoading && <span className="text-sm text-stone-500">載入中...</span>}
            </div>
            <div className="mt-5 max-h-[620px] space-y-6 overflow-y-auto pr-1">
              {Object.entries(groupedMonths).map(([month, monthDays]) => (
                <div key={month}>
                  <h3 className="mb-3 text-sm font-semibold text-stone-700">{month}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
                    {monthDays.map((day) => (
                      <div key={day.date} className={cn("rounded-[8px] border p-2 text-xs", statusClass(day.status))}>
                        <p className="font-semibold">{formatDate(day.date)}</p>
                        <p className="mt-1">{day.status}</p>
                        {(day.blockCount > 0 || day.alertCount > 0) && (
                          <p className="mt-1 text-[11px] opacity-80">
                            {day.blockCount} block / {day.alertCount} alert
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <form className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm" onSubmit={submitManualReservation}>
              <h2 className="text-xl font-semibold text-stone-900">手動新增外部訂房</h2>
              <p className="mt-1 text-sm text-stone-500">Confirmed 訂房會自動封鎖官網日期；若重疊會改成 P0 撞期提醒。</p>
              <div className="mt-4 grid gap-3">
                <select className={fieldClassName()} value={manualForm.source} onChange={(event) => setManualForm((form) => ({ ...form, source: event.target.value }))}>
                  <option value="booking">Booking</option>
                  <option value="website">官網</option>
                  <option value="manual">人工</option>
                  <option value="maintenance">維修</option>
                  <option value="other">其他</option>
                </select>
                <input className={fieldClassName()} placeholder="外部訂單編號" value={manualForm.reference_number} onChange={(event) => setManualForm((form) => ({ ...form, reference_number: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={fieldClassName()} type="date" value={manualForm.check_in} onChange={(event) => setManualForm((form) => ({ ...form, check_in: event.target.value }))} />
                  <input className={fieldClassName()} type="date" value={manualForm.check_out} onChange={(event) => setManualForm((form) => ({ ...form, check_out: event.target.value }))} />
                </div>
                <input className={fieldClassName()} placeholder="客人姓名（可選）" value={manualForm.guest_name} onChange={(event) => setManualForm((form) => ({ ...form, guest_name: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className={fieldClassName()} placeholder="人數（可選）" value={manualForm.guest_count} onChange={(event) => setManualForm((form) => ({ ...form, guest_count: event.target.value }))} />
                  <input className={fieldClassName()} placeholder="金額（可選）" value={manualForm.amount} onChange={(event) => setManualForm((form) => ({ ...form, amount: event.target.value }))} />
                </div>
                <select className={fieldClassName()} value={manualForm.status} onChange={(event) => setManualForm((form) => ({ ...form, status: event.target.value }))}>
                  <option value="confirmed">confirmed</option>
                  <option value="pending_review">pending_review</option>
                  <option value="cancelled">cancelled</option>
                </select>
                <textarea className={textareaClassName()} placeholder="備註" value={manualForm.notes} onChange={(event) => setManualForm((form) => ({ ...form, notes: event.target.value }))} />
                <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>
                  建立外部訂房
                </Button>
              </div>
            </form>

            <form className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm" onSubmit={submitSettings}>
              <h2 className="text-xl font-semibold text-stone-900">Booking iCal</h2>
              <p className="mt-1 text-sm text-stone-500">第一版只做手動同步，不自動登入 Booking，也不自動關 Booking 房。</p>
              <div className="mt-4 grid gap-3">
                <input className={fieldClassName()} placeholder="Booking iCal URL" value={icalUrl} onChange={(event) => setIcalUrl(event.target.value)} />
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" checked={icalEnabled} onChange={(event) => setIcalEnabled(event.target.checked)} />
                  啟用 Booking iCal 同步
                </label>
                <div className="rounded-[8px] bg-[#fbf7f1] p-3 text-xs leading-5 text-stone-600">
                  最後同步：{formatDateTime(bookingSetting?.last_synced_at)}；錯誤：{bookingSetting?.last_error || "無"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>儲存 iCal 設定</Button>
                  <Button type="button" variant="outline" onClick={() => void handleSyncIcal()} disabled={isSubmitting || !icalEnabled || !icalUrl}>
                    同步 Booking iCal
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm" onSubmit={submitEmailDetection}>
            <h2 className="text-xl font-semibold text-stone-900">Booking Email 手動解析器</h2>
            <p className="mt-1 text-sm text-stone-500">貼上 Booking 訂單信內容。高信心新訂房才會自動封鎖官網日期；取消與修改一律待人工確認。</p>
            <div className="mt-4 grid gap-3">
              <input className={fieldClassName()} placeholder="寄件者" value={emailForm.sender} onChange={(event) => setEmailForm((form) => ({ ...form, sender: event.target.value }))} />
              <input className={fieldClassName()} placeholder="主旨" value={emailForm.subject} onChange={(event) => setEmailForm((form) => ({ ...form, subject: event.target.value }))} />
              <textarea className="min-h-56 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm outline-none focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]" placeholder="Email 原文" value={emailForm.raw_email} onChange={(event) => setEmailForm((form) => ({ ...form, raw_email: event.target.value }))} />
              <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>解析信件</Button>
            </div>
            {emailResult && (
              <div className="mt-4 rounded-[8px] border border-stone-200 bg-[#fbf7f1] p-4 text-sm leading-6 text-stone-700">
                <p>疑似 Booking：{emailResult.isBookingLike ? "是" : "否"}</p>
                <p>信心分數：{emailResult.confidence}</p>
                <p>類型：{emailResult.detectionType}</p>
                <p>訂單編號：{emailResult.referenceNumber || "-"}</p>
                <p>入住/退房：{emailResult.checkIn || "-"} → {emailResult.checkOut || "-"}</p>
                <p>建議自動封鎖：{emailResult.suggestedAutoBlock ? "是" : "否"}</p>
              </div>
            )}
          </form>

          <div className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">提醒與警告</h2>
                <p className="mt-1 text-sm text-stone-500">P0 紅色需立即處理；Review 是信件或預約申請待人工確認。</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{alerts.length} 筆</span>
            </div>
            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
                  目前沒有未處理提醒。
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="rounded-[8px] border border-stone-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", severityClass(alert.severity))}>
                          {alert.severity}
                        </span>
                        <h3 className="mt-2 font-semibold text-stone-900">{alert.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-stone-600">{alert.description || "-"}</p>
                        <p className="mt-1 text-xs text-stone-500">{alert.check_in || "-"} → {alert.check_out || "-"} / {formatDateTime(alert.created_at)}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void markAlertHandled(alert)} disabled={isSubmitting}>
                        標記已處理
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-900">外部訂房紀錄</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs text-stone-500">
                <tr>
                  <th className="py-2 pr-4">來源</th>
                  <th className="py-2 pr-4">編號</th>
                  <th className="py-2 pr-4">日期</th>
                  <th className="py-2 pr-4">狀態</th>
                  <th className="py-2 pr-4">客人</th>
                  <th className="py-2 pr-4">信心</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="py-3 pr-4">{reservation.source}</td>
                    <td className="py-3 pr-4">{reservation.reference_number || "-"}</td>
                    <td className="py-3 pr-4">{reservation.check_in} → {reservation.check_out}</td>
                    <td className="py-3 pr-4">{reservation.status}</td>
                    <td className="py-3 pr-4">{reservation.guest_name || "-"}</td>
                    <td className="py-3 pr-4">{reservation.confidence ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reservations.length === 0 && <p className="py-6 text-center text-sm text-stone-500">尚無外部訂房紀錄。</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
