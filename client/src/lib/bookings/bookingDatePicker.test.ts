import { describe, expect, it } from "vitest";
import { calculateBookingQuote } from "../../../server/bookingPricing/index.js";
import { bookingMonthDates, calendarQuoteRanges, canSelectBookingDate, firstNightDisplayPrice, selectBookingDate, shiftBookingMonth, type CalendarBounds, type DateSelection } from "./bookingDatePicker";
import type { BookingPricingBreakdownNight } from "./bookingApi";

const bounds: CalendarBounds = {
  minDate: "2026-11-01", maxDate: "2027-02-01",
  getDay: date => ({ date, saleMode: "whole_house", isAvailable: date !== "2026-11-10", remainingRooms: null, unavailableReason: null }),
};
const empty: DateSelection = { checkIn: "", checkOut: "", stayType: "villa" };

describe("booking date picker selections", () => {
  it("can change a room draft to villa dates using backend availability without mixing stay modes", () => {
    const both = { ...bounds, allowModeSelection: true, getDay: (date: string) => ({ ...bounds.getDay(date), villaBookable: true, roomBookable: date < "2026-11-06" }) };
    const room: DateSelection = { checkIn: "2026-11-02", checkOut: "2026-11-04", stayType: "room" };
    const friday = selectBookingDate("2026-11-06", room, false, both);
    expect(friday).toEqual({ checkIn: "2026-11-06", checkOut: "", stayType: "villa" });
    expect(selectBookingDate("2026-11-07", friday, true, both).stayType).toBe("villa");
    expect(selectBookingDate("2026-11-07", { ...room, checkIn: "2026-11-05", checkOut: "" }, true, both).stayType).toBe("villa");
  });
  it("moves one month and crosses years without carrying a day", () => {
    expect(shiftBookingMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftBookingMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftBookingMonth("2026-11", 1)).toBe("2026-12");
    expect(bookingMonthDates("2027-02").filter(Boolean)).toHaveLength(28);
    expect(bookingMonthDates("2028-02").filter(Boolean)).toHaveLength(29);
    expect(bookingMonthDates("2026-11")[0]).toBe("2026-11-01");
  });
  it("selects a range as a draft without mutating the original", () => {
    const start = selectBookingDate("2026-11-02", empty, false, bounds);
    const end = selectBookingDate("2026-11-04", start, true, bounds);
    expect(end).toEqual({ checkIn: "2026-11-02", checkOut: "2026-11-04", stayType: "villa" });
    expect(empty).toEqual({ checkIn: "", checkOut: "", stayType: "villa" });
  });
  it.each(["2026-11-01", "2026-11-02"])("restarts check-in for earlier/equal %s", date => {
    expect(selectBookingDate(date, { ...empty, checkIn: "2026-11-02" }, true, bounds)).toEqual({ ...empty, checkIn: date });
  });
  it("rejects blocked nights and crossing a blocked night but allows checkout on it", () => {
    expect(selectBookingDate("2026-11-10", empty, false, bounds)).toBe(empty);
    const start = { ...empty, checkIn: "2026-11-09" };
    expect(selectBookingDate("2026-11-11", start, true, bounds)).toBe(start);
    expect(selectBookingDate("2026-11-10", start, true, bounds).checkOut).toBe("2026-11-10");
  });
  it("keeps availability modes and booking-window bounds authoritative", () => {
    const mixed: CalendarBounds = { ...bounds, getDay: date => ({ ...bounds.getDay(date), saleMode: date >= "2026-11-05" ? "room" : "whole_house" }) };
    expect(canSelectBookingDate("2026-11-06", { ...empty, checkIn: "2026-11-02" }, true, mixed)).toBe(false);
    expect(canSelectBookingDate("2026-10-31", empty, false, bounds)).toBe(false);
    expect(canSelectBookingDate("2027-02-01", empty, false, bounds)).toBe(false);
    expect(canSelectBookingDate("2027-02-01", { ...empty, checkIn: "2027-01-31" }, true, bounds)).toBe(true);
  });
  it("groups available same-mode nights without quoting blocked nights or beyond checkout limits", () => {
    expect(calendarQuoteRanges("2026-11", bounds)).toEqual([
      { checkIn: "2026-11-01", checkOut: "2026-11-10", stayType: "villa" },
      { checkIn: "2026-11-11", checkOut: "2026-12-01", stayType: "villa" },
    ]);
    expect(calendarQuoteRanges("2027-02", bounds)).toEqual([]);
  });
  it("does not invent a price when server components are missing", () => {
    expect(firstNightDisplayPrice({ price: 23750 } as BookingPricingBreakdownNight)).toBeNull();
  });
});

describe("calendar prices use the existing server engine", () => {
  const rule = { id: "synthetic", name: "Synthetic", effective_from: "2026-11-01", effective_to: "2027-02-01", is_active: true, deposit_rate: 0.3, guest_11_18_fee: 1250, weekday_discount_rate: 0.8, friday_discount_rate: 0.9, saturday_discount_rate: 0.9, holiday_discount_rate: 1 };
  const request = async (path: string) => {
    const url = new URL(path, "https://example.test");
    if (url.pathname === "/booking_price_rule_sets") return [rule];
    if (url.pathname === "/booking_special_dates") return [];
    if (url.pathname === "/booking_package_rates") return [{ nightly_price: ({ weekday: 25000, friday: 32000, holiday: 39000 } as Record<string, number>)[url.searchParams.get("day_type")!.slice(3)] }];
    throw new Error(`Unexpected fixture query ${url.pathname}`);
  };
  const quote = (adults = 15, extras = {}) => calculateBookingQuote({ checkIn: "2026-11-02", checkOut: "2026-11-04", adults, ...extras }, { supabaseRequest: request });
  it("shows both cells at 25000 while the two-night summary remains 48750", async () => {
    const result = await quote();
    expect(result.pricing.breakdown.map(firstNightDisplayPrice)).toEqual([25000, 25000]);
    expect(result.pricing.breakdown.map((night: BookingPricingBreakdownNight) => night.price)).toEqual([25000, 23750]);
    expect(result.pricing.total).toBe(48750);
  });
  it("updates party pricing and retains undiscouted child/pet server amounts for cells", async () => {
    expect((await quote(10)).pricing.breakdown.map(firstNightDisplayPrice)).toEqual([20000, 20000]);
    const result = await quote(15, { children: 1, dog10To20kgCount: 1 });
    expect(result.pricing.breakdown.map(firstNightDisplayPrice)).toEqual([26300, 26300]);
    for (const night of result.pricing.breakdown) {
      const oneNight = await quote(15, { checkIn: night.date, checkOut: new Date(Date.parse(night.date) + 86400000).toISOString().slice(0, 10), children: 1, dog10To20kgCount: 1 });
      expect(firstNightDisplayPrice(night)).toBe(oneNight.pricing.total);
    }
  });
});
