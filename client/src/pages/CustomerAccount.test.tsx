import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerAccount from "./CustomerAccount";

const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, pending: [] as Array<() => void> }));
const auth = vi.hoisted(() => ({ current: {} as any }));
const api = vi.hoisted(() => ({ access: vi.fn(), orders: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[i], (next: any) => {
      hooks.values[i] = typeof next === "function" ? next(hooks.values[i]) : next;
    }];
  },
  useMemo: (compute: () => any) => compute(),
  useCallback: (fn: any) => fn,
  useEffect: (effect: () => any, deps: any[]) => {
    const i = hooks.cursor++;
    const old = hooks.values[i];
    if (!old || deps.some((value, n) => value !== old.deps[n])) {
      hooks.values[i] = { deps, cleanup: old?.cleanup };
      hooks.pending.push(() => { old?.cleanup?.(); hooks.values[i].cleanup = effect(); });
    }
  },
}));
vi.mock("@/contexts/CustomerAuthContext", () => ({ useCustomerAuth: () => auth.current }));
vi.mock("@/lib/shop/customerProfileApi", () => ({
  fetchCustomerAdminAccess: api.access,
  createCustomerPointRedemption: vi.fn(),
}));
vi.mock("@/lib/shop/customerOrdersApi", () => ({
  fetchCustomerOrders: api.orders,
  fetchCustomerOrderDetail: vi.fn(),
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("wouter", () => ({
  useLocation: () => ["/account", vi.fn()],
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children, variant, ...props }: any) =>
    asChild ? React.cloneElement(children, props) : <button {...props}>{children}</button>,
}));

function render() {
  hooks.cursor = 0;
  const tree = CustomerAccount();
  hooks.pending.splice(0).forEach(effect => effect());
  return renderToStaticMarkup(tree);
}
async function settle() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
  return render();
}
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { promise, resolve };
}
const staff = { isStaff: true, role: "phase15_test_admin", adminLinks: [] };
const member = { isStaff: false, role: null, adminLinks: [] };

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.pending = [];
  vi.stubGlobal("React", React);
  api.access.mockReset().mockResolvedValue(member);
  api.orders.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 5 });
  auth.current = {
    user: { id: "test-user", email: "member@example.test", user_metadata: {} },
    session: { access_token: "test-session" },
    profile: { id: "profile", name: "測試會員", email: "member@example.test", member_level: "normal", email_verified: true },
    isLoading: false, isProfileLoading: false, isAuthenticated: true,
    profileError: "", refreshProfile: vi.fn(), signOut: vi.fn(), updateProfile: vi.fn(),
  };
});
afterEach(() => {
  hooks.values.forEach(value => value?.cleanup?.());
  vi.unstubAllGlobals();
});

describe("account Admin entry", () => {
  it("shows the server-verified role and only one orders link inside the identity card", async () => {
    api.access.mockResolvedValue(staff);
    expect(render()).not.toContain("進入管理後台");
    const html = await settle();
    expect(api.access).toHaveBeenCalledWith("test-session");
    expect(api.access).toHaveBeenCalledTimes(1);
    expect(html).toContain("Admin · phase15_test_admin");
    expect(html.match(/href="\/admin\/bookings\/orders"/g)).toHaveLength(1);
    const identityCard = html.match(/<section[^>]*>.*?會員身分.*?<\/section>/)?.[0];
    expect(identityCard).toContain("進入管理後台");
    expect(html).toContain("我的會員資料");
    expect(html).toContain("修改會員資料");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-auto");
  });

  it("does not use email, user metadata or member level as Admin authority", async () => {
    auth.current.user.email = "admin@example.test";
    auth.current.user.user_metadata = { role: "super_admin", isStaff: true };
    auth.current.profile.member_level = "vip";
    render();
    expect(await settle()).not.toContain("進入管理後台");
  });

  it.each([
    { isStaff: false, role: "admin", adminLinks: [] },
    { isStaff: true, role: null, adminLinks: [] },
  ])("fails closed for an incomplete or non-admin response: %j", async access => {
    api.access.mockResolvedValue(access);
    render();
    expect(await settle()).not.toContain("進入管理後台");
  });

  it.each([401, 403, 500])("keeps normal account functions available on lookup error %s", async status => {
    api.access.mockRejectedValue(new Error(String(status)));
    render();
    const html = await settle();
    expect(html).not.toContain("進入管理後台");
    expect(html).toContain("我的會員資料");
  });

  it("hides stale privilege immediately when the member session changes", async () => {
    api.access.mockResolvedValueOnce(staff).mockResolvedValueOnce(member);
    render();
    expect(await settle()).toContain("進入管理後台");
    auth.current.session = { access_token: "different-member-session" };
    expect(render()).not.toContain("進入管理後台");
    expect(await settle()).not.toContain("進入管理後台");
  });

  it("ignores late Admin lookup results from a previous account", async () => {
    const old = deferred();
    api.access.mockReturnValueOnce(old.promise).mockResolvedValueOnce(member);
    render();
    auth.current.session = { access_token: "different-member-session" };
    render();
    await settle();
    old.resolve(staff);
    expect(await settle()).not.toContain("進入管理後台");
  });

  it("does not fetch or render an Admin entry when logged out", async () => {
    auth.current.isAuthenticated = false;
    auth.current.session = null;
    render();
    const html = await settle();
    expect(api.access).not.toHaveBeenCalled();
    expect(html).not.toContain("進入管理後台");
    expect(html).toContain("請先登入會員");
  });

  it("hides the link on sign-out even when the old lookup finishes later", async () => {
    const pending = deferred();
    api.access.mockReturnValue(pending.promise);
    render();
    auth.current.isAuthenticated = false;
    auth.current.session = null;
    render();
    pending.resolve(staff);
    expect(await settle()).not.toContain("進入管理後台");
  });
});
