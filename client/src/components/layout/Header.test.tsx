import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

const state = vi.hoisted(() => ({ path: "/", scrolled: false, authenticated: false, stateIndex: 0 }));
const logout = vi.hoisted(() => ({ toHome: vi.fn(), signOut: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [state.stateIndex++ === 0 ? state.scrolled : initial, vi.fn()],
  useEffect: () => {},
}));
vi.mock("wouter", () => ({ Link: "a", useLocation: () => [state.path, vi.fn()] }));
vi.mock("@/contexts/CustomerAuthContext", () => ({
  useCustomerAuth: () => ({ isAuthenticated: state.authenticated, isLoading: false, user: null, signOut: logout.signOut }),
}));
vi.mock("@/lib/shop/customerAuthClient", () => ({
  getCustomerLoginHref: () => `/account/login?returnTo=${encodeURIComponent(state.path)}`,
}));
vi.mock("@/lib/shop/logout", () => ({ logoutToHome: logout.toHome }));

function elements() {
  state.stateIndex = 0;
  const result: Array<{ type: any; props: any }> = [];
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type) result.push(node);
    React.Children.toArray(node.props?.children).forEach(walk);
  }
  walk(Header());
  return result;
}
function links() {
  return elements().filter(node => node.type === "a").map(node => node.props);
}
beforeEach(() => {
  state.path = "/"; state.scrolled = false; state.authenticated = false;
  logout.toHome.mockReset();
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());

describe("Header authentication navigation", () => {
  it.each(["/", "/shop", "/booking", "/account/login", "/account/register", "/booking/lookup"])(
    "%s keeps drawer links and moves guest actions into the member dropdown", path => {
      state.path = path;
      const all = links();
      const register = all.filter(link => link.href === "/account/register");
      const login = all.filter(link => link.href.startsWith("/account/login?"));
      const lookup = all.filter(link => link.href === "/booking/lookup");
      expect(register).toHaveLength(2);
      expect(login).toHaveLength(2);
      expect(register[1].className).toBeUndefined();
      expect(login[1].className).toBeUndefined();
      expect(register[0].className).toBe(login[0].className);
      const trigger = elements().find(node => node.type === "button" && node.props["aria-label"] === "會員選單");
      expect(trigger?.props.className).toBe(lookup[1].className);
      for (const link of [register[0], login[0], lookup[1]]) {
        expect(link.className).not.toMatch(/(?:^|\s)(?:hover:)?bg-|rounded-full/);
        expect(link.className).toContain("focus-visible:");
      }
    },
  );

  it.each([
    ["/", undefined],
    ["/account/login", "/account/login"],
    ["/account/register", "/account/register"],
    ["/booking/lookup", "/booking/lookup"],
    ["/account/register-extra", undefined],
    ["/account", undefined],
    ["/booking/lookup-extra", undefined],
  ])("%s marks only the exact current auth/lookup page", (path, active) => {
    state.path = path!;
    const navigation = links().filter(link => ["/account/login", "/account/register", "/booking/lookup"].includes(link.href.split("?")[0]));
    for (const link of navigation) {
      expect(link["aria-current"]).toBe(active && link.href.split("?")[0] === active ? "page" : undefined);
    }
  });

  it("scrolling changes text contrast without giving registration a filled background", () => {
    state.scrolled = true;
    const trigger = elements().find(node => node.type === "button" && node.props["aria-label"] === "會員選單")!;
    expect(trigger.props.className).toContain("text-[#8b6f5b]");
    expect(trigger.props.className).not.toMatch(/bg-|rounded-full/);
  });

  it("keeps the login return path and authenticated navigation behavior", () => {
    state.path = "/booking";
    expect(links().filter(link => link.href.startsWith("/account/login?")).map(link => link.href))
      .toEqual(["/account/login?returnTo=%2Fbooking", "/account/login?returnTo=%2Fbooking"]);
    state.authenticated = true;
    expect(links().some(link => link.href === "/account/register" || link.href.startsWith("/account/login?"))).toBe(false);
    expect(links().some(link => link.href === "/account")).toBe(true);
  });

  it("both authenticated logout buttons retain production logoutToHome", async () => {
    state.authenticated = true;
    const buttons = elements().filter(node => node.type === "button" && node.props.onClick && !node.props["aria-label"]);
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await button.props.onClick();
    expect(logout.toHome).toHaveBeenCalledTimes(2);
    expect(logout.toHome).toHaveBeenCalledWith(logout.signOut);
  });
});
