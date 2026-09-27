import type { BookingPricingBreakdownNight, StayType } from "./bookingApi";
import { addCalendarDays, getBookingRangeIssue, isBookableStayNight, saleModeToStayType, stayTypeToSaleMode, type BookingCalendarDayView } from "./bookingCalendarView";

export type DateSelection = { checkIn: string; checkOut: string; stayType: StayType };
export type CalendarBounds = { minDate: string; maxDate: string; getDay: (date: string) => BookingCalendarDayView };

export function shiftBookingMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function bookingMonthDates(month: string): Array<string | null> {
  const first = `${month}-01`;
  const next = `${shiftBookingMonth(month, 1)}-01`;
  const days: Array<string | null> = Array(new Date(`${first}T00:00:00Z`).getUTCDay()).fill(null);
  for (let date = first; date < next; date = addCalendarDays(date, 1)) days.push(date);
  while (days.length < 42) days.push(null);
  return days;
}

export function canSelectBookingDate(date: string, selection: DateSelection, selectingCheckout: boolean, bounds: CalendarBounds) {
  if (date < bounds.minDate || date > bounds.maxDate) return false;
  if (selectingCheckout && selection.checkIn && date > selection.checkIn) {
    return getBookingRangeIssue({ ...bounds, checkIn: selection.checkIn, checkOut: date, saleMode: stayTypeToSaleMode(selection.stayType) }) === "ok";
  }
  return date < bounds.maxDate && isBookableStayNight(bounds.getDay(date), bounds.minDate, bounds.maxDate);
}

export function selectBookingDate(date: string, selection: DateSelection, selectingCheckout: boolean, bounds: CalendarBounds): DateSelection {
  if (!canSelectBookingDate(date, selection, selectingCheckout, bounds)) return selection;
  if (selectingCheckout && selection.checkIn && date > selection.checkIn) return { ...selection, checkOut: date };
  return { checkIn: date, checkOut: "", stayType: saleModeToStayType(bounds.getDay(date).saleMode) || selection.stayType };
}

export function firstNightDisplayPrice(night: BookingPricingBreakdownNight): number | null {
  // Display server-calculated components before consecutive-stay discounts; no rates are calculated here.
  const amounts = [night.priceAfterCalendarDiscount, night.childFeeOriginalAmount, night.petFeeOriginalAmount];
  if (amounts.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null;
  return (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
}

export function formatCalendarPrice(amount: number) {
  return amount >= 10_000 ? `${Number((amount / 10_000).toFixed(2))}萬` : amount.toLocaleString("zh-TW");
}

export function calendarQuoteRanges(month: string, bounds: CalendarBounds) {
  const ranges: DateSelection[] = [];
  for (const date of bookingMonthDates(month)) {
    if (!date || date >= bounds.maxDate || !isBookableStayNight(bounds.getDay(date), bounds.minDate, bounds.maxDate)) continue;
    const stayType = saleModeToStayType(bounds.getDay(date).saleMode);
    if (!stayType) continue;
    const last = ranges[ranges.length - 1];
    if (last?.checkOut === date && last.stayType === stayType) last.checkOut = addCalendarDays(date, 1);
    else ranges.push({ checkIn: date, checkOut: addCalendarDays(date, 1), stayType });
  }
  return ranges;
}
