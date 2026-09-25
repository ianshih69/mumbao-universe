import { isValidBasePriceOverride } from "./guestBasePricing.js";
import type { BookingSpecialDate } from "./adminBookingsApi";

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
