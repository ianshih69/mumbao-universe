import { describe, expect, it } from "vitest";
import {
  buildAdminAuditLogQueryParams,
  buildLastSuccessfulAdminLoginQueryParams,
  normalizeAuditLogType,
} from "./auditLogFilters.js";

describe("admin audit log filters", () => {
  it("defaults unknown log types to operations", () => {
    expect(normalizeAuditLogType(undefined)).toBe("operations");
    expect(normalizeAuditLogType("")).toBe("operations");
    expect(normalizeAuditLogType("unknown")).toBe("operations");
    expect(normalizeAuditLogType("security")).toBe("security");
  });

  it("excludes auth logs from operations at query level", () => {
    const params = buildAdminAuditLogQueryParams({
      logType: "operations",
      actor: "",
      moduleName: "all",
      actionName: "all",
      date: "",
      nextDate: null,
    });

    expect(params).toContain("module=neq.auth");
    expect(params).toContain("select=*");
    expect(params).toContain("order=created_at.desc");
  });

  it("queries security logs from auth module at query level", () => {
    const params = buildAdminAuditLogQueryParams({
      logType: "security",
      actor: "Admin@example.com",
      moduleName: "all",
      actionName: "login",
      date: "2026-08-05",
      nextDate: "2026-08-06",
    });

    expect(params).toContain("module=eq.auth");
    expect(params).toContain("action=eq.login");
    expect(params).toContain("created_at=gte.2026-08-05T00%3A00%3A00.000Z");
    expect(params).toContain("created_at=lt.2026-08-06T00%3A00%3A00.000Z");
    expect(params.some((param) => param.startsWith("or=(actor_email.ilike.*Admin%40example.com*"))).toBe(true);
  });

  it("uses existing login logs for the security summary", () => {
    const params = buildLastSuccessfulAdminLoginQueryParams();

    expect(params).toContain("module=eq.auth");
    expect(params).toContain("action=eq.login");
    expect(params).toContain("target_type=eq.admin_profile");
    expect(params).toContain("limit=1");
  });
});
