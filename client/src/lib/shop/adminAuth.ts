export const adminShopTokenKey = "adminShopToken";
const legacyAdminShopTokenKey = "mumbao-admin-shop-order-token";

export const adminAuthExpiredMessage = "登入已過期，請重新登入";

export function getAdminToken() {
  try {
    const token =
      sessionStorage.getItem(adminShopTokenKey) ||
      sessionStorage.getItem(legacyAdminShopTokenKey) ||
      "";

    if (token && !sessionStorage.getItem(adminShopTokenKey)) {
      sessionStorage.setItem(adminShopTokenKey, token);
    }

    return token;
  } catch {
    return "";
  }
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(adminShopTokenKey, token);
  sessionStorage.removeItem(legacyAdminShopTokenKey);
}

export function clearAdminToken() {
  sessionStorage.removeItem(adminShopTokenKey);
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
