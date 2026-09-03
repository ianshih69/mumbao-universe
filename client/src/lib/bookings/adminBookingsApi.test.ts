import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelAdminBooking,
  reviewBookingBankTransfer,
  reviewBookingCancellation,
} from "./adminBookingsApi";

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
