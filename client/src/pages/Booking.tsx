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
  MAX_BOOKING_ADULTS,
  MAX_BOOKING_CHILDREN,
  type PublicBookingSettings,
} from "@/lib/bookings/bookingConstants";
import {
  bookingGuestRules,
  formatRoomOptionLabel,
  resolveBookingGuestPlan,
  resolveBookingPetPlan,
} from "@/lib/bookings/bookingGuestRules.js";
import {
  BookingApiError,
  checkBookingAvailability,
  fetchBookingCalendar,
  fetchBookingQuote,
  recoverBookingRequest,
  submitBookingRequest,
  type BookingCalendarResult,
  type BookingPackageType,
  type BookingRoomOption,
  type BookingPricingBreakdownNight,
  type BookingPriceQuoteResult,
  type BookingRequestPayload,
  type BookingSubmitResult,
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
import {
  createDefaultBookingDateRange,
  MIN_BOOKING_DATE_LABEL,
  MIN_BOOKING_MONTH_DAY_LABEL,
  resolveBookingDraftDateRange,
  resolveEarliestBookingDate,
} from "@/lib/bookings/bookingDateRules";
import { cn } from "@/lib/utils";
import { asArray, asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type BookingForm = BookingDraftForm;
type CalendarSelectionMode = "checkIn" | "checkOut";
type BookingStep = 1 | 2 | 3 | 4;

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
  infants: 0,
  selected_room_option_id: "",
  room_count: DEFAULT_BOOKING_SETTINGS.totalRoomCount,
  has_pets: false,
  pet_count: 0,
  pet_type: "",
  pet_notes: "",
  dog_under_10kg_count: 0,
  dog_10_to_20kg_count: 0,
  dog_over_20kg_count: 0,
  notes: "",
};

function createDefaultBookingForm(today = todayText()): BookingForm {
  const defaultDates = createDefaultBookingDateRange(today);
  return {
    ...emptyForm,
    ...defaultDates,
  };
}

const bookingTestPassword = "123";
const bookingTestStorageKey = "mumbao_booking_test_unlocked_v1";
const bookingRecoveryStorageKey = "mumbao_booking_hold_recovery_v1";
const calendarFilters: Array<{ value: BookingCalendarFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "whole_house", label: "只看包棟" },
  { value: "room", label: "只看單間" },
];

const bookingGalleryImages = [
  { src: "/images/Main/STime.JPG", alt: "慢慢蒔光住宿空間外觀" },
  { src: "/images/aboutMe/aboutMe-2.jpg", alt: "慢慢蒔光室內公共空間" },
  { src: "/images/Room/S521.jpg", alt: "慢慢蒔光主題住宿空間" },
  { src: "/images/Room/S360.jpg", alt: "慢慢蒔光主題客房空間" },
  { src: "/images/Room/S530.jpg", alt: "慢慢蒔光療癒住宿空間" },
  { src: "/images/Room/S888.jpg", alt: "慢慢蒔光藝術住宿空間" },
];

const bookingAmenityLabels = ["客廳", "餐廳", "歡唱設備", "麻將房", "星空露臺", "戶外烤肉區"];
const bookingSteps: Array<{ step: BookingStep; label: string }> = [
  { step: 1, label: "住宿選擇" },
  { step: 2, label: "加購商品" },
  { step: 3, label: "訂房資料" },
  { step: 4, label: "完成送出" },
];
const breakfastAddon = {
  name: "成人早餐",
  unitPrice: 250,
  image: "/images/Main/breakfaset.JPG",
  note: "於早餐日 08:30 送達。",
};

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
function fieldClassName() {
  return "h-12 w-full max-w-full min-w-0 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 w-full max-w-full min-w-0 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function splitGuestName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { lastName: "", firstName: "" };
  if (trimmed.includes(" ")) {
    const [lastName, ...rest] = trimmed.split(/\s+/);
    return { lastName, firstName: rest.join(" ") };
  }
  return { lastName: trimmed.slice(0, 1), firstName: trimmed.slice(1) };
}

function combineGuestName(lastName: string, firstName: string) {
  return `${lastName.trim()}${firstName.trim()}`;
}

function maskEmail(email: string) {
  const trimmed = email.trim();
  const [name, domain] = trimmed.split("@");
  if (!name || !domain) return trimmed ? "******" : "-";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string) {
  const compact = phone.replace(/\s+/g, "");
  if (!compact) return "-";
  if (compact.length <= 4) return `${compact.slice(0, 1)}***`;
  return `${compact.slice(0, 2)}${"*".repeat(Math.max(compact.length - 4, 3))}${compact.slice(-2)}`;
}

type BookingRecoverySession = {
  recoveryToken: string;
  result: BookingSubmitResult;
};

function readBookingRecoverySession(): BookingRecoverySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(bookingRecoveryStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingRecoverySession>;
    if (
      typeof parsed.recoveryToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(parsed.recoveryToken) ||
      !parsed.result?.request?.id ||
      !parsed.result?.pricing
    ) {
      return null;
    }
    return parsed as BookingRecoverySession;
  } catch {
    return null;
  }
}

function writeBookingRecoverySession(recoveryToken: string, result: BookingSubmitResult) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    bookingRecoveryStorageKey,
    JSON.stringify({
      recoveryToken,
      result: { ...result, recoveryToken: undefined },
    } satisfies BookingRecoverySession)
  );
}

function clearBookingRecoverySession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(bookingRecoveryStorageKey);
}

function bookingHoldConflictMessage(retryAfterSeconds: number | null) {
  const approximateMinutes = Number.isInteger(retryAfterSeconds)
    ? Math.max(1, Math.ceil((retryAfterSeconds || 0) / 60))
    : 15;
  return `此日期目前正由其他旅客暫時保留中。對方約有 ${approximateMinutes} 分鐘完成付款。若未在期限內完成，系統將自動重新開放此日期。請稍後再確認房況。`;
}

function buildBookingRequestNotes(notes: string, infants: number) {
  const trimmedNotes = notes.trim();
  const infantNote = infants > 0 ? `嬰幼兒：${infants} 位` : "";
  return [trimmedNotes, infantNote].filter(Boolean).join("\n");
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

function formatCompactDate(dateText: string) {
  if (!dateText) return "-";
  const date = parseDate(dateText);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}/${day}`;
}

function formatTwd(amount: number | null | undefined) {
  if (!Number.isFinite(Number(amount))) return "—";
  return `TWD ${Number(amount).toLocaleString("zh-TW")}`;
}

function formatDiscountRateLabel(rate: number | null | undefined) {
  const percentage = Number(rate) * 100;
  if (!Number.isFinite(percentage) || percentage <= 0) return "95 折";
  return `${Math.round(percentage)} 折`;
}

function renderFeeBreakdownRow(
  label: string,
  amount: number | null | undefined,
  options: { emphasized?: boolean } = {}
) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
      <span className={cn("min-w-0 text-stone-500", options.emphasized && "font-semibold text-stone-800")}>
        {label}
      </span>
      <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(amount)}</span>
    </div>
  );
}

function formatRoomOptionRoomCount(roomOption: BookingRoomOption | null | undefined) {
  if (!roomOption) return "";
  return `共 ${roomOption.roomCount} 間房`;
}

function formatDayTypeSummary(dayType: BookingPricingBreakdownNight["dayType"], fallbackLabel: string) {
  if (dayType === "weekday") return "平日（日～四）";
  if (dayType === "friday") return "週五";
  if (dayType === "holiday") return "週六／假日";
  return fallbackLabel;
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
  const dogCount = settings.allowPets
    ? form.dog_under_10kg_count + form.dog_10_to_20kg_count + form.dog_over_20kg_count
    : 0;

  return {
    ...form,
    stay_type: stayType,
    room_count: stayType === "villa" ? settings.totalRoomCount : clampRoomCount(form.room_count, settings.totalRoomCount),
    has_pets: dogCount > 0,
    pet_count: dogCount,
    pet_type: dogCount > 0 ? "dog" : "",
    pet_notes: settings.allowPets ? form.pet_notes : "",
    dog_under_10kg_count: settings.allowPets ? form.dog_under_10kg_count : 0,
    dog_10_to_20kg_count: settings.allowPets ? form.dog_10_to_20kg_count : 0,
    dog_over_20kg_count: settings.allowPets ? form.dog_over_20kg_count : 0,
  };
}

function normalizePricingGuestLimit(form: BookingForm): BookingForm {
  const adults = Math.min(Math.max(form.adults || 1, 1), MAX_BOOKING_ADULTS);
  const children = Math.min(Math.max(form.children || 0, 0), MAX_BOOKING_CHILDREN);
  const infants = Math.max(form.infants || 0, 0);
  const dogUnder10kgCount = Math.max(form.dog_under_10kg_count || 0, 0);
  const dog10To20kgCount = Math.max(form.dog_10_to_20kg_count || 0, 0);
  const dogOver20kgCount = Math.max(form.dog_over_20kg_count || 0, 0);
  const dogCount = dogUnder10kgCount + dog10To20kgCount + dogOver20kgCount;
  if (
    adults === form.adults &&
    children === form.children &&
    infants === form.infants &&
    dogUnder10kgCount === form.dog_under_10kg_count &&
    dog10To20kgCount === form.dog_10_to_20kg_count &&
    dogOver20kgCount === form.dog_over_20kg_count &&
    dogCount === form.pet_count &&
    (dogCount > 0) === form.has_pets &&
    (dogCount > 0 ? "dog" : "") === form.pet_type
  ) {
    return form;
  }
  return {
    ...form,
    adults,
    children,
    infants,
    has_pets: dogCount > 0,
    pet_count: dogCount,
    pet_type: dogCount > 0 ? "dog" : "",
    dog_under_10kg_count: dogUnder10kgCount,
    dog_10_to_20kg_count: dog10To20kgCount,
    dog_over_20kg_count: dogOver20kgCount,
  };
}

function getInitialBookingForm() {
  const today = todayText();
  const minDate = resolveEarliestBookingDate(today);
  const fallback = createDefaultBookingForm(today);
  if (typeof window === "undefined") return fallback;
  const draft = readBookingDraft(window.sessionStorage, fallback);
  const resolved = resolveBookingDraftDateRange(draft, fallback, minDate);
  return normalizePricingGuestLimit(resolved.draft);
}

function saleModeLabel(saleMode: BookingSaleMode) {
  if (saleMode === "whole_house") return "包棟";
  if (saleMode === "room") return "單間";
  return "未開放";
}

function selectedStayTitle(stayType: StayType) {
  return stayType === "villa" ? "已選擇包棟住宿" : "已選擇單間住宿";
}

function getGuestLimitUnavailableReason(guestPlan: ReturnType<typeof resolveBookingGuestPlan>) {
  if (!guestPlan.isAdultCountSupported) {
    return "成人最多 20 位。";
  }
  if (!guestPlan.isChildCountSupported) {
    return "孩童最多 9 位。";
  }
  return "";
}

function getAutomaticPackageType(guestPlan: ReturnType<typeof resolveBookingGuestPlan>): BookingPackageType {
  return guestPlan.adultCount >= bookingGuestRules.fullVillaAdultCount ? "villa_18" : "villa_10";
}

function formatStayBedSummary(
  doubleBedCount: number | null | undefined,
  singleBedCount: number | null | undefined,
  sleepCapacity: number | null | undefined
) {
  const bedParts = [
    doubleBedCount ? `${doubleBedCount} 張雙人床` : "",
    singleBedCount ? `${singleBedCount} 張單人加床` : "",
  ].filter(Boolean);
  if (!bedParts.length || !sleepCapacity) return "";
  return `${bedParts.join("＋")}｜可睡 ${sleepCapacity} 人`;
}

function getQuoteUnavailableMessage(reason?: string) {
  if (reason === "guest_count_requires_full_villa") {
    return "18 位以上入住請選擇 18 人包棟方案。";
  }
  if (reason === "full_villa_requires_18_guests") {
    return "18 人包棟適用於 18 位成人入住。";
  }
  if (reason === "adult_count_exceeds_capacity") {
    return "成人最多 20 位。";
  }
  if (reason === "child_count_exceeds_capacity") {
    return "孩童最多 9 位。";
  }
  if (reason === "unsupported_guest_count") {
    return "目前無法支援此入住人數。";
  }
  if (reason === "invalid_room_option" || reason === "missing_room_options") {
    return "目前房型組合已不適用，請重新選擇房型組合。";
  }
  return "目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。";
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

export default function Booking() {
  const { session } = useCustomerAuth();
  const initialBookingRecovery = useMemo(() => readBookingRecoverySession(), []);
  const [form, setForm] = useState<BookingForm>(() => getInitialBookingForm());
  const [guestNameParts, setGuestNameParts] = useState(() => splitGuestName(form.guest_name));
  const [nationality, setNationality] = useState("台灣");
  const [settings, setSettings] = useState<PublicBookingSettings>(() => ({ ...DEFAULT_BOOKING_SETTINGS }));
  const [bookingCopy, setBookingCopy] = useState<BookingCmsCopy>(fallbackBookingCopy);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(resolveEarliestBookingDate(todayText())));
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [calendarDaySources, setCalendarDaySources] = useState<NonNullable<BookingCalendarResult["days"]>>([]);
  const [calendarFilter, setCalendarFilter] = useState<BookingCalendarFilter>("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [otherNeedsOpen, setOtherNeedsOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>(() => initialBookingRecovery ? 4 : 1);
  const [breakfastAddonsByDate, setBreakfastAddonsByDate] = useState<Record<string, number>>({});
  const [hasAgreedBookingTerms, setHasAgreedBookingTerms] = useState(false);
  const [dailyPriceDetailsOpen, setDailyPriceDetailsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<CalendarSelectionMode>("checkIn");
  const [hoverPreviewDate, setHoverPreviewDate] = useState("");
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(0);
  const [maxDate, setMaxDate] = useState(() => addMonthsToDate(todayText(), DEFAULT_BOOKING_SETTINGS.bookingWindowMonths));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [priceQuote, setPriceQuote] = useState<BookingPriceQuoteResult | null>(null);
  const [priceQuoteError, setPriceQuoteError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState(() => initialBookingRecovery?.result.request.id || "");
  const [submittedBookingSummary, setSubmittedBookingSummary] = useState<BookingSubmitResult | null>(
    () => initialBookingRecovery?.result || null
  );
  const [isBookingTestUnlocked, setIsBookingTestUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(bookingTestStorageKey) === "true";
  });
  const [bookingTestInput, setBookingTestInput] = useState("");
  const [bookingTestError, setBookingTestError] = useState("");
  const bookingFlowRef = useRef<HTMLDivElement | null>(null);
  const bookingSearchRef = useRef<HTMLDivElement | null>(null);
  const calendarPanelRef = useRef<HTMLElement | null>(null);
  const peoplePanelRef = useRef<HTMLElement | null>(null);

  const minDate = resolveEarliestBookingDate(todayText());
  const maxMonth = monthStart(maxDate);
  const earliestVisibleMonth = addMonths(monthStart(minDate), -1);
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
    () => Boolean(!isCalendarLoading && bookingIsOpen && form.check_in && form.check_out && selectedRangeIssue === "ok"),
    [bookingIsOpen, form.check_in, form.check_out, isCalendarLoading, selectedRangeIssue]
  );
  const nightCount = nightsBetween(form.check_in, form.check_out);
  const breakfastDates = useMemo(
    () => Array.from({ length: nightCount }, (_, index) => addDays(form.check_in, index + 1)),
    [form.check_in, nightCount]
  );
  const breakfastDateSet = useMemo(() => new Set(breakfastDates), [breakfastDates]);
  const breakfastAddonEntries = useMemo(
    () =>
      breakfastDates
        .map((date) => ({ date, quantity: breakfastAddonsByDate[date] || 0 }))
        .filter((item) => item.quantity > 0),
    [breakfastAddonsByDate, breakfastDates]
  );
  const guestSummaryDogCount = form.dog_under_10kg_count + form.dog_10_to_20kg_count + form.dog_over_20kg_count;
  const guestSummary = [
    `${form.adults} 位成人`,
    form.children > 0 ? `${form.children} 位孩童` : null,
    form.infants > 0 ? `${form.infants} 位嬰幼兒` : null,
    guestSummaryDogCount > 0 ? `狗狗 ${guestSummaryDogCount} 隻` : null,
  ].filter(Boolean).join("｜");
  const canRenderStepOneStayContent = bookingIsOpen && Boolean(form.check_in && form.check_out) && !submittedRequestId;
  const canShowStayOptions =
    bookingIsOpen && Boolean(form.check_in && form.check_out) && selectedRangeIssue === "ok" && !submittedRequestId;
  const guestPlan = useMemo(
    () => resolveBookingGuestPlan({ adults: form.adults, children: form.children, infants: form.infants, nights: nightCount }),
    [form.adults, form.children, form.infants, nightCount]
  );
  const petPlan = useMemo(
    () =>
      resolveBookingPetPlan({
        dogUnder10kgCount: form.dog_under_10kg_count,
        dog10To20kgCount: form.dog_10_to_20kg_count,
        dogOver20kgCount: form.dog_over_20kg_count,
        nights: nightCount,
      }),
    [form.dog_10_to_20kg_count, form.dog_over_20kg_count, form.dog_under_10kg_count, nightCount]
  );
  const automaticPackageType = getAutomaticPackageType(guestPlan);
  const roomOptions = guestPlan.roomOptions || [];
  const roomOptionIdsSignature = roomOptions.map((option) => option.id).join("|");
  const defaultRoomOptionId = guestPlan.defaultRoomOptionId || "";
  const selectedRoomOptionId = roomOptions.some((option) => option.id === form.selected_room_option_id)
    ? form.selected_room_option_id
    : defaultRoomOptionId;
  const selectedRoomOption = roomOptions.find((option) => option.id === selectedRoomOptionId) || guestPlan.defaultRoomOption || null;
  const showCompleteRoomConfiguration =
    guestPlan.roomPlanHeadcount != null && guestPlan.roomPlanHeadcount >= 17 && guestPlan.roomPlanHeadcount <= 20;
  const pricingDisplayGuestCount = form.adults + form.children;
  const searchGuestSummary = form.infants > 0 ? `${pricingDisplayGuestCount} 位・另有 ${form.infants} 位嬰幼兒` : `${pricingDisplayGuestCount} 位`;
  const guestLimitUnavailableReason = getGuestLimitUnavailableReason(guestPlan);
  const capacityUnavailableReason = guestLimitUnavailableReason;
  const canShowOrderSummary = canShowStayOptions && !capacityUnavailableReason;
  const guestCountExceedsLimit = !guestPlan.isAdultCountSupported || !guestPlan.isChildCountSupported;
  const adultIncrementDisabled = form.adults >= MAX_BOOKING_ADULTS;
  const childIncrementDisabled = form.children >= MAX_BOOKING_CHILDREN;
  const infantIncrementDisabled = false;
  const quoteReady = priceQuote?.pricing.status === "resolved";
  const quoteTotal = quoteReady ? priceQuote?.pricing.total ?? null : null;
  const quoteNights = priceQuote?.pricing.breakdown || [];
  const quoteDepositRatePercent =
    quoteReady && priceQuote?.pricing.depositRate != null ? Math.round(priceQuote.pricing.depositRate * 100) : null;
  const quoteBalanceRatePercent = quoteDepositRatePercent == null ? null : 100 - quoteDepositRatePercent;
  const quoteChargeableChildCount = quoteReady ? priceQuote?.pricing.chargeableChildCount || 0 : 0;
  const quoteChildFeeUnitPrice = quoteReady ? priceQuote?.pricing.childFeeUnitPrice || bookingGuestRules.childFeeUnitPrice : bookingGuestRules.childFeeUnitPrice;
  const quoteChildFeeTotal = quoteReady ? priceQuote?.pricing.childFeeTotal || 0 : 0;
  const quoteChildFeeOriginalNightly = quoteReady ? priceQuote?.pricing.nightlyChildFeeOriginalAmount || 0 : 0;
  const quoteChildDiscountedNightCount = quoteReady && nightCount > 1 ? nightCount - 1 : 0;
  const quoteChildFirstNightAmount = quoteReady ? quoteNights[0]?.childFeeAmount ?? quoteChildFeeOriginalNightly : null;
  const quoteChildContinuationTotal = quoteReady
    ? quoteNights.slice(1).reduce((total, night) => total + (night.childFeeAmount || 0), 0)
    : null;
  const quoteChildDiscountLabel = quoteReady ? formatDiscountRateLabel(priceQuote?.pricing.childFeeDiscountRate) : "95 折";
  const quoteChildFeeSummary = [
    `${quoteChargeableChildCount} 位 × ${formatTwd(quoteChildFeeUnitPrice)}`,
    `首晚 ${formatTwd(quoteChildFirstNightAmount)}`,
    quoteChildDiscountedNightCount > 0
      ? `續住 ${quoteChildDiscountedNightCount} 晚 ${quoteChildDiscountLabel} ${formatTwd(quoteChildContinuationTotal)}`
      : null,
  ].filter(Boolean).join("｜");
  const quotePetFeeBreakdown = quoteReady ? priceQuote?.pricing.petFeeBreakdown || [] : [];
  const quotePetFeeTotal = quoteReady ? priceQuote?.pricing.petFeeTotal || 0 : 0;
  const quotePetDiscountLabel = quoteReady ? formatDiscountRateLabel(priceQuote?.pricing.petFeeDiscountRate) : "95 折";
  const quotePetDepositAmount = quoteReady ? priceQuote?.pricing.petDepositAmount || 0 : 0;
  const quoteDogCount = quoteReady ? priceQuote?.pricing.dogCount || 0 : petPlan.dogCount;
  const quoteBreakfastAddonEntries = quoteReady ? priceQuote?.pricing.breakfastAddonEntries || [] : [];
  const quoteBreakfastAddonQuantity = quoteReady ? priceQuote?.pricing.breakfastAddonQuantity || 0 : 0;
  const quoteBreakfastAddonTotal = quoteReady ? priceQuote?.pricing.breakfastAddonTotal || 0 : 0;
  const quoteLodgingSubtotal = quoteReady
    ? priceQuote?.pricing.lodgingSubtotal ?? Math.max((quoteTotal || 0) - quoteBreakfastAddonTotal, 0)
    : null;
  const displayDoubleBedCount = quoteReady ? priceQuote?.pricing.doubleBedCount : guestPlan.doubleBedCount;
  const displaySingleBedCount = quoteReady ? priceQuote?.pricing.singleBedCount ?? guestPlan.singleBedCount : guestPlan.singleBedCount;
  const displaySleepCapacity = quoteReady ? priceQuote?.pricing.sleepCapacity : guestPlan.sleepCapacity;
  const stayBedSummary = formatStayBedSummary(displayDoubleBedCount, displaySingleBedCount, displaySleepCapacity);
  const canProceedToContact = canShowOrderSummary && !guestCountExceedsLimit && quoteReady && !isQuoteLoading && !priceQuoteError;
  const breakfastAddonQuantity = quoteReady
    ? quoteBreakfastAddonQuantity
    : breakfastAddonEntries.reduce((total, item) => total + item.quantity, 0);
  const breakfastAddonTotal = quoteReady ? quoteBreakfastAddonTotal : 0;
  const compactLodgingTotal = quoteReady ? Math.max((quoteLodgingSubtotal || 0) - quoteChildFeeTotal - quotePetFeeTotal, 0) : null;
  const displayTotal = quoteReady ? quoteTotal : null;
  const displayDepositAmount = quoteReady ? priceQuote?.pricing.depositAmount ?? null : null;
  const displayBalanceAmount = quoteReady ? priceQuote?.pricing.balanceAmount ?? null : null;
  const submittedPricing = submittedBookingSummary?.pricing || null;
  const submittedPricingBreakdown = submittedPricing?.pricingBreakdown || null;
  const submittedRequest = submittedBookingSummary?.request || null;
  const submittedSummary = submittedBookingSummary?.summary || null;
  const submittedNightCount = submittedRequest ? nightsBetween(submittedRequest.check_in, submittedRequest.check_out) : nightCount;
  const submittedDogCount =
    submittedSummary?.dogCount ??
    ((submittedSummary?.dogUnder10kgCount || 0) +
      (submittedSummary?.dog10To20kgCount || 0) +
      (submittedSummary?.dogOver20kgCount || 0));
  const submittedGuestSummary = submittedBookingSummary
    ? [
        `${submittedSummary?.adultCount ?? form.adults} 位成人`,
        (submittedSummary?.childCount ?? form.children) > 0 ? `${submittedSummary?.childCount ?? form.children} 位孩童` : null,
        (submittedSummary?.infantCount ?? form.infants) > 0 ? `${submittedSummary?.infantCount ?? form.infants} 位嬰幼兒` : null,
        submittedDogCount > 0 ? `狗狗 ${submittedDogCount} 隻` : null,
      ].filter(Boolean).join("｜")
    : guestSummary;
  const submittedStayBedSummary =
    formatStayBedSummary(
      submittedPricingBreakdown?.doubleBedCount,
      submittedPricingBreakdown?.singleBedCount,
      submittedPricingBreakdown?.sleepCapacity
    ) || stayBedSummary;
  const submittedBreakfastAddonQuantity = submittedPricingBreakdown?.breakfastAddonQuantity || 0;
  const submittedBreakfastAddonTotal = submittedPricingBreakdown?.breakfastAddonTotal || 0;
  const submittedTotal = submittedPricing?.quotedTotal ?? submittedPricingBreakdown?.total ?? null;
  const submittedLodgingSubtotal =
    submittedPricingBreakdown?.lodgingSubtotal ?? (submittedTotal == null ? null : Math.max(submittedTotal - submittedBreakfastAddonTotal, 0));
  const submittedDepositRatePercent =
    submittedPricing?.depositRate != null ? Math.round(Number(submittedPricing.depositRate) * 100) : quoteDepositRatePercent;
  const submittedDepositAmount = submittedPricing?.depositAmount ?? submittedPricingBreakdown?.depositAmount ?? null;
  const submittedBalanceAmount = submittedPricing?.balanceAmount ?? submittedPricingBreakdown?.balanceAmount ?? null;
  const activeGalleryImage = bookingGalleryImages[selectedGalleryIndex] || bookingGalleryImages[0];

  useEffect(() => {
    if (!initialBookingRecovery) return;

    let isCurrent = true;
    recoverBookingRequest(initialBookingRecovery.recoveryToken)
      .then((result) => {
        if (!isCurrent) return;
        setSubmittedRequestId(result.request.id);
        setSubmittedBookingSummary(result);
        setBookingStep(4);
        writeBookingRecoverySession(initialBookingRecovery.recoveryToken, result);
      })
      .catch((recoveryError) => {
        if (!isCurrent) return;
        if (
          recoveryError instanceof BookingApiError &&
          (recoveryError.code === "booking_recovery_unavailable" || recoveryError.code === "invalid_booking_recovery_token")
        ) {
          clearBookingRecoverySession();
          setSubmittedRequestId("");
          setSubmittedBookingSummary(null);
          setBookingStep(1);
          setError(recoveryError.message);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [initialBookingRecovery]);

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
        setForm((current) => normalizePricingGuestLimit(reconcileFormWithSettings(current, data.settings)));
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
    setBreakfastAddonsByDate((current) => {
      const nextEntries = Object.entries(current).filter(([date, quantity]) => breakfastDateSet.has(date) && quantity > 0);
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
  }, [breakfastDateSet]);

  useEffect(() => {
    if (form.selected_room_option_id === selectedRoomOptionId) return;
    setForm((current) =>
      current.selected_room_option_id === selectedRoomOptionId
        ? current
        : {
            ...current,
            selected_room_option_id: selectedRoomOptionId,
          }
    );
  }, [form.selected_room_option_id, roomOptionIdsSignature, selectedRoomOptionId]);

  useEffect(() => {
    setDailyPriceDetailsOpen(false);
  }, [
    form.adults,
    form.check_in,
    form.check_out,
    form.children,
    form.dog_10_to_20kg_count,
    form.dog_over_20kg_count,
    form.dog_under_10kg_count,
    form.infants,
    selectedRoomOptionId,
  ]);

  useEffect(() => {
    if (!canShowOrderSummary) {
      setIsQuoteLoading(false);
      setPriceQuote(null);
      setPriceQuoteError("");
      return;
    }
    if (guestCountExceedsLimit) {
      setIsQuoteLoading(false);
      setPriceQuote(null);
      setPriceQuoteError(capacityUnavailableReason || "目前無法支援此入住人數。");
      return;
    }

    const controller = new AbortController();
    setIsQuoteLoading(true);
    setPriceQuote(null);
    setPriceQuoteError("");

    fetchBookingQuote({
      checkIn: form.check_in,
      checkOut: form.check_out,
      stayType: form.stay_type,
      packageType: automaticPackageType,
      adults: form.adults,
      children: form.children,
      infants: form.infants,
      dogUnder10kgCount: form.dog_under_10kg_count,
      dog10To20kgCount: form.dog_10_to_20kg_count,
      dogOver20kgCount: form.dog_over_20kg_count,
      breakfastAddons: breakfastAddonEntries,
      selectedRoomOptionId,
      roomCount: form.stay_type === "villa" ? settings.totalRoomCount : form.room_count,
    })
      .then((quote) => {
        if (controller.signal.aborted) return;
        setPriceQuote(quote);
        if (quote.pricing.status !== "resolved") {
          setPriceQuoteError(getQuoteUnavailableMessage(quote.pricing.reason));
          return;
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPriceQuote(null);
          setPriceQuoteError("目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsQuoteLoading(false);
      });

    return () => controller.abort();
  }, [
    canShowOrderSummary,
    form.adults,
    form.check_in,
    form.check_out,
    form.children,
    form.dog_10_to_20kg_count,
    form.dog_over_20kg_count,
    form.dog_under_10kg_count,
    form.infants,
    form.room_count,
    form.stay_type,
    automaticPackageType,
    breakfastAddonEntries,
    capacityUnavailableReason,
    guestCountExceedsLimit,
    selectedRoomOptionId,
    settings.totalRoomCount,
  ]);

  useEffect(() => {
    if (!calendarOpen && !peopleOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bookingSearchRef.current?.contains(target)) return;
      if (calendarPanelRef.current?.contains(target)) return;
      if (peoplePanelRef.current?.contains(target)) return;
      setCalendarOpen(false);
      setPeopleOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCalendarOpen(false);
        setPeopleOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarOpen, peopleOpen]);

  function updateField<K extends keyof BookingForm>(field: K, value: BookingForm[K]) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      return field === "adults" ||
        field === "children" ||
        field === "infants" ||
        field === "dog_under_10kg_count" ||
        field === "dog_10_to_20kg_count" ||
        field === "dog_over_20kg_count"
        ? normalizePricingGuestLimit(next)
        : next;
    });
    setMessage("");
    setError("");
  }

  function updateGuestNamePart(field: keyof typeof guestNameParts, value: string) {
    const next = { ...guestNameParts, [field]: value };
    setGuestNameParts(next);
    updateField("guest_name", combineGuestName(next.lastName, next.firstName));
  }

  function updateDogCount(
    field: "dog_under_10kg_count" | "dog_10_to_20kg_count" | "dog_over_20kg_count",
    nextCount: number
  ) {
    setForm((current) =>
      normalizePricingGuestLimit({
        ...current,
        [field]: nextCount,
      })
    );
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
    setSubmittedBookingSummary(null);
    setSelectionMode("checkIn");
    setBookingStep(1);
  }

  function handleCalendarFilterChange(nextFilter: BookingCalendarFilter) {
    setCalendarFilter(nextFilter);
    clearDateSelection();
    setHoverPreviewDate("");
    setCalendarOpen(true);
  }

  function openCalendar(mode: CalendarSelectionMode) {
    const nextMode = mode === "checkOut" && !form.check_in ? "checkIn" : mode;
    setSelectionMode(nextMode);
    setCalendarOpen(true);
    setPeopleOpen(false);
    setHoverPreviewDate("");
    setError("");
    if (nextMode === "checkIn" && form.check_in) {
      setVisibleMonth(monthStart(form.check_in));
      return;
    }
    if (nextMode === "checkOut") {
      setVisibleMonth(monthStart(form.check_out || form.check_in || minDate));
    }
  }

  function togglePeoplePopover() {
    setPeopleOpen((current) => !current);
    setCalendarOpen(false);
    setError("");
  }

  function selectDate(date: string) {
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    setSubmittedBookingSummary(null);

    if (!bookingIsOpen || date < minDate || date > maxDate) return;

    setForm((current) => {
      const clickedDay = getCalendarDay(date);
      const currentSaleMode = stayTypeToSaleMode(current.stay_type);
      const selectingCheckout = selectionMode === "checkOut" || Boolean(current.check_in && !current.check_out);
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
        setHoverPreviewDate("");
        return nextForm;
      }

      if (!canUseAsStayNight && !canUseAsCheckout) return current;

      if (!current.check_in || (current.check_in && current.check_out) || date < current.check_in) {
        const stayType = saleModeToStayType(clickedDay.saleMode) || getDefaultStayType(settings);
        setMessage(`您已選擇${stayType === "villa" ? "包棟" : "單間"}住宿，請選擇退房日期。`);
        setSelectionMode("checkOut");
        setCalendarOpen(true);
        setHoverPreviewDate("");
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
      setHoverPreviewDate("");
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
    setSubmittedBookingSummary(null);
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

  function handleRoomOptionSelect(roomOptionId: string) {
    if (!roomOptions.some((option) => option.id === roomOptionId)) return;
    setForm((current) => ({
      ...current,
      selected_room_option_id: roomOptionId,
    }));
    setMessage("");
    setError("");
  }

  function scrollToBookingFlow() {
    window.requestAnimationFrame(() => {
      bookingFlowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToBookingStep(nextStep: BookingStep) {
    setBookingStep(nextStep);
    setCalendarOpen(false);
    setPeopleOpen(false);
    setMessage("");
    setError("");
    scrollToBookingFlow();
  }

  function updateBreakfastQuantity(date: string, nextQuantity: number) {
    setBreakfastAddonsByDate((current) => {
      const quantity = Math.max(0, nextQuantity);
      if (quantity === 0) {
        const { [date]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [date]: quantity };
    });
    setMessage("");
    setError("");
  }

  function handleStartBooking() {
    if (!form.check_in || !form.check_out) {
      setError("請先確認入住與退房日期。");
      return;
    }
    if (selectedRangeIssue !== "ok") {
      setError(rangeIssueMessage(form.stay_type, selectedRangeIssue));
      return;
    }
    if (!bookingIsOpen || !selectedIsAvailable) {
      setError("這段日期目前無法預約，請重新選擇日期。");
      return;
    }
    if (form.adults < 1) {
      setError("成人至少需 1 位。");
      return;
    }
    if (guestCountExceedsLimit) {
      setError(capacityUnavailableReason || "目前無法支援此入住人數。");
      return;
    }
    if (capacityUnavailableReason) {
      setError(capacityUnavailableReason);
      return;
    }
    if (!quoteReady || isQuoteLoading || priceQuoteError) {
      setError("目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。");
      return;
    }

    setBookingStep(2);
    setCalendarOpen(false);
    setPeopleOpen(false);
    setMessage("");
    setError("");
    scrollToBookingFlow();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const guestName = combineGuestName(guestNameParts.lastName, guestNameParts.firstName);
    if (!guestNameParts.lastName.trim() || !guestNameParts.firstName.trim()) {
      setError("請填寫訂房人姓氏與名字。");
      return;
    }
    if (!isValidEmail(form.email)) {
      setError("請填寫有效的 Email。");
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError("請填寫有效的電話。");
      return;
    }
    if (!hasAgreedBookingTerms) {
      setError("請先閱讀並同意入住須知與訂房規範。");
      return;
    }
    if (selectedRangeIssue !== "ok") {
      setError(rangeIssueMessage(form.stay_type, selectedRangeIssue));
      return;
    }
    if (guestCountExceedsLimit) {
      setError(capacityUnavailableReason || "目前無法支援此入住人數。");
      return;
    }
    if (capacityUnavailableReason) {
      setError(capacityUnavailableReason);
      return;
    }
    if (!quoteReady || isQuoteLoading || priceQuoteError) {
      setError("目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。");
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    setSubmittedBookingSummary(null);
    try {
      const payload: BookingRequestPayload = {
        guest_name: guestName,
        email: form.email,
        phone: form.phone,
        check_in: form.check_in,
        check_out: form.check_out,
        stay_type: form.stay_type,
        selected_package_type: automaticPackageType,
        selected_room_option_id: selectedRoomOptionId,
        adults: form.adults,
        children: form.children,
        infants: form.infants,
        room_count: form.stay_type === "villa" ? settings.totalRoomCount : form.room_count,
        has_pets: petPlan.dogCount > 0,
        pet_count: petPlan.dogCount,
        pet_type: petPlan.dogCount > 0 ? "dog" : "",
        pet_notes: "",
        dog_under_10kg_count: form.dog_under_10kg_count,
        dog_10_to_20kg_count: form.dog_10_to_20kg_count,
        dog_over_20kg_count: form.dog_over_20kg_count,
        breakfast_addons: breakfastAddonEntries,
        notes: buildBookingRequestNotes(form.notes, form.infants),
      };
      const result = await submitBookingRequest(payload, session?.access_token || null);
      setSubmittedRequestId(result.request.id);
      setSubmittedBookingSummary(result);
      if (result.recoveryToken) {
        writeBookingRecoverySession(result.recoveryToken, result);
      }
      setMessage(bookingCopy.successMessage);
      setBookingStep(4);
      scrollToBookingFlow();
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
      if (submitError instanceof BookingApiError && submitError.code === "booking_temporarily_held") {
        setError(bookingHoldConflictMessage(submitError.retryAfterSeconds));
      } else {
        setError(submitError instanceof Error ? submitError.message : "預約申請送出失敗，請稍後再試。");
      }
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

  function renderDogCounter({
    field,
    label,
    count,
    unitPrice,
  }: {
    field: "dog_under_10kg_count" | "dog_10_to_20kg_count" | "dog_over_20kg_count";
    label: string;
    count: number;
    unitPrice: number;
  }) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f1e8dc] pt-3 first:border-t-0 first:pt-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-700">{label}</p>
          <p className="mt-0.5 text-xs text-stone-500">每隻每晚 {formatTwd(unitPrice)}</p>
        </div>
        <div className="grid w-[128px] max-w-full grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={count <= 0}
            onClick={() => updateDogCount(field, count - 1)}
            aria-label={`${label}狗狗減少`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-6 text-center text-base font-semibold text-stone-900">{count}</span>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => updateDogCount(field, count + 1)}
            aria-label={`${label}狗狗增加`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  function getNightAdultStayAmount(night: BookingPricingBreakdownNight) {
    return night.adultLodgingAmount ?? night.price - (night.childFeeAmount || 0) - (night.petFeeAmount || 0);
  }

  function renderNightCalculation(night: BookingPricingBreakdownNight, showDateHeader = true) {
    const discountAmount = night.discountAmount || 0;
    const hasDiscount = discountAmount > 0;
    const hasAdultBreakdown = night.adultRateBreakdownStatus === "resolved";
    const adultStayAmount = getNightAdultStayAmount(night);
    const adultPreDiscountAmount = night.adultLodgingPreDiscountAmount ?? adultStayAmount + discountAmount;
    const fallbackAdultAmount = night.formalAdultPrice ?? night.basePrice ?? adultPreDiscountAmount;

    return (
      <div key={night.date} className="grid gap-2 border-b border-[#f1e8dc] pb-4 last:border-b-0 last:pb-0">
        {showDateHeader && (
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="font-semibold text-stone-900">{formatSearchDate(night.date)}</p>
              {hasDiscount && (
                <span className="rounded-full bg-[#f3eadf] px-2 py-0.5 text-[11px] font-medium text-[#765d4a]">
                  續住 95 折
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {formatDayTypeSummary(night.dayType, night.dayTypeLabel)}
              {night.specialDateLabel ? "｜" + night.specialDateLabel : ""}
            </p>
          </div>
        )}

        <div className="grid gap-1.5 text-sm leading-5 text-stone-600 sm:pl-3">
          {hasAdultBreakdown ? (
            <>
              <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <span>10 人包棟基本價</span>
                <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                  {formatTwd(night.base10GuestRate)}
                </span>
              </div>
              {Boolean(night.regularExtraAdultCount && night.regularExtraAdultFeeAmount) && (
                <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                  <span>
                    成人加人 {night.regularExtraAdultCount} 位 × {formatTwd(night.regularExtraAdultRate)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                    {formatTwd(night.regularExtraAdultFeeAmount)}
                  </span>
                </div>
              )}
              {Boolean(night.extraBedAdultCount && night.extraBedAdultFeeAmount) && (
                <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                  <span>
                    單人加床成人 {night.extraBedAdultCount} 位 × {formatTwd(night.extraBedAdultRate)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                    {formatTwd(night.extraBedAdultFeeAmount)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span>{night.formalAdultGuestCount ?? night.baseGuestCount ?? night.pricingGuestCount} 人包棟正式價格</span>
              <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                {formatTwd(fallbackAdultAmount)}
              </span>
            </div>
          )}
          {hasDiscount && (
            <div className="mt-1 grid gap-1 border-t border-[#f1e8dc] pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span className="font-semibold text-stone-800">當晚住宿費</span>
              <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                {formatTwd(adultPreDiscountAmount)}
              </span>
            </div>
          )}
          {hasDiscount && (
            <div className="grid gap-1 text-[#8b6f5b] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span>續住優惠 -5%</span>
              <span className="shrink-0 whitespace-nowrap font-semibold">-{formatTwd(discountAmount)}</span>
            </div>
          )}
          <div
            className={cn(
              "grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3",
              !hasDiscount && "mt-1 border-t border-[#f1e8dc] pt-2"
            )}
          >
            <span className="font-semibold text-stone-800">{hasDiscount ? "折後當晚住宿費" : "當晚住宿費"}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(adultStayAmount)}</span>
          </div>
        </div>
      </div>
    );
  }

  function renderBookingStepper() {
    return (
      <div ref={bookingFlowRef} className="mt-5 grid min-w-0 grid-cols-4 gap-0">
        {bookingSteps.map((step) => {
          const isCurrent = bookingStep === step.step;
          const isComplete = bookingStep > step.step;
          const isLast = step.step === bookingSteps.length;
          return (
            <div
              key={step.step}
              className="relative grid min-w-0 justify-items-center gap-2 px-1 text-center sm:px-2"
            >
              {!isLast && (
                <div className="absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-3 z-0 flex items-center">
                  <span className={cn("h-px flex-1", isComplete ? "bg-[#d9c9b7]" : "bg-[#eadfce]")} />
                  <ChevronRight className={cn("h-3 w-3 shrink-0", isComplete ? "text-[#b08d73]" : "text-[#d7c5b2]")} />
                </div>
              )}
              <span
                className={cn(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold sm:h-8 sm:w-8",
                  isCurrent
                    ? "border-[#8b6f5b] bg-[#8b6f5b] text-white"
                    : isComplete
                      ? "border-[#d9c9b7] bg-[#f3eadf] text-[#765d4a]"
                      : "border-[#eadfce] bg-white text-stone-400"
                )}
              >
                {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.step}
              </span>
              <span
                className={cn(
                  "min-w-0 break-words text-[11px] font-medium leading-4 sm:text-sm sm:leading-5",
                  isCurrent ? "text-stone-900" : isComplete ? "text-[#765d4a]" : "text-stone-400"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCompactSummaryRow(label: string, value: string, emphasized = false) {
    return (
      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
        <span className={cn("text-stone-500", emphasized && "font-semibold text-[#765d4a]")}>{label}</span>
        <span className={cn("shrink-0 whitespace-nowrap font-semibold text-stone-900", emphasized && "text-xl")}>{value}</span>
      </div>
    );
  }

  function renderCompactBookingSummary() {
    return (
      <aside className="grid min-w-0 content-start gap-3 self-start rounded-[18px] border border-[#eadfce] bg-white/95 p-4 text-sm leading-6 text-stone-600 min-[960px]:sticky min-[960px]:top-28">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">SUMMARY</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-900">訂房摘要</h2>
        </div>

        <div className="grid gap-3 border-t border-[#f1e8dc] pt-3">
          <div>
            <p className="text-xs font-medium text-stone-500">入住日期</p>
            <p className="mt-1 font-semibold text-stone-900">
              {formatSearchDate(form.check_in)}－{formatSearchDate(form.check_out)}
            </p>
            <p className="mt-1 text-xs text-stone-500">共 {nightCount} 晚</p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-500">入住人數</p>
            <p className="mt-1 font-semibold text-stone-900">{guestSummary}</p>
          </div>

          {stayBedSummary && (
            <div>
              <p className="text-xs font-medium text-stone-500">住宿配置</p>
              <p className="mt-1 font-semibold text-stone-900">{stayBedSummary}</p>
            </div>
          )}
        </div>

        <div className="grid gap-2 border-t border-[#f1e8dc] pt-3">
          {renderCompactSummaryRow("住宿費", formatTwd(compactLodgingTotal))}
          {quoteReady && quoteChildFeeTotal > 0 && renderCompactSummaryRow("孩童費", formatTwd(quoteChildFeeTotal))}
          {quoteReady && quotePetFeeTotal > 0 && renderCompactSummaryRow("寵物住宿費", formatTwd(quotePetFeeTotal))}
          {quoteReady && breakfastAddonQuantity > 0 && (
            <div className="grid gap-2 border-t border-[#f1e8dc] pt-3">
              <p className="text-xs font-medium text-stone-500">加購商品</p>
              <div className="grid gap-1">
                <p className="font-semibold text-stone-900">{breakfastAddon.name}</p>
                {quoteBreakfastAddonEntries.map((item) => (
                  <div key={item.date} className="grid gap-1 text-xs leading-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                    <span className="text-stone-500">{formatCompactDate(item.date)}｜{item.quantity}份</span>
                    <span className="font-medium text-stone-700">{formatTwd(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              {renderCompactSummaryRow(`合計 ${breakfastAddonQuantity}份`, formatTwd(breakfastAddonTotal))}
            </div>
          )}
          {nightCount > 0 && (
            <p className="rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
              官網限定｜本次入住贈慢寶精美文創禮 {nightCount} 份
            </p>
          )}
        </div>

        <div className="grid gap-2 border-t border-[#f1e8dc] pt-3">
          {renderCompactSummaryRow("總價", formatTwd(displayTotal), true)}
          {renderCompactSummaryRow(`訂金 ${quoteDepositRatePercent ?? 30}%`, formatTwd(displayDepositAmount))}
          {renderCompactSummaryRow(`尾款 ${quoteBalanceRatePercent ?? 70}%`, formatTwd(displayBalanceAmount))}
        </div>
      </aside>
    );
  }

  function renderStep3AmountRow(label: string, amount: number | null | undefined, detail?: string, emphasized = false) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className={cn("font-medium text-stone-700", emphasized && "text-base font-semibold text-stone-900")}>{label}</p>
          {detail && <p className="mt-0.5 text-xs leading-5 text-stone-500">{detail}</p>}
        </div>
        <p className={cn("shrink-0 whitespace-nowrap font-semibold text-stone-900", emphasized && "text-lg text-[#765d4a]")}>
          {formatTwd(amount)}
        </p>
      </div>
    );
  }

  function renderBookingDetailsCard() {
    return (
      <section className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-stone-900">訂單細項</h2>

        <div className="mt-4 grid gap-4 text-sm leading-6">
          <div className="grid gap-1">
            <p className="font-semibold text-stone-900">
              {formatSearchDate(form.check_in)}－{formatSearchDate(form.check_out)}
            </p>
            <p className="text-xs text-stone-500">共 {nightCount} 晚</p>
            <p className="text-stone-600">{guestSummary}</p>
          </div>

          {stayBedSummary && (
            <div>
              <p className="text-xs font-medium text-stone-500">住宿配置</p>
              <p className="mt-1 font-semibold text-stone-900">{stayBedSummary}</p>
            </div>
          )}

          <div className="grid gap-3 border-t border-[#f1e8dc] pt-4">
            {renderStep3AmountRow("包棟住宿", compactLodgingTotal)}
            {quoteReady && quoteChildFeeTotal > 0 && renderStep3AmountRow("額外不佔床孩童", quoteChildFeeTotal)}
            {quoteReady && quotePetFeeTotal > 0 && renderStep3AmountRow("寵物住宿費", quotePetFeeTotal)}
            {quoteReady && breakfastAddonQuantity > 0 && renderStep3AmountRow(breakfastAddon.name, breakfastAddonTotal, `${breakfastAddonQuantity} 份`)}
            {renderStep3AmountRow("總價", displayTotal, undefined, true)}
          </div>

          {nightCount > 0 && (
            <p className="rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
              官網限定｜本次入住贈慢寶精美文創禮 {nightCount} 份
            </p>
          )}
        </div>
      </section>
    );
  }

  function renderPaymentDetailsCard() {
    return (
      <section className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-stone-900">付款明細</h2>
        <div className="mt-4 grid gap-3 text-sm leading-6">
          {renderStep3AmountRow("總價", displayTotal, undefined, true)}
          {renderStep3AmountRow(`訂金 ${quoteDepositRatePercent ?? 30}%`, displayDepositAmount)}
          {renderStep3AmountRow(`尾款 ${quoteBalanceRatePercent ?? 70}%`, displayBalanceAmount)}
        </div>

        {quoteReady && quoteDogCount > 0 && quotePetDepositAmount > 0 && (
          <div className="mt-4 border-t border-[#f1e8dc] pt-4 text-sm leading-6">
            {renderStep3AmountRow("寵物押金", quotePetDepositAmount)}
            <p className="mt-2 text-xs leading-5 text-stone-500">
              入住時另收，退房確認環境、寢具、家具及設備無污損後全額退還。
            </p>
          </div>
        )}
      </section>
    );
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

  function renderMonth(month: string) {
    const dates = getMonthDates(month);
    const previewCheckOut =
      selectionMode === "checkOut" && form.check_in && hoverPreviewDate > form.check_in ? hoverPreviewDate : "";
    const displayCheckOut = previewCheckOut || form.check_out;
    const hasDisplayRange = Boolean(form.check_in && displayCheckOut && displayCheckOut > form.check_in);
    const rangeBackgroundClass = previewCheckOut ? "before:bg-[#f8efe6]" : "before:bg-[#f3eadf]";

    return (
      <div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-stone-400">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1" onMouseLeave={() => setHoverPreviewDate("")}>
          {dates.map((date, index) => {
            if (!date) return <div key={`blank-${month}-${index}`} className="h-10" />;

            const unavailable = unavailableDates.has(date);
            const outOfRange = date < minDate || date > maxDate || !bookingIsOpen;
            const day = getCalendarDay(date);
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
            const isPreviewCheckOut = Boolean(previewCheckOut && date === previewCheckOut && !isCheckOut);
            const rangeStart = Boolean(hasDisplayRange && date === form.check_in);
            const rangeEnd = Boolean(hasDisplayRange && date === displayCheckOut);
            const rangeMiddle = Boolean(hasDisplayRange && date > form.check_in && date < displayCheckOut);
            const filteredOut = isCalendarFilterMismatch(day, calendarFilter) && !canUseAsCheckout;
            const disabled =
              outOfRange ||
              filteredOut ||
              (selectingCheckout && form.check_in
                ? !canUseAsCheckout
                : !isBookableStayNight(day, minDate, maxDate) && !canUseAsCheckout);
            const muted = disabled || filteredOut || unavailable || !day.isAvailable || day.saleMode === "closed";
            const isToday = date === minDate;

            return (
              <div
                key={date}
                className={cn(
                  "relative flex h-10 items-center justify-center overflow-hidden",
                  (rangeStart || rangeEnd || rangeMiddle) &&
                    "before:absolute before:top-1/2 before:h-8 before:-translate-y-1/2",
                  (rangeStart || rangeEnd || rangeMiddle) && rangeBackgroundClass,
                  rangeStart && !rangeEnd && "before:left-1/2 before:right-0",
                  rangeEnd && !rangeStart && "before:left-0 before:right-1/2",
                  rangeMiddle && "before:left-0 before:right-0"
                )}
                onMouseEnter={() => {
                  if (selectionMode === "checkOut" && canUseAsCheckout) setHoverPreviewDate(date);
                }}
                onFocus={() => {
                  if (selectionMode === "checkOut" && canUseAsCheckout) setHoverPreviewDate(date);
                }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDate(date)}
                  className={cn(
                    "relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#eadfce]",
                    muted && "text-stone-300",
                    disabled && "cursor-not-allowed",
                    !disabled && "text-stone-700 hover:bg-[#f7f1e9]",
                    isToday && !isCheckIn && !isCheckOut && "ring-1 ring-[#d7c5b2]",
                    rangeMiddle && !disabled && "text-[#765d4a]",
                    isPreviewCheckOut && !disabled && "border border-[#d7c5b2] bg-[#fff8ea] text-[#765d4a]",
                    (isCheckIn || isCheckOut) && "bg-[#8b6f5b] text-white shadow-sm hover:bg-[#765d4a]"
                  )}
                  aria-label={calendarDayAriaLabel(day, minDate, maxDate)}
                >
                  {Number(date.slice(8, 10))}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf7f1] text-stone-900">
      <Header />
      <main className="overflow-x-clip px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32">
        <section className="mx-auto w-full max-w-[1280px] min-w-0">
          <div className="w-full min-w-0 pb-4 pt-5 md:pb-6 md:pt-7">
            <h1 className="font-serif text-[2rem] font-light leading-tight tracking-wide text-stone-900 md:text-[2.4rem]">
              線上訂房
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              選擇入住日期與人數，我們將依房況與方案顯示可預約內容。
            </p>
            <div className="mt-4 inline-flex max-w-full items-start gap-2 rounded-[10px] border border-[#ead9bd] bg-[#fffaf3] px-3 py-2 text-sm leading-6 text-stone-700">
              <Gift className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#a47a4f]" />
              <p>
                <span className="font-semibold text-[#765d4a]">官網限定</span>｜每入住 1 晚，贈慢寶精美文創禮 1 份
              </p>
            </div>
          </div>

          {!bookingIsOpen && (
            <div className="mt-6 rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
              目前暫未開放線上預約，歡迎透過官方聯絡方式與我們確認房況。
            </div>
          )}

          {renderBookingStepper()}

          {!calendarOpen && !peopleOpen && (message || error) && bookingStep !== 4 && (
            <div
              className={cn(
                "mt-4 rounded-[8px] border px-4 py-3 text-sm leading-6",
                error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {error || message}
            </div>
          )}

          {bookingStep === 1 && (
            <>
          <div
            ref={bookingSearchRef}
            className="relative mt-2 w-full max-w-full min-w-0"
          >
            <div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-[16px] border border-[#eadfce] bg-white shadow-[0_8px_22px_rgba(120,90,65,0.035)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
              <button
                type="button"
                className={cn(
                  "min-h-[76px] min-w-0 px-4 py-3 text-left transition hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#eadfce] md:border-r md:border-[#eadfce]",
                  calendarOpen && selectionMode === "checkIn"
                    ? "bg-[#fff8ea] shadow-[inset_0_-3px_0_rgba(139,111,91,0.18)]"
                    : "bg-white"
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
                  "min-h-[76px] min-w-0 border-l border-[#eadfce] px-4 py-3 text-left transition hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#eadfce] md:border-l-0 md:border-r",
                  calendarOpen && selectionMode === "checkOut"
                    ? "bg-[#fff8ea] shadow-[inset_0_-3px_0_rgba(139,111,91,0.18)]"
                    : "bg-white"
                )}
                onClick={() => openCalendar("checkOut")}
                aria-expanded={calendarOpen && selectionMode === "checkOut"}
              >
                <span className="block text-xs font-medium text-stone-500">退房</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">
                  {formatSearchDate(form.check_out)}
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "col-span-2 min-h-[76px] min-w-0 border-t border-[#eadfce] px-4 py-3 text-left transition hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#eadfce] md:col-span-1 md:border-t-0",
                  peopleOpen ? "bg-[#fff8ea]" : "bg-white"
                )}
                onClick={togglePeoplePopover}
                aria-expanded={peopleOpen}
              >
                <span className="block text-xs font-medium text-stone-500">入住人數</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">{searchGuestSummary}</span>
              </button>
            </div>
            {isCalendarLoading && <p className="mt-3 text-sm text-stone-500">房況載入中...</p>}

            {calendarOpen && (
              <section
                ref={calendarPanelRef}
                className="absolute left-0 right-0 top-full z-40 mt-3 box-border w-full max-w-[calc(100vw-1.5rem)] min-w-0 rounded-[18px] border border-[#eadfce] bg-white p-3 shadow-xl sm:right-auto sm:w-[380px] sm:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    disabled={visibleMonth <= earliestVisibleMonth}
                    onClick={() => {
                      setHoverPreviewDate("");
                      setVisibleMonth((current) => addMonths(current, -1));
                    }}
                    aria-label="上一個月"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="font-serif text-xl text-stone-900">{monthLabel(visibleMonth)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    disabled={visibleMonth >= maxMonth}
                    onClick={() => {
                      setHoverPreviewDate("");
                      setVisibleMonth((current) => addMonths(current, 1));
                    }}
                    aria-label="下一個月"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-center text-xs text-stone-500">
                  {selectionMode === "checkOut" ? "請選擇退房日期" : "請選擇入住日期"}
                </p>
                <p className="mt-1 text-center text-xs text-stone-500">{MIN_BOOKING_MONTH_DAY_LABEL} 起開放預約</p>

                <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-[#fbf7f1] p-1">
                  {calendarFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => handleCalendarFilterChange(filter.value)}
                      className={cn(
                        "rounded-full px-2 py-1.5 text-xs font-medium transition",
                        calendarFilter === filter.value
                          ? "bg-[#8b6f5b] text-white"
                          : "text-stone-500 hover:bg-white hover:text-[#765d4a]"
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {renderMonth(visibleMonth)}
                </div>

                <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-stone-500">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8b6f5b]" />已選</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#f3eadf]" />住宿期間</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-[#d7c5b2]" />今天</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-stone-200" />不可選</span>
                </div>

                {message && <div className="mt-3 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">{message}</div>}
                {error && <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</div>}
              </section>
            )}

            {peopleOpen && (
              <section
                ref={peoplePanelRef}
                className="absolute left-0 right-0 top-full z-40 mt-3 box-border w-full max-w-[calc(100vw-1.5rem)] min-w-0 rounded-[18px] border border-[#eadfce] bg-white p-3 shadow-xl sm:left-auto sm:right-0 sm:w-[320px] sm:p-4"
              >
                <div className="grid gap-3">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">成人</p>
                      <p className="mt-0.5 text-xs text-stone-500">12 歲以上</p>
                    </div>
                    <div className="grid w-[136px] max-w-full grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={form.adults <= 1}
                        onClick={() => updateField("adults", form.adults - 1)}
                        aria-label="成人減少"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-6 text-center text-base font-semibold text-stone-900">{form.adults}</span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={adultIncrementDisabled}
                        onClick={() => updateField("adults", Math.min(form.adults + 1, MAX_BOOKING_ADULTS))}
                        aria-label="成人增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">孩童</p>
                      <p className="mt-0.5 text-xs text-stone-500">4～11 歲・不佔床</p>
                    </div>
                    <div className="grid w-[136px] max-w-full grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={form.children <= 0}
                        onClick={() => updateField("children", form.children - 1)}
                        aria-label="孩童減少"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-6 text-center text-base font-semibold text-stone-900">{form.children}</span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={childIncrementDisabled}
                        onClick={() => updateField("children", form.children + 1)}
                        aria-label="孩童增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">嬰幼兒</p>
                      <p className="mt-0.5 text-xs text-stone-500">0～3 歲・不佔床免費</p>
                    </div>
                    <div className="grid w-[136px] max-w-full grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={form.infants <= 0}
                        onClick={() => updateField("infants", form.infants - 1)}
                        aria-label="嬰幼兒減少"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-6 text-center text-base font-semibold text-stone-900">{form.infants}</span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={infantIncrementDisabled}
                        onClick={() => updateField("infants", form.infants + 1)}
                        aria-label="嬰幼兒增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {settings.allowPets && (
                    <div className="rounded-[12px] border border-[#f1e8dc] bg-white px-3 py-2.5">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-stone-600 transition hover:text-[#765d4a]"
                        aria-expanded={otherNeedsOpen}
                        onClick={() => setOtherNeedsOpen((current) => !current)}
                      >
                        <span>其他需求（選填）</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
                          {petPlan.dogCount > 0 && <span>已填寫</span>}
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform",
                              otherNeedsOpen && "rotate-90"
                            )}
                          />
                        </span>
                      </button>

                      {otherNeedsOpen && (
                        <div className="mt-3 grid gap-3 border-t border-[#f1e8dc] pt-3">
                          <div>
                            <p className="text-sm font-semibold text-stone-800">攜帶狗狗</p>
                            <p className="mt-1 text-xs leading-5 text-stone-500">目前僅開放狗狗入住。</p>
                          </div>
                          <div className="grid gap-3">
                            {renderDogCounter({
                              field: "dog_under_10kg_count",
                              label: "10 公斤以下",
                              count: form.dog_under_10kg_count,
                              unitPrice: bookingGuestRules.dogFeeTiers[0].unitPrice,
                            })}
                            {renderDogCounter({
                              field: "dog_10_to_20kg_count",
                              label: "超過 10 公斤至 20 公斤",
                              count: form.dog_10_to_20kg_count,
                              unitPrice: bookingGuestRules.dogFeeTiers[1].unitPrice,
                            })}
                            {renderDogCounter({
                              field: "dog_over_20kg_count",
                              label: "超過 20 公斤",
                              count: form.dog_over_20kg_count,
                              unitPrice: bookingGuestRules.dogFeeTiers[2].unitPrice,
                            })}
                          </div>
                          <div className="rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
                            <p>連續入住第2晚起，狗狗住宿費享95折。</p>
                            <p className="mt-1">
                              入住時另收 {formatTwd(bookingGuestRules.petDepositAmount)} 寵物押金，退房確認環境、寢具、家具及設備無污損後全額退還。
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-3 rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
                  成人最多 {MAX_BOOKING_ADULTS} 位，孩童最多 {MAX_BOOKING_CHILDREN} 位；嬰幼兒不佔床免費。超過包棟內含人數後，不佔床孩童每位每晚 NT$500。
                </p>
              </section>
            )}
          </div>

          {canRenderStepOneStayContent && (
            <section className="mt-8 w-full max-w-full min-w-0 rounded-[18px] border border-[#efe5d8] bg-white/95">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-0 min-[1000px]:grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)]">
                <div className="grid min-w-0 content-start grid-cols-[minmax(0,1fr)] gap-6 border-b border-[#efe5d8] p-4 sm:p-5 min-[1000px]:border-b-0 min-[1000px]:p-6">
                  <div className="min-w-0">
                    <div className="w-full min-w-0 overflow-hidden rounded-[16px] bg-[#fbf7f1]">
                      <img
                        src={activeGalleryImage.src}
                        alt={activeGalleryImage.alt}
                        className="block aspect-[4/3] w-full max-w-full object-cover sm:aspect-[16/10] min-[1000px]:aspect-[16/10]"
                      />
                    </div>
                    <div className="mt-4 flex w-full max-w-full min-w-0 gap-2.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {bookingGalleryImages.map((image, index) => (
                        <button
                          key={image.src}
                          type="button"
                          className={cn(
                            "h-16 w-20 flex-none overflow-hidden rounded-[10px] border bg-white transition sm:h-[74px] sm:w-24",
                            selectedGalleryIndex === index
                              ? "border-[#8b6f5b] ring-2 ring-[#eadfce]"
                              : "border-[#eadfce] opacity-90 hover:border-[#b7957c] hover:opacity-100"
                          )}
                          onClick={() => setSelectedGalleryIndex(index)}
                          aria-label="切換住宿空間照片"
                        >
                          <img src={image.src} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-stone-900">設施</p>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {bookingAmenityLabels.map((amenity) => (
                        <span
                          key={amenity}
                          className="max-w-full break-words rounded-full border border-[#eadfce] bg-[#fffdf9] px-3 py-1.5 text-xs font-medium text-[#765d4a] sm:text-sm"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>


                </div>
                <div className="min-w-0 self-start">
                  <div className="grid h-fit min-w-0 content-start grid-cols-[minmax(0,1fr)] gap-6 self-start border-t border-[#f3ece4] p-5 sm:p-6 min-[1000px]:border-l min-[1000px]:border-t-0">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">STAY</p>
                    <h2 className="mt-2 font-serif text-[1.75rem] font-light leading-tight text-stone-900">
                      {form.stay_type === "villa" ? "包棟" : "單間住宿"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-stone-500">
                      依目前選擇的日期與人數，顯示可預約方案與住宿費用。
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-5 border-t border-[#f1e8dc] pt-5 text-sm text-stone-600">
                    <div className="grid min-w-0 gap-4">
                      <div>
                        <p className="text-xs font-medium text-stone-500">住宿日期</p>
                        <p className="mt-1 break-words font-semibold text-stone-900">
                          {formatSearchDate(form.check_in)}－{formatSearchDate(form.check_out)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">共 {nightCount} 晚</p>
                      </div>

                      <div>
                        <p className="flex items-center gap-2 text-xs font-medium text-stone-500">
                          <Users className="h-3.5 w-3.5" />
                          入住人數
                        </p>
                        <p className="mt-1 break-words font-semibold text-stone-900">{guestSummary}</p>
                      </div>

                    </div>

                    <div className="border-t border-[#f1e8dc] pt-5">
                      {!canShowOrderSummary ? (
                        <p className="text-sm leading-6 text-stone-500">
                          {guestLimitUnavailableReason || "請確認入住日期與入住人數。"}
                        </p>
                      ) : (
                        <div className="grid min-w-0 gap-4">
                          {stayBedSummary && (
                            <div>
                              <p className="text-xs font-medium text-stone-500">住宿配置</p>
                              <p className="mt-1 font-semibold text-stone-900">{stayBedSummary}</p>
                              {showCompleteRoomConfiguration && (
                                <p className="mt-1 text-xs leading-5 text-stone-500">
                                  房間將依入住人數與同行組成安排。
                                </p>
                              )}
                            </div>
                          )}

                          {selectedRoomOption && !showCompleteRoomConfiguration && (
                            <div className="border-t border-[#f1e8dc] pt-5">
                              <p className="text-xs font-medium text-stone-500">可安排房型組合</p>
                                  <div className="mt-3 grid gap-2">
                                    {roomOptions.map((roomOption) => {
                                      const selected = roomOption.id === selectedRoomOptionId;
                                      const multipleOptions = roomOptions.length > 1;
                                      return (
                                        <button
                                          key={roomOption.id}
                                          type="button"
                                          className={cn(
                                            "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-[10px] border px-3 py-3 text-left transition",
                                            selected
                                              ? "border-[#d9c9b7] bg-[#fffaf3]"
                                              : "border-[#eadfce] bg-white hover:border-[#d9c9b7] hover:bg-[#fffdf9]",
                                            !multipleOptions && "cursor-default hover:border-[#eadfce] hover:bg-white"
                                          )}
                                          onClick={() => multipleOptions && handleRoomOptionSelect(roomOption.id)}
                                          disabled={!multipleOptions}
                                          aria-pressed={selected}
                                        >
                                          <span
                                            className={cn(
                                              "mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                                              selected ? "border-[#8b6f5b]" : "border-[#d7c5b2]"
                                            )}
                                            aria-hidden="true"
                                          >
                                            {selected && <span className="h-1.5 w-1.5 rounded-full bg-[#8b6f5b]" />}
                                          </span>
                                          <span className="min-w-0">
                                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                                              <span className="font-semibold text-stone-900">{formatRoomOptionLabel(roomOption)}</span>
                                              {roomOption.id === defaultRoomOptionId && multipleOptions && (
                                                <span className="rounded-full border border-[#eadfce] bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[#765d4a]">
                                                  建議
                                                </span>
                                              )}
                                            </span>
                                            <span className="mt-1 block text-xs leading-5 text-stone-500">{formatRoomOptionRoomCount(roomOption)}</span>
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                              <p className="mt-2 text-xs leading-5 text-stone-500">
                                我們會依您選擇的房型組合安排，實際房間將依當日房況確認。
                              </p>
                            </div>
                          )}

                          <div className="grid min-w-0 gap-4 border-t border-[#f1e8dc] pt-5">
                            <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                              <p className="text-base font-semibold text-stone-900">住宿費用</p>
                              {isQuoteLoading && <span className="text-xs text-stone-500">房價計算中…</span>}
                            </div>

                            {priceQuoteError && (
                              <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                                {priceQuoteError}
                              </div>
                            )}

                            {quoteReady && (
                              <div className="grid gap-4">
                                {quoteNights.length > 1 ? (
                                  <>
                                    <div className="grid gap-2">
                                      {quoteNights.map((night) => {
                                        const daySummary = formatDayTypeSummary(night.dayType, night.dayTypeLabel);
                                        const specialDateSummary = night.specialDateLabel ? "｜" + night.specialDateLabel : "";
                                        const discountAmount = night.discountAmount || 0;
                                        const hasDiscount = discountAmount > 0;
                                        const adultStayAmount = getNightAdultStayAmount(night);
                                        const adultPreDiscountAmount =
                                          night.adultLodgingPreDiscountAmount ?? adultStayAmount + discountAmount;
                                        return (
                                          <div
                                            key={night.date}
                                            className="grid gap-1 border-b border-[#f1e8dc] pb-2 text-sm last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
                                          >
                                            <div className="min-w-0">
                                              <p className="font-medium text-stone-700">
                                                {formatSearchDate(night.date)}｜{daySummary}
                                                {specialDateSummary}
                                              </p>
                                              {hasDiscount && (
                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5 text-stone-500">
                                                  <span className="line-through">{formatTwd(adultPreDiscountAmount)}</span>
                                                  <span className="rounded-full bg-[#f3eadf] px-2 py-0.5 font-medium text-[#765d4a]">
                                                    續住 95 折
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                            <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                                              {formatTwd(adultStayAmount)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="grid gap-3">
                                      <button
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-[10px] border border-[#f1e8dc] bg-[#fffaf4] px-3 py-2 text-left text-sm font-medium text-[#765d4a] transition hover:border-[#eadfce] hover:bg-[#fff7ed]"
                                        aria-expanded={dailyPriceDetailsOpen}
                                        onClick={() => setDailyPriceDetailsOpen((current) => !current)}
                                      >
                                        <span>查看每日計算方式</span>
                                        <ChevronRight
                                          className={cn(
                                            "h-4 w-4 shrink-0 transition-transform",
                                            dailyPriceDetailsOpen && "rotate-90"
                                          )}
                                        />
                                      </button>

                                      {dailyPriceDetailsOpen && (
                                        <div className="grid gap-4 rounded-[12px] border border-[#f1e8dc] bg-white/70 p-3">
                                          {quoteNights.map((night) => renderNightCalculation(night))}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  quoteNights.map((night) => renderNightCalculation(night))
                                )}
                              </div>
                            )}

                            {quoteReady && quoteChildFeeTotal > 0 && (
                              <div className="border-t border-[#f1e8dc] pt-3">
                                <div className="grid gap-2 text-sm">
                                  <p className="font-semibold text-stone-800">額外不佔床孩童</p>
                                  <p className="text-xs leading-5 text-stone-500">
                                    {quoteChildFeeSummary}
                                  </p>
                                  <div className="text-xs leading-5">
                                    {renderFeeBreakdownRow("孩童費合計", quoteChildFeeTotal, { emphasized: true })}
                                  </div>
                                </div>
                              </div>
                            )}

                            {quoteReady && quoteDogCount > 0 && quotePetFeeTotal > 0 && (
                              <div className="border-t border-[#f1e8dc] pt-3">
                                <div className="grid gap-3 text-sm">
                                  <div>
                                    <p className="font-semibold text-stone-800">寵物住宿費</p>
                                    <div className="mt-2 grid gap-2">
                                      {quotePetFeeBreakdown
                                        .filter((item) => item.count > 0)
                                        .map((item) => {
                                          const discountedNightCount = item.discountedNightCount ?? Math.max(0, nightCount - 1);
                                          const firstNightAmount = item.nightlyAmount ?? item.originalAmount ?? null;
                                          const continuationTotal =
                                            firstNightAmount == null ? null : Math.max((item.total || 0) - firstNightAmount, 0);
                                          const petFeeSummary = [
                                            `${item.label}｜${item.count} 隻`,
                                            `首晚 ${formatTwd(firstNightAmount)}`,
                                            discountedNightCount > 0
                                              ? `續住 ${discountedNightCount} 晚 ${quotePetDiscountLabel} ${formatTwd(continuationTotal)}`
                                              : null,
                                          ].filter(Boolean).join("｜");
                                          return (
                                            <div
                                              key={item.key}
                                              className="text-xs leading-5 text-stone-500"
                                            >
                                              {petFeeSummary}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                  <div className="border-t border-[#f1e8dc] pt-2 text-xs leading-5">
                                    {renderFeeBreakdownRow("寵物住宿費合計", quotePetFeeTotal, { emphasized: true })}
                                  </div>
                                  {quotePetDepositAmount > 0 && (
                                    <div className="rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
                                      <p className="font-semibold text-stone-700">寵物押金 {formatTwd(quotePetDepositAmount)}</p>
                                      <p className="mt-0.5">入住時另收，退房確認無污損後全額退還。</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {quoteReady && (
                            <div className="grid min-w-0 gap-3 rounded-[12px] border border-[#ead9bd] bg-[#fff8ea] px-4 py-4">
                              <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                                <span className="text-sm font-semibold text-[#765d4a]">總價</span>
                                <span className="shrink-0 whitespace-nowrap text-2xl font-semibold text-stone-900">{formatTwd(quoteTotal)}</span>
                              </div>
                              <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                <span className="text-stone-600">訂金 {quoteDepositRatePercent ?? 30}%</span>
                                <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(priceQuote?.pricing.depositAmount)}</span>
                              </div>
                              <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                <span className="text-stone-600">尾款 {quoteBalanceRatePercent ?? 70}%</span>
                                <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(priceQuote?.pricing.balanceAmount)}</span>
                              </div>
                              <p className="text-xs leading-5 text-stone-500">
                                此頁不需付款。送出後，我們將依此房價明細與您確認房況及訂房細節。
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="h-12 w-full bg-[#8b6f5b] hover:bg-[#765d4a]"
                    onClick={handleStartBooking}
                    disabled={!canProceedToContact}
                  >
                    下一步
                  </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

            </>
          )}

          {bookingStep === 2 && (
            <section className="mt-6 grid min-w-0 gap-5 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
              <div className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">ADD-ONS</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-900">加購商品</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">可依本次入住需求加入代訂服務。</p>
                </div>

                <div className="mt-5 overflow-hidden rounded-[16px] border border-[#eadfce] bg-[#fffdf9]">
                  <img
                    src={breakfastAddon.image}
                    alt={breakfastAddon.name}
                    className="block aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
                  />
                  <div className="grid gap-4 p-4 sm:p-5">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-stone-900">{breakfastAddon.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-stone-500">{breakfastAddon.note}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-[#765d4a]">{formatTwd(breakfastAddon.unitPrice)} / 份</p>
                    </div>

                    <div className="grid gap-3 border-t border-[#f1e8dc] pt-4">
                      <p className="text-xs font-medium text-stone-500">選擇早餐日期與份數</p>
                      <div className="grid gap-2">
                        {breakfastDates.map((date) => {
                          const quantity = breakfastAddonsByDate[date] || 0;
                          return (
                            <div
                              key={date}
                              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f1e8dc] pt-2 first:border-t-0 first:pt-0"
                            >
                              <p className="min-w-0 text-sm font-semibold text-stone-900">{formatSearchDate(date)}</p>
                              <div className="grid w-[132px] max-w-full grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={quantity <= 0}
                                  onClick={() => updateBreakfastQuantity(date, quantity - 1)}
                                  aria-label={`${formatSearchDate(date)}成人早餐減少`}
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="min-w-6 text-center text-base font-semibold text-stone-900">{quantity}</span>
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9]"
                                  onClick={() => updateBreakfastQuantity(date, quantity + 1)}
                                  aria-label={`${formatSearchDate(date)}成人早餐增加`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 border-[#d7c5b2] bg-white text-stone-700 hover:bg-[#fffaf3]"
                    onClick={() => goToBookingStep(1)}
                  >
                    上一步
                  </Button>
                  <Button
                    type="button"
                    className="h-11 bg-[#8b6f5b] hover:bg-[#765d4a]"
                    onClick={() => goToBookingStep(3)}
                  >
                    下一步
                  </Button>
                </div>
              </div>

              {renderCompactBookingSummary()}
            </section>
          )}

          {bookingStep === 3 && (
            <section className="mx-auto mt-6 grid w-full max-w-[900px] min-w-0 gap-5">
              <form id="booking-details-form" className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6" onSubmit={handleSubmit}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">DETAILS</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-900">訂房人資料</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">
                    請填寫主要聯絡人的資料，我們將依此與您確認訂房資訊。
                  </p>
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                      <span>
                        姓氏 <span className="text-[#b08d73]">*</span>
                      </span>
                      <input
                        className={fieldClassName()}
                        value={guestNameParts.lastName}
                        onChange={(event) => updateGuestNamePart("lastName", event.target.value)}
                        required
                      />
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                      <span>
                        名字 <span className="text-[#b08d73]">*</span>
                      </span>
                      <input
                        className={fieldClassName()}
                        value={guestNameParts.firstName}
                        onChange={(event) => updateGuestNamePart("firstName", event.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                      <span>
                        國籍 <span className="text-[#b08d73]">*</span>
                      </span>
                      <select className={fieldClassName()} value={nationality} onChange={(event) => setNationality(event.target.value)} required>
                        <option value="台灣">台灣</option>
                      </select>
                    </label>
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                      <span>
                        電話 <span className="text-[#b08d73]">*</span>
                      </span>
                      <input className={fieldClassName()} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
                    </label>
                  </div>

                  <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                    <span>
                      Email <span className="text-[#b08d73]">*</span>
                    </span>
                    <input
                      className={fieldClassName()}
                      type="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      required
                    />
                  </label>

                  <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                    特殊需求
                    <textarea
                      className={textareaClassName()}
                      value={form.notes}
                      onChange={(event) => updateField("notes", event.target.value)}
                      placeholder="如有抵達時間、同行需求或其他希望提前告知的事項，可在此備註。"
                    />
                  </label>

                  <div className="rounded-[8px] bg-[#f7f1e9] px-4 py-3 text-sm leading-6 text-stone-600">
                    特殊需求將依現場實際狀況協助安排，如有重要需求，建議提前與我們確認。
                  </div>
                </div>
              </form>

              <section className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-stone-900">入住須知</h2>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-stone-600">
                  <li>入住時間：15:00～18:00，若會較晚抵達請提前告知。</li>
                  <li>退房時間：11:00 前。</li>
                  <li>22:00 後請降低音量。</li>
                  <li>室內全面禁菸。</li>
                  <li>如有其他入住需求，可提前與我們聯繫。</li>
                </ul>
              </section>

              {renderBookingDetailsCard()}

              {renderPaymentDetailsCard()}

              <label className="flex min-w-0 items-start gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-4 py-3 text-sm leading-6 text-stone-600">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[#d7c5b2] text-[#8b6f5b] focus:ring-[#eadfce]"
                  checked={hasAgreedBookingTerms}
                  onChange={(event) => {
                    setHasAgreedBookingTerms(event.target.checked);
                    setError("");
                  }}
                />
                <span>我已閱讀並同意入住須知與訂房規範</span>
              </label>

              <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 border-[#d7c5b2] bg-white text-stone-700 hover:bg-[#fffaf3]"
                  onClick={() => goToBookingStep(2)}
                >
                  上一步
                </Button>
                <Button type="submit" form="booking-details-form" className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmitting ? "送出中..." : "送出訂房"}
                </Button>
              </div>
            </section>
          )}

          {bookingStep === 4 && submittedBookingSummary && (
            <section className="mx-auto mt-6 grid w-full max-w-[900px] min-w-0 gap-5">
              <div className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3eadf] text-[#765d4a]">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-stone-900">訂房申請已送出</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{bookingCopy.successMessage}</p>
                    <p className="mt-3 text-sm leading-6 text-stone-500">
                      訂單編號：<span className="font-mono font-semibold text-stone-900">{submittedRequest?.id || submittedRequestId}</span>
                    </p>
                  </div>
                </div>
              </div>

              <section className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-stone-900">訂房資訊</h2>
                <div className="mt-4 grid gap-4 text-sm leading-6">
                  <div>
                    <p className="text-xs font-medium text-stone-500">入住日期</p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {formatSearchDate(submittedRequest?.check_in || form.check_in)}－{formatSearchDate(submittedRequest?.check_out || form.check_out)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">共 {submittedNightCount} 晚</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">入住人數</p>
                    <p className="mt-1 font-semibold text-stone-900">{submittedGuestSummary}</p>
                  </div>
                  {submittedStayBedSummary && (
                    <div>
                      <p className="text-xs font-medium text-stone-500">住宿配置</p>
                      <p className="mt-1 font-semibold text-stone-900">{submittedStayBedSummary}</p>
                    </div>
                  )}
                  {submittedBreakfastAddonQuantity > 0 && (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-t border-[#f1e8dc] pt-4">
                      <div>
                        <p className="font-medium text-stone-700">{breakfastAddon.name}</p>
                        <p className="mt-0.5 text-xs leading-5 text-stone-500">{submittedBreakfastAddonQuantity} 份</p>
                      </div>
                      <p className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(submittedBreakfastAddonTotal)}</p>
                    </div>
                  )}
                  <div className="grid gap-3 border-t border-[#f1e8dc] pt-4">
                    {renderStep3AmountRow("住宿相關費用", submittedLodgingSubtotal)}
                    {renderStep3AmountRow("總價", submittedTotal, undefined, true)}
                    {renderStep3AmountRow(`應付訂金 ${submittedDepositRatePercent ?? 30}%`, submittedDepositAmount)}
                    {renderStep3AmountRow(`尾款 ${submittedDepositRatePercent == null ? 70 : 100 - submittedDepositRatePercent}%`, submittedBalanceAmount)}
                  </div>
                </div>
              </section>

              <section className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-stone-900">聯絡資訊</h2>
                <div className="mt-4 grid gap-3 text-sm leading-6 text-stone-600 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-stone-500">訂房通知將寄至</p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {submittedBookingSummary.contact?.maskedEmail || maskEmail(form.email)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">聯絡電話</p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {submittedBookingSummary.contact?.maskedPhone || maskPhone(form.phone)}
                    </p>
                  </div>
                </div>
              </section>

              <details className="min-w-0 rounded-[18px] border border-[#eadfce] bg-white/95 p-4 text-sm leading-6 text-stone-600 sm:p-6">
                <summary className="cursor-pointer list-none font-semibold text-stone-900">
                  取消與退款規定 <span className="text-stone-400">›</span>
                </summary>
                <p className="mt-3 text-xs leading-5 text-stone-500">正式取消與退款規定將於上線前更新。</p>
              </details>

              <div>
                <a
                  href="/"
                  className="inline-flex h-11 items-center justify-center rounded-[8px] border border-[#d7c5b2] bg-white px-5 text-sm font-semibold text-stone-700 transition hover:bg-[#fffaf3]"
                >
                  返回首頁
                </a>
              </div>
            </section>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
