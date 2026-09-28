import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../server/shopShared.js", async original => ({
  ...await original(), supabaseRequest: vi.fn(), supabaseRpc: vi.fn(), readBody: vi.fn(req=>req.body),
}));
vi.mock("../../server/bookingManagement.js", async original => ({
  ...await original(), createManagementSessionForBooking: vi.fn(),
}));
import { supabaseRequest, supabaseRpc } from "../../server/shopShared.js";
import handler from "../../api/booking.js";
const roomId="00000000-0000-4000-8000-000000000521";
const period="00000000-0000-4000-8000-000000000001";
let stored, inventory, enabled, capacity, base, conflict;
const stay={stay_type:"room",room_id:roomId,check_in:"2026-11-02",check_out:"2026-11-04",adults:2,children:0,infants:0,
 guest_name:"TEST Phase3",email:"phase3@example.invalid",client_request_id:"00000000-0000-4000-8000-000000001111"};
async function call(action,body={}) {
 const res={statusCode:0,setHeader(){},end(t){this.payload=JSON.parse(t);}};
 await handler({method:action==="request"?"POST":"GET",query:{action,...(action!=="request"?body:{})},body,headers:{}},res);
 return res;
}
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-28T04:00:00Z"));
 for(const name of ["BOOKING_ROOM_INVENTORY_ENABLED","BOOKING_ROOM_PRICING_ENABLED","BOOKING_ROOM_CHECKOUT_ENABLED"])vi.stubEnv(name,"true");
 vi.stubGlobal("fetch",vi.fn(()=>{throw Error("External requests forbidden");}));
 stored=null;enabled=true;capacity=2;base=4900;conflict=false;
 inventory={roomBookingEnabled:true,villaBookable:true,roomBookable:true,availableRoomOptions:[{roomId,code:"S521",publicName:"雲心 S521"}]};
 supabaseRequest.mockImplementation(async(path,options)=>{
   if(path.startsWith("/booking_settings"))return[{allow_room_booking:enabled,allow_villa_booking:true,booking_window_months:6}];
   if(path.startsWith("/booking_price_rule_sets"))return[{id:period,is_active:true,effective_from:"2026-11-01",effective_to:"2027-12-31",deposit_rate:.3}];
   if(path.startsWith("/booking_rooms"))return[{id:roomId,capacity}];
   if(path.startsWith("/booking_room_pricing_settings"))return[{rule_set_id:period,room_weekday_discount_rate:.8,room_weekend_discount_rate:.9}];
   if(path.startsWith("/booking_room_rates"))return[{room_id:roomId,rule_set_id:period,weekday_base_price:base,friday_base_price:5900,saturday_base_price:6900}];
   if(["/booking_room_price_overrides","/booking_room_discount_dates","/booking_room_sales_dates"].some(x=>path.startsWith(x)))return[];
   if(path==="/booking_availability_alerts"&&options?.method==="POST")return[];
   throw Error("Unexpected test query "+path);
 });
 supabaseRpc.mockImplementation(async(name,args)=>{
   if(name==="get_booking_room_availability")return inventory;
   if(name==="get_public_booking_unavailable_ranges")return[];
   if(name==="get_booking_inventory_calendar")return["2026-11-02","2026-11-03"].map(date=>({...inventory,date}));
   if(name==="acquire_room_booking_hold"){
     if(conflict)return{ok:false,code:"room_unavailable"};
     if(stored?.client_request_id===args.p_request.client_request_id)return{ok:false,code:"duplicate_booking_request"};
     stored=structuredClone(args.p_request);
     return{ok:true,request:{id:"synthetic-only",status:"payment_hold",hold_expires_at:"2026-09-28T04:15:00Z"}};
   }
   throw Error("Unexpected test RPC "+name);
 });
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("actual room message-free booking handler",()=>{
 it.each(["settings", "inventory", "pricing", "checkout"])("public room UI fails closed when %s is off",async gate=>{
   if(gate === "settings") enabled=false;
   else vi.stubEnv(`BOOKING_ROOM_${gate.toUpperCase()}_ENABLED`,"false");
   const calendar=await call("calendar",{from:"2026-11-02",guestCount:2});
   expect(calendar.statusCode).toBe(200);
   expect(calendar.payload.settings).toMatchObject({allowRoomBooking:false,roomCheckoutEnabled:false,roomPricingPreviewEnabled:false});
   for(const day of calendar.payload.days || []) {
     expect(day.roomBookable).not.toBe(true);
     expect(day.roomFirstNightFrom ?? null).toBeNull();
     expect(day.availableRoomOptions).toBeUndefined();
     expect(day.villaBookable).toBe(true);
   }
   expect(supabaseRequest.mock.calls.some(([path])=>path.startsWith("/booking_room_rates"))).toBe(false);
 });
 it("all public room capabilities return when all checkout gates are on",async()=>{
   const calendar=await call("calendar",{from:"2026-11-02",guestCount:2});
   expect(calendar.payload.settings).toMatchObject({allowRoomBooking:true,roomCheckoutEnabled:true,roomPricingPreviewEnabled:true});
   expect((await call("quote",{...stay,roomId})).payload.pricing.total).toBe(7644);
 });
 it("keeps backend priced availability available while public checkout is closed",async()=>{
   enabled=false;
   const result=await call("room-availability",{checkIn:stay.check_in,checkOut:stay.check_out,guestCount:2});
   expect(result.statusCode).toBe(200);
   expect(result.payload.roomCheckoutEnabled).toBe(false);
   expect(result.payload.availableRoomOptions[0]).toMatchObject({code:"S521",price:7644});
 });
 it("calendar uses each date as first night and excludes capacity-ineligible prices",async()=>{
   const calendar=await call("calendar",{from:"2026-11-02",guestCount:2});
   expect(calendar.statusCode).toBe(200);
   expect(calendar.payload.roomCheckoutEnabled).toBe(true);
   expect(calendar.payload.days.map(d=>d.roomFirstNightFrom)).toEqual([3920,3920]);
   expect(calendar.payload.days.every(d=>d.roomBookable)).toBe(true);
   expect(calendar.payload.days.every(d=>d.availableRoomOptions===undefined)).toBe(true);
   const overCapacity=await call("calendar",{from:"2026-11-02",guestCount:4});
   expect(overCapacity.payload.days.every(d=>!d.roomBookable&&d.roomFirstNightFrom===null)).toBe(true);
   inventory.roomBookingEnabled=false;
   const off=await call("calendar",{from:"2026-11-02",guestCount:2});
   expect(off.payload.days.every(d=>!d.roomBookable&&d.roomFirstNightFrom===null)).toBe(true);
 });
 it("shares quote, server submit and both snapshots; ignores tampered amount",async()=>{
   const q=await call("quote",{...stay,roomId});
   expect(q.statusCode).toBe(200);expect(q.payload.pricing.total).toBe(7644);
   const s=await call("request",{...stay,quoted_total:1,deposit_amount:1,status:"confirmed"});
   expect(s.statusCode).toBe(200);
   expect(s.payload.request.status).toBe("payment_hold");
   expect(stored).toMatchObject({room_id:roomId,room_count:1,quoted_total:7644,deposit_amount:2293,balance_amount:5351});
   expect(stored.pricing_breakdown).toEqual(q.payload.pricing);
   expect(stored.submitted_snapshot.summary.room).toMatchObject({code:"S521",capacity:2});
   expect(fetch).not.toHaveBeenCalled();
 });
 it("enforces capacity before creating any hold",async()=>{
   expect((await call("request",{...stay,adults:4})).payload.error).toBe("room_capacity_exceeded");
   expect(stored).toBeNull();
 });
 it("requires all rollout gates",async()=>{
   enabled=false;expect((await call("request",stay)).statusCode).toBe(400);
   enabled=true;vi.stubEnv("BOOKING_ROOM_CHECKOUT_ENABLED","false");
   expect((await call("request",stay)).statusCode).toBe(400);expect(stored).toBeNull();
 });
 it("rejects missing room, multiple rooms, malformed idempotency or contradictory count",async()=>{
   for(const bad of [{room_id:""},{room_count:2},{client_request_id:""},{guest_count:4}]) {
     expect((await call("request",{...stay,...bad})).statusCode).toBe(400);expect(stored).toBeNull();
   }
 });
 it("rejects OFF night, missing room/fallback, and post-quote transaction race",async()=>{
   inventory.roomBookingEnabled=false;expect((await call("request",stay)).statusCode).toBe(409);
   inventory.roomBookingEnabled=true;inventory.availableRoomOptions=[];
   expect((await call("request",stay)).statusCode).toBe(409);
   inventory.availableRoomOptions=[{roomId,code:"S521"}];conflict=true;
   expect((await call("request",stay)).payload.code).toBe("room_unavailable");expect(stored).toBeNull();
 });
 it("duplicate submission is rejected, does not return another recovery token",async()=>{
   expect((await call("request",stay)).statusCode).toBe(200);
   const first=JSON.stringify(stored);const retry=await call("request",stay);
   expect(retry.statusCode).toBe(409);expect(retry.payload.code).toBe("duplicate_booking_request");
   expect(retry.payload.recoveryToken).toBeUndefined();expect(JSON.stringify(stored)).toBe(first);
 });
 it("reprices new requests without changing saved snapshot",async()=>{
   await call("request",stay);const snapshot=JSON.stringify(stored);base=5900;
   expect((await call("quote",{...stay,roomId})).payload.pricing.total).toBe(9204);
   expect(JSON.stringify(stored)).toBe(snapshot);
 });
});
