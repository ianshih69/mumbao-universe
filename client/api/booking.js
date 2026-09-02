import { createHash, randomBytes } from "node:crypto";
import {
  firstQueryValue,
  getServerEnv,
  getSupabaseConfig,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../server/shopShared.js";
import {
  buildBookingPricingSnapshot,
  calculateBookingQuote,
} from "../server/bookingPricing/index.js";
import {
  bookingGuestRules,
  resolveBookingGuestPlan,
  resolveBookingPetPlan,
} from "../src/lib/bookings/bookingGuestRules.js";
import {
  getBookingBankTransferSettings,
  publicBankTransferSettings,
} from "../server/bookingPayments/config.js";

const DEFAULT_BOOKING_SETTINGS = {
  bookingWindowMonths: 6,
  allowVillaBooking: true,
  allowRoomBooking: false,
  totalRoomCount: 5,
  allowPets: true,
};
const VALID_STAY_TYPES = new Set(["villa", "room"]);
const VALID_PET_TYPES = new Set(["dog"]);

function makeRequestId() {
  return `booking-public-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBookingRecoveryToken() {
  return randomBytes(32).toString("base64url");
}

function hashBookingRecoveryToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isBookingRecoveryToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || String(req.socket?.remoteAddress || "").trim() || "unknown";
}

function paymentRateLimitKey(req) {
  return createHash("sha256")
    .update(`booking-payment-report:${getRequestIp(req)}`, "utf8")
    .digest("hex");
}

function httpError(status, message, code = "request_failed") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getOptionalBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function getOptionalCustomerProfile(req) {
  const accessToken = getOptionalBearerToken(req);
  if (!accessToken) return null;

  const { serviceRoleKey } = getSupabaseConfig();
  const supabaseUrl = getServerEnv("SUPABASE_URL").replace(/\/$/, "");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user?.id) return null;

  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(
      user.id,
    )}&select=id,email,coupon_code&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

function parseInteger(value, fallback = null) {
  if (value === "" || value === undefined || value === null) return fallback;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : Number.NaN;
}

function parseNonNegativeInteger(value, fallback = 0) {
  const parsed = parseInteger(value, fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function normalizeDate(value) {
  const raw = cleanText(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return raw;
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

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(dateText, months) {
  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function bookingWindowLabel(months) {
  return `${months} 個月`;
}

function normalizeBookingSettings(row) {
  const monthValue = Number(row?.booking_window_months);
  const bookingWindowMonths = Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 24
    ? monthValue
    : DEFAULT_BOOKING_SETTINGS.bookingWindowMonths;

  return {
    bookingWindowMonths,
    allowVillaBooking: typeof row?.allow_villa_booking === "boolean"
      ? row.allow_villa_booking
      : DEFAULT_BOOKING_SETTINGS.allowVillaBooking,
    allowRoomBooking: typeof row?.allow_room_booking === "boolean"
      ? row.allow_room_booking
      : DEFAULT_BOOKING_SETTINGS.allowRoomBooking,
    totalRoomCount: DEFAULT_BOOKING_SETTINGS.totalRoomCount,
    allowPets: typeof row?.allow_pets === "boolean"
      ? row.allow_pets
      : DEFAULT_BOOKING_SETTINGS.allowPets,
  };
}

function publicSettings(settings) {
  return {
    bookingWindowMonths: settings.bookingWindowMonths,
    bookingWindowLabel: bookingWindowLabel(settings.bookingWindowMonths),
    allowVillaBooking: settings.allowVillaBooking,
    allowRoomBooking: settings.allowRoomBooking,
    totalRoomCount: settings.totalRoomCount,
    allowPets: settings.allowPets,
  };
}

function selectedRoomOptionPayload(roomOption) {
  if (!roomOption) return null;
  return {
    id: roomOption.id,
    double_room_count: roomOption.doubleRoomCount,
    quad_room_count: roomOption.quadRoomCount,
    room_count: roomOption.roomCount,
    double_bed_count: roomOption.doubleBedCount,
    single_bed_count: roomOption.singleBedCount || 0,
    sleep_capacity: roomOption.sleepCapacity,
  };
}

function breakfastSelectionPayload(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        date: entry.date,
        quantity: entry.quantity,
      }))
    : [];
}

function maskBookingEmail(email) {
  const [name, domain] = String(email || "").trim().split("@");
  if (!name || !domain) return email ? "******" : "-";
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
}

function maskBookingPhone(phone) {
  const compact = String(phone || "").replace(/\s+/g, "");
  if (!compact) return "-";
  if (compact.length <= 4) return `${compact.slice(0, 1)}***`;
  return `${compact.slice(0, 2)}${"*".repeat(Math.max(compact.length - 4, 3))}${compact.slice(-2)}`;
}

function buildSubmittedBookingSnapshot({ pricingSnapshot, stayDetails, quote, guestEmail, guestPhone }) {
  return {
    pricing: {
      quotedTotal: pricingSnapshot.quoted_total,
      depositRate: pricingSnapshot.deposit_rate,
      depositAmount: pricingSnapshot.deposit_amount,
      balanceAmount: pricingSnapshot.balance_amount,
      pricingBreakdown: pricingSnapshot.pricing_breakdown,
    },
    summary: {
      adultCount: stayDetails.adults,
      childCount: stayDetails.children,
      infantCount: stayDetails.infants,
      dogUnder10kgCount: quote.pricing.dogUnder10kgCount || 0,
      dog10To20kgCount: quote.pricing.dog10To20kgCount || 0,
      dogOver20kgCount: quote.pricing.dogOver20kgCount || 0,
      dogCount: quote.pricing.dogCount || 0,
      nightCount: quote.nights,
      selectedRoomOption: quote.pricing.selectedRoomOption || null,
      breakfastAddonEntries: breakfastSelectionPayload(quote.pricing.breakfastAddonEntries),
    },
    contact: {
      maskedEmail: maskBookingEmail(guestEmail),
      maskedPhone: maskBookingPhone(guestPhone),
    },
  };
}

function buildPaymentResponse({ request, databaseNow, paymentRecord = null, settings }) {
  const publicSettings = publicBankTransferSettings(settings);
  if (!publicSettings.enabled) return publicSettings;

  return {
    ...publicSettings,
    status: request?.status || null,
    serverNow: databaseNow || null,
    holdExpiresAt: request?.hold_expires_at || null,
    paymentReportedAt: request?.payment_reported_at || null,
    reviewExpiresAt: request?.review_expires_at || null,
    report: paymentRecord
      ? {
          status: paymentRecord.status || null,
          bankLast5: paymentRecord.bank_last5 || null,
          payerName: paymentRecord.payer_name || null,
          reportedAt: paymentRecord.reported_at || null,
          verifiedAt: paymentRecord.verified_at || null,
        }
      : null,
  };
}

function isBreakfastAddonError(reason) {
  return typeof reason === "string" && reason.startsWith("invalid_breakfast_addon");
}

function breakfastAddonErrorMessage(reason) {
  if (reason === "invalid_breakfast_addon_date") return "早餐日期不在本次住宿可加購範圍內。";
  if (reason === "invalid_breakfast_addon_quantity") return "早餐份數不正確。";
  return "早餐加購資料不正確。";
}

async function loadBookingSettings() {
  try {
    const rows = await supabaseRequest(
      "/booking_settings?id=eq.1&select=booking_window_months,allow_villa_booking,allow_room_booking,total_room_count,allow_pets&limit=1"
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return normalizeBookingSettings(row);
  } catch (error) {
    console.warn("[booking] settings fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
    return normalizeBookingSettings(null);
  }
}

function maxBookableDate(settings) {
  return addMonthsClamped(todayText(), settings.bookingWindowMonths);
}

function validateDateRange(checkIn, checkOut, settings) {
  const normalizedCheckIn = normalizeDate(checkIn);
  const normalizedCheckOut = normalizeDate(checkOut);

  if (!normalizedCheckIn || !normalizedCheckOut) {
    throw httpError(400, "請選擇正確的入住與退房日期。", "invalid_dates");
  }

  if (normalizedCheckIn < todayText()) {
    throw httpError(400, "入住日期不可早於今天。", "date_in_past");
  }

  if (normalizedCheckOut > maxBookableDate(settings)) {
    throw httpError(
      400,
      `目前只開放未來 ${bookingWindowLabel(settings.bookingWindowMonths)} 內預約。`,
      "date_too_far"
    );
  }

  if (normalizedCheckOut <= normalizedCheckIn) {
    throw httpError(400, "退房日期必須晚於入住日期。", "invalid_date_range");
  }

  return { checkIn: normalizedCheckIn, checkOut: normalizedCheckOut };
}

async function findUnavailableRanges(checkIn, checkOut) {
  const ranges = await supabaseRpc("get_public_booking_unavailable_ranges", {
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  return Array.isArray(ranges) ? ranges : [];
}

function buildUnavailableDates(ranges, from, to) {
  const unavailableDates = new Set();
  for (const range of ranges) {
    let current = range.check_in < from ? from : range.check_in;
    while (current < range.check_out && current < to) {
      unavailableDates.add(current);
      current = addDays(current, 1);
    }
  }
  return [...unavailableDates].sort();
}

function defaultStayType(settings) {
  if (settings.allowVillaBooking) return "villa";
  if (settings.allowRoomBooking) return "room";
  return "";
}

function validateStayDetails(body, settings) {
  const selectedStayType = cleanText(body.stay_type, 20) || defaultStayType(settings);
  if (!VALID_STAY_TYPES.has(selectedStayType)) {
    throw httpError(400, "住宿方式不正確。", "invalid_stay_type");
  }

  if (!settings.allowVillaBooking && !settings.allowRoomBooking) {
    throw httpError(403, "目前暫未開放線上預約。", "booking_closed");
  }

  if (selectedStayType === "villa" && !settings.allowVillaBooking) {
    throw httpError(400, "目前暫未開放包棟 villa 線上預約。", "villa_booking_disabled");
  }

  if (selectedStayType === "room" && !settings.allowRoomBooking) {
    throw httpError(400, "目前暫未開放單間客房線上預約。", "room_booking_disabled");
  }

  const adults = parseInteger(body.adults, 2);
  const children = parseInteger(body.children, 0);
  const infants = parseInteger(body.infants, 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) {
    throw httpError(400, "成人至少需要 1 位。", "invalid_adults");
  }
  if (!Number.isInteger(children) || children < 0) {
    throw httpError(400, "孩童人數不正確。", "invalid_children");
  }
  if (!Number.isInteger(infants) || infants < 0) {
    throw httpError(400, "嬰幼兒人數不正確。", "invalid_infants");
  }

  const guestPlan = resolveBookingGuestPlan({ adults, children, infants });
  if (adults > bookingGuestRules.maxAdultCount) {
    throw httpError(400, "成人最多 20 位。", "adult_count_exceeds_capacity");
  }
  if (children > bookingGuestRules.maxChildCount) {
    throw httpError(400, "孩童最多 9 位。", "child_count_exceeds_capacity");
  }

  const dogUnder10kgCount = parseNonNegativeInteger(
    body.dog_under_10kg_count ?? body.dogUnder10kgCount ?? body.under10kgCount,
    0
  );
  const dog10To20kgCount = parseNonNegativeInteger(
    body.dog_10_to_20kg_count ?? body.dog10To20kgCount ?? body.midDogCount,
    0
  );
  const dogOver20kgCount = parseNonNegativeInteger(
    body.dog_over_20kg_count ?? body.dogOver20kgCount ?? body.over20kgCount,
    0
  );
  if (![dogUnder10kgCount, dog10To20kgCount, dogOver20kgCount].every(Number.isInteger)) {
    throw httpError(400, "狗狗數量不正確。", "invalid_dog_count");
  }
  const petPlan = resolveBookingPetPlan({
    dogUnder10kgCount,
    dog10To20kgCount,
    dogOver20kgCount,
  });

  let roomCount = selectedStayType === "villa" ? settings.totalRoomCount : parseInteger(body.room_count, null);
  if (selectedStayType === "room" && (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > settings.totalRoomCount)) {
    throw httpError(400, `單間客房數需為 1 到 ${settings.totalRoomCount} 間。`, "invalid_room_count");
  }

  const hasPets = petPlan.dogCount > 0 || body.has_pets === true;
  if (hasPets && !settings.allowPets) {
    throw httpError(400, "目前暫未開放攜帶寵物的線上申請。", "pet_booking_disabled");
  }

  let petCount = petPlan.dogCount > 0 ? petPlan.dogCount : null;
  let petType = petPlan.dogCount > 0 ? cleanText(body.pet_type, 20) || "dog" : null;
  const petNotes = hasPets ? cleanText(body.pet_notes, 500) : "";

  if (hasPets && petPlan.dogCount <= 0) {
    throw httpError(400, "攜帶狗狗時，請填寫狗狗重量級距數量。", "missing_dog_counts");
  }
  if (hasPets && (!Number.isInteger(petCount) || petCount < 1)) {
    throw httpError(400, "攜帶寵物時，寵物數量至少需要 1。", "invalid_pet_count");
  }
  if (hasPets && !VALID_PET_TYPES.has(petType)) {
    throw httpError(400, "目前僅開放狗狗入住。", "invalid_pet_type");
  }

  return {
    stayType: selectedStayType,
    adults,
    children,
    infants,
    roomCount,
    hasPets,
    petCount,
    petType,
    petNotes,
    dogUnder10kgCount,
    dog10To20kgCount,
    dogOver20kgCount,
    petPlan,
    guestCount: guestPlan.actualGuestCount,
    guestPlan,
  };
}

async function handleCalendar(req, res, requestId) {
  const settings = await loadBookingSettings();
  const from = normalizeDate(firstQueryValue(req.query?.from)) || todayText();
  const safeFrom = from < todayText() ? todayText() : from;
  const maxDate = maxBookableDate(settings);
  const to = maxDate;
  const ranges = safeFrom > maxDate ? [] : await findUnavailableRanges(safeFrom, to);

  sendJson(res, 200, {
    ok: true,
    requestId,
    from: safeFrom,
    to,
    maxDate,
    unavailableDates: buildUnavailableDates(ranges, safeFrom, to),
    settings: publicSettings(settings),
  });
}

async function handleAvailability(req, res, requestId) {
  const settings = await loadBookingSettings();
  const { checkIn, checkOut } = validateDateRange(
    firstQueryValue(req.query?.checkIn),
    firstQueryValue(req.query?.checkOut),
    settings
  );
  const unavailableRanges = await findUnavailableRanges(checkIn, checkOut);
  sendJson(res, 200, {
    ok: true,
    requestId,
    available: unavailableRanges.length === 0,
    checkIn,
    checkOut,
    settings: publicSettings(settings),
  });
}

async function handleQuote(req, res, requestId) {
  const settings = await loadBookingSettings();
  const { checkIn, checkOut } = validateDateRange(
    firstQueryValue(req.query?.checkIn || req.query?.check_in),
    firstQueryValue(req.query?.checkOut || req.query?.check_out),
    settings
  );
  const stayDetails = validateStayDetails(
    {
      stay_type: firstQueryValue(req.query?.stayType || req.query?.stay_type),
      adults: firstQueryValue(req.query?.adults),
      children: firstQueryValue(req.query?.children),
      infants: firstQueryValue(req.query?.infants),
      dogUnder10kgCount: firstQueryValue(req.query?.dogUnder10kgCount || req.query?.dog_under_10kg_count),
      dog10To20kgCount: firstQueryValue(req.query?.dog10To20kgCount || req.query?.dog_10_to_20kg_count),
      dogOver20kgCount: firstQueryValue(req.query?.dogOver20kgCount || req.query?.dog_over_20kg_count),
      selected_room_option_id: firstQueryValue(req.query?.selectedRoomOptionId || req.query?.selected_room_option_id),
      room_count: firstQueryValue(req.query?.roomCount || req.query?.room_count),
      breakfast_addons: firstQueryValue(req.query?.breakfastAddons || req.query?.breakfast_addons),
      has_pets: false,
    },
    settings
  );

  const quote = await calculateBookingQuote(
    {
      checkIn,
      checkOut,
      stayType: stayDetails.stayType,
      adults: stayDetails.adults,
      children: stayDetails.children,
      infants: stayDetails.infants,
      guestCount: stayDetails.guestCount,
      dogUnder10kgCount: stayDetails.dogUnder10kgCount,
      dog10To20kgCount: stayDetails.dog10To20kgCount,
      dogOver20kgCount: stayDetails.dogOver20kgCount,
      packageType: firstQueryValue(
        req.query?.packageType || req.query?.package_type || req.query?.selectedPackageType || req.query?.selected_package_type
      ),
      selectedRoomOptionId: firstQueryValue(req.query?.selectedRoomOptionId || req.query?.selected_room_option_id),
      breakfastAddons: firstQueryValue(req.query?.breakfastAddons || req.query?.breakfast_addons),
    },
    { supabaseRequest }
  );

  if (quote.pricing?.status === "unavailable" && isBreakfastAddonError(quote.pricing.reason)) {
    return sendJson(res, 400, {
      ok: false,
      requestId,
      error: quote.pricing.reason,
      code: quote.pricing.reason,
      message: breakfastAddonErrorMessage(quote.pricing.reason),
      pricing: quote.pricing,
    });
  }

  sendJson(res, 200, {
    ok: true,
    requestId,
    ...quote,
  });
}

async function handleRequest(req, res, requestId) {
  const settings = await loadBookingSettings();
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "請提供正確的預約申請資料。", "invalid_payload");
  }

  const { checkIn, checkOut } = validateDateRange(body.check_in, body.check_out, settings);
  const stayDetails = validateStayDetails(body, settings);
  const guestName = cleanText(body.guest_name, 80);
  const guestEmail = cleanText(body.email || body.guest_email, 160).toLowerCase();
  const guestPhone = cleanText(body.phone || body.guest_phone, 60);
  const notes = cleanText(body.notes, 1000);

  if (!guestName) throw httpError(400, "請填寫姓名。", "missing_guest_name");
  if (!guestEmail && !guestPhone) {
    throw httpError(400, "請至少留下 Email 或電話，方便我們聯繫。", "missing_contact");
  }
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    throw httpError(400, "Email 格式不正確。", "invalid_email");
  }

  const quote = await calculateBookingQuote(
    {
      checkIn,
      checkOut,
      stayType: stayDetails.stayType,
      adults: stayDetails.adults,
      children: stayDetails.children,
      infants: stayDetails.infants,
      guestCount: stayDetails.guestCount,
      dogUnder10kgCount: stayDetails.dogUnder10kgCount,
      dog10To20kgCount: stayDetails.dog10To20kgCount,
      dogOver20kgCount: stayDetails.dogOver20kgCount,
      packageType: body.selected_package_type || body.packageType || body.package_type || body.selectedPackageType,
      selectedRoomOptionId: body.selected_room_option_id || body.selectedRoomOptionId,
      breakfastAddons: body.breakfast_addons ?? body.breakfastAddons,
    },
    { supabaseRequest }
  );
  const pricingSnapshot = buildBookingPricingSnapshot(quote);
  if (!pricingSnapshot) {
    if (isBreakfastAddonError(quote.pricing?.reason)) {
      return sendJson(res, 400, {
        ok: false,
        requestId,
        error: quote.pricing.reason,
        code: quote.pricing.reason,
        message: breakfastAddonErrorMessage(quote.pricing.reason),
        pricing: quote.pricing,
      });
    }
    return sendJson(res, 409, {
      ok: false,
      requestId,
      error: "pricing_unavailable",
      code: "pricing_unavailable",
      message: "目前無法取得此住宿期間的房價，請重新選擇日期或聯絡我們。",
      pricing: quote.pricing,
    });
  }

  const customerProfile = await getOptionalCustomerProfile(req);
  const recoveryToken = createBookingRecoveryToken();
  const submittedSnapshot = buildSubmittedBookingSnapshot({
    pricingSnapshot,
    stayDetails,
    quote,
    guestEmail,
    guestPhone,
  });
  const bookingRequestPayload = {
    customer_profile_id: customerProfile?.id || null,
    guest_name: guestName,
    guest_email: guestEmail || null,
    guest_phone: guestPhone || null,
    check_in: checkIn,
    check_out: checkOut,
    guest_count: stayDetails.guestCount,
    stay_type: stayDetails.stayType,
    adults: stayDetails.adults,
    children: stayDetails.children,
    room_count: stayDetails.roomCount,
    has_pets: stayDetails.hasPets,
    pet_count: stayDetails.petCount,
    pet_type: stayDetails.petType,
    pet_notes: stayDetails.petNotes || null,
    notes: notes || null,
    selected_package_type: pricingSnapshot.selected_package_type,
    pricing_rule_set_id: pricingSnapshot.pricing_rule_set_id,
    quoted_total: pricingSnapshot.quoted_total,
    deposit_rate: pricingSnapshot.deposit_rate,
    deposit_amount: pricingSnapshot.deposit_amount,
    balance_amount: pricingSnapshot.balance_amount,
    pricing_breakdown: pricingSnapshot.pricing_breakdown,
    quoted_at: pricingSnapshot.quoted_at,
    recovery_token_hash: hashBookingRecoveryToken(recoveryToken),
    submitted_snapshot: submittedSnapshot,
    source: "official_site",
    raw_payload: {
      stay_type: stayDetails.stayType,
      adults: stayDetails.adults,
      children: stayDetails.children,
      infants: stayDetails.infants,
      room_count: stayDetails.roomCount,
      selected_package_type: pricingSnapshot.selected_package_type,
      selected_room_option_id: quote.pricing.selectedRoomOptionId || null,
      selected_room_option: selectedRoomOptionPayload(quote.pricing.selectedRoomOption),
      actual_guest_count: quote.guestCount,
      pricing_guest_count: quote.pricingGuestCount,
      regular_extra_adult_count: quote.pricing.regularExtraAdultCount,
      regular_extra_adult_fee_total: quote.pricing.regularExtraAdultFeeTotal,
      extra_adult_count: quote.pricing.extraAdultCount,
      extra_adult_unit_price: quote.pricing.extraAdultUnitPrice,
      extra_adult_fee_total: quote.pricing.extraAdultFeeTotal,
      extra_bed_adult_count: quote.pricing.extraBedAdultCount,
      extra_bed_adult_unit_price: quote.pricing.extraBedAdultUnitPrice,
      extra_bed_adult_fee_total: quote.pricing.extraBedAdultFeeTotal,
      chargeable_child_count: quote.pricing.chargeableChildCount,
      child_fee_total: quote.pricing.childFeeTotal,
      dog_under_10kg_count: quote.pricing.dogUnder10kgCount || 0,
      dog_10_to_20kg_count: quote.pricing.dog10To20kgCount || 0,
      dog_over_20kg_count: quote.pricing.dogOver20kgCount || 0,
      dog_count: quote.pricing.dogCount || 0,
      pet_fee_breakdown: quote.pricing.petFeeBreakdown || [],
      nightly_pet_fee_amount: quote.pricing.nightlyPetFeeAmount || 0,
      nightly_pet_fee_original_amount: quote.pricing.nightlyPetFeeOriginalAmount || 0,
      discounted_nightly_pet_fee_amount: quote.pricing.discountedNightlyPetFeeAmount || 0,
      discounted_pet_night_count: quote.pricing.discountedPetNightCount || 0,
      pet_fee_discount_rate: quote.pricing.petFeeDiscountRate || 0,
      pet_fee_original_total: quote.pricing.petFeeOriginalTotal || 0,
      pet_fee_discount_total: quote.pricing.petFeeDiscountTotal || 0,
      pet_fee_total: quote.pricing.petFeeTotal || 0,
      pet_deposit_amount: quote.pricing.petDepositAmount || 0,
      breakfast_addons: breakfastSelectionPayload(quote.pricing.breakfastAddonEntries),
      gift_quantity: quote.nights,
      room_plan_headcount: quote.pricing.roomPlanHeadcount,
      double_bed_count: quote.pricing.doubleBedCount,
      single_bed_count: quote.pricing.singleBedCount,
      room_count_min: quote.pricing.roomCountMin,
      room_count_max: quote.pricing.roomCountMax,
      has_pets: stayDetails.hasPets,
      pet_count: stayDetails.petCount || 0,
      pet_type: stayDetails.petType,
    },
  };

  const holdResult = await supabaseRpc("acquire_villa_booking_hold", {
    p_request: bookingRequestPayload,
  });
  if (!holdResult?.ok) {
    if (holdResult?.code === "booking_temporarily_held") {
      return sendJson(res, 409, {
        ok: false,
        requestId,
        error: "booking_temporarily_held",
        code: "booking_temporarily_held",
        message: "此日期目前正由其他旅客暫時保留中。對方有 15 分鐘完成付款。若未在期限內完成，系統將自動重新開放此日期。請稍後再確認房況。",
        hold_expires_at: holdResult.hold_expires_at || null,
        retry_after_seconds: Number.isInteger(holdResult.retry_after_seconds)
          ? holdResult.retry_after_seconds
          : null,
      });
    }
    return sendJson(res, 409, {
      ok: false,
      requestId,
      error: "date_unavailable",
      code: "date_unavailable",
      message: "這段日期目前無法預約，請重新選擇日期。",
    });
  }
  const request = holdResult.request;

  try {
    await supabaseRequest("/booking_availability_alerts", {
      method: "POST",
      body: JSON.stringify({
        severity: "review",
        alert_type: "website_booking_request",
        title: "官網預約申請待確認",
        description: `${guestName} 申請 ${checkIn} 至 ${checkOut}，${stayDetails.stayType === "villa" ? "包棟 villa" : `${stayDetails.roomCount} 間客房`}`,
        check_in: checkIn,
        check_out: checkOut,
        source: "website",
        notes: request?.id ? `booking_request_id=${request.id}` : null,
      }),
    });
  } catch (alertError) {
    console.warn("[booking] hold created but alert insert failed", {
      requestId,
      bookingRequestId: request?.id || null,
      message: alertError instanceof Error ? alertError.message : String(alertError),
    });
  }

  sendJson(res, 200, {
    ok: true,
    requestId,
    recoveryToken,
    request: {
      id: request?.id,
      booking_reference: request?.booking_reference || null,
      status: request?.status || "payment_hold",
      check_in: checkIn,
      check_out: checkOut,
      created_at: request?.created_at || null,
      hold_expires_at: request?.hold_expires_at || null,
      payment_reported_at: request?.payment_reported_at || null,
      review_expires_at: request?.review_expires_at || null,
    },
    payment: buildPaymentResponse({
      request,
      databaseNow: holdResult.database_now || null,
      settings: getBookingBankTransferSettings(),
    }),
    ...submittedSnapshot,
  });
}

async function handleRecovery(req, res, requestId) {
  const body = await readBody(req);
  const recoveryToken = body?.recoveryToken;
  if (!isBookingRecoveryToken(recoveryToken)) {
    throw httpError(400, "訂房恢復憑證格式不正確。", "invalid_booking_recovery_token");
  }

  const recovered = await supabaseRpc("recover_booking_hold", {
    p_recovery_token_hash: hashBookingRecoveryToken(recoveryToken),
  });
  if (!recovered?.ok) {
    return sendJson(res, 410, {
      ok: false,
      requestId,
      error: "booking_recovery_unavailable",
      code: "booking_recovery_unavailable",
      message: "此訂房保留已失效，請重新確認房況。",
    });
  }

  sendJson(res, 200, {
    requestId,
    ...recovered,
    payment: buildPaymentResponse({
      request: recovered.request,
      databaseNow: recovered.database_now || null,
      paymentRecord: recovered.payment_record || null,
      settings: getBookingBankTransferSettings(),
    }),
  });
}

async function handlePaymentReport(req, res, requestId) {
  const settings = getBookingBankTransferSettings();
  if (!settings.enabled) {
    throw httpError(404, "目前尚未開放銀行轉帳付款回報。", "bank_transfer_disabled");
  }

  const body = await readBody(req);
  const recoveryToken = body?.recoveryToken;
  if (!isBookingRecoveryToken(recoveryToken)) {
    throw httpError(400, "訂房恢復憑證格式不正確。", "invalid_booking_recovery_token");
  }

  const bankLast5 = cleanText(body?.bankLast5, 5);
  if (!/^\d{5}$/.test(bankLast5)) {
    throw httpError(400, "請填寫匯款帳號末五碼。", "invalid_bank_last5");
  }

  const recoveryTokenHash = hashBookingRecoveryToken(recoveryToken);
  const rateLimitResult = await supabaseRpc("consume_booking_payment_report_rate_limit", {
    p_key_hash: paymentRateLimitKey(req),
    p_limit: settings.reportRateLimit.attempts,
    p_window_seconds: settings.reportRateLimit.windowSeconds,
  });
  if (!rateLimitResult?.allowed) {
    const retryAfterSeconds = Number(rateLimitResult?.retry_after_seconds) || settings.reportRateLimit.windowSeconds;
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)));
    return sendJson(res, 429, {
      ok: false,
      requestId,
      error: "payment_report_rate_limited",
      code: "payment_report_rate_limited",
      message: "操作較頻繁，請稍後再試。",
      retry_after_seconds: retryAfterSeconds,
    });
  }

  const reported = await supabaseRpc("report_booking_bank_transfer", {
    p_recovery_token_hash: recoveryTokenHash,
    p_bank_last5: bankLast5,
    p_payer_name: cleanText(body?.payerName, 80) || null,
    p_notes: cleanText(body?.notes, 500) || null,
    p_review_minutes: settings.reviewMinutes,
  });

  if (!reported?.ok) {
    const code = reported?.code || "payment_report_failed";
    if (["booking_hold_expired", "payment_review_expired"].includes(code)) {
      return sendJson(res, 410, {
        ok: false,
        requestId,
        error: code,
        code,
        message: "本次付款保留時間已結束，請重新確認房況。",
      });
    }
    if (code === "booking_recovery_unavailable") {
      return sendJson(res, 410, {
        ok: false,
        requestId,
        error: code,
        code,
        message: "此訂房恢復憑證已失效，請重新確認房況。",
      });
    }
    if (code === "invalid_bank_last5") {
      throw httpError(400, "請填寫匯款帳號末五碼。", code);
    }
    return sendJson(res, 409, {
      ok: false,
      requestId,
      error: code,
      code,
      message: "目前無法回報這筆付款，請確認訂房狀態後再試。",
    });
  }

  sendJson(res, 200, {
    requestId,
    ...reported,
    payment: buildPaymentResponse({
      request: reported.request,
      databaseNow: reported.database_now || null,
      paymentRecord: reported.payment_record || null,
      settings,
    }),
  });
}

async function dispatch(req, res, requestId) {
  const action = firstQueryValue(req.query?.action) || "availability";
  if (req.method === "GET" && action === "calendar") return handleCalendar(req, res, requestId);
  if (req.method === "GET" && action === "availability") return handleAvailability(req, res, requestId);
  if (req.method === "GET" && action === "quote") return handleQuote(req, res, requestId);
  if (req.method === "POST" && action === "request") return handleRequest(req, res, requestId);
  if (req.method === "POST" && action === "recover") return handleRecovery(req, res, requestId);
  if (req.method === "POST" && action === "report-payment") return handlePaymentReport(req, res, requestId);
  throw httpError(404, "Unknown booking action.", "unknown_action");
}

export default async function handler(req, res) {
  const requestId = makeRequestId();
  try {
    await dispatch(req, res, requestId);
  } catch (error) {
    const status = error?.status || 500;
    console.error("[booking]", {
      requestId,
      status,
      code: error?.code || "internal_error",
      message: error instanceof Error ? error.message : String(error),
      stack: status >= 500 && error instanceof Error ? error.stack : undefined,
    });
    sendJson(res, status, {
      ok: false,
      requestId,
      error: error?.code || "internal_error",
      message: status >= 500 ? "系統暫時無法送出預約申請，請稍後再試。" : error.message,
    });
  }
}
