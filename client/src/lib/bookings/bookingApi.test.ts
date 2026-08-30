import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BookingApiError,
  recoverBookingRequest,
  submitBookingRequest,
  type BookingRequestPayload,
} from "./bookingApi";

const payload: BookingRequestPayload = {
  guest_name: "Booking Hold Test",
  email: "booking-hold@example.invalid",
  phone: "0900000000",
  check_in: "2026-11-01",
  check_out: "2026-11-05",
  stay_type: "villa",
  selected_package_type: "villa_10",
  selected_room_option_id: "2q1d",
  adults: 10,
  children: 0,
  infants: 0,
  room_count: 5,
  has_pets: false,
  pet_count: 0,
  pet_type: "",
  pet_notes: "",
  dog_under_10kg_count: 0,
  dog_10_to_20kg_count: 0,
  dog_over_20kg_count: 0,
  breakfast_addons: [],
  notes: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("booking hold API contract", () => {
  it("preserves structured temporary-hold conflict details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: "booking_temporarily_held",
      message: "此日期目前正由其他旅客暫時保留中。",
      hold_expires_at: "2026-11-01T08:15:00.000Z",
      retry_after_seconds: 899,
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(submitBookingRequest(payload)).rejects.toMatchObject<Partial<BookingApiError>>({
      name: "BookingApiError",
      status: 409,
      code: "booking_temporarily_held",
      holdExpiresAt: "2026-11-01T08:15:00.000Z",
      retryAfterSeconds: 899,
    });
  });

  it("returns the immutable submitted pricing snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      requestId: "booking-public-test",
      request: {
        id: "10000000-0000-4000-8000-000000000001",
        status: "payment_hold",
        check_in: "2026-11-01",
        check_out: "2026-11-05",
        created_at: "2026-11-01T08:00:00.000Z",
        hold_expires_at: "2026-11-01T08:15:00.000Z",
      },
      pricing: {
        quotedTotal: 121564,
        depositRate: 0.3,
        depositAmount: 36469,
        balanceAmount: 85095,
        pricingBreakdown: { status: "resolved", total: 121564 },
      },
      recoveryToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    const result = await submitBookingRequest(payload);
    expect(result.request.status).toBe("payment_hold");
    expect(result.request.hold_expires_at).toBe("2026-11-01T08:15:00.000Z");
    expect(result.pricing).toMatchObject({
      quotedTotal: 121564,
      depositAmount: 36469,
      balanceAmount: 85095,
    });
  });

  it("recovers the submitted snapshot with a POST body token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      requestId: "booking-public-recovery",
      request: {
        id: "10000000-0000-4000-8000-000000000001",
        status: "payment_hold",
        check_in: "2026-11-01",
        check_out: "2026-11-05",
        created_at: "2026-11-01T08:00:00.000Z",
        hold_expires_at: "2026-11-01T08:15:00.000Z",
      },
      pricing: {
        quotedTotal: 121564,
        depositRate: 0.3,
        depositAmount: 36469,
        balanceAmount: 85095,
        pricingBreakdown: { status: "resolved", total: 121564 },
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const recoveryToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const result = await recoverBookingRequest(recoveryToken);

    expect(result.pricing?.quotedTotal).toBe(121564);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/booking?action=recover",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ recoveryToken }),
      })
    );
  });
});
