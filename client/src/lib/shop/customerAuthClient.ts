import { createClient, type AuthError, type SupabaseClient } from "@supabase/supabase-js";

export const customerAuthStorageKey = "mumbao_customer_auth";
export const customerAccountOrigin = "https://www.mumbao.tw";
export const customerEmailVerificationNoticeStorageKey =
  "mumbao_customer_email_verification_notice";
export const customerEmailVerificationSuccessMessage =
  "Email 驗證成功，歡迎加入慢慢蒔光。";

let customerSupabaseClient: SupabaseClient | null = null;

type CustomerAuthApiResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  details?: {
    passwordErrors?: string[];
    cooldownSeconds?: number;
  };
  message?: string;
  cooldownSeconds?: number;
  requiresEmailVerification?: boolean;
};

export type CustomerVerificationResendResult = {
  message?: string;
  cooldownSeconds?: number;
};

export type CustomerSignUpApiInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
};

export const customerAuthApiCodes = {
  signupCreated: "SIGNUP_CREATED",
  emailAlreadyRegistered: "EMAIL_ALREADY_REGISTERED",
  emailNotVerified: "EMAIL_NOT_VERIFIED",
} as const;

export const customerAuthApiMessages = {
  emailAlreadyRegistered:
    "此 Email 已建立會員帳號，請直接前往登入；若忘記密碼，可使用忘記密碼功能。",
  emailNotVerified:
    "此 Email 已註冊，但尚未完成 Email 驗證。請重新寄送驗證信後完成驗證。",
} as const;

export class CustomerAuthApiError extends Error {
  status: number;
  code: string;
  details: CustomerAuthApiResponse["details"];

  constructor(message: string, status: number, code: string, details?: CustomerAuthApiResponse["details"]) {
    super(message);
    this.name = "CustomerAuthApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function createCustomerAuthConfigError() {
  const error = new Error("尚未設定商城會員 Auth，請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。");
  error.name = "CustomerAuthConfigError";
  return error;
}

export function getCustomerSupabasePublicConfig() {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !anonKey) {
    throw createCustomerAuthConfigError();
  }

  return {
    supabaseUrl: String(supabaseUrl).replace(/\/$/, ""),
    anonKey: String(anonKey),
  };
}

export function getCustomerSupabaseClient() {
  if (customerSupabaseClient) return customerSupabaseClient;

  const { supabaseUrl, anonKey } = getCustomerSupabasePublicConfig();
  customerSupabaseClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: customerAuthStorageKey,
    },
  });

  return customerSupabaseClient;
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getAccountRedirectUrl(pathname: string) {
  return `${customerAccountOrigin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

const forbiddenCustomerReturnPathnames = new Set([
  "/account/login",
  "/account/register",
  "/account/reset-password",
]);

export function getSafeAccountReturnTo(value: string | null | undefined, fallback = "/") {
  const trimmedValue = String(value || "").trim();

  if (
    !trimmedValue ||
    !trimmedValue.startsWith("/") ||
    trimmedValue.startsWith("//") ||
    trimmedValue.includes("\\") ||
    trimmedValue.startsWith("/admin")
  ) {
    return fallback;
  }

  try {
    const url = new URL(trimmedValue, customerAccountOrigin);
    if (url.origin !== customerAccountOrigin) return fallback;
    if (forbiddenCustomerReturnPathnames.has(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function getSafeCustomerReturnToFromReferrer(referrer: string | null | undefined, fallback = "") {
  const referrerValue = String(referrer || "").trim();
  if (!referrerValue) return fallback;

  try {
    const url = new URL(referrerValue);
    const currentOrigin = typeof window === "undefined" ? customerAccountOrigin : window.location.origin;
    if (url.origin !== currentOrigin) return fallback;
    return getSafeAccountReturnTo(`${url.pathname}${url.search}${url.hash}`, fallback);
  } catch {
    return fallback;
  }
}

export function resolveCustomerLoginReturnTo({
  returnTo,
  referrer,
  fallback = "/",
}: {
  returnTo?: string | null;
  referrer?: string | null;
  fallback?: string;
}) {
  const hasExplicitReturnTo = String(returnTo || "").trim().length > 0;
  if (hasExplicitReturnTo) {
    return getSafeAccountReturnTo(returnTo, fallback);
  }

  return getSafeCustomerReturnToFromReferrer(referrer, fallback) || fallback;
}

export function getCurrentCustomerReturnTo(fallback = "/") {
  if (typeof window === "undefined") return fallback;
  return getSafeAccountReturnTo(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    fallback,
  );
}

export function getCustomerLoginHref(returnTo = getCurrentCustomerReturnTo()) {
  return `/account/login?returnTo=${encodeURIComponent(getSafeAccountReturnTo(returnTo, "/"))}`;
}

function getBrowserSessionStorage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function markCustomerEmailVerificationSuccessNotice(storage?: Storage | null) {
  try {
    const targetStorage = storage ?? getBrowserSessionStorage();
    targetStorage?.setItem(customerEmailVerificationNoticeStorageKey, customerEmailVerificationSuccessMessage);
  } catch {
    // Storage can be unavailable in private modes; silently skip the one-time notice.
  }
}

export function consumeCustomerEmailVerificationSuccessNotice(storage?: Storage | null) {
  try {
    const targetStorage = storage ?? getBrowserSessionStorage();
    const message = targetStorage?.getItem(customerEmailVerificationNoticeStorageKey) || "";
    if (message) targetStorage?.removeItem(customerEmailVerificationNoticeStorageKey);
    return message === customerEmailVerificationSuccessMessage ? message : "";
  } catch {
    return "";
  }
}

export function isCustomerAuthConfigError(error: unknown) {
  return error instanceof Error && error.name === "CustomerAuthConfigError";
}

export function isEmailNotConfirmedError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("email not confirmed") || message.includes("email_not_confirmed");
}

export function createCustomerEmailMayExistError() {
  const error = new Error("CUSTOMER_EMAIL_MAY_ALREADY_REGISTERED");
  error.name = "CustomerEmailMayExistError";
  return error;
}

export function isCustomerEmailMayExistError(error: unknown) {
  if (
    error instanceof CustomerAuthApiError &&
    (error.code === "CUSTOMER_EMAIL_MAY_ALREADY_REGISTERED" ||
      error.code === customerAuthApiCodes.emailAlreadyRegistered)
  ) {
    return true;
  }
  if (error instanceof Error && error.name === "CustomerEmailMayExistError") return true;

  const authError = error as AuthError | undefined;
  const code = String(authError?.code || authError?.status || "").toLowerCase();
  const message = authError?.message || (error instanceof Error ? error.message : "");
  const normalizedMessage = message.toLowerCase();

  return (
    code.includes("user_already_exists") ||
    code.includes("email_exists") ||
    normalizedMessage.includes("customer_email_may_already_registered") ||
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  );
}

export function isCustomerEmailNotVerifiedError(error: unknown) {
  return error instanceof CustomerAuthApiError && error.code === customerAuthApiCodes.emailNotVerified;
}

async function postCustomerAuthApi(action: string, payload: unknown) {
  const response = await fetch(`/api/customer-auth?action=${encodeURIComponent(action)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as CustomerAuthApiResponse;

  if (!response.ok || data.ok === false) {
    throw new CustomerAuthApiError(
      data.error || "會員 Auth 暫時無法使用，請稍後再試。",
      response.status,
      data.code || "CUSTOMER_AUTH_API_ERROR",
      data.details,
    );
  }

  return data;
}

export async function registerCustomerAccount(input: CustomerSignUpApiInput): Promise<CustomerAuthApiResponse> {
  return postCustomerAuthApi("sign-up", input);
}

export async function resendCustomerVerificationEmail(
  email: string,
): Promise<CustomerVerificationResendResult> {
  return postCustomerAuthApi("resend-verification", { email });
}

export function getCustomerAuthErrorMessage(error: unknown, fallback: string) {
  const authError = error as AuthError | undefined;
  const message = authError?.message || (error instanceof Error ? error.message : "");
  const normalizedMessage = message.toLowerCase();

  if (isCustomerAuthConfigError(error)) return message;
  if (error instanceof CustomerAuthApiError && error.details?.passwordErrors?.length) {
    return error.details.passwordErrors[0];
  }
  if (error instanceof CustomerAuthApiError && error.code === customerAuthApiCodes.emailAlreadyRegistered) {
    return customerAuthApiMessages.emailAlreadyRegistered;
  }
  if (error instanceof CustomerAuthApiError && error.code === customerAuthApiCodes.emailNotVerified) {
    return customerAuthApiMessages.emailNotVerified;
  }
  if (error instanceof CustomerAuthApiError && error.message) {
    return error.message;
  }
  if (message.startsWith("密碼至少需要") || message.includes("密碼需要包含至少")) {
    return message;
  }
  if (isEmailNotConfirmedError(error)) return "Email 尚未驗證，請先至信箱完成驗證後再登入。";
  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return "登入失敗，請確認 Email 與密碼。";
  }
  if (isCustomerEmailMayExistError(error)) {
    return "此 Email 可能已註冊，請直接登入或使用忘記密碼。";
  }
  if (normalizedMessage.includes("password")) {
    return "密碼格式不符合要求，請確認至少 8 碼，並包含英文大寫、英文小寫及數字。";
  }
  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return "操作太頻繁，請稍後再試。";
  }

  return fallback;
}
