import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { semanticDialogueCapabilities } from "../aiChat/dialogueCapabilities.js";
import { sanitizeAiQualityContext, sanitizeAiQualityMetadata } from "./metadata.js";
import { sanitizeAiQualityText } from "./privacy.js";

const migration = readFileSync(new URL("../../supabase/migrations/2026-09-09-ai-quality-foundation.sql", import.meta.url), "utf8");
const tables = ["ai_quality_conversations", "ai_quality_messages", "ai_quality_events",
  "ai_review_items", "ai_owner_decisions", "ai_eval_cases", "ai_daily_metrics"];
const rpcCalls = ["aggregate_ai_daily_metrics(current_date)", "delete_expired_ai_quality_data(1000)", "get_ai_quality_storage_metrics()"];
let db;
let sequence = 0;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await query(sql, params))[0];
const cleanup = async (batch = 1000) => (await one("select delete_expired_ai_quality_data($1) as result", [batch])).result;
const metrics = async () => (await one("select get_ai_quality_storage_metrics() as result")).result;
const aggregate = async (day) => (await one("select aggregate_ai_daily_metrics($1::date) as result", [day])).result;
async function rejected(sql, params = [], code = "23514") {
  await db.exec("savepoint expected_rejection");
  let error;
  try { await db.query(sql, params); } catch (caught) { error = caught; }
  await db.exec("rollback to savepoint expected_rejection; release savepoint expected_rejection");
  expect(error?.code).toBe(code);
}
async function conversation(age = 0) {
  const hash = createHmac("sha256", "synthetic-database-test-secret").update(String(++sequence)).digest("hex");
  return one("insert into ai_quality_conversations(conversation_key_hash,started_at,last_activity_at) values($1,now()-$2*interval '1 day',now()-$2*interval '1 day') returning *", [hash, age]);
}
async function message(conv, age = 0, role = "user", calls = 0) {
  // The future writer must sanitize before INSERT, not clean rows afterwards.
  return one("insert into ai_quality_messages(quality_conversation_id,turn_index,role,sanitized_text,created_at,provider_used,provider_call_count) values($1,$2,$3,$4,now()-$5*interval '1 day',$6,$7) returning *",
    [conv.id, ++sequence, role, sanitizeAiQualityText("宜蘭10位成人 0988-123-456"), age, calls > 0, calls]);
}
async function event(conv, msg = null, age = 0, type = "negative_feedback", reviewId = null) {
  return one("insert into ai_quality_events(quality_conversation_id,quality_message_id,created_at,event_type,review_item_id) values($1,$2,now()-$3*interval '1 day',$4,$5) returning *",
    [conv.id, msg?.id ?? null, age, type, reviewId]);
}
async function review() {
  return one("insert into ai_review_items(title,sanitized_example,sanitized_ai_answer,status,owner_action_required) values('Synthetic review',$1,'請管家確認','resolved',true) returning *",
    [sanitizeAiQualityText("test@example.invalid 詢問泳池")]);
}
beforeAll(async () => {
  db = new PGlite(); // In memory only. No path, connection string, Supabase client, or network.
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

describe("executed migration contract", () => {
  it("creates exactly seven tables, all with RLS and no public policies", async () => {
    const rows = await query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' order by relname");
    expect(rows.map((r) => r.relname)).toEqual([...tables].sort());
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    expect(await query("select * from pg_policies where schemaname='public'")).toEqual([]);
  });
  it("has UUID defaults, hashed-only identity and generated 30/90-day expiry", async () => {
    const conv = await conversation();
    const msg = await message(conv);
    const evt = await event(conv, msg);
    expect(conv.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(msg.sanitized_text).toBe("宜蘭10位成人 [PHONE]");
    for (const [table, id, days, source] of [
      ["ai_quality_conversations", conv.id, 30, "last_activity_at"],
      ["ai_quality_messages", msg.id, 30, "created_at"], ["ai_quality_events", evt.id, 90, "created_at"],
    ]) {
      const row = await one("select extract(epoch from (retention_expires_at-"+source+"))::int as seconds from "+table+" where id=$1", [id]);
      expect(row.seconds).toBe(days*86400);
      await rejected("update "+table+" set retention_expires_at=now() where id=$1", [id], "428C9");
    }
    const columns = await query("select column_name from information_schema.columns where table_name='ai_quality_conversations'");
    expect(columns.map((r) => r.column_name)).not.toEqual(expect.arrayContaining(["session_id"]));
    await rejected("insert into ai_quality_conversations(conversation_key_hash) values('raw-session')");
    await rejected("insert into ai_quality_conversations(conversation_key_hash) values($1)", [conv.conversation_key_hash], "23505");
  });
  it("enforces same-conversation message links and unique turn/role", async () => {
    const conv = await conversation();
    const other = await conversation();
    const msg = await message(conv);
    await rejected("insert into ai_quality_messages(quality_conversation_id,turn_index,role,sanitized_text) values($1,$2,$3,'safe')",
      [conv.id, msg.turn_index, msg.role], "23505");
    await rejected("insert into ai_quality_events(quality_conversation_id,quality_message_id,event_type) values($1,$2,'negative_feedback')", [other.id, msg.id], "23503");
    await rejected("delete from ai_quality_conversations where id=$1", [conv.id], "23001");
  });
  it.each([
    ["ai_quality_messages", "turn_index", "0"], ["ai_quality_messages", "role", "'system'"],
    ["ai_quality_messages", "provider_call_count", "1"], ["ai_quality_messages", "capability_id", "'unknown'"],
    ["ai_quality_events", "event_type", "'unregistered'"], ["ai_quality_events", "severity", "'fatal'"],
    ["ai_review_items", "status", "'published'"], ["ai_review_items", "classification", "'arbitrary'"],
    ["ai_review_items", "classification_confidence", "1.5"], ["ai_review_items", "occurrence_count", "0"],
    ["ai_daily_metrics", "message_count", "-1"],
  ])("rejects invalid %s.%s", async (table, field, expression) => {
    const conv = await conversation();
    await message(conv);
    await event(conv);
    await review();
    await aggregate("2026-01-01");
    await rejected("update "+table+" set "+field+"="+expression);
  });
  it("indexes retention, joins, timeline and review triage queries", async () => {
    const indexes = await query("select indexname,indexdef from pg_indexes where schemaname='public'");
    for (const name of [
      "ai_quality_conversations_conversation_key_hash_key", "ai_quality_conversations_retention_idx",
      "ai_quality_messages_retention_idx", "ai_quality_messages_created_idx", "ai_quality_events_retention_idx",
      "ai_quality_events_conversation_idx", "ai_quality_events_message_idx", "ai_quality_events_type_created_idx",
      "ai_quality_events_unresolved_idx", "ai_review_items_status_seen_idx",
      "ai_review_items_classification_seen_idx", "ai_review_items_owner_seen_idx",
      "ai_review_items_last_seen_idx", "ai_daily_metrics_pkey",
    ]) expect(indexes.map((r) => r.indexname)).toContain(name);
    expect(indexes.find((r) => r.indexname==="ai_quality_events_unresolved_idx").indexdef).toContain("WHERE (resolved_at IS NULL)");
    const fks = await query("select confdeltype from pg_constraint where contype='f'");
    expect(fks.length).toBe(6);
    expect(fks.every((r) => ["r", "n"].includes(r.confdeltype))).toBe(true);
  });
  it.each(semanticDialogueCapabilities.map((c) => c.capability_id))("matches JS/SQL allowlists for %s", async (capability_id) => {
    const metadata = sanitizeAiQualityMetadata({capability_id, response_kind:"informational_answer", provider_used:false});
    expect((await one("select ai_quality_valid_metadata($1::jsonb) as valid", [JSON.stringify(metadata)])).valid).toBe(true);
  });
  it.each([
    {Authorization:"synthetic-only"}, {provider_used:"true"}, {provider_call_count:33},
    {provider_call_count:1.5}, {response_kind:"arbitrary"}, {capability_id:null},
    {context:{message:"private"}}, {latency_ms:-1}, [],
  ])("rejects unsafe metadata at the DB boundary %#", async (metadata) => {
    const conv = await conversation();
    const evt = await event(conv);
    await rejected("update ai_quality_events set metadata_json=$1::jsonb where id=$2", [JSON.stringify(metadata), evt.id]);
  });
  it("validates minimal context at both boundaries", async () => {
    const value = sanitizeAiQualityContext({scenario_present:true,pending_missing_fields:["target_pet"],booking:{id:"not-for-storage"}});
    expect((await one("select ai_quality_valid_context($1::jsonb) as valid", [JSON.stringify(value)])).valid).toBe(true);
    for (const invalid of [{booking:{}}, {scenario_version:1.5}, {pending_missing_fields:["booking_uuid"]}, {pending_present:1}]) {
      expect((await one("select ai_quality_valid_context($1::jsonb) as valid", [JSON.stringify(invalid)])).valid).toBe(false);
    }
  });
});

describe("RLS and RPC access", () => {
  it.each(["anon", "authenticated"])("denies all browser CRUD and RPCs for %s", async (role) => {
    await db.exec("set local role "+role);
    for (const table of tables) {
      const field = table==="ai_daily_metrics" ? "metric_date" : "id";
      for (const sql of ["select * from "+table, "insert into "+table+" default values",
        "update "+table+" set "+field+"="+field, "delete from "+table]) {
        await rejected(sql, [], "42501");
      }
    }
    for (const call of rpcCalls) await rejected("select "+call, [], "42501");
    await db.exec("reset role");
  });
  it("has no PUBLIC grants and gives only service_role table/RPC access", async () => {
    const publicGrants = await query("select c.relname from pg_class c cross join lateral aclexplode(c.relacl) a where c.relname = any($1::text[]) and a.grantee=0", [tables]);
    expect(publicGrants).toEqual([]);
    for (const table of tables) {
      for (const privilege of ["SELECT","INSERT","UPDATE","DELETE"]) {
        expect((await one("select has_table_privilege('service_role',$1,$2) as allowed",[table,privilege])).allowed).toBe(true);
      }
    }
    const funcs = await query("select p.proname,p.prosecdef,p.proconfig from pg_proc p where p.proname=any($1::text[])",
      [["aggregate_ai_daily_metrics","delete_expired_ai_quality_data","get_ai_quality_storage_metrics"]]);
    expect(funcs).toHaveLength(3);
    expect(funcs.every((f) => f.prosecdef && f.proconfig.includes("search_path=public, pg_temp"))).toBe(true);
    await db.exec("set local role service_role");
    const conv = await conversation();
    await db.query("update ai_quality_conversations set has_escalation=true where id=$1", [conv.id]);
    expect((await metrics()).conversation_rows).toBe(1);
    await aggregate("2026-01-01");
    expect((await cleanup()).messages_deleted).toBe(0);
    await db.query("delete from ai_quality_conversations where id=$1", [conv.id]);
    expect((await metrics()).conversation_rows).toBe(0);
  });
  it("RLS still hides rows even if a browser role accidentally receives table grants", async () => {
    await conversation();
    await db.exec("grant select,insert,update,delete on ai_quality_conversations to anon; set local role anon");
    expect(await query("select * from ai_quality_conversations")).toEqual([]);
    expect(await query("update ai_quality_conversations set message_count=1 returning id")).toEqual([]);
    expect(await query("delete from ai_quality_conversations returning id")).toEqual([]);
    await rejected("insert into ai_quality_conversations(conversation_key_hash) values($1)", ["b".repeat(64)], "42501");
  });
});

describe("retention and permanent evidence", () => {
  it("deletes 30-day messages, retains 90-day events and self-contained permanent records", async () => {
    const conv = await conversation(91);
    const item = await review();
    const msg = await message(conv,31);
    const evt = await event(conv,msg,31,"negative_feedback",item.id);
    await db.query("insert into ai_owner_decisions(review_item_id,action_type,sanitized_owner_answer) values($1,'reply_once','safe answer')",[item.id]);
    await db.query("insert into ai_eval_cases(source_review_item_id,eval_type,sanitized_input) values($1,'regression','safe input')",[item.id]);
    const day = (await one("select (created_at at time zone 'Asia/Taipei')::date::text as day from ai_quality_messages where id=$1",[msg.id])).day;
    const before = await aggregate(day);
    expect((await metrics()).cleanup_due_count).toBe(1);
    expect(await cleanup()).toEqual({skipped:false,messages_deleted:1,events_deleted:0,conversations_deleted:0});
    const retained = await one("select * from ai_quality_events where id=$1",[evt.id]);
    expect(retained.quality_message_id).toBeNull();
    expect(retained.quality_conversation_id).toBe(conv.id);
    expect(retained.review_item_id).toBe(item.id);
    expect((await one("select sanitized_example from ai_review_items where id=$1",[item.id])).sanitized_example).toBe("[EMAIL] 詢問泳池");
    const after = await aggregate(day);
    expect(after.message_count).toBe(before.message_count);
    expect(after.negative_feedback_count).toBe(before.negative_feedback_count);
    expect(after.finalized_at).not.toBeNull();
    expect(await metrics()).toMatchObject({message_rows:0,event_rows:1,conversation_rows:1,review_rows:1,owner_decision_rows:1,eval_rows:1});
    await rejected("delete from ai_review_items where id=$1",[item.id],"23001");
    await db.query("update ai_quality_events set created_at=now()-interval '91 days' where id=$1",[evt.id]);
    expect(await cleanup()).toEqual({skipped:false,messages_deleted:0,events_deleted:1,conversations_deleted:1});
    expect(await metrics()).toMatchObject({conversation_rows:0,event_rows:0,review_rows:1,owner_decision_rows:1,eval_rows:1});
    expect((await aggregate(day)).message_count).toBe(1);
  });
  it("enforces exact expiry boundaries and retains conversations with live children", async () => {
    const conv = await conversation(100);
    await message(conv,30);
    await message(conv,29.99);
    await event(conv,null,90);
    await event(conv,null,89.99);
    expect(await cleanup()).toEqual({skipped:false,messages_deleted:1,events_deleted:1,conversations_deleted:0});
    expect(await metrics()).toMatchObject({message_rows:1,event_rows:1,conversation_rows:1,cleanup_due_count:0});
  });
  it("removes expired empty conversations but never active ones", async () => {
    await conversation(31);
    await conversation(29);
    expect((await metrics()).cleanup_due_count).toBe(1);
    expect((await cleanup()).conversations_deleted).toBe(1);
    expect((await metrics()).conversation_rows).toBe(1);
  });
  it("bounds each batch and seals the whole day before partial deletion", async () => {
    const conv = await conversation(100);
    const msg = await message(conv,95,"assistant",2);
    await message(conv,95,"assistant",1);
    await event(conv,null,95,"positive_feedback");
    await event(conv,null,95,"negative_feedback");
    const day = (await one("select (created_at at time zone 'Asia/Taipei')::date::text as day from ai_quality_messages where id=$1",[msg.id])).day;
    const first = await cleanup(1);
    expect(first).toMatchObject({messages_deleted:1,events_deleted:1,conversations_deleted:0});
    const sealed = await aggregate(day);
    expect(sealed).toMatchObject({message_count:2,provider_call_count:3,positive_feedback_count:1,negative_feedback_count:1});
    await cleanup(1);
    expect(await aggregate(day)).toEqual(sealed);
    expect(await cleanup(1)).toEqual({skipped:false,messages_deleted:0,events_deleted:0,conversations_deleted:0});
  });
  it.each([0,-1,10001,null])("rejects invalid cleanup batch %s", async (batch) => {
    await rejected("select delete_expired_ai_quality_data($1)",[batch],"22023");
  });
});

describe("daily aggregation and storage metrics", () => {
  it("returns truthful zero counts and null oldest message for an empty store", async () => {
    expect(await metrics()).toEqual({conversation_rows:0,message_rows:0,event_rows:0,review_rows:0,
      owner_decision_rows:0,eval_rows:0,daily_metric_rows:0,oldest_message_at:null,cleanup_due_count:0});
    const empty = await aggregate("2026-01-01");
    for (const [key,value] of Object.entries(empty)) if (key.endsWith("_count")) expect(value).toBe(0);
    expect(await aggregate("2026-01-01")).toEqual(empty);
    expect((await metrics()).daily_metric_rows).toBe(1);
    await rejected("select aggregate_ai_daily_metrics(null)",[],"22023");
  });
  it("aggregates Taipei days without join multiplication or counting user provider flags", async () => {
    const conv = await conversation();
    const msg = await message(conv,0,"assistant",2);
    const user = await message(conv);
    const item = await review();
    await db.query("update ai_quality_conversations set started_at='2026-09-01T16:00:00Z',last_activity_at='2026-09-02T15:59:59Z' where id=$1",[conv.id]);
    await db.query("update ai_quality_messages set created_at='2026-09-02T15:59:59Z',generic_fallback=true,clarification=true");
    await db.query("update ai_review_items set first_seen_at='2026-09-01T16:00:00Z',last_seen_at='2026-09-01T16:00:00Z' where id=$1",[item.id]);
    for (const type of ["positive_feedback","negative_feedback","context_lost_signal","wrong_mutation_signal","provider_schema_reject","provider_error"]) {
      const evt = await event(conv,msg,0,type);
      await db.query("update ai_quality_events set created_at='2026-09-01T16:00:00Z' where id=$1",[evt.id]);
    }
    const result = await aggregate("2026-09-02");
    expect(result).toMatchObject({conversation_count:1,message_count:2,positive_feedback_count:1,negative_feedback_count:1,
      generic_fallback_count:1,clarification_count:1,context_lost_signal_count:1,wrong_mutation_signal_count:1,
      provider_call_count:2,provider_schema_reject_count:1,provider_error_count:1,review_item_count:1,owner_required_count:1});
    expect(await aggregate("2026-09-02")).toEqual(result);
    expect((await aggregate("2026-09-01")).message_count).toBe(0);
    await db.query("update ai_quality_messages set created_at='2026-09-02T16:00:00Z' where id=$1",[user.id]);
    expect((await aggregate("2026-09-02")).message_count).toBe(1);
    expect((await aggregate("2026-09-03")).message_count).toBe(1);
    expect(new Date((await metrics()).oldest_message_at).toISOString()).toBe("2026-09-02T15:59:59.000Z");
  });
});
