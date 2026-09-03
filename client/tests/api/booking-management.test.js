import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bookingHandler from "../../api/booking.js";
import { buildPublicBookingManageResponse } from "../../server/bookingManagement.js";

const bookingId = "10000000-0000-4000-8000-000000000031";
const sessionId = "20000000-0000-4000-8000-000000000031";
const sessionToken = "booking-management-test-token";
const bookingReference = "5827319406";
const genericMessage = "查無符合的訂單資料，請確認輸入內容。";
const managedEnvNames = [
  "BOOKING_BANK_TRANSFER_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const originalEnv = Object.fromEntries(managedEnvNames.map((name) => [name, process.env[name]]));

function bookingFixture(status = "payment_hold") {
  return {
    id: bookingId,
    booking_reference: bookingReference,
    guest_name: "Booking Guest",
    guest_email: "guest@example.invalid",
    guest_phone: "0912345678",
    check_in: "2099-11-01",
    check_out: "2099-11-03",
    status,
    stay_type: "villa",
    adults: 8,
    children: 2,
    room_count: 5,
    has_pets: false,
    pet_count: 0,
    quoted_total: 40000,
    deposit_amount: 12000,
    balance_amount: 28000,
    hold_expires_at: status === "payment_hold" ? "2099-01-01T00:15:00.000Z" : null,
    created_at: "2098-12-31T23:59:00.000Z",
    submitted_snapshot: { summary: { infantCount: 1, breakfastAddonEntries: [] } },
  };
}

function createRequest({ method = "POST", action, body = {}, cookie = "", query = {} }) {
  return {
    method,
    query: { action, ...query },
    headers: {
      host: "booking.example.invalid",
      "x-forwarded-for": "203.0.113.31",
      "x-forwarded-proto": "https",
      ...(cookie ? { cookie } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
    body,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(value) {
      this.body = value ? JSON.parse(value) : null;
    },
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lookupFetchMock({ booking = bookingFixture(), rateLimit = { allowed: true } } = {}) {
  return vi.fn(async (url, options = {}) => {
    const address = String(url);
    if (address.includes("/rpc/consume_booking_lookup_rate_limit")) return jsonResponse(rateLimit);
    if (address.includes("/booking_requests?booking_reference=")) return jsonResponse(booking ? [booking] : []);
    if (address.includes("/rpc/create_booking_management_session")) {
      return jsonResponse({
        ok: true,
        database_now: "2099-01-01T00:00:00.000Z",
        session: { id: sessionId, booking_request_id: bookingId, expires_at: "2099-01-01T00:30:00.000Z" },
      });
    }
    if (address.includes("/booking_payment_records?")) return jsonResponse([]);
    if (address.includes("/booking_cancellation_requests?")) return jsonResponse([]);
    throw new Error(`Unexpected Supabase request: ${address}`);
  });
}

beforeEach(() => {
  process.env.BOOKING_BANK_TRANSFER_ENABLED = "true";
  process.env.SUPABASE_URL = "https://booking-management-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const name of managedEnvNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("customer booking management API", () => {
  it.each([
    ["payment_hold", "待付款"],
    ["payment_review", "匯款資料確認中"],
    ["confirmed", "訂房已成立"],
    ["expired", "付款期限已結束"],
    ["cancelled", "訂房已取消"],
    ["pending_review", "訂房確認中"],
  ])("maps internal %s status to customer copy", (status, expectedLabel) => {
    const mapped = buildPublicBookingManageResponse({
      booking: { ...bookingFixture(status), hold_expires_at: null },
      paymentRecord: null,
      cancellationRequest: null,
      databaseNow: "2099-01-01T00:00:00.000Z",
    });

    expect(mapped.booking.statusLabel).toBe(expectedLabel);
    if (status === "cancelled") expect(mapped.cancellation.statusLabel).toBe("訂房已取消");
    expect(JSON.stringify(mapped)).not.toContain(`"${status}"`);
  });

  it("keeps raw booking, payment, and cancellation statuses out of the customer response", () => {
    const mapped = buildPublicBookingManageResponse({
      booking: { ...bookingFixture("confirmed"), hold_expires_at: null },
      paymentRecord: {
        status: "verified",
        bank_last5: "12345",
        payer_name: "Booking Guest",
        reported_at: "2099-01-01T00:00:00.000Z",
        verified_at: "2099-01-01T00:05:00.000Z",
      },
      cancellationRequest: {
        status: "pending",
        reason_code: "schedule_change",
        requested_at: "2099-01-01T00:10:00.000Z",
      },
      databaseNow: "2099-01-01T00:15:00.000Z",
    });

    const serialized = JSON.stringify(mapped);
    for (const internalValue of ["confirmed", "verified", "pending", "schedule_change"]) {
      expect(serialized).not.toContain(`"${internalValue}"`);
    }
  });

  it.each([
    ["email", " GUEST@EXAMPLE.INVALID "],
    ["phone", "0912-345-678"],
  ])("looks up a booking with exact normalized %s and creates a hashed HttpOnly session", async (_kind, contact) => {
    const fetchMock = lookupFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({
      action: "lookup",
      body: { bookingReference, contact },
    }), response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      managePath: "/booking/manage",
      booking: { bookingReference, statusLabel: "待付款" },
    });
    expect(response.headers["set-cookie"]).toContain("mumbao_booking_manage=");
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]).toContain("Max-Age=1800");

    const sessionWrite = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/rpc/create_booking_management_session"),
    );
    const sessionBody = JSON.parse(sessionWrite[1].body);
    expect(sessionBody.p_booking_request_id).toBe(bookingId);
    expect(sessionBody.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionBody.p_token_hash).not.toContain(contact.trim());
    expect(JSON.stringify(sessionBody)).not.toContain("guest@example.invalid");
    expect(JSON.stringify(response.body)).not.toContain(bookingId);
  });

  it("uses the same generic response for a wrong contact and a wrong reference", async () => {
    const wrongContactResponse = createResponse();
    vi.stubGlobal("fetch", lookupFetchMock());
    await bookingHandler(createRequest({
      action: "lookup",
      body: { bookingReference, contact: "wrong@example.invalid" },
    }), wrongContactResponse);

    const wrongReferenceResponse = createResponse();
    vi.stubGlobal("fetch", lookupFetchMock({ booking: null }));
    await bookingHandler(createRequest({
      action: "lookup",
      body: { bookingReference: "1111111111", contact: "guest@example.invalid" },
    }), wrongReferenceResponse);

    expect(wrongContactResponse.statusCode).toBe(404);
    expect(wrongReferenceResponse.statusCode).toBe(404);
    expect(wrongContactResponse.body.message).toBe(genericMessage);
    expect(wrongReferenceResponse.body.message).toBe(genericMessage);
    expect(wrongContactResponse.body.error).toBe(wrongReferenceResponse.body.error);
  });

  it("returns HTTP 429 and Retry-After when either server-side lookup key is blocked", async () => {
    vi.stubGlobal("fetch", lookupFetchMock({ rateLimit: { allowed: false, retry_after_seconds: 47 } }));
    const response = createResponse();

    await bookingHandler(createRequest({
      action: "lookup",
      body: { bookingReference, contact: "guest@example.invalid" },
    }), response);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("47");
    expect(response.body).toMatchObject({
      ok: false,
      error: "booking_lookup_rate_limited",
      retry_after_seconds: 47,
    });
  });

  it("binds manage reads to the single booking in the unexpired cookie session", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.includes("/rpc/get_booking_management_session")) {
        const payload = JSON.parse(options.body);
        expect(payload.p_session_token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(payload)).not.toContain(sessionToken);
        return jsonResponse({
          ok: true,
          database_now: "2099-01-01T00:00:00.000Z",
          session: { id: sessionId, booking_request_id: bookingId, expires_at: "2099-01-01T00:30:00.000Z" },
        });
      }
      if (address.includes("/booking_requests?id=eq.")) {
        expect(address).toContain(bookingId);
        expect(address).not.toContain("attacker-booking-id");
        return jsonResponse([bookingFixture()]);
      }
      if (address.includes("/booking_payment_records?") || address.includes("/booking_cancellation_requests?")) return jsonResponse([]);
      throw new Error(`Unexpected Supabase request: ${address}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({
      method: "GET",
      action: "manage",
      cookie: `mumbao_booking_manage=${sessionToken}`,
      query: { id: "attacker-booking-id" },
    }), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.booking.bookingReference).toBe(bookingReference);
    expect(response.body.actions.canReportBankTransfer).toBe(true);
  });

  it("rejects an expired management session without reading any booking", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/rpc/get_booking_management_session")) {
        return jsonResponse({ ok: false, code: "booking_management_session_invalid" });
      }
      throw new Error("An expired session must not read a booking.");
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({
      method: "GET",
      action: "manage",
      cookie: `mumbao_booking_manage=${sessionToken}`,
    }), response);

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe(genericMessage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["payment_hold", "customer_cancel_payment_hold_booking", "訂房已取消"],
    ["payment_review", "customer_request_booking_cancellation", "匯款資料確認中"],
    ["confirmed", "customer_request_booking_cancellation", "訂房已成立"],
  ])("routes %s cancellation through the transactional RPC", async (initialStatus, expectedRpc, expectedLabel) => {
    let cancellationCalled = false;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.includes("/rpc/get_booking_management_session")) {
        return jsonResponse({
          ok: true,
          database_now: "2099-01-01T00:00:00.000Z",
          session: { id: sessionId, booking_request_id: bookingId, expires_at: "2099-01-01T00:30:00.000Z" },
        });
      }
      if (address.includes(`/rpc/${expectedRpc}`)) {
        cancellationCalled = true;
        return jsonResponse({ ok: true });
      }
      if (address.includes("/booking_requests?id=eq.") && address.includes("select=id,status")) {
        return jsonResponse([{ id: bookingId, status: initialStatus }]);
      }
      if (address.includes("/booking_requests?id=eq.")) {
        const nextStatus = initialStatus === "payment_hold" ? "cancelled" : initialStatus;
        return jsonResponse([bookingFixture(nextStatus)]);
      }
      if (address.includes("/booking_payment_records?") || address.includes("/booking_cancellation_requests?")) return jsonResponse([]);
      throw new Error(`Unexpected Supabase request: ${address}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({
      action: "cancel",
      cookie: `mumbao_booking_manage=${sessionToken}`,
      body: { reasonCode: "schedule_change", reasonText: "行程變更" },
    }), response);

    expect(response.statusCode).toBe(200);
    expect(cancellationCalled).toBe(true);
    expect(response.body.booking.statusLabel).toBe(expectedLabel);
  });

  it("maps a legacy pending_review booking without payment or cancellation records", () => {
    const result = buildPublicBookingManageResponse({
      booking: { ...bookingFixture("pending_review"), hold_expires_at: null },
      paymentRecord: null,
      cancellationRequest: null,
      databaseNow: "2099-01-01T00:00:00.000Z",
    });

    expect(result.booking.statusLabel).toBe("訂房確認中");
    expect(result.payment.label).toBe("尚未付款");
    expect(result.cancellation.statusLabel).toBe("無取消申請");
    expect(result.actions).toEqual({
      canReportBankTransfer: false,
      canDirectCancel: false,
      canRequestCancellation: false,
    });
  });
});
