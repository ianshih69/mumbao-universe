import { createClient, type AuthError, type SupabaseClient } from "@supabase/supabase-js";

export const customerAuthStorageKey = "mumbao_customer_auth";
export const customerAccountOrigin = "https://www.mumbao.tw";

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

export function getSafeAccountReturnTo(value: string | null | undefined, fallback = "/account") {
  const trimmedValue = String(value || "").trim();

  if (
    !trimmedValue ||
    !trimmedValue.startsWith("/") ||
    trimmedValue.startsWith("//") ||
    trimmedValue.startsWith("/admin")
  ) {
    return fallback;
  }

  return trimmedValue;
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
  if (error instanceof CustomerAuthApiError && error.code === "CUSTOMER_EMAIL_MAY_ALREADY_REGISTERED") {
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

export async function registerCustomerAccount(input: CustomerSignUpApiInput): Promise<void> {
  await postCustomerAuthApi("sign-up", input);
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
