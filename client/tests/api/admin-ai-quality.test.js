import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({role:"super_admin",active:true,permissions:[],rpcStatus:200}));
vi.mock("../../server/shopShared.js", async importOriginal=>{
  const original=await importOriginal();
  return {...original,
    getServerEnv:name=>process.env[name]||"",
    getSupabaseConfig:()=>({url:"https://quality.test",serviceRoleKey:"synthetic-service"}),
    supabaseRequest:async path=>{
      if(path.startsWith("/admin_profiles"))return [{auth_user_id:"synthetic-admin",role_code:state.role,is_active:state.active}];
      if(path.startsWith("/admin_permissions"))return [];
      if(path.startsWith("/admin_role_permissions"))return state.permissions.map(permission_code=>({permission_code}));
      throw new Error("unexpected_auth_path");
    },
  };
});
import handler from "../../api/admin-ai-quality.js";
let transport;
beforeEach(()=>{
  state.role="super_admin";state.active=true;state.permissions=[];state.rpcStatus=200;
  vi.stubEnv("AI_QUALITY_ADMIN_ENABLED","true");vi.stubEnv("SUPABASE_URL","https://quality.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-service");
  transport=vi.fn(async(url,options)=>{
    if(url==="https://quality.test/auth/v1/user")return new Response(JSON.stringify({id:"synthetic-admin"}),{status:options.headers.Authorization==="Bearer expired" ? 401:200});
    if(!url.startsWith("https://quality.test/rest/v1/rpc/"))throw new Error("forbidden_network");
    if(state.rpcStatus!==200)return new Response("private SQL details",{status:state.rpcStatus});
    const data=url.endsWith("review_ai_quality_event")?{reviewed:true}:url.endsWith("read_ai_quality_detail")?{
      id:"11111111-1111-4111-8111-111111111111",event_type:"negative_feedback",raw_conversation_id:"private",
      context:[{role:"user",relative:"current",text:"電話0988-123-456 email abc@example.com"}],
    }:url.endsWith("list_ai_quality_events")?{events:[],has_more:false}:{};
    return new Response(JSON.stringify(data));
  });vi.stubGlobal("fetch",transport);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function request(action="list",token="synthetic",query={},body){
  const res={statusCode:0,setHeader:vi.fn(),end(value){this.data=JSON.parse(value);}};
  await handler({method:action==="review"?"POST":"GET",headers:token?{authorization:"Bearer "+token}:{},
    query:{action,...query},body},res);return res;
}
describe("Phase 1C actual Admin permission framework",()=>{
  it.each(["list","overview","detail","review","health"])("denies public/expired/ordinary admin: %s",async action=>{
    expect((await request(action,"")).statusCode).toBe(401);
    expect((await request(action,"expired")).statusCode).toBe(401);
    state.role="admin";expect((await request(action)).statusCode).toBe(403);
    expect(transport.mock.calls.some(([url])=>url.includes("/rpc/"))).toBe(false);
  });
  it.each(["list","overview","detail","review","health"])("allows super admin: %s with no LLM or raw output",async action=>{
    const result=await request(action,"synthetic",{event_id:"11111111-1111-4111-8111-111111111111"},
      {event_id:"11111111-1111-4111-8111-111111111111"});
    expect(result.statusCode).toBe(200);expect(result.data.enabled).toBe(true);
    expect(JSON.stringify(result.data)).not.toMatch(/private|0988|abc@|raw_conversation_id/);
    expect(transport.mock.calls.every(([url])=>url.startsWith("https://quality.test/"))).toBe(true);
    expect(transport.mock.calls.filter(([url])=>url.includes("/rpc/"))).toHaveLength(1);
  });
  it("view permission does not authorize review; explicit review permission does",async()=>{
    state.role="manager";state.permissions=["ai_quality.view"];
    expect((await request()).statusCode).toBe(200);
    expect((await request("review","synthetic",{}, {event_id:"11111111-1111-4111-8111-111111111111"})).statusCode).toBe(403);
    state.permissions.push("ai_quality.review");
    expect((await request("review","synthetic",{}, {event_id:"11111111-1111-4111-8111-111111111111"})).statusCode).toBe(200);
  });
  it("inactive super admin denied",async()=>{
    state.active=false;expect((await request()).statusCode).toBe(403);
  });
  it.each([undefined,"false","active","1","yes","TRUE"])("OFF mode %s does no Quality query",async flag=>{
    vi.stubEnv("AI_QUALITY_ADMIN_ENABLED",flag);
    expect((await request()).data).toEqual({enabled:false});
    expect(transport.mock.calls.some(([url])=>url.includes("/rpc/"))).toBe(false);
  });
  it("missing migration is a safe initialized-state error, not SQL",async()=>{
    state.rpcStatus=404;const result=await request();
    expect(result.statusCode).toBe(503);expect(result.data).toEqual({ok:false,code:"not_initialized"});
  });
  it.each([{days:"999"},{type:"secret"},{severity:"secret"},{reviewed:"secret"},{before_at:"bad"},{before_id:"bad"}])("bounded schema %j",async query=>{
    expect((await request("list","synthetic",query)).statusCode).toBe(400);
    expect(transport.mock.calls.some(([url])=>url.includes("/rpc/"))).toBe(false);
  });
  it("review cannot smuggle resolved/policy decisions",async()=>{
    expect((await request("review","synthetic",{}, {event_id:"11111111-1111-4111-8111-111111111111",resolved:true})).statusCode).toBe(400);
  });
});
