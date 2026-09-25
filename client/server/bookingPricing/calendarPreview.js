import { addDays, calculateBookingQuote, daysBetween } from "./index.js";

// Draft-only adapter: uses the official quote engine without persisting draft prices.
export async function calculatePricingCalendarPreview({ month, ruleSet, rates, specialDates }) {
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const days = [];
  const readDraft = async path => {
    const u = new URL(path, "https://pricing-preview.invalid");
    if (u.pathname === "/booking_special_dates") return specialDates.filter(s => s.is_active && s.date === u.searchParams.get("date").slice(3));
    if (u.pathname === "/booking_package_rates") return rates.filter(r => r.is_active && r.guest_count === Number(u.searchParams.get("guest_count").slice(3)) && r.day_type === u.searchParams.get("day_type").slice(3));
    throw new Error("Unexpected calendar draft query");
  };
  for (let i = 0; i < daysBetween(start, end); i += 1) {
    const date = addDays(start, i);
    if (!ruleSet.is_active || date < ruleSet.effective_from || date > ruleSet.effective_to) {
      days.push({ date, status: "unavailable", reason: "outside_active_rule_set" });
      continue;
    }
    const quote = await calculateBookingQuote({ checkIn: date, checkOut: addDays(date, 1), adults: 10 }, { ruleSetOverride: ruleSet, supabaseRequest: readDraft });
    days.push(quote.pricing.status === "resolved"
      ? { date, status: "resolved", night: quote.pricing.breakdown[0] }
      : { date, status: "unavailable", reason: quote.pricing.reason });
  }
  return { month, startWeekday: new Date(`${start}T00:00:00Z`).getUTCDay(), days };
}
