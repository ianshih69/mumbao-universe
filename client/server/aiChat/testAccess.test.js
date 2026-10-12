import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatTestAccessHandler, requireChatTestAccess, CHAT_TEST_COOKIE } from "./testAccess.js";
import gateway from "../../api/ai-chat.js";
import lineHandler from "../../api/line-liff-session.js";
import qualityGateway from "../../api/ai-quality.js";
import adminGateway from "../../api/admin-chat.js";

let sequence = 0;
const salt = "a".repeat(32);
const hash = salt + ":" + scryptSync("123", salt, 32).toString("hex");
const response = () => ({ statusCode: 0, headers: {}, setHeader(k,v) { this.headers[k]=v; },
  end(body) { this.body=JSON.parse(body); } });
const request = (extra={}) => ({ method:"GET", headers:{host:"preview.example"},
  socket:{remoteAddress:"synthetic-"+(++sequence)}, ...extra });
async function unlock(extra={}) {
  const req=request({method:"POST",headers:{host:"preview.example","content-type":"application/json"},
    body:{password:"123"},...extra});
  const res=response(); await chatTestAccessHandler(req,res); return {req,res};
}
function grantCookie(res) { return res.headers["Set-Cookie"][0].split(";")[0]; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
  vi.stubEnv("AI_CHAT_TEST_MODE","true");
  vi.stubEnv("AI_CHAT_TEST_PASSWORD_HASH",hash);
  vi.stubEnv("AI_CHAT_TEST_SIGNING_SECRET","s".repeat(64));
  vi.stubEnv("VERCEL","");
  vi.stubGlobal("fetch",vi.fn(() => { throw Error("No network allowed"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("public chat test gate", () => {
  it("does not grant access or touch storage/network just by checking status",async()=>{
    const res=response();await chatTestAccessHandler(request(),res);
    expect(res.body.authorized).toBe(false);expect(res.headers["Set-Cookie"]).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["history","message","delete-session","create","unknown"])("blocks %s before ownership, writes and model calls",async action=>{
    const res=response();await gateway(request({query:{action},method:"POST",body:{}}),res);
    expect(res.statusCode).toBe(403);expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks direct LINE bind/restore/create before LINE verification",async()=>{
    const res=response();await lineHandler(request({method:"POST",body:{idToken:"untrusted"}}),res);
    expect(res.statusCode).toBe(403);expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks public feedback without changing Admin quality routing",async()=>{
    const res=response();await qualityGateway(request({url:"/api/ai-quality-feedback",method:"POST"}),res);
    expect(res.statusCode).toBe(403);expect(fetch).not.toHaveBeenCalled();
    const admin=response();await qualityGateway(request({url:"/api/admin-ai-quality"}),admin);
    expect(admin.body.errorCode).not.toBe("chat_test_access_required");
  });
  it("Admin chat retains its own auth instead of requiring the visitor cookie",async()=>{
    const res=response();await adminGateway(request({query:{action:"sessions"}}),res);
    expect(res.statusCode).toBe(401);expect(res.body.errorCode).not.toBe("chat_test_access_required");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("incorrect password cannot issue the authorization cookie",async()=>{
    const {res}=await unlock({body:{password:"wrong"}});
    expect(res.statusCode).toBe(403);
    expect(res.headers["Set-Cookie"]).not.toContain(CHAT_TEST_COOKIE+"=");
  });
  it.each(["GET","POST"])("verified Admin %s reads/replies without any test cookie (synthetic DB)",async method=>{
    vi.stubEnv("SUPABASE_URL","https://synthetic.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-only");
    const session={id:"11111111-1111-4111-8111-111111111111",status:"human_takeover",support_status:"human_takeover",should_ai_reply:false,ai_paused_until:null};
    const message={id:"synthetic-message",session_id:session.id,sender:"human",message:"synthetic reply",created_at:"2026-10-12T00:00:00Z"};
    const transport=vi.fn(async(url,options={})=>{
      expect(String(url)).toMatch(/^https:\/\/synthetic\.invalid\//);
      if(url.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"synthetic-admin"}));
      if(url.includes("/admin_profiles?"))return new Response(JSON.stringify([{id:"synthetic-profile",auth_user_id:"synthetic-admin",role_code:"admin",is_active:true}]));
      if(url.includes("/chat_sessions?"))return new Response(JSON.stringify([session]));
      if(url.includes("/chat_messages"))return new Response(JSON.stringify([message]));
      throw Error("Unexpected mock path");
    });
    vi.stubGlobal("fetch",transport);
    const res=response();
    await adminGateway(request({method,headers:{host:"preview.example",authorization:"Bearer synthetic"},
      query:{action:method==="GET"?"messages":"send-human-message",sessionId:session.id},
      body:{content:"synthetic reply"}}),res);
    expect(res.statusCode).toBe(200);
    expect(transport).toHaveBeenCalled();
    expect(res.body.errorCode).toBeUndefined();
  });
  it("correct password issues host-only, secure, HttpOnly, SameSite grant",async()=>{
    const {res}=await unlock();
    expect(res.statusCode).toBe(200);
    expect(res.headers["Set-Cookie"][0]).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=7200");
    expect(res.headers["Set-Cookie"][0]).not.toContain("Domain=");
    expect(res.headers["Cache-Control"]).toContain("no-store");
    expect(JSON.stringify(res.body)).not.toContain("123");
    expect(requireChatTestAccess(request({headers:{host:"preview.example",cookie:grantCookie(res)}}),response())).toBe(true);
  });
  it("reload preserves valid access; it expires exactly at two hours",async()=>{
    const {res}=await unlock();const req=request({headers:{host:"preview.example",cookie:grantCookie(res)}});
    const check=response();await chatTestAccessHandler(req,check);expect(check.body.authorized).toBe(true);
    vi.advanceTimersByTime(7200000);
    const expired=response();expect(requireChatTestAccess(req,expired)).toBe(false);
    expect(expired.statusCode).toBe(403);
  });
  it("tampering, duplicate cookies and cross-deployment reuse fail closed",async()=>{
    const {res}=await unlock();const cookie=grantCookie(res);
    for(const headers of [
      {host:"preview.example",cookie:cookie.slice(0,-1)+"x"},
      {host:"preview.example",cookie:cookie+"; "+cookie},
      {host:"production.example",cookie},
      {host:"preview.example",cookie,origin:"https://evil.example"},
    ]) expect(requireChatTestAccess(request({headers}),response())).toBe(false);
  });
  it.each(["AI_CHAT_TEST_PASSWORD_HASH","AI_CHAT_TEST_SIGNING_SECRET"])("missing %s refuses even a previously valid grant",async name=>{
    const {res}=await unlock();vi.stubEnv(name,"");
    const check=response();expect(requireChatTestAccess(request({headers:{host:"preview.example",cookie:grantCookie(res)}}),check)).toBe(false);
    expect(check.statusCode).toBe(503);
  });
  it("only explicit false disables the gate; missing flag does not",async()=>{
    vi.stubEnv("AI_CHAT_TEST_MODE","");
    expect(requireChatTestAccess(request(),response())).toBe(false);
    vi.stubEnv("AI_CHAT_TEST_MODE","false");
    expect(requireChatTestAccess(request(),response())).toBe(true);
  });
  it("rotation invalidates old grants",async()=>{
    const {res}=await unlock();vi.stubEnv("AI_CHAT_TEST_SIGNING_SECRET","n".repeat(64));
    expect(requireChatTestAccess(request({headers:{host:"preview.example",cookie:grantCookie(res)}}),response())).toBe(false);
  });
  it("same-origin protection rejects a foreign unlock request",async()=>{
    const {res}=await unlock({headers:{host:"preview.example",origin:"https://evil.example","content-type":"application/json"}});
    expect(res.statusCode).toBe(403);expect(res.headers["Set-Cookie"]).toBeUndefined();
  });
  it("fifth attempt is the limit; clearing cookies does not bypass warm instance limit",async()=>{
    const socket={remoteAddress:"limit-"+(++sequence)};
    for(let i=0;i<5;i++) expect((await unlock({socket,body:{password:"wrong"}})).res.statusCode).toBe(403);
    const {res}=await unlock({socket});expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("900");
    vi.advanceTimersByTime(900001);
    expect((await unlock({socket})).res.statusCode).toBe(200);
  });
  it("signed attempts survive a different instance IP key",async()=>{
    let cookie="";
    for(let i=0;i<5;i++){
      const {res}=await unlock({headers:{host:"preview.example","content-type":"application/json",cookie},body:{password:"wrong"}});
      cookie=res.headers["Set-Cookie"].split(";")[0];
    }
    const {res}=await unlock({headers:{host:"preview.example","content-type":"application/json",cookie}});
    expect(res.statusCode).toBe(429);
  });
  it.each([{}, {password:123}, {password:"a".repeat(129)}, {password:"123",admin:true}])("invalid payload rejects safely %j",async body=>{
    expect((await unlock({body})).res.statusCode).toBe(400);
  });
  it("valid cookie reaches original handler validation but grants no session ownership",async()=>{
    const {res}=await unlock();
    const result=response();await gateway(request({method:"DELETE",query:{action:"history"},
      headers:{host:"preview.example",cookie:grantCookie(res)}}),result);
    expect(result.statusCode).toBe(405);expect(fetch).not.toHaveBeenCalled();
  });
});
