import { describe, expect, it } from "vitest";
import {
  adminNavigationSections,
  canViewAdminNavItem,
  findAdminNavItemByPath,
  getAdminPageTitle,
  getVisibleAdminNavigation,
} from "./adminNavigation";
import type { AdminIdentity } from "@/lib/shop/adminAuth";

function identity(overrides: Partial<AdminIdentity> = {}): AdminIdentity {
  return {
    authMode: "account",
    display_name: "Tester",
    email: "tester@example.com",
    role_code: "staff",
    role_name: "Staff",
    permissions: [],
    is_active: true,
    ...overrides,
  };
}

describe("admin unified navigation", () => {
  it("keeps only existing first-phase admin entries in the main menu", () => {
    const labels = adminNavigationSections.flatMap((section) =>
      section.items.map((item) => item.label)
    );

    expect(labels).toContain("管理總覽");
    expect(labels).toContain("房況與訂房管理");
    expect(labels).toContain("官網內容管理");
    expect(labels).toContain("問慢寶客服");
    expect(labels).toContain("商城總覽");
    expect(labels).toContain("會員");
    expect(labels).toContain("操作紀錄");
    expect(labels).not.toContain("價格設定");
    expect(labels).not.toContain("同步與警示");
    expect(labels).not.toContain("舊版內容管理");
  });

  it("filters permission and role gated links", () => {
    const limited = identity({ permissions: ["products.view"] });
    const visibleLabels = getVisibleAdminNavigation(limited).flatMap((section) =>
      section.items.map((item) => item.label)
    );

    expect(visibleLabels).toContain("管理總覽");
    expect(visibleLabels).toContain("商品");
    expect(visibleLabels).not.toContain("會員");
    expect(visibleLabels).not.toContain("操作紀錄");
    expect(visibleLabels).not.toContain("官網內容管理");
    expect(visibleLabels).not.toContain("問慢寶客服");
  });

  it("allows super admin to view role and permission gated links", () => {
    const superAdmin = identity({ role_code: "super_admin", permissions: [] });
    const labels = getVisibleAdminNavigation(superAdmin).flatMap((section) =>
      section.items.map((item) => item.label)
    );

    expect(labels).toContain("官網內容管理");
    expect(labels).toContain("問慢寶客服");
    expect(labels).toContain("會員");
    expect(labels).toContain("操作紀錄");
  });

  it("does not show admin links to inactive admin identities", () => {
    expect(getVisibleAdminNavigation(identity({ is_active: false }))).toEqual([]);
  });

  it("matches member detail routes to the members menu item", () => {
    expect(findAdminNavItemByPath("/admin/members/member-1")?.key).toBe("members");
    expect(getAdminPageTitle("/admin/members/member-1")).toBe("會員");
    expect(getAdminPageTitle("/admin/legacy-content")).toBe("舊版內容管理");
  });

  it("checks individual nav item permissions with server-side permission names", () => {
    const auditItem = adminNavigationSections
      .flatMap((section) => section.items)
      .find((item) => item.href === "/admin/shop/audit-logs");

    expect(auditItem?.permission).toBe("audit_logs.view");
    expect(canViewAdminNavItem(auditItem!, identity({ permissions: ["audit_logs.view"] }))).toBe(true);
    expect(canViewAdminNavItem(auditItem!, identity({ permissions: ["orders.view"] }))).toBe(false);
  });
});
