import { describe, expect, it } from 'vitest';
import { roomDayPayload, type RoomDayDraft } from './roomPriceEditor';
function draft(): RoomDayDraft { return {date:'2026-11-02',values:{a:'3500',b:'3900'},initial:{a:'3500',b:'3900'},defaults:{a:'3500',b:'3900'},percent:'80',initialPercent:'80',defaultPercent:'80',salesMode:'true',initialSalesMode:'true',restoring:false}; }
describe('room daily delta and restore',()=>{
  it('unchanged values do not become overrides',()=>expect(roomDayPayload(draft())).toEqual({mode:'day',date:'2026-11-02',bases:[]}));
  it('changes only S360 without fixing discount',()=>{const d=draft();d.values.a='4000';expect(roomDayPayload(d)).toEqual({mode:'day',date:d.date,bases:[{room_id:'a',base_price_override:4000}]});});
  it('discount alone does not fix any base',()=>{const d=draft();d.percent='90';expect(roomDayPayload(d)).toEqual({mode:'day',date:d.date,bases:[],discount:.9});});
  it('restore prices leaves ON intact',()=>{const d=draft();d.restoring=true;expect(roomDayPayload(d)).toEqual({mode:'day',date:d.date,bases:[{room_id:'a',base_price_override:null},{room_id:'b',base_price_override:null}],discount:null});});
  it('explicit sales default is independent',()=>{const d=draft();d.salesMode='default';expect(roomDayPayload(d).salesMode).toBeNull();});
  it('can edit a price after restore without restoring stale override',()=>{const d=draft();d.restoring=true;d.values.a='4200';expect(roomDayPayload(d).bases[0].base_price_override).toBe(4200);});
});
