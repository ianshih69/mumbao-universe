import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  getCustomerPasswordErrors,
} from "../server/customerPasswordPolicy.js";
import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
} from "../server/shopShared.js";

export const customerAuthSiteOrigin = "https://www.mumbao.tw";
export const customerVerificationRedirectPath = "/account/login?verified=1";
export const verificationResendCooldownMs = 60_000;
export const customerAuthRateLimitWindowMs = 60_000;
export const customerAuthRateLimits = {
  signUpEmail: 3,
  signUpIp: 5,
  resendIp: 10,
};

const resendCooldownByEmailHash = new Map();
const requestRateLimitByKey = new Map();

function createRequestId() {
  return `customer_auth_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createHttpError(status, message, code, details = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text.slice(0, maxLength);
}

function getVerificationRedirectUrl() {
  return `${customerAuthSiteOrigin}${customerVerificationRedirectPath}`;
}

function getSupabaseAuthClient() {
  const supabaseUrl = getServerEnv("SUPABASE_URL") || getServerEnv("VITE_SUPABASE_URL");
  const authKey =
    getServerEnv("SUPABASE_ANON_KEY") ||
    getServerEnv("VITE_SUPABASE_ANON_KEY") ||
    getServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !authKey) {
    throw createHttpError(
      500,
      "會員 Auth 公開設定暫時無法使用，請稍後再試。",
      "CUSTOMER_AUTH_PUBLIC_CONFIG_MISSING",
    );
  }

  return createClient(String(supabaseUrl).replace(/\/$/, ""), authKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function normalizeAuthError(error) {
  const status = Number(error?.status) || 502;
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "");
  const normalizedMessage = message.toLowerCase();

  if (
    code.includes("user_already_exists") ||
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  ) {
    return createHttpError(
      409,
      "此 Email 可能已註冊，請直接登入或使用忘記密碼。",
      "CUSTOMER_EMAIL_MAY_ALREADY_REGISTERED",
    );
  }

  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return createHttpError(429, "操作太頻繁，請稍後再試。", "CUSTOMER_AUTH_RATE_LIMITED");
  }

  if (normalizedMessage.includes("invalid email")) {
    return createHttpError(400, "會員 Email 格式不正確。", "CUSTOMER_EMAIL_INVALID");
  }

  if (normalizedMessage.includes("password")) {
    return createHttpError(400, "密碼格式不符合要求。", "CUSTOMER_PASSWORD_INVALID");
  }

  return createHttpError(
    status >= 500 ? 502 : status,
    "驗證信暫時無法寄出，請稍後再試。",
    "CUSTOMER_VERIFICATION_EMAIL_FAILED",
  );
}

function isSafeResendNoopError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code.includes("user_not_found") ||
    code.includes("email_not_found") ||
    message.includes("user not found") ||
    message.includes("email not found") ||
    message.includes("not registered") ||
    message.includes("already confirmed") ||
    message.includes("already verified")
  );
}

function getEmailCooldownKey(email) {
  return createHash("sha256").update(email).digest("hex");
}

function hashRateLimitValue(value) {
  return createHash("sha256").update(String(value || "unknown")).digest("hex");
}

function getHeaderValue(req, name) {
  const headers = req?.headers || {};
  const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(req) {
  const forwardedFor = String(getHeaderValue(req, "x-forwarded-for") || "").trim();
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown").trim();
}

function assertRequestRateLimit(key, maxRequests, now) {
  const current = requestRateLimitByKey.get(key);

  if (!current || now >= current.resetAt) {
    requestRateLimitByKey.set(key, {
      count: 1,
      resetAt: now + customerAuthRateLimitWindowMs,
    });
    return;
  }

  if (current.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw createHttpError(
      429,
      "操作太頻繁，請稍後再試。",
      "CUSTOMER_AUTH_RATE_LIMITED",
      { retryAfterSeconds },
    );
  }

  current.count += 1;
}

function enforceAuthRateLimit({ action, email, req, now }) {
  const clientIpHash = hashRateLimitValue(getClientIp(req));

  if (action === "sign-up") {
    assertRequestRateLimit(
      `sign-up:ip:${clientIpHash}`,
      customerAuthRateLimits.signUpIp,
      now,
    );
    assertRequestRateLimit(
      `sign-up:email:${getEmailCooldownKey(email)}`,
      customerAuthRateLimits.signUpEmail,
      now,
    );
    return;
  }

  if (action === "resend-verification") {
    assertRequestRateLimit(
      `resend-verification:ip:${clientIpHash}`,
      customerAuthRateLimits.resendIp,
      now,
    );
  }
}

function getRemainingCooldownSeconds(email, now) {
  const key = getEmailCooldownKey(email);
  if (!resendCooldownByEmailHash.has(key)) return 0;

  const lastSentAt = resendCooldownByEmailHash.get(key) || 0;
  const remainingMs = verificationResendCooldownMs - (now - lastSentAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function markResendCooldown(email, now) {
  resendCooldownByEmailHash.set(getEmailCooldownKey(email), now);
}

function validateSignUpPayload(body) {
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  const name = normalizeOptionalText(body?.name, 80);
  const phone = normalizeOptionalText(body?.phone, 40);
  const passwordErrors = getCustomerPasswordErrors(password);

  if (!name) {
    throw createHttpError(400, "請輸入姓名。", "CUSTOMER_NAME_REQUIRED");
  }
  if (!phone) {
    throw createHttpError(400, "請輸入手機。", "CUSTOMER_PHONE_REQUIRED");
  }
  if (!email || !isLikelyEmail(email)) {
    throw createHttpError(400, "會員 Email 格式不正確。", "CUSTOMER_EMAIL_INVALID");
  }
  if (passwordErrors.length) {
    throw createHttpError(
      400,
      passwordErrors[0],
      "CUSTOMER_PASSWORD_INVALID",
      { passwordErrors },
    );
  }

  return { email, password, name, phone };
}

function validateResendPayload(body) {
  const email = normalizeEmail(body?.email);
  if (!email || !isLikelyEmail(email)) {
    throw createHttpError(400, "請輸入有效的 Email。", "CUSTOMER_EMAIL_INVALID");
  }
  return { email };
}

async function handleSignUp(body, dependencies, req) {
  const payload = validateSignUpPayload(body);
  enforceAuthRateLimit({
    action: "sign-up",
    email: payload.email,
    req,
    now: dependencies.now(),
  });

  const supabase = dependencies.getSupabaseAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        name: payload.name,
        phone: payload.phone,
      },
      emailRedirectTo: getVerificationRedirectUrl(),
    },
  });

  if (error) throw normalizeAuthError(error);
  if (!data?.user && !data?.session) {
    throw createHttpError(
      409,
      "此 Email 可能已註冊，請直接登入或使用忘記密碼。",
      "CUSTOMER_EMAIL_MAY_ALREADY_REGISTERED",
    );
  }
  if (data?.session) {
    throw createHttpError(
      500,
      "會員 Email 驗證尚未啟用，請聯絡客服。",
      "CUSTOMER_EMAIL_CONFIRMATION_DISABLED",
    );
  }

  return {
    ok: true,
    emailVerificationSent: true,
    verificationRedirectOrigin: customerAuthSiteOrigin,
  };
}

async function handleResendVerification(body, dependencies, req) {
  const { email } = validateResendPayload(body);
  const now = dependencies.now();
  enforceAuthRateLimit({
    action: "resend-verification",
    email,
    req,
    now,
  });

  const remainingCooldownSeconds = getRemainingCooldownSeconds(email, now);

  if (remainingCooldownSeconds > 0) {
    throw createHttpError(
      429,
      `請稍候 ${remainingCooldownSeconds} 秒後再重新寄送。`,
      "CUSTOMER_VERIFICATION_RESEND_COOLDOWN",
      { cooldownSeconds: remainingCooldownSeconds },
    );
  }

  const supabase = dependencies.getSupabaseAuthClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getVerificationRedirectUrl(),
    },
  });

  if (error && !isSafeResendNoopError(error)) {
    throw normalizeAuthError(error);
  }

  markResendCooldown(email, now);

  return {
    ok: true,
    message: "若此 Email 尚未驗證，我們已寄出驗證信，請至信箱查看。",
    cooldownSeconds: Math.ceil(verificationResendCooldownMs / 1000),
    verificationRedirectOrigin: customerAuthSiteOrigin,
  };
}

export function createCustomerAuthHandler(dependencies = {}) {
  const resolvedDependencies = {
    getSupabaseAuthClient,
    now: () => Date.now(),
    ...dependencies,
  };

  return async function customerAuthHandler(req, res) {
    const requestId = createRequestId();
    res.setHeader("X-Request-Id", requestId);

    try {
      if (req.method !== "POST") {
        return sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
          requestId,
        });
      }

      const action = String(firstQueryValue(req.query?.action) || "").trim();
      const body = await readBody(req);

      if (action === "sign-up") {
        const result = await handleSignUp(body, resolvedDependencies, req);
        return sendJson(res, 200, { ...result, requestId });
      }

      if (action === "resend-verification") {
        const result = await handleResendVerification(body, resolvedDependencies, req);
        return sendJson(res, 200, { ...result, requestId });
      }

      return sendJson(res, 404, {
        ok: false,
        error: "unknown_action",
        requestId,
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const safeMessage =
        status >= 500
          ? error?.message || "會員 Auth 暫時無法使用，請稍後再試。"
          : error?.message || "會員資料格式不正確。";

      console.error("[customer-auth-api] request failed", {
        requestId,
        action: firstQueryValue(req.query?.action),
        status,
        code: error?.code,
        message: error?.message,
      });

      return sendJson(res, status, {
        ok: false,
        error: safeMessage,
        code: error?.code || "CUSTOMER_AUTH_API_ERROR",
        details: error?.details,
        requestId,
      });
    }
  };
}

export default createCustomerAuthHandler();
