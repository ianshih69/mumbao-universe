import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewBookingBankTransfer } from "./adminBookingsApi";

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
});
