import { createHash, randomBytes } from "node:crypto";
import {
  supabaseRequest,
  supabaseRpc,
} from "./shopShared.js";
import {
  getBookingBankTransferSettings,
  publicBankTransferSettings,
} from "./bookingPayments/config.js";

export const bookingManageCookieName = "mumbao_booking_manage";
const genericLookupMessage = "查無符合的訂單資料，請確認輸入內容。";
const sessionMinutes = 30;
const lookupRateLimit = {
  attempts: 8,
  windowSeconds: 10 * 60,
};

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeBookingReference(value) {
  const compact = cleanText(value, 32).replace(/\D/g, "");
  return /^\d{10}$/.test(compact) ? compact : "";
}

function normalizeEmail(value) {
  return cleanText(value, 300).toLowerCase();
}

function normalizePhone(value) {
  return cleanText(value, 60).replace(/[^\d+]/g, "");
}

function normalizeContact(value) {
  const raw = cleanText(value, 300);
  if (raw.includes("@")) return { type: "email", value: normalizeEmail(raw) };
  return { type: "phone", value: normalizePhone(raw) };
}

function getHeader(req, name) {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function getRequestIp(req) {
  const forwardedFor = getHeader(req, "x-forwarded-for").split(",")[0].trim();
  return forwardedFor || String(req.socket?.remoteAddress || "").trim() || "unknown";
}

function getCookie(req, name) {
  const cookieHeader = getHeader(req, "cookie");
  const parts = cookieHeader.split(/;\s*/);
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    if (part.slice(0, separatorIndex) === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1));
    }
  }
  return "";
}

function isHttpsRequest(req) {
  const forwardedProto = getHeader(req, "x-forwarded-proto");
  const host = getHeader(req, "host");
  return forwardedProto === "https" || (!host.includes("localhost") && !host.includes("127.0.0.1"));
}

function setCookie(res, value, req) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${bookingManageCookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMinutes * 60}${secure}`,
  );
}

function clearCookie(res, req) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${bookingManageCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

function makeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashManagementToken(token) {
  return sha256(token);
}

export function managementSessionTokenFromRequest(req) {
  return getCookie(req, bookingManageCookieName);
}

export function lookupHttpError(status = 404) {
  const error = new Error(genericLookupMessage);
  error.status = status;
  error.code = status === 429 ? "booking_lookup_rate_limited" : "booking_lookup_failed";
  return error;
}

function publicStatusLabel(status) {
  if (status === "payment_hold") return "待付款";
  if (status === "payment_review") return "匯款資料確認中";
  if (status === "confirmed") return "訂房已成立";
  if (status === "expired") return "付款期限已結束";
  if (status === "cancelled") return "訂房已取消";
  if (status === "pending_review") return "訂房確認中";
  return "訂房確認中";
}

function paymentStatusLabel(status, bookingStatus) {
  if (bookingStatus === "payment_hold") return "待付款";
  if (bookingStatus === "payment_review") return "匯款資料已送出，等待確認";
  if (status === "verified") return "訂金已確認";
  if (status === "reported") return "匯款資料確認中";
  if (status === "rejected") return "匯款資料未通過";
  if (status === "cancelled") return "付款已終止";
  if (status === "expired") return "付款期限已結束";
  return "尚未付款";
}

function cancellationStatusLabel(request) {
  if (!request) return "無取消申請";
  if (request.status === "pending") return "取消申請審核中";
  if (request.status === "approved") return "取消申請已核准";
  if (request.status === "rejected") return "取消申請未通過";
  if (request.status === "withdrawn") return "取消申請已撤回";
  return "無取消申請";
}

function maskEmail(email) {
  const [name, domain] = String(email || "").trim().split("@");
  if (!name || !domain) return "-";
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
}

function maskPhone(phone) {
  const compact = String(phone || "").replace(/\s+/g, "");
  if (!compact) return "-";
  if (compact.length <= 4) return `${compact.slice(0, 1)}***`;
  return `${compact.slice(0, 2)}${"*".repeat(Math.max(compact.length - 4, 3))}${compact.slice(-2)}`;
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function nightsBetween(checkIn, checkOut) {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

function latestRow(rows) {
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchPaymentRecord(bookingId) {
  const rows = await supabaseRequest(
    `/booking_payment_records?booking_request_id=eq.${encodeURIComponent(
      bookingId,
    )}&select=*&order=created_at.desc&limit=1`,
  );
  return latestRow(rows);
}

async function fetchLatestCancellationRequest(bookingId) {
  const rows = await supabaseRequest(
    `/booking_cancellation_requests?booking_request_id=eq.${encodeURIComponent(
      bookingId,
    )}&select=*&order=created_at.desc&limit=1`,
  );
  return latestRow(rows);
}

async function fetchCancellationAudits(bookingId) {
  const rows = await supabaseRequest(
    `/booking_cancellation_audit_logs?booking_request_id=eq.${encodeURIComponent(
      bookingId,
    )}&select=id,action,previous_booking_status,new_booking_status,previous_payment_status,new_payment_status,reason,action_at&order=action_at.desc&limit=20`,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchPaymentAudits(bookingId) {
  const rows = await supabaseRequest(
    `/booking_payment_admin_audit_logs?booking_request_id=eq.${encodeURIComponent(
      bookingId,
    )}&select=id,action,previous_booking_status,new_booking_status,previous_payment_status,new_payment_status,action_at&order=action_at.desc&limit=20`,
  );
  return Array.isArray(rows) ? rows : [];
}

function buildPaymentResponse({ booking, paymentRecord, databaseNow }) {
  const settings = getBookingBankTransferSettings();
  const publicSettings = publicBankTransferSettings(settings);
  const payment = {
    ...publicSettings,
    label: paymentStatusLabel(paymentRecord?.status, booking?.status),
    serverNow: databaseNow || new Date().toISOString(),
    holdExpiresAt: booking?.hold_expires_at || null,
    paymentReportedAt: booking?.payment_reported_at || null,
    reviewExpiresAt: booking?.review_expires_at || null,
    report: paymentRecord
      ? {
          bankLast5: paymentRecord.bank_last5 || null,
          payerName: paymentRecord.payer_name || null,
          reportedAt: paymentRecord.reported_at || null,
          verifiedAt: paymentRecord.verified_at || null,
        }
      : null,
  };
  return payment;
}

export function buildPublicBookingManageResponse({
  booking,
  paymentRecord = null,
  cancellationRequest = null,
  databaseNow = null,
}) {
  const databaseNowMs = Date.parse(databaseNow || "");
  const effectiveNowMs = Number.isFinite(databaseNowMs) ? databaseNowMs : Date.now();
  const pricing = booking?.submitted_snapshot?.pricing || {};
  const summary = booking?.submitted_snapshot?.summary || {};
  const rawPayload = booking?.raw_payload || {};
  const selectedRoomOption =
    summary.selectedRoomOption ||
    rawPayload.selected_room_option ||
    booking?.pricing_breakdown?.selectedRoomOption ||
    null;
  const breakfastEntries = Array.isArray(summary.breakfastAddonEntries)
    ? summary.breakfastAddonEntries
    : Array.isArray(rawPayload.breakfast_addons)
      ? rawPayload.breakfast_addons
      : [];
  const dogCount =
    toNumber(summary.dogCount) ||
    toNumber(rawPayload.dog_count) ||
    toNumber(booking?.pet_count);

  return {
    booking: {
      bookingReference: booking.booking_reference,
      statusLabel: publicStatusLabel(booking.status),
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      nights: nightsBetween(booking.check_in, booking.check_out),
      stayType: booking.stay_type,
      adults: toNumber(booking.adults),
      children: toNumber(booking.children),
      infants: toNumber(summary.infantCount) || toNumber(rawPayload.infants),
      roomCount: booking.room_count || null,
      selectedRoomOption,
      breakfastEntries,
      dogCount,
      hasPets: Boolean(booking.has_pets),
      quotedTotal: booking.quoted_total ?? pricing.quotedTotal ?? null,
      depositAmount: booking.deposit_amount ?? pricing.depositAmount ?? null,
      balanceAmount: booking.balance_amount ?? pricing.balanceAmount ?? null,
      contact: {
        email: maskEmail(booking.guest_email),
        phone: maskPhone(booking.guest_phone),
      },
    },
    payment: buildPaymentResponse({ booking, paymentRecord, databaseNow }),
    cancellation: cancellationRequest
      ? {
          statusLabel: cancellationStatusLabel(cancellationRequest),
          requestedAt: cancellationRequest.requested_at,
          reviewedAt: cancellationRequest.reviewed_at,
          publicNote: cancellationRequest.status === "rejected" ? cancellationRequest.public_note || null : null,
        }
      : {
          statusLabel: booking.status === "cancelled" ? "訂房已取消" : cancellationStatusLabel(null),
          publicNote: null,
        },
    actions: {
      canReportBankTransfer:
        booking.status === "payment_hold" &&
        Boolean(booking.hold_expires_at) &&
        Date.parse(booking.hold_expires_at) > effectiveNowMs &&
        Boolean(publicBankTransferSettings(getBookingBankTransferSettings()).enabled),
      canDirectCancel:
        booking.status === "payment_hold" &&
        Date.parse(booking.hold_expires_at || "") > effectiveNowMs,
      canRequestCancellation:
        ["payment_review", "confirmed"].includes(booking.status) &&
        cancellationRequest?.status !== "pending",
    },
  };
}

async function createManagementSession({ req, res, bookingId }) {
  const token = makeToken();
  const tokenHash = hashManagementToken(token);
  const result = await supabaseRpc("create_booking_management_session", {
    p_booking_request_id: bookingId,
    p_token_hash: tokenHash,
    p_created_ip_hash: sha256(`booking-management-ip:${getRequestIp(req)}`),
    p_user_agent: cleanText(getHeader(req, "user-agent"), 500) || null,
  });
  if (!result?.ok) {
    const error = new Error("Unable to create booking management session.");
    error.code = result?.code || "booking_management_session_create_failed";
    throw error;
  }
  setCookie(res, token, req);
  return tokenHash;
}

export async function createManagementSessionForBooking({ req, res, bookingId }) {
  if (!bookingId) return null;
  return createManagementSession({ req, res, bookingId });
}

async function consumeLookupRateLimit(req, bookingReference) {
  const ipKey = sha256(`booking-lookup-ip:${getRequestIp(req)}`);
  const referenceKey = sha256(`booking-lookup-reference:${bookingReference || "invalid"}`);
  const results = await Promise.all([
    supabaseRpc("consume_booking_lookup_rate_limit", {
      p_key_hash: ipKey,
      p_limit: lookupRateLimit.attempts,
      p_window_seconds: lookupRateLimit.windowSeconds,
    }),
    supabaseRpc("consume_booking_lookup_rate_limit", {
      p_key_hash: referenceKey,
      p_limit: lookupRateLimit.attempts,
      p_window_seconds: lookupRateLimit.windowSeconds,
    }),
  ]);
  const blocked = results.find((result) => !result?.allowed);
  if (blocked) {
    const error = lookupHttpError(429);
    error.retryAfterSeconds = Number(blocked.retry_after_seconds) || lookupRateLimit.windowSeconds;
    throw error;
  }
}

async function fetchBookingByReference(bookingReference) {
  const rows = await supabaseRequest(
    `/booking_requests?booking_reference=eq.${encodeURIComponent(
      bookingReference,
    )}&select=*&limit=1`,
  );
  return latestRow(rows);
}

function contactMatches(booking, contact) {
  if (!booking || !contact?.value) return false;
  if (contact.type === "email") return normalizeEmail(booking.guest_email) === contact.value;
  return normalizePhone(booking.guest_phone) === contact.value;
}

export async function handleBookingLookup({ req, res, body }) {
  const rawBookingReference = cleanText(body?.bookingReference || body?.booking_reference, 32);
  const bookingReference = normalizeBookingReference(rawBookingReference);
  const contact = normalizeContact(body?.contact || body?.emailOrPhone || body?.email_or_phone);

  await consumeLookupRateLimit(req, bookingReference || rawBookingReference || getRequestIp(req));

  if (!bookingReference || !contact.value) {
    throw lookupHttpError();
  }

  const booking = await fetchBookingByReference(bookingReference);
  if (!contactMatches(booking, contact)) {
    throw lookupHttpError();
  }

  await createManagementSession({ req, res, bookingId: booking.id });
  const paymentRecord = await fetchPaymentRecord(booking.id);
  const cancellationRequest = await fetchLatestCancellationRequest(booking.id);

  return {
    ok: true,
    managePath: "/booking/manage",
    ...buildPublicBookingManageResponse({ booking, paymentRecord, cancellationRequest }),
  };
}

export async function requireManagementSession(req) {
  const token = managementSessionTokenFromRequest(req);
  const tokenHash = token ? hashManagementToken(token) : "";
  if (!tokenHash) throw lookupHttpError(401);

  const result = await supabaseRpc("get_booking_management_session", {
    p_session_token_hash: tokenHash,
  });
  if (!result?.ok || !result?.session?.booking_request_id) throw lookupHttpError(401);
  return { session: result.session, tokenHash, databaseNow: result.database_now || null };
}

export async function handleBookingManage({ req }) {
  const { session, databaseNow } = await requireManagementSession(req);
  const rows = await supabaseRequest(
    `/booking_requests?id=eq.${encodeURIComponent(session.booking_request_id)}&select=*&limit=1`,
  );
  const booking = latestRow(rows);
  if (!booking) throw lookupHttpError(404);

  const paymentRecord = await fetchPaymentRecord(booking.id);
  const cancellationRequest = await fetchLatestCancellationRequest(booking.id);
  return {
    ok: true,
    ...buildPublicBookingManageResponse({ booking, paymentRecord, cancellationRequest, databaseNow }),
  };
}

function normalizeReasonCode(value) {
  const reason = cleanText(value, 40);
  return ["schedule_change", "guest_count_change", "weather", "other"].includes(reason)
    ? reason
    : "";
}

export async function handleCustomerCancellation({ req, body }) {
  const { session, tokenHash } = await requireManagementSession(req);
  const reasonCode = normalizeReasonCode(body?.reasonCode || body?.reason_code);
  const reasonText = cleanText(body?.reasonText || body?.reason_text, 1000);
  if (!reasonCode) {
    const error = new Error("請選擇取消原因。");
    error.status = 400;
    error.code = "invalid_cancellation_reason";
    throw error;
  }

  const rows = await supabaseRequest(
    `/booking_requests?id=eq.${encodeURIComponent(session.booking_request_id)}&select=id,status&limit=1`,
  );
  const booking = latestRow(rows);
  if (!booking) throw lookupHttpError(404);

  const rpcName =
    booking.status === "payment_hold"
      ? "customer_cancel_payment_hold_booking"
      : "customer_request_booking_cancellation";
  const result = await supabaseRpc(rpcName, {
    p_booking_request_id: session.booking_request_id,
    p_session_token_hash: tokenHash,
    p_reason_code: reasonCode,
    p_reason_text: reasonText,
  });

  if (!result?.ok) {
    const error = new Error("目前無法送出取消處理，請稍後再試。");
    error.status = result?.code?.includes("not_allowed") ? 409 : 400;
    error.code = result?.code || "booking_cancellation_failed";
    throw error;
  }

  return handleBookingManage({ req });
}

function paymentRateLimitKey(req) {
  return sha256(`booking-payment-report:${getRequestIp(req)}`);
}

export async function handleManagementPaymentReport({ req, body }) {
  const settings = getBookingBankTransferSettings();
  if (!settings.enabled) {
    const error = new Error("目前未開放銀行轉帳回報。");
    error.status = 404;
    error.code = "bank_transfer_disabled";
    throw error;
  }

  const { session, tokenHash } = await requireManagementSession(req);
  const bankLast5 = cleanText(body?.bankLast5, 5);
  if (!/^\d{5}$/.test(bankLast5)) {
    const error = new Error("請輸入帳號末五碼。");
    error.status = 400;
    error.code = "invalid_bank_last5";
    throw error;
  }

  const rateLimitResult = await supabaseRpc("consume_booking_payment_report_rate_limit", {
    p_key_hash: paymentRateLimitKey(req),
    p_limit: settings.reportRateLimit.attempts,
    p_window_seconds: settings.reportRateLimit.windowSeconds,
  });
  if (!rateLimitResult?.allowed) {
    const error = new Error("嘗試次數過多，請稍後再試。");
    error.status = 429;
    error.code = "payment_report_rate_limited";
    error.retryAfterSeconds = Number(rateLimitResult?.retry_after_seconds) || settings.reportRateLimit.windowSeconds;
    throw error;
  }

  const result = await supabaseRpc("report_booking_bank_transfer_from_management_session", {
    p_booking_request_id: session.booking_request_id,
    p_session_token_hash: tokenHash,
    p_bank_last5: bankLast5,
    p_payer_name: cleanText(body?.payerName, 80) || null,
    p_notes: cleanText(body?.notes, 500) || null,
    p_review_minutes: settings.reviewMinutes,
  });

  if (!result?.ok) {
    const error = new Error("目前無法送出匯款資料，請稍後再試。");
    error.status = ["booking_hold_expired", "payment_review_expired"].includes(result?.code) ? 410 : 409;
    error.code = result?.code || "payment_report_failed";
    throw error;
  }

  return handleBookingManage({ req });
}

function orderSelect() {
  return [
    "id",
    "booking_reference",
    "guest_name",
    "guest_email",
    "guest_phone",
    "check_in",
    "check_out",
    "guest_count",
    "status",
    "stay_type",
    "adults",
    "children",
    "room_count",
    "has_pets",
    "pet_count",
    "source",
    "quoted_total",
    "deposit_amount",
    "balance_amount",
    "pricing_breakdown",
    "raw_payload",
    "hold_expires_at",
    "payment_reported_at",
    "review_expires_at",
    "created_at",
    "updated_at",
  ].join(",");
}

function paymentStatus(paymentRecord) {
  return paymentRecord?.status || "none";
}

function adminOrderSummary(booking, paymentRecord, cancellationRequest) {
  return {
    ...booking,
    payment_record: paymentRecord || null,
    payment_status: paymentStatus(paymentRecord),
    cancellation_request: cancellationRequest || null,
    cancellation_status: cancellationRequest?.status || "none",
  };
}

export async function fetchAdminBookingOrders({ query }) {
  const allowedBookingStatuses = new Set([
    "payment_hold",
    "payment_review",
    "pending_review",
    "confirmed",
    "expired",
    "cancelled",
  ]);
  const allowedCancellationStatuses = new Set(["none", "pending", "approved", "rejected", "withdrawn"]);
  const params = new URLSearchParams();
  params.set("select", orderSelect());
  params.set("order", "created_at.desc");
  params.set("limit", "200");

  const status = cleanText(query?.status, 40);
  if (allowedBookingStatuses.has(status)) params.set("status", `eq.${status}`);

  const checkIn = cleanText(query?.checkIn || query?.check_in, 20);
  const checkOut = cleanText(query?.checkOut || query?.check_out, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) params.set("check_in", `gte.${checkIn}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) params.set("check_out", `lte.${checkOut}`);

  const search = cleanText(query?.q || query?.query, 160);
  if (/^\d{10}$/.test(search)) {
    params.set("booking_reference", `eq.${search}`);
  } else {
    const safeSearch = search.replace(/[,()*]/g, " ").replace(/\s+/g, " ").trim();
    if (safeSearch) {
      params.set(
        "or",
        `(booking_reference.ilike.*${safeSearch}*,guest_name.ilike.*${safeSearch}*,guest_email.ilike.*${safeSearch}*,guest_phone.ilike.*${safeSearch}*)`,
      );
    }
  }

  const cancellationStatus = cleanText(
    query?.cancellationStatus || query?.cancellation_status,
    40,
  );
  if (allowedCancellationStatuses.has(cancellationStatus) && cancellationStatus !== "none") {
    const matchingCancellations = await supabaseRequest(
      `/booking_cancellation_requests?status=eq.${encodeURIComponent(cancellationStatus)}&select=booking_request_id&order=created_at.desc&limit=200`,
    );
    const matchingBookingIds = [
      ...new Set(
        (Array.isArray(matchingCancellations) ? matchingCancellations : [])
          .map((row) => row.booking_request_id)
          .filter(Boolean),
      ),
    ];
    if (matchingBookingIds.length === 0) return { ok: true, orders: [] };
    params.set("id", `in.(${matchingBookingIds.join(",")})`);
  }

  const bookings = await supabaseRequest(`/booking_requests?${params.toString()}`);
  const normalizedBookings = Array.isArray(bookings) ? bookings : [];
  const ids = normalizedBookings.map((booking) => booking.id).filter(Boolean);
  const payments = ids.length
    ? await supabaseRequest(
        `/booking_payment_records?booking_request_id=in.(${ids.map(encodeURIComponent).join(",")})&select=*&order=created_at.desc`,
      )
    : [];
  const cancellations = ids.length
    ? await supabaseRequest(
        `/booking_cancellation_requests?booking_request_id=in.(${ids.map(encodeURIComponent).join(",")})&select=*&order=created_at.desc`,
      )
    : [];
  const paymentByBookingId = new Map();
  for (const payment of Array.isArray(payments) ? payments : []) {
    if (!paymentByBookingId.has(payment.booking_request_id)) paymentByBookingId.set(payment.booking_request_id, payment);
  }
  const cancellationByBookingId = new Map();
  for (const cancellation of Array.isArray(cancellations) ? cancellations : []) {
    if (!cancellationByBookingId.has(cancellation.booking_request_id)) {
      cancellationByBookingId.set(cancellation.booking_request_id, cancellation);
    }
  }
  const searchLower = search.toLowerCase();
  const rows = normalizedBookings
    .map((booking) => adminOrderSummary(booking, paymentByBookingId.get(booking.id), cancellationByBookingId.get(booking.id)))
    .filter((booking) => {
      if (!search || /^\d{10}$/.test(search)) return true;
      return [
        booking.booking_reference,
        booking.guest_name,
        booking.guest_email,
        booking.guest_phone,
      ].some((value) => String(value || "").toLowerCase().includes(searchLower));
    })
    .filter(
      (booking) =>
        !allowedCancellationStatuses.has(cancellationStatus) ||
        cancellationStatus === "all" ||
        booking.cancellation_status === cancellationStatus,
    );
  return { ok: true, orders: rows };
}

export async function fetchAdminBookingOrderDetail({ id }) {
  const bookingId = cleanText(id, 80);
  if (!bookingId) {
    const error = new Error("Missing booking id.");
    error.status = 400;
    error.code = "missing_booking_id";
    throw error;
  }
  const rows = await supabaseRequest(
    `/booking_requests?id=eq.${encodeURIComponent(bookingId)}&select=*&limit=1`,
  );
  const booking = latestRow(rows);
  if (!booking) {
    const error = new Error("Booking not found.");
    error.status = 404;
    error.code = "booking_not_found";
    throw error;
  }
  const [paymentRecord, cancellationRequest, cancellationAudits, paymentAudits] = await Promise.all([
    fetchPaymentRecord(booking.id),
    fetchLatestCancellationRequest(booking.id),
    fetchCancellationAudits(booking.id),
    fetchPaymentAudits(booking.id),
  ]);
  return {
    ok: true,
    order: adminOrderSummary(booking, paymentRecord, cancellationRequest),
    cancellation_audits: cancellationAudits,
    payment_audits: paymentAudits,
  };
}

function mapRpcFailure(result, fallbackCode) {
  const code = result?.code || fallbackCode;
  const status = code === "invalid_admin_context" ? 403 : code.includes("not_found") ? 404 : 409;
  const error = new Error("訂單狀態已變更，請重新整理後再試。");
  error.status = status;
  error.code = code;
  return error;
}

export async function adminCancelBooking({ bookingId, adminProfileId, reason }) {
  const cleanBookingId = cleanText(bookingId, 80);
  if (!cleanBookingId) {
    const error = new Error("Missing booking id.");
    error.status = 400;
    error.code = "missing_booking_id";
    throw error;
  }
  const cleanReason = cleanText(reason, 1000);
  if (!cleanReason) {
    const error = new Error("取消原因為必填。");
    error.status = 400;
    error.code = "cancellation_reason_required";
    throw error;
  }
  const result = await supabaseRpc("admin_cancel_confirmed_booking", {
    p_booking_request_id: cleanBookingId,
    p_admin_profile_id: adminProfileId,
    p_reason: cleanReason,
  });
  if (!result?.ok) throw mapRpcFailure(result, "admin_booking_cancel_failed");
  return {
    ok: true,
    booking: result.request,
    payment_record: result.payment_record || null,
    audit: result.audit || null,
    idempotent: Boolean(result.idempotent),
  };
}

export async function adminReviewCancellation({ cancellationRequestId, adminProfileId, decision, adminNote, publicNote }) {
  const cleanCancellationRequestId = cleanText(cancellationRequestId, 80);
  if (!cleanCancellationRequestId) {
    const error = new Error("Missing cancellation request id.");
    error.status = 400;
    error.code = "missing_cancellation_request_id";
    throw error;
  }
  const cleanDecision = cleanText(decision, 20);
  if (!["approved", "rejected"].includes(cleanDecision)) {
    const error = new Error("Invalid cancellation review decision.");
    error.status = 400;
    error.code = "invalid_cancellation_review_decision";
    throw error;
  }
  const result = await supabaseRpc("review_booking_cancellation_request", {
    p_cancellation_request_id: cleanCancellationRequestId,
    p_admin_profile_id: adminProfileId,
    p_decision: cleanDecision,
    p_admin_note: cleanText(adminNote, 1000) || null,
    p_public_note: cleanText(publicNote, 1000) || null,
  });
  if (!result?.ok) throw mapRpcFailure(result, "booking_cancellation_review_failed");
  return {
    ok: true,
    booking: result.request,
    payment_record: result.payment_record || null,
    cancellation_request: result.cancellation_request || null,
    audit: result.audit || null,
    idempotent: Boolean(result.idempotent),
  };
}

export function clearBookingManagementCookie({ req, res }) {
  clearCookie(res, req);
}
