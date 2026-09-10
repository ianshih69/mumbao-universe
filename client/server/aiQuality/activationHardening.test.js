import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const root = new URL("../../supabase/migrations/", import.meta.url);
const sql = readFileSync(new URL("2026-09-10-ai-quality-activation-hardening.sql", root), "utf8");
const hash = value => createHash("sha256").update(String(value)).digest("hex");
const metadata = { provider_used: false, provider_call_count: 0, scenario_changed: false,
  pending_created: false, pending_consumed: false, generic_fallback: false, clarification: false };
const payload = (turn = 1, extra = {}) => ({
  conversation_key_hash: hash("synthetic"), turn_key_hash: "1" + hash(turn).slice(1),
  user_text: "sanitized question [NAME]", assistant_text: "sanitized answer [ADDRESS]",
  metadata, context: { scenario_present: false, pending_present: false }, events: [], ...extra,
});
const signal = [{ event_type: "generic_fallback", severity: "low", metadata }];
let db;
const query = async (text, params = []) => (await db.query(text, params)).rows;
const rpc = async (name, args = []) =>
  (await query("select " + name + "(" + args.map((_, i) => "$" + (i + 1)).join(",") + ") as result", args))[0].result;
const record = p => rpc("record_ai_quality_turn", [JSON.stringify(p)]);
const maintain = () => rpc("run_ai_quality_maintenance");
const vote = (p, polarity = "negative") => rpc("submit_ai_quality_feedback",
  [p.conversation_key_hash, p.turn_key_hash, polarity, polarity === "negative" ? "other" : null]);
const rows = () => query("select turn_index,role,sanitized_text,capture_retention_days from ai_quality_messages order by turn_index,role");
const denied = async (run, code) => {
  await db.exec("savepoint expected_failure");
  await expect(run()).rejects.toMatchObject({ code });
  await db.exec("rollback to savepoint expected_failure");
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table admin_permissions(code text primary key,module text,action text,description text);");
  for (const name of ["2026-09-09-ai-quality-foundation.sql", "2026-09-09-ai-quality-runtime-observer.sql", "2026-09-10-ai-quality-feedback-admin.sql"])
    await db.exec(readFileSync(new URL(name, root), "utf8"));
  // The ordered hardening migration itself must be replay-safe.
  await db.exec(sql);
  await db.exec(sql);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

describe("A1.1 executed capture and maintenance contracts", () => {
  it.each(["missing", "stale", "deleted"])("fails closed when maintenance is %s, before any observation writes", async mode => {
    if (mode === "stale") await db.exec("update ai_quality_maintenance_state set last_completed_at=now()-interval '37 hours'");
    if (mode === "deleted") await db.exec("delete from ai_quality_maintenance_state");
    await denied(() => record(payload()), "55000");
    expect(await rows()).toEqual([]);
    expect(await query("select * from ai_quality_conversations")).toEqual([]);
  });
  it("maintenance establishes freshness and ordinary turns retain an eight-day feedback window", async () => {
    expect(await maintain()).toMatchObject({ skipped: false, capture_mode: "normal", cleanup_due_count: 0 });
    await record(payload());
    expect((await rows()).every(r => r.capture_retention_days === 8)).toBe(true);
    expect(await query("select distinct extract(epoch from retention_expires_at-created_at)/86400 as days from ai_quality_messages"))
      .toEqual([{ days: "8.0000000000000000" }]);
    expect((await query("select * from ai_quality_maintenance_state"))[0].last_completed_at).not.toBeNull();
  });
  it("one in sixteen hash buckets is a stable bounded clean sample, never random per retry", async () => {
    await maintain();
    for (const digit of "0123456789abcdef") await record(payload(digit, { turn_key_hash: digit + hash(digit).slice(1) }));
    expect((await rows()).filter(r => r.capture_retention_days === 30)).toHaveLength(2);
    await record(payload("0", { turn_key_hash: "0" + hash("0").slice(1) }));
    expect(await rows()).toHaveLength(32);
  });
  it("signals preserve the prior two, current and next one turns, not an unbounded conversation", async () => {
    await maintain();
    for (let turn = 1; turn <= 7; turn++) await record(payload(turn, { events: turn === 4 ? signal : [] }));
    expect((await rows()).map(r => r.capture_retention_days)).toEqual([8,8,30,30,30,30,30,30,30,30,8,8,8,8]);
  });
  it("negative feedback upgrades bounded context without uploading or recovering a raw transcript", async () => {
    await maintain();
    for (let i = 1; i <= 6; i++) await record(payload(i));
    expect(await vote(payload(4))).toEqual({ result: "saved" });
    expect((await rows()).map(r => r.capture_retention_days)).toEqual([8,8,30,30,30,30,30,30,30,30,8,8]);
    const [event] = await query("select id from ai_quality_events where event_type='negative_feedback'");
    const detail = await rpc("read_ai_quality_detail", [event.id]);
    expect(detail.context).toHaveLength(8);
    expect(JSON.stringify(detail)).toContain("[NAME]");
    await vote(payload(4), "positive");
    await vote(payload(4));
    expect(await query("select * from ai_quality_events")).toHaveLength(1);
    expect(Number((await query("select quality_event_count from ai_quality_conversations"))[0].quality_event_count)).toBe(1);
  });
  it("a late signal or feedback does not revive expired context", async () => {
    await maintain();
    await record(payload(1));
    await db.exec("update ai_quality_messages set created_at=now()-interval '9 days'");
    await record(payload(2, { events: signal }));
    expect((await rows()).filter(r => r.turn_index === 1).every(r => r.capture_retention_days === 8)).toBe(true);
    expect(await vote(payload(1))).toEqual({ result: "rejected" });
  });
  it.each(["normal", "warning", "critical"])("%s capture preserves signals and applies the clean transcript budget", async mode => {
    await maintain();
    await query("update ai_quality_maintenance_state set capture_mode=$1", [mode]);
    const text = "sanitized context ".repeat(100);
    await record(payload(1, { user_text: text, assistant_text: text }));
    await record(payload(2, { user_text: text, assistant_text: text, events: signal }));
    const result = await rows();
    expect(result.filter(r => r.turn_index === 2).every(r => r.sanitized_text === text)).toBe(true);
    if (mode === "critical") {
      expect(result.filter(r => r.turn_index === 1).every(r => r.sanitized_text.length <= 256 && r.sanitized_text.endsWith("[CAPACITY_LIMIT]"))).toBe(true);
    } else expect(result.every(r => r.sanitized_text === text)).toBe(true);
  });
  it("critical mode disables clean sampling; negative feedback retains the bounded sanitized excerpt", async () => {
    await maintain();
    await db.exec("update ai_quality_maintenance_state set capture_mode='critical'");
    const p = payload(1, { turn_key_hash: "0" + hash("sample").slice(1), user_text: "x".repeat(1000), assistant_text: "y".repeat(1000) });
    await record(p);
    expect((await rows()).every(r => r.capture_retention_days === 8)).toBe(true);
    await vote(p);
    expect((await rows()).every(r => r.capture_retention_days === 30 && r.sanitized_text.length <= 256)).toBe(true);
    const [e] = await query("select id from ai_quality_events");
    expect((await rpc("read_ai_quality_detail", [e.id])).context).toHaveLength(2);
    expect(JSON.stringify(await rows())).not.toContain("x".repeat(241));
  });
  it.each([0, 1, 230, 235, 239, 240, 241, 8000])("bounded excerpt handles length %i and does not cut a privacy placeholder", async length => {
    const text = "x".repeat(length) + "[PRIVACY_REDACTED]";
    const value = await rpc("ai_quality_bounded_excerpt", [text]);
    expect(value.length).toBeLessThanOrEqual(256);
    expect(value.replace(/\[[A-Z_]+\]/g, "")).not.toContain("[");
  });
  it("retention spans remain UTC-exact under a DST-observing session timezone", async () => {
    await maintain();
    await record(payload());
    await db.exec("set local timezone='America/New_York';update ai_quality_messages set created_at='2026-03-07T12:00:00Z'");
    const result = await query("select extract(epoch from retention_expires_at-created_at)::integer seconds from ai_quality_messages");
    expect(result.every(r => r.seconds === 8 * 86400)).toBe(true);
  });
  it("mixed eight/thirty-day cleanup is bounded, seals complete metrics and is retry-idempotent", async () => {
    await maintain();
    await record(payload(1)); await record(payload(2, { turn_key_hash: "0" + hash("long").slice(1) }));
    await db.exec("update ai_quality_messages set created_at=(now() at time zone 'Asia/Taipei')::date - interval '9 days'");
    const day = (await query("select (created_at at time zone 'Asia/Taipei')::date::text as metric_day from ai_quality_messages limit 1"))[0].metric_day;
    expect(await rpc("run_ai_quality_maintenance", [1, 1])).toMatchObject({ batches: 1, messages_deleted: 1, cleanup_due_count: 1 });
    const before = await rpc("aggregate_ai_daily_metrics", [day]);
    expect(before.message_count).toBe(4); expect(before.finalized_at).not.toBeNull();
    expect(await rpc("run_ai_quality_maintenance", [1, 1])).toMatchObject({ messages_deleted: 1, cleanup_due_count: 0 });
    expect(await rpc("aggregate_ai_daily_metrics", [day])).toEqual(before);
    expect(await rows()).toHaveLength(2);
    expect(await maintain()).toMatchObject({ messages_deleted: 0, events_deleted: 0 });
  });
  it("daily metrics run before deletion and remain permanent after evidence expiry", async () => {
    await maintain(); await record(payload(1, { events: signal, metadata: { ...metadata, generic_fallback: true } }));
    await db.exec("update ai_quality_messages set created_at=now()-interval '100 days';update ai_quality_events set created_at=now()-interval '100 days';update ai_quality_conversations set started_at=now()-interval '100 days',last_activity_at=now()-interval '100 days'");
    const day = (await query("select (created_at at time zone 'Asia/Taipei')::date::text as metric_day from ai_quality_messages limit 1"))[0].metric_day;
    expect(await maintain()).toMatchObject({ messages_deleted: 2, events_deleted: 1, conversations_deleted: 1 });
    const sealed = await rpc("aggregate_ai_daily_metrics", [day]);
    expect(sealed).toMatchObject({ message_count: 2, conversation_count: 1, generic_fallback_count: 1 });
    await maintain();
    expect(await rpc("aggregate_ai_daily_metrics", [day])).toEqual(sealed);
  });
  it.each([[0,1], [10001,1], [1,0], [1,101], [null,1], [1,null]])("rejects invalid maintenance budget %s/%s", async (batch, limit) => {
    await denied(() => rpc("run_ai_quality_maintenance", [batch, limit]), "22023");
    expect((await query("select last_completed_at from ai_quality_maintenance_state"))[0].last_completed_at).toBeNull();
  });
  it("a failed aggregate leaves last-success state and observation data intact", async () => {
    await maintain(); await record(payload());
    const previous = await query("select * from ai_quality_maintenance_state");
    await db.exec("create function pg_temp.fail_metric() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure';end $$;create trigger synthetic_fail before insert or update on ai_daily_metrics for each row execute function pg_temp.fail_metric()");
    await denied(maintain, "P0001");
    expect(await query("select * from ai_quality_maintenance_state")).toEqual(previous);
    expect(await rows()).toHaveLength(2);
  });
  it.each(["anon", "authenticated"])("denies %s maintenance, capture and state writes", async role => {
    await db.exec("set local role " + role);
    for (const [name, args] of [["run_ai_quality_maintenance", []], ["record_ai_quality_turn", [JSON.stringify(payload())]],
      ["submit_ai_quality_feedback", [hash("synthetic"), hash(1), "positive", null]], ["ai_quality_bounded_excerpt", ["safe"]]])
      await denied(() => rpc(name, args), "42501");
    await denied(() => query("select * from ai_quality_maintenance_state"), "42501");
  });
  it("service role can maintain and record but cannot forge health freshness; RLS stays enabled", async () => {
    await db.exec("set local role service_role");
    await maintain(); await record(payload());
    await denied(() => query("update ai_quality_maintenance_state set capture_mode='normal'"), "42501");
    await denied(() => query("delete from ai_quality_maintenance_state"), "42501");
    await db.exec("reset role");
    expect((await query("select relrowsecurity from pg_class where relname='ai_quality_maintenance_state'"))[0].relrowsecurity).toBe(true);
    expect(await query("select * from pg_policies where tablename='ai_quality_maintenance_state'")).toEqual([]);
  });
  it.each(["name", "guest_name", "contact_name", "customer_name", "address", "raw_message", "provider_response"])("still rejects unapproved structured payload field %s", async key => {
    await maintain();
    await denied(() => record(payload(1, { [key]: "synthetic forbidden" })), "22023");
    expect(await rows()).toEqual([]);
  });
  it("does not add a cron, HTTP path, secret or unrelated DDL; maintenance protects permanent records", () => {
    expect(sql).not.toMatch(/cron\.schedule|https?:|DEEPSEEK|AI_QUALITY_HMAC_SECRET|booking_|chat_messages|drop table/i);
    expect(sql).not.toMatch(/delete from public\.(ai_owner_decisions|ai_eval_cases|ai_review_items|ai_daily_metrics)/i);
    expect(sql).toContain("limit 1) is null");
    expect(sql).toContain(">= 250000");
    expect(sql).toContain(">= 100000");
    expect(sql).toContain(">= 50000");
    expect(sql).toContain(">= 10000");
    expect(sql.indexOf("perform public.aggregate_ai_daily_metrics((now()")).toBeLessThan(sql.indexOf("for i in 1..p_max_batches"));
  });
});
