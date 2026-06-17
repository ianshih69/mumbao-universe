export type AdminAuthStatus = "checking" | "loggedIn" | "loggedOut";

export const adminShopTokenKey = "adminShopToken";
export const adminShopRefreshTokenKey = "adminShopRefreshToken";
export const adminShopIdentityKey = "adminShopIdentity";
export const adminShopTokenExpiresAtKey = "adminShopTokenExpiresAt";
const legacyAdminShopTokenKey = "mumbao-admin-shop-order-token";

export const adminAuthExpiredMessage = "登入已過期，請重新登入";

export function getAdminToken() {
  try {
    if (sessionStorage.getItem(legacyAdminShopTokenKey)) {
      sessionStorage.removeItem(legacyAdminShopTokenKey);
    }
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
  sessionStorage.removeItem(legacyAdminShopTokenKey);
}

export type AdminIdentity = {
  authMode: "account" | "legacy";
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
  authMode?: "account" | "legacy";
}) {
  setAdminToken(accessToken);
  if (refreshToken) sessionStorage.setItem(adminShopRefreshTokenKey, refreshToken);
  if (expiresAt) {
    sessionStorage.setItem(adminShopTokenExpiresAtKey, expiresAt);
  } else if (authMode === "legacy") {
    sessionStorage.removeItem(adminShopRefreshTokenKey);
    sessionStorage.removeItem(adminShopTokenExpiresAtKey);
  }
  if (user) {
    sessionStorage.setItem(
      adminShopIdentityKey,
      JSON.stringify({
        authMode,
        display_name: user.display_name || user.email || "後台使用者",
        email: user.email || "",
        role_code: user.role_code || (authMode === "legacy" ? "legacy_admin" : ""),
        role_name: user.role_name || (authMode === "legacy" ? "舊版共用密碼" : ""),
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
  sessionStorage.removeItem(adminShopTokenKey);
  sessionStorage.removeItem(adminShopRefreshTokenKey);
  sessionStorage.removeItem(adminShopTokenExpiresAtKey);
  sessionStorage.removeItem(adminShopIdentityKey);
  sessionStorage.removeItem(legacyAdminShopTokenKey);
}

export function isAdminLoggedIn() {
  return Boolean(getAdminToken());
}

export function isAdminAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  return (
    message.includes("Unauthorized") ||
    message.includes("401") ||
    message.includes("登入已過期") ||
    message.includes("後台密碼錯誤")
  );
}
