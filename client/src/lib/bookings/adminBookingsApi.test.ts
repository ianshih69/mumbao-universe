import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelAdminBooking,
  fetchBookingDashboard,
  reviewBookingBankTransfer,
  reviewBookingCancellation,
} from "./adminBookingsApi";
import {
  adminAuthExpiredMessage,
  adminPermissionDeniedMessage,
  isAdminAuthError,
  isAdminPermissionError,
  setAdminSession,
  subscribeAdminAuthExpired,
} from "@/lib/shop/adminAuth";

function stubSessionStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin bank transfer review API", () => {
  it.each(["confirmed", "cancelled"] as const)("sends an authenticated %s decision", async (decision) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      booking: { id: "booking-id", status: decision },
      payment_record: { id: "payment-id", status: decision === "confirmed" ? "verified" : "rejected" },
      idempotent: false,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await reviewBookingBankTransfer("admin-access-token", { id: "booking-id", decision });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin-bookings?action=payment-review",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-access-token" }),
        body: JSON.stringify({ id: "booking-id", decision }),
      }),
    );
  });

  it("sends direct cancellation and cancellation-review payloads without refund state", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await cancelAdminBooking("admin-access-token", { id: "booking-id", reason: "required reason" });
    await reviewBookingCancellation("admin-access-token", {
      id: "cancellation-request-id",
      decision: "approved",
      adminNote: "private",
      publicNote: "public",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin-bookings?action=direct-cancel", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ id: "booking-id", reason: "required reason" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin-bookings?action=cancellation-review", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        id: "cancellation-request-id",
        decision: "approved",
        adminNote: "private",
        publicNote: "public",
      }),
    }));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("refund");
  });
});

describe("admin bookings auth responses", () => {
  it("turns API 401 into the shared expired-session login flow", async () => {
    stubSessionStorage();
    setAdminSession({ accessToken: "expired-token" });
    let redirectRequested = false;
    const unsubscribe = subscribeAdminAuthExpired(() => {
      redirectRequested = true;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "unauthorized",
      message: "請先登入後台。",
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));

    const error = await fetchBookingDashboard("expired-token").catch((reason) => reason);

    expect(isAdminAuthError(error)).toBe(true);
    expect(error.message).toBe(adminAuthExpiredMessage);
    expect(redirectRequested).toBe(true);
    unsubscribe();
  });

  it("keeps API 403 in the permission-denied flow without a login redirect", async () => {
    stubSessionStorage();
    setAdminSession({ accessToken: "valid-token" });
    let redirectRequested = false;
    const unsubscribe = subscribeAdminAuthExpired(() => {
      redirectRequested = true;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "forbidden",
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));

    const error = await fetchBookingDashboard("valid-token").catch((reason) => reason);

    expect(isAdminPermissionError(error)).toBe(true);
    expect(error.message).toBe(adminPermissionDeniedMessage);
    expect(redirectRequested).toBe(false);
    unsubscribe();
  });

  it("preserves a 5xx booking data failure as a real page error", async () => {
    stubSessionStorage();
    setAdminSession({ accessToken: "valid-token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Booking data failed.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })));

    const error = await fetchBookingDashboard("valid-token").catch((reason) => reason);

    expect(isAdminAuthError(error)).toBe(false);
    expect(error.message).toBe("Booking data failed.");
  });
});
