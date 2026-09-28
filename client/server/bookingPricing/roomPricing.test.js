import { describe, it, expect } from "vitest";
import { roomNight, priceAvailableRooms } from "./roomPricing.js";
import { roundMoney, consecutiveStayDiscountRate } from "./index.js";
import { validateRoomPricePayload } from "../bookingRoomPricing.js";

const codes = ["S360", "S521", "S530", "S666", "S888", "S520"];
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
function fixture() { return { periods: [{ id: id(99), is_active: true, effective_from: '2026-11-01', effective_to: '2027-01-31' }],
  settings: [{ rule_set_id: id(99), room_weekday_discount_rate: .8, room_weekend_discount_rate: .9 }],
  rates: codes.map((_, i) => ({ room_id: id(i), rule_set_id: id(99), weekday_base_price: 3500 + i * 100, friday_base_price: 4500 + i * 100, saturday_base_price: 5500 + i * 100 })), overrides: [], discounts: [] }; }
const inventory = (selected = codes.slice(0, 5)) => ({ roomBookingEnabled: true, roomBookable: true, availableRoomOptions: selected.map(code => ({ code, roomId: id(codes.indexOf(code)) })) });
describe('room pricing independent of villa and inventory', () => {
  it.each([['2026-11-05',3500,.8],['2026-11-06',4500,.9],['2026-11-07',5500,.9]])('six distinct bases and discounts %s', (date, base, discount) => {
    const data=fixture();codes.forEach((_,i)=>expect(roomNight(data,id(i),date)).toMatchObject({basePrice:base+i*100,calendarDiscountRate:discount,finalNightPrice:roundMoney((base+i*100)*discount)}));
  });
  it('daily discount shared by rooms, base override only one room',()=>{
    const data=fixture();data.overrides.push({room_id:id(0),stay_date:'2026-11-05',base_price_override:4000});data.discounts.push({stay_date:'2026-11-05',room_discount_rate_override:.7});
    expect(roomNight(data,id(0),'2026-11-05').finalNightPrice).toBe(2800);expect(roomNight(data,id(1),'2026-11-05').finalNightPrice).toBe(2520);
    data.overrides[0].base_price_override=null;data.discounts[0].room_discount_rate_override=null;expect(roomNight(data,id(0),'2026-11-05').finalNightPrice).toBe(2800);
  });
  it('weekday/Friday/Saturday with existing staged rounding and second-night 95%',()=>{
    const q=priceAvailableRooms(fixture(),inventory(['S360']),'2026-11-05','2026-11-08');
    expect(q.availableRoomOptions[0].pricingBreakdown.breakdown.map(n=>n.finalNightPrice)).toEqual([2800,3848,4703]);
    expect(q.availableRoomOptions[0].price).toBe(11351);expect(q.roomCheckoutEnabled).toBe(false);
    expect(q.availableRoomOptions[0].pricingBreakdown.breakdown[1].stayDiscountRate).toBe(consecutiveStayDiscountRate);
  });
  it('fallback uses its own rate, never added by pricing',()=>{
    expect(priceAvailableRooms(fixture(),inventory(),'2026-11-02','2026-11-03').availableRoomOptions.map(r=>r.code)).not.toContain('S520');
    expect(priceAvailableRooms(fixture(),inventory(['S520']),'2026-11-02','2026-11-03').availableRoomOptions[0].price).toBe(3200);
  });
  it('missing one price preserves exact inventory evidence, no fallback and no zero price',()=>{
    const data=fixture();data.rates[0].weekday_base_price=null;const q=priceAvailableRooms(data,inventory(),'2026-11-02','2026-11-03');
    expect(q.availableRoomOptions.map(r=>r.code)).toEqual(codes.slice(0,5));expect(q.roomBookable).toBe(true);
    expect(q.availableRoomOptions[0]).toMatchObject({pricingStatus:'not_configured',price:null,pricingBreakdown:null});expect(q.roomCheckoutEnabled).toBe(false);
  });
  it('missing any night fails closed and saved snapshot is unchanged after repricing',()=>{
    const data=fixture();const saved=priceAvailableRooms(data,inventory(['S360']),'2026-11-05','2026-11-08').availableRoomOptions[0].pricingBreakdown;
    data.rates[0].friday_base_price=null;expect(priceAvailableRooms(data,inventory(['S360']),'2026-11-05','2026-11-08').availableRoomOptions[0].price).toBeNull();expect(saved.total).toBe(11351);
  });
  it('overlapping or absent periods fail closed',()=>{const data=fixture();data.periods.push({...data.periods[0]});expect(roomNight(data,id(0),'2026-11-02')).toBeNull();expect(roomNight(fixture(),id(0),'2026-02-30')).toBeNull();});
  it.each([0,-1,1.01,NaN])('rejects invalid discount %s',value=>expect(()=>validateRoomPricePayload({date:'2026-11-02',bases:[],discount:value},true)).toThrow());
  it.each([0,-1,3.5,10000001,'3000'])('rejects invalid base %s',value=>expect(()=>validateRoomPricePayload({date:'2026-11-02',bases:[{room_id:id(0),base_price_override:value}]},true)).toThrow());
  it('accepts null inheritance and 100%',()=>expect(validateRoomPricePayload({date:'2026-11-02',bases:[{room_id:id(0),base_price_override:null}],discount:1},true)).toBeTruthy());
});
