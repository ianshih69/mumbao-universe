export type AdminAuthStatus = "checking" | "loggedIn" | "loggedOut";

export const adminShopTokenKey = "adminShopToken";
export const adminShopRefreshTokenKey = "adminShopRefreshToken";
export const adminShopIdentityKey = "adminShopIdentity";
export const adminShopTokenExpiresAtKey = "adminShopTokenExpiresAt";
export const adminAuthNoticeKey = "adminAuthNotice";

export const adminAuthExpiredMessage = "登入狀態已失效，請重新登入。";
export const adminPermissionDeniedMessage = "您沒有此操作權限";

type AdminApiErrorPayload = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
};

type AdminAuthExpiredListener = () => void;

const adminAuthExpiredListeners = new Set<AdminAuthExpiredListener>();
let hasNotifiedAdminAuthExpired = false;

function payloadText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export class AdminApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

export function getAdminToken() {
  try {
    return sessionStorage.getItem(adminShopTokenKey) || "";
  } catch {
    return "";
  }
}

export function getInitialAdminAuthStatus(): AdminAuthStatus {
  return getAdminToken() ? "loggedIn" : "loggedOut";
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(adminShopTokenKey, token);
}

export type AdminIdentity = {
  authMode: "account";
  display_name: string;
  email?: string;
  role_code: string;
  role_name: string;
  permissions: string[];
  is_active?: boolean;
};

export function getAdminRefreshToken() {
  try {
    return sessionStorage.getItem(adminShopRefreshTokenKey) || "";
  } catch {
    return "";
  }
}

export function getAdminTokenExpiresAt() {
  try {
    return sessionStorage.getItem(adminShopTokenExpiresAtKey) || "";
  } catch {
    return "";
  }
}

export function setAdminSession({
  accessToken,
  refreshToken,
  user,
  authMode = "account",
  expiresAt,
}: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string | null;
  user?: Partial<AdminIdentity> | null;
  authMode?: "account";
}) {
  hasNotifiedAdminAuthExpired = false;
  setAdminToken(accessToken);
  sessionStorage.removeItem(adminAuthNoticeKey);
  if (refreshToken) sessionStorage.setItem(adminShopRefreshTokenKey, refreshToken);
  if (expiresAt) {
    sessionStorage.setItem(adminShopTokenExpiresAtKey, expiresAt);
  }
  if (user) {
    sessionStorage.setItem(
      adminShopIdentityKey,
      JSON.stringify({
        authMode,
        display_name: user.display_name || user.email || "後台使用者",
        email: user.email || "",
        role_code: user.role_code || "",
        role_name: user.role_name || "",
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        is_active: user.is_active !== false,
      })
    );
  }
}

export function getAdminIdentity(): AdminIdentity | null {
  try {
    const raw = sessionStorage.getItem(adminShopIdentityKey);
    return raw ? (JSON.parse(raw) as AdminIdentity) : null;
  } catch {
    return null;
  }
}

export function hasAdminPermission(permission: string) {
  const identity = getAdminIdentity();
  if (!identity) return false;
  return (
    identity.permissions.includes("*") ||
    identity.role_code === "super_admin" ||
    identity.permissions.includes(permission)
  );
}

export function clearAdminToken() {
  try {
    sessionStorage.removeItem(adminShopTokenKey);
    sessionStorage.removeItem(adminShopRefreshTokenKey);
    sessionStorage.removeItem(adminShopTokenExpiresAtKey);
    sessionStorage.removeItem(adminShopIdentityKey);
  } catch {
    // Storage can be unavailable in private or restricted browser modes.
  }
}

export function expireAdminSession() {
  clearAdminToken();
  try {
    sessionStorage.setItem(adminAuthNoticeKey, "session-expired");
  } catch {
    // The route query still carries the notice when storage is unavailable.
  }
  if (hasNotifiedAdminAuthExpired) return;
  hasNotifiedAdminAuthExpired = true;
  adminAuthExpiredListeners.forEach((listener) => listener());
}

export function subscribeAdminAuthExpired(listener: AdminAuthExpiredListener) {
  adminAuthExpiredListeners.add(listener);
  return () => {
    adminAuthExpiredListeners.delete(listener);
  };
}

export function createAdminApiError(
  status: number,
  payload: AdminApiErrorPayload | null | undefined,
  fallbackMessage = `Admin request failed: ${status}`,
) {
  const code = payloadText(payload?.code) || payloadText(payload?.error) || undefined;
  const message =
    status === 401
      ? adminAuthExpiredMessage
      : status === 403
        ? adminPermissionDeniedMessage
        : payloadText(payload?.message) || payloadText(payload?.error) || fallbackMessage;
  const error = new AdminApiError(message, status, code);
  if (status === 401) expireAdminSession();
  return error;
}

export function getAdminErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) ? status : null;
}

export function isAdminLoggedIn() {
  return Boolean(getAdminToken());
}

export function isAdminAuthError(error: unknown) {
  const status = getAdminErrorStatus(error);
  if (status !== null) return status === 401;
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("Unauthorized") ||
    message.includes("401") ||
    message.includes("登入已過期") ||
    message.includes("登入狀態已失效") ||
    message.includes("請重新登入")
  );
}

export function isAdminPermissionError(error: unknown) {
  return getAdminErrorStatus(error) === 403;
}

export function sanitizeAdminRedirect(
  value: string | null | undefined,
  fallback = "/admin",
) {
  const redirect = String(value || "").trim();
  const pathname = redirect.split(/[?#]/, 1)[0];
  if (
    (pathname !== "/admin" && !pathname.startsWith("/admin/")) ||
    redirect.startsWith("//")
  ) {
    return fallback;
  }
  if (pathname === "/admin/shop/login") return fallback;
  return redirect;
}

export function buildAdminLoginPath(currentPath: string, sessionExpired = false) {
  const params = new URLSearchParams({ redirect: sanitizeAdminRedirect(currentPath) });
  if (sessionExpired) params.set("reason", "session-expired");
  return `/admin/shop/login?${params.toString()}`;
}

export function getAdminLoginRedirectTarget(search: string) {
  return sanitizeAdminRedirect(
    new URLSearchParams(search).get("redirect"),
    "/admin/shop",
  );
}

export function getAdminLoginNotice(search: string) {
  let storedNotice = "";
  try {
    storedNotice = sessionStorage.getItem(adminAuthNoticeKey) || "";
    sessionStorage.removeItem(adminAuthNoticeKey);
  } catch {
    // Fall back to the route query when storage is unavailable.
  }
  return new URLSearchParams(search).get("reason") === "session-expired" ||
    storedNotice === "session-expired"
    ? adminAuthExpiredMessage
    : "";
}
