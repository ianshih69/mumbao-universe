import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const requestIdHeader = "x-request-id";
const villaAliases = ["慢慢蒔光", "stime villa", "mumbao"];

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

  const [alerts, settings, pendingEmails] = await Promise.all([
    supabaseRequest("/booking_availability_alerts?status=eq.open&select=severity,alert_type,created_at"),
    supabaseRequest("/booking_platform_settings?platform=eq.booking&select=platform,last_synced_at,last_error,enabled&limit=1"),
    supabaseRequest("/booking_email_detections?status=eq.pending_review&select=id"),
  ]);

  const calendarBlocks = await supabaseRequest(
    `/booking_availability_blocks?status=eq.confirmed&check_in=lt.${encodeURIComponent(to)}&check_out=gt.${encodeURIComponent(from)}&select=id`
  );

  const openAlerts = Array.isArray(alerts) ? alerts : [];
  const p0Count = openAlerts.filter((alert) => alert.severity === "P0").length;
  const p1Count = openAlerts.filter((alert) => alert.severity === "P1").length;
  const p2Count = openAlerts.filter((alert) => alert.severity === "P2").length;
  const lastSetting = Array.isArray(settings) ? settings[0] : null;

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
  const months = Math.min(Math.max(Number(firstQueryValue(req.query?.months)) || 12, 1), 12);
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
  const settings = await supabaseRequest("/booking_platform_settings?select=*&order=platform.asc");
  sendJson(res, 200, { ok: true, requestId, settings: settings || [] });
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

async function dispatch(req, res, requestId) {
  const action = firstQueryValue(req.query?.action) || "dashboard";
  if (req.method === "GET" && action === "dashboard") return handleDashboard(req, res, requestId);
  if (req.method === "GET" && action === "calendar") return handleCalendar(req, res, requestId);
  if (req.method === "GET" && action === "settings") return handleSettingsGet(req, res, requestId);
  if (req.method === "GET" && action === "alerts") return handleAlerts(req, res, requestId);
  if (req.method === "GET" && action === "reservations") return handleReservations(req, res, requestId);
  if (req.method === "POST" && action === "external-reservation") return handleExternalReservation(req, res, requestId);
  if (req.method === "POST" && action === "email-detection") return handleEmailDetection(req, res, requestId);
  if (req.method === "POST" && action === "settings") return handleSettingsPost(req, res, requestId);
  if (req.method === "POST" && action === "sync-ical") return handleSyncIcal(req, res, requestId);
  if (req.method === "PATCH" && action === "alert") return handleAlertPatch(req, res, requestId);
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
