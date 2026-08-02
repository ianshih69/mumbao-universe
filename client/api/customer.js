import {
  firstQueryValue,
  getServerEnv,
  getSupabaseConfig,
  sendJson,
  supabaseRpc,
  supabaseRequest,
} from "../server/shopShared.js";

const PROFILE_SELECT =
  "id,auth_user_id,email,name,phone,member_level,default_postal_code,default_city,default_district,default_address,is_active,created_at,updated_at";
const DIAMOND_PROFILE_SELECT =
  "id,customer_profile_id,exclusive_code,partnership_status";
const POINTS_LEDGER_SELECT =
  "id,customer_profile_id,points,description,source_order_id,source_type,created_at";
const POINTS_REDEMPTION_SELECT =
  "id,customer_profile_id,points,bank_name,account_holder,account_number,status,requested_at,completed_at,rejected_at,rejection_reason,ledger_id";
const CUSTOMER_ORDER_SELECT =
  "id,order_number,created_at,order_source,subtotal,shipping_fee,total,payment_status,order_status,shipping_carrier,tracking_number";
const CUSTOMER_ORDER_DETAIL_SELECT =
  "id,order_number,created_at,order_source,customer_name,customer_phone,customer_email,shipping_address,subtotal,shipping_fee,total,payment_status,order_status,shipping_carrier,tracking_number";
const CUSTOMER_ORDER_PAGE_SIZE = 5;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const ADMIN_LINKS_BY_ROLE = {
  super_admin: [
    { label: "商店後台", href: "/admin/shop" },
    { label: "房況管理", href: "/admin/bookings" },
    { label: "問慢寶客服", href: "/admin/chats" },
    { label: "官網內容管理", href: "/admin/site" },
    { label: "使用者管理", href: "/admin/shop/users" },
    { label: "操作紀錄", href: "/admin/shop/audit-logs" },
  ],
  admin: [
    { label: "商店後台", href: "/admin/shop" },
    { label: "房況管理", href: "/admin/bookings" },
    { label: "問慢寶客服", href: "/admin/chats" },
    { label: "官網內容管理", href: "/admin/site" },
    { label: "倉儲與資產", href: "/admin/shop/warehouse" },
    { label: "操作紀錄", href: "/admin/shop/audit-logs" },
  ],
  manager: [
    { label: "房況管理", href: "/admin/bookings" },
    { label: "問慢寶客服", href: "/admin/chats" },
    { label: "訂單管理", href: "/admin/shop/orders" },
    { label: "倉儲與資產", href: "/admin/shop/warehouse" },
  ],
  housekeeper: [{ label: "倉儲與資產", href: "/admin/shop/warehouse" }],
  cleaner: [],
};

const PROFILE_FIELDS = new Set([
  "name",
  "phone",
  "default_postal_code",
  "default_city",
  "default_district",
  "default_address",
]);

const FIELD_LIMITS = {
  name: 80,
  phone: 40,
  default_postal_code: 20,
  default_city: 80,
  default_district: 80,
  default_address: 300,
};

const CUSTOMER_MEMBER_LEVELS = new Set(["normal", "vip", "diamond"]);

function createRequestId() {
  return `customer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function supabaseRest(pathname, options = {}) {
  const { restUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${restUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Supabase request failed: ${response.status}`);
  }

  return {
    data,
    contentRange: response.headers.get("content-range") || "",
  };
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw createHttpError(401, "請先登入會員。", "CUSTOMER_AUTH_REQUIRED");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw createHttpError(401, "請先登入會員。", "CUSTOMER_AUTH_REQUIRED");
  }

  return token;
}

async function readLimitedJson(req, maxBytes = 4096) {
  let total = 0;
  const chunks = [];

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw createHttpError(400, "會員資料格式不正確。", "CUSTOMER_PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "會員資料格式不正確。", "CUSTOMER_INVALID_JSON");
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeOptionalText(value, field) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "會員資料格式不正確。", "CUSTOMER_INVALID_FIELD");
  }

  const trimmed = value.trim();
  if (trimmed.length > FIELD_LIMITS[field]) {
    throw createHttpError(400, "會員資料長度超過限制。", "CUSTOMER_FIELD_TOO_LONG");
  }

  return trimmed || null;
}

function normalizeProfile(row, user = null) {
  const memberLevel = CUSTOMER_MEMBER_LEVELS.has(String(row.member_level || ""))
    ? String(row.member_level)
    : "normal";

  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    email: row.email || "",
    name: row.name || "",
    phone: row.phone || "",
    member_level: memberLevel,
    email_verified: Boolean(user?.email_confirmed_at || user?.confirmed_at),
    default_postal_code: row.default_postal_code || "",
    default_city: row.default_city || "",
    default_district: row.default_district || "",
    default_address: row.default_address || "",
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeCustomerPointsLedger(row) {
  return {
    id: row.id,
    points: Number(row.points || 0),
    description: row.description || "",
    source_order_id: row.source_order_id || null,
    source_type: row.source_type || null,
    created_at: row.created_at || null,
  };
}

function getPointsBalance(rows) {
  return (rows || []).reduce((sum, row) => sum + Number(row.points || 0), 0);
}

function maskBankAccount(accountNumber) {
  const digits = String(accountNumber || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 4 ? digits : `****${digits.slice(-4)}`;
}

function normalizeCustomerRedemption(row) {
  const status = ["pending", "completed", "rejected"].includes(row.status) ? row.status : "pending";
  return {
    id: row.id,
    points: Number(row.points || 0),
    status,
    bank_name: row.bank_name || "",
    account_holder: row.account_holder || "",
    account_last4: maskBankAccount(row.account_number),
    requested_at: row.requested_at || null,
    completed_at: row.completed_at || null,
    rejected_at: row.rejected_at || null,
    rejection_reason: row.rejection_reason || "",
    ledger_id: row.ledger_id || null,
  };
}

function getPendingRedemptionPoints(rows) {
  return (rows || [])
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + Number(row.points || 0), 0);
}

function getRedemptionEventDate(row) {
  if (row.status === "completed") return row.completed_at || row.requested_at;
  if (row.status === "rejected") return row.rejected_at || row.requested_at;
  return row.requested_at;
}

function buildCustomerPointActivity(pointsLedger, redemptions) {
  const redemptionLedgerIds = new Set(
    (redemptions || []).map((row) => row.ledger_id).filter(Boolean),
  );
  const ledgerActivity = (pointsLedger || [])
    .filter((row) => !redemptionLedgerIds.has(row.id))
    .map((row) => ({
      id: `ledger:${row.id}`,
      record_id: row.id,
      type: Number(row.points || 0) >= 0 ? "earned" : "redemption",
      points: Number(row.points || 0),
      description: row.description || "",
      status: "completed",
      status_label: "已完成",
      created_at: row.created_at || null,
      rejection_reason: "",
    }));

  const redemptionActivity = (redemptions || []).map((row) => {
    const completed = row.status === "completed";
    const rejected = row.status === "rejected";
    return {
      id: `redemption:${row.id}`,
      record_id: row.id,
      type: "redemption",
      points: completed ? -Math.abs(Number(row.points || 0)) : Math.abs(Number(row.points || 0)),
      description: completed ? "合作回饋已匯款" : "積分兌換申請",
      status: row.status,
      status_label: completed ? "已完成" : rejected ? "未通過" : "待處理",
      created_at: getRedemptionEventDate(row),
      rejection_reason: row.rejection_reason || "",
    };
  });

  return [...ledgerActivity, ...redemptionActivity].sort((a, b) => {
    const aTime = Date.parse(a.created_at || "") || 0;
    const bTime = Date.parse(b.created_at || "") || 0;
    return bTime - aTime;
  });
}

async function fetchCustomerDiamondProfile(profileId) {
  if (!profileId) return null;
  const rows = await supabaseRequest(
    `/member_diamond_profiles?customer_profile_id=eq.${encodeURIComponent(
      profileId,
    )}&select=${DIAMOND_PROFILE_SELECT}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row) return null;
  return {
    exclusive_code: String(row.exclusive_code || "").trim(),
    partnership_status: row.partnership_status || "active",
  };
}

async function fetchCustomerPointsLedger(profileId) {
  if (!profileId) return [];
  const rows = await supabaseRequest(
    `/member_points_ledger?customer_profile_id=eq.${encodeURIComponent(
      profileId,
    )}&select=${POINTS_LEDGER_SELECT}&order=created_at.desc&limit=200`,
  );
  return Array.isArray(rows) ? rows.map(normalizeCustomerPointsLedger) : [];
}

async function fetchCustomerRedemptions(profileId) {
  if (!profileId) return [];
  const rows = await supabaseRequest(
    `/member_points_redemption_requests?customer_profile_id=eq.${encodeURIComponent(
      profileId,
    )}&select=${POINTS_REDEMPTION_SELECT}&order=requested_at.desc&limit=200`,
  );
  return Array.isArray(rows) ? rows.map(normalizeCustomerRedemption) : [];
}

async function buildCustomerProfileResponse(row, user) {
  const profile = normalizeProfile(row, user);
  if (profile.member_level !== "diamond") {
    return {
      ...profile,
      diamond_profile: null,
    };
  }

  const [diamondProfile, pointsLedger, redemptions] = await Promise.all([
    fetchCustomerDiamondProfile(profile.id),
    fetchCustomerPointsLedger(profile.id),
    fetchCustomerRedemptions(profile.id),
  ]);
  const pointsBalance = getPointsBalance(pointsLedger);
  const pendingRedemptionPoints = getPendingRedemptionPoints(redemptions);
  const availablePoints = Math.max(0, pointsBalance - pendingRedemptionPoints);

  return {
    ...profile,
    diamond_profile: {
      exclusive_code: diamondProfile?.exclusive_code || "",
      points_balance: pointsBalance,
      pending_redemption_points: pendingRedemptionPoints,
      available_points: availablePoints,
      points_ledger: pointsLedger,
      redemptions,
      points_activity: buildCustomerPointActivity(pointsLedger, redemptions),
    },
  };
}

async function getCustomerAuthUser(accessToken) {
  const { serviceRoleKey } = getSupabaseConfig();
  const supabaseUrl = getServerEnv("SUPABASE_URL").replace(/\/$/, "");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw createHttpError(401, "請先登入會員。", "CUSTOMER_AUTH_INVALID");
  }

  if (!response.ok) {
    throw createHttpError(500, "會員資料暫時無法讀取，請稍後再試。", "CUSTOMER_AUTH_LOOKUP_FAILED");
  }

  const user = await response.json();
  if (!user?.id || !user?.email) {
    throw createHttpError(401, "請先登入會員。", "CUSTOMER_AUTH_INVALID");
  }

  return user;
}

async function findProfileByAuthUserId(authUserId) {
  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(authUserId)}&select=${PROFILE_SELECT}&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findActiveAdminProfileByAuthUserId(authUserId) {
  const rows = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(
      authUserId,
    )}&is_active=eq.true&select=role_code&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isUniqueConflict(error) {
  const message = String(error?.message || "");
  return (
    message.includes("23505") ||
    message.toLowerCase().includes("duplicate") ||
    message.includes("shop_customer_profiles_auth_user_id_key")
  );
}

async function createProfileFromAuthUser(user) {
  const email = normalizeEmail(user.email);
  if (!email) {
    throw createHttpError(400, "會員 Email 格式不正確。", "CUSTOMER_EMAIL_REQUIRED");
  }

  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const payload = {
    auth_user_id: user.id,
    email,
    name: normalizeOptionalText(metadata.name, "name"),
    phone: normalizeOptionalText(metadata.phone, "phone"),
  };

  try {
    const rows = await supabaseRequest(`/shop_customer_profiles?select=${PROFILE_SELECT}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    if (!isUniqueConflict(error)) {
      throw error;
    }
    return null;
  }
}

async function ensureProfile(user) {
  const existing = await findProfileByAuthUserId(user.id);
  if (existing) {
    if (existing.is_active === false) {
      throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。", "CUSTOMER_DISABLED");
    }
    return existing;
  }

  const inserted = await createProfileFromAuthUser(user);
  const profile = inserted || (await findProfileByAuthUserId(user.id));

  if (!profile) {
    throw createHttpError(500, "會員資料暫時無法建立，請稍後再試。", "CUSTOMER_PROFILE_ENSURE_FAILED");
  }

  if (profile.is_active === false) {
    throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。", "CUSTOMER_DISABLED");
  }

  return profile;
}

function normalizePatchPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "會員資料格式不正確。", "CUSTOMER_INVALID_PAYLOAD");
  }

  const keys = Object.keys(body);
  for (const key of keys) {
    if (!PROFILE_FIELDS.has(key)) {
      throw createHttpError(400, "會員資料包含不允許的欄位。", "CUSTOMER_UNKNOWN_FIELD");
    }
  }

  const payload = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = normalizeOptionalText(body[field], field);
    }
  }

  return payload;
}

async function handleProfile(req, res, requestId) {
  const accessToken = getBearerToken(req);
  const user = await getCustomerAuthUser(accessToken);

  if (req.method === "GET") {
    const profile = await ensureProfile(user);
    return sendJson(res, 200, { profile: await buildCustomerProfileResponse(profile, user), requestId });
  }

  if (req.method === "PATCH") {
    await ensureProfile(user);
    const body = await readLimitedJson(req);
    const payload = normalizePatchPayload(body);

    if (!Object.keys(payload).length) {
      const profile = await findProfileByAuthUserId(user.id);
      return sendJson(res, 200, { profile: await buildCustomerProfileResponse(profile, user), requestId });
    }

    const rows = await supabaseRequest(
      `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(user.id)}&select=${PROFILE_SELECT}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    const profile = Array.isArray(rows) && rows.length ? rows[0] : await findProfileByAuthUserId(user.id);

    if (!profile) {
      throw createHttpError(404, "會員資料不存在。", "CUSTOMER_PROFILE_NOT_FOUND");
    }

    if (profile.is_active === false) {
      throw createHttpError(403, "此會員帳號目前已停用，請聯絡客服。", "CUSTOMER_DISABLED");
    }

    return sendJson(res, 200, { profile: await buildCustomerProfileResponse(profile, user), requestId });
  }

  return sendJson(res, 405, { error: "method_not_allowed", requestId });
}

function parseRedemptionPoints(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) return null;
  const points = Number(text);
  return Number.isSafeInteger(points) && points > 0 ? points : null;
}

function normalizeRequiredText(value, maxLength, code) {
  if (typeof value !== "string") {
    throw createHttpError(400, "兌換資料不完整。", code);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw createHttpError(400, "兌換資料不完整。", code);
  }
  return trimmed;
}

function normalizeBankAccountNumber(value) {
  const raw = normalizeRequiredText(value, 40, "REDEMPTION_ACCOUNT_REQUIRED");
  if (!/^[0-9][0-9 -]*[0-9]$/.test(raw) && !/^[0-9]$/.test(raw)) {
    throw createHttpError(400, "銀行帳號格式不正確。", "REDEMPTION_ACCOUNT_INVALID");
  }
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{5,30}$/.test(digits)) {
    throw createHttpError(400, "銀行帳號格式不正確。", "REDEMPTION_ACCOUNT_INVALID");
  }
  return digits;
}

function mapRedemptionRpcError(error) {
  const message = String(error?.message || "");
  if (message.includes("REDEMPTION_DIAMOND_ONLY")) {
    return createHttpError(403, "只有鑽石會員可以申請積分兌換。", "REDEMPTION_DIAMOND_ONLY");
  }
  if (message.includes("REDEMPTION_POINTS_EXCEED_AVAILABLE")) {
    return createHttpError(409, "兌換積分超過目前可兌換積分。", "REDEMPTION_POINTS_EXCEED_AVAILABLE");
  }
  if (message.includes("INVALID_REDEMPTION_POINTS")) {
    return createHttpError(400, "兌換積分必須為正整數。", "INVALID_REDEMPTION_POINTS");
  }
  if (message.includes("REDEMPTION_BANK_FIELDS_REQUIRED")) {
    return createHttpError(400, "銀行、戶名與帳號皆為必填。", "REDEMPTION_BANK_FIELDS_REQUIRED");
  }
  if (message.includes("MEMBER_PROFILE_NOT_FOUND")) {
    return createHttpError(404, "找不到會員資料。", "CUSTOMER_PROFILE_NOT_FOUND");
  }
  return error;
}

async function handlePointRedemption(req, res, requestId) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId });
  }

  const accessToken = getBearerToken(req);
  const user = await getCustomerAuthUser(accessToken);
  const profile = await ensureProfile(user);

  if (profile.member_level !== "diamond") {
    throw createHttpError(403, "只有鑽石會員可以申請積分兌換。", "REDEMPTION_DIAMOND_ONLY");
  }

  const body = await readLimitedJson(req);
  const points = parseRedemptionPoints(body.points);
  if (!points) {
    throw createHttpError(400, "兌換積分必須為正整數。", "INVALID_REDEMPTION_POINTS");
  }
  const bankName = normalizeRequiredText(body.bankName || body.bank_name, 80, "REDEMPTION_BANK_REQUIRED");
  const accountHolder = normalizeRequiredText(
    body.accountHolder || body.account_holder,
    80,
    "REDEMPTION_ACCOUNT_HOLDER_REQUIRED",
  );
  const accountNumber = normalizeBankAccountNumber(body.accountNumber || body.account_number);

  let request;
  try {
    request = await supabaseRpc("create_member_points_redemption_request", {
      p_customer_profile_id: profile.id,
      p_points: points,
      p_bank_name: bankName,
      p_account_holder: accountHolder,
      p_account_number: accountNumber,
    });
  } catch (error) {
    throw mapRedemptionRpcError(error);
  }

  return sendJson(res, 200, {
    ok: true,
    code: "REDEMPTION_REQUEST_CREATED",
    message: "兌換申請已送出，慢慢蒔光將於確認匯款後更新處理狀態。",
    redemption: normalizeCustomerRedemption(request),
    profile: await buildCustomerProfileResponse(await findProfileByAuthUserId(user.id), user),
    requestId,
  });
}

async function handleAdminLinks(req, res, requestId) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId });
  }

  const accessToken = getBearerToken(req);
  const user = await getCustomerAuthUser(accessToken);
  const adminProfile = await findActiveAdminProfileByAuthUserId(user.id);

  if (!adminProfile?.role_code) {
    return sendJson(res, 200, {
      isStaff: false,
      role: null,
      adminLinks: [],
      requestId,
    });
  }

  return sendJson(res, 200, {
    isStaff: true,
    role: adminProfile.role_code,
    adminLinks: ADMIN_LINKS_BY_ROLE[adminProfile.role_code] || [],
    requestId,
  });
}

function getPositiveIntegerQuery(value, fallback, max) {
  const parsed = Number.parseInt(String(firstQueryValue(value) || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseTotalFromContentRange(contentRange, fallback) {
  const totalPart = String(contentRange || "").split("/")[1];
  if (!totalPart || totalPart === "*") return fallback;
  const total = Number.parseInt(totalPart, 10);
  return Number.isFinite(total) ? total : fallback;
}

function groupOrderItems(items) {
  const grouped = new Map();
  for (const item of items || []) {
    const list = grouped.get(item.order_id) || [];
    list.push(item);
    grouped.set(item.order_id, list);
  }
  return grouped;
}

function getOrderItemSummary(items) {
  if (!items?.length) {
    return "尚無商品明細";
  }

  const first = items[0];
  const suffix = items.length > 1 ? ` 等 ${items.length} 項` : "";
  return `${first.product_name || "未命名商品"}${suffix}`;
}

function getOrderItemCount(items) {
  return (items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
}

function normalizeCustomerOrderListItem(order, items) {
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    order_status: order.order_status,
    payment_status: order.payment_status,
    order_source: order.order_source || "online",
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    shipping_carrier: order.shipping_carrier || null,
    tracking_number: order.tracking_number || null,
    item_count: getOrderItemCount(items),
    item_summary: getOrderItemSummary(items),
  };
}

function normalizeCustomerOrderDetail(order, items) {
  return {
    order_number: order.order_number,
    created_at: order.created_at,
    order_status: order.order_status,
    payment_status: order.payment_status,
    order_source: order.order_source || "online",
    shipping_carrier: order.shipping_carrier || null,
    tracking_number: order.tracking_number || null,
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    customer: {
      name: order.customer_name || "",
      phone: order.customer_phone || "",
      email: order.customer_email || "",
      address: order.shipping_address || "",
    },
    items: (items || []).map((item) => ({
      product_name: item.product_name || "",
      product_image_url: item.product_image_url || null,
      variant_name: item.variant_name || "",
      variant_option: item.variant_option || "",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
    })),
  };
}

async function getAuthenticatedProfile(req) {
  const accessToken = getBearerToken(req);
  const user = await getCustomerAuthUser(accessToken);
  return ensureProfile(user);
}

async function handleOrders(req, res, requestId) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId });
  }

  const profile = await getAuthenticatedProfile(req);
  const page = getPositiveIntegerQuery(req.query?.page, 1, 100000);
  const pageSize = getPositiveIntegerQuery(req.query?.pageSize, CUSTOMER_ORDER_PAGE_SIZE, CUSTOMER_ORDER_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: orders, contentRange } = await supabaseRest(
    `/shop_orders?customer_profile_id=eq.${encodeURIComponent(
      profile.id
    )}&select=${CUSTOMER_ORDER_SELECT}&order=created_at.desc`,
    {
      headers: {
        Prefer: "count=exact",
        Range: `${from}-${to}`,
      },
    },
  );

  const orderIds = (orders || []).map((order) => order.id);
  let itemsByOrderId = new Map();
  if (orderIds.length) {
    const orderItems = await supabaseRequest(
      `/shop_order_items?order_id=in.(${orderIds.join(
        ","
      )})&select=order_id,product_name,variant_name,variant_option,quantity&order=created_at.asc`,
    );
    itemsByOrderId = groupOrderItems(orderItems);
  }

  const total = parseTotalFromContentRange(contentRange, orders?.length || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return sendJson(res, 200, {
    items: (orders || []).map((order) =>
      normalizeCustomerOrderListItem(order, itemsByOrderId.get(order.id) || []),
    ),
    page,
    pageSize,
    total,
    totalPages,
    requestId,
  });
}

async function handleOrderDetail(req, res, requestId) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed", requestId });
  }

  const profile = await getAuthenticatedProfile(req);
  const orderNumber = String(firstQueryValue(req.query?.orderNumber) || "").trim();

  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    throw createHttpError(404, "找不到這筆訂單。", "CUSTOMER_ORDER_NOT_FOUND");
  }

  const orders = await supabaseRequest(
    `/shop_orders?customer_profile_id=eq.${encodeURIComponent(
      profile.id
    )}&order_number=eq.${encodeURIComponent(orderNumber)}&select=${CUSTOMER_ORDER_DETAIL_SELECT}&limit=1`,
  );
  const order = Array.isArray(orders) && orders.length ? orders[0] : null;

  if (!order) {
    throw createHttpError(404, "找不到這筆訂單。", "CUSTOMER_ORDER_NOT_FOUND");
  }

  const items = await supabaseRequest(
    `/shop_order_items?order_id=eq.${encodeURIComponent(
      order.id
    )}&select=product_name,product_image_url,variant_name,variant_option,quantity,unit_price,line_total&order=created_at.asc`,
  );

  return sendJson(res, 200, {
    order: normalizeCustomerOrderDetail(order, items),
    requestId,
  });
}

export default async function handler(req, res) {
  const requestId = createRequestId();
  res.setHeader("X-Request-Id", requestId);

  const action = firstQueryValue(req.query?.action);

  try {
    if (action === "profile") {
      return await handleProfile(req, res, requestId);
    }

    if (action === "point-redemption") {
      return await handlePointRedemption(req, res, requestId);
    }

    if (action === "admin-links") {
      return await handleAdminLinks(req, res, requestId);
    }

    if (action === "orders") {
      return await handleOrders(req, res, requestId);
    }

    if (action === "order") {
      return await handleOrderDetail(req, res, requestId);
    }

    return sendJson(res, 404, {
      error: "unknown_action",
      requestId,
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const safeMessage =
      status >= 500 ? "會員資料暫時無法處理，請稍後再試。" : error.message || "會員資料格式不正確。";

    console.error("[customer-api] request failed", {
      requestId,
      action,
      status,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });

    return sendJson(res, status, {
      error: safeMessage,
      code: error?.code || "CUSTOMER_API_ERROR",
      requestId,
    });
  }
}
