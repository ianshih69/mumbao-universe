import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const sdk = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(), signOut: vi.fn(), error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: sdk.error } }));
vi.mock("./customerAuthClient", () => ({
  isCustomerAuthConfigError: () => false,
  getCustomerSupabaseClient: () => ({ auth: {
    getSession: sdk.getSession, signOut: sdk.signOut,
    onAuthStateChange: (listener: typeof sdk.listener) => { sdk.listener = listener; },
  } }),
}));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
function finishSignOut() {
  sdk.session = null;
  localStorage.removeItem("mumbao_customer_auth");
  sdk.listener?.("SIGNED_OUT", null);
  return { error: null };
}

beforeEach(() => {
  vi.resetModules();
  sdk.session = { access_token: "synthetic", expires_at: Date.now() / 1000 + 3600,
    user: { id: "synthetic-user" } } as Session;
  sdk.listener = null;
  sdk.getSession.mockReset().mockImplementation(async () => ({ data: { session: sdk.session }, error: null }));
  sdk.signOut.mockReset().mockImplementation(async () => finishSignOut());
  sdk.error.mockReset();
  const local = storage();
  const session = storage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session,
    location: { pathname: "/", search: "?returnTo=%2Fshop", replace: vi.fn() } });
  vi.stubGlobal("fetch", vi.fn());
  localStorage.setItem("mumbao_customer_auth", "synthetic-sdk-session");
  localStorage.setItem("mumbao_admin_session", "active");
  localStorage.setItem("unrelated-cart", "keep");
  for (const key of ["adminShopToken", "adminShopRefreshToken", "adminShopIdentity", "adminShopTokenExpiresAt", "adminAuthNotice"]) {
    sessionStorage.setItem(key, "old-value");
  }
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("one explicit logout destination", () => {
  it.each(["/account", "/booking", "/shop", "/admin/bookings/orders", "/admin/chats"])(
    "%s clears shared and legacy auth before replacing the document with /", async path => {
      window.location.pathname = path;
      const { logoutToHome, isLogoutInProgress } = await import("./logout");
      vi.mocked(window.location.replace).mockImplementation(target => {
        expect(target).toBe("/");
        expect(localStorage.getItem("mumbao_customer_auth")).toBeNull();
        expect(localStorage.getItem("mumbao_admin_session")).toBeNull();
        for (const key of ["adminShopToken", "adminShopRefreshToken", "adminShopIdentity", "adminShopTokenExpiresAt", "adminAuthNotice"]) {
          expect(sessionStorage.getItem(key)).toBeNull();
        }
      });
      expect(await logoutToHome()).toBe(true);
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(window.location.replace).toHaveBeenCalledTimes(1);
      expect(window.location.replace).toHaveBeenCalledWith("/");
      expect(localStorage.getItem("unrelated-cart")).toBe("keep");
      expect(isLogoutInProgress()).toBe(true);
      expect((await import("./adminAuth")).getAdminToken()).toBe("");
      expect((await import("./adminAuth")).getAdminIdentity()).toBeNull();
    },
  );

  it("waits for Customer Auth cleanup and preserves its existing sign-out scope", async () => {
    let finish!: () => void;
    const customerSignOut = vi.fn(() => new Promise<void>(resolve => {
      finish = () => { finishSignOut(); resolve(); };
    }));
    const { logoutToHome, isLogoutInProgress } = await import("./logout");
    const pending = logoutToHome(customerSignOut);
    await Promise.resolve();
    expect(isLogoutInProgress()).toBe(true);
    expect(window.location.replace).not.toHaveBeenCalled();
    finish();
    expect(await pending).toBe(true);
    expect(customerSignOut).toHaveBeenCalledTimes(1);
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith("/");
  });

  it("does not redirect or report success on SDK failure; an explicit retry can succeed", async () => {
    sdk.signOut.mockResolvedValueOnce({ error: new Error("network failure") });
    const { logoutToHome, isLogoutInProgress } = await import("./logout");
    expect(await logoutToHome()).toBe(false);
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("mumbao_customer_auth")).not.toBeNull();
    expect(isLogoutInProgress()).toBe(false);
    expect(sdk.error).toHaveBeenCalledTimes(1);
    expect(await logoutToHome()).toBe(true);
  });

  it("does not require a successful session refresh to log out an expired session", async () => {
    sdk.session!.expires_at = 1;
    sdk.getSession.mockResolvedValue({ data: { session: null }, error: { status: 400 } });
    expect(await (await import("./logout")).logoutToHome()).toBe(true);
    expect(sdk.getSession).not.toHaveBeenCalled();
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated logout clicks into one sign-out and one navigation", async () => {
    let finish!: () => void;
    sdk.signOut.mockImplementation(() => new Promise(resolve => {
      finish = () => resolve(finishSignOut());
    }));
    const { logoutToHome } = await import("./logout");
    const first = logoutToHome();
    const second = logoutToHome();
    expect(second).toBe(first);
    await Promise.resolve();
    finish();
    await first;
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(window.location.replace).toHaveBeenCalledTimes(1);
  });

  it("is already marked as explicit logout when the SDK notifies auth guards", async () => {
    const shared = await import("./adminSharedSession");
    await shared.readSharedAdminSession();
    const logout = await import("./logout");
    const observations: boolean[] = [];
    shared.subscribeSharedAdminSession(() => observations.push(logout.isLogoutInProgress()));
    await logout.logoutToHome();
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every(Boolean)).toBe(true);
  });

  it("subsequent Admin access cannot reuse the signed-out session", async () => {
    await (await import("./logout")).logoutToHome();
    expect(await (await import("./adminRouteAuth")).validateAdminRouteAuth({ pathname: "/admin/bookings/orders" }))
      .toEqual({ status: "unauthenticated", reason: "missing" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("all retained logout entry points share the same implementation", () => {
  it.each(["Admin", "AdminChats", "AdminShopAccount", "AdminShopHome", "AdminShopInventory", "AdminShopOrders", "AdminShopPos", "AdminShopProducts", "AdminShopScan", "CustomerAccount"])("%s delegates logout", name => {
    const source = readFileSync(new URL(`../../pages/${name}.tsx`, import.meta.url), "utf8");
    const handler = source.match(/(?:const logout = async \(\) =>|async function handleSignOut\(\)) \{([\s\S]*?)\n  \}/)?.[1];
    expect(handler).toContain("await logoutToHome(");
    expect(handler).not.toContain("setLocation(");
    expect(handler).not.toContain("redirectToLogin(");
  });
  it("Header delegates both desktop and mobile logout to the shared flow", () => {
    const source = readFileSync(new URL("../../components/layout/Header.tsx", import.meta.url), "utf8");
    expect(source).toContain("await logoutToHome(signOut)");
    expect(source.match(/onClick=\{\(\) => void handleCustomerSignOut\(\)\}/g)).toHaveLength(2);
    expect(source).not.toContain('setLocation("/shop")');
  });
});
