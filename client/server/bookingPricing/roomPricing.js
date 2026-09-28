import { addDays, normalizeIsoDate, daysBetween, roundMoney, consecutiveStayDiscountRate } from "./index.js";
export { roundMoney } from "./index.js";

export function roomBaseField(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 6 ? "saturday_base_price" : day === 5 ? "friday_base_price" : "weekday_base_price";
}
export function roomNight(data, roomId, date, nightIndex = 0) {
  if (!normalizeIsoDate(date)) return null;
  const periods = data.periods.filter(p => p.is_active && p.effective_from <= date && p.effective_to >= date);
  if (periods.length !== 1) return null;
  const period = periods[0];
  const settings = data.settings.find(s => s.rule_set_id === period.id);
  const rate = data.rates.find(r => r.rule_set_id === period.id && r.room_id === roomId);
  const baseOverride = data.overrides.find(r => r.room_id === roomId && r.stay_date === date)?.base_price_override ?? null;
  const discountOverride = data.discounts.find(r => r.stay_date === date)?.room_discount_rate_override ?? null;
  const defaultBase = rate?.[roomBaseField(date)] ?? null;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const defaultDiscount = settings?.[day === 5 || day === 6 ? "room_weekend_discount_rate" : "room_weekday_discount_rate"] ?? null;
  const base = baseOverride ?? defaultBase;
  const discount = discountOverride ?? defaultDiscount;
  const configured = Number.isInteger(base) && base > 0 && base <= 10000000
    && typeof discount === "number" && Number.isFinite(discount) && discount >= 0.01 && discount <= 1;
  const stayDiscount = nightIndex > 0 ? consecutiveStayDiscountRate : 1;
  const afterCalendar = configured ? roundMoney(base * discount) : null;
  return { date, ruleSetId: period.id, basePrice: base, defaultBase, baseOverride,
    calendarDiscountRate: discount, defaultDiscount, discountOverride, stayDiscountRate: stayDiscount,
    priceAfterCalendarDiscount: afterCalendar,
    finalNightPrice: configured ? roundMoney(afterCalendar * stayDiscount) : null,
    pricingStatus: configured ? "configured" : "not_configured" };
}

// Inventory chooses the room list before pricing. Never substitute a missing-price room.
export function priceAvailableRooms(data, inventory, checkIn, checkOut, guestCount = 2) {
  const nights = normalizeIsoDate(checkIn) && normalizeIsoDate(checkOut) ? daysBetween(checkIn, checkOut) : 0;
  if (nights < 1 || nights > 366) throw new Error("invalid_room_pricing_dates");
  const availableRoomOptions = inventory.availableRoomOptions.map(room => {
    const capacity = data.rooms?.find(r => r.id === room.roomId)?.capacity ?? room.capacity ?? null;
    const guestCapacityEligible = Number.isInteger(capacity) && capacity > 0
      && Number.isInteger(guestCount) && guestCount > 0 && guestCount <= capacity;
    const breakdown = Array.from({ length: nights }, (_, i) => roomNight(data, room.roomId, addDays(checkIn, i), i));
    const configured = breakdown.every(n => n?.pricingStatus === "configured");
    const snapshot = configured ? { version: 1, stayType: "room", roomId: room.roomId, roomCode: room.code,
      checkIn, checkOut, nights, breakdown, total: breakdown.reduce((sum, n) => sum + n.finalNightPrice, 0) } : null;
    return { ...room, capacity, guestCapacityEligible, nights, pricingStatus: configured ? "configured" : "not_configured",
      price: snapshot?.total ?? null, pricingBreakdown: snapshot };
  });
  const priced = availableRoomOptions.filter(r => r.pricingStatus === "configured");
  return { ...inventory, availableRoomOptions, roomCheckoutEnabled: false,
    pricingStatus: availableRoomOptions.length > 0 && priced.length === availableRoomOptions.length ? "configured" : "not_configured",
    firstNightFrom: inventory.roomBookingEnabled && priced.length ? Math.min(...priced.map(r => r.pricingBreakdown.breakdown[0].finalNightPrice)) : null };
}
