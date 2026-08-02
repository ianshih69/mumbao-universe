import { firstQueryValue, readBody, sendJson, supabaseRequest, supabaseRpc } from "../shopShared.js";
import { requirePermission, writeAdminActivityLog } from "./core.js";
import { withHandlerSafety } from "./withHandlerSafety.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 10;
const statuses = new Set(["pending", "completed", "rejected"]);
const redemptionSelect =
  "id,customer_profile_id,points,bank_name,account_holder,account_number,status,requested_at,completed_at,completed_by_admin_id,rejected_at,rejected_by_admin_id,rejection_reason,ledger_id";
const profileSelect = "id,auth_user_id,email,name,member_level";
const diamondProfileSelect = "id,customer_profile_id,partner_name,exclusive_code,partnership_status";

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function isUuid(value) {
  return uuidPattern.test(String(value || ""));
}

function getPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStatusSort(status) {
  if (status === "pending") return 0;
  if (status === "rejected") return 1;
  return 2;
}

function maskBankAccount(accountNumber) {
  const digits = String(accountNumber || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 4 ? digits : `****${digits.slice(-4)}`;
}

function getAccountLast4(accountNumber) {
  return String(accountNumber || "").replace(/\D/g, "").slice(-4);
}

function sanitizeAuditRedemption(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer_profile_id: row.customer_profile_id,
    points: Number(row.points || 0),
    status: row.status || "",
    bank_name: row.bank_name || "",
    account_last4: getAccountLast4(row.account_number),
    requested_at: row.requested_at || null,
    completed_at: row.completed_at || null,
    rejected_at: row.rejected_at || null,
    rejection_reason: row.rejection_reason || "",
    ledger_id: row.ledger_id || null,
  };
}

function normalizeRedemption(row, { profilesById = new Map(), diamondsByProfileId = new Map(), includeFullAccount = false } = {}) {
  const profile = profilesById.get(row.customer_profile_id) || null;
  const diamond = diamondsByProfileId.get(row.customer_profile_id) || null;
  return {
    id: row.id,
    customer_profile_id: row.customer_profile_id,
    member_name: profile?.name || "",
    member_email: profile?.email || "",
    partner_name: diamond?.partner_name || "",
    exclusive_code: diamond?.exclusive_code || "",
    points: Number(row.points || 0),
    bank_name: row.bank_name || "",
    account_holder: row.account_holder || "",
    account_number_masked: maskBankAccount(row.account_number),
    account_last4: getAccountLast4(row.account_number),
    ...(includeFullAccount ? { account_number: row.account_number || "" } : {}),
    status: statuses.has(row.status) ? row.status : "pending",
    requested_at: row.requested_at || null,
    completed_at: row.completed_at || null,
    rejected_at: row.rejected_at || null,
    rejection_reason: row.rejection_reason || "",
    ledger_id: row.ledger_id || null,
  };
}

async function fetchProfilesByIds(profileIds, deps) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await deps.supabaseRequest(
    `/shop_customer_profiles?id=in.(${ids.join(",")})&select=${profileSelect}&limit=${ids.length}`,
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, row]));
}

async function fetchDiamondProfilesByProfileIds(profileIds, deps) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await deps.supabaseRequest(
    `/member_diamond_profiles?customer_profile_id=in.(${ids.join(",")})&select=${diamondProfileSelect}&limit=${ids.length}`,
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.customer_profile_id, row]));
}

async function fetchRedemptionById(id, deps) {
  const rows = await deps.supabaseRequest(
    `/member_points_redemption_requests?id=eq.${encodeURIComponent(id)}&select=${redemptionSelect}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function hydrateRedemptions(rows, deps, options = {}) {
  const profileIds = rows.map((row) => row.customer_profile_id);
  const [profilesById, diamondsByProfileId] = await Promise.all([
    fetchProfilesByIds(profileIds, deps),
    fetchDiamondProfilesByProfileIds(profileIds, deps),
  ]);
  return rows.map((row) => normalizeRedemption(row, { profilesById, diamondsByProfileId, ...options }));
}

async function handleList(req, res, deps) {
  await deps.requirePermission(req, "users.view");
  const page = getPositiveInt(firstQueryValue(req.query?.page), 1);
  const status = cleanText(firstQueryValue(req.query?.status), 20);
  const statusFilter = statuses.has(status) ? status : "";
  const rows = await deps.supabaseRequest(
    `/member_points_redemption_requests?select=${redemptionSelect}&order=requested_at.desc&limit=1000`,
  );
  const filtered = (Array.isArray(rows) ? rows : [])
    .filter((row) => !statusFilter || row.status === statusFilter)
    .sort((a, b) => {
      const statusDelta = getStatusSort(a.status) - getStatusSort(b.status);
      if (statusDelta !== 0) return statusDelta;
      return (Date.parse(b.requested_at || "") || 0) - (Date.parse(a.requested_at || "") || 0);
    });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const redemptions = await hydrateRedemptions(pageRows, deps);

  return sendJson(res, 200, {
    ok: true,
    redemptions,
    page: safePage,
    pageSize,
    total,
    totalPages,
  });
}

async function handleDetail(req, res, deps, id) {
  await deps.requirePermission(req, "users.update");
  const row = await fetchRedemptionById(id, deps);
  if (!row) throw createHttpError(404, "找不到此兌換申請。", "REDEMPTION_NOT_FOUND");
  const [redemption] = await hydrateRedemptions([row], deps, { includeFullAccount: true });
  return sendJson(res, 200, { ok: true, redemption });
}

function mapRpcError(error) {
  const message = String(error?.message || "");
  if (message.includes("REDEMPTION_REQUEST_NOT_FOUND")) {
    return createHttpError(404, "找不到此兌換申請。", "REDEMPTION_NOT_FOUND");
  }
  if (message.includes("REDEMPTION_REQUEST_NOT_PENDING")) {
    return createHttpError(409, "此兌換申請已處理。", "REDEMPTION_NOT_PENDING");
  }
  if (message.includes("REDEMPTION_POINTS_EXCEED_AVAILABLE")) {
    return createHttpError(409, "此會員目前積分不足，無法完成兌換。", "REDEMPTION_POINTS_EXCEED_AVAILABLE");
  }
  if (message.includes("REDEMPTION_LEDGER_ALREADY_EXISTS")) {
    return createHttpError(409, "此兌換申請已建立扣點紀錄。", "REDEMPTION_LEDGER_ALREADY_EXISTS");
  }
  if (message.includes("REJECTION_REASON_REQUIRED")) {
    return createHttpError(400, "請填寫未通過原因。", "REJECTION_REASON_REQUIRED");
  }
  if (message.includes("ADMIN_PROFILE_NOT_FOUND")) {
    return createHttpError(403, "找不到執行操作的管理員。", "ADMIN_PROFILE_NOT_FOUND");
  }
  return error;
}

async function handleComplete(req, res, deps, context, row) {
  let result;
  try {
    result = await deps.supabaseRpc("complete_member_points_redemption_request", {
      p_request_id: row.id,
      p_completed_by_admin_id: context.profile?.id || null,
    });
  } catch (error) {
    throw mapRpcError(error);
  }
  const updated = (await fetchRedemptionById(row.id, deps)) || row;
  await deps.writeAdminActivityLog({
    req,
    context,
    action: "complete_member_points_redemption",
    module: "members",
    targetType: "member_points_redemption",
    targetId: row.id,
    description: `完成合作回饋兌換：${row.id}`,
    beforeData: sanitizeAuditRedemption(row),
    afterData: sanitizeAuditRedemption(updated),
  });
  const [redemption] = await hydrateRedemptions([updated], deps, { includeFullAccount: true });
  return sendJson(res, 200, { ok: true, code: result?.code || "REDEMPTION_COMPLETED", redemption });
}

async function handleReject(req, res, deps, context, row, body) {
  const reason = cleanText(body.reason || body.rejectionReason || body.rejection_reason, 300);
  if (!reason) throw createHttpError(400, "請填寫未通過原因。", "REJECTION_REASON_REQUIRED");
  let result;
  try {
    result = await deps.supabaseRpc("reject_member_points_redemption_request", {
      p_request_id: row.id,
      p_rejected_by_admin_id: context.profile?.id || null,
      p_rejection_reason: reason,
    });
  } catch (error) {
    throw mapRpcError(error);
  }
  const updated = (await fetchRedemptionById(row.id, deps)) || row;
  await deps.writeAdminActivityLog({
    req,
    context,
    action: "reject_member_points_redemption",
    module: "members",
    targetType: "member_points_redemption",
    targetId: row.id,
    description: `未通過合作回饋兌換：${row.id}`,
    beforeData: sanitizeAuditRedemption(row),
    afterData: sanitizeAuditRedemption(updated),
  });
  const [redemption] = await hydrateRedemptions([updated], deps, { includeFullAccount: true });
  return sendJson(res, 200, { ok: true, code: result?.code || "REDEMPTION_REJECTED", redemption });
}

async function handleMutation(req, res, deps) {
  const context = await deps.requirePermission(req, "users.update");
  const body = await deps.readBody(req);
  const id = cleanText(firstQueryValue(req.query?.id) || body.id, 80);
  if (!isUuid(id)) throw createHttpError(404, "找不到此兌換申請。", "REDEMPTION_NOT_FOUND");
  const row = await fetchRedemptionById(id, deps);
  if (!row) throw createHttpError(404, "找不到此兌換申請。", "REDEMPTION_NOT_FOUND");
  const action = cleanText(body.action, 40);
  if (action === "complete") return handleComplete(req, res, deps, context, row);
  if (action === "reject") return handleReject(req, res, deps, context, row, body);
  throw createHttpError(400, "Unknown redemption action.", "UNKNOWN_REDEMPTION_ACTION");
}

export function createAdminPointRedemptionsHandler(overrides = {}) {
  const deps = {
    requirePermission,
    readBody,
    supabaseRequest,
    supabaseRpc,
    writeAdminActivityLog,
    ...overrides,
  };

  return withHandlerSafety(async function handleAdminPointRedemptions(req, res) {
    if (req.method === "GET") {
      const id = cleanText(firstQueryValue(req.query?.id), 80);
      if (id) {
        if (!isUuid(id)) throw createHttpError(404, "找不到此兌換申請。", "REDEMPTION_NOT_FOUND");
        return handleDetail(req, res, deps, id);
      }
      return handleList(req, res, deps);
    }
    if (req.method === "PATCH") return handleMutation(req, res, deps);
    return sendJson(res, 405, { error: "Method not allowed." });
  }, { name: "admin-point-redemptions" });
}

export const __testing = {
  getAccountLast4,
  maskBankAccount,
  normalizeRedemption,
  sanitizeAuditRedemption,
};

export default createAdminPointRedemptionsHandler();
