import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../server/shopShared.js", async original => ({
  ...await original(), supabaseRequest: vi.fn(), supabaseRpc: vi.fn(), readBody: vi.fn(req=>req.body),
}));
vi.mock("../../server/bookingManagement.js", async original => ({
  ...await original(), createManagementSessionForBooking: vi.fn(),
}));
import { supabaseRequest, supabaseRpc } from "../../server/shopShared.js";
import handler from "../../api/booking.js";

let rule;
let stored;
async function call(action, body={}) {
  const query={action,...(action==="quote"?body:{})};
  const req={method:action==="quote"?"GET":"POST",query,headers:{},body};
  const res={statusCode:0,setHeader(){},end(value){this.payload=JSON.parse(value);}};
  await handler(req,res);return res;
}
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-20T04:00:00Z"));
  vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("External requests forbidden in local certification");}));
  rule={id:"synthetic-rule",name:"Synthetic pricing",effective_from:"2026-11-01",effective_to:"2027-02-01",is_active:true,deposit_rate:0.3,guest_11_18_fee:1250,
    weekday_discount_rate:0.8,friday_discount_rate:0.9,saturday_discount_rate:0.9,holiday_discount_rate:0.9};
  stored=null;
  supabaseRequest.mockImplementation(async(path,options)=>{
    if(path.startsWith("/booking_settings"))return[{booking_window_months:6,allow_villa_booking:true,allow_room_booking:false,total_room_count:5,allow_pets:true}];
    if(path.startsWith("/booking_price_rule_sets"))return[{...rule}];
    if(path.startsWith("/booking_special_dates"))return[];
    if(path.startsWith("/booking_package_rates"))return[{nightly_price:25000}];
    if(path==="/booking_availability_alerts"&&options?.method==="POST")return[];
    throw new Error(`Unexpected local DB query ${path}`);
  });
  supabaseRpc.mockImplementation(async(name,args)=>{
    expect(name).toBe("acquire_villa_booking_hold");
    stored=JSON.parse(JSON.stringify(args.p_request));
    return{ok:true,request:{id:"synthetic-booking",booking_reference:"synthetic-only",status:"payment_hold"}};
  });
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("public quote and submit share calendar pricing",()=>{
  const stay={check_in:"2026-11-02",check_out:"2026-11-03",adults:15,children:0,infants:0,stay_type:"villa"};
  it("quotes and submits identical server prices with both snapshots",async()=>{
    const quoted=await call("quote",stay);
    expect(quoted.statusCode).toBe(200);
    expect(quoted.payload.pricing.total).toBe(25000);
    expect(supabaseRpc).not.toHaveBeenCalled();
    const submitted=await call("request",{...stay,guest_name:"Synthetic Test",email:"test@example.com",quoted_total:1,calendar_discount_rate:0});
    expect(submitted.statusCode).toBe(200);
    expect(stored.quoted_total).toBe(quoted.payload.pricing.total);
    expect(stored.pricing_breakdown).toEqual(quoted.payload.pricing);
    expect(stored.pricing_breakdown.breakdown[0]).toMatchObject({base10GuestRate:25000,guest11To18Fee:1250,guest19To20Fee:800,calendarDiscountRate:0.8,calendarDiscountSource:"weekday",calendarDiscountAmount:6250,discountRate:1,price:25000});
    expect(stored.submitted_snapshot.pricing).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reprices at submit, then leaves the saved order immutable on later quote requests",async()=>{
    expect((await call("quote",stay)).payload.pricing.total).toBe(25000);
    rule.weekday_discount_rate=0.85;
    expect((await call("request",{...stay,guest_name:"Synthetic Test",email:"test@example.com",quoted_total:25000})).statusCode).toBe(200);
    expect(stored.quoted_total).toBe(26563);
    const snapshot=JSON.stringify(stored);
    rule.weekday_discount_rate=1;
    expect((await call("quote",stay)).payload.pricing.total).toBe(31250);
    expect(JSON.stringify(stored)).toBe(snapshot);
    expect(supabaseRpc).toHaveBeenCalledTimes(1);
  });
  it.each([null,0,0.0099])("rejects submission before acquiring any hold for invalid calendar setting %s",async rate=>{
    rule.weekday_discount_rate=rate;
    expect((await call("request",{...stay,guest_name:"Synthetic Test",email:"test@example.com"})).statusCode).toBe(409);
    expect(supabaseRpc).not.toHaveBeenCalled();
  });
});
