import { isValidBasePriceOverride } from "./guestBasePricing.js";
import type { BookingSpecialDate } from "./adminBookingsApi";

export function pricingMonths(from: string, to: string) {
  const first = from.slice(0, 7);
  const last = to.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(first) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(last) || first > last) return [];
  const ordinal = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
  return Array.from({ length: ordinal(last) - ordinal(first) + 1 }, (_, offset) => {
    const value = ordinal(first) + offset;
    return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, "0")}`;
  });
}

export function selectPricingMonth(months: string[], selected?: string, now = new Date()) {
  if (selected && months.includes(selected)) return selected;
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).formatToParts(now);
  const current = `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
  return months.includes(current) ? current : months[0] || "";
}

export function discountLabel(rate: number) {
  return rate === 1 ? "不打折" : `${Number((rate * 10).toFixed(3))} 折`;
}

export function readCalendarInputs(base: string, percent: string) {
  if (!base.trim() || !isValidBasePriceOverride(base)) throw new Error("原價須為 1～10,000,000 元的整數。");
  if (!/^\d+(?:\.\d{1,2})?$/.test(percent) || Number(percent) < 1 || Number(percent) > 100) {
    throw new Error("折扣須為 1～100%，最多兩位小數。");
  }
  return { base: Number(base), rate: Number((Number(percent) / 100).toFixed(4)) };
}

export type CalendarEdit = {
  row: BookingSpecialDate;
  initialBase: number;
  initialRate: number;
  defaultBase: number;
  defaultRate: number;
  base: string;
  percent: string;
  restoring: boolean;
};

export function calendarEditPayload(edit: CalendarEdit): BookingSpecialDate {
  const { base, rate } = readCalendarInputs(edit.base, edit.percent);
  return {
    ...edit.row,
    base_price_override: edit.restoring
      ? base === edit.defaultBase ? null : base
      : base === edit.initialBase ? edit.row.base_price_override ?? null : base,
    calendar_discount_rate_override: edit.restoring
      ? rate === edit.defaultRate ? null : rate
      : rate === edit.initialRate ? edit.row.calendar_discount_rate_override ?? null : rate,
  };
}
