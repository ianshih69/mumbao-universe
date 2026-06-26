import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
import { getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";
import {
  createExternalReservation,
  fetchBookingAlerts,
  fetchBookingCalendar,
  fetchBookingDashboard,
  fetchBookingRequests,
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
  type BookingRequest,
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

type ReservationFilters = {
  source: string;
  status: string;
  from: string;
  to: string;
  query: string;
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

const sourceOptions = [
  { value: "booking", label: "Booking" },
  { value: "website", label: "官網" },
  { value: "manual", label: "人工保留" },
  { value: "maintenance", label: "維修" },
  { value: "other", label: "其他" },
];

const statusOptions = [
  { value: "confirmed", label: "confirmed" },
  { value: "pending_review", label: "pending_review" },
  { value: "cancelled", label: "cancelled" },
];

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

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

function formatMonthTitle(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function formatAmount(value?: number | null) {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value: string, days: number) {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function listBlockedDateKeys(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const dates: string[] = [];
  let cursor = checkIn;
  for (let index = 0; index < 370 && cursor < checkOut; index += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function getCalendarCells(monthKey: string, dayMap: Map<string, BookingCalendarDay>) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = firstDay.getUTCDay();
  const cells: Array<BookingCalendarDay | null> = Array.from({ length: offset }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push(dayMap.get(dateKey) || { date: dateKey, status: "可預約", blockCount: 0, alertCount: 0 });
  }

  return cells;
}

function severityClass(severity: string) {
  if (severity === "P0") return "bg-red-100 text-red-700 border-red-200";
  if (severity === "P1") return "bg-orange-100 text-orange-700 border-orange-200";
  if (severity === "P2") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-stone-100 text-stone-700 border-stone-200";
}

function dayStatusClass(day: BookingCalendarDay) {
  if (day.status.includes("撞期")) return "border-red-200 bg-red-50 text-red-700";
  if (day.status.includes("官網申請")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (day.status.includes("待確認")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (day.status.includes("Booking")) return "border-[#d9c6b5] bg-[#f8efe7] text-[#7d5f49]";
  if (day.status.includes("人工")) return "border-blue-100 bg-blue-50 text-blue-700";
  if (day.status.includes("維修")) return "border-stone-300 bg-stone-100 text-stone-700";
  if (day.status.includes("封鎖")) return "border-[#eadfce] bg-[#fbf7f1] text-[#8b6f5b]";
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function sourceLabel(source?: string | null) {
  return sourceOptions.find((option) => option.value === source)?.label || source || "-";
}

function statusLabel(status?: string | null) {
  if (status === "confirmed") return "confirmed";
  if (status === "pending_review") return "pending_review";
  if (status === "cancelled") return "cancelled";
  return status || "-";
}

function stayTypeLabel(request: BookingRequest) {
  if (request.stay_type === "villa") return "包棟 villa";
  return `${request.room_count || 1} 間客房`;
}

function guestSummary(request: BookingRequest) {
  return `${request.adults || 0} 位成人・${request.children || 0} 位孩童`;
}

function petSummary(request: BookingRequest) {
  if (!request.has_pets) return "不攜帶寵物";
  const petTypeLabel = request.pet_type === "cat" ? "貓" : request.pet_type === "other" ? "其他" : "狗";
  return `攜帶 ${request.pet_count || 1} 隻${petTypeLabel}`;
}

function requestOverlapsDate(request: BookingRequest, date: string) {
  return request.check_in <= date && date < request.check_out;
}

function submitButtonLabel(source: string) {
  if (source === "booking") return "建立 Booking 訂房並封鎖官網日期";
  if (source === "manual") return "建立人工保留";
  if (source === "maintenance") return "建立維修封鎖";
  if (source === "website") return "建立官網訂房並封鎖日期";
  return "建立外部訂房";
}

function groupDaysByMonth(days: BookingCalendarDay[]) {
  return days.reduce<Record<string, BookingCalendarDay[]>>((groups, day) => {
    const key = day.date.slice(0, 7);
    groups[key] = groups[key] || [];
    groups[key].push(day);
    return groups;
  }, {});
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
    <div className="rounded-[12px] border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{title}</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">{value}</p>
        </div>
        <div className={cn("flex size-9 items-center justify-center rounded-full", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
  );
}

export default function AdminBookings() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState(() => getAdminToken());
  const [dashboard, setDashboard] = useState<BookingDashboard | null>(null);
  const [days, setDays] = useState<BookingCalendarDay[]>([]);
  const [reservations, setReservations] = useState<BookingReservation[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [settings, setSettings] = useState<BookingPlatformSetting[]>([]);
  const [manualForm, setManualForm] = useState<ManualReservationForm>(emptyManualForm);
  const [emailForm, setEmailForm] = useState({ sender: "", subject: "", raw_email: "" });
  const [emailResult, setEmailResult] = useState<BookingEmailResult | null>(null);
  const [icalUrl, setIcalUrl] = useState("");
  const [icalEnabled, setIcalEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [monthIndex, setMonthIndex] = useState(0);
  const [reservationFilters, setReservationFilters] = useState<ReservationFilters>({
    source: "all",
    status: "all",
    from: "",
    to: "",
    query: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const bookingSetting = settings.find((setting) => setting.platform === "booking");
  const groupedMonths = useMemo(() => groupDaysByMonth(days), [days]);
  const calendarDayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const monthKeys = useMemo(() => Object.keys(groupedMonths).sort(), [groupedMonths]);
  const visibleMonths = monthKeys.slice(monthIndex, monthIndex + 2);
  const blockedPreviewDates = useMemo(
    () => listBlockedDateKeys(manualForm.check_in, manualForm.check_out),
    [manualForm.check_in, manualForm.check_out]
  );
  const hasConfirmedOverlap = useMemo(
    () =>
      manualForm.status === "confirmed" &&
      blockedPreviewDates.some((date) => {
        const day = calendarDayMap.get(date);
        return Boolean(day && day.blockCount > 0 && !day.status.includes("待確認"));
      }),
    [blockedPreviewDates, calendarDayMap, manualForm.status]
  );
  const filteredReservations = useMemo(() => {
    const query = reservationFilters.query.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (reservationFilters.source !== "all" && reservation.source !== reservationFilters.source) return false;
      if (reservationFilters.status !== "all" && reservation.status !== reservationFilters.status) return false;
      if (reservationFilters.from && reservation.check_out < reservationFilters.from) return false;
      if (reservationFilters.to && reservation.check_in > reservationFilters.to) return false;
      if (query) {
        const haystack = [
          reservation.reference_number,
          reservation.guest_name,
          reservation.notes,
          reservation.source,
          reservation.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [reservationFilters, reservations]);
  const pendingWebsiteRequests = useMemo(
    () => bookingRequests.filter((request) => request.status === "pending_review"),
    [bookingRequests]
  );
  const websiteRequestAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "open" && alert.alert_type === "website_booking_request"),
    [alerts]
  );
  const riskAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "open" && ["P0", "P1", "P2"].includes(alert.severity)),
    [alerts]
  );
  const pendingReviewCount =
    (dashboard?.pendingEmailCount || 0) + Math.max(pendingWebsiteRequests.length, websiteRequestAlerts.length);

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
      const [dashboardResult, calendarResult, settingsResult, alertsResult, reservationsResult, requestsResult] = await Promise.allSettled([
        fetchBookingDashboard(nextToken),
        fetchBookingCalendar(nextToken),
        fetchBookingSettings(nextToken),
        fetchBookingAlerts(nextToken),
        fetchBookingReservations(nextToken),
        fetchBookingRequests(nextToken),
      ]);
      const failures = [dashboardResult, calendarResult, settingsResult, alertsResult, reservationsResult, requestsResult].filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failures.some((failure) => isAdminAuthError(failure.reason))) {
        setLocation("/admin/shop/login?redirect=/admin/bookings");
        return;
      }
      if (dashboardResult.status === "fulfilled") setDashboard(dashboardResult.value.dashboard);
      if (calendarResult.status === "fulfilled") setDays(calendarResult.value.calendar.days);
      if (settingsResult.status === "fulfilled") setSettings(settingsResult.value.settings || []);
      if (alertsResult.status === "fulfilled") setAlerts(alertsResult.value.alerts);
      if (reservationsResult.status === "fulfilled") setReservations(reservationsResult.value.reservations);
      if (requestsResult.status === "fulfilled") setBookingRequests(requestsResult.value.requests || []);
      setMonthIndex(0);
      if (settingsResult.status === "fulfilled") {
        const nextBookingSetting = settingsResult.value.settings.find((setting) => setting.platform === "booking");
        setIcalUrl(nextBookingSetting?.ical_url || "");
        setIcalEnabled(nextBookingSetting?.enabled || false);
      }
      if (failures.length > 0) {
        setError("部分訂房資料讀取失敗，請重新整理或檢查設定。");
      }
    } catch (loadError) {
      if (isAdminAuthError(loadError)) {
        setLocation("/admin/shop/login?redirect=/admin/bookings");
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "讀取訂房資料失敗，請確認 booking 資料表與 /api/admin-bookings 是否正常。"
      );
    } finally {
      setIsLoading(false);
    }
  }, [setLocation]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function updateManualForm(field: keyof ManualReservationForm, value: string) {
    setManualForm((form) => ({ ...form, [field]: value }));
  }

  function handleCalendarDayClick(date: string) {
    setManualForm((form) => {
      if (!form.check_in || form.check_out) {
        return { ...form, check_in: date, check_out: addDays(date, 1) };
      }
      if (date > form.check_in) {
        return { ...form, check_out: date };
      }
      return { ...form, check_in: date, check_out: addDays(date, 1) };
    });
  }

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
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-[#b08d73]">管理中心 / 線上訂房 / 房況管理</p>
              <h1 className="mt-3 text-3xl font-semibold text-stone-900">線上訂房 / 房況管理</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                管理官網房況、Booking 訂房與人工保留；不會自動操作 Booking 後台。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminShopHeaderLinks context="bookings" onRefresh={() => void loadAll()} isRefreshing={isLoading} />
              <Button className="hidden bg-[#8b6f5b] hover:bg-[#765d4a] md:inline-flex" onClick={() => void loadAll()} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新整理
              </Button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            title="iCal 狀態"
            value={dashboard?.bookingIcalLastSyncedAt ? formatDateTime(dashboard.bookingIcalLastSyncedAt) : "尚未同步"}
            detail={dashboard?.bookingIcalLastError || "Booking iCal 手動同步狀態。"}
            icon={RefreshCw}
          />
          <DashboardCard
            title="待確認申請"
            value={String(pendingReviewCount)}
            detail="包含官網預約申請與信件人工確認。"
            icon={Inbox}
            tone="amber"
          />
          <DashboardCard
            title="P0 / P1 / P2"
            value={`${dashboard?.p0Count || 0} / ${dashboard?.p1Count || 0} / ${dashboard?.p2Count || 0}`}
            detail="P0 撞期、P1 官網未關、P2 平台同步提醒。"
            icon={AlertTriangle}
            tone={(dashboard?.p0Count || 0) > 0 ? "red" : "stone"}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <form className="order-1 rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm xl:order-2" onSubmit={submitManualReservation}>
            <div>
              <h2 className="text-xl font-semibold text-stone-900">快速新增外部訂房</h2>
              <p className="mt-1 text-sm text-stone-500">常用於 Booking 訂單、人工保留或維修封鎖。</p>
            </div>

            <div className="mt-5 space-y-5">
              <section>
                <p className="text-sm font-semibold text-stone-800">必要資料</p>
                <div className="mt-3 grid gap-3">
                  <select className={fieldClassName()} value={manualForm.source} onChange={(event) => updateManualForm("source", event.target.value)}>
                    {sourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input className={fieldClassName()} placeholder="外部訂單編號" value={manualForm.reference_number} onChange={(event) => updateManualForm("reference_number", event.target.value)} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-medium text-stone-500">
                      入住日期
                      <input className={fieldClassName()} type="date" value={manualForm.check_in} onChange={(event) => updateManualForm("check_in", event.target.value)} />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-stone-500">
                      退房日期
                      <input className={fieldClassName()} type="date" value={manualForm.check_out} onChange={(event) => updateManualForm("check_out", event.target.value)} />
                    </label>
                  </div>
                  <select className={fieldClassName()} value={manualForm.status} onChange={(event) => updateManualForm("status", event.target.value)}>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className={cn("rounded-[12px] border p-4", hasConfirmedOverlap ? "border-red-200 bg-red-50" : "border-[#eadfce] bg-[#fbf7f1]")}>
                <p className={cn("text-sm font-semibold", hasConfirmedOverlap ? "text-red-700" : "text-stone-800")}>封鎖日期預覽</p>
                {manualForm.check_in && manualForm.check_out && manualForm.check_out > manualForm.check_in ? (
                  <div className="mt-2 space-y-2 text-sm leading-6">
                    <p className={hasConfirmedOverlap ? "text-red-700" : "text-stone-700"}>
                      將封鎖官網日期：{formatDate(manualForm.check_in)} ～ {formatDate(addDays(manualForm.check_out, -1))}
                    </p>
                    <p className="text-xs text-stone-500">
                      實際封鎖：{blockedPreviewDates.map((date) => formatDate(date)).join("、")}。退房日 {formatDate(manualForm.check_out)} 不封鎖，可讓下一組入住。
                    </p>
                    {hasConfirmedOverlap && (
                      <p className="rounded-[8px] border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700">
                        此區間已有訂房或封鎖，不能建立 confirmed 外部訂房。
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-stone-500">選擇入住與退房日期後，這裡會顯示實際封鎖日期。</p>
                )}
              </section>

              <details className="rounded-[12px] border border-stone-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-800">更多資料（選填）</summary>
                <div className="grid gap-3 border-t border-stone-100 p-4">
                  <input className={fieldClassName()} placeholder="客人姓名（可選）" value={manualForm.guest_name} onChange={(event) => updateManualForm("guest_name", event.target.value)} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className={fieldClassName()} placeholder="人數（可選）" value={manualForm.guest_count} onChange={(event) => updateManualForm("guest_count", event.target.value)} />
                    <input className={fieldClassName()} placeholder="金額（可選）" value={manualForm.amount} onChange={(event) => updateManualForm("amount", event.target.value)} />
                  </div>
                  <textarea className={textareaClassName()} placeholder="備註" value={manualForm.notes} onChange={(event) => updateManualForm("notes", event.target.value)} />
                </div>
              </details>

              <Button className="w-full bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting || hasConfirmedOverlap}>
                {submitButtonLabel(manualForm.source)}
              </Button>
            </div>
          </form>

          <div className="order-2 rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm xl:order-1">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">房況日曆</h2>
                <p className="mt-1 text-sm text-stone-500">後台可看來源；點日期可帶入右側快速新增表單。</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setMonthIndex((index) => Math.max(0, index - 1))} disabled={monthIndex === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMonthIndex((index) => Math.min(Math.max(monthKeys.length - 2, 0), index + 1))}
                  disabled={monthIndex >= Math.max(monthKeys.length - 2, 0)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600">
              {["可預約", "Booking 已訂", "官網申請", "人工保留", "維修", "撞期風險"].map((status) => (
                <span key={status} className={cn("rounded-full border px-2 py-1", dayStatusClass({ date: "", status, blockCount: status === "可預約" ? 0 : 1, alertCount: 0 }))}>
                  {status}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {visibleMonths.length === 0 ? (
                <div className="rounded-[12px] border border-[#eadfce] bg-[#fbf7f1] p-5 text-sm text-stone-600 lg:col-span-2">
                  目前沒有封鎖或訂房紀錄。房況資料載入後仍會顯示月曆。
                </div>
              ) : (
                visibleMonths.map((month) => (
                  <div key={month} className="rounded-[12px] border border-[#eadfce] bg-[#fbf7f1] p-3">
                    <h3 className="mb-3 text-sm font-semibold text-stone-800">{formatMonthTitle(month)}</h3>
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-stone-400">
                      {weekdayLabels.map((weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ))}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {getCalendarCells(month, calendarDayMap).map((day, index) => {
                        if (!day) return <div key={`empty-${month}-${index}`} />;
                        const hasWebsiteRequest = pendingWebsiteRequests.some((request) => requestOverlapsDate(request, day.date));
                        const displayDay = hasWebsiteRequest && !day.status.includes("撞期")
                          ? { ...day, status: "官網申請" }
                          : day;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            className={cn(
                              "min-h-16 rounded-[8px] border p-1.5 text-left text-[11px] transition hover:-translate-y-0.5 hover:shadow-sm",
                              dayStatusClass(displayDay),
                              manualForm.check_in === day.date || manualForm.check_out === day.date ? "ring-2 ring-[#b7957c]" : ""
                            )}
                            onClick={() => handleCalendarDayClick(day.date)}
                          >
                            <span className="text-sm font-semibold">{Number(day.date.slice(-2))}</span>
                            <span className="mt-1 block leading-4">{displayDay.status}</span>
                            {!hasWebsiteRequest && (day.blockCount > 0 || day.alertCount > 0) && (
                              <span className="mt-1 block text-[10px] opacity-75">
                                {day.blockCount} block / {day.alertCount} alert
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            {days.length > 0 && days.every((day) => day.blockCount === 0 && day.alertCount === 0) && (
              <p className="mt-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                目前沒有封鎖或訂房紀錄。
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[16px] border border-amber-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">官網預約申請待確認</h2>
              <p className="mt-1 text-sm text-stone-500">
                這裡只列出前台 /booking 送出的 pending_review 申請，尚未代表訂房成立。
              </p>
            </div>
            <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {pendingWebsiteRequests.length} 筆待確認
            </span>
          </div>

          {pendingWebsiteRequests.length === 0 ? (
            <div className="mt-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              目前沒有待確認的官網預約申請。
            </div>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {pendingWebsiteRequests.map((request) => (
                <article key={request.id} className="rounded-[12px] border border-[#eadfce] bg-[#fbf7f1] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {request.check_in} → {request.check_out}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">建立時間：{formatDateTime(request.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700">
                      待確認
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
                    <p>住宿方式：{stayTypeLabel(request)}</p>
                    <p>人數：{guestSummary(request)}</p>
                    <p>寵物：{petSummary(request)}</p>
                    <p>姓名：{request.guest_name || "-"}</p>
                    <p>電話：{request.guest_phone || "-"}</p>
                    <p>Email：{request.guest_email || "-"}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <details>
                      <summary className="inline-flex h-9 cursor-pointer items-center rounded-full border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50">
                        查看申請
                      </summary>
                      <div className="mt-2 rounded-[8px] border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-600">
                        <p>ID：{request.id}</p>
                        <p>備註：{request.notes || "-"}</p>
                        <p>寵物備註：{request.pet_notes || "-"}</p>
                      </div>
                    </details>
                    <Button type="button" size="sm" variant="outline" disabled title="需要新增確認成訂 API 後才能啟用">
                      確認成訂
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled title="需要新增婉拒 API 後才能啟用">
                      婉拒
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">風險警告</h2>
              <p className="mt-1 text-sm text-stone-500">只顯示 P0/P1/P2 風險；一般官網預約申請已移到上方待確認區。</p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{riskAlerts.length} 筆</span>
          </div>
          <div className="mt-4">
            {riskAlerts.length === 0 ? (
              <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                目前沒有未處理提醒。
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {riskAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-[10px] border border-stone-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", severityClass(alert.severity))}>
                            {alert.severity}
                          </span>
                          <span className="text-xs text-stone-500">{alert.source || "system"}</span>
                        </div>
                        <h3 className="mt-2 font-semibold text-stone-900">{alert.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-stone-600">{alert.description || "-"}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {alert.check_in || "-"} → {alert.check_out || "-"} / {formatDateTime(alert.created_at)}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void markAlertHandled(alert)} disabled={isSubmitting}>
                        標記已處理
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-stone-900">外部訂房紀錄</h2>
              <p className="mt-1 text-sm text-stone-500">查 Booking、官網申請、人工保留與維修封鎖。</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <select className={fieldClassName()} value={reservationFilters.source} onChange={(event) => setReservationFilters((filters) => ({ ...filters, source: event.target.value }))}>
                <option value="all">全部來源</option>
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select className={fieldClassName()} value={reservationFilters.status} onChange={(event) => setReservationFilters((filters) => ({ ...filters, status: event.target.value }))}>
                <option value="all">全部狀態</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input className={fieldClassName()} type="date" value={reservationFilters.from} onChange={(event) => setReservationFilters((filters) => ({ ...filters, from: event.target.value }))} />
              <input className={fieldClassName()} type="date" value={reservationFilters.to} onChange={(event) => setReservationFilters((filters) => ({ ...filters, to: event.target.value }))} />
              <input className={fieldClassName()} placeholder="搜尋編號 / 客人" value={reservationFilters.query} onChange={(event) => setReservationFilters((filters) => ({ ...filters, query: event.target.value }))} />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs text-stone-500">
                <tr>
                  <th className="py-2 pr-4">來源</th>
                  <th className="py-2 pr-4">訂單編號</th>
                  <th className="py-2 pr-4">日期</th>
                  <th className="py-2 pr-4">狀態</th>
                  <th className="py-2 pr-4">客人</th>
                  <th className="py-2 pr-4">金額</th>
                  <th className="py-2 pr-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td className="py-3 pr-4">{sourceLabel(reservation.source)}</td>
                    <td className="py-3 pr-4">{reservation.reference_number || "-"}</td>
                    <td className="py-3 pr-4">{reservation.check_in} → {reservation.check_out}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-[#fbf7f1] px-2 py-1 text-xs text-[#7d5f49]">{statusLabel(reservation.status)}</span>
                    </td>
                    <td className="py-3 pr-4">{reservation.guest_name || "-"}</td>
                    <td className="py-3 pr-4">{formatAmount(reservation.amount)}</td>
                    <td className="py-3 pr-4">
                      <details className="min-w-36">
                        <summary className="cursor-pointer text-xs font-semibold text-[#8b6f5b]">查看詳情</summary>
                        <div className="mt-2 rounded-[8px] border border-stone-200 bg-[#fbf7f1] p-3 text-xs leading-5 text-stone-600">
                          <p>ID：{reservation.id}</p>
                          <p>人數：{reservation.guest_count ?? "-"}</p>
                          <p>信心：{reservation.confidence ?? "-"}</p>
                          <p>備註：{reservation.notes || "-"}</p>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredReservations.length === 0 && (
              <p className="py-8 text-center text-sm text-stone-500">目前沒有外部訂房紀錄。你可以先在右側建立 Booking 或人工保留。</p>
            )}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <details className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Booking iCal 同步</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {bookingSetting?.ical_url ? "已設定 iCal，可展開調整或手動同步。" : "尚未設定 Booking iCal。你可以先手動新增外部訂房，iCal 之後再設定。"}
                  </p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-medium", bookingSetting?.last_error ? "bg-red-50 text-red-700" : icalEnabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600")}>
                  {bookingSetting?.last_error ? "同步失敗" : icalEnabled ? "已啟用" : "未設定"}
                </span>
              </div>
              <p className="mt-2 text-xs text-stone-500">最後同步：{formatDateTime(bookingSetting?.last_synced_at)}</p>
            </summary>
            <form className="mt-4 grid gap-3 border-t border-stone-100 pt-4" onSubmit={submitSettings}>
              <input className={fieldClassName()} placeholder="Booking iCal URL" value={icalUrl} onChange={(event) => setIcalUrl(event.target.value)} />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={icalEnabled} onChange={(event) => setIcalEnabled(event.target.checked)} />
                啟用 Booking iCal 同步
              </label>
              <div className="rounded-[8px] bg-[#fbf7f1] p-3 text-xs leading-5 text-stone-600">
                錯誤：{bookingSetting?.last_error || "無"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>
                  儲存 iCal 設定
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleSyncIcal()} disabled={isSubmitting || !icalEnabled || !icalUrl}>
                  同步 Booking iCal
                </Button>
              </div>
            </form>
          </details>

          <details className="rounded-[16px] border border-stone-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none">
              <h2 className="text-lg font-semibold text-stone-900">Booking Email 手動解析器</h2>
              <p className="mt-1 text-sm text-stone-500">貼上 Booking 訂單信內容，系統會嘗試判斷是否為新訂房。高信心才會建立待處理資料。</p>
            </summary>
            <form className="mt-4 grid gap-3 border-t border-stone-100 pt-4" onSubmit={submitEmailDetection}>
              <input className={fieldClassName()} placeholder="寄件者" value={emailForm.sender} onChange={(event) => setEmailForm((form) => ({ ...form, sender: event.target.value }))} />
              <input className={fieldClassName()} placeholder="主旨" value={emailForm.subject} onChange={(event) => setEmailForm((form) => ({ ...form, subject: event.target.value }))} />
              <textarea className="min-h-48 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm outline-none focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]" placeholder="Email 原文" value={emailForm.raw_email} onChange={(event) => setEmailForm((form) => ({ ...form, raw_email: event.target.value }))} />
              <Button className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>
                解析信件
              </Button>
            </form>
            {emailResult && (
              <div className="mt-4 rounded-[10px] border border-stone-200 bg-[#fbf7f1] p-4 text-sm leading-6 text-stone-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#7d5f49]">信心 {emailResult.confidence}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#7d5f49]">{emailResult.detectionType || "unknown"}</span>
                </div>
                <p className="mt-3">疑似 Booking：{emailResult.isBookingLike ? "是" : "否"}</p>
                <p>訂單編號：{emailResult.referenceNumber || "-"}</p>
                <p>入住 / 退房：{emailResult.checkIn || "-"} → {emailResult.checkOut || "-"}</p>
                <p>建議封鎖官網：{emailResult.suggestedAutoBlock ? "是" : "否"}</p>
              </div>
            )}
          </details>
        </section>
      </div>
    </main>
  );
}
