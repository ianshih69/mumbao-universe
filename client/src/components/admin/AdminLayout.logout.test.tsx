import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "./AdminLayout";

const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, pending: [] as Array<() => void> }));
const auth = vi.hoisted(() => ({
  validate: vi.fn(), navigate: vi.fn(), logout: vi.fn(), clear: vi.fn(), loggingOut: false,
  sessionListener: null as null | (() => void), expiredListener: null as null | (() => void),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[i], (next: any) => { hooks.values[i] = typeof next === "function" ? next(hooks.values[i]) : next; }];
  },
  useMemo: (compute: () => any) => compute(),
  useEffect: (effect: () => any, deps: any[]) => {
    const i = hooks.cursor++;
    const old = hooks.values[i];
    if (!old || deps.some((value, n) => value !== old.deps[n])) {
      hooks.values[i] = { deps, cleanup: old?.cleanup };
      hooks.pending.push(() => { old?.cleanup?.(); hooks.values[i].cleanup = effect(); });
    }
  },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/admin/bookings/orders", auth.navigate], Link: "a" }));
vi.mock("@/lib/shop/adminRouteAuth", () => ({ validateAdminRouteAuth: auth.validate, adminRouteCanRender: () => true }));
vi.mock("@/lib/shop/adminAuth", () => ({
  clearAdminToken: auth.clear,
  buildAdminLoginPath: (path: string) => `/admin/shop/login?redirect=${encodeURIComponent(path)}`,
  subscribeAdminAuthExpired: (fn: () => void) => { auth.expiredListener = fn; return () => {}; },
}));
vi.mock("@/lib/shop/adminSharedSession", () => ({
  subscribeSharedAdminSession: (fn: () => void) => { auth.sessionListener = fn; return () => {}; },
}));
vi.mock("@/lib/shop/logout", () => ({ logoutToHome: auth.logout, isLogoutInProgress: () => auth.loggingOut }));

function render() {
  hooks.cursor = 0;
  const tree = AdminLayout({ children: <div>protected-orders</div> });
  hooks.pending.splice(0).forEach(effect => effect());
  return tree;
}
function findLogout(node: any): any {
  if (!node || typeof node !== "object") return undefined;
  if (node.props?.onClick && node.props["aria-label"] === "登出") return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = findLogout(child);
    if (found) return found;
  }
}
async function enter() {
  render();
  await Promise.resolve();
  return render();
}

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.pending = [];
  auth.loggingOut = false; auth.sessionListener = null; auth.expiredListener = null;
  auth.navigate.mockReset(); auth.clear.mockReset(); auth.logout.mockReset();
  auth.validate.mockReset().mockResolvedValue({ status: "authenticated", identity: {
    display_name: "Test Admin", role_code: "phase15_test_admin", permissions: ["booking.manage"],
  } });
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { location: { pathname: "/admin/bookings/orders", search: "" } });
});
afterEach(() => { hooks.values.forEach(value => value?.cleanup?.()); vi.unstubAllGlobals(); });

describe("Admin logout navigation race", () => {
  it("does not let SDK sign-out or a late 401 race explicit logout back to login", async () => {
    const tree = await enter();
    const button = findLogout(tree);
    expect(button).toBeDefined();
    auth.logout.mockImplementation(async () => { auth.loggingOut = true; auth.sessionListener?.(); return true; });
    await button.props.onClick();
    auth.validate.mockResolvedValue({ status: "unauthenticated", reason: "missing" });
    render();
    await Promise.resolve();
    auth.expiredListener?.();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(auth.navigate).not.toHaveBeenCalled();
  });
  it("still redirects an ordinary signed-out visit through the existing guard", async () => {
    auth.validate.mockResolvedValue({ status: "unauthenticated", reason: "missing" });
    await enter();
    expect(auth.navigate).toHaveBeenCalledWith("/admin/shop/login?redirect=%2Fadmin%2Fbookings%2Forders");
  });
  it("still redirects session expiry when the user did not explicitly log out", async () => {
    await enter();
    auth.expiredListener?.();
    expect(auth.navigate).toHaveBeenCalledWith("/admin/shop/login?redirect=%2Fadmin%2Fbookings%2Forders");
  });
});
