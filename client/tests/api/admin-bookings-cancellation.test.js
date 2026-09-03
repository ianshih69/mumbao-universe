import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  supabaseRequest: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock("../../server/shopShared.js", () => ({
  firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
  },
  getServerEnv: vi.fn(() => ""),
  readBody: vi.fn(async (req) => req.body || {}),
  sendJson(res, status, body) {
    res.statusCode = status;
    res.body = body;
  },
  supabaseRequest: mocks.supabaseRequest,
  supabaseRpc: mocks.supabaseRpc,
}));

vi.mock("../../server/adminShop/core.js", () => ({
  requirePermission: mocks.requirePermission,
}));

import adminBookingsHandler from "../../api/admin-bookings.js";

const bookingId = "10000000-0000-4000-8000-000000000041";
const cancellationRequestId = "20000000-0000-4000-8000-000000000041";
const adminProfileId = "30000000-0000-4000-8000-000000000041";

function request(action, body) {
  return {
    method: "POST",
    query: { action },
    headers: { authorization: "Bearer admin-token", "x-request-id": "cancellation-audit-test" },
    socket: { remoteAddress: "127.0.0.1" },
    body,
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    end(value) {
      this.body = value ? JSON.parse(value) : null;
    },
  };
}

beforeEach(() => {
  mocks.requirePermission.mockResolvedValue({
    actorAuthUserId: "40000000-0000-4000-8000-000000000041",
    actorEmail: "admin@example.invalid",
    actorName: "Admin",
    profile: { id: adminProfileId },
  });
  mocks.supabaseRequest.mockRejectedValue(new Error("cancellation actions must not use separate REST writes"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.requirePermission.mockReset();
  mocks.supabaseRequest.mockReset();
  mocks.supabaseRpc.mockReset();
});

describe("admin booking cancellation contract", () => {
  it("directly cancels a confirmed booking through one atomic RPC while preserving verified payment", async () => {
    mocks.supabaseRpc.mockResolvedValue({
      ok: true,
      idempotent: false,
      request: { id: bookingId, booking_reference: "8752989685", status: "cancelled" },
      payment_record: { id: "50000000-0000-4000-8000-000000000041", status: "verified" },
      audit: { id: "60000000-0000-4000-8000-000000000041", action: "admin_booking_cancelled" },
    });
    const res = response();

    await adminBookingsHandler(request("direct-cancel", {
      id: bookingId,
      reason: "guest requested by phone",
      payment_status: "refunded",
      refund_amount: 12000,
      admin_profile_id: "attacker-profile-id",
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      booking: { status: "cancelled" },
      payment_record: { status: "verified" },
      audit: { action: "admin_booking_cancelled" },
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), "users.update");
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("admin_cancel_confirmed_booking", {
      p_booking_request_id: bookingId,
      p_admin_profile_id: adminProfileId,
      p_reason: "guest requested by phone",
    });
    expect(JSON.stringify(mocks.supabaseRpc.mock.calls)).not.toContain("refunded");
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
  });

  it("requires a direct-cancellation reason before calling the RPC", async () => {
    const res = response();

    await adminBookingsHandler(request("direct-cancel", { id: bookingId, reason: "  " }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: "cancellation_reason_required" });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["approved", "cancelled", "verified", "admin_cancellation_approved"],
    ["rejected", "confirmed", "verified", "admin_cancellation_rejected"],
  ])("reviews a pending request as %s through one atomic RPC", async (decision, bookingStatus, paymentStatus, action) => {
    mocks.supabaseRpc.mockResolvedValue({
      ok: true,
      idempotent: false,
      request: { id: bookingId, status: bookingStatus },
      payment_record: { id: "50000000-0000-4000-8000-000000000041", status: paymentStatus },
      cancellation_request: { id: cancellationRequestId, status: decision },
      audit: { id: "60000000-0000-4000-8000-000000000041", action },
    });
    const res = response();

    await adminBookingsHandler(request("cancellation-review", {
      id: cancellationRequestId,
      decision,
      adminNote: "private review note",
      publicNote: "customer-safe note",
      refundAmount: 99999,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: bookingStatus },
      payment_record: { status: paymentStatus },
      cancellation_request: { status: decision },
      audit: { action },
    });
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("review_booking_cancellation_request", {
      p_cancellation_request_id: cancellationRequestId,
      p_admin_profile_id: adminProfileId,
      p_decision: decision,
      p_admin_note: "private review note",
      p_public_note: "customer-safe note",
    });
    expect(JSON.stringify(mocks.supabaseRpc.mock.calls)).not.toContain("99999");
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated cancellation before any state-changing call", async () => {
    mocks.requirePermission.mockRejectedValue(Object.assign(new Error("Unauthorized"), {
      status: 401,
      code: "unauthorized",
    }));
    const res = response();

    await adminBookingsHandler(request("direct-cancel", { id: bookingId, reason: "test" }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it("fails closed when the database rejects the admin context", async () => {
    mocks.supabaseRpc.mockResolvedValue({ ok: false, code: "invalid_admin_context" });
    const res = response();

    await adminBookingsHandler(request("direct-cancel", { id: bookingId, reason: "test" }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: "invalid_admin_context" });
  });

  it("does not report success when the cancellation audit insert rolls back the RPC", async () => {
    mocks.supabaseRpc.mockRejectedValue(new Error("forced_booking_cancellation_audit_failure"));
    const res = response();

    await adminBookingsHandler(request("direct-cancel", { id: bookingId, reason: "test" }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: "internal_error" });
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
  });
});
