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
  MAX_BOOKING_PRICING_GUESTS,
  type PublicBookingSettings,
} from "@/lib/bookings/bookingConstants";
import {
  checkBookingAvailability,
  fetchBookingCalendar,
  fetchBookingQuote,
  submitBookingRequest,
  type BookingCalendarResult,
  type BookingPackageType,
  type BookingPricingBreakdownNight,
  type BookingPriceQuoteResult,
  type BookingRequestPayload,
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
  selected_package_type: "villa_10",
  selected_package_quantity: 0,
  room_count: DEFAULT_BOOKING_SETTINGS.totalRoomCount,
  has_pets: false,
  pet_count: 0,
  pet_type: "",
  pet_notes: "",
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
const bookingPackageOptions: Array<{ value: BookingPackageType; label: string; description: string }> = [
  { value: "villa_10", label: "10 人包棟", description: "適合 10 人以內入住" },
  { value: "villa_18", label: "18 人包棟", description: "適合 11 至 18 人入住" },
];

function BookingPackageDetails({ packageType }: { packageType: BookingPackageType }) {
  if (packageType === "villa_10") {
    return (
      <div className="space-y-3">
        <p>此方案依入住人數安排 3～4 間客房，每間客房皆設有<strong className="font-semibold text-stone-800">獨立衛浴</strong>。</p>
        <ul className="space-y-2">
          <li>・超過 10 人後，每增加 1 位加收 <strong className="font-semibold text-stone-800">NT$1,250</strong>。</li>
          <li>・週一至週四平日連續入住，第 2 晚享 <strong className="font-semibold text-stone-800">95 折優惠</strong>，並加贈慢寶文創禮。</li>
          <li>・跨年、農曆春節及特殊國定連假期間之訂房，如因個人因素取消，<strong className="font-semibold text-stone-800">訂金恕不退還</strong>，亦無法辦理改期。</li>
          <li>・週六不提供小包棟方案，以全房開放之包棟方案為主，敬請見諒。</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p>18 人以上如有加床需求，提供<strong className="font-semibold text-stone-800">單人加床服務</strong>，每增加 1 位加收 <strong className="font-semibold text-stone-800">NT$800</strong>，並提供 1 張單人床。</p>
      <ul className="space-y-2">
        <li>・週一至週四平日連續入住，第 2 晚享 <strong className="font-semibold text-stone-800">95 折優惠</strong>，並加贈慢寶文創禮。</li>
        <li>・跨年、農曆春節及特殊國定連假期間之訂房，如因個人因素取消，<strong className="font-semibold text-stone-800">訂金恕不退還</strong>，亦無法辦理改期。</li>
      </ul>
    </div>
  );
}

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
function fieldClassName() {
  return "h-12 w-full max-w-full min-w-0 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 w-full max-w-full min-w-0 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
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

function formatNegativeTwd(amount: number | null | undefined) {
  const formatted = formatTwd(amount);
  return formatted.startsWith("TWD ") ? `-${formatted}` : formatted;
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

function normalizePricingGuestLimit(form: BookingForm): BookingForm {
  const adults = Math.min(Math.max(form.adults || 1, 1), MAX_BOOKING_PRICING_GUESTS);
  const children = Math.min(Math.max(form.children || 0, 0), Math.max(0, MAX_BOOKING_PRICING_GUESTS - adults));
  if (adults === form.adults && children === form.children) return form;
  return {
    ...form,
    adults,
    children,
    selected_package_quantity: 0,
  };
}

function getInitialBookingForm() {
  const today = todayText();
  const minDate = resolveEarliestBookingDate(today);
  const fallback = createDefaultBookingForm(today);
  if (typeof window === "undefined") return fallback;
  const draft = readBookingDraft(window.sessionStorage, fallback);
  const resolved = resolveBookingDraftDateRange(draft, fallback, minDate);
  const dateResolvedDraft = resolved.adjusted ? { ...resolved.draft, selected_package_quantity: 0 } : resolved.draft;
  return normalizePricingGuestLimit(dateResolvedDraft);
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

function getPackageLabel(packageType: BookingPackageType) {
  return bookingPackageOptions.find((option) => option.value === packageType)?.label || "10 人包棟";
}

function hasSaturdayStayNight(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return false;
  const totalNights = nightsBetween(checkIn, checkOut);
  for (let index = 0; index < totalNights; index += 1) {
    if (parseDate(addDays(checkIn, index)).getUTCDay() === 6) return true;
  }
  return false;
}

function getPackageUnavailableReason(
  packageType: BookingPackageType,
  guestCount: number,
  checkIn: string,
  checkOut: string
) {
  const includesSaturdayStayNight = hasSaturdayStayNight(checkIn, checkOut);
  if (packageType === "villa_18") {
    if (!includesSaturdayStayNight && guestCount < 18) {
      return "18 人包棟適用於 18 位以上入住；住宿期間包含週六時則不受此限制。";
    }
    return "";
  }
  if (packageType !== "villa_10") return "";
  if (includesSaturdayStayNight) {
    return "此住宿期間包含週六，週六不提供小包棟方案，請選擇 18 人包棟。";
  }
  if (guestCount >= 18) {
    return "18 位以上入住請選擇 18 人包棟方案。";
  }
  return "";
}

function getPackageSelectionNote(packageType: BookingPackageType, guestCount: number, checkIn: string, checkOut: string) {
  if (packageType === "villa_18" && guestCount < 18 && hasSaturdayStayNight(checkIn, checkOut)) {
    return "此住宿期間包含週六，可選擇 18 人包棟；未滿 18 位入住仍依 18 人包棟房價計算。";
  }
  return "";
}

function getQuoteUnavailableMessage(reason?: string) {
  if (reason === "saturday_small_package_unavailable") {
    return "此住宿期間包含週六，週六不提供小包棟方案，請選擇 18 人包棟。";
  }
  if (reason === "guest_count_requires_full_villa") {
    return "18 位以上入住請選擇 18 人包棟方案。";
  }
  if (reason === "full_villa_requires_18_guests") {
    return "18 人包棟適用於 18 位以上入住；住宿期間包含週六時則不受此限制。";
  }
  if (reason === "unsupported_guest_count") {
    return "目前最多可接待 23 位入住。";
  }
  return "目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。";
}

function buildNightlyGroups(nightly: BookingPricingBreakdownNight[] = []) {
  return nightly.reduce<Array<{ key: string; label: string; amount: number; nights: BookingPricingBreakdownNight[] }>>(
    (groups, night) => {
      const key = [
        night.dayType,
        night.price,
        night.pricingGuestCount,
        night.packageType,
      ].join("|");
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.nights.push(night);
        return groups;
      }
      groups.push({
        key,
        label: night.dayTypeLabel,
        amount: night.price,
        nights: [night],
      });
      return groups;
    },
    []
  );
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
  const [form, setForm] = useState<BookingForm>(() => getInitialBookingForm());
  const [settings, setSettings] = useState<PublicBookingSettings>(() => ({ ...DEFAULT_BOOKING_SETTINGS }));
  const [bookingCopy, setBookingCopy] = useState<BookingCmsCopy>(fallbackBookingCopy);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(resolveEarliestBookingDate(todayText())));
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [calendarDaySources, setCalendarDaySources] = useState<NonNullable<BookingCalendarResult["days"]>>([]);
  const [calendarFilter, setCalendarFilter] = useState<BookingCalendarFilter>("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [selectionMode, setSelectionMode] = useState<CalendarSelectionMode>("checkIn");
  const [hoverPreviewDate, setHoverPreviewDate] = useState("");
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(0);
  const [expandedPackageType, setExpandedPackageType] = useState<BookingPackageType | null>(() =>
    form.selected_package_quantity === 1 ? form.selected_package_type : null
  );
  const [maxDate, setMaxDate] = useState(() => addMonthsToDate(todayText(), DEFAULT_BOOKING_SETTINGS.bookingWindowMonths));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [priceQuote, setPriceQuote] = useState<BookingPriceQuoteResult | null>(null);
  const [priceQuoteError, setPriceQuoteError] = useState("");
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
  const peoplePanelRef = useRef<HTMLElement | null>(null);
  const contactFormRef = useRef<HTMLFormElement | null>(null);

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
  const guestSummary = [
    `${form.adults} 位成人`,
    form.children > 0 ? `${form.children} 位孩童` : null,
    form.infants > 0 ? `${form.infants} 位嬰幼兒` : null,
  ].filter(Boolean).join("｜");
  const contactDetailsComplete = Boolean(form.guest_name.trim() && isValidEmail(form.email) && isValidPhone(form.phone));
  const canShowStayOptions = bookingIsOpen && selectedIsAvailable && !submittedRequestId;
  const selectedPackageQuantity = form.selected_package_quantity;
  const selectedPackageLabel = getPackageLabel(form.selected_package_type);
  const guestCount = form.adults + form.children;
  const selectedPackageUnavailableReason = getPackageUnavailableReason(
    form.selected_package_type,
    guestCount,
    form.check_in,
    form.check_out
  );
  const selectedPackageSelectionNote = getPackageSelectionNote(
    form.selected_package_type,
    guestCount,
    form.check_in,
    form.check_out
  );
  const canShowOrderSummary = canShowStayOptions && selectedPackageQuantity === 1 && !selectedPackageUnavailableReason;
  const guestCountExceedsLimit = guestCount > MAX_BOOKING_PRICING_GUESTS;
  const quoteReady = priceQuote?.pricing.status === "resolved";
  const quoteTotal = quoteReady ? priceQuote?.pricing.total ?? null : null;
  const quoteNights = priceQuote?.pricing.breakdown || [];
  const quoteHasExtraBeds = quoteNights.some((night) => (night.extraBedCount || 0) > 0);
  const quoteDepositRatePercent =
    quoteReady && priceQuote?.pricing.depositRate != null ? Math.round(priceQuote.pricing.depositRate * 100) : null;
  const quoteBalanceRatePercent = quoteDepositRatePercent == null ? null : 100 - quoteDepositRatePercent;
  const nightlyGroups = buildNightlyGroups(quoteNights);
  const showGroupedNightly = false;
  const canProceedToContact = canShowOrderSummary && !guestCountExceedsLimit && quoteReady && !isQuoteLoading && !priceQuoteError;
  const canShowContactForm = canShowOrderSummary && showContactForm;
  const activeGalleryImage = bookingGalleryImages[selectedGalleryIndex] || bookingGalleryImages[0];

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
    if (isCalendarLoading || form.selected_package_quantity === 0) return;
    if (bookingIsOpen && form.check_in && form.check_out && selectedRangeIssue === "ok") return;

    setForm((current) =>
      current.selected_package_quantity === 0
        ? current
        : {
            ...current,
            selected_package_quantity: 0,
          }
    );
    setShowContactForm(false);
    if (form.check_in && form.check_out && selectedRangeIssue !== "ok") {
      setError("日期或房況已變更，請重新確認可預約日期後再選擇方案。");
    }
  }, [bookingIsOpen, form.check_in, form.check_out, form.selected_package_quantity, isCalendarLoading, selectedRangeIssue]);

  useEffect(() => {
    if (form.selected_package_quantity === 0 || !selectedPackageUnavailableReason) return;
    setForm((current) =>
      current.selected_package_quantity === 0
        ? current
        : {
            ...current,
            selected_package_quantity: 0,
          }
    );
    setShowContactForm(false);
    setPriceQuote(null);
    setPriceQuoteError("");
    setError(selectedPackageUnavailableReason);
  }, [form.selected_package_quantity, selectedPackageUnavailableReason]);

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
      setPriceQuoteError("目前最多可接待 23 位入住。");
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
      packageType: form.selected_package_type,
      adults: form.adults,
      children: form.children,
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
    form.room_count,
    form.selected_package_type,
    form.stay_type,
    guestCountExceedsLimit,
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
        selected_package_type: "villa_10",
        selected_package_quantity: 0,
        room_count: stayType === "villa" ? settings.totalRoomCount : clampRoomCount(current.room_count, settings.totalRoomCount),
      };
    });
    setShowContactForm(false);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    setSelectionMode("checkIn");
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

  function handlePackageQuantityChange(nextQuantity: number) {
    const quantity = Math.min(Math.max(nextQuantity, 0), 1);
    setForm((current) => ({ ...current, selected_package_quantity: quantity }));
    if (quantity === 0) {
      setShowContactForm(false);
    }
    setMessage("");
    setError("");
  }

  function handlePackageSelect(packageType: BookingPackageType) {
    const unavailableReason = getPackageUnavailableReason(packageType, guestCount, form.check_in, form.check_out);
    if (unavailableReason) {
      setExpandedPackageType(packageType);
      setMessage("");
      setError(unavailableReason);
      return;
    }
    setForm((current) => ({
      ...current,
      selected_package_type: packageType,
      selected_package_quantity: 1,
    }));
    setShowContactForm(false);
    setMessage("");
    setError("");
  }

  function togglePackageDetails(packageType: BookingPackageType) {
    setExpandedPackageType((current) => (current === packageType ? null : packageType));
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
      setError("目前最多可接待 23 位入住。");
      return;
    }
    if (selectedPackageUnavailableReason) {
      setError(selectedPackageUnavailableReason);
      return;
    }
    if (selectedPackageQuantity !== 1) {
      setError("請先選擇包棟方案。");
      return;
    }
    if (!quoteReady || isQuoteLoading || priceQuoteError) {
      setError("目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。");
      return;
    }

    setShowContactForm(true);
    setCalendarOpen(false);
    setPeopleOpen(false);
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => {
      contactFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedRangeIssue !== "ok") {
      setError(rangeIssueMessage(form.stay_type, selectedRangeIssue));
      return;
    }
    if (guestCountExceedsLimit) {
      setError("目前最多可接待 23 位入住。");
      return;
    }
    if (selectedPackageUnavailableReason) {
      setError(selectedPackageUnavailableReason);
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
    try {
      const payload: BookingRequestPayload = {
        guest_name: form.guest_name,
        email: form.email,
        phone: form.phone,
        check_in: form.check_in,
        check_out: form.check_out,
        stay_type: form.stay_type,
        selected_package_type: form.selected_package_type,
        adults: form.adults,
        children: form.children,
        room_count: form.stay_type === "villa" ? settings.totalRoomCount : form.room_count,
        has_pets: false,
        pet_count: 0,
        pet_type: "",
        pet_notes: "",
        notes: buildBookingRequestNotes(form.notes, form.infants),
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
      <main className="overflow-x-clip px-3 pb-16 pt-32 sm:px-4 md:px-8 md:pt-40">
        <div className="mx-auto mb-4 flex w-full max-w-6xl min-w-0 flex-col gap-3 rounded-[12px] border border-[#eadfce] bg-white/80 px-4 py-3 text-sm text-stone-600 shadow-sm md:flex-row md:items-center md:justify-between">
          <span>測試模式｜目前訂房系統尚未正式開放</span>
          <button
            type="button"
            className="self-start text-xs font-medium text-stone-500 underline underline-offset-4 transition hover:text-[#765d4a] md:self-auto"
            onClick={handleExitBookingTest}
          >
            退出測試
          </button>
        </div>
        <section className="mx-auto w-full max-w-6xl min-w-0">
          <div className="w-full min-w-0 rounded-[24px] border border-[#eadfce] bg-white/90 p-5 shadow-sm md:p-6">
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
            className="relative mt-6 w-full max-w-full min-w-0 rounded-[20px] border border-[#eadfce] bg-white p-3 shadow-sm md:p-4"
          >
            <div className="mb-3 max-w-full min-w-0 rounded-[12px] border border-[#ead9bd] bg-[#fff8ea] px-3 py-2 text-sm leading-6 text-stone-700 md:flex md:flex-wrap md:items-center md:gap-3">
              <p className="font-semibold text-[#765d4a]">試營運預約｜{MIN_BOOKING_DATE_LABEL} 起開放入住</p>
              <p className="text-stone-600">目前可預約 {MIN_BOOKING_DATE_LABEL} 起的住宿日期。</p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
              <button
                type="button"
                className={cn(
                  "min-h-[72px] min-w-0 rounded-[14px] border px-4 py-3 text-left transition hover:border-[#b7957c] hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-[#eadfce]",
                  calendarOpen && selectionMode === "checkIn"
                    ? "border-[#8b6f5b] bg-[#fff8ea] shadow-[inset_0_-3px_0_rgba(139,111,91,0.18)]"
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
                  "min-h-[72px] min-w-0 rounded-[14px] border px-4 py-3 text-left transition hover:border-[#b7957c] hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-[#eadfce]",
                  calendarOpen && selectionMode === "checkOut"
                    ? "border-[#8b6f5b] bg-[#fff8ea] shadow-[inset_0_-3px_0_rgba(139,111,91,0.18)]"
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
              <button
                type="button"
                className={cn(
                  "col-span-2 min-h-[72px] min-w-0 rounded-[14px] border px-4 py-3 text-left transition hover:border-[#b7957c] hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-[#eadfce] lg:col-span-1",
                  peopleOpen ? "border-[#8b6f5b] bg-[#fff8ea]" : "border-[#eadfce] bg-[#fffdf9]"
                )}
                onClick={togglePeoplePopover}
                aria-expanded={peopleOpen}
              >
                <span className="block text-xs font-medium text-stone-500">入住人數</span>
                <span className="mt-1 block text-base font-semibold text-stone-900">{guestCount} 位</span>
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
                      <p className="mt-0.5 text-xs text-stone-500">13歲以上</p>
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
                        disabled={guestCount >= MAX_BOOKING_PRICING_GUESTS}
                        onClick={() => updateField("adults", Math.min(form.adults + 1, MAX_BOOKING_PRICING_GUESTS - form.children))}
                        aria-label="成人增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">孩童</p>
                      <p className="mt-0.5 text-xs text-stone-500">2～12歲</p>
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
                        disabled={guestCount >= MAX_BOOKING_PRICING_GUESTS}
                        onClick={() => updateField("children", Math.min(form.children + 1, MAX_BOOKING_PRICING_GUESTS - form.adults))}
                        aria-label="孩童增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[#eadfce] bg-[#fffdf9] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800">嬰幼兒</p>
                      <p className="mt-0.5 text-xs text-stone-500">0～1歲</p>
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
                        disabled={form.infants >= 30}
                        onClick={() => updateField("infants", form.infants + 1)}
                        aria-label="嬰幼兒增加"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 rounded-[10px] border border-[#eadfce] bg-[#fffaf3] px-3 py-2 text-xs leading-5 text-stone-500">
                  目前最多可接待 {MAX_BOOKING_PRICING_GUESTS} 位入住；嬰幼兒不計入住宿計價人數。
                </p>
              </section>
            )}
          </div>

          {!calendarOpen && !peopleOpen && (message || error) && (
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
            <section className="mt-6 w-full max-w-full min-w-0 overflow-hidden rounded-[16px] border border-[#efe5d8] bg-white shadow-[0_10px_28px_rgba(120,90,65,0.05)]">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="grid min-w-0 content-start grid-cols-[minmax(0,1fr)] gap-6 border-b border-[#efe5d8] p-4 min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:p-5">
                  <div className="min-w-0">
                    <div className="w-full min-w-0 overflow-hidden rounded-[16px] bg-[#fbf7f1]">
                      <img
                        src={activeGalleryImage.src}
                        alt={activeGalleryImage.alt}
                        className="block aspect-[4/3] w-full max-w-full object-cover sm:aspect-[16/10] lg:aspect-[4/3]"
                      />
                    </div>
                    <div className="mt-3 flex w-full max-w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1">
                      {bookingGalleryImages.map((image, index) => (
                        <button
                          key={image.src}
                          type="button"
                          className={cn(
                            "h-16 w-20 flex-none overflow-hidden rounded-[10px] border transition",
                            selectedGalleryIndex === index
                              ? "border-[#8b6f5b] ring-2 ring-[#eadfce]"
                              : "border-[#eadfce] hover:border-[#b7957c]"
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
                    <p className="text-xs font-medium text-stone-500">設施</p>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {bookingAmenityLabels.map((amenity) => (
                        <span
                          key={amenity}
                          className="max-w-full break-words rounded-full border border-[#eadfce] bg-[#fbf7f1] px-3 py-1 text-xs font-medium text-[#765d4a]"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 border-t border-[#eadfce] pt-5">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">包棟方案</p>
                      <p className="mt-1 text-sm text-stone-600">
                        選擇適合本次入住的包棟方案。
                      </p>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      {bookingPackageOptions.map((option) => {
                        const selected = form.selected_package_type === option.value && selectedPackageQuantity === 1;
                        const expanded = expandedPackageType === option.value;
                        const unavailableReason = getPackageUnavailableReason(option.value, guestCount, form.check_in, form.check_out);
                        const selectionNote = getPackageSelectionNote(option.value, guestCount, form.check_in, form.check_out);
                        const unavailable = Boolean(unavailableReason);
                        const detailsId = `booking-package-${option.value}-details`;
                        return (
                          <div
                            key={option.value}
                            className={cn(
                              "min-w-0 overflow-hidden rounded-[12px] border transition",
                              unavailable
                                ? "border-[#eadfce] bg-[#fbf7f1] text-stone-500"
                                : "",
                              selected
                                ? "border-[#b7957c] bg-[#fffaf3]"
                                : unavailable
                                  ? ""
                                  : "border-[#eadfce] bg-white hover:border-[#d7c5b2]"
                            )}
                          >
                            <button
                              type="button"
                              className="flex w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#fffaf3] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#eadfce]"
                              onClick={() => togglePackageDetails(option.value)}
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              aria-pressed={selected}
                              aria-disabled={unavailable}
                            >
                              <span className="min-w-0">
                                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className={cn("text-base font-semibold", unavailable ? "text-stone-500" : "text-stone-900")}>{option.label}</span>
                                  {selected && (
                                    <span className="rounded-full bg-[#eadfce] px-2 py-0.5 text-[11px] font-medium text-[#765d4a]">
                                      已選擇
                                    </span>
                                  )}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-stone-500">{option.description}</span>
                              </span>
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 flex-none text-[#8b6f5b] transition-transform",
                                  expanded ? "rotate-90" : ""
                                )}
                                aria-hidden="true"
                              />
                            </button>
                            {unavailableReason && (
                              <p className="border-t border-[#eadfce] bg-[#fffaf3] px-4 py-2 text-xs leading-5 text-[#765d4a]">
                                {unavailableReason}
                              </p>
                            )}
                            {expanded && (
                              <div
                                id={detailsId}
                                className="border-t border-[#eadfce] bg-[#fffdf9] px-4 py-4 text-sm leading-7 text-stone-600"
                              >
                                <BookingPackageDetails packageType={option.value} />
                                {selectionNote && (
                                  <p className="mt-3 rounded-[10px] border border-[#eadfce] bg-white px-3 py-2 text-xs leading-5 text-stone-500">
                                    {selectionNote}
                                  </p>
                                )}
                                <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-[#eadfce] pt-4 sm:flex-row sm:items-center sm:justify-between">
                                  <span className="text-sm font-medium text-stone-700">選擇此方案</span>
                                  <div className="grid w-full max-w-full grid-cols-[40px_minmax(0,1fr)_40px] items-center rounded-full border border-[#d7c5b2] bg-white px-2 py-1.5 sm:w-[160px]">
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                                      disabled={!selected}
                                      onClick={() => handlePackageQuantityChange(0)}
                                      aria-label={`取消${option.label}`}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="min-w-0 text-center text-base font-semibold text-stone-900">
                                      {selected ? selectedPackageQuantity : 0}
                                    </span>
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7c5b2] text-stone-700 transition hover:bg-[#f7f1e9] disabled:cursor-not-allowed disabled:opacity-40"
                                      disabled={selected || unavailable}
                                      onClick={() => handlePackageSelect(option.value)}
                                      aria-label={`選擇${option.label}`}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
                <div className="grid min-w-0 content-start grid-cols-[minmax(0,1fr)] gap-5 p-4 md:p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">STAY</p>
                    <h2 className="mt-2 font-serif text-3xl font-light text-stone-900">
                      {form.stay_type === "villa" ? "包棟" : "單間住宿"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                      依目前選擇的日期與人數，送出後由我們確認房況及訂房細節。
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-4 text-sm text-stone-600">
                    <div className="border-t border-[#eadfce] pt-4">
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

                    <div>
                      <p className="text-xs font-medium text-stone-500">住宿方式</p>
                      <p className="mt-1 break-words font-semibold text-stone-900">{stayTypeDisplay(form.stay_type)}</p>
                    </div>

                    <div className="border-t border-[#eadfce] pt-4">
                      {!canShowOrderSummary ? (
                        <p className="text-sm leading-6 text-stone-500">請選擇左側包棟方案。</p>
                      ) : (
                        <div className="grid min-w-0 gap-4">
                          <div>
                            <p className="text-xs font-medium text-stone-500">已選方案</p>
                            <p className="mt-1 font-semibold text-stone-900">{selectedPackageLabel}</p>
                            {selectedPackageSelectionNote && (
                              <p className="mt-1 text-xs leading-5 text-stone-500">{selectedPackageSelectionNote}</p>
                            )}
                          </div>

                          <div className="grid min-w-0 gap-3 border-t border-[#eadfce] pt-4">
                            <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                              <p className="text-xs font-medium text-stone-500">住宿費用</p>
                              {isQuoteLoading && <span className="text-xs text-stone-500">房價計算中…</span>}
                            </div>

                            {priceQuoteError && (
                              <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                                {priceQuoteError}
                              </div>
                            )}

                            {quoteReady && showGroupedNightly && nightlyGroups[0] && (
                              <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-stone-900">{nightlyGroups[0].label}</p>
                                  <p className="mt-0.5 text-xs text-stone-500">
                                    {quoteNights[0]?.packageLabel || selectedPackageLabel}｜計價人數 {quoteNights[0]?.pricingGuestCount} 人
                                  </p>
                                </div>
                                <p className="shrink-0 whitespace-nowrap font-semibold text-stone-900 sm:text-right">
                                  {formatTwd(nightlyGroups[0].amount)} × {nightlyGroups[0].nights.length} 晚
                                </p>
                              </div>
                            )}

                            {quoteReady && quoteHasExtraBeds && (
                              <div className="grid gap-3">
                                {quoteNights.map((night) => (
                                  <div key={night.date} className="grid gap-2 border-b border-[#eadfce] pb-3 last:border-b-0 last:pb-0">
                                    <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-stone-900">
                                          {formatCompactDate(night.date)} {night.dayTypeLabel}
                                          {night.specialDateLabel ? "｜" + night.specialDateLabel : ""}
                                        </p>
                                        <p className="mt-0.5 text-xs text-stone-500">
                                          {night.packageLabel}｜計價人數 {night.actualGuestCount} 人
                                        </p>
                                      </div>
                                      <p className="shrink-0 whitespace-nowrap font-semibold text-stone-900 sm:text-right">{formatTwd(night.price)}</p>
                                    </div>

                                    <div className="grid gap-1 rounded-[10px] bg-[#fffdf9] px-3 py-2 text-xs leading-5 text-stone-600">
                                      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                        <span>基本住宿費｜{night.baseGuestCount ?? night.pricingGuestCount} 人包棟</span>
                                        <span className="shrink-0 whitespace-nowrap font-medium text-stone-800">
                                          {formatTwd(night.basePrice ?? night.price)}
                                        </span>
                                      </div>
                                      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                        <span>
                                          單人加床 {(night.extraBedCount || 0)} 張｜{(night.extraBedCount || 0)} 位 ×{" "}
                                          {formatTwd(night.extraBedUnitPrice || 0)}
                                        </span>
                                        <span className="shrink-0 whitespace-nowrap font-medium text-stone-800">
                                          {formatTwd(night.extraBedAmount || 0)}
                                        </span>
                                      </div>
                                      {(night.discountAmount || 0) > 0 && (
                                        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                          <span>平日連住第 2 晚 95 折</span>
                                          <span className="shrink-0 whitespace-nowrap font-medium text-[#9b6f4c]">
                                            {formatNegativeTwd(night.discountAmount)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="grid gap-1 border-t border-[#eadfce] pt-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                        <span>本晚小計</span>
                                        <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">
                                          {formatTwd(night.price)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {quoteReady && !quoteHasExtraBeds && !showGroupedNightly && (
                              <div className="grid gap-3">
                                {quoteNights.map((night) => (
                                  <div key={night.date} className="grid gap-2 border-b border-[#eadfce] pb-3 last:border-b-0 last:pb-0">
                                    <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-stone-900">
                                          {formatCompactDate(night.date)} {night.dayTypeLabel}
                                          {night.specialDateLabel ? "｜" + night.specialDateLabel : ""}
                                        </p>
                                        <p className="mt-0.5 text-xs text-stone-500">
                                          {night.packageLabel}｜計價人數 {night.pricingGuestCount} 人
                                        </p>
                                      </div>
                                      <p className="shrink-0 whitespace-nowrap font-semibold text-stone-900 sm:text-right">{formatTwd(night.price)}</p>
                                    </div>
                                    {(night.discountAmount || 0) > 0 && (
                                      <div className="grid gap-1 rounded-[10px] bg-[#fffdf9] px-3 py-2 text-xs leading-5 text-stone-600">
                                        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                          <span>折扣前小計</span>
                                          <span className="shrink-0 whitespace-nowrap font-medium text-stone-800">
                                            {formatTwd(night.preDiscountPrice ?? night.price)}
                                          </span>
                                        </div>
                                        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                                          <span>平日連住第 2 晚 95 折</span>
                                          <span className="shrink-0 whitespace-nowrap font-medium text-[#9b6f4c]">
                                            {formatNegativeTwd(night.discountAmount)}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {quoteReady && (
                              <div className="border-t border-[#eadfce] pt-3">
                                <div className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                                  <span className="font-medium text-stone-600">住宿小計</span>
                                  <span className="shrink-0 whitespace-nowrap font-semibold text-stone-900">{formatTwd(priceQuote?.pricing.subtotal)}</span>
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
            </section>
          )}

          {canShowContactForm && (
            <form ref={contactFormRef} className="mt-6 w-full max-w-full min-w-0 scroll-mt-24 rounded-[20px] border border-[#eadfce] bg-white p-4 shadow-sm md:p-6" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-stone-900">聯絡資料</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-500">送出後，我們將與您確認房況及訂房細節。</p>
                </div>
                {contactDetailsComplete && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
              </div>

              <div className="mt-4 grid gap-4">
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                  姓名
                  <input className={fieldClassName()} value={form.guest_name} onChange={(event) => updateField("guest_name", event.target.value)} />
                </label>
                <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                    Email
                    <input className={fieldClassName()} type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                  </label>
                  <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                    電話
                    <input className={fieldClassName()} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                  </label>
                </div>
                <label className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
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
