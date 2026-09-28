import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ flags: {}, inventory: null, data: null }));
vi.mock("./shopShared.js", () => ({ getServerEnv: n => state.flags[n] || "" }));
vi.mock("./bookingRoomInventory.js", () => ({
  roomInventoryEnabled: () => state.flags.BOOKING_ROOM_INVENTORY_ENABLED === "true",
  roomAvailability: vi.fn(async () => state.inventory),
}));
vi.mock("./bookingRoomPricing.js", () => ({
  roomPricingEnabled: () => state.flags.BOOKING_ROOM_PRICING_ENABLED === "true",
  loadRoomPricingData: vi.fn(async () => state.data),
}));
import { quoteRoomStay, pricedRoomAvailability, roomCheckoutEnabled, roomGuestCount } from "./bookingRoomCheckout.js";
const id = "00000000-0000-4000-8000-000000000360";
const period = "00000000-0000-4000-8000-000000000001";
const settings = { allowRoomBooking: true, allowVillaBooking: true };
const input = { roomId: id, checkIn: "2026-11-02", checkOut: "2026-11-04", adults: 4, children: 0, infants: 0 };
beforeEach(() => {
  state.flags = { BOOKING_ROOM_INVENTORY_ENABLED: "true", BOOKING_ROOM_PRICING_ENABLED: "true", BOOKING_ROOM_CHECKOUT_ENABLED: "true" };
  state.inventory = { roomBookingEnabled: true, villaBookable: true, availableRoomOptions: [{ roomId: id, code: "S360", publicName: "畫雲 S360" }] };
  state.data = {
    periods: [{ id: period, name: "TEST", is_active: true, effective_from: "2026-11-01", effective_to: "2027-12-31", deposit_rate: .3 }],
    rooms: [{ id, capacity: 4 }], settings: [{ rule_set_id: period, room_weekday_discount_rate: .8, room_weekend_discount_rate: .9 }],
    rates: [{ room_id: id, rule_set_id: period, weekday_base_price: 7400, friday_base_price: 8700, saturday_base_price: 10100 }],
    overrides: [], discounts: [],
  };
});
describe("room checkout shared pricing adapter", () => {
  it("uses approved room rates, existing night2 rounding and deposit rounding", async () => {
    const q = await quoteRoomStay(input, settings);
    expect(q.pricing.breakdown.map(n=>n.price)).toEqual([5920,5624]);
    expect(q.pricing).toMatchObject({ total:11544,depositAmount:3463,balanceAmount:8081,room:{code:"S360",capacity:4},stay_type:"room" });
    expect(q.pricing.breakdown[1]).toMatchObject({ base_price:7400,calendar_discount_rate:.8,stay_discount_rate:.95,final_nightly_price:5624 });
  });
  it.each(["BOOKING_ROOM_INVENTORY_ENABLED","BOOKING_ROOM_PRICING_ENABLED","BOOKING_ROOM_CHECKOUT_ENABLED"])("fails closed when %s is OFF", async flag => {
    state.flags[flag]="false";
    expect(roomCheckoutEnabled(settings)).toBe(false);
    await expect(quoteRoomStay(input,settings)).rejects.toMatchObject({code:"room_checkout_disabled"});
  });
  it("requires booking setting too",async()=>{
    await expect(quoteRoomStay(input,{...settings,allowRoomBooking:false})).rejects.toMatchObject({code:"room_checkout_disabled"});
  });
  it("capacity includes all guests, never uses front end eligibility",async()=>{
    await expect(quoteRoomStay({...input,children:1},settings)).rejects.toMatchObject({code:"room_capacity_exceeded"});
    state.data.rooms[0].capacity=null;
    await expect(quoteRoomStay(input,settings)).rejects.toMatchObject({code:"room_capacity_exceeded"});
  });
  it("rejects any OFF night and any room omitted by real inventory",async()=>{
    state.inventory.roomBookingEnabled=false;
    await expect(quoteRoomStay(input,settings)).rejects.toMatchObject({code:"room_booking_disabled"});
    state.inventory.roomBookingEnabled=true;state.inventory.availableRoomOptions=[];
    await expect(quoteRoomStay(input,settings)).rejects.toMatchObject({code:"room_unavailable"});
  });
  it("missing price fails closed without fallback substitution",async()=>{
    state.data.rates[0].weekday_base_price=null;
    await expect(quoteRoomStay(input,settings)).rejects.toMatchObject({code:"pricing_unavailable"});
  });
  it("availability reports no eligible first night price for oversized party",async()=>{
    const x=await pricedRoomAvailability(input.checkIn,input.checkOut,settings,5);
    expect(x).toMatchObject({roomBookable:false,firstNightFrom:null});
    expect(x.availableRoomOptions[0].guestCapacityEligible).toBe(false);
  });
  it("does not trust caller supplied money and copies immutable snapshot values",async()=>{
    const q=await quoteRoomStay({...input,price:1,total:1},settings);
    state.data.rates[0].weekday_base_price=9000;
    expect(q.pricing.total).toBe(11544);
    expect((await quoteRoomStay(input,settings)).pricing.total).toBe(14040);
  });
  it("preserves villa-compatible 11351 rounding",async()=>{
    Object.assign(state.data.rates[0],{weekday_base_price:3500,friday_base_price:4500,saturday_base_price:5500});
    const q=await quoteRoomStay({...input,checkIn:"2026-11-05",checkOut:"2026-11-08"},settings);
    expect(q.pricing).toMatchObject({total:11351,depositAmount:3405,balanceAmount:7946});
  });
  it("rejects unconfigured extras rather than silently dropping charges",async()=>{
    await expect(quoteRoomStay({...input,dogUnder10kgCount:1},settings)).rejects.toMatchObject({code:"room_addons_not_configured"});
    await expect(quoteRoomStay({...input,breakfastAddons:[{date:"2026-11-03",quantity:1}]},settings)).rejects.toMatchObject({code:"room_addons_not_configured"});
  });
  it.each([0,-1,1.5,"no",Infinity])("rejects invalid guest count %s",n=>expect(()=>roomGuestCount(n)).toThrow());
});
