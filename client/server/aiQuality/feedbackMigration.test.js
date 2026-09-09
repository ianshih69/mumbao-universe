import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { prepareAiQualityTurn } from "./observer.js";
import { buildAiQualityTurnSnapshot } from "./snapshot.js";
import { createAiQualityFeedbackToken } from "./feedbackToken.js";
import feedbackHandler from "../../api/ai-quality-feedback.js";
let db;
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const rpc=async(name,args=[]) => (await query("select "+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") as result",args))[0].result;
const record=async(turn="one",extra={})=>{
  const snapshot=buildAiQualityTurnSnapshot({conversationId:"synthetic-conversation",turnId:turn,
    userText:"我的電話0988-123-456，email abc@example.com，想問11/1住宿。",
    assistantText:"有停車位。",beforeContext:{},afterContext:{},
    route:{knowledgeGap:true},metadata:{final_response_kind:"knowledge_gap"},...extra});
  const p=prepareAiQualityTurn(snapshot);
  await rpc("record_ai_quality_turn",[JSON.stringify(p)]);
  return {p,snapshot};
};
const vote=(p,polarity="positive",category=null)=>rpc("submit_ai_quality_feedback",[p.conversation_key_hash,p.turn_key_hash,polarity,category]);
beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table admin_permissions(code text primary key,module text,action text,description text);");
  for(const file of ["2026-09-09-ai-quality-foundation.sql","2026-09-09-ai-quality-runtime-observer.sql",
    "2026-09-10-ai-quality-feedback-admin.sql","2026-09-10-ai-quality-feedback-admin.sql"])
    await db.exec(readFileSync(new URL("../../supabase/migrations/"+file,import.meta.url),"utf8"));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  vi.stubEnv("AI_QUALITY_HMAC_SECRET",randomBytes(32).toString("hex"));
  vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED","true");vi.stubEnv("AI_QUALITY_FEEDBACK_ENABLED","true");
  vi.stubEnv("SUPABASE_URL","https://quality.test");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-service");
  await db.exec("begin");
});
afterEach(async()=>{await db.exec("rollback");vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("Phase 1C executed local migration",()=>{
  it("one positive active record, repeat idempotency and accurate counters",async()=>{
    const {p}=await record();await vote(p);await vote(p);
    expect(await query("select * from ai_quality_events where event_type='positive_feedback'")).toHaveLength(1);
    expect(await query("select * from ai_quality_events where event_type='negative_feedback'")).toHaveLength(0);
    expect(await rpc("read_ai_quality_overview",[7])).toMatchObject({positive:1,negative:0,problem_turns:1,conversations:1});
    expect(Number((await query("select quality_event_count from ai_quality_conversations"))[0].quality_event_count)).toBe(2);
  });
  it("positive/negative/category switching has one active state and latest category",async()=>{
    const {p}=await record();await vote(p);await vote(p,"negative","misunderstood_question");await vote(p,"negative","incorrect_answer");
    const [row]=await query("select * from ai_quality_events where event_type like '%feedback'");
    expect(row.feedback_category).toBe("incorrect_answer");
    expect(await rpc("read_ai_quality_overview",[30])).toMatchObject({positive:0,negative:1,categories:{incorrect_answer:1}});
    const detail=await rpc("read_ai_quality_detail",[row.id]);
    expect(detail.context.map(t=>t.text).join()).toContain("[PHONE]");
    expect(detail.context.map(t=>t.text).join()).toContain("[EMAIL]");
    expect(JSON.stringify(detail)).not.toMatch(/0988|abc@|synthetic-conversation|conversation_key_hash|quality_conversation_id/);
    await vote(p);expect(await rpc("read_ai_quality_overview",[7])).toMatchObject({positive:1,negative:0});
    expect((await query("select has_negative_feedback from ai_quality_conversations"))[0].has_negative_feedback).toBe(false);
  });
  it("100 real handler POSTs use atomic rate limiting, no duplicate active rows or model calls",async()=>{
    const {snapshot}=await record();const token=createAiQualityFeedbackToken(snapshot);
    const transport=vi.fn(async(url,options)=>{
      expect(url).toBe("https://quality.test/rest/v1/rpc/submit_ai_quality_feedback");
      const b=JSON.parse(options.body);
      return new Response(JSON.stringify(await rpc("submit_ai_quality_feedback",[b.p_conversation,b.p_turn,b.p_polarity,b.p_category])));
    });vi.stubGlobal("fetch",transport);
    const statuses=[];
    for(let i=0;i<100;i++){
      const res={statusCode:0,setHeader(){},end(){}};
      await feedbackHandler({method:"POST",headers:{},body:{token,polarity:"negative",category:"other"}},res);
      statuses.push(res.statusCode);
    }
    expect(statuses.filter(s=>s===200)).toHaveLength(12);expect(statuses.filter(s=>s===429)).toHaveLength(88);
    expect(await query("select * from ai_quality_events where event_type='negative_feedback'")).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(100);
    await db.exec("update ai_quality_messages set feedback_window_at=now()-interval '2 minutes'");
    const p=prepareAiQualityTurn(snapshot);expect(await vote(p)).toEqual({result:"saved"});
  });
  it("concurrent votes serialize onto one row",async()=>{
    const {p}=await record();
    const results=await Promise.all(Array.from({length:8},(_,i)=>vote(p,i%2 ? "positive":"negative",i%2 ? null:"other")));
    expect(results.every(r=>r.result==="saved")).toBe(true);
    expect(await query("select * from ai_quality_events where event_type like '%feedback'")).toHaveLength(1);
  });
  it.each(["unknown","expired","missing"])("rejects %s turn without events",async mode=>{
    const {p}=await record();
    if(mode==="unknown")p.turn_key_hash="0".repeat(64);
    if(mode==="expired")await db.exec("update ai_quality_messages set created_at=now()-interval '31 days'");
    if(mode==="missing")await db.exec("delete from ai_quality_messages");
    expect(await vote(p)).toEqual({result:"rejected"});
    expect(await query("select * from ai_quality_events where event_type like '%feedback'")).toHaveLength(0);
  });
  it.each(["anon","authenticated"])("denies %s every new RPC and table",async role=>{
    const {p}=await record();
    await db.exec("set local role "+role);
    for(const [name,args] of [
      ["submit_ai_quality_feedback",[p.conversation_key_hash,p.turn_key_hash,"positive",null]],
      ["read_ai_quality_overview",[7]],["list_ai_quality_events",[]],
      ["read_ai_quality_detail",["11111111-1111-4111-8111-111111111111"]],
      ["review_ai_quality_event",["11111111-1111-4111-8111-111111111111"]],
      ["get_ai_quality_storage_metrics",[]],
    ]){
      await db.exec("savepoint denied");await expect(rpc(name,args)).rejects.toMatchObject({code:"42501"});
      await db.exec("rollback to savepoint denied");
    }
    for(const name of ["ai_quality_conversations","ai_quality_messages","ai_quality_events"]){
      await db.exec("savepoint denied");await expect(query("select * from "+name)).rejects.toMatchObject({code:"42501"});
      await db.exec("rollback to savepoint denied");
    }
  });
  it("server role only; RLS preserved and permission grants not broadened",async()=>{
    await db.exec("set local role service_role");
    const {p}=await record();expect(await vote(p)).toEqual({result:"saved"});
    expect(await rpc("list_ai_quality_events",[])).toHaveProperty("events");
    await db.exec("reset role");
    expect(await query("select * from pg_policies where schemaname='public'")).toEqual([]);
    expect((await query("select relrowsecurity from pg_class where relname in ('ai_quality_events','ai_quality_messages')")).every(r=>r.relrowsecurity)).toBe(true);
    expect(await query("select code from admin_permissions order by code")).toEqual([{code:"ai_quality.review"},{code:"ai_quality.view"}]);
  });
  it("review is not resolution or policy; duplicate vote preserves review, changed vote resets it",async()=>{
    const {p}=await record();await vote(p,"negative","other");
    const [row]=await query("select * from ai_quality_events where event_type='negative_feedback'");
    expect(await rpc("review_ai_quality_event",[row.id])).toEqual({reviewed:true});
    await vote(p,"negative","other");expect((await rpc("read_ai_quality_detail",[row.id])).reviewed_at).not.toBeNull();
    expect((await query("select resolved_at from ai_quality_events where id=$1",[row.id]))[0].resolved_at).toBeNull();
    await vote(p,"negative","too_verbose");expect((await rpc("read_ai_quality_detail",[row.id])).reviewed_at).toBeNull();
    for(const table of ["ai_review_items","ai_owner_decisions","ai_eval_cases","ai_daily_metrics"])
      expect(await query("select * from "+table)).toEqual([]);
  });
  it("25-row keyset pagination with no duplicates, filters, limited context and no raw references",async()=>{
    for(let i=1;i<=30;i++)await record(String(i));
    const first=await rpc("list_ai_quality_events",[]);expect(first.events).toHaveLength(25);expect(first.has_more).toBe(true);
    const last=first.events.at(-1);
    const second=await rpc("list_ai_quality_events",[7,"all","all","pending",last.created_at,last.id]);
    expect(second.events).toHaveLength(5);expect(second.has_more).toBe(false);
    expect(new Set([...first.events,...second.events].map(e=>e.id)).size).toBe(30);
    expect((await rpc("list_ai_quality_events",[7,"negative","all","pending"])).events).toEqual([]);
    expect((await rpc("list_ai_quality_events",[7,"fallback","all","pending"])).events).toHaveLength(25);
    const [middle]=await query("select e.id from ai_quality_events e join ai_quality_messages m on m.id=e.quality_message_id where m.turn_index=15");
    const detail=await rpc("read_ai_quality_detail",[middle.id]);
    expect(detail.context).toHaveLength(8);
    expect(detail.context.filter(t=>t.relative==="before")).toHaveLength(4);
    expect(detail.context.filter(t=>t.relative==="current")).toHaveLength(2);
    expect(detail.context.filter(t=>t.relative==="after")).toHaveLength(2);
    expect(JSON.stringify([first,second,detail])).not.toMatch(/conversation_key_hash|quality_conversation_id|turn_key_hash|0988|abc@/);
  });
  it("retention metrics are real; 30-day text expiry does not expose expired text",async()=>{
    const {p}=await record();await vote(p,"negative","other");
    const [row]=await query("select id from ai_quality_events where event_type='negative_feedback'");
    const health=await rpc("get_ai_quality_storage_metrics",[]);
    expect(health).toMatchObject({conversation_rows:1,message_rows:2,event_rows:2,review_rows:0,eval_rows:0,cleanup_due_count:0});
    await db.exec("update ai_quality_messages set created_at=now()-interval '31 days'");
    expect((await rpc("read_ai_quality_detail",[row.id])).context).toEqual([]);
    expect((await rpc("get_ai_quality_storage_metrics",[])).cleanup_due_count).toBe(2);
    expect((await rpc("list_ai_quality_events",[])).events.every(e=>e.question===null&&e.answer===null)).toBe(true);
  });
  it("large recent histories report a bounded sample explicitly, not fake all-time totals",async()=>{
    await record();
    await db.exec("insert into ai_quality_events(quality_conversation_id,event_type,turn_key_hash,created_at) select c.id,'generic_fallback',repeat(md5(i::text),2),now()-i*interval '1 second' from ai_quality_conversations c cross join generate_series(1,5001) i");
    const result=await rpc("read_ai_quality_overview",[30]);
    expect(result).toMatchObject({limited:true,sample_limit:5000,problem_turns:5000});
    expect((await rpc("list_ai_quality_events",[])).events).toHaveLength(25);
    expect(await query("select * from ai_daily_metrics")).toEqual([]);
  });
});
