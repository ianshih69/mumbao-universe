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

const bookingId = "10000000-0000-4000-8000-000000000021";
const adminProfileId = "20000000-0000-4000-8000-000000000021";
const adminAuthUserId = "30000000-0000-4000-8000-000000000021";

function request(body) {
  return {
    method: "POST",
    query: { action: "payment-review" },
    headers: {
      authorization: "Bearer admin-token",
      "x-request-id": "payment-audit-test",
    },
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

function rpcResult({ decision = "confirmed", idempotent = false } = {}) {
  const confirmed = decision === "confirmed";
  return {
    ok: true,
    idempotent,
    request: {
      id: bookingId,
      booking_reference: "2336504925",
      status: confirmed ? "confirmed" : "cancelled",
    },
    payment_record: {
      id: "40000000-0000-4000-8000-000000000021",
      status: confirmed ? "verified" : "rejected",
    },
    audit: idempotent
      ? undefined
      : {
          id: "50000000-0000-4000-8000-000000000021",
          action: confirmed ? "bank_payment_confirmed" : "bank_payment_cancelled",
        },
  };
}

beforeEach(() => {
  mocks.requirePermission.mockResolvedValue({
    actorAuthUserId: adminAuthUserId,
    actorEmail: "admin@example.invalid",
    actorName: "Admin",
    profile: { id: adminProfileId },
  });
  mocks.supabaseRequest.mockRejectedValue(new Error("payment review must not use a separate REST audit write"));
  mocks.supabaseRpc.mockResolvedValue(rpcResult());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.requirePermission.mockReset();
  mocks.supabaseRequest.mockReset();
  mocks.supabaseRpc.mockReset();
});

describe("admin booking payment audit contract", () => {
  it("confirms through the atomic RPC with the authenticated admin profile", async () => {
    const res = response();

    await adminBookingsHandler(
      request({
        id: bookingId,
        decision: "confirmed",
        p_admin_profile_id: "attacker-controlled-id",
        recovery_token: "must-not-be-forwarded",
        account_number: "must-not-be-forwarded",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      booking: { status: "confirmed" },
      payment_record: { status: "verified" },
      idempotent: false,
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), "users.update");
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("review_booking_bank_transfer", {
      p_booking_request_id: bookingId,
      p_admin_profile_id: adminProfileId,
      p_decision: "confirmed",
    });
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.supabaseRpc.mock.calls)).not.toContain("must-not-be-forwarded");
  });

  it("cancels a reported payment through the same atomic RPC", async () => {
    mocks.supabaseRpc.mockResolvedValue(rpcResult({ decision: "cancelled" }));
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "cancelled" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: "cancelled" },
      payment_record: { status: "rejected" },
    });
    expect(mocks.supabaseRpc).toHaveBeenCalledWith("review_booking_bank_transfer", {
      p_booking_request_id: bookingId,
      p_admin_profile_id: adminProfileId,
      p_decision: "cancelled",
    });
  });

  it("returns an idempotent replay without issuing a separate audit write", async () => {
    mocks.supabaseRpc.mockResolvedValue(rpcResult({ idempotent: true }));
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "confirmed" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(mocks.supabaseRpc).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated payment review before the RPC", async () => {
    const unauthorized = Object.assign(new Error("Unauthorized"), {
      status: 401,
      code: "unauthorized",
    });
    mocks.requirePermission.mockRejectedValue(unauthorized);
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "confirmed" }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it("fails closed when the database rejects a stale admin context", async () => {
    mocks.supabaseRpc.mockResolvedValue({ ok: false, code: "invalid_admin_context" });
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "confirmed" }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: "invalid_admin_context" });
  });

  it("does not report success when the transactional RPC fails", async () => {
    mocks.supabaseRpc.mockRejectedValue(new Error("booking_payment_admin_audit_insert_failed"));
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "confirmed" }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: "internal_error" });
    expect(mocks.supabaseRequest).not.toHaveBeenCalled();
  });

  it("rejects an invalid decision before changing booking state", async () => {
    const res = response();

    await adminBookingsHandler(request({ id: bookingId, decision: "refunded" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: "invalid_payment_review_decision" });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });
});
