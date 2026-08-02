import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { __testing, createAdminPointRedemptionsHandler } from "./pointRedemptions.js";

const adminProfileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profileId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    end(value) {
      this.body = value || "";
    },
  };
}

async function invoke(handler, { method = "GET", query = {}, body = {} } = {}) {
  const req = {
    method,
    query,
    headers: {},
    adminShopRequestId: "test-request",
  };
  const res = createMockResponse();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

function redemption(overrides = {}) {
  return {
    id: requestId,
    customer_profile_id: profileId,
    points: 2000,
    bank_name: "Mumbao Bank",
    account_holder: "Diamond Partner",
    account_number: "123456789012",
    status: "pending",
    requested_at: "2026-08-02T10:00:00.000Z",
    completed_at: null,
    completed_by_admin_id: null,
    rejected_at: null,
    rejected_by_admin_id: null,
    rejection_reason: null,
    ledger_id: null,
    ...overrides,
  };
}

function createDeps({ rows = [redemption()], requirePermissionImpl, supabaseRpcImpl } = {}) {
  const redemptionRows = rows.map((row) => ({ ...row }));
  const requirePermission = vi.fn(
    requirePermissionImpl ||
      (async (_req, permission) => ({
        profile: { id: adminProfileId, permissions: [permission] },
        user: { id: "admin-auth-user" },
      })),
  );
  const writeAdminActivityLog = vi.fn(async () => ({ ok: true }));
  const supabaseRpc = vi.fn(supabaseRpcImpl || (async (name, payload) => {
    if (name === "complete_member_points_redemption_request") {
      const row = redemptionRows.find((item) => item.id === payload.p_request_id);
      if (row) {
        row.status = "completed";
        row.completed_at = "2026-08-02T11:00:00.000Z";
        row.completed_by_admin_id = payload.p_completed_by_admin_id;
        row.ledger_id = "33333333-3333-4333-8333-333333333333";
      }
      return { ok: true, code: "REDEMPTION_COMPLETED" };
    }
    if (name === "reject_member_points_redemption_request") {
      const row = redemptionRows.find((item) => item.id === payload.p_request_id);
      if (row) {
        row.status = "rejected";
        row.rejected_at = "2026-08-02T11:00:00.000Z";
        row.rejected_by_admin_id = payload.p_rejected_by_admin_id;
        row.rejection_reason = payload.p_rejection_reason;
      }
      return { ok: true, code: "REDEMPTION_REJECTED" };
    }
    return { ok: true };
  }));
  const supabaseRequest = vi.fn(async (url) => {
    if (url.includes("/member_points_redemption_requests?id=eq.")) {
      return redemptionRows.filter((row) => url.includes(row.id));
    }
    if (url.includes("/member_points_redemption_requests?select=")) {
      return redemptionRows;
    }
    if (url.includes("/shop_customer_profiles?id=in.")) {
      return [
        {
          id: profileId,
          auth_user_id: "customer-auth-user",
          email: "diamond@example.com",
          name: "Diamond Member",
          member_level: "diamond",
        },
      ];
    }
    if (url.includes("/member_diamond_profiles?customer_profile_id=in.")) {
      return [
        {
          id: "diamond-profile-a",
          customer_profile_id: profileId,
          partner_name: "Partner Store",
          exclusive_code: "PET001",
          partnership_status: "active",
        },
      ];
    }
    throw new Error(`Unexpected Supabase URL: ${url}`);
  });

  return {
    requirePermission,
    readBody: vi.fn(async (_req) => _req.__body || {}),
    supabaseRequest,
    supabaseRpc,
    writeAdminActivityLog,
  };
}

describe("admin point redemptions API", () => {
  it("lists redemption requests with only masked bank accounts", async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      redemption({
        id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
        points: 1000 + index,
        status: index === 11 ? "completed" : "pending",
        requested_at: `2026-08-02T${String(10 + (index % 10)).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const deps = createDeps({ rows });
    const handler = createAdminPointRedemptionsHandler(deps);

    const response = await invoke(handler, { query: { page: "1" } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, page: 1, pageSize: 10, total: 12, totalPages: 2 });
    expect(response.body.redemptions).toHaveLength(10);
    expect(response.body.redemptions[0]).toMatchObject({
      member_name: "Diamond Member",
      partner_name: "Partner Store",
      exclusive_code: "PET001",
      account_number_masked: "****9012",
      account_last4: "9012",
    });
    expect(response.body.redemptions[0]).not.toHaveProperty("account_number");
    expect(JSON.stringify(response.body)).not.toContain("123456789012");
    expect(deps.requirePermission).toHaveBeenCalledWith(expect.anything(), "users.view");
  });

  it("requires users.update before returning full account detail", async () => {
    const deps = createDeps();
    const handler = createAdminPointRedemptionsHandler(deps);

    const response = await invoke(handler, { query: { id: requestId } });

    expect(response.status).toBe(200);
    expect(response.body.redemption).toMatchObject({
      id: requestId,
      account_number: "123456789012",
      account_number_masked: "****9012",
    });
    expect(deps.requirePermission).toHaveBeenCalledWith(expect.anything(), "users.update");
  });

  it("returns 403 when a non-admin tries to list redemptions", async () => {
    const error = new Error("Permission denied.");
    error.status = 403;
    const deps = createDeps({ requirePermissionImpl: async () => { throw error; } });
    const handler = createAdminPointRedemptionsHandler(deps);

    const response = await invoke(handler);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Permission denied.");
  });

  it("completes a pending request through RPC and does not audit the full account number", async () => {
    const deps = createDeps();
    const handler = createAdminPointRedemptionsHandler(deps);
    const req = {
      method: "PATCH",
      query: { id: requestId },
      headers: {},
      adminShopRequestId: "test-request",
      __body: { action: "complete" },
    };
    const res = createMockResponse();

    await handler(req, res);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe("REDEMPTION_COMPLETED");
    expect(deps.supabaseRpc).toHaveBeenCalledWith("complete_member_points_redemption_request", {
      p_request_id: requestId,
      p_completed_by_admin_id: adminProfileId,
    });
    const auditPayload = deps.writeAdminActivityLog.mock.calls[0][0];
    expect(auditPayload.action).toBe("complete_member_points_redemption");
    expect(JSON.stringify(auditPayload)).not.toContain("123456789012");
    expect(JSON.stringify(auditPayload)).toContain("9012");
  });

  it("rejects a pending request without creating a ledger in the API layer", async () => {
    const deps = createDeps();
    const handler = createAdminPointRedemptionsHandler(deps);
    const req = {
      method: "PATCH",
      query: { id: requestId },
      headers: {},
      adminShopRequestId: "test-request",
      __body: { action: "reject", reason: "銀行帳號資料不完整" },
    };
    const res = createMockResponse();

    await handler(req, res);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.code).toBe("REDEMPTION_REJECTED");
    expect(body.redemption).toMatchObject({
      status: "rejected",
      rejection_reason: "銀行帳號資料不完整",
      ledger_id: null,
    });
    expect(deps.supabaseRpc).toHaveBeenCalledWith("reject_member_points_redemption_request", {
      p_request_id: requestId,
      p_rejected_by_admin_id: adminProfileId,
      p_rejection_reason: "銀行帳號資料不完整",
    });
  });

  it("returns 409 and skips audit when a redemption is no longer pending in the RPC", async () => {
    const deps = createDeps({
      supabaseRpcImpl: async () => {
        throw new Error("REDEMPTION_REQUEST_NOT_PENDING");
      },
    });
    const handler = createAdminPointRedemptionsHandler(deps);
    const req = {
      method: "PATCH",
      query: { id: requestId },
      headers: {},
      adminShopRequestId: "test-request",
      __body: { action: "complete" },
    };
    const res = createMockResponse();

    await handler(req, res);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(409);
    expect(body.error).toBe("此兌換申請已處理。");
    expect(deps.writeAdminActivityLog).not.toHaveBeenCalled();
  });

  it("keeps helper masking and audit sanitization free of full bank accounts", () => {
    expect(__testing.maskBankAccount("123456789012")).toBe("****9012");
    expect(__testing.getAccountLast4("1234-5678-9012")).toBe("9012");
    expect(__testing.sanitizeAuditRedemption(redemption())).toMatchObject({
      account_last4: "9012",
    });
    expect(__testing.sanitizeAuditRedemption(redemption())).not.toHaveProperty("account_number");
  });

  it("keeps the redemption migration transactional and service-role only", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/2026-08-02-member-points-redemptions.sql", import.meta.url),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("create table if not exists public.member_points_redemption_requests");
    expect(sql).toContain("customer_profile_id uuid not null");
    expect(sql).toContain("references public.shop_customer_profiles(id)");
    expect(sql).toContain("on update cascade");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("points integer not null");
    expect(sql).toContain("check (points > 0)");
    expect(sql).toContain("check (status in ('pending', 'completed', 'rejected'))");
    expect(sql).toContain("alter table public.member_points_redemption_requests enable row level security");
    expect(sql).toContain("revoke all on table public.member_points_redemption_requests from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.member_points_redemption_requests to service_role");
    expect(sql).toContain("create or replace function public.create_member_points_redemption_request");
    expect(sql).toContain("create or replace function public.complete_member_points_redemption_request");
    expect(sql).toContain("create or replace function public.reject_member_points_redemption_request");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("for update");
    expect(sql).toContain("where customer_profile_id = p_customer_profile_id");
    expect(sql).toContain("where id = v_request.customer_profile_id");
    expect(sql).toContain("and status = 'pending'");
    expect(sql).toContain("insert into public.member_points_ledger");
    expect(sql).toContain("source_type is null or source_type in ('booking_stay_reward', 'redemption')");
    expect(sql).toContain("set source_type = 'redemption'");
    expect(sql).not.toContain("where source_type = 'points_redemption'\n    and source_order_id is not null");
    expect(sql).toContain("create unique index if not exists member_points_ledger_redemption_source_unique_idx");
    expect(sql).toContain("where source_type = 'redemption'");
    expect(sql).toContain("'redemption',");
    expect(sql).toContain("create or replace function public.adjust_member_points_with_redemption_reserve");
    expect(sql).toContain("if p_points < 0 and (v_total_points + p_points) < v_pending_points");
    expect(sql).not.toContain("REDEMPTION_ALREADY_COMPLETED");
    expect(sql).not.toContain("REDEMPTION_ALREADY_REJECTED");
    expect(sql).toContain("revoke execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)");
    expect(sql).toContain("revoke execute on function public.complete_member_points_redemption_request(uuid, uuid)");
    expect(sql).toContain("revoke execute on function public.reject_member_points_redemption_request(uuid, uuid, text)");
    expect(sql).toContain("revoke execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)");
    expect(sql).toContain("from public");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("grant execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)");
    expect(sql).toContain("grant execute on function public.complete_member_points_redemption_request(uuid, uuid)");
    expect(sql).toContain("grant execute on function public.reject_member_points_redemption_request(uuid, uuid, text)");
    expect(sql).toContain("grant execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)");
    expect(sql).toContain("to service_role");
  });
});
