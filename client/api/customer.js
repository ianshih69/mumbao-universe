import {
  firstQueryValue,
  getServerEnv,
  getSupabaseConfig,
  sendJson,
  supabaseRequest,
} from "../server/shopShared.js";

const PROFILE_SELECT =
  "id,auth_user_id,email,name,phone,default_postal_code,default_city,default_district,default_address,is_active,created_at,updated_at";

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

function createRequestId() {
  return `customer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
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

function normalizeProfile(row) {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    email: row.email || "",
    name: row.name || "",
    phone: row.phone || "",
    default_postal_code: row.default_postal_code || "",
    default_city: row.default_city || "",
    default_district: row.default_district || "",
    default_address: row.default_address || "",
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
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
    return sendJson(res, 200, { profile: normalizeProfile(profile), requestId });
  }

  if (req.method === "PATCH") {
    await ensureProfile(user);
    const body = await readLimitedJson(req);
    const payload = normalizePatchPayload(body);

    if (!Object.keys(payload).length) {
      const profile = await findProfileByAuthUserId(user.id);
      return sendJson(res, 200, { profile: normalizeProfile(profile), requestId });
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

    return sendJson(res, 200, { profile: normalizeProfile(profile), requestId });
  }

  return sendJson(res, 405, { error: "method_not_allowed", requestId });
}

export default async function handler(req, res) {
  const requestId = createRequestId();
  res.setHeader("X-Request-Id", requestId);

  const action = firstQueryValue(req.query?.action);

  try {
    if (action === "profile") {
      return await handleProfile(req, res, requestId);
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
