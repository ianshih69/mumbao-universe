import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BookingApiError,
  bookingSubmitAttempt,
  fetchBookingCalendar,
  fetchRoomPriceAvailability,
  fetchBookingQuote,
  isRoomOptionEligible,
  fetchBookingManageSession,
  lookupBookingOrder,
  recoverBookingRequest,
  reportBookingManageBankTransfer,
  reportBookingBankTransfer,
  submitBookingCancellation,
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
  it("passes total guestCount to both inventory endpoints and roomId to the existing quote route", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    await fetchBookingCalendar("2026-11-01", 4);
    await fetchRoomPriceAvailability("2026-11-02", "2026-11-04", 4);
    await fetchBookingQuote({ checkIn: "2026-11-02", checkOut: "2026-11-04", stayType: "room", roomId: "room-521",
      packageType: "villa_10", adults: 2, children: 1, infants: 1, dogUnder10kgCount: 0, dog10To20kgCount: 0, dogOver20kgCount: 0, selectedRoomOptionId: "", roomCount: 1 });
    const queries = fetchMock.mock.calls.map(([url]) => new URL(url, "https://example.invalid").searchParams);
    expect(queries[0].get("guestCount")).toBe("4"); expect(queries[1].get("guestCount")).toBe("4");
    expect(queries[2].get("roomId")).toBe("room-521"); expect(queries[2].get("stayType")).toBe("room");
    expect(queries[2].has("price")).toBe(false);
  });

  it("keeps a UUID stable for identical retries but rotates it for an edited request", () => {
    const randomUUID = vi.fn().mockReturnValueOnce("11111111-1111-4111-8111-111111111111").mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    vi.stubGlobal("crypto", { randomUUID });
    const roomPayload = { ...payload, stay_type: "room" as const, room_id: "room-521", guest_count: 2 };
    const first = bookingSubmitAttempt(roomPayload, null);
    const retry = bookingSubmitAttempt({ ...roomPayload, client_request_id: first.id }, first);
    expect(retry).toBe(first); expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(bookingSubmitAttempt({ ...roomPayload, room_id: "room-360" }, retry).id).not.toBe(first.id);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("counts children and infants against capacity and honors backend ineligibility", () => {
    const room = { roomId: "521", code: "S521", publicName: "Room", capacity: 2, guestCapacityEligible: true,
      nights: 2, pricingStatus: "configured" as const, price: 5460, pricingBreakdown: { breakdown: [] } };
    expect(isRoomOptionEligible(room, 2)).toBe(true);
    expect(isRoomOptionEligible(room, 2 + 1 + 1)).toBe(false);
    expect(isRoomOptionEligible({ ...room, guestCapacityEligible: false }, 1)).toBe(false);
    expect(isRoomOptionEligible({ ...room, price: null }, 2)).toBe(false);
  });

  it("preserves room snapshot and structured duplicate rejection", async () => {
    const room = { roomId: "521", code: "S521", publicName: "Room", capacity: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true, summary: { stayType: "room", room }, pricing: { quotedTotal: 11351, depositAmount: 3405, balanceAmount: 7946, pricingBreakdown: { room } },
    }))).mockResolvedValueOnce(new Response(JSON.stringify({ code: "duplicate_client_request", message: "Duplicate" }), { status: 409 })));
    const first = await submitBookingRequest(payload);
    expect(first.summary?.room).toEqual(room); expect(first.pricing?.depositAmount).toBe(3405);
    await expect(submitBookingRequest(payload)).rejects.toMatchObject({ status: 409, code: "duplicate_client_request" });
  });
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

  it("preserves the server payment-review snapshot and sends no client amount or status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      requestId: "booking-payment-report",
      request: {
        id: "10000000-0000-4000-8000-000000000001",
        booking_reference: "5827319406",
        status: "payment_review",
        check_in: "2026-11-01",
        check_out: "2026-11-05",
        created_at: "2026-11-01T08:00:00.000Z",
        hold_expires_at: "2026-11-01T08:15:00.000Z",
        payment_reported_at: "2026-11-01T08:05:00.000Z",
        review_expires_at: "2026-11-01T10:05:00.000Z",
      },
      pricing: {
        quotedTotal: 121564,
        depositRate: 0.3,
        depositAmount: 36469,
        balanceAmount: 85095,
        pricingBreakdown: { status: "resolved", total: 121564 },
      },
      payment: {
        enabled: true,
        method: "bank_transfer",
        status: "payment_review",
        serverNow: "2026-11-01T08:05:00.000Z",
        reviewExpiresAt: "2026-11-01T10:05:00.000Z",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await reportBookingBankTransfer({
      recoveryToken: "A".repeat(43),
      bankLast5: "12345",
      payerName: "Payment Tester",
      notes: "test note",
    });

    expect(result.request).toMatchObject({
      booking_reference: "5827319406",
      status: "payment_review",
      review_expires_at: "2026-11-01T10:05:00.000Z",
    });
    expect(result.pricing).toMatchObject({
      quotedTotal: 121564,
      depositAmount: 36469,
      balanceAmount: 85095,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/booking?action=report-payment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          recoveryToken: "A".repeat(43),
          bankLast5: "12345",
          payerName: "Payment Tester",
          notes: "test note",
        }),
      }),
    );
  });

  it("uses credentialed lookup/manage requests without persisting lookup credentials", async () => {
    const responseBody = {
      ok: true,
      requestId: "booking-management",
      booking: { bookingReference: "5827319406", statusLabel: "訂房已成立" },
      payment: { enabled: true, label: "訂金已確認" },
      cancellation: { statusLabel: "無取消申請" },
      actions: { canReportBankTransfer: false, canDirectCancel: false, canRequestCancellation: true },
    };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupBookingOrder({ bookingReference: "5827319406", contact: "guest@example.invalid" });
    await fetchBookingManageSession();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/booking?action=lookup", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ bookingReference: "5827319406", contact: "guest@example.invalid" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/booking?action=manage", expect.objectContaining({
      credentials: "include",
    }));
  });

  it("routes manage-page cancellation and payment reports through session-bound APIs", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await submitBookingCancellation({ reasonCode: "weather", reasonText: "天候因素" });
    await reportBookingManageBankTransfer({ bankLast5: "12345", payerName: "Tester", notes: "same payment view" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/booking?action=cancel", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ reasonCode: "weather", reasonText: "天候因素" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/booking?action=manage-report-payment", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ bankLast5: "12345", payerName: "Tester", notes: "same payment view" }),
    }));
  });
});
