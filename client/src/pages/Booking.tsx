import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Home,
  Minus,
  PawPrint,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { TOTAL_ROOM_COUNT } from "@/lib/bookings/bookingConstants";
import {
  checkBookingAvailability,
  fetchBookingCalendar,
  submitBookingRequest,
  type PetType,
  type StayType,
} from "@/lib/bookings/bookingApi";
import { cn } from "@/lib/utils";

type BookingForm = {
  guest_name: string;
  email: string;
  phone: string;
  check_in: string;
  check_out: string;
  stay_type: StayType;
  adults: number;
  children: number;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: PetType;
  pet_notes: string;
  notes: string;
};

const emptyForm: BookingForm = {
  guest_name: "",
  email: "",
  phone: "",
  check_in: "",
  check_out: "",
  stay_type: "villa",
  adults: 2,
  children: 0,
  room_count: TOTAL_ROOM_COUNT,
  has_pets: false,
  pet_count: 1,
  pet_type: "dog",
  pet_notes: "",
  notes: "",
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const petTypeLabels: Record<PetType, string> = {
  dog: "狗",
  cat: "貓",
  other: "其他",
};

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
  return `${toDateText(date).slice(0, 7)}-01`;
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

function nightsBetween(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / msPerDay);
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

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const canDecrease = value > min;
  const canIncrease = max === undefined || value < max;

  return (
    <div className="rounded-[12px] border border-[#eadfce] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-800">{label}</p>
          {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canDecrease}
            onClick={() => onChange(value - 1)}
            aria-label={`${label}減少`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-8 text-center text-lg font-semibold text-stone-900">{value}</span>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canIncrease}
            onClick={() => onChange(value + 1)}
            aria-label={`${label}增加`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Booking() {
  const [form, setForm] = useState<BookingForm>(emptyForm);
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
  const nightCount = nightsBetween(form.check_in, form.check_out);
  const guestSummary = `${form.adults} 位成人・${form.children} 位孩童・${
    form.stay_type === "villa" ? "包棟 villa" : `${form.room_count} 間客房`
  }`;
  const canShowStayOptions = selectedIsAvailable && !submittedRequestId;
  const canShowContactForm = canShowStayOptions;

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
        setError(calendarError instanceof Error ? calendarError.message : "房況載入失敗，請稍後再試。");
      })
      .finally(() => {
        if (isCurrent) setIsCalendarLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [minDate]);

  function updateField<K extends keyof BookingForm>(field: K, value: BookingForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function updateStayType(stayType: StayType) {
    setForm((current) => ({
      ...current,
      stay_type: stayType,
      room_count: stayType === "villa" ? TOTAL_ROOM_COUNT : Math.min(Math.max(current.room_count || 1, 1), TOTAL_ROOM_COUNT),
    }));
    setMessage("");
    setError("");
  }

  function selectDate(date: string) {
    setMessage("");
    setError("");
    setSubmittedRequestId("");

    if (date < minDate || date > maxDate) return;

    setForm((current) => {
      const canUseAsCheckout =
        current.check_in &&
        !current.check_out &&
        date > current.check_in &&
        !rangeHasUnavailable(current.check_in, date, unavailableDates);

      if (unavailableDates.has(date) && !canUseAsCheckout) return current;

      if (!current.check_in || (current.check_in && current.check_out) || date < current.check_in) {
        return { ...current, check_in: date, check_out: "" };
      }

      if (date === current.check_in) return { ...current, check_out: "" };

      const nextForm = { ...current, check_out: date };
      if (rangeHasUnavailable(nextForm.check_in, nextForm.check_out, unavailableDates)) {
        setError("選取區間內有不可預約日期，請重新選擇。");
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
        setError("這段日期目前不可預約，請重新選擇日期。");
        return;
      }
      setMessage("這段日期目前可以送出預約申請。");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "房況確認失敗，請稍後再試。");
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
      setMessage("已收到您的預約申請。我們會先確認房況，再與您聯繫付款與訂房細節。此申請尚未代表訂房成立。");
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
            const canUseAsCheckout =
              Boolean(form.check_in && !form.check_out && date > form.check_in) &&
              !rangeHasUnavailable(form.check_in, date, unavailableDates);
            const isCheckIn = date === form.check_in;
            const isCheckOut = date === form.check_out;
            const inRange = isDateInRange(date, form.check_in, form.check_out);
            const disabled = outOfRange || (unavailable && !canUseAsCheckout);

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => selectDate(date)}
                className={cn(
                  "aspect-square min-h-11 rounded-[10px] border text-sm transition md:min-h-12",
                  disabled && "cursor-not-allowed border-stone-100 bg-stone-100 text-stone-300 line-through",
                  !disabled && "border-[#eadfce] bg-[#fffdf9] text-stone-700 hover:border-[#b7957c] hover:bg-[#f7f1e9]",
                  unavailable && canUseAsCheckout && "border-[#eadfce] bg-[#fffaf3] text-stone-500",
                  inRange && !disabled && "border-[#b7957c] bg-[#f3eadf] text-[#765d4a]",
                  (isCheckIn || isCheckOut) && "border-[#765d4a] bg-[#8b6f5b] font-semibold text-white hover:bg-[#765d4a]"
                )}
                aria-label={`${date}${disabled ? " 不可預約" : " 可選擇"}`}
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
                  預約・歸零
                </h1>
                <p className="mt-5 text-base leading-8 text-stone-600">
                  慢慢蒔光是宜蘭員山包棟 villa，一天只接待一組客人。請先選擇日期與入住條件，再送出預約申請；此頁不收款，也不會自動成立 confirmed 訂房。
                </p>
              </div>
              <div className="grid gap-3 rounded-[16px] bg-[#f7f1e9] p-4 text-sm leading-6 text-stone-600">
                <div className="flex gap-3">
                  <Home className="mt-0.5 h-5 w-5 shrink-0 text-[#8b6f5b]" />
                  <p>包棟 villa 固定整棟 {TOTAL_ROOM_COUNT} 間主題房，適合家人朋友一起慢慢住下來。</p>
                </div>
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#8b6f5b]" />
                  <p>日期若已被 Booking、官網申請、人工保留或維修封鎖，前台一律顯示不可預約。</p>
                </div>
                <div className="flex gap-3">
                  <PawPrint className="mt-0.5 h-5 w-5 shrink-0 text-[#8b6f5b]" />
                  <p>慢慢蒔光為寵物友善 villa，實際入住規範會由我們人工確認時一併說明。</p>
                </div>
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-stone-900">第一步：選日期</h2>
                <p className="mt-1 text-sm text-stone-500">入住日至退房日前一天為佔用日期；退房日可讓下一組入住。</p>
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
                  disabled={visibleMonth >= maxMonth}
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
                  {form.check_in ? `入住 ${formatDate(form.check_in)}` : "請選擇入住日期"}
                  {form.check_out ? ` ・ 退房 ${formatDate(form.check_out)} ・ ${nightCount} 晚` : form.check_in ? " ・ 再選退房日期" : ""}
                </p>
                <p className="mt-1">
                  {selectedIsAvailable
                    ? "這段日期目前可以送出預約申請。"
                    : "選好可預約日期後，會展開入住條件與聯絡資料。"}
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

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded border border-[#eadfce] bg-[#fffdf9]" />可預約</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-stone-100" />不可預約</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#8b6f5b]" />已選日期</span>
            </div>

            {isCalendarLoading && <p className="mt-4 text-sm text-stone-500">正在載入房況...</p>}
            {message && <div className="mt-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">{message}</div>}
            {error && <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
          </section>

          {canShowStayOptions && (
            <section className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">第二步：選入住條件</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-500">包棟 villa 為主要營運模式；單間客房為淡季限定申請，仍需人工確認。</p>
                </div>
                <Users className="h-6 w-6 text-[#8b6f5b]" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => updateStayType("villa")}
                  className={cn(
                    "rounded-[16px] border p-4 text-left transition",
                    form.stay_type === "villa" ? "border-[#8b6f5b] bg-[#f7f1e9]" : "border-[#eadfce] bg-white hover:bg-[#fbf7f1]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <BedDouble className="mt-1 h-5 w-5 text-[#8b6f5b]" />
                    <div>
                      <p className="font-semibold text-stone-900">包棟 villa</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">包棟 villa｜{TOTAL_ROOM_COUNT} 間主題房｜一天只接待一組客人</p>
                      <p className="mt-2 text-xs font-medium text-[#8b6f5b]">整棟 {TOTAL_ROOM_COUNT} 間，客房數不可調整</p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => updateStayType("room")}
                  className={cn(
                    "rounded-[16px] border p-4 text-left transition",
                    form.stay_type === "room" ? "border-[#8b6f5b] bg-[#f7f1e9]" : "border-[#eadfce] bg-white hover:bg-[#fbf7f1]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Home className="mt-1 h-5 w-5 text-[#8b6f5b]" />
                    <div>
                      <p className="font-semibold text-stone-900">單間客房</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">單間客房｜淡季限定開放｜實際房型需由我們人工確認</p>
                      <p className="mt-2 text-xs font-medium text-[#8b6f5b]">可申請 1 到 {TOTAL_ROOM_COUNT} 間</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Stepper label="成人" value={form.adults} min={1} max={30} onChange={(value) => updateField("adults", value)} />
                <Stepper label="孩童" value={form.children} min={0} max={30} onChange={(value) => updateField("children", value)} />
                {form.stay_type === "room" && (
                  <Stepper
                    label="客房數"
                    value={form.room_count}
                    min={1}
                    max={TOTAL_ROOM_COUNT}
                    hint={`單間客房第一版最多可申請 ${TOTAL_ROOM_COUNT} 間，需人工確認`}
                    onChange={(value) => updateField("room_count", value)}
                  />
                )}
              </div>

              <div className="mt-5 rounded-[16px] border border-[#eadfce] bg-[#fffdf9] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-stone-900">是否攜帶寵物？</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">慢慢蒔光為寵物友善 villa，入住規範與清潔注意事項會於人工確認時一併說明。</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={form.has_pets ? "outline" : "default"}
                      className={cn(!form.has_pets && "bg-[#8b6f5b] hover:bg-[#765d4a]")}
                      onClick={() => updateField("has_pets", false)}
                    >
                      不攜帶
                    </Button>
                    <Button
                      type="button"
                      variant={form.has_pets ? "default" : "outline"}
                      className={cn(form.has_pets && "bg-[#8b6f5b] hover:bg-[#765d4a]")}
                      onClick={() => updateField("has_pets", true)}
                    >
                      攜帶寵物
                    </Button>
                  </div>
                </div>

                {form.has_pets && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <Stepper label="寵物數量" value={form.pet_count} min={1} max={20} onChange={(value) => updateField("pet_count", value)} />
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      寵物類型
                      <select className={fieldClassName()} value={form.pet_type} onChange={(event) => updateField("pet_type", event.target.value as PetType)}>
                        {Object.entries(petTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700 lg:col-span-2">
                      寵物備註
                      <textarea
                        className={textareaClassName()}
                        value={form.pet_notes}
                        onChange={(event) => updateField("pet_notes", event.target.value)}
                        placeholder="可填品種、體型、是否會使用尿布墊等資訊"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-[12px] bg-[#f7f1e9] px-4 py-3 text-sm font-medium text-[#765d4a]">
                {guestSummary}
              </div>
            </section>
          )}

          {canShowContactForm && (
            <form className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-6 shadow-sm md:p-8" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">第三步：填聯絡資料</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    送出後狀態為 pending review。我們會先確認房況，再與您聯繫付款與訂房細節；此申請尚未代表訂房成立。
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
                    <input className={fieldClassName()} type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                    電話
                    <input className={fieldClassName()} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                  </label>
                </div>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  備註
                  <textarea
                    className={textareaClassName()}
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    placeholder="可以填寫抵達時間、慶祝活動、寵物習慣或其他需要我們先知道的資訊"
                  />
                </label>

                <div className="rounded-[8px] bg-[#f7f1e9] px-4 py-3 text-sm leading-6 text-stone-600">
                  此頁不收款，也不會自動成立 confirmed 訂房。送出後，我們會人工確認房況與細節。
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
              <h2 className="text-xl font-semibold">已收到您的預約申請</h2>
              <p className="mt-2 text-sm leading-6">申請編號：{submittedRequestId}</p>
              <p className="mt-2 text-sm leading-6">我們會先確認房況，再與您聯繫付款與訂房細節。此申請尚未代表訂房成立。</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
