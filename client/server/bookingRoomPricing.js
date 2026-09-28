import { getServerEnv, supabaseRequest, supabaseRpc } from "./shopShared.js";
import { requireRoomInventory, roomDate } from "./bookingRoomInventory.js";
import { isValidBasePriceOverride } from "../src/lib/bookings/guestBasePricing.js";

export const roomPricingEnabled = () => getServerEnv("BOOKING_ROOM_PRICING_ENABLED") === "true";
function invalid(message) { throw Object.assign(new Error(message), { status: 400, code: "invalid_room_price" }); }
export function requireRoomPricing() {
  requireRoomInventory();
  if (!roomPricingEnabled()) throw Object.assign(new Error("Room pricing is not enabled."), { status: 503, code: "room_pricing_disabled" });
}
export function validateRoomPricePayload(body, daily = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("資料格式不正確。");
  const base = value => { if (value !== null && (typeof value !== "number" || !isValidBasePriceOverride(value))) invalid("原價須為 1～10,000,000 元的整數，或留空繼承。"); };
  const discount = value => { if (typeof value !== "number" || !Number.isFinite(value) || value < 0.01 || value > 1 || Math.abs(value * 10000 - Math.round(value * 10000)) > 1e-6) invalid("折扣須為 1～100%，最多兩位小數。"); };
  const uuid = id => { if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) invalid("房間或期間不正確。"); };
  const rows = daily ? body.bases : body.rates;
  if (!Array.isArray(rows) || rows.length > 6 || new Set(rows.map(r => r?.room_id)).size !== rows.length) invalid("房間資料不正確。");
  for (const row of rows) { uuid(row?.room_id); for (const key of daily ? ["base_price_override"] : ["weekday_base_price", "friday_base_price", "saturday_base_price"]) base(row[key]); }
  if (daily) {
    roomDate(body.date);
    if (Object.hasOwn(body, "discount") && body.discount !== null) discount(body.discount);
    if (Object.hasOwn(body, "salesMode") && body.salesMode !== null && typeof body.salesMode !== "boolean") invalid("單間模式不正確。");
  } else { uuid(body.ruleSetId); discount(body.weekdayDiscount); discount(body.weekendDiscount); }
  return body;
}
export async function loadRoomPricingData(from, to) {
  requireRoomPricing(); roomDate(from); roomDate(to);
  if (from > to || (Date.parse(to)-Date.parse(from))/86400000 > 366) invalid("日期範圍不正確。");
  const range = `stay_date=gte.${from}&stay_date=lte.${to}`;
  return {
    periods: await supabaseRequest("/booking_price_rule_sets?select=*&order=effective_from"),
    rooms: await supabaseRequest("/booking_rooms?is_active=eq.true&is_sellable=eq.true&select=*&order=sort_order"),
    settings: await supabaseRequest("/booking_room_pricing_settings?select=*"),
    rates: await supabaseRequest("/booking_room_rates?select=*"),
    overrides: await readAll(`/booking_room_price_overrides?${range}&select=*&order=stay_date,room_id`),
    discounts: await readAll(`/booking_room_discount_dates?${range}&select=*&order=stay_date`),
    sales: await supabaseRequest(`/booking_room_sales_dates?date=gte.${from}&date=lte.${to}&select=*`),
  };
}
async function readAll(path) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await supabaseRequest(`${path}&limit=500&offset=${offset}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw new Error("Room pricing result too large");
}
export async function saveRoomPricing(body, daily = false) {
  requireRoomPricing(); validateRoomPricePayload(body, daily);
  await supabaseRpc(daily ? "save_booking_room_price_day" : "save_booking_room_price_defaults", { p_payload: body });
}
