import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Home, Send } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import {
  checkBookingAvailability,
  fetchBookingCalendar,
  submitBookingRequest,
} from "@/lib/bookings/bookingApi";
import { cn } from "@/lib/utils";

const emptyForm = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  check_in: "",
  check_out: "",
  guest_count: "",
  notes: "",
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

function fieldClassName() {
  return "h-12 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function toDateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(dateText: string) {
  return new Date(`${dateText}T00:00:00Z`);
}

function todayText() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function addDays(dateText: string, days: number) {
  const date = parseDate(dateText);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateText(date);
}

function addMonths(monthStart: string, months: number) {
  const date = parseDate(monthStart);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDateText(date).slice(0, 7) + "-01";
}

function monthStart(dateText: string) {
  return `${dateText.slice(0, 7)}-01`;
}

function monthLabel(month: string) {
  const date = parseDate(month);
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(date);
}

function formatDate(dateText: string) {
  if (!dateText) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(parseDate(dateText));
}

function daysInMonth(month: string) {
  const start = parseDate(month);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return next.getUTCDate();
}

function getMonthDates(month: string) {
  const start = parseDate(month);
  const leadingBlanks = start.getUTCDay();
  const days = daysInMonth(month);
  return [
    ...Array.from({ length: leadingBlanks }, () => ""),
    ...Array.from({ length: days }, (_, index) => `${month.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`),
  ];
}

function isDateInRange(date: string, checkIn: string, checkOut: string) {
  return Boolean(checkIn && checkOut && date >= checkIn && date < checkOut);
}

function rangeHasUnavailable(checkIn: string, checkOut: string, unavailableDates: Set<string>) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return true;
  let current = checkIn;
  while (current < checkOut) {
    if (unavailableDates.has(current)) return true;
    current = addDays(current, 1);
  }
  return false;
}

export default function Booking() {
  const [form, setForm] = useState(emptyForm);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(todayText()));
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [maxDate, setMaxDate] = useState(() => addDays(todayText(), 365));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState("");

  const minDate = todayText();
  const maxMonth = monthStart(maxDate);
  const selectedIsAvailable = useMemo(
    () => Boolean(form.check_in && form.check_out && form.check_out > form.check_in && !rangeHasUnavailable(form.check_in, form.check_out, unavailableDates)),
    [form.check_in, form.check_out, unavailableDates]
  );
  const canShowRequestForm = selectedIsAvailable && !submittedRequestId;

  useEffect(() => {
    let isCurrent = true;
    setIsCalendarLoading(true);
    setError("");

    fetchBookingCalendar(minDate)
      .then((data) => {
        if (!isCurrent) return;
        setUnavailableDates(new Set(data.unavailableDates));
        setMaxDate(data.maxDate);
      })
      .catch((calendarError) => {
        if (!isCurrent) return;
        setError(calendarError instanceof Error ? calendarError.message : "房況日曆載入失敗，請稍後再試。");
      })
      .finally(() => {
        if (isCurrent) setIsCalendarLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [minDate]);

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function selectDate(date: string) {
    setMessage("");
    setError("");
    setSubmittedRequestId("");

    if (date < minDate || date > maxDate || unavailableDates.has(date)) return;

    setForm((current) => {
      if (!current.check_in || (current.check_in && current.check_out) || date < current.check_in) {
        return { ...current, check_in: date, check_out: "" };
      }

      if (date === current.check_in) return { ...current, check_out: "" };

      const nextForm = { ...current, check_out: date };
      if (rangeHasUnavailable(nextForm.check_in, nextForm.check_out, unavailableDates)) {
        setError("選取區間中包含不可預約日期，請重新選擇。");
        return { ...current, check_in: date, check_out: "" };
      }
      return nextForm;
    });
  }

  async function handleCheckAvailability() {
    if (!form.check_in || !form.check_out) {
      setError("請先選擇入住與退房日期。");
      return;
    }

    setIsChecking(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const result = await checkBookingAvailability(form.check_in, form.check_out);
      if (!result.available) {
        setError("這段日期目前無法預約，請改選其他日期。");
        return;
      }
      setMessage("這段日期目前可以送出預約申請。");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "房況查詢失敗，請稍後再試。");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const result = await submitBookingRequest(form);
      setSubmittedRequestId(result.request.id);
      setMessage("預約申請已送出。我們會人工確認房況後與您聯繫，尚未完成付款或正式成立訂房。");
      setUnavailableDates((current) => {
        const next = new Set(current);
        let date = form.check_in;
        while (date < form.check_out) {
          next.add(date);
          date = addDays(date, 1);
        }
        return next;
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "預約申請送出失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderMonth(month: string, secondary = false) {
    const dates = getMonthDates(month);

    return (
      <div className={cn("rounded-[16px] border border-[#eadfce] bg-white p-4 shadow-sm", secondary && "hidden md:block")}>
        <h3 className="text-center font-serif text-xl text-stone-900">{monthLabel(month)}</h3>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-400">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {dates.map((date, index) => {
            if (!date) return <div key={`blank-${month}-${index}`} className="aspect-square" />;

            const unavailable = unavailableDates.has(date);
            const outOfRange = date < minDate || date > maxDate;
            const isCheckIn = date === form.check_in;
            const isCheckOut = date === form.check_out;
            const inRange = isDateInRange(date, form.check_in, form.check_out);
            const disabled = unavailable || outOfRange;

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => selectDate(date)}
                className={cn(
                  "aspect-square rounded-[8px] border text-sm transition",
                  disabled && "cursor-not-allowed border-stone-100 bg-stone-100 text-stone-300 line-through",
                  !disabled && "border-[#eadfce] bg-[#fffdf9] text-stone-700 hover:border-[#b7957c] hover:bg-[#f7f1e9]",
                  inRange && !disabled && "border-[#b7957c] bg-[#f3eadf] text-[#765d4a]",
                  (isCheckIn || isCheckOut) && "border-[#765d4a] bg-[#8b6f5b] font-semibold text-white hover:bg-[#765d4a]"
                )}
                aria-label={`${date}${unavailable ? " 不可預約" : " 可預約"}`}
              >
                {Number(date.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf7f1] text-stone-900">
      <Header />
      <main className="px-4 pb-16 pt-32 md:px-8 md:pt-40">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-[24px] border border-[#eadfce] bg-white/90 p-6 shadow-sm md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b08d73]">STime Villa Booking</p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <h1 className="font-serif text-4xl font-light tracking-wide text-stone-900 md:text-5xl">
                  預約 / 歸零
                </h1>
                <p className="mt-5 text-base leading-8 text-stone-600">
                  慢慢蒔光一天只接一組客人。請先選擇入住與退房日期，確認可預約後再填寫聯絡資料。
                </p>
              </div>
              <div className="grid gap-3 rounded-[16px] bg-[#f7f1e9] p-4 text-sm leading-6 text-stone-600">
                <div className="flex gap-3">
                  <Home className="mt-0.5 h-5 w-5 shrink-0 text-[#8b6f5b]" />
                  <p>入住日至退房日前一天為佔用日期；退房日可讓下一組旅人入住。</p>
                </div>
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#8b6f5b]" />
                  <p>此頁不收款，也不會自動成立 confirmed 訂房，送出後由我們人工確認房況。</p>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-stone-900">選擇入住日期</h2>
                <p className="mt-1 text-sm text-stone-500">可選日期從今天開始，最多可查詢一年內。灰色日期目前不可預約。</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={visibleMonth <= monthStart(minDate)}
                  onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                  aria-label="上一個月"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={addMonths(visibleMonth, 1) >= maxMonth}
                  onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                  aria-label="下一個月"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {renderMonth(visibleMonth)}
              {renderMonth(addMonths(visibleMonth, 1), true)}
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-[12px] bg-[#fbf7f1] p-4 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-stone-800">
                  {form.check_in ? `入住 ${formatDate(form.check_in)}` : "請選擇入住日"}
                  {form.check_out ? `，退房 ${formatDate(form.check_out)}` : form.check_in ? "，再選退房日" : ""}
                </p>
                <p className="mt-1">
                  {selectedIsAvailable
                    ? "這段日期目前可送出預約申請。"
                    : "選好可預約的入住與退房日期後，表單會在下方展開。"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCheckAvailability()}
                disabled={isChecking || !form.check_in || !form.check_out}
              >
                {isChecking ? "確認中..." : "再次確認房況"}
              </Button>
            </div>

            {isCalendarLoading && <p className="mt-4 text-sm text-stone-500">房況日曆載入中...</p>}
            {message && <div className="mt-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">{message}</div>}
            {error && <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
          </section>

          {canShowRequestForm && (
            <form className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-6 shadow-sm md:p-8" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">填寫預約申請</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    送出後狀態為 pending review。我們會人工確認 Booking 與官網房況後，再與您聯繫。
                  </p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  姓名
                  <input className={fieldClassName()} value={form.guest_name} onChange={(event) => updateField("guest_name", event.target.value)} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                    Email
                    <input className={fieldClassName()} type="email" value={form.guest_email} onChange={(event) => updateField("guest_email", event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                    電話
                    <input className={fieldClassName()} value={form.guest_phone} onChange={(event) => updateField("guest_phone", event.target.value)} />
                  </label>
                </div>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  人數
                  <input className={fieldClassName()} inputMode="numeric" value={form.guest_count} onChange={(event) => updateField("guest_count", event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  備註
                  <textarea className={textareaClassName()} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="例如：同行人數、慶生需求、方便聯絡時間。" />
                </label>

                <div className="rounded-[8px] bg-[#f7f1e9] px-4 py-3 text-sm leading-6 text-stone-600">
                  此頁不收款，也不會自動成立 confirmed 訂房；送出後由我們人工確認房況。
                </div>

                <Button className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmitting ? "送出中..." : "送出預約申請"}
                </Button>
              </div>
            </form>
          )}

          {submittedRequestId && (
            <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 p-6 text-emerald-800 shadow-sm">
              <h2 className="text-xl font-semibold">預約申請已送出</h2>
              <p className="mt-2 text-sm leading-6">申請編號：{submittedRequestId}</p>
              <p className="mt-2 text-sm leading-6">我們會人工確認房況後與您聯繫。若有急件，也歡迎直接透過官方聯絡方式詢問。</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
