import { describe, expect, it } from "vitest";
import { buildBookingPricingSnapshot, calculateBookingQuote, calculateBookingQuoteForDayTypes } from "./index.js";

function fixture() {
  const rule = { id:"calendar-test", name:"Synthetic calendar", effective_from:"2026-11-01", effective_to:"2027-02-01", deposit_rate:0.3, is_active:true, guest_11_18_fee:1250,
    weekday_discount_rate:0.8, friday_discount_rate:0.9, saturday_discount_rate:0.9, holiday_discount_rate:0.9 };
  const daily = new Map();
  const bases = { weekday:25000, friday:32000, holiday:39000 };
  const request = async path => {
    const u = new URL(path,"https://example.test");
    if (u.pathname === "/booking_price_rule_sets") return [{...rule}];
    if (u.pathname === "/booking_special_dates") {
      const day=daily.get(u.searchParams.get("date").slice(3));
      return !day || day.is_active===false ? [] : [{...day}];
    }
    if (u.pathname === "/booking_package_rates") {
      expect(u.searchParams.get("guest_count")).toBe("eq.10");
      return [{nightly_price:bases[u.searchParams.get("day_type").slice(3)]}];
    }
    throw new Error("Unexpected query");
  };
  const quote=(date="2026-11-02",extra={})=>calculateBookingQuote({checkIn:date,checkOut:new Date(Date.parse(date)+86400000).toISOString().slice(0,10),adults:10,...extra},{supabaseRequest:request});
  return {rule,daily,bases,request,quote};
}

describe("calendar discount through the shared quote engine",()=>{
  it.each([["2026-11-02",20000,"weekday"],["2026-11-06",28800,"friday"],["2026-11-07",35100,"saturday"],["2026-11-08",20000,"weekday"]])("resolves %s",async(date,total,source)=>{
    const q=await fixture().quote(date);
    expect(q.pricing.total).toBe(total);
    expect(q.pricing.breakdown[0].calendarDiscountSource).toBe(source);
  });
  it("prioritizes a holiday over weekday and a daily rate over both",async()=>{
    const f=fixture();f.daily.set("2026-12-31",{day_type:"holiday",is_active:true});
    expect((await f.quote("2026-12-31")).pricing.breakdown[0]).toMatchObject({calendarDiscountSource:"holiday",calendarDiscountRate:0.9,price:35100});
    f.daily.get("2026-12-31").calendar_discount_rate_override=0.85;
    expect((await f.quote("2026-12-31")).pricing.breakdown[0]).toMatchObject({calendarDiscountSource:"daily_override",calendarDiscountRate:0.85,price:33150});
  });
  it("separates Saturday and special holiday settings",async()=>{
    const f=fixture();f.rule.saturday_discount_rate=0.88;
    expect((await f.quote("2026-11-07")).pricing.total).toBe(34320);
    f.daily.set("2026-11-07",{day_type:"holiday"});
    expect((await f.quote("2026-11-07")).pricing.total).toBe(35100);
  });
  it("uses daily base and discount together",async()=>{
    const f=fixture();f.daily.set("2026-11-10",{day_type:"weekday",base_price_override:27000});
    expect((await f.quote("2026-11-10")).pricing.total).toBe(21600);
    f.daily.get("2026-11-10").calendar_discount_rate_override=0.85;
    expect((await f.quote("2026-11-10")).pricing.total).toBe(22950);
  });
  it.each([[15,31250,25000],[18,35000,28000],[19,35800,28640],[20,36600,29280]])("retains increments for %i adults",async(adults,original,total)=>{
    const q=await fixture().quote("2026-11-02",{adults});
    expect(q.pricing.total).toBe(total);
    expect(q.pricing.breakdown[0]).toMatchObject({adultLodgingPreDiscountAmount:original,calendarDiscountAmount:original-total,priceAfterCalendarDiscount:total,guest11To18Fee:1250,guest19To20Fee:800});
  });
  it("prices 15 guests across two weekdays at 25000 then 23750",async()=>{
    const q=await fixture().quote("2026-11-02",{checkOut:"2026-11-04",adults:15});
    expect(q.pricing.breakdown.map(n=>n.adultLodgingPreDiscountAmount)).toEqual([31250,31250]);
    expect(q.pricing.breakdown.map(n=>n.priceAfterCalendarDiscount)).toEqual([25000,25000]);
    expect(q.pricing.breakdown.map(n=>n.discountRate)).toEqual([1,0.95]);
    expect(q.pricing.breakdown.map(n=>n.price)).toEqual([25000,23750]);
    expect(q.pricing.total).toBe(48750);
  });
  it("applies calendar then existing 95%, leaving extras unchanged",async()=>{
    const q=await fixture().quote("2026-11-05",{checkOut:"2026-11-07",adults:19,children:1,dog10To20kgCount:1,breakfastAddons:[{date:"2026-11-06",quantity:1}]});
    expect(q.pricing.breakdown.map(n=>n.calendarDiscountRate)).toEqual([0.8,0.9]);
    expect(q.pricing.breakdown.map(n=>n.adultLodgingPreDiscountAmount)).toEqual([35800,42800]);
    expect(q.pricing.breakdown.map(n=>n.priceAfterCalendarDiscount)).toEqual([28640,38520]);
    expect(q.pricing.breakdown.map(n=>n.adultLodgingAmount)).toEqual([28640,36594]);
    expect(q.pricing.breakdown.map(n=>n.discountAmount)).toEqual([0,1926]);
    expect(q.pricing.breakdown.map(n=>n.childFeeAmount)).toEqual([500,475]);
    expect(q.pricing.breakdown.map(n=>n.petFeeAmount)).toEqual([800,760]);
    expect(q.pricing.total).toBe(68019);
    for(const n of q.pricing.breakdown) expect(n.preDiscountPrice-n.calendarDiscountAmount-n.discountAmount-n.childFeeDiscountAmount-n.petFeeDiscountAmount).toBe(n.price);
  });
  it("updates future quotes without changing persisted snapshots",async()=>{
    const f=fixture();const snapshot=JSON.parse(JSON.stringify(buildBookingPricingSnapshot(await f.quote())));
    f.rule.weekday_discount_rate=0.85;
    expect((await f.quote()).pricing.total).toBe(21250);
    expect(snapshot.quoted_total).toBe(20000);
    expect(snapshot.pricing_breakdown.breakdown[0]).toMatchObject({base10GuestRate:25000,calendarDiscountRate:0.8,calendarDiscountSource:"weekday",discountRate:1,price:20000});
  });
  it("uses requested day type, not a synthetic date",async()=>{
    const f=fixture();f.rule.saturday_discount_rate=0.5;
    const q=await calculateBookingQuoteForDayTypes({adults:10,dayTypes:["holiday"]},{supabaseRequest:f.request,referenceDate:"2026-11-01"});
    expect(q.pricing.total).toBe(35100);
    expect(q.pricing.breakdown[0].calendarDiscountSource).toBe("holiday");
  });
  it.each([0.01,0.8,0.9,1])("accepts explicit daily override %s",async rate=>{
    const f=fixture();f.daily.set("2026-11-02",{day_type:"weekday",calendar_discount_rate_override:rate});
    expect((await f.quote()).pricing.total).toBe(25000*rate);
  });
  it.each([null,""," "])("ignores inactive overrides; %s inherits",async value=>{
    const f=fixture();f.daily.set("2026-11-02",{day_type:"holiday",is_active:false,calendar_discount_rate_override:0.5});
    expect((await f.quote()).pricing.total).toBe(20000);
    f.daily.set("2026-11-02",{day_type:"weekday",calendar_discount_rate_override:value});
    expect((await f.quote()).pricing.total).toBe(20000);
  });
  it.each([null,undefined,0,"0",0.0099,-0.1,1.1,"",true,[],{},0.12345])("fails closed on configured discount %s",async rate=>{
    const f=fixture();f.rule.weekday_discount_rate=rate;
    expect((await f.quote()).pricing).toMatchObject({status:"unavailable",reason:"invalid_calendar_discount"});
  });
  it.each([0,"0",0.0099,-0.1,1.01,2,true,[],{}])("fails closed on invalid daily override %s",async rate=>{
    const f=fixture();f.daily.set("2026-11-02",{day_type:"weekday",calendar_discount_rate_override:rate});
    expect((await f.quote()).pricing).toMatchObject({status:"unavailable",reason:"invalid_calendar_discount"});
  });
});
