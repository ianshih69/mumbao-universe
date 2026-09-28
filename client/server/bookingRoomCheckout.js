import { getServerEnv } from "./shopShared.js";
import { roomInventoryEnabled, roomAvailability } from "./bookingRoomInventory.js";
import { roomPricingEnabled, loadRoomPricingData } from "./bookingRoomPricing.js";
import { priceAvailableRooms, roundMoney } from "./bookingPricing/roomPricing.js";

export function roomCheckoutEnabled(settings) {
  return roomInventoryEnabled() && roomPricingEnabled()
    && getServerEnv("BOOKING_ROOM_CHECKOUT_ENABLED") === "true"
    && settings.allowRoomBooking === true;
}
function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}
export function roomGuestCount(value, fallback = 2) {
  const count = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 30) fail(400, "invalid_guest_count", "入住人數不正確。");
  return count;
}
export async function pricedRoomAvailability(checkIn, checkOut, settings, guestCount = 2) {
  const inventory = await roomAvailability(checkIn, checkOut, settings.allowVillaBooking);
  const data = await loadRoomPricingData(checkIn, checkOut);
  const result = priceAvailableRooms(data, inventory, checkIn, checkOut, guestCount);
  const eligible = result.availableRoomOptions.filter(r => r.guestCapacityEligible && r.pricingStatus === "configured");
  return { ...result, roomCheckoutEnabled: roomCheckoutEnabled(settings),
    roomBookable: inventory.roomBookingEnabled && eligible.length > 0,
    firstNightFrom: inventory.roomBookingEnabled && eligible.length ? Math.min(...eligible.map(r => r.pricingBreakdown.breakdown[0].finalNightPrice)) : null };
}
export async function quoteRoomStay(input, settings) {
  if (!roomCheckoutEnabled(settings)) fail(403, "room_checkout_disabled", "單間訂房尚未開放。");
  const { checkIn, checkOut, adults, children, infants, roomId } = input;
  const guestCount = roomGuestCount(adults + children + infants);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId || "")) {
    fail(400, "invalid_room_id", "請選擇一間可入住的房間。");
  }
  // Phase 3 has no room add-on tariffs. Never silently drop a charge.
  let breakfast = input.breakfastAddons;
  if (typeof breakfast === "string") { try { breakfast = JSON.parse(breakfast); } catch { fail(400, "invalid_breakfast_addon", "加購資料不正確。"); } }
  if (input.hasPets || input.dogUnder10kgCount || input.dog10To20kgCount || input.dogOver20kgCount
    || (Array.isArray(breakfast) ? breakfast.some(x => Number(x?.quantity) !== 0) : breakfast != null && breakfast !== "")) {
    fail(400, "room_addons_not_configured", "單間加購尚未開放。");
  }
  const inventory = await roomAvailability(checkIn, checkOut, settings.allowVillaBooking);
  if (!inventory.roomBookingEnabled) fail(409, "room_booking_disabled", "此住宿期間僅開放包棟。");
  const data = await loadRoomPricingData(checkIn, checkOut);
  const result = priceAvailableRooms(data, inventory, checkIn, checkOut, guestCount);
  const option = result.availableRoomOptions.find(r => r.roomId === roomId);
  if (!option) fail(409, "room_unavailable", "此房間目前無法預約，請重新選擇。");
  if (!option.guestCapacityEligible) fail(400, "room_capacity_exceeded", "入住人數超過此房可住人數。");
  if (option.pricingStatus !== "configured") fail(409, "pricing_unavailable", "目前無法取得此房間的房價。");
  const snapshot = option.pricingBreakdown;
  const periods = [...new Set(snapshot.breakdown.map(n => n.ruleSetId))].map(id => data.periods.find(p => p.id === id));
  const rates = [...new Set(periods.map(p => Number(p?.deposit_rate)))];
  if (rates.length !== 1 || !Number.isFinite(rates[0]) || rates[0] <= 0 || rates[0] > 1) fail(409, "pricing_unavailable", "訂金設定不一致，請聯絡我們。");
  const total = snapshot.total;
  const depositRate = rates[0];
  const depositAmount = roundMoney(total * depositRate);
  const room = { roomId, code: option.code, publicName: option.publicName, capacity: option.capacity };
  const breakdown = snapshot.breakdown.map(n => ({ ...n,
    base_price: n.basePrice, calendar_discount_rate: n.calendarDiscountRate,
    price_after_calendar_discount: n.priceAfterCalendarDiscount, stay_discount_rate: n.stayDiscountRate,
    final_nightly_price: n.finalNightPrice, price: n.finalNightPrice,
    dayType: new Date(n.date + "T00:00:00Z").getUTCDay() === 6 ? "holiday" : new Date(n.date + "T00:00:00Z").getUTCDay() === 5 ? "friday" : "weekday",
    dayTypeLabel: "單間", ruleSetName: data.periods.find(p => p.id === n.ruleSetId)?.name,
  }));
  return { status: "resolved", checkIn, checkOut, stayType: "room", adults, children, infants, guestCount,
    pricingGuestCount: guestCount, packageType: null, packageLabel: "單間住宿", nights: snapshot.nights,
    pricing: { status: "resolved", version: 1, stayType: "room", stay_type: "room", room,
      room_id: roomId, room_code: room.code, room_name: room.publicName, capacity: room.capacity,
      ruleSetId: periods[0].id, ruleSetName: periods[0].name,
      ruleSets: periods.map(p => ({ id: p.id, name: p.name, effectiveFrom: p.effective_from, effectiveTo: p.effective_to, depositRate: Number(p.deposit_rate) })),
      breakdown, subtotal: total, total, lodgingSubtotal: total, depositRate, depositAmount, balanceAmount: total - depositAmount,
      adultCount: adults, childCount: children, infantCount: infants, actualGuestCount: guestCount,
      childFeeTotal: 0, petFeeTotal: 0, breakfastAddonTotal: 0,
    },
  };
}
