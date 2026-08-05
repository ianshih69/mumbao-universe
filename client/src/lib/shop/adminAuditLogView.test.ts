import { describe, expect, it } from "vitest";
import {
  formatAuditLogSummary,
  getAuditLogActionOptions,
  getAuditLogModuleOptions,
} from "./adminAuditLogView";

describe("admin audit log view helpers", () => {
  it("localizes admin login events", () => {
    expect(
      formatAuditLogSummary({
        module: "auth",
        action: "login",
        target_type: "admin_profile",
        description: "Admin login",
      })
    ).toBe("管理員登入成功");

    expect(formatAuditLogSummary({ module: "auth", action: "login_failed" })).toBe("管理員登入失敗");
    expect(formatAuditLogSummary({ module: "auth", action: "logout" })).toBe("管理員登出");
  });

  it("keeps auth options out of the operations filters", () => {
    expect(getAuditLogModuleOptions("operations").map((option) => option.value)).not.toContain("auth");
    expect(getAuditLogActionOptions("operations").map((option) => option.value)).not.toContain("login");
  });

  it("keeps destructive audit actions out of security filters", () => {
    expect(getAuditLogModuleOptions("security").map((option) => option.value)).toContain("auth");
    expect(getAuditLogActionOptions("security").map((option) => option.value)).toEqual([
      "all",
      "login",
      "login_failed",
      "logout",
      "session_expired",
    ]);
  });
});
