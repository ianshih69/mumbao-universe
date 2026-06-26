import {
  firstQueryValue,
  readBody,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const TOTAL_ROOM_COUNT = 5;
const MAX_BOOKING_DAYS_AHEAD = 365;
const VALID_STAY_TYPES = new Set(["villa", "room"]);
const VALID_PET_TYPES = new Set(["dog", "cat", "other"]);

function makeRequestId() {
  return `booking-public-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function parseInteger(value, fallback = null) {
  if (value === "" || value === undefined || value === null) return fallback;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : Number.NaN;
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

function maxBookableDate() {
  return addDays(todayText(), MAX_BOOKING_DAYS_AHEAD);
}

function validateDateRange(checkIn, checkOut) {
  const normalizedCheckIn = normalizeDate(checkIn);
  const normalizedCheckOut = normalizeDate(checkOut);

  if (!normalizedCheckIn || !normalizedCheckOut) {
    throw httpError(400, "請選擇有效的入住與退房日期。", "invalid_dates");
  }

  if (normalizedCheckIn < todayText()) {
    throw httpError(400, "入住日期不可早於今天。", "date_in_past");
  }

  if (normalizedCheckOut > maxBookableDate()) {
    throw httpError(400, "退房日期不可超過未來一年。", "date_too_far");
  }

  if (normalizedCheckOut <= normalizedCheckIn) {
    throw httpError(400, "退房日期必須晚於入住日期。", "invalid_date_range");
  }

  return { checkIn: normalizedCheckIn, checkOut: normalizedCheckOut };
}

async function findUnavailableRanges(checkIn, checkOut) {
  const [blocks, requests] = await Promise.all([
    supabaseRequest(
      `/booking_availability_blocks?status=eq.confirmed&check_in=lt.${encodeURIComponent(checkOut)}&check_out=gt.${encodeURIComponent(checkIn)}&select=id,check_in,check_out`
    ),
    supabaseRequest(
      `/booking_requests?status=in.(pending_review,confirmed)&check_in=lt.${encodeURIComponent(checkOut)}&check_out=gt.${encodeURIComponent(checkIn)}&select=id,check_in,check_out`
    ),
  ]);

  return [
    ...(Array.isArray(blocks) ? blocks : []),
    ...(Array.isArray(requests) ? requests : []),
  ];
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

function validateStayDetails(body) {
  const stayType = cleanText(body.stay_type, 20) || "villa";
  if (!VALID_STAY_TYPES.has(stayType)) {
    throw httpError(400, "住宿方式不正確。", "invalid_stay_type");
  }

  const adults = parseInteger(body.adults, 2);
  const children = parseInteger(body.children, 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) {
    throw httpError(400, "成人至少需要 1 位。", "invalid_adults");
  }
  if (!Number.isInteger(children) || children < 0 || children > 30) {
    throw httpError(400, "孩童人數不正確。", "invalid_children");
  }

  let roomCount = stayType === "villa" ? TOTAL_ROOM_COUNT : parseInteger(body.room_count, null);
  if (stayType === "room" && (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > TOTAL_ROOM_COUNT)) {
    throw httpError(400, `單間客房數需為 1 到 ${TOTAL_ROOM_COUNT} 間。`, "invalid_room_count");
  }

  const hasPets = body.has_pets === true;
  let petCount = hasPets ? parseInteger(body.pet_count, 1) : null;
  let petType = hasPets ? cleanText(body.pet_type, 20) || "dog" : null;
  const petNotes = hasPets ? cleanText(body.pet_notes, 500) : "";

  if (hasPets && (!Number.isInteger(petCount) || petCount < 1 || petCount > 20)) {
    throw httpError(400, "攜帶寵物時，寵物數量至少為 1。", "invalid_pet_count");
  }
  if (hasPets && !VALID_PET_TYPES.has(petType)) {
    throw httpError(400, "寵物類型不正確。", "invalid_pet_type");
  }

  return {
    stayType,
    adults,
    children,
    roomCount,
    hasPets,
    petCount,
    petType,
    petNotes,
    guestCount: adults + children,
  };
}

async function handleCalendar(req, res, requestId) {
  const from = normalizeDate(firstQueryValue(req.query?.from)) || todayText();
  const months = Math.min(Math.max(Number(firstQueryValue(req.query?.months)) || 12, 1), 12);
  const safeFrom = from < todayText() ? todayText() : from;
  const endDate = new Date(`${safeFrom}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);
  const to = endDate.toISOString().slice(0, 10) > maxBookableDate()
    ? maxBookableDate()
    : endDate.toISOString().slice(0, 10);

  const ranges = await findUnavailableRanges(safeFrom, to);

  sendJson(res, 200, {
    ok: true,
    requestId,
    from: safeFrom,
    to,
    maxDate: maxBookableDate(),
    unavailableDates: buildUnavailableDates(ranges, safeFrom, to),
  });
}

async function handleAvailability(req, res, requestId) {
  const { checkIn, checkOut } = validateDateRange(
    firstQueryValue(req.query?.checkIn),
    firstQueryValue(req.query?.checkOut)
  );
  const unavailableRanges = await findUnavailableRanges(checkIn, checkOut);
  sendJson(res, 200, {
    ok: true,
    requestId,
    available: unavailableRanges.length === 0,
    checkIn,
    checkOut,
  });
}

async function handleRequest(req, res, requestId) {
  const body = await readBody(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "請提供有效的預約申請資料。", "invalid_payload");
  }

  const { checkIn, checkOut } = validateDateRange(body.check_in, body.check_out);
  const stayDetails = validateStayDetails(body);
  const guestName = cleanText(body.guest_name, 80);
  const guestEmail = cleanText(body.email || body.guest_email, 160).toLowerCase();
  const guestPhone = cleanText(body.phone || body.guest_phone, 60);
  const notes = cleanText(body.notes, 1000);

  if (!guestName) throw httpError(400, "請填寫姓名。", "missing_guest_name");
  if (!guestEmail && !guestPhone) {
    throw httpError(400, "請至少提供 Email 或電話，方便我們聯繫。", "missing_contact");
  }
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    throw httpError(400, "Email 格式不正確。", "invalid_email");
  }

  const unavailableRanges = await findUnavailableRanges(checkIn, checkOut);
  if (unavailableRanges.length > 0) {
    return sendJson(res, 409, {
      ok: false,
      requestId,
      error: "date_unavailable",
      message: "這段日期目前不可預約，請重新選擇日期。",
    });
  }

  const rows = await supabaseRequest("/booking_requests", {
    method: "POST",
    body: JSON.stringify({
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
      status: "pending_review",
      source: "official_site",
      raw_payload: {
        stay_type: stayDetails.stayType,
        adults: stayDetails.adults,
        children: stayDetails.children,
        room_count: stayDetails.roomCount,
        has_pets: stayDetails.hasPets,
        pet_type: stayDetails.petType,
      },
    }),
  });
  const request = Array.isArray(rows) ? rows[0] : rows;

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

  sendJson(res, 200, {
    ok: true,
    requestId,
    request: {
      id: request?.id,
      status: request?.status || "pending_review",
      check_in: checkIn,
      check_out: checkOut,
    },
  });
}

async function dispatch(req, res, requestId) {
  const action = firstQueryValue(req.query?.action) || "availability";
  if (req.method === "GET" && action === "calendar") return handleCalendar(req, res, requestId);
  if (req.method === "GET" && action === "availability") return handleAvailability(req, res, requestId);
  if (req.method === "POST" && action === "request") return handleRequest(req, res, requestId);
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
      message: status >= 500 ? "系統暫時無法處理預約申請，請稍後再試。" : error.message,
    });
  }
}
