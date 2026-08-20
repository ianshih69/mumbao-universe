import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRpc,
  supabaseRequest,
} from "../server/shopShared.js";
import { requirePermission } from "../server/adminShop/core.js";

const requestIdHeader = "x-request-id";
const villaAliases = ["慢慢蒔光", "stime villa", "mumbao"];
const defaultBookingSettings = {
  id: 1,
  booking_window_months: 6,
  allow_villa_booking: true,
  allow_room_booking: false,
  total_room_count: 5,
  allow_pets: true,
};
const bookingRequestCompletionSelect = [
  "id",
  "guest_name",
  "guest_email",
  "guest_phone",
  "check_in",
  "check_out",
  "status",
  "source",
  "customer_profile_id",
  "final_lodging_amount",
  "completed_at",
  "completed_by_admin_id",
  "partner_points_awarded_at",
  "partner_points_awarded_to_profile_id",
  "partner_points_ledger_id",
].join(",");
const customerProfileSelectForPoints =
  "id,auth_user_id,email,name,coupon_code,member_level";
const diamondProfileSelectForPoints =
  "id,customer_profile_id,partner_name,exclusive_code,partnership_status";
const pointsLedgerSelectForBookingRewards =
  "id,customer_profile_id,points,description,source_order_id,source_type,created_by_admin_id,created_at";
const directBookingRewardSources = new Set(["official_site", "website", "line", "phone", "manual", "admin"]);
const maxFinalLodgingAmount = 10000000;
const sourceNotEligibleMessage = "此訂單來源不符合合作回饋資格。";

function makeRequestId() {
  return `booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function httpError(status, message, code = "request_failed") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeDate(value) {
  const raw = cleanText(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return raw;
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((endTime - startTime) / 86400000));
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function validateDateRange(checkIn, checkOut) {
  const normalizedCheckIn = normalizeDate(checkIn);
  const normalizedCheckOut = normalizeDate(checkOut);
  if (!normalizedCheckIn || !normalizedCheckOut) {
    throw httpError(400, "請提供正確的入住與退房日期。", "invalid_dates");
  }
  if (normalizedCheckOut <= normalizedCheckIn) {
    throw httpError(400, "退房日期必須晚於入住日期。", "invalid_date_range");
  }
  return { checkIn: normalizedCheckIn, checkOut: normalizedCheckOut };
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload;
}

function normalizeBookingSettings(row) {
  const monthValue = Number(row?.booking_window_months);
  return {
    id: 1,
    booking_window_months:
      Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 24
        ? monthValue
        : defaultBookingSettings.booking_window_months,
    allow_villa_booking:
      typeof row?.allow_villa_booking === "boolean"
        ? row.allow_villa_booking
        : defaultBookingSettings.allow_villa_booking,
    allow_room_booking:
      typeof row?.allow_room_booking === "boolean"
        ? row.allow_room_booking
        : defaultBookingSettings.allow_room_booking,
    total_room_count: defaultBookingSettings.total_room_count,
    allow_pets:
      typeof row?.allow_pets === "boolean"
        ? row.allow_pets
        : defaultBookingSettings.allow_pets,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  };
}

async function loadBookingSettingsSafe(requestId) {
  try {
    const rows = await supabaseRequest(
      "/booking_settings?id=eq.1&select=id,booking_window_months,allow_villa_booking,allow_room_booking,total_room_count,allow_pets,created_at,updated_at&limit=1"
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return normalizeBookingSettings(row);
  } catch (error) {
    console.warn("[admin-bookings] booking_settings fallback", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return normalizeBookingSettings(null);
  }
}

async function loadBookingPlatformSettingSafe(requestId) {
  try {
    const settings = await supabaseRequest(
      "/booking_platform_settings?platform=eq.booking&select=platform,last_synced_at,last_error,enabled,ical_url,id&limit=1"
    );
    return Array.isArray(settings) ? settings[0] || null : null;
  } catch (error) {
    console.warn("[admin-bookings] booking_platform_settings fallback", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function verifySupabaseAccessToken(accessToken) {
  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw httpError(500, "Server configuration error.", "server_config");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    throw httpError(401, "請先登入後台。", "unauthorized");
  }
  return data;
}

async function requireAdmin(req) {
  const token = getBearerToken(req);
  if (!token) throw httpError(401, "請先登入後台。", "unauthorized");

  const user = await verifySupabaseAccessToken(token);
  const profiles = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || profile.is_active === false) {
    throw httpError(403, "此帳號沒有後台權限。", "forbidden");
  }

  return {
    authUserId: user.id,
    email: profile.email || user.email || "",
    name: profile.display_name || profile.email || user.email || "Admin",
    roleCode: profile.role_code || "",
  };
}

async function writeBookingAuditLog({ req, requestId, admin, action, targetType, targetId, description, beforeData, afterData }) {
  try {
    await supabaseRequest("/booking_admin_audit_logs", {
      method: "POST",
      body: JSON.stringify({
        actor_auth_user_id: admin?.authUserId || null,
        actor_name: admin?.name || "",
        actor_email: admin?.email || "",
        action,
        module: "booking",
        target_type: targetType || null,
        target_id: targetId || null,
        description,
        before_data: beforeData || null,
        after_data: afterData || null,
        request_id: requestId,
        ip_address: req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "",
        user_agent: req.headers?.["user-agent"] || "",
      }),
    });
  } catch (error) {
    console.error("[admin-bookings] audit log failed", {
      requestId,
      action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findOverlappingConfirmedBlocks(checkIn, checkOut) {
  const rows = await supabaseRequest(
    `/booking_availability_blocks?status=eq.confirmed&check_in=lt.${encodeURIComponent(checkOut)}&check_out=gt.${encodeURIComponent(checkIn)}&select=*&order=check_in.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

async function createAlertIfMissing(alert) {
  const checkInFilter = alert.check_in ? `&check_in=eq.${encodeURIComponent(alert.check_in)}` : "&check_in=is.null";
  const checkOutFilter = alert.check_out ? `&check_out=eq.${encodeURIComponent(alert.check_out)}` : "&check_out=is.null";
  const existing = await supabaseRequest(
    `/booking_availability_alerts?status=eq.open&alert_type=eq.${encodeURIComponent(alert.alert_type)}${checkInFilter}${checkOutFilter}&select=id&limit=1`
  );
  if (Array.isArray(existing) && existing.length > 0) return existing[0];
  const created = await supabaseRequest("/booking_availability_alerts", {
    method: "POST",
    body: JSON.stringify(alert),
  });
  return Array.isArray(created) ? created[0] : created;
}

function getBlockType(source) {
  if (source === "maintenance") return "maintenance";
  if (source === "manual") return "manual_hold";
  if (source === "website") return "website_reservation";
  if (source === "booking_ical") return "booking_ical";
  return "external_reservation";
}

async function createConfirmedBlockForReservation(reservation) {
  const block = {
    block_type: getBlockType(reservation.source),
    source: reservation.source,
    external_reservation_id: reservation.id,
    check_in: reservation.check_in,
    check_out: reservation.check_out,
    status: "confirmed",
    title: reservation.reference_number
      ? `${reservation.source} ${reservation.reference_number}`
      : reservation.guest_name || reservation.source,
    notes: reservation.notes || null,
    raw_payload: reservation.raw_payload || {},
  };
  const created = await supabaseRequest("/booking_availability_blocks", {
    method: "POST",
    body: JSON.stringify(block),
  });
  return Array.isArray(created) ? created[0] : created;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function normalizeEmail(value) {
  return cleanText(value, 300).toLowerCase();
}

function normalizeCouponCode(value) {
  return cleanText(value, 80);
}

function getCouponCodeKey(value) {
  return normalizeCouponCode(value).toLowerCase();
}

function normalizeDirectSource(source) {
  return cleanText(source, 80).toLowerCase();
}

function isDirectBookingSource(source) {
  const normalized = normalizeDirectSource(source);
  if (!normalized) return false;
  return directBookingRewardSources.has(normalized);
}

function parseFinalLodgingAmount(value) {
  let parsed;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    parsed = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    parsed = Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maxFinalLodgingAmount) return null;
  return Math.floor(parsed);
}

function calculatePartnerRewardPoints(finalLodgingAmount) {
  return Math.floor(Number(finalLodgingAmount || 0) * 5 / 100);
}

function formatAmountForDescription(amount) {
  return `NT$${Number(amount || 0).toLocaleString("zh-TW")}`;
}

function getBookingDisplayNumber(booking) {
  return booking?.reference_number || booking?.booking_number || booking?.id || "booking";
}

async function fetchBookingRequestById(id) {
  const rows = await supabaseRequest(
    `/booking_requests?id=eq.${encodeURIComponent(id)}&select=${bookingRequestCompletionSelect}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchCustomerProfileForBooking(booking) {
  if (booking?.customer_profile_id) {
    const rows = await supabaseRequest(
      `/shop_customer_profiles?id=eq.${encodeURIComponent(
        booking.customer_profile_id
      )}&select=${customerProfileSelectForPoints}&limit=1`
    );
    const profile = Array.isArray(rows) ? rows[0] || null : null;
    if (profile) return profile;
  }

  const email = normalizeEmail(booking?.guest_email);
  if (!email) return null;
  const rows = await supabaseRequest(
    `/shop_customer_profiles?email=ilike.${encodeURIComponent(`*${email}*`)}&select=${customerProfileSelectForPoints}&limit=20`
  );
  return (Array.isArray(rows) ? rows : []).find((row) => normalizeEmail(row.email) === email) || null;
}

async function fetchActiveDiamondProfileByCouponCode(couponCode) {
  const key = getCouponCodeKey(couponCode);
  if (!key) return null;
  const rows = await supabaseRequest(
    `/member_diamond_profiles?exclusive_code=ilike.${encodeURIComponent(
      `*${key}*`
    )}&partnership_status=eq.active&select=${diamondProfileSelectForPoints}&limit=50`
  );
  const match = (Array.isArray(rows) ? rows : []).find(
    (row) => getCouponCodeKey(row.exclusive_code) === key
  );
  if (!match?.customer_profile_id) return null;

  const profiles = await supabaseRequest(
    `/shop_customer_profiles?id=eq.${encodeURIComponent(
      match.customer_profile_id
    )}&member_level=eq.diamond&select=id,member_level&limit=1`
  );
  return Array.isArray(profiles) && profiles[0]?.id ? match : null;
}

async function fetchExistingBookingRewardLedger(bookingId) {
  const rows = await supabaseRequest(
    `/member_points_ledger?source_order_id=eq.${encodeURIComponent(
      bookingId
    )}&source_type=eq.booking_stay_reward&select=${pointsLedgerSelectForBookingRewards}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

function buildPartnerPointsEligibility({ booking, customerProfile, diamondProfile, finalLodgingAmount, existingLedger }) {
  if (!booking) return { eligible: false, reason: "booking_not_found" };
  if (!isDirectBookingSource(booking.source)) return { eligible: false, reason: "source_not_eligible" };
  if (!finalLodgingAmount) return { eligible: false, reason: "missing_final_lodging_amount" };
  if (!customerProfile?.id) return { eligible: false, reason: "missing_customer_profile" };
  if (!normalizeCouponCode(customerProfile.coupon_code)) return { eligible: false, reason: "missing_coupon_code" };
  if (!diamondProfile?.customer_profile_id) return { eligible: false, reason: "invalid_or_inactive_coupon_code" };
  if (booking.partner_points_ledger_id || existingLedger?.id) return { eligible: false, reason: "already_awarded" };
  const points = calculatePartnerRewardPoints(finalLodgingAmount);
  if (points <= 0) return { eligible: false, reason: "zero_reward_points" };
  return { eligible: true, reason: "eligible", points };
}

function normalizeCompleteStayRpcResult(result) {
  if (Array.isArray(result)) {
    return normalizeCompleteStayRpcResult(result[0]);
  }
  return result?.complete_booking_stay_with_partner_points || result || {};
}

function mapCompleteStayRpcError(error) {
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  if (message.includes("找不到此住宿訂單")) {
    return httpError(404, "找不到此住宿訂單。", "booking_not_found");
  }
  if (message.includes("找不到執行操作的管理員")) {
    return httpError(403, "找不到執行操作的管理員。", "admin_not_found");
  }
  if (message.includes(sourceNotEligibleMessage)) {
    return httpError(409, sourceNotEligibleMessage, "source_not_eligible");
  }
  if (message.includes("最終住宿房費") || message.includes("合作回饋積分計算結果")) {
    return httpError(400, message, "invalid_final_lodging_amount");
  }
  if (message.includes("找不到此訂單對應的會員資料")) {
    return httpError(409, "找不到此訂單對應的會員資料。", "missing_customer_profile");
  }
  if (message.includes("尚未綁定有效合作優惠碼")) {
    return httpError(409, "此會員尚未綁定有效合作優惠碼。", "missing_coupon_code");
  }
  if (message.includes("合作優惠碼目前無效")) {
    return httpError(409, "此合作優惠碼目前無效或未啟用。", "invalid_or_inactive_coupon_code");
  }
  if (message.includes("已發放過合作回饋積分") || lowerMessage.includes("duplicate") || lowerMessage.includes("23505")) {
    return httpError(409, "此住宿訂單已發放過合作回饋積分。", "partner_points_already_awarded");
  }
  return error;
}

function parseGuestCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return number;
}

async function handleDashboard(req, res, requestId) {
  await requireAdmin(req);
  const now = new Date();
  const ninetyDaysLater = new Date(now);
  ninetyDaysLater.setDate(now.getDate() + 90);
  const from = todayText();
  const to = ninetyDaysLater.toISOString().slice(0, 10);

  const [alertsResult, platformSettingResult, pendingEmailsResult, calendarBlocksResult] = await Promise.allSettled([
    supabaseRequest("/booking_availability_alerts?status=eq.open&select=severity,alert_type,created_at"),
    loadBookingPlatformSettingSafe(requestId),
    supabaseRequest("/booking_email_detections?status=eq.pending_review&select=id"),
    supabaseRequest(
      `/booking_availability_blocks?status=eq.confirmed&check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=id`
    ),
  ]);

  const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];
  const pendingEmails = pendingEmailsResult.status === "fulfilled" ? pendingEmailsResult.value : [];
  const calendarBlocks = calendarBlocksResult.status === "fulfilled" ? calendarBlocksResult.value : [];
  const lastSetting = platformSettingResult.status === "fulfilled" ? platformSettingResult.value : null;
  const openAlerts = Array.isArray(alerts) ? alerts : [];
  const p0Count = openAlerts.filter((alert) => alert.severity === "P0").length;
  const p1Count = openAlerts.filter((alert) => alert.severity === "P1").length;
  const p2Count = openAlerts.filter((alert) => alert.severity === "P2").length;

  sendJson(res, 200, {
    ok: true,
    requestId,
    dashboard: {
      safetyStatus: p0Count > 0 ? "danger" : p1Count > 0 ? "warning" : "safe",
      future90DaysHasIssues: p0Count + p1Count + p2Count > 0,
      bookingIcalLastSyncedAt: lastSetting?.last_synced_at || null,
      bookingIcalLastError: lastSetting?.last_error || null,
      pendingEmailCount: Array.isArray(pendingEmails) ? pendingEmails.length : 0,
      p0Count,
      p1Count,
      p2Count,
      confirmedBlockCount90Days: Array.isArray(calendarBlocks) ? calendarBlocks.length : 0,
    },
  });
}

async function handleCalendar(req, res, requestId) {
  await requireAdmin(req);
  const from = normalizeDate(firstQueryValue(req.query?.from)) || todayText();
  const bookingSettings = await loadBookingSettingsSafe(requestId);
  const configuredMonths = bookingSettings.booking_window_months || defaultBookingSettings.booking_window_months;
  const requestedMonths = Number(firstQueryValue(req.query?.months));
  const months = Math.min(
    Math.max(Number.isFinite(requestedMonths) && requestedMonths > 0 ? requestedMonths : configuredMonths, 1),
    configuredMonths
  );
  const endDate = new Date(`${from}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);
  const to = endDate.toISOString().slice(0, 10);

  const [blocks, reservations, alerts] = await Promise.all([
    supabaseRequest(
      `/booking_availability_blocks?check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=*&order=check_in.asc`
    ),
    supabaseRequest(
      `/booking_external_reservations?check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=*&order=check_in.asc`
    ),
    supabaseRequest(
      `/booking_availability_alerts?status=eq.open&check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=*&order=created_at.desc`
    ),
  ]);

  const days = [];
  let current = from;
  while (current < to) {
    const dayBlocks = (Array.isArray(blocks) ? blocks : []).filter((block) =>
      rangesOverlap(current, addDays(current, 1), block.check_in, block.check_out)
    );
    const dayAlerts = (Array.isArray(alerts) ? alerts : []).filter((alert) =>
      alert.check_in && alert.check_out
        ? rangesOverlap(current, addDays(current, 1), alert.check_in, alert.check_out)
        : false
    );
    const hasP0 = dayAlerts.some((alert) => alert.severity === "P0");
    const hasReview = dayAlerts.some((alert) => alert.severity === "review");
    const hasBooking = dayBlocks.some((block) => block.source === "booking_ical" || block.source === "booking" || block.source === "booking_email");
    const hasMaintenance = dayBlocks.some((block) => block.block_type === "maintenance");
    const hasManual = dayBlocks.some((block) => block.block_type === "manual_hold");
    const hasConfirmed = dayBlocks.some((block) => block.status === "confirmed");
    const status = hasP0
      ? "撞期風險"
      : hasReview
        ? "待確認"
        : hasMaintenance
          ? "維修封鎖"
          : hasBooking
            ? "Booking 已訂"
            : hasManual
              ? "人工保留"
              : hasConfirmed
                ? "官網已封鎖"
                : "可預約";
    days.push({ date: current, status, blockCount: dayBlocks.length, alertCount: dayAlerts.length });
    current = addDays(current, 1);
  }

  sendJson(res, 200, {
    ok: true,
    requestId,
    calendar: { from, to, days, blocks: blocks || [], reservations: reservations || [], alerts: alerts || [] },
  });
}

async function handleExternalReservation(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const { checkIn, checkOut } = validateDateRange(body.check_in, body.check_out);
  const source = cleanText(body.source, 40) || "manual";
  const status = cleanText(body.status, 32) || "pending_review";
  if (!["confirmed", "cancelled", "pending_review"].includes(status)) {
    throw httpError(400, "訂房狀態不正確。", "invalid_status");
  }

  if (status === "confirmed") {
    const overlaps = await findOverlappingConfirmedBlocks(checkIn, checkOut);
    if (overlaps.length > 0) {
      const alert = await createAlertIfMissing({
        severity: "P0",
        alert_type: "overlap_confirmed_reservation",
        title: "撞期 / 爆房風險",
        description: `嘗試建立 ${checkIn} 至 ${checkOut} 的 confirmed 訂房，但日期已被佔用。`,
        check_in: checkIn,
        check_out: checkOut,
        source,
      });
      return sendJson(res, 409, { ok: false, requestId, error: "date_overlap", alert });
    }
  }

  const reservationPayload = {
    source,
    reference_number: cleanText(body.reference_number, 120) || null,
    check_in: checkIn,
    check_out: checkOut,
    guest_name: cleanText(body.guest_name, 120) || null,
    guest_count: parseGuestCount(body.guest_count),
    amount: parseMoney(body.amount),
    status,
    accommodation_name: cleanText(body.accommodation_name, 160) || null,
    confidence: Number.isInteger(body.confidence) ? body.confidence : null,
    notes: cleanText(body.notes, 1000) || null,
    raw_payload: sanitizePayload(body.raw_payload),
  };
  const createdRows = await supabaseRequest("/booking_external_reservations", {
    method: "POST",
    body: JSON.stringify(reservationPayload),
  });
  const reservation = Array.isArray(createdRows) ? createdRows[0] : createdRows;
  const block = status === "confirmed" ? await createConfirmedBlockForReservation(reservation) : null;

  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "create_external_reservation",
    targetType: "booking_external_reservation",
    targetId: reservation?.id,
    description: `建立外部訂房：${checkIn} 至 ${checkOut}`,
    afterData: { reservation, block },
  });

  sendJson(res, 200, { ok: true, requestId, reservation, block });
}

function parseBookingEmail({ subject, sender, rawEmail }) {
  const haystack = `${subject}\n${sender}\n${rawEmail}`.toLowerCase();
  const original = `${subject}\n${rawEmail}`;
  let confidence = 0;
  const signals = [];

  if (haystack.includes("booking.com") || haystack.includes("booking")) {
    confidence += 20;
    signals.push("booking_keyword");
  }
  if (/reservation|訂單|預訂|confirmed|confirmation|確認/.test(haystack)) {
    confidence += 20;
    signals.push("reservation_keyword");
  }
  if (villaAliases.some((alias) => haystack.includes(alias.toLowerCase()))) {
    confidence += 20;
    signals.push("villa_alias");
  }

  const referenceMatch =
    original.match(/(?:confirmation|reservation|booking|訂單|預訂)[^\dA-Z]{0,20}([A-Z0-9.-]{6,})/i) ||
    original.match(/\b([0-9]{8,12})\b/);
  const referenceNumber = referenceMatch?.[1] || "";
  if (referenceNumber) {
    confidence += 15;
    signals.push("reference_number");
  }

  const dateMatches = [...original.matchAll(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/g)].map((match) => {
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    return `${match[1]}-${month}-${day}`;
  });
  const uniqueDates = [...new Set(dateMatches)].sort();
  const checkIn = uniqueDates[0] || "";
  const checkOut = uniqueDates.find((date) => date > checkIn) || "";
  if (checkIn && checkOut) {
    confidence += 20;
    signals.push("date_range");
  }

  let detectionType = "unknown";
  if (/cancel|取消|已取消/.test(haystack)) detectionType = "cancellation";
  else if (/modify|modification|change|變更|修改/.test(haystack)) detectionType = "modification";
  else if (/message|訊息|留言/.test(haystack)) detectionType = "guest_message";
  else if (/new reservation|confirmed|confirmation|新訂單|訂單確認|預訂確認|確認/.test(haystack)) {
    detectionType = "new_reservation";
    confidence += 10;
  }

  const accommodationMatch =
    original.match(/(?:property|住宿|飯店|旅宿|villa|民宿)[：:\s]+(.{2,80})/i) ||
    villaAliases.find((alias) => haystack.includes(alias.toLowerCase()));
  const accommodationName = Array.isArray(accommodationMatch)
    ? cleanText(accommodationMatch[1], 120)
    : typeof accommodationMatch === "string"
      ? accommodationMatch
      : "";

  confidence = Math.min(100, confidence);
  const suggestedAutoBlock = detectionType === "new_reservation" && confidence >= 90 && Boolean(checkIn && checkOut);

  return {
    isBookingLike: signals.includes("booking_keyword"),
    confidence,
    detectionType,
    referenceNumber,
    checkIn,
    checkOut,
    accommodationName,
    suggestedAutoBlock,
    signals,
    needs_ai_review: confidence < 90,
    needs_manual_review: !suggestedAutoBlock,
  };
}

async function handleEmailDetection(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const subject = cleanText(body.subject, 300);
  const sender = cleanText(body.sender, 300);
  const rawEmail = cleanText(body.raw_email, 20000);
  if (!subject && !rawEmail) {
    throw httpError(400, "請貼上 Booking 信件主旨或原文。", "missing_email");
  }

  const result = parseBookingEmail({ subject, sender, rawEmail });
  let reservation = null;
  let block = null;
  let detectionStatus = "pending_review";

  if (result.suggestedAutoBlock) {
    const overlaps = await findOverlappingConfirmedBlocks(result.checkIn, result.checkOut);
    if (overlaps.length === 0) {
      const createdRows = await supabaseRequest("/booking_external_reservations", {
        method: "POST",
        body: JSON.stringify({
          source: "booking_email",
          reference_number: result.referenceNumber || null,
          check_in: result.checkIn,
          check_out: result.checkOut,
          status: "confirmed",
          accommodation_name: result.accommodationName || null,
          confidence: result.confidence,
          raw_payload: { subject, sender, signals: result.signals },
          notes: "Booking email high-confidence auto block.",
        }),
      });
      reservation = Array.isArray(createdRows) ? createdRows[0] : createdRows;
      block = await createConfirmedBlockForReservation(reservation);
      detectionStatus = "auto_blocked";
    } else {
      await createAlertIfMissing({
        severity: "P0",
        alert_type: "booking_email_overlap",
        title: "Booking 信件日期撞期",
        description: `高信心 Booking 訂單 ${result.referenceNumber || ""} 與既有 confirmed block 重疊。`,
        check_in: result.checkIn,
        check_out: result.checkOut,
        source: "booking_email",
      });
    }
  } else if (result.detectionType !== "new_reservation" || result.confidence < 90) {
    await createAlertIfMissing({
      severity: "review",
      alert_type: `email_${result.detectionType}`,
      title: "Booking 信件待人工確認",
      description: `信心分數 ${result.confidence}，類型 ${result.detectionType}。第一版不自動釋放或修改日期。`,
      check_in: result.checkIn || null,
      check_out: result.checkOut || null,
      source: "booking_email",
    });
  }

  const detectionRows = await supabaseRequest("/booking_email_detections", {
    method: "POST",
    body: JSON.stringify({
      sender,
      subject,
      raw_email: rawEmail,
      detection_type: result.detectionType,
      confidence: result.confidence,
      reference_number: result.referenceNumber || null,
      check_in: result.checkIn || null,
      check_out: result.checkOut || null,
      accommodation_name: result.accommodationName || null,
      suggested_auto_block: result.suggestedAutoBlock,
      status: detectionStatus,
      external_reservation_id: reservation?.id || null,
      ai_review_status: result.needs_ai_review ? "needs_ai_review" : "not_needed",
      ai_confidence: null,
      ai_result_json: null,
      raw_result_json: result,
    }),
  });
  const detection = Array.isArray(detectionRows) ? detectionRows[0] : detectionRows;

  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "parse_booking_email",
    targetType: "booking_email_detection",
    targetId: detection?.id,
    description: `解析 Booking 信件：${result.detectionType} / ${result.confidence}`,
    afterData: { detection, reservation, block },
  });

  sendJson(res, 200, { ok: true, requestId, result, detection, reservation, block });
}

async function handleSettingsGet(req, res, requestId) {
  await requireAdmin(req);
  const bookingSettings = await loadBookingSettingsSafe(requestId);
  const bookingPlatformSetting = await loadBookingPlatformSettingSafe(requestId);
  sendJson(res, 200, {
    ok: true,
    requestId,
    bookingSettings,
    setting: bookingSettings,
    settings: bookingPlatformSetting ? [bookingPlatformSetting] : [],
  });
}

async function handleSettingsPost(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const platform = cleanText(body.platform, 40) || "booking";
  const icalUrl = cleanText(body.ical_url, 1000);
  const enabled = Boolean(body.enabled);
  if (icalUrl && !/^https?:\/\//i.test(icalUrl)) {
    throw httpError(400, "iCal URL 必須是 http 或 https。", "invalid_ical_url");
  }

  const rows = await supabaseRequest("/booking_platform_settings?on_conflict=platform", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ platform, ical_url: icalUrl || null, enabled }),
  });
  const setting = Array.isArray(rows) ? rows[0] : rows;

  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "update_ical_setting",
    targetType: "booking_platform_setting",
    targetId: setting?.id,
    description: `更新 ${platform} iCal 設定`,
    afterData: { platform, enabled, hasIcalUrl: Boolean(icalUrl) },
  });

  sendJson(res, 200, { ok: true, requestId, setting });
}

function unfoldIcalLines(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function getIcalValue(lines, key) {
  const line = lines.find((candidate) => candidate.toUpperCase().startsWith(`${key}:`) || candidate.toUpperCase().startsWith(`${key};`));
  if (!line) return "";
  return line.slice(line.indexOf(":") + 1).trim();
}

function parseIcalDate(value) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  if (/^\d{8}T/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function parseIcalEvents(text) {
  const lines = unfoldIcalLines(text);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      const uid = getIcalValue(current, "UID");
      const checkIn = parseIcalDate(getIcalValue(current, "DTSTART"));
      const checkOut = parseIcalDate(getIcalValue(current, "DTEND"));
      if (uid && checkIn && checkOut && checkOut > checkIn) {
        events.push({
          uid,
          checkIn,
          checkOut,
          summary: cleanText(getIcalValue(current, "SUMMARY"), 300) || "Booking iCal",
        });
      }
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return events;
}

async function runConsistencyCheck() {
  const from = todayText();
  const to = addDays(from, 365);
  const [blocks, settings] = await Promise.all([
    supabaseRequest(
      `/booking_availability_blocks?status=eq.confirmed&check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=*`
    ),
    supabaseRequest("/booking_platform_settings?platform=eq.booking&select=*&limit=1"),
  ]);
  const confirmedBlocks = Array.isArray(blocks) ? blocks : [];
  const icalBlocks = confirmedBlocks.filter((block) => block.source === "booking_ical");
  const nonIcalBlocks = confirmedBlocks.filter((block) => block.source !== "booking_ical");
  const bookingSetting = Array.isArray(settings) ? settings[0] : null;

  if (bookingSetting?.enabled) {
    if (bookingSetting.last_error) {
      await createAlertIfMissing({
        severity: "P1",
        alert_type: "ical_sync_failed",
        title: "Booking iCal 同步失敗",
        description: "Booking iCal 最近一次同步失敗，請檢查連結或稍後重試。",
        source: "booking_ical",
      });
    }
    const lastSyncedAt = bookingSetting.last_synced_at ? Date.parse(bookingSetting.last_synced_at) : 0;
    if (!lastSyncedAt || Date.now() - lastSyncedAt > 2 * 60 * 60 * 1000) {
      await createAlertIfMissing({
        severity: "P2",
        alert_type: "ical_sync_stale",
        title: "Booking iCal 超過 2 小時未同步",
        description: "請手動同步 Booking iCal，確認平台與官網房況一致。",
        source: "booking_ical",
      });
    }
  }

  for (let i = 0; i < confirmedBlocks.length; i += 1) {
    for (let j = i + 1; j < confirmedBlocks.length; j += 1) {
      const first = confirmedBlocks[i];
      const second = confirmedBlocks[j];
      if (rangesOverlap(first.check_in, first.check_out, second.check_in, second.check_out)) {
        await createAlertIfMissing({
          severity: "P0",
          alert_type: "overlap_confirmed_blocks",
          title: "撞期 / 爆房風險",
          description: `${first.check_in} 至 ${first.check_out} 與另一筆 confirmed block 重疊。`,
          check_in: first.check_in > second.check_in ? first.check_in : second.check_in,
          check_out: first.check_out < second.check_out ? first.check_out : second.check_out,
          source: "consistency_check",
          related_block_id: first.id,
        });
      }
    }
  }

  for (const icalBlock of icalBlocks) {
    const hasWebsiteBlock = nonIcalBlocks.some((block) =>
      rangesOverlap(icalBlock.check_in, icalBlock.check_out, block.check_in, block.check_out)
    );
    if (!hasWebsiteBlock) {
      await createAlertIfMissing({
        severity: "P1",
        alert_type: "booking_ical_without_website_block",
        title: "Booking 已訂但官網未關",
        description: `${icalBlock.check_in} 至 ${icalBlock.check_out} Booking iCal 已訂，請確認官網已封鎖。`,
        check_in: icalBlock.check_in,
        check_out: icalBlock.check_out,
        source: "booking_ical",
        related_block_id: icalBlock.id,
      });
    }
  }

  for (const block of nonIcalBlocks) {
    const hasIcalBlock = icalBlocks.some((icalBlock) =>
      rangesOverlap(block.check_in, block.check_out, icalBlock.check_in, icalBlock.check_out)
    );
    if (!hasIcalBlock) {
      await createAlertIfMissing({
        severity: "P2",
        alert_type: "website_block_without_booking_ical",
        title: "官網已封鎖，請確認 Booking 是否同步",
        description: `${block.check_in} 至 ${block.check_out} 官網已封鎖，但 Booking iCal 尚未顯示。`,
        check_in: block.check_in,
        check_out: block.check_out,
        source: block.source,
        related_block_id: block.id,
      });
    }
  }
}

async function handleSyncIcal(req, res, requestId) {
  const admin = await requireAdmin(req);
  const settings = await supabaseRequest("/booking_platform_settings?platform=eq.booking&select=*&limit=1");
  const setting = Array.isArray(settings) ? settings[0] : null;
  if (!setting?.enabled || !setting?.ical_url) {
    throw httpError(400, "尚未啟用 Booking iCal。", "ical_not_enabled");
  }

  const startedAt = new Date().toISOString();
  let log = null;
  try {
    const response = await fetch(setting.ical_url, { headers: { Accept: "text/calendar,text/plain,*/*" } });
    const text = await response.text();
    if (!response.ok) throw new Error(`iCal fetch failed: ${response.status}`);
    const events = parseIcalEvents(text);
    let written = 0;

    for (const event of events) {
      const existingRows = await supabaseRequest(
        `/booking_availability_blocks?source=eq.booking_ical&ical_uid=eq.${encodeURIComponent(event.uid)}&select=id&limit=1`
      );
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      const payload = {
        block_type: "booking_ical",
        source: "booking_ical",
        ical_uid: event.uid,
        check_in: event.checkIn,
        check_out: event.checkOut,
        status: "confirmed",
        title: event.summary,
        raw_payload: event,
      };

      if (existing?.id) {
        await supabaseRequest(`/booking_availability_blocks?id=eq.${encodeURIComponent(existing.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await supabaseRequest("/booking_availability_blocks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      written += 1;
    }

    const logRows = await supabaseRequest("/booking_ical_sync_logs", {
      method: "POST",
      body: JSON.stringify({
        platform: "booking",
        ical_url: setting.ical_url,
        status: "success",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        events_found: events.length,
        blocks_written: written,
        raw_result_json: { eventUids: events.map((event) => event.uid) },
      }),
    });
    log = Array.isArray(logRows) ? logRows[0] : logRows;
    await supabaseRequest(`/booking_platform_settings?id=eq.${encodeURIComponent(setting.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_synced_at: new Date().toISOString(), last_error: null }),
    });
    await runConsistencyCheck();
    await writeBookingAuditLog({
      req,
      requestId,
      admin,
      action: "sync_booking_ical",
      targetType: "booking_platform_setting",
      targetId: setting.id,
      description: `同步 Booking iCal：${events.length} 筆事件`,
      afterData: { eventsFound: events.length, blocksWritten: written },
    });
    sendJson(res, 200, { ok: true, requestId, eventsFound: events.length, blocksWritten: written, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logRows = await supabaseRequest("/booking_ical_sync_logs", {
      method: "POST",
      body: JSON.stringify({
        platform: "booking",
        ical_url: setting.ical_url,
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        error: message,
      }),
    });
    log = Array.isArray(logRows) ? logRows[0] : logRows;
    await supabaseRequest(`/booking_platform_settings?id=eq.${encodeURIComponent(setting.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_error: message }),
    });
    await createAlertIfMissing({
      severity: "P1",
      alert_type: "ical_sync_failed",
      title: "Booking iCal 同步失敗",
      description: "請檢查 Booking iCal URL 是否有效。",
      source: "booking_ical",
    });
    sendJson(res, 500, { ok: false, requestId, error: "ical_sync_failed", log });
  }
}

async function handleAlerts(req, res, requestId) {
  await requireAdmin(req);
  const alerts = await supabaseRequest("/booking_availability_alerts?select=*&order=status.asc,severity.asc,created_at.desc&limit=200");
  sendJson(res, 200, { ok: true, requestId, alerts: alerts || [] });
}

async function handleAlertPatch(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const id = cleanText(body.id, 80);
  if (!id) throw httpError(400, "缺少提醒 ID。", "missing_alert_id");
  const rows = await supabaseRequest(`/booking_availability_alerts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const before = Array.isArray(rows) ? rows[0] : null;
  if (!before) throw httpError(404, "找不到提醒。", "alert_not_found");

  const updatedRows = await supabaseRequest(`/booking_availability_alerts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "handled",
      handled_at: new Date().toISOString(),
      handled_by: admin.authUserId,
      notes: cleanText(body.notes, 1000) || before.notes || null,
    }),
  });
  const alert = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "handle_booking_alert",
    targetType: "booking_availability_alert",
    targetId: id,
    description: `標記提醒已處理：${before.title}`,
    beforeData: before,
    afterData: alert,
  });

  sendJson(res, 200, { ok: true, requestId, alert });
}

async function handleReservations(req, res, requestId) {
  await requireAdmin(req);
  const reservations = await supabaseRequest("/booking_external_reservations?select=*&order=check_in.desc,created_at.desc&limit=200");
  sendJson(res, 200, { ok: true, requestId, reservations: reservations || [] });
}

async function handleRequests(req, res, requestId) {
  await requireAdmin(req);
  const requests = await supabaseRequest(
    "/booking_requests?status=eq.pending_review&select=*&order=created_at.desc&limit=100"
  );
  sendJson(res, 200, { ok: true, requestId, requests: requests || [] });
}

async function handleCompleteStay(req, res, requestId) {
  const context = await requirePermission(req, "users.update");
  const admin = {
    authUserId: context.actorAuthUserId,
    email: context.actorEmail,
    name: context.actorName || context.actorEmail || "Admin",
  };
  const body = sanitizePayload(await readBody(req));
  const bookingId = cleanText(body.id || body.booking_id, 80);
  if (!bookingId) throw httpError(400, "Missing booking id.", "missing_booking_id");

  const booking = await fetchBookingRequestById(bookingId);
  if (!booking) throw httpError(404, "找不到此住宿訂單。", "booking_not_found");
  if (booking.completed_at) {
    return sendJson(res, 200, {
      ok: true,
      requestId,
      code: "BOOKING_STAY_ALREADY_COMPLETED",
      booking,
      points_award: {
        awarded: false,
        reason: "already_completed",
        points: 0,
        ledger_id: booking.partner_points_ledger_id || null,
        diamond_customer_profile_id: booking.partner_points_awarded_to_profile_id || null,
      },
    });
  }

  const finalLodgingAmount = parseFinalLodgingAmount(
    body.final_lodging_amount ?? body.finalLodgingAmount ?? booking.final_lodging_amount
  );
  if (!finalLodgingAmount) {
    throw httpError(
      400,
      "請輸入大於 0 且不超過 NT$10,000,000 的整數住宿房費。",
      "invalid_final_lodging_amount"
    );
  }

  let completionResult;
  try {
    completionResult = normalizeCompleteStayRpcResult(
      await supabaseRpc("complete_booking_stay_with_partner_points", {
        p_booking_id: booking.id,
        p_final_lodging_amount: finalLodgingAmount,
        p_completed_by_admin_id: context.profile?.id || null,
      })
    );
  } catch (error) {
    throw mapCompleteStayRpcError(error);
  }

  const updatedBooking = (await fetchBookingRequestById(booking.id)) || booking;
  const pointsAward = completionResult.points_award || {
    awarded: false,
    reason: completionResult.code === "BOOKING_STAY_ALREADY_COMPLETED" ? "already_completed" : "not_awarded",
    points: 0,
    ledger_id: null,
    diamond_customer_profile_id: null,
  };

  if (completionResult.code === "BOOKING_STAY_ALREADY_COMPLETED") {
    return sendJson(res, 200, {
      ok: true,
      requestId,
      code: "BOOKING_STAY_ALREADY_COMPLETED",
      booking: updatedBooking,
      points_award: pointsAward,
    });
  }

  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "complete_booking_stay",
    targetType: "booking_request",
    targetId: booking.id,
    description: `確認完成住宿：${getBookingDisplayNumber(updatedBooking || booking)}`,
    beforeData: booking,
    afterData: {
      booking: updatedBooking,
      points_award: pointsAward,
    },
  });

  sendJson(res, 200, {
    ok: true,
    requestId,
    code: completionResult.code || "BOOKING_STAY_COMPLETED",
    booking: updatedBooking,
    points_award: pointsAward,
  });
}

const pricingDayTypes = new Set(["weekday", "friday", "holiday"]);
const pricingPackageGuestCounts = Array.from({ length: 9 }, (_, index) => index + 10);

function parsePricingBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function parsePricingInteger(value, fieldName, min = 0, max = 10000000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw httpError(400, `${fieldName} is invalid.`, "invalid_pricing_payload");
  }
  return parsed;
}

function parsePricingDepositRate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw httpError(400, "deposit_rate is invalid.", "invalid_pricing_payload");
  }
  return parsed;
}

function normalizePricingDayType(value) {
  const dayType = cleanText(value, 20);
  if (!pricingDayTypes.has(dayType)) {
    throw httpError(400, "day_type is invalid.", "invalid_pricing_payload");
  }
  return dayType;
}

function normalizeRuleSetPayload(body) {
  const name = cleanText(body?.name, 120);
  const effectiveFrom = normalizeDate(body?.effective_from || body?.effectiveFrom);
  const effectiveTo = normalizeDate(body?.effective_to || body?.effectiveTo);
  if (!name) throw httpError(400, "name is required.", "invalid_pricing_payload");
  if (!effectiveFrom || !effectiveTo || effectiveTo < effectiveFrom) {
    throw httpError(400, "effective dates are invalid.", "invalid_pricing_payload");
  }

  return {
    name,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    deposit_rate: parsePricingDepositRate(body?.deposit_rate ?? body?.depositRate ?? 0.5),
    is_active: parsePricingBoolean(body?.is_active ?? body?.isActive, true),
    notes: cleanText(body?.notes, 1000) || null,
  };
}

async function assertNoActiveRuleSetOverlap(payload, currentId = "") {
  if (!payload.is_active) return;
  const rows = await supabaseRequest(
    `/booking_price_rule_sets?is_active=eq.true&effective_from=lte.${encodeURIComponent(
      payload.effective_to
    )}&effective_to=gte.${encodeURIComponent(
      payload.effective_from
    )}&select=id,name,effective_from,effective_to&limit=10`
  );
  const conflict = Array.isArray(rows)
    ? rows.find((row) => row.id && row.id !== currentId)
    : null;
  if (conflict) {
    throw httpError(409, "Active booking price rule sets cannot overlap.", "active_rule_set_overlap");
  }
}

function normalizePricingRateRow(row, fallbackRuleSetId) {
  const ruleSetId = cleanText(row?.rule_set_id || row?.ruleSetId || fallbackRuleSetId, 80);
  if (!ruleSetId) throw httpError(400, "rule_set_id is required.", "invalid_pricing_payload");
  const guestCount = parsePricingInteger(row?.guest_count ?? row?.guestCount, "guest_count", 10, 18);
  const dayType = normalizePricingDayType(row?.day_type || row?.dayType);
  const nightlyPrice = parsePricingInteger(row?.nightly_price ?? row?.nightlyPrice, "nightly_price", 0, 10000000);
  return {
    rule_set_id: ruleSetId,
    guest_count: guestCount,
    day_type: dayType,
    nightly_price: nightlyPrice,
    is_active: parsePricingBoolean(row?.is_active ?? row?.isActive, true),
  };
}

function normalizeSpecialDatePayload(body) {
  const ruleSetId = cleanText(body?.rule_set_id || body?.ruleSetId, 80);
  const date = normalizeDate(body?.date);
  if (!ruleSetId) throw httpError(400, "rule_set_id is required.", "invalid_pricing_payload");
  if (!date) throw httpError(400, "date is invalid.", "invalid_pricing_payload");
  return {
    rule_set_id: ruleSetId,
    date,
    day_type: normalizePricingDayType(body?.day_type || body?.dayType),
    label: cleanText(body?.label, 120) || null,
    is_active: parsePricingBoolean(body?.is_active ?? body?.isActive, true),
  };
}

async function handlePricingGet(req, res, requestId) {
  await requireAdmin(req);
  const ruleSets = await supabaseRequest(
    "/booking_price_rule_sets?select=*&order=effective_from.desc,name.asc"
  );
  const ruleSetIds = Array.isArray(ruleSets)
    ? ruleSets.map((ruleSet) => ruleSet.id).filter(Boolean)
    : [];
  const inFilter = ruleSetIds.length ? `in.(${ruleSetIds.join(",")})` : "";
  const rates = ruleSetIds.length
    ? await supabaseRequest(
        `/booking_package_rates?rule_set_id=${inFilter}&select=*&order=guest_count.asc,day_type.asc`
      )
    : [];
  const specialDates = ruleSetIds.length
    ? await supabaseRequest(
        `/booking_special_dates?rule_set_id=${inFilter}&select=*&order=date.asc`
      )
    : [];

  sendJson(res, 200, {
    ok: true,
    requestId,
    dayTypes: Array.from(pricingDayTypes),
    guestCounts: pricingPackageGuestCounts,
    ruleSets: Array.isArray(ruleSets) ? ruleSets : [],
    rates: Array.isArray(rates) ? rates : [],
    specialDates: Array.isArray(specialDates) ? specialDates : [],
  });
}

async function handlePricingRuleSetPost(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const id = cleanText(body?.id, 80);
  const payload = normalizeRuleSetPayload(body);
  await assertNoActiveRuleSetOverlap(payload, id);
  const rows = await supabaseRequest(
    id
      ? `/booking_price_rule_sets?id=eq.${encodeURIComponent(id)}&select=*`
      : "/booking_price_rule_sets?select=*",
    {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    }
  );
  const ruleSet = Array.isArray(rows) ? rows[0] : rows;
  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: id ? "update_booking_price_rule_set" : "create_booking_price_rule_set",
    targetType: "booking_price_rule_set",
    targetId: ruleSet?.id || id || null,
    description: "更新房價規則期間",
    beforeData: null,
    afterData: ruleSet,
  });
  sendJson(res, 200, { ok: true, requestId, ruleSet });
}

async function handlePricingRatesPost(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const ruleSetId = cleanText(body?.rule_set_id || body?.ruleSetId, 80);
  const rows = Array.isArray(body?.rates) ? body.rates : [];
  if (!ruleSetId || rows.length === 0) {
    throw httpError(400, "rates are required.", "invalid_pricing_payload");
  }
  const payload = rows.map((row) => normalizePricingRateRow(row, ruleSetId));
  const savedRates = await supabaseRequest(
    "/booking_package_rates?on_conflict=rule_set_id,guest_count,day_type&select=*",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload),
    }
  );
  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: "update_booking_package_rates",
    targetType: "booking_price_rule_set",
    targetId: ruleSetId,
    description: "更新包棟房價矩陣",
    beforeData: null,
    afterData: { rates: savedRates },
  });
  sendJson(res, 200, { ok: true, requestId, rates: Array.isArray(savedRates) ? savedRates : [] });
}

async function handlePricingSpecialDatePost(req, res, requestId) {
  const admin = await requireAdmin(req);
  const body = sanitizePayload(await readBody(req));
  const id = cleanText(body?.id, 80);
  const payload = normalizeSpecialDatePayload(body);
  const rows = await supabaseRequest(
    id
      ? `/booking_special_dates?id=eq.${encodeURIComponent(id)}&select=*`
      : "/booking_special_dates?select=*",
    {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    }
  );
  const specialDate = Array.isArray(rows) ? rows[0] : rows;
  await writeBookingAuditLog({
    req,
    requestId,
    admin,
    action: id ? "update_booking_special_date" : "create_booking_special_date",
    targetType: "booking_special_date",
    targetId: specialDate?.id || id || null,
    description: "更新特殊日期房價分類",
    beforeData: null,
    afterData: specialDate,
  });
  sendJson(res, 200, { ok: true, requestId, specialDate });
}
async function dispatch(req, res, requestId) {
  const action = firstQueryValue(req.query?.action) || "dashboard";
  if (req.method === "GET" && action === "dashboard") return handleDashboard(req, res, requestId);
  if (req.method === "GET" && action === "calendar") return handleCalendar(req, res, requestId);
  if (req.method === "GET" && action === "settings") return handleSettingsGet(req, res, requestId);
  if (req.method === "GET" && action === "alerts") return handleAlerts(req, res, requestId);
  if (req.method === "GET" && action === "reservations") return handleReservations(req, res, requestId);
  if (req.method === "GET" && action === "requests") return handleRequests(req, res, requestId);
  if (req.method === "GET" && action === "pricing") return handlePricingGet(req, res, requestId);
  if (req.method === "POST" && action === "external-reservation") return handleExternalReservation(req, res, requestId);
  if (req.method === "POST" && action === "email-detection") return handleEmailDetection(req, res, requestId);
  if (req.method === "POST" && action === "settings") return handleSettingsPost(req, res, requestId);
  if (req.method === "POST" && action === "pricing-rule-set") return handlePricingRuleSetPost(req, res, requestId);
  if (req.method === "POST" && action === "pricing-rates") return handlePricingRatesPost(req, res, requestId);
  if (req.method === "POST" && action === "pricing-special-date") return handlePricingSpecialDatePost(req, res, requestId);
  if (req.method === "POST" && action === "sync-ical") return handleSyncIcal(req, res, requestId);
  if (req.method === "PATCH" && action === "alert") return handleAlertPatch(req, res, requestId);
  if (req.method === "POST" && action === "complete-stay") return handleCompleteStay(req, res, requestId);
  throw httpError(404, "Unknown booking action.", "unknown_action");
}

export default async function handler(req, res) {
  const requestId = req.headers?.[requestIdHeader] || makeRequestId();
  try {
    await dispatch(req, res, requestId);
  } catch (error) {
    const status = error?.status || 500;
    const message = status >= 500 ? "訂房管理暫時無法處理，請稍後再試。" : error.message;
    console.error("[admin-bookings]", {
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
      message,
    });
  }
}

export const __testing = {
  buildPartnerPointsEligibility,
  calculatePartnerRewardPoints,
  getCouponCodeKey,
  isDirectBookingSource,
  normalizeCouponCode,
  parseFinalLodgingAmount,
};
