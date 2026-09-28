import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomSalesModeEditor from "./RoomSalesModeEditor";
const state=vi.hoisted(()=>({values:[] as any[],cursor:0,deps:undefined as unknown[]|undefined,effect:undefined as any,cleanup:undefined as any}));
const api=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
  useState:(initial:unknown)=>{const i=state.cursor++;if(!(i in state.values))state.values[i]=initial;return[state.values[i],(v:unknown)=>{state.values[i]=v;}];},
  useRef:(initial:unknown)=>{const i=state.cursor++;return state.values[i]??(state.values[i]={current:initial});},
  useEffect:(effect:unknown,deps:unknown[])=>{if(!state.deps||deps.some((v,i)=>v!==state.deps![i])){state.deps=deps;state.effect=effect;}},
}));
vi.mock("@/lib/bookings/adminBookingsApi",()=>({fetchRoomSalesDate:api.read,saveRoomSalesDate:api.save}));
let tree: React.ReactElement|null;
let stored: boolean|null;
const busy=vi.fn();
function render(){state.cursor=0;tree=RoomSalesModeEditor({token:"synthetic",date:"2026-11-02",onBusyChange:busy});if(state.effect){state.cleanup?.();state.cleanup=state.effect();state.effect=undefined;}}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();render();}
function nodes(node:any=tree):any[]{if(Array.isArray(node))return node.flatMap(n=>nodes(n));if(!node||typeof node!=="object")return[];return[node,...nodes(node.props?.children)];}
const select=()=>nodes().find(n=>n.type==="select").props;
const button=()=>nodes().find(n=>n.props?.onClick).props;
function change(value:string){select().onChange({target:{value}});render();}
beforeEach(()=>{
  state.cleanup?.();state.values=[];state.cursor=0;state.deps=undefined;state.effect=undefined;state.cleanup=undefined;
  vi.clearAllMocks();stored=null;
  vi.stubGlobal("React",React);
  api.read.mockImplementation(async()=>({enabled:true,roomBookingEnabledOverride:stored}));
  api.save.mockImplementation(async(_token,_date,value)=>{stored=value;return{enabled:true};});
});
afterEach(()=>{vi.unstubAllGlobals();});
describe("daily room mode editor",()=>{
  it("does not appear when backend rollout is OFF",async()=>{api.read.mockResolvedValue({enabled:false});render();await flush();expect(tree).toBe(null);expect(api.save).not.toHaveBeenCalled();});
  it("opens inherited state and changing/cancelling never saves",async()=>{render();await flush();expect(select().value).toBe("default");change("false");expect(nodes().some(n=>n.props?.children==="單間設定尚未儲存")).toBe(true);state.cleanup();expect(api.save).not.toHaveBeenCalled();expect(stored).toBe(null);});
  it.each(["true","false","default"])("saves %s independently and re-reads persisted setting",async value=>{
    stored=value==="default"?true:null;render();await flush();change(value);button().onClick();await flush();
    expect(api.save).toHaveBeenCalledWith("synthetic","2026-11-02",value==="default"?null:value==="true");
    expect(api.read).toHaveBeenCalledTimes(2);expect(button().disabled).toBe(true);expect(busy.mock.calls.map(c=>c[0])).toEqual([true,false]);
  });
  it("retains the draft on failure and never announces success",async()=>{api.save.mockRejectedValue(new Error("Synthetic save failed"));render();await flush();change("false");button().onClick();await flush();expect(select().value).toBe("false");expect(nodes().find(n=>n.props?.role==="alert").props.children).toBe("Synthetic save failed");expect(nodes().some(n=>n.props?.role==="status")).toBe(false);});
  it("prevents duplicate in-flight writes",async()=>{let finish:()=>void=()=>{};api.save.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));render();await flush();change("true");const onClick=button().onClick;onClick();onClick();expect(api.save).toHaveBeenCalledTimes(1);stored=true;finish();await flush();expect(button().disabled).toBe(true);});
});
