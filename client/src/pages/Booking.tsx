import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gift,
  Minus,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  DEFAULT_BOOKING_SETTINGS,
  type PublicBookingSettings,
} from "@/lib/bookings/bookingConstants";
import {
  checkBookingAvailability,
  fetchBookingCalendar,
  submitBookingRequest,
  type BookingCalendarResult,
  type StayType,
} from "@/lib/bookings/bookingApi";
import {
  getBookingRangeIssue,
  isBookableStayNight,
  isCalendarFilterMismatch,
  normalizeBookingCalendarDay,
  saleModeToStayType,
  stayTypeToSaleMode,
  type BookingCalendarDayView,
  type BookingCalendarFilter,
  type BookingSaleMode,
} from "@/lib/bookings/bookingCalendarView";
import {
  readBookingDraft,
  writeBookingDraft,
  type BookingDraftForm,
} from "@/lib/bookings/bookingDraft";
import { cn } from "@/lib/utils";
import { asArray, asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type BookingForm = BookingDraftForm;
type CalendarSelectionMode = "checkIn" | "checkOut";

type BookingCmsCopy = {
  eyebrow: string;
  title: string;
  subtitleTemplate: string;
  instructions: string[];
  petNote: string;
  successMessage: string;
};

const fallbackBookingCopy: BookingCmsCopy = {
  eyebrow: "",
  title: "線上預約",
  subtitleTemplate: "選擇入住與退房日期，送出後由我們確認房況。",
  instructions: [],
  petNote: "",
  successMessage: "已收到您的預約申請。我們會先確認房況，再與您聯繫付款與訂房細節。此申請尚未代表訂房成立。",
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
  room_count: DEFAULT_BOOKING_SETTINGS.totalRoomCount,
  has_pets: false,
  pet_count: 0,
  pet_type: "",
  pet_notes: "",
  notes: "",
};

const bookingTestPassword = "123";
const bookingTestStorageKey = "mumbao_booking_test_unlocked_v1";
const calendarFilters: Array<{ value: BookingCalendarFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "whole_house", label: "只看包棟" },
  { value: "room", label: "只看單間" },
];

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

function addMonthsToDate(dateText: string, months: number) {
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDateText(target);
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

function formatSearchDate(dateText: string) {
  if (!dateText) return "選擇日期";
  const date = parseDate(dateText);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}/${day}（${weekdays[date.getUTCDay()]}）`;
}

function formatFullDate(dateText: string) {
  if (!dateText) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseDate(dateText));
}

function formatBookingSummaryDate(dateText: string, includeYear = true) {
  if (!dateText) return "-";
  const date = parseDate(dateText);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return includeYear ? `${year} 年 ${month} 月 ${day} 日` : `${month} 月 ${day} 日`;
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

function getDefaultStayType(settings: PublicBookingSettings): StayType {
  if (settings.allowVillaBooking) return "villa";
  if (settings.allowRoomBooking) return "room";
  return "villa";
}

function clampRoomCount(value: number, max: number) {
  return Math.min(Math.max(value || 1, 1), max);
}

function reconcileFormWithSettings(form: BookingForm, settings: PublicBookingSettings): BookingForm {
  let stayType = form.stay_type;
  if (stayType === "villa" && !settings.allowVillaBooking) stayType = getDefaultStayType(settings);
  if (stayType === "room" && !settings.allowRoomBooking) stayType = getDefaultStayType(settings);

  return {
    ...form,
    stay_type: stayType,
    room_count: stayType === "villa" ? settings.totalRoomCount : clampRoomCount(form.room_count, settings.totalRoomCount),
    has_pets: false,
    pet_count: 0,
    pet_type: "",
    pet_notes: "",
  };
}

function getInitialBookingForm() {
  if (typeof window === "undefined") return emptyForm;
  return readBookingDraft(window.sessionStorage, emptyForm);
}

function saleModeLabel(saleMode: BookingSaleMode) {
  if (saleMode === "whole_house") return "包棟";
  if (saleMode === "room") return "單間";
  return "未開放";
}

function selectedStayTitle(stayType: StayType) {
  return stayType === "villa" ? "已選擇包棟住宿" : "已選擇單間住宿";
}

function stayTypeDisplay(stayType: StayType) {
  return stayType === "villa" ? "整棟包棟" : "單間住宿";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  const normalized = value.trim();
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 6 && /^[+\d()\-\s#]+$/.test(normalized);
}

function rangeIssueMessage(stayType: StayType, issue: string) {
  if (issue === "mode_mismatch") {
    return stayType === "villa"
      ? "所選住宿期間包含非包棟開放日期，請重新選擇。"
      : "所選住宿期間包含未開放單間或已滿房日期，請重新選擇。";
  }
  return "這段日期中有不可預約的日期，請重新選擇。";
}

function getCalendarDayLabels(day: BookingCalendarDayView, minDate: string, maxDate: string) {
  if (day.date < minDate) {
    return { modeLabel: "已過日期", statusLabel: "", mobileStatusLabel: "", unavailable: true };
  }
  if (day.date > maxDate || day.saleMode === "closed") {
    return { modeLabel: "未開放", statusLabel: "", mobileStatusLabel: "", unavailable: true };
  }
  if (!day.isAvailable) {
    return {
      modeLabel: saleModeLabel(day.saleMode),
      statusLabel: "已滿房",
      mobileStatusLabel: "已滿",
      unavailable: true,
    };
  }
  if (day.saleMode === "room" && day.remainingRooms !== null) {
    return {
      modeLabel: "單間",
      statusLabel: `剩 ${day.remainingRooms} 間`,
      mobileStatusLabel: `${day.remainingRooms} 間`,
      unavailable: false,
    };
  }
  return {
    modeLabel: saleModeLabel(day.saleMode),
    statusLabel: "可預約",
    mobileStatusLabel: "可訂",
    unavailable: false,
  };
}

function calendarDayAriaLabel(day: BookingCalendarDayView, minDate: string, maxDate: string) {
  const labels = getCalendarDayLabels(day, minDate, maxDate);
  const dateLabel = formatFullDate(day.date);
  if (labels.modeLabel === "已過日期") return `${dateLabel}，已過日期`;
  if (labels.modeLabel === "未開放") return `${dateLabel}，未開放`;
  const availability = labels.statusLabel || (labels.unavailable ? "不可預約" : "可預約");
  return `${dateLabel}，${labels.modeLabel}，${availability}`;
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
  const { session } = useCustomerAuth();
  const [form, setForm] = useState<BookingForm>(() => getInitialBookingForm());
  const [settings, setSettings] = useState<PublicBookingSettings>(() => ({ ...DEFAULT_BOOKING_SETTINGS }));
  const [bookingCopy, setBookingCopy] = useState<BookingCmsCopy>(fallbackBookingCopy);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(todayText()));
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [calendarDaySources, setCalendarDaySources] = useState<NonNullable<BookingCalendarResult["days"]>>([]);
  const [calendarFilter, setCalendarFilter] = useState<BookingCalendarFilter>("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<CalendarSelectionMode>("checkIn");
  const [maxDate, setMaxDate] = useState(() => addMonthsToDate(todayText(), DEFAULT_BOOKING_SETTINGS.bookingWindowMonths));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState("");
  const [isBookingTestUnlocked, setIsBookingTestUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(bookingTestStorageKey) === "true";
  });
  const [bookingTestInput, setBookingTestInput] = useState("");
  const [bookingTestError, setBookingTestError] = useState("");
  const bookingSearchRef = useRef<HTMLDivElement | null>(null);
  const calendarPanelRef = useRef<HTMLElement | null>(null);

  const minDate = todayText();
  const maxMonth = monthStart(maxDate);
  const bookingIsOpen = settings.allowVillaBooking || settings.allowRoomBooking;
  const calendarDaySourceMap = useMemo(
    () => new Map(calendarDaySources.map((day) => [day.date, day])),
    [calendarDaySources]
  );
  const getCalendarDay = useMemo(
    () => (date: string) => normalizeBookingCalendarDay(date, settings, unavailableDates, calendarDaySourceMap.get(date)),
    [calendarDaySourceMap, settings, unavailableDates]
  );
  const selectedRangeIssue = useMemo(
    () =>
      getBookingRangeIssue({
        checkIn: form.check_in,
        checkOut: form.check_out,
        saleMode: stayTypeToSaleMode(form.stay_type),
        minDate,
        maxDate,
        getDay: getCalendarDay,
      }),
    [form.check_in, form.check_out, form.stay_type, getCalendarDay, maxDate, minDate]
  );
  const selectedIsAvailable = useMemo(
    () => Boolean(bookingIsOpen && form.check_in && form.check_out && selectedRangeIssue === "ok"),
    [bookingIsOpen, form.check_in, form.check_out, selectedRangeIssue]
  );
  const nightCount = nightsBetween(form.check_in, form.check_out);
  const guestSummary = [
    `${form.adults} 位成人`,
    form.children > 0 ? `${form.children} 位孩童` : null,
    stayTypeDisplay(form.stay_type),
  ].filter(Boolean).join("｜");
  const contactDetailsComplete = Boolean(form.guest_name.trim() && isValidEmail(form.email) && isValidPhone(form.phone));
  const canShowStayOptions = bookingIsOpen && selectedIsAvailable && !submittedRequestId;
  const canShowContactForm = canShowStayOptions;
  const guestCount = form.adults + form.children;

  useEffect(() => {
    if (!isBookingTestUnlocked) return;

    let isCurrent = true;
    setIsCalendarLoading(true);
    setError("");

    fetchBookingCalendar(minDate)
      .then((data) => {
        if (!isCurrent) return;
        setUnavailableDates(new Set(data.unavailableDates));
        setCalendarDaySources(data.days || []);
        setMaxDate(data.maxDate);
        setSettings(data.settings);
        setForm((current) => reconcileFormWithSettings(current, data.settings));
      })
      .catch((calendarError) => {
        if (!isCurrent) return;
        setError(calendarError instanceof Error ? calendarError.message : "房況暫時無法載入，請稍後再試。");
      })
      .finally(() => {
        if (isCurrent) setIsCalendarLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isBookingTestUnlocked, minDate]);

  useEffect(() => {
    if (!isBookingTestUnlocked) return;

    let isCurrent = true;
    fetchSitePageContent("booking")
      .then((content) => {
        if (!isCurrent) return;
        const hero = content.sections["booking.hero"]?.content;
        const instructions = content.sections["booking.instructions"]?.content;
        const petNote = content.sections["booking.pet_note"]?.content;
        const successMessage = content.sections["booking.success_message"]?.content;
        const instructionItems = asArray<string>(instructions?.items).filter(Boolean).slice(0, 3);
        setBookingCopy({
          eyebrow: asString(hero?.eyebrow, fallbackBookingCopy.eyebrow),
          title: asString(hero?.title, fallbackBookingCopy.title),
          subtitleTemplate: asString(hero?.subtitle, fallbackBookingCopy.subtitleTemplate),
          instructions: instructionItems.length ? instructionItems : fallbackBookingCopy.instructions,
          petNote: asString(petNote?.text, fallbackBookingCopy.petNote),
          successMessage: asString(successMessage?.text, fallbackBookingCopy.successMessage),
        });
      })
      .catch(() => setBookingCopy(fallbackBookingCopy));

    return () => {
      isCurrent = false;
    };
  }, [isBookingTestUnlocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeBookingDraft(window.sessionStorage, form);
  }, [form]);

  useEffect(() => {
    if (!calendarOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bookingSearchRef.current?.contains(target)) return;
      if (calendarPanelRef.current?.contains(target)) return;
      setCalendarOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCalendarOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarOpen]);

  function updateField<K extends keyof BookingForm>(field: K, value: BookingForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function clearDateSelection() {
    setForm((current) => {
      const stayType = getDefaultStayType(settings);
      return {
        ...current,
        check_in: "",
        check_out: "",
        stay_type: stayType,
        room_count: stayType === "villa" ? settings.totalRoomCount : clampRoomCount(current.room_count, settings.totalRoomCount),
      };
    });
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    setSelectionMode("checkIn");
  }

  function handleCalendarFilterChange(nextFilter: BookingCalendarFilter) {
    setCalendarFilter(nextFilter);
    clearDateSelection();
    setCalendarOpen(true);
  }

  function openCalendar(mode: CalendarSelectionMode) {
    const nextMode = mode === "checkOut" && !form.check_in ? "checkIn" : mode;
    setSelectionMode(nextMode);
    setCalendarOpen(true);
    setError("");
    if (nextMode === "checkIn" && form.check_in) {
      setVisibleMonth(monthStart(form.check_in));
      return;
    }
    if (nextMode === "checkOut") {
      setVisibleMonth(monthStart(form.check_out || form.check_in || minDate));
    }
  }

  function selectDate(date: string) {
    setMessage("");
    setError("");
    setSubmittedRequestId("");

    if (!bookingIsOpen || date < minDate || date > maxDate) return;

    setForm((current) => {
      const clickedDay = getCalendarDay(date);
      const currentSaleMode = stayTypeToSaleMode(current.stay_type);
      const selectingCheckout = selectionMode === "checkOut" || Boolean(current.check_in && !current.check_out && date > current.check_in);
      const canUseAsCheckout =
        selectingCheckout &&
        current.check_in &&
        date > current.check_in &&
        getBookingRangeIssue({
          checkIn: current.check_in,
          checkOut: date,
          saleMode: currentSaleMode,
          minDate,
          maxDate,
          getDay: getCalendarDay,
        }) === "ok";
      const filteredOut = isCalendarFilterMismatch(clickedDay, calendarFilter) && !canUseAsCheckout;
      const canUseAsStayNight = isBookableStayNight(clickedDay, minDate, maxDate) && !filteredOut;

      if (selectionMode === "checkOut" && current.check_in) {
        if (!canUseAsCheckout) {
          setError(date <= current.check_in ? "退房日期需晚於入住日期。" : rangeIssueMessage(current.stay_type, "invalid_range"));
          return current;
        }
        const nextForm = { ...current, check_out: date };
        setMessage("");
        setCalendarOpen(false);
        setSelectionMode("checkIn");
        return nextForm;
      }

      if (!canUseAsStayNight && !canUseAsCheckout) return current;

      if (!current.check_in || (current.check_in && current.check_out) || date < current.check_in) {
        const stayType = saleModeToStayType(clickedDay.saleMode) || getDefaultStayType(settings);
        setMessage(`您已選擇${stayType === "villa" ? "包棟" : "單間"}住宿，請選擇退房日期。`);
        setSelectionMode("checkOut");
        setCalendarOpen(true);
        return {
          ...current,
          check_in: date,
          check_out: "",
          stay_type: stayType,
          room_count: stayType === "villa" ? settings.totalRoomCount : clampRoomCount(current.room_count, settings.totalRoomCount),
        };
      }

      if (date === current.check_in) return { ...current, check_out: "" };

      const nextForm = { ...current, check_out: date };
      const rangeIssue = getBookingRangeIssue({
        checkIn: nextForm.check_in,
        checkOut: nextForm.check_out,
        saleMode: currentSaleMode,
        minDate,
        maxDate,
        getDay: getCalendarDay,
      });
      if (rangeIssue !== "ok") {
        setError(rangeIssueMessage(current.stay_type, rangeIssue));
        return { ...current, check_out: "" };
      }
      setMessage("");
      setCalendarOpen(false);
      setSelectionMode("checkIn");
      return nextForm;
    });
  }

  async function handleCheckAvailability() {
    if (!form.check_in || !form.check_out) {
      setError("請先選擇入住與退房日期。");
      return;
    }
    if (selectedRangeIssue !== "ok") {
      setError(rangeIssueMessage(form.stay_type, selectedRangeIssue));
      return;
    }

    setIsChecking(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const result = await checkBookingAvailability(form.check_in, form.check_out);
      if (!result.available) {
        setError("這段日期目前無法預約，請重新選擇日期。");
        return;
      }
      setMessage("");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "房況檢查失敗，請稍後再試。");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedRangeIssue !== "ok") {
      setError(rangeIssueMessage(form.stay_type, selectedRangeIssue));
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const payload: BookingForm = {
        ...form,
        room_count: form.stay_type === "villa" ? settings.totalRoomCount : form.room_count,
        has_pets: false,
        pet_count: 0,
        pet_type: "",
        pet_notes: "",
      };
      const result = await submitBookingRequest(payload, session?.access_token || null);
      setSubmittedRequestId(result.request.id);
      setMessage(bookingCopy.successMessage);
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

  function handleBookingTestUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bookingTestInput.trim() !== bookingTestPassword) {
      setBookingTestError("測試密碼錯誤");
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(bookingTestStorageKey, "true");
    }
    setBookingTestError("");
    setBookingTestInput("");
    setIsBookingTestUnlocked(true);
  }

  function handleExitBookingTest() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(bookingTestStorageKey);
    }
    setBookingTestError("");
    setBookingTestInput("");
    setIsBookingTestUnlocked(false);
  }

  if (!isBookingTestUnlocked) {
    return (
      <div className="min-h-screen bg-[#fbf7f1] text-stone-900">
        <Header />
        <main className="px-4 pb-16 pt-32 md:px-8 md:pt-40">
          <section className="mx-auto max-w-xl rounded-[24px] border border-[#eadfce] bg-white/90 p-6 shadow-sm md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b08d73]">STime Villa Booking</p>
            <h1 className="mt-4 font-serif text-4xl font-light tracking-wide text-stone-900 md:text-5xl">
              線上訂房系統建置中
            </h1>
            <p className="mt-5 text-base leading-8 text-stone-600">
              此功能目前正在測試中，尚未正式開放。
            </p>
            <form className="mt-6 grid gap-4" onSubmit={handleBookingTestUnlock}>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                測試密碼
                <input
                  className={fieldClassName()}
                  type="password"
                  value={bookingTestInput}
                  onChange={(event) => {
                    setBookingTestInput(event.target.value);
                    setBookingTestError("");
                  }}
                />
              </label>
              {bookingTestError && (
                <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {bookingTestError}
                </div>
              )}
              <Button className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]">
                進入測試
              </Button>
            </form>
          </section>
        </main>
        <Footer />
      </div>
    );
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
            if (!date) return <div key={`blank-${month}-${index}`} className="min-h-[58px] md:min-h-[74px]" />;

            const unavailable = unavailableDates.has(date);
            const outOfRange = date < minDate || date > maxDate || !bookingIsOpen;
            const day = getCalendarDay(date);
            const labels = getCalendarDayLabels(day, minDate, maxDate);
            const currentSaleMode = stayTypeToSaleMode(form.stay_type);
            const selectingCheckout = selectionMode === "checkOut" || Boolean(form.check_in && !form.check_out);
            const canUseAsCheckout =
              Boolean(form.check_in && selectingCheckout && date > form.check_in) &&
              getBookingRangeIssue({
                checkIn: form.check_in,
                checkOut: date,
                saleMode: currentSaleMode,
                minDate,
                maxDate,
                getDay: getCalendarDay,
              }) === "ok";
            const isCheckIn = date === form.check_in;
            const isCheckOut = date === form.check_out;
            const inRange = isDateInRange(date, form.check_in, form.check_out);
            const filteredOut = isCalendarFilterMismatch(day, calendarFilter) && !canUseAsCheckout;
            const disabled = outOfRange || filteredOut || (!isBookableStayNight(day, minDate, maxDate) && !canUseAsCheckout);
            const muted = disabled || filteredOut || unavailable || labels.unavailable;

            return (
              <button
                key={date}
                type="button"
                disabled={disabled}
                onClick={() => selectDate(date)}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[10px] border px-1 py-1 text-center text-[10px] leading-tight transition md:min-h-[74px] md:text-xs",
                  muted && "border-stone-100 bg-stone-100 text-stone-400",
                  disabled && "cursor-not-allowed",
                  !disabled && "border-[#eadfce] bg-[#fffdf9] text-stone-700 hover:border-[#b7957c] hover:bg-[#f7f1e9]",
                  unavailable && canUseAsCheckout && "border-[#eadfce] bg-[#fffaf3] text-stone-500",
                  inRange && !disabled && "border-[#b7957c] bg-[#f3eadf] text-[#765d4a]",
                  (isCheckIn || isCheckOut) && "border-[#765d4a] bg-[#8b6f5b] font-semibold text-white hover:bg-[#765d4a]"
                )}
                aria-label={calendarDayAriaLabel(day, minDate, maxDate)}
              >
                <span className="text-sm font-semibold md:text-base">{Number(date.slice(8, 10))}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none md:text-[10px]",
                    day.saleMode === "whole_house" && !muted && "bg-[#8b6f5b] text-white",
                    day.saleMode === "room" && !muted && "bg-[#d4ad72] text-white",
                    muted && "bg-stone-200 text-stone-500",
                    (isCheckIn || isCheckOut) && "bg-white/20 text-white"
                  )}
                >
                  {labels.modeLabel}
                </span>
                {labels.statusLabel && (
                  <span className="max-w-full truncate text-[9px] md:text-[10px]">
                    <span className="hidden md:inline">{labels.statusLabel}</span>
                    <span className="md:hidden">{labels.mobileStatusLabel}</span>
                  </span>
                )}
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
        <div className="mx-auto mb-4 flex max-w-6xl flex-col gap-3 rounded-[12px] border border-[#eadfce] bg-white/80 px-4 py-3 text-sm text-stone-600 shadow-sm md:flex-row md:items-center md:justify-between">
          <span>測試模式｜目前訂房系統尚未正式開放</span>
          <button
            type="button"
            className="self-start text-xs font-medium text-stone-500 underline underline-offset-4 transition hover:text-[#765d4a] md:self-auto"
            onClick={handleExitBookingTest}
          >
            退出測試
          </button>
        </div>
        <section className="mx-auto max-w-6xl">
          <div className="rounded-[24px] border border-[#eadfce] bg-white/90 p-5 shadow-sm md:p-6">
            <h1 className="font-serif text-3xl font-light tracking-wide text-stone-900 md:text-4xl">
              線上預約
            </h1>
            <p className="mt-3 text-base leading-7 text-stone-600">
              選擇入住與退房日期，送出後由我們確認房況。
            </p>
            <div className="mt-3 inline-flex max-w-full items-start gap-2 rounded-[10px] border border-[#ead9bd] bg-[#fff8ea] px-3 py-2 text-sm leading-6 text-stone-700">
              <Gift className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#a47a4f]" />
              <p>
                <span className="font-semibold text-[#765d4a]">官網限定</span>｜完成訂房並入住，每筆訂單贈慢寶精美文創禮 1 份
              </p>
            </div>
          </div>

          {!bookingIsOpen && (
            <div className="mt-6 rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
              目前暫未開放線上預約，歡迎透過官方聯絡方式與我們確認房況。
            </div>
          )}

          <div
            ref={bookingSearchRef}
            className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-3 shadow-sm md:p-4"
          >
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_0.85fr]">
              <button
                type="button"
                className={cn(
                  "rounded-[14px] border px-4 py-3 text-left transition hover:border-[#b7957c] hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-[#eadfce]",
                  calendarOpen && selectionMode === "checkIn"
                    ? "border-[#8b6f5b] bg-[#fff8ea]"
                    : "border-[#eadfce] bg-[#fffdf9]"
                )}
                onClick={() => openCalendar("checkIn")}
                aria-expanded={calendarOpen && selectionMode === "checkIn"}
              >
                <span className="block text-xs font-medium text-stone-500">入住</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">
                  {formatSearchDate(form.check_in)}
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-[14px] border px-4 py-3 text-left transition hover:border-[#b7957c] hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-[#eadfce]",
                  calendarOpen && selectionMode === "checkOut"
                    ? "border-[#8b6f5b] bg-[#fff8ea]"
                    : "border-[#eadfce] bg-[#fffdf9]"
                )}
                onClick={() => openCalendar("checkOut")}
                aria-expanded={calendarOpen && selectionMode === "checkOut"}
              >
                <span className="block text-xs font-medium text-stone-500">退房</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">
                  {formatSearchDate(form.check_out)}
                </span>
              </button>
              <div className="rounded-[14px] border border-[#eadfce] bg-[#fffdf9] px-4 py-3">
                <span className="block text-xs font-medium text-stone-500">入住人數</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">{guestCount} 位</span>
              </div>
            </div>
            {isCalendarLoading && <p className="mt-3 text-sm text-stone-500">房況載入中...</p>}
          </div>

          {calendarOpen && (
            <section
              ref={calendarPanelRef}
              className="mt-3 rounded-[20px] border border-[#eadfce] bg-white p-4 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">
                    {selectionMode === "checkOut" ? "選擇退房日期" : "選擇入住日期"}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    可預約日期從今天開始，最多可選到 {formatDate(maxDate)}。
                  </p>
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

              <div className="mt-4 rounded-[14px] bg-[#fbf7f1] px-3 py-2.5 md:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-1 text-sm font-medium text-stone-700">查看日期：</p>
                  <div className="grid flex-1 grid-cols-3 gap-2 sm:flex sm:flex-none sm:items-center">
                    {calendarFilters.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => handleCalendarFilterChange(filter.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition md:px-4",
                          calendarFilter === filter.value
                            ? "border-[#8b6f5b] bg-[#8b6f5b] text-white"
                            : "border-[#d7c5b2] bg-white text-stone-600 hover:bg-[#f7f1e9]"
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-stone-500 md:text-xs">
                  包棟：整棟住宿空間一起預訂。單間：可依需求選擇個別客房。
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {renderMonth(visibleMonth)}
                {renderMonth(addMonths(visibleMonth, 1), true)}
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-[12px] bg-[#fbf7f1] p-4 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-stone-800">
                    {form.check_in ? selectedStayTitle(form.stay_type) : "請選擇入住日期"}
                  </p>
                  {form.check_in ? (
                    <div className="mt-2 grid gap-1 leading-6">
                      <p>
                        {formatBookingSummaryDate(form.check_in)}入住
                        {form.check_out ? `－${formatBookingSummaryDate(form.check_out, false)}退房` : "－請選擇退房日期"}
                      </p>
                      <p>{form.check_out ? `共 ${nightCount} 晚` : "尚未完成日期選擇"}</p>
                    </div>
                  ) : (
                    <p className="mt-1">請選擇可預約的入住與退房日期。</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:items-center">
                  {form.check_in && (
                    <button
                      type="button"
                      className="rounded-[8px] border border-[#d7c5b2] px-4 py-2 text-xs font-medium text-stone-600 transition hover:bg-white hover:text-[#765d4a]"
                      onClick={clearDateSelection}
                    >
                      重新選擇日期
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#8b6f5b]" />包棟</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#d4ad72]" />單間</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-stone-100" />不可預約</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#8b6f5b]" />已選日期</span>
              </div>

              {message && <div className="mt-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">{message}</div>}
              {error && <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
            </section>
          )}

          {!calendarOpen && (message || error) && (
            <div
              className={cn(
                "mt-4 rounded-[8px] border px-4 py-3 text-sm leading-6",
                error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {error || message}
            </div>
          )}

          {canShowStayOptions && (
            <section className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">入住人數</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">請填寫本次入住人數。</p>
                </div>
                <Users className="h-6 w-6 text-[#8b6f5b]" />
              </div>

              <div className="mt-4 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-4 py-3 text-sm leading-6 text-stone-600">
                <p>
                  <span className="font-medium text-[#765d4a]">住宿方式</span>｜{stayTypeDisplay(form.stay_type)}
                </p>
                {form.stay_type === "villa" && <p className="text-xs text-stone-500">一天僅接待一組旅客</p>}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Stepper label="成人" value={form.adults} min={1} max={30} onChange={(value) => updateField("adults", value)} />
                <Stepper label="孩童" value={form.children} min={0} max={30} onChange={(value) => updateField("children", value)} />
              </div>

              <div className="mt-4 rounded-[12px] bg-[#f7f1e9] px-4 py-3 text-sm font-medium text-[#765d4a]">
                {guestSummary}
              </div>
            </section>
          )}

          {canShowContactForm && (
            <form className="mt-6 rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm md:p-6" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">聯絡資料</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">送出後，我們將與您確認房況及訂房細節。</p>
                </div>
                {contactDetailsComplete && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
              </div>

              <div className="mt-4 grid gap-4">
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
                    placeholder="可以告訴我們抵達時間、同行需求，或其他希望先討論的事項。"
                  />
                </label>

                <div className="rounded-[8px] bg-[#f7f1e9] px-4 py-3 text-sm leading-6 text-stone-600">
                  此步驟不需付款，送出後我們會與您確認房況及訂房細節。
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
