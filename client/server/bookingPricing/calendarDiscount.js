export const calendarDiscountFields = [
  "weekday_discount_rate", "friday_discount_rate", "saturday_discount_rate", "holiday_discount_rate",
];

export function isValidCalendarDiscountRate(value) {
  return (typeof value === "number" || typeof value === "string")
    && /^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(String(value))
    && Number.isFinite(Number(value)) && Number(value) >= 0.01;
}

export function inheritsCalendarDiscount(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

// Amounts are calculated by bookingPricing; this resolver only chooses the DB rate.
export function resolveCalendarDiscount({ date, ruleSet, specialDate, requestedDayType }) {
  const daily = specialDate?.is_active === false ? null : specialDate;
  const hasConfig = calendarDiscountFields.some(field => Object.hasOwn(ruleSet, field));
  const override = daily?.calendar_discount_rate_override;
  // Compatibility for historical/injected rule sets. Live queries select all required columns.
  if (!hasConfig && inheritsCalendarDiscount(override)) return { ok: true, rate: 1, source: "legacy_no_calendar_discount" };
  if (!calendarDiscountFields.every(field => isValidCalendarDiscountRate(ruleSet[field]))) return { ok: false };
  if (!inheritsCalendarDiscount(override)) return isValidCalendarDiscountRate(override)
    ? { ok: true, rate: Number(override), source: "daily_override" } : { ok: false };
  let source;
  if (requestedDayType) source = requestedDayType;
  else if (daily?.day_type === "holiday") source = "holiday";
  else {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    source = day === 5 ? "friday" : day === 6 ? "saturday" : "weekday";
  }
  const rate = ruleSet[`${source}_discount_rate`];
  return isValidCalendarDiscountRate(rate) ? { ok: true, rate: Number(rate), source } : { ok: false };
}
