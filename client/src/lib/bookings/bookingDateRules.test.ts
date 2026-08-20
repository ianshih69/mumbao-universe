import { describe, expect, it } from "vitest";
import {
  MIN_BOOKING_DATE,
  createDefaultBookingDateRange,
  resolveBookingDraftDateRange,
  resolveEarliestBookingDate,
} from "./bookingDateRules";
import type { BookingDateRange } from "./bookingDateRules";

describe("booking date rules", () => {
  it("uses the launch date while today is before the minimum booking date", () => {
    expect(MIN_BOOKING_DATE).toBe("2026-11-01");
    expect(resolveEarliestBookingDate("2026-08-20")).toBe("2026-11-01");
    expect(createDefaultBookingDateRange("2026-08-20")).toEqual({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
    });
  });

  it("uses today and tomorrow once today reaches the minimum booking date", () => {
    expect(resolveEarliestBookingDate("2026-11-01")).toBe("2026-11-01");
    expect(createDefaultBookingDateRange("2026-11-05")).toEqual({
      check_in: "2026-11-05",
      check_out: "2026-11-06",
    });
  });

  it("does not restore a draft range before the minimum booking date", () => {
    const draft: BookingDateRange = { check_in: "2026-08-20", check_out: "2026-08-21" };
    const fallback: BookingDateRange = { check_in: "2026-11-01", check_out: "2026-11-02" };

    expect(resolveBookingDraftDateRange(draft, fallback)).toEqual({
      draft: fallback,
      adjusted: true,
    });
  });

  it("repairs an invalid checkout while preserving a valid check-in", () => {
    const fallback: BookingDateRange = { check_in: "2026-11-01", check_out: "2026-11-02" };

    expect(resolveBookingDraftDateRange({ check_in: "2026-11-05", check_out: "2026-11-05" }, fallback)).toEqual({
      draft: { check_in: "2026-11-05", check_out: "2026-11-06" },
      adjusted: true,
    });
  });
});
