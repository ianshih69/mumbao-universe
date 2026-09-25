import { describe, expect, it } from "vitest";
import { buildBookingPricingSnapshot, calculateBookingQuote } from "./index.js";

function fixture() {
  const rule = { id:"rule",name:"Synthetic rates",effective_from:"2026-11-01",effective_to:"2027-02-01",is_active:true,deposit_rate:0.3,guest_11_18_fee:1250 };
  const bases = {weekday:25000,friday:32000,holiday:39000};
  const daily = new Map();
  const reads = [];
  const request = async path => {
    const u = new URL(path,"https://example.test");
    reads.push(u);
    if(u.pathname==="/booking_price_rule_sets") return [{...rule}];
    if(u.pathname==="/booking_special_dates") return daily.has(u.searchParams.get("date").slice(3)) ? [daily.get(u.searchParams.get("date").slice(3))] : [];
    if(u.pathname==="/booking_package_rates") {
      const count=Number(u.searchParams.get("guest_count").slice(3));
      const type=u.searchParams.get("day_type").slice(3);
      return count===10 ? [{rule_set_id:rule.id,guest_count:10,day_type:type,nightly_price:bases[type],is_active:true}] : [];
    }
    throw new Error("Unexpected query");
  };
  const quote = (adults=10, changes={}) => calculateBookingQuote({checkIn:"2026-11-02",checkOut:"2026-11-03",adults,children:0,infants:0,packageType:adults>=18?"villa_18":"villa_10",...changes},{supabaseRequest:request});
  return {rule,bases,daily,reads,quote};
}

describe("configured fee through the official booking quote engine", () => {
  it.each([[10,25000],[11,26250],[15,31250],[18,35000],[19,35800],[20,36600]])("prices %i guests with only the base DB row", async (adults,total) => {
    const f=fixture(); const q=await f.quote(adults);
    expect(q.pricing.total).toBe(total);
    expect(q.pricing.breakdown[0]).toMatchObject({guestPricingSource:"base_plus_configured_fee",guest11To18Fee:1250,guest19To20Fee:800});
    expect(f.reads.filter(u=>u.pathname==="/booking_package_rates").every(u=>u.searchParams.get("guest_count")==="eq.10")).toBe(true);
  });
  it.each([[18,37000],[19,37800],[20,38600]])("applies a daily 27000 base to %i guests", async (adults,total) => {
    const f=fixture(); f.daily.set("2026-11-02",{day_type:"weekday",is_active:true,base_price_override:27000});
    expect((await f.quote(adults)).pricing.total).toBe(total);
  });
  it("reprices future quotes after edits while leaving persisted snapshots unchanged", async () => {
    const f=fixture();
    const before=await f.quote(20);
    const snapshot=JSON.parse(JSON.stringify(buildBookingPricingSnapshot(before)));
    f.rule.guest_11_18_fee=1500;
    const after=await f.quote(20);
    expect(after.pricing.total).toBe(38600);
    expect(snapshot.quoted_total).toBe(36600);
    expect(snapshot.pricing_breakdown.breakdown[0]).toMatchObject({guest11To18Fee:1250,base10GuestRate:25000,price:36600,discountRate:1});
    f.bases.weekday=27000;
    expect((await f.quote(20)).pricing.total).toBe(40600);
    expect(snapshot.quoted_total).toBe(36600);
  });
  it("keeps existing consecutive-night, child, pet and breakfast ordering", async () => {
    const f=fixture();
    const q=await f.quote(19,{checkIn:"2026-11-05",checkOut:"2026-11-07",children:1,dog10To20kgCount:1,breakfastAddons:[{date:"2026-11-06",quantity:1}]});
    expect(q.pricing.breakdown.map(n=>n.adultLodgingPreDiscountAmount)).toEqual([35800,42800]);
    expect(q.pricing.breakdown.map(n=>n.adultLodgingAmount)).toEqual([35800,40660]);
    expect(q.pricing.breakdown.map(n=>n.childFeeAmount)).toEqual([500,475]);
    expect(q.pricing.breakdown.map(n=>n.petFeeAmount)).toEqual([800,760]);
    expect(q.pricing.breakfastAddonTotal).toBe(250);
    expect(q.pricing.total).toBe(79245);
  });
  it.each([null,-1,1.5,""])("fails closed for configured invalid fee %s", async value => {
    const f=fixture();f.rule.guest_11_18_fee=value;
    expect((await f.quote()).pricing).toMatchObject({status:"unavailable",reason:"invalid_guest_base_pricing"});
  });
  it.each([0,"0",-1,1.5,10000001])("fails closed for invalid active Base override %s", async value => {
    const f=fixture();f.daily.set("2026-11-02",{day_type:"weekday",is_active:true,base_price_override:value});
    expect((await f.quote(12)).pricing).toMatchObject({status:"unavailable",reason:"invalid_guest_base_pricing"});
    f.daily.get("2026-11-02").is_active = false;
    expect((await f.quote(12)).pricing.total).toBe(27500);
  });
  it("inherits NULL Base and accepts the positive lower boundary",async()=>{
    const f=fixture();f.daily.set("2026-11-02",{day_type:"weekday",is_active:true,base_price_override:null});
    expect((await f.quote(10)).pricing.total).toBe(25000);
    f.daily.get("2026-11-02").base_price_override=1;
    expect((await f.quote(10)).pricing.total).toBe(1);
  });
});
