import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const sdk = vi.hoisted(() => ({
  session: null as Session | null,
  error: null as { status: number } | null,
  listener: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(), setSession: vi.fn(), signOut: vi.fn(),
}));
vi.mock("./customerAuthClient", () => ({
  isCustomerAuthConfigError: () => false,
  getCustomerSupabaseClient: () => ({ auth: {
    getSession: sdk.getSession, setSession: sdk.setSession, signOut: sdk.signOut,
    onAuthStateChange: (listener: typeof sdk.listener) => {
      sdk.listener = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  } }),
}));

const admin = {
  authMode: "account", display_name: "Test Admin", role_code: "phase15_test_admin",
  role_name: "Test Admin", permissions: ["booking.manage"], is_active: true,
};
function memberSession(token = "customer-token", userId = "test-admin") {
  return { access_token: token, refresh_token: "sdk-owned-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, email: "not-an-authority@example.test" } } as Session;
}
function emit(event: string, session: Session | null) {
  sdk.session = session;
  sdk.listener?.(event, session);
}
function response(status = 200, user = admin) {
  return new Response(JSON.stringify({ authMode: "account", user, permissions: user.permissions }), { status });
}

beforeEach(() => {
  vi.resetModules();
  sdk.session = memberSession(); sdk.error = null; sdk.listener = null;
  sdk.getSession.mockReset().mockImplementation(async () => ({ data: { session: sdk.session }, error: sdk.error }));
  sdk.setSession.mockReset().mockImplementation(async () => {
    emit("SIGNED_IN", memberSession());
    return { data: { session: sdk.session }, error: null };
  });
  sdk.signOut.mockReset().mockImplementation(async () => { emit("SIGNED_OUT", null); return { error: null }; });
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("fetch", vi.fn(async () => response()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Admin uses the existing Supabase customer session", () => {
  it("restores Customer Auth before the guard and verifies booking.manage server-side without another login", async () => {
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    const result = await validateAdminRouteAuth({ pathname: "/admin/bookings/orders" });
    expect(result.status).toBe("authenticated");
    expect(fetch).toHaveBeenCalledWith("/api/admin-shop?action=admin-session&requiredPermission=booking.manage",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer customer-token" }) }));
    expect(sdk.setSession).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("adminShopToken")).toBeNull();
    expect(sessionStorage.getItem("adminShopRefreshToken")).toBeNull();
    expect(sessionStorage.getItem("adminShopIdentity")).toBeNull();
    const auth = await import("./adminAuth");
    expect(auth.getAdminIdentity()?.role_code).toBe("phase15_test_admin");
    expect(auth.getAdminToken()).toBe("customer-token");
  });
  it.each(["ordinary member", "disabled Admin", "missing booking.manage"])("fails closed for %s", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(403)));
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect(await validateAdminRouteAuth({ pathname: "/admin/bookings/orders" }))
      .toEqual({ status: "unauthenticated", reason: "invalid-admin" });
    expect((await import("./adminAuth")).getAdminIdentity()).toBeNull();
  });
  it("does not use an old Admin account when the currently signed-in member is rejected", async () => {
    sessionStorage.setItem("adminShopToken", "previous-admin-token");
    vi.stubGlobal("fetch", vi.fn(async () => response(403)));
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect((await validateAdminRouteAuth()).status).toBe("unauthenticated");
    expect(sessionStorage.getItem("adminShopToken")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a server-expired token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(401)));
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect(await validateAdminRouteAuth()).toEqual({ status: "unauthenticated", reason: "expired" });
  });
  it("does not fall back to old Admin storage when the SDK has no current session", async () => {
    sdk.session = null;
    sessionStorage.setItem("adminShopToken", "previous-admin-token");
    sessionStorage.setItem("adminShopRefreshToken", "previous-admin-refresh");
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect(await validateAdminRouteAuth()).toEqual({ status: "unauthenticated", reason: "missing" });
    expect(sessionStorage.getItem("adminShopToken")).toBeNull();
    expect(sessionStorage.getItem("adminShopRefreshToken")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects an expired session when refresh is no longer valid", async () => {
    sdk.error = { status: 400 };
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect(await validateAdminRouteAuth()).toEqual({ status: "unauthenticated", reason: "expired" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not accept an unrefreshed expired SDK session", async () => {
    sdk.session!.expires_at = 1;
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    expect(await validateAdminRouteAuth()).toEqual({ status: "unauthenticated", reason: "expired" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("updates all Admin requests from SDK token rotation without a second refresh store", async () => {
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    await validateAdminRouteAuth();
    emit("TOKEN_REFRESHED", memberSession("rotated-token"));
    const { ensureFreshAdminSession } = await import("./adminIdentityApi");
    expect(await ensureFreshAdminSession("old-token")).toBe("rotated-token");
    expect((await import("./adminAuth")).getAdminRefreshToken()).toBe("");
  });
  it("Customer sign-out clears Admin access and cannot reuse a captured token", async () => {
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    await validateAdminRouteAuth();
    emit("SIGNED_OUT", null);
    const auth = await import("./adminAuth");
    expect(auth.getAdminToken()).toBe("");
    expect(auth.getAdminIdentity()).toBeNull();
    expect(await (await import("./adminIdentityApi")).ensureFreshAdminSession("customer-token")).toBe("");
    expect(await validateAdminRouteAuth()).toEqual({ status: "unauthenticated", reason: "missing" });
  });
  it("Admin logout signs out the same SDK session", async () => {
    await (await import("./adminRouteAuth")).validateAdminRouteAuth();
    await (await import("./adminSharedSession")).signOutSharedAdminSession();
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect((await import("./adminAuth")).getAdminToken()).toBe("");
  });
  it("discards a late server identity response after sign-out", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    const result = validateAdminRouteAuth();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    emit("SIGNED_OUT", null);
    resolve(response());
    expect((await result).status).toBe("unauthenticated");
    expect((await import("./adminAuth")).getAdminIdentity()).toBeNull();
    expect(sessionStorage.getItem("adminShopToken")).toBeNull();
  });
  it("does not restore a stale session after sign-out during SDK restoration", async () => {
    let resolve!: (value: unknown) => void;
    sdk.getSession.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const shared = await import("./adminSharedSession");
    const pending = shared.readSharedAdminSession();
    emit("SIGNED_OUT", null);
    resolve({ data: { session: memberSession() }, error: null });
    expect(await pending).toBeNull();
  });
  it.each([200, 401])("does not expire a rotated session when an old request returns %s", async (status) => {
    const { validateAdminRouteAuth } = await import("./adminRouteAuth");
    await validateAdminRouteAuth();
    const auth = await import("./adminAuth");
    const expired = vi.fn();
    const unsubscribe = auth.subscribeAdminAuthExpired(expired);
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const pending = validateAdminRouteAuth();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    emit("TOKEN_REFRESHED", memberSession("rotated-token"));
    resolve(response(status));
    expect((await pending).status).toBe("unauthenticated");
    expect(expired).not.toHaveBeenCalled();
    expect(auth.getAdminToken()).toBe("rotated-token");
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    expect((await validateAdminRouteAuth()).status).toBe("authenticated");
    unsubscribe();
  });
  it("adopts a verified direct Admin login into the existing customer SDK", async () => {
    sdk.session = null;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      accessToken: "customer-token", refreshToken: "sdk-owned-refresh", user: admin,
    }))));
    await (await import("./adminIdentityApi")).loginAdminAccount("test@example.test", "synthetic-password");
    expect(sdk.setSession).toHaveBeenCalledWith({ access_token: "customer-token", refresh_token: "sdk-owned-refresh" });
    expect(sessionStorage.getItem("adminShopToken")).toBeNull();
  });
});
