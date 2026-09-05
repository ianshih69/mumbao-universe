import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminAuthExpiredMessage,
  adminPermissionDeniedMessage,
  adminShopIdentityKey,
  adminShopTokenKey,
  buildAdminLoginPath,
  createAdminApiError,
  getAdminLoginNotice,
  getAdminLoginRedirectTarget,
  isAdminAuthError,
  isAdminPermissionError,
  setAdminSession,
  subscribeAdminAuthExpired,
} from "./adminAuth";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const identity = {
  authMode: "account" as const,
  display_name: "Admin",
  email: "admin@example.com",
  role_code: "admin",
  role_name: "Admin",
  permissions: ["orders.view"],
  is_active: true,
};

describe("admin auth failure handling", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("sessionStorage", storage);
    setAdminSession({ accessToken: "valid-token", user: identity });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the current Admin state and emits one login redirect for API 401", () => {
    let redirect = "";
    const unsubscribe = subscribeAdminAuthExpired(() => {
      redirect = buildAdminLoginPath("/admin/bookings", true);
    });

    const firstError = createAdminApiError(401, { code: "unauthorized" });
    createAdminApiError(401, { code: "session_expired" });

    expect(isAdminAuthError(firstError)).toBe(true);
    expect(storage.getItem(adminShopTokenKey)).toBeNull();
    expect(storage.getItem(adminShopIdentityKey)).toBeNull();
    expect(redirect).toBe(
      "/admin/shop/login?redirect=%2Fadmin%2Fbookings&reason=session-expired",
    );
    expect(getAdminLoginNotice("")).toBe(adminAuthExpiredMessage);
    expect(getAdminLoginNotice("")).toBe("");
    unsubscribe();
  });

  it("keeps 403 separate from expired auth and preserves the valid session", () => {
    let redirected = false;
    const unsubscribe = subscribeAdminAuthExpired(() => {
      redirected = true;
    });

    const error = createAdminApiError(403, { error: "forbidden" });

    expect(isAdminAuthError(error)).toBe(false);
    expect(isAdminPermissionError(error)).toBe(true);
    expect(error.message).toBe(adminPermissionDeniedMessage);
    expect(storage.getItem(adminShopTokenKey)).toBe("valid-token");
    expect(redirected).toBe(false);
    unsubscribe();
  });

  it("keeps 5xx as a real data error without redirecting to login", () => {
    let redirected = false;
    const unsubscribe = subscribeAdminAuthExpired(() => {
      redirected = true;
    });

    const error = createAdminApiError(500, { message: "Booking data failed." });

    expect(error.message).toBe("Booking data failed.");
    expect(isAdminAuthError(error)).toBe(false);
    expect(storage.getItem(adminShopTokenKey)).toBe("valid-token");
    expect(redirected).toBe(false);
    unsubscribe();
  });

  it("keeps the login route outside its own redirect target", () => {
    expect(getAdminLoginRedirectTarget("?redirect=/admin/bookings/orders")).toBe(
      "/admin/bookings/orders",
    );
    expect(getAdminLoginRedirectTarget("?redirect=/admin/shop/login")).toBe(
      "/admin/shop",
    );
    expect(getAdminLoginRedirectTarget("?redirect=https://example.com/admin")).toBe(
      "/admin/shop",
    );
    expect(getAdminLoginRedirectTarget("?redirect=/administrator")).toBe(
      "/admin/shop",
    );
  });
});
