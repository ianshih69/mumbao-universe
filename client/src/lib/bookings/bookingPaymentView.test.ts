import { describe, expect, it } from "vitest";
import {
  bookingPaymentRemainingSeconds,
  createBookingPaymentClockSync,
  formatBookingPaymentCountdown,
} from "./bookingPaymentView";

describe("booking payment deadline display", () => {
  it("uses server time plus elapsed client time without creating a new deadline", () => {
    const receivedAtMs = Date.parse("2026-09-01T04:00:00.000Z");
    const clockSync = createBookingPaymentClockSync("2026-09-01T04:00:00.000Z", receivedAtMs);

    expect(bookingPaymentRemainingSeconds({
      deadline: "2026-09-01T04:15:00.000Z",
      clockSync,
      currentTimeMs: receivedAtMs,
    })).toBe(900);
    expect(bookingPaymentRemainingSeconds({
      deadline: "2026-09-01T04:15:00.000Z",
      clockSync,
      currentTimeMs: receivedAtMs + 5 * 60 * 1000,
    })).toBe(600);
  });

  it("keeps the cached server receive time across F5 instead of resetting the duration", () => {
    const refreshedAtMs = Date.parse("2026-09-01T04:05:00.000Z");
    const recoveredClock = createBookingPaymentClockSync("2026-09-01T04:05:00.000Z", refreshedAtMs);

    expect(bookingPaymentRemainingSeconds({
      deadline: "2026-09-01T04:15:00.000Z",
      clockSync: recoveredClock,
      currentTimeMs: refreshedAtMs,
    })).toBe(600);
  });

  it("clamps expired or invalid deadlines and formats MM:SS", () => {
    const nowMs = Date.parse("2026-09-01T04:16:00.000Z");
    expect(bookingPaymentRemainingSeconds({
      deadline: "2026-09-01T04:15:00.000Z",
      clockSync: null,
      currentTimeMs: nowMs,
    })).toBe(0);
    expect(bookingPaymentRemainingSeconds({ deadline: null, clockSync: null, currentTimeMs: nowMs })).toBe(0);
    expect(formatBookingPaymentCountdown(899)).toBe("14:59");
    expect(formatBookingPaymentCountdown(-1)).toBe("00:00");
  });
});
