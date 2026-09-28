import { getServerEnv, supabaseRpc, supabaseRequest } from "./shopShared.js";

// Backend rollout is separate from public room checkout, which stays disabled.
export function roomInventoryEnabled() {
  return getServerEnv("BOOKING_ROOM_INVENTORY_ENABLED") === "true";
}
export function requireRoomInventory() {
  if (!roomInventoryEnabled()) throw Object.assign(new Error("Room inventory is not enabled."), { status: 503, code: "room_inventory_disabled" });
}
export function roomDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) {
    throw Object.assign(new Error("日期不正確。"), { status: 400, code: "invalid_date" });
  }
  return value;
}
export const nextRoomDate = date => new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
export async function roomCalendar(from, to, villaEnabled) {
  requireRoomInventory();
  roomDate(from); roomDate(to);
  if (from >= to) return [];
  const days = await supabaseRpc("get_booking_inventory_calendar", { p_from: from, p_to: to });
  if (!Array.isArray(days) || days.some(day => typeof day.roomBookable !== "boolean" || typeof day.villaBookable !== "boolean")) {
    throw Object.assign(new Error("Invalid inventory calendar."), { status: 503, code: "invalid_room_inventory" });
  }
  return days.map(day => ({ ...day, villaBookingEnabled: villaEnabled, villaBookable: villaEnabled && day.villaBookable }));
}
export async function roomAvailability(checkIn, checkOut, villaEnabled = true) {
  requireRoomInventory();
  roomDate(checkIn); roomDate(checkOut);
  if (checkOut <= checkIn || (Date.parse(checkOut)-Date.parse(checkIn))/86400000 > 366) {
    throw Object.assign(new Error("住宿日期範圍不正確。"), { status: 400, code: "invalid_date_range" });
  }
  const result = await supabaseRpc("get_booking_room_availability", { p_check_in: checkIn, p_check_out: checkOut });
  if (!result || !Array.isArray(result.availableRoomOptions) || typeof result.roomBookable !== "boolean"
    || typeof result.villaBookable !== "boolean" || typeof result.roomBookingEnabled !== "boolean") {
    throw Object.assign(new Error("Room inventory returned an invalid response."), { status: 503, code: "invalid_room_inventory" });
  }
  return { ...result, checkIn, checkOut, villaBookingEnabled: villaEnabled,
    villaBookable: villaEnabled && result.villaBookable, roomCheckoutEnabled: false };
}
export async function roomSalesDate(date) {
  roomDate(date);
  const rows = await supabaseRequest(`/booking_room_sales_dates?date=eq.${date}&select=date,room_booking_enabled_override`);
  const override = rows?.[0]?.room_booking_enabled_override ?? null;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, roomBookingEnabledOverride: override, roomBookingEnabled: override ?? ![5,6].includes(weekday) };
}
