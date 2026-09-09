import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiQualityTurnSnapshot } from "./snapshot.js";
import { createAiQualityFeedbackToken, verifyAiQualityFeedbackToken, isAiQualityFeedbackEnabled, isAiQualityAdminEnabled, feedbackLifetimeSeconds } from "./feedbackToken.js";
import handler from "../../api/ai-quality-feedback.js";
import { publicQualityDetail, publicQualityHealth, publicQualityOverview } from "./http.js";

const snapshot = () => buildAiQualityTurnSnapshot({ conversationId:"synthetic-conversation",turnId:"synthetic-turn",
  userText:"我的電話0988-123-456，email abc@example.com，想問11/1住宿。",
  assistantText:"有停車位。",beforeContext:{},afterContext:{},route:{},metadata:{} });
const response = () => ({ statusCode:0,setHeader:vi.fn(),end(value){this.data=JSON.parse(value);} });
let transport;
beforeEach(() => {
  vi.stubEnv("AI_QUALITY_HMAC_SECRET",randomBytes(32).toString("hex"));
  vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED","true");
  vi.stubEnv("AI_QUALITY_FEEDBACK_ENABLED","true");
  vi.stubEnv("SUPABASE_URL","https://quality.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-service-credential");
  transport = vi.fn(async()=>new Response(JSON.stringify({result:"saved"})));
  vi.stubGlobal("fetch",transport);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function post(body, extra={}) {
  const res=response();await handler({method:"POST",body,headers:{},...extra},res);return res;
}
describe("Phase 1C signed feedback",()=>{
  it("new server surfaces have no model, file persistence, transcript logging or environment dumps",()=>{
    for(const name of ["feedbackToken.js","http.js","../../api/ai-quality-feedback.js","../../api/admin-ai-quality.js"]){
      const source=readFileSync(new URL(name,import.meta.url),"utf8");
      expect(source).not.toMatch(/DEEPSEEK|deepSeek|api\.deepseek|writeFile|appendFile|console\.|JSON\.stringify\(process\.env/);
      expect(source).not.toMatch(/from ["'].*(?:aiChat\/(?:message|deepSeek|semantic)|node:fs)/);
    }
  });
  it.each([undefined,"false","active","1","yes","TRUE","true"])("strict flags %s", value=>{
    vi.stubEnv("AI_QUALITY_FEEDBACK_ENABLED",value);vi.stubEnv("AI_QUALITY_ADMIN_ENABLED",value);
    expect(isAiQualityFeedbackEnabled()).toBe(value==="true");expect(isAiQualityAdminEnabled()).toBe(value==="true");
  });
  it("contains only hashed references and times; dedicated signing domain, no raw identifiers",()=>{
    const token=createAiQualityFeedbackToken(snapshot());
    const p=JSON.parse(Buffer.from(token.split(".")[0],"base64url").toString());
    expect(Object.keys(p).sort()).toEqual(["c","exp","iat","t","v"]);
    expect(p.exp-p.iat).toBe(feedbackLifetimeSeconds);
    expect(JSON.stringify(p)).not.toMatch(/synthetic|0988|example|電話/);
    expect(verifyAiQualityFeedbackToken(token)).toEqual({conversation_key_hash:p.c,turn_key_hash:p.t});
    expect(createHmac("sha256",process.env.AI_QUALITY_HMAC_SECRET).update(token.split(".")[0]).digest("base64url")).not.toBe(token.split(".")[1]);
  });
  it.each(["","short",undefined])("missing/weak secret %s gives no token and rejects",secret=>{
    const token=createAiQualityFeedbackToken(snapshot());vi.stubEnv("AI_QUALITY_HMAC_SECRET",secret);
    expect(createAiQualityFeedbackToken(snapshot())).toBeNull();expect(verifyAiQualityFeedbackToken(token)).toBeNull();
  });
  it("observer OFF/feedback ON issues no token and performs no DB call",async()=>{
    vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED","false");expect(createAiQualityFeedbackToken(snapshot())).toBeNull();
    expect((await post({})).statusCode).toBe(404);expect(transport).not.toHaveBeenCalled();
  });
  it.each(["tamper","signature","expired","random","version","future"])("rejects %s without lookup",async kind=>{
    let token=createAiQualityFeedbackToken(snapshot());
    if(kind==="tamper")token="A"+token.slice(1);
    if(kind==="signature")token=token.split(".")[0]+"."+randomBytes(32).toString("base64url");
    if(kind==="expired")token=createAiQualityFeedbackToken(snapshot(),Date.now()-8*86400000);
    if(kind==="random")token="random";
    if(kind==="future")token=createAiQualityFeedbackToken(snapshot(),Date.now()+60000);
    if(kind==="version"){
      const p=JSON.parse(Buffer.from(token.split(".")[0],"base64url"));p.v=2;
      const body=Buffer.from(JSON.stringify(p)).toString("base64url");
      const key=createHmac("sha256",process.env.AI_QUALITY_HMAC_SECRET).update("ai-quality-feedback-v1\0signing-key").digest();
      token=body+"."+createHmac("sha256",key).update(body).digest("base64url");
    }
    const result=await post({token,polarity:"positive"});expect(result.statusCode).toBe(400);
    expect(result.data).toEqual({ok:false,code:"invalid_request"});expect(transport).not.toHaveBeenCalled();
  });
  it.each(["severity","classification","capability_id","owner_action_required","conversation_id","message_id","user_text","assistant_text"])("rejects client authority %s",async field=>{
    expect((await post({token:createAiQualityFeedbackToken(snapshot()),polarity:"positive",[field]:"untrusted"})).statusCode).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([{polarity:"maybe"},{polarity:"positive",category:"other"},{polarity:"negative"},{polarity:"negative",category:"bad"}])("rejects enum %j",async vote=>{
    expect((await post({token:createAiQualityFeedbackToken(snapshot()),...vote})).statusCode).toBe(400);
    expect(transport).not.toHaveBeenCalled();
  });
  it("bounds streamed and parsed body before lookup",async()=>{
    expect((await post("x".repeat(3000))).statusCode).toBeGreaterThanOrEqual(400);
    const res=response();await handler({method:"POST",headers:{},async *[Symbol.asyncIterator](){yield "x".repeat(3000);}},res);
    expect(res.statusCode).toBe(413);expect(transport).not.toHaveBeenCalled();
  });
  it("unknown turn is the same generic rejection as bad token",async()=>{
    transport.mockResolvedValue(new Response(JSON.stringify({result:"rejected"})));
    const unknown=await post({token:createAiQualityFeedbackToken(snapshot()),polarity:"positive"});
    expect(unknown.data).toEqual((await post({token:"random",polarity:"positive"})).data);
  });
  it("posts only authoritative hashes to one Quality RPC; no model calls or raw text",async()=>{
    expect((await post({token:createAiQualityFeedbackToken(snapshot()),polarity:"negative",category:"other"})).data).toEqual({ok:true});
    expect(transport).toHaveBeenCalledTimes(1);
    const [url,init]=transport.mock.calls[0];expect(url).toBe("https://quality.test/rest/v1/rpc/submit_ai_quality_feedback");
    expect(JSON.parse(init.body)).toMatchObject({p_polarity:"negative",p_category:"other"});
    expect(init.body).not.toMatch(/synthetic-conversation|synthetic-turn|0988|example|user_text|assistant_text/);
  });
  it.each([429,500,404])("transport failure %i never returns SQL/secret or retries",async status=>{
    transport.mockResolvedValue(new Response("private error must not be read",{status}));
    const res=await post({token:createAiQualityFeedbackToken(snapshot()),polarity:"positive"});
    expect(res.statusCode).toBe(503);expect(JSON.stringify(res.data)).not.toContain("private");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rate limit response is bounded and not retried",async()=>{
    transport.mockResolvedValue(new Response(JSON.stringify({result:"limited"})));
    expect((await post({token:createAiQualityFeedbackToken(snapshot()),polarity:"positive"})).statusCode).toBe(429);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("Admin projection re-sanitizes text, strips identifiers/unknown metadata, caps context",()=>{
    const result=publicQualityDetail({id:"11111111-1111-4111-8111-111111111111",event_type:"negative_feedback",
      metadata:{conversation_id:"private",provider_call_count:0},execution:{raw_prompt:"private"},
      context:Array.from({length:100},()=>({relative:"current",role:"user",text:"我的電話0988-123-456，email abc@example.com"})),
      raw_conversation_id:"private",question:"0988-123-456",answer:"abc@example.com"});
    expect(result.context).toHaveLength(8);
    expect(JSON.stringify(result)).not.toMatch(/0988|abc@|private|raw_prompt|conversation_id/);
    expect(result.context[0].text).toContain("[PHONE]");expect(result.context[0].text).toContain("[EMAIL]");
    expect(publicQualityHealth({raw:"private",message_rows:2})).not.toHaveProperty("raw");
    expect(publicQualityOverview({raw:"private",categories:{other:1,raw:"private"}}).categories).not.toHaveProperty("raw");
  });
});
