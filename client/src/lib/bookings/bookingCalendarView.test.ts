import { describe, expect, it } from "vitest";
import {
  getBookingRangeIssue,
  isCalendarFilterMismatch,
  isBookableStayNight,
  normalizeBookingCalendarDay,
  type BookingCalendarDayView,
} from "./bookingCalendarView";
import type { BookingPublicSettings } from "./bookingApi";

const villaSettings: BookingPublicSettings = {
  bookingWindowMonths: 6,
  bookingWindowLabel: "6 個月",
  allowVillaBooking: true,
  allowRoomBooking: false,
  totalRoomCount: 5,
  allowPets: true,
};

function makeDay(date: string, saleMode: BookingCalendarDayView["saleMode"], isAvailable = true): BookingCalendarDayView {
  return {
    date,
    saleMode,
    isAvailable,
    remainingRooms: null,
    unavailableReason: isAvailable ? null : "unavailable",
  };
}

describe("booking calendar view helpers", () => {
  it("normalizes existing unavailableDates and global villa settings into a whole-house day", () => {
    const availableDay = normalizeBookingCalendarDay("2026-11-14", villaSettings, new Set());
    const unavailableDay = normalizeBookingCalendarDay("2026-11-15", villaSettings, new Set(["2026-11-15"]));

    expect(availableDay).toMatchObject({
      saleMode: "whole_house",
      isAvailable: true,
    });
    expect(unavailableDay).toMatchObject({
      saleMode: "whole_house",
      isAvailable: false,
      unavailableReason: "unavailable",
    });
  });

  it("supports future per-day room data and treats zero remaining rooms as unavailable", () => {
    const day = normalizeBookingCalendarDay("2026-11-15", villaSettings, new Set(), {
      date: "2026-11-15",
      sale_mode: "room",
      remaining_rooms: 0,
    });

    expect(day).toMatchObject({
      saleMode: "room",
      isAvailable: false,
      remainingRooms: 0,
    });
  });

  it("keeps dates in place but marks non-matching filter modes", () => {
    expect(isCalendarFilterMismatch(makeDay("2026-11-14", "room"), "whole_house")).toBe(true);
    expect(isCalendarFilterMismatch(makeDay("2026-11-14", "whole_house"), "whole_house")).toBe(false);
    expect(isCalendarFilterMismatch(makeDay("2026-11-14", "room"), "all")).toBe(false);
  });

  it("rejects stays that cross a different sale mode night", () => {
    const days = new Map([
      ["2026-11-14", makeDay("2026-11-14", "whole_house")],
      ["2026-11-15", makeDay("2026-11-15", "room")],
      ["2026-11-16", makeDay("2026-11-16", "whole_house")],
    ]);

    expect(
      getBookingRangeIssue({
        checkIn: "2026-11-14",
        checkOut: "2026-11-16",
        saleMode: "whole_house",
        minDate: "2026-11-01",
        maxDate: "2026-12-01",
        getDay: (date) => days.get(date) || makeDay(date, "closed", false),
      }),
    ).toBe("mode_mismatch");
  });

  it("does not count checkout date as a stay night", () => {
    const days = new Map([
      ["2026-11-14", makeDay("2026-11-14", "whole_house")],
      ["2026-11-15", makeDay("2026-11-15", "whole_house")],
      ["2026-11-16", makeDay("2026-11-16", "room")],
    ]);

    expect(
      getBookingRangeIssue({
        checkIn: "2026-11-14",
        checkOut: "2026-11-16",
        saleMode: "whole_house",
        minDate: "2026-11-01",
        maxDate: "2026-12-01",
        getDay: (date) => days.get(date) || makeDay(date, "closed", false),
      }),
    ).toBe("ok");
  });

  it("keeps dates before the minimum booking date unbookable and includes the boundary date", () => {
    expect(isBookableStayNight(makeDay("2026-10-31", "whole_house"), "2026-11-01", "2027-02-20")).toBe(false);
    expect(isBookableStayNight(makeDay("2026-11-01", "whole_house"), "2026-11-01", "2027-02-20")).toBe(true);
  });
});
