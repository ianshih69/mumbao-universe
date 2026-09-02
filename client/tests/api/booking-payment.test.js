import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bookingHandler from "../../api/booking.js";
import {
  __testing as paymentConfigTesting,
  publicBankTransferSettings,
} from "../../server/bookingPayments/config.js";

const recoveryToken = "A".repeat(43);
const managedEnvNames = [
  "BOOKING_BANK_TRANSFER_ENABLED",
  "BANK_TRANSFER_REVIEW_MINUTES",
  "BOOKING_PAYMENT_REPORT_RATE_LIMIT",
  "BOOKING_PAYMENT_REPORT_RATE_WINDOW_SECONDS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const originalEnv = Object.fromEntries(managedEnvNames.map((name) => [name, process.env[name]]));

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

function createRequest(body) {
  return {
    method: "POST",
    query: { action: "report-payment" },
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "127.0.0.1" },
    body,
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://booking-payment-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.BANK_TRANSFER_REVIEW_MINUTES = "120";
  process.env.BOOKING_PAYMENT_REPORT_RATE_LIMIT = "8";
  process.env.BOOKING_PAYMENT_REPORT_RATE_WINDOW_SECONDS = "60";
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

describe("booking bank transfer server contract", () => {
  it("exposes no bank data while disabled and omits SWIFT from enabled public settings", () => {
    expect(publicBankTransferSettings({ ...paymentConfigTesting.defaultBankTransferSettings, enabled: false })).toEqual({
      enabled: false,
    });

    const enabled = publicBankTransferSettings({ ...paymentConfigTesting.defaultBankTransferSettings, enabled: true });
    expect(enabled).toEqual({
      enabled: true,
      method: "bank_transfer",
      currency: "TWD",
      bank: {
        name: paymentConfigTesting.defaultBankTransferSettings.bankName,
        code: paymentConfigTesting.defaultBankTransferSettings.bankCode,
        branch: paymentConfigTesting.defaultBankTransferSettings.branchName,
        accountName: paymentConfigTesting.defaultBankTransferSettings.accountName,
        accountNumber: paymentConfigTesting.defaultBankTransferSettings.accountNumber,
      },
    });
    expect(JSON.stringify(enabled)).not.toContain(paymentConfigTesting.defaultBankTransferSettings.swiftCode);
  });

  it("fails closed before DB access when the feature flag is disabled", async () => {
    process.env.BOOKING_BANK_TRANSFER_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({ recoveryToken, bankLast5: "12345" }), response);

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ ok: false, error: "bank_transfer_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates last five digits before DB access", async () => {
    process.env.BOOKING_BANK_TRANSFER_ENABLED = "true";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({ recoveryToken, bankLast5: "12A" }), response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: "invalid_bank_last5" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores caller amount, deadline, and status while returning only domestic bank fields", async () => {
    process.env.BOOKING_BANK_TRANSFER_ENABLED = "true";
    const rpcBodies = [];
    const fetchMock = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      rpcBodies.push({ url: String(url), body });

      if (String(url).endsWith("/consume_booking_payment_report_rate_limit")) {
        return new Response(JSON.stringify({ allowed: true, retry_after_seconds: 60 }), { status: 200 });
      }

      return new Response(JSON.stringify({
        ok: true,
        idempotent: false,
        database_now: "2026-09-01T04:01:00.000Z",
        request: {
          id: "10000000-0000-4000-8000-000000000001",
          booking_reference: "5827319406",
          status: "payment_review",
          check_in: "2026-11-01",
          check_out: "2026-11-05",
          created_at: "2026-09-01T04:00:00.000Z",
          hold_expires_at: "2026-09-01T04:15:00.000Z",
          payment_reported_at: "2026-09-01T04:01:00.000Z",
          review_expires_at: "2026-09-01T06:01:00.000Z",
        },
        pricing: {
          quotedTotal: 121564,
          depositRate: 0.3,
          depositAmount: 36469,
          balanceAmount: 85095,
          pricingBreakdown: { status: "resolved", total: 121564 },
        },
        payment_record: {
          id: "20000000-0000-4000-8000-000000000002",
          payment_method: "bank_transfer",
          expected_amount: 36469,
          currency: "TWD",
          status: "reported",
          bank_last5: "12345",
          payer_name: "Payment Tester",
          reported_at: "2026-09-01T04:01:00.000Z",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = createResponse();

    await bookingHandler(createRequest({
      recoveryToken,
      bankLast5: "12345",
      payerName: "Payment Tester",
      notes: "customer note",
      amount: 1,
      expectedAmount: 1,
      status: "confirmed",
      reviewMinutes: 1440,
    }), response);

    expect(response.statusCode).toBe(200);
    expect(rpcBodies).toHaveLength(2);
    expect(rpcBodies[0].body.p_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rpcBodies[0].body)).not.toContain(recoveryToken);
    expect(rpcBodies[1].body).toMatchObject({
      p_bank_last5: "12345",
      p_payer_name: "Payment Tester",
      p_notes: "customer note",
      p_review_minutes: 120,
    });
    expect(rpcBodies[1].body).not.toHaveProperty("amount");
    expect(rpcBodies[1].body).not.toHaveProperty("expectedAmount");
    expect(rpcBodies[1].body).not.toHaveProperty("status");
    expect(response.body.request.status).toBe("payment_review");
    expect(response.body.payment.bank.accountNumber).toBe(paymentConfigTesting.defaultBankTransferSettings.accountNumber);
    expect(JSON.stringify(response.body.payment)).not.toContain(paymentConfigTesting.defaultBankTransferSettings.swiftCode);
  });
});
