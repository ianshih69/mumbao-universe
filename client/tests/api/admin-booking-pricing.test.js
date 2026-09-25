import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../server/shopShared.js", async importOriginal => ({
  ...await importOriginal(),
  getServerEnv: vi.fn(name => name === "SUPABASE_URL" ? "https://supabase.test" : "synthetic-test-key"),
  supabaseRequest: vi.fn(),
  readBody: vi.fn(req => req.body),
}));
import { supabaseRequest } from "../../server/shopShared.js";
import handler, { __testing } from "../../api/admin-bookings.js";
import { calculateBookingQuote } from "../../server/bookingPricing/index.js";

const rule={id:"00000000-0000-4000-8000-000000000110",name:"Synthetic pricing",effective_from:"2026-11-01",effective_to:"2027-02-01",deposit_rate:0.3,is_active:true,guest_11_18_fee:1250};
async function call(action, body, authenticated=true) {
  const req={method:"POST",query:{action},headers:authenticated?{authorization:"Bearer synthetic-admin-token"}:{},body};
  const res={statusCode:0,setHeader(){},end(value){this.payload=JSON.parse(value);}};
  await handler(req,res); return res;
}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({id:"synthetic-admin"}),{status:200})));
  supabaseRequest.mockImplementation(async(path,options)=>{
    if(path.startsWith("/admin_profiles"))return[{is_active:true,role_code:"admin"}];
    if(path.startsWith("/booking_admin_audit_logs"))return[];
    if(path.startsWith("/booking_price_rule_sets")&&!options)return[rule];
    if(options)return[JSON.parse(options.body)];
    throw new Error(`Unexpected path: ${path}`);
  });
});

describe("admin calendar discounts and read-only draft preview",()=>{
  const discounts={weekday_discount_rate:0.8,friday_discount_rate:0.9,saturday_discount_rate:0.9,holiday_discount_rate:0.9};
  const draft=()=>({month:"2026-11",ruleSet:{...rule,...discounts},rates:["weekday","friday","holiday"].map(day_type=>({guest_count:10,day_type,nightly_price:25000,is_active:true})),specialDates:[]});
  it("saves all default discounts through the authenticated existing action",async()=>{
    expect((await call("pricing-rule-set",{...rule,...discounts,weekday_discount_rate:0.85})).statusCode).toBe(200);
    const write=supabaseRequest.mock.calls.find(([p,o])=>p.startsWith("/booking_price_rule_sets")&&o);
    expect(JSON.parse(write[1].body)).toMatchObject({weekday_discount_rate:0.85,friday_discount_rate:0.9,saturday_discount_rate:0.9});
    expect(JSON.parse(write[1].body)).not.toHaveProperty("holiday_discount_rate");
  });
  it("synchronizes both weekend columns server-side and preserves the retired holiday field",async()=>{
    const res=await call("pricing-rule-set",{...rule,weekday_discount_rate:0.8,friday_discount_rate:0.75,saturday_discount_rate:0.99,holiday_discount_rate:1});
    expect(res.statusCode).toBe(200);
    const write=supabaseRequest.mock.calls.find(([p,o])=>p.startsWith("/booking_price_rule_sets")&&o);
    expect(JSON.parse(write[1].body)).toMatchObject({friday_discount_rate:0.75,saturday_discount_rate:0.75});
    expect(JSON.parse(write[1].body)).not.toHaveProperty("holiday_discount_rate");
  });
  it("accepts just the two visible defaults, but never a Saturday-only update",()=>{
    expect(__testing.normalizeRuleSetPayload({...rule,weekday_discount_rate:0.8,friday_discount_rate:0.9})).toMatchObject({saturday_discount_rate:0.9});
    expect(()=>__testing.normalizeRuleSetPayload({...rule,saturday_discount_rate:0.7})).toThrow();
  });
  it.each([null,"",0,"0",0.0099,true,[],{},-0.1,1.1,0.12345])("rejects invalid discounts %s",value=>{
    expect(()=>__testing.normalizeRuleSetPayload({...rule,...discounts,weekday_discount_rate:value})).toThrow();
  });
  it("does not reset configured defaults when an older client omits them",()=>{
    expect(__testing.normalizeRuleSetPayload(rule)).not.toHaveProperty("weekday_discount_rate");
  });
  it("saves valid overrides and normalizes blank overrides to inheritance",async()=>{
    const day={rule_set_id:rule.id,date:"2026-11-10",day_type:"weekday"};
    expect((await call("pricing-special-date",{...day,calendar_discount_rate_override:0.85})).statusCode).toBe(200);
    for(const value of [null,0.01,0.8,0.9,1]) expect(__testing.normalizeSpecialDatePayload({...day,calendar_discount_rate_override:value}).calendar_discount_rate_override).toBe(value);
    for(const value of [""," "]) {
      expect((await call("pricing-special-date",{...day,calendar_discount_rate_override:value})).statusCode).toBe(200);
      const write=supabaseRequest.mock.calls.filter(([p,o])=>p.startsWith("/booking_special_dates")&&o).at(-1);
      expect(JSON.parse(write[1].body).calendar_discount_rate_override).toBeNull();
    }
    expect(()=>__testing.normalizeSpecialDatePayload({...day,calendar_discount_rate_override:2})).toThrow();
  });
  it("previews unsaved base and discount using the actual quote engine without writes",async()=>{
    const body=draft();body.specialDates=[{rule_set_id:rule.id,date:"2026-11-10",day_type:"weekday",is_active:true,base_price_override:27000,calendar_discount_rate_override:0.85}];
    const result=await call("pricing-preview",body);
    expect(result.statusCode).toBe(200);
    expect(result.payload.days).toHaveLength(30);
    expect(result.payload.days.find(d=>d.date==="2026-11-10").night).toMatchObject({base10GuestRate:27000,calendarDiscountRate:0.85,price:22950});
    const quote=await calculateBookingQuote({checkIn:"2026-11-10",checkOut:"2026-11-11",adults:10},{ruleSetOverride:body.ruleSet,supabaseRequest:async path=>path.startsWith("/booking_special_dates")?body.specialDates:body.rates});
    expect(quote.pricing.total).toBe(result.payload.days.find(d=>d.date==="2026-11-10").night.price);
    expect(supabaseRequest.mock.calls.some(([,options])=>options)).toBe(false);
    expect(supabaseRequest.mock.calls.every(([p])=>p.startsWith("/admin_profiles"))).toBe(true);
  });
  it.each([0,"0",-1,1.5,10000001])("rejects invalid Base override %s through save and preview before writes",async value=>{
    const day={rule_set_id:rule.id,date:"2026-11-10",day_type:"weekday",base_price_override:value};
    expect((await call("pricing-special-date",day)).statusCode).toBe(400);
    expect((await call("pricing-preview",{...draft(),specialDates:[day]})).statusCode).toBe(400);
    expect(supabaseRequest.mock.calls.some(([,options])=>options)).toBe(false);
  });
  it.each([0,"0",0.0099,-0.1,1.01])("rejects %s through actual save and preview handlers before writes",async value=>{
    expect((await call("pricing-rule-set",{...rule,...discounts,weekday_discount_rate:value})).statusCode).toBe(400);
    const day={rule_set_id:rule.id,date:"2026-11-10",day_type:"weekday",calendar_discount_rate_override:value};
    expect((await call("pricing-special-date",day)).statusCode).toBe(400);
    expect((await call("pricing-preview",{...draft(),specialDates:[day]})).statusCode).toBe(400);
    expect((await call("pricing-preview",{...draft(),ruleSet:{...rule,...discounts,weekday_discount_rate:value}})).statusCode).toBe(400);
    expect(supabaseRequest.mock.calls.some(([,options])=>options)).toBe(false);
  });
  it("limits a month preview to its rule period",async()=>{
    const body=draft();body.ruleSet.effective_from="2026-11-10";
    const result=await call("pricing-preview",body);
    expect(result.payload.days[0]).toMatchObject({status:"unavailable",reason:"outside_active_rule_set"});
    expect(result.payload.days[9].night.price).toBe(20000);
  });
  it("rejects unauthenticated preview",async()=>{
    expect((await call("pricing-preview",draft(),false)).statusCode).toBe(401);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
  it("rejects duplicates, incomplete config and malformed months",async()=>{
    for(const change of [{month:"2026-13"},{rates:[draft().rates[0],draft().rates[0],draft().rates[0]]},{ruleSet:rule}]) {
      expect((await call("pricing-preview",{...draft(),...change})).statusCode).toBe(400);
    }
    expect(supabaseRequest.mock.calls.some(([,options])=>options)).toBe(false);
  });
});
afterEach(()=>vi.unstubAllGlobals());
describe("admin configured guest pricing contract",()=>{
  it.each([null,undefined,""," ",-1,1.5,true,10000001])("rejects invalid fee %s",fee=>{
    expect(()=>__testing.normalizeRuleSetPayload({...rule,guest_11_18_fee:fee})).toThrow();
  });
  it("saves the configured fee with existing admin authentication",async()=>{
    const res=await call("pricing-rule-set",{...rule,guest_11_18_fee:1500});
    expect(res.statusCode).toBe(200);
    const writes=supabaseRequest.mock.calls.filter(([path,options])=>path.startsWith("/booking_price_rule_sets")&&options);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({guest_11_18_fee:1500});
  });
  it("rejects unauthenticated writes before querying price tables",async()=>{
    expect((await call("pricing-rule-set",rule,false)).statusCode).toBe(401);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
  it("rejects inactive admin writes",async()=>{
    supabaseRequest.mockResolvedValue([{is_active:false}]);
    expect((await call("pricing-rule-set",rule)).statusCode).toBe(403);
    expect(supabaseRequest.mock.calls).toHaveLength(1);
  });
  it("only writes three base rows, never complete 11-18 guest prices",async()=>{
    const rates=["weekday","friday","holiday"].map(day_type=>({guest_count:10,day_type,nightly_price:27000}));
    expect((await call("pricing-rates",{rule_set_id:rule.id,rates})).statusCode).toBe(200);
    const write=supabaseRequest.mock.calls.find(([path])=>path.startsWith("/booking_package_rates"));
    expect(JSON.parse(write[1].body).map(row=>row.guest_count)).toEqual([10,10,10]);
    expect((await call("pricing-rates",{rule_set_id:rule.id,rates:[{...rates[0],guest_count:11}]})).statusCode).toBe(400);
  });
  it("rejects empty base prices and duplicate days before writing",async()=>{
    const row={guest_count:10,day_type:"weekday",nightly_price:25000};
    expect((await call("pricing-rates",{rule_set_id:rule.id,rates:[row,row]})).statusCode).toBe(400);
    expect((await call("pricing-rates",{rule_set_id:rule.id,rates:[{...row,nightly_price:""}]})).statusCode).toBe(400);
    expect(supabaseRequest.mock.calls.some(([,options])=>options)).toBe(false);
  });
  it("saves, clears and validates daily base overrides",async()=>{
    const day={rule_set_id:rule.id,date:"2026-11-02",day_type:"weekday",is_active:true};
    expect((await call("pricing-special-date",{...day,base_price_override:27000})).statusCode).toBe(200);
    expect(__testing.normalizeSpecialDatePayload({...day,base_price_override:null}).base_price_override).toBe(null);
    expect(()=>__testing.normalizeSpecialDatePayload({...day,base_price_override:-1})).toThrow();
    expect(()=>__testing.normalizeSpecialDatePayload({...day,date:"2026-02-30"})).toThrow();
  });
});
