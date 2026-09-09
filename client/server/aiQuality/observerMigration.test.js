import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAiQualityTurn } from "./observer.js";
import { buildAiQualityTurnSnapshot } from "./snapshot.js";
import { sanitizeAiQualityMetadata } from "./metadata.js";
import { dialogueGoalTaxonomy } from "../aiChat/dialogueGoalPlanner.js";

const foundation = readFileSync(new URL("../../supabase/migrations/2026-09-09-ai-quality-foundation.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/2026-09-09-ai-quality-runtime-observer.sql", import.meta.url), "utf8");
let db;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const record = payload => query("select record_ai_quality_turn($1::jsonb)", [JSON.stringify(payload)]);
function payload(extra = {}) {
  return prepareAiQualityTurn(buildAiQualityTurnSnapshot({
    conversationId: "synthetic-conversation", turnId: "synthetic-turn",
    userText: "電話0988-123-456", assistantText: "test@example.invalid",
    beforeContext: {}, afterContext: {}, route: { knowledgeGap: true },
    metadata: { final_response_kind: "knowledge_gap", structured_mode: "active" },
    ...extra,
  }));
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(foundation);
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.stubEnv("AI_QUALITY_HMAC_SECRET", randomBytes(32).toString("hex"));
  await db.exec("begin");
});
afterEach(async () => { await db.exec("rollback"); vi.unstubAllEnvs(); });

describe("Phase 1B executed local RPC", () => {
  it("stores one sanitized pair, one event, safe metadata and atomic counters", async () => {
    await record(payload());
    const messages = await query("select * from ai_quality_messages order by role desc");
    expect(messages).toHaveLength(2);
    expect(messages.map(row => row.turn_index)).toEqual([1, 1]);
    expect(messages.map(row => row.sanitized_text)).toEqual(["電話[PHONE]", "[EMAIL]"]);
    expect(messages[1].execution_metadata).toMatchObject({ generic_fallback: true, provider_call_count: 0 });
    const events = await query("select * from ai_quality_events");
    expect(events).toHaveLength(1);
    expect(events[0].quality_message_id).toBe(messages[1].id);
    const [c] = await query("select * from ai_quality_conversations");
    expect(Number(c.message_count)).toBe(2);
    expect(Number(c.quality_event_count)).toBe(1);
    expect(c.observer_turn_count).toBe(1);
    expect(JSON.stringify([messages, events, c])).not.toMatch(/0988|example.invalid|synthetic-conversation|synthetic-turn/);
    for (const table of ["ai_review_items", "ai_owner_decisions", "ai_eval_cases", "ai_daily_metrics"]) {
      expect(await query("select * from " + table)).toEqual([]);
    }
  });
  it("same turn retries and duplicate event types do not increment counters", async () => {
    const p = payload();
    p.events.push(p.events[0]);
    await record(p);
    await record(p);
    expect(await query("select role from ai_quality_messages")).toHaveLength(2);
    expect(await query("select id from ai_quality_events")).toHaveLength(1);
    const [c] = await query("select message_count,quality_event_count,observer_turn_count from ai_quality_conversations");
    expect([Number(c.message_count), Number(c.quality_event_count), c.observer_turn_count]).toEqual([2, 1, 1]);
  });
  it("identical text on different turns is legitimate and retains monotonic indexes after expiry", async () => {
    await record(payload({ turnId: "one", userText: "好" }));
    await record(payload({ turnId: "two", userText: "好" }));
    await db.exec("delete from ai_quality_messages");
    await record(payload({ turnId: "three", userText: "好" }));
    expect((await query("select turn_index from ai_quality_messages")).map(row => row.turn_index)).toEqual([3, 3]);
    const [c] = await query("select message_count from ai_quality_conversations");
    expect(Number(c.message_count)).toBe(6);
  });
  it("does not duplicate an event-bearing turn after its 30-day message retention", async () => {
    const p = payload();
    await record(p);
    await db.exec("delete from ai_quality_messages");
    await record(p);
    expect(await query("select * from ai_quality_messages")).toEqual([]);
    expect(await query("select * from ai_quality_events")).toHaveLength(1);
  });
  it("rolls back the entire pair and conversation if a later insert fails", async () => {
    await db.exec("create function reject_quality_event() returns trigger language plpgsql as $$ begin raise exception 'synthetic_event_failure'; end $$; create trigger reject_quality_event before insert on ai_quality_events for each row execute function reject_quality_event();");
    await db.exec("savepoint before_failure");
    await expect(record(payload())).rejects.toMatchObject({ code: "P0001" });
    await db.exec("rollback to savepoint before_failure");
    expect(await query("select * from ai_quality_conversations")).toEqual([]);
    expect(await query("select * from ai_quality_messages")).toEqual([]);
  });
  it.each(["anon", "authenticated"])("denies RPC and table access to %s", async role => {
    await db.exec("set local role " + role);
    await db.exec("savepoint denied");
    await expect(record(payload())).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to savepoint denied");
    await expect(query("select * from ai_quality_messages")).rejects.toMatchObject({ code: "42501" });
  });
  it("permits only the server role and preserves RLS/no public policies", async () => {
    await db.exec("set local role service_role");
    await record(payload());
    expect(await query("select id from ai_quality_messages")).toHaveLength(2);
    await db.exec("reset role");
    expect(await query("select * from pg_policies where schemaname='public'")).toEqual([]);
    const rows = await query("select relrowsecurity from pg_class where relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events')");
    expect(rows.every(row => row.relrowsecurity)).toBe(true);
  });
  it.each(["raw_context", "phone", "booking_reference", "provider_response", "Authorization", "Cookie"])("rejects unapproved metadata field %s before any writes", async field => {
    const p = payload();
    p.metadata[field] = "synthetic-private";
    await db.exec("savepoint denied");
    await expect(record(p)).rejects.toMatchObject({ code: "22023" });
    await db.exec("rollback to savepoint denied");
    expect(await query("select * from ai_quality_conversations")).toEqual([]);
  });
  it.each([null, [], {}, { user_text: null }])("rejects malformed payload %j", async p => {
    await db.exec("savepoint denied");
    await expect(record(p)).rejects.toMatchObject({ code: "22023" });
    await db.exec("rollback to savepoint denied");
    expect(await query("select * from ai_quality_conversations")).toEqual([]);
  });
  it("aligns all authoritative goal IDs and new diagnostic enums across JS and SQL", async () => {
    const values = [
      ...Object.values(dialogueGoalTaxonomy).flat().map(goal_id => ({ goal_id })),
      ...["network", "rate_limit"].map(provider_error_type => ({ provider_error_type })),
      ...["semantic_resolver", "faq_selector", "answer", "unknown"].map(provider_role => ({ provider_role })),
      { before_version: 1, after_version: 2, read_only_turn: true, signal_code: "pending_disappeared" },
    ];
    for (const value of values) {
      expect(sanitizeAiQualityMetadata(value)).toEqual(value);
      const [row] = await query("select ai_quality_valid_metadata($1::jsonb) as valid", [JSON.stringify(value)]);
      expect(row.valid).toBe(true);
    }
  });
  it("uses row locking and uniqueness, never read-count-write or per-turn aggregation", () => {
    const rpc = migration.slice(migration.indexOf("create or replace function public.record_ai_quality_turn"));
    expect(rpc).toContain("for update");
    expect(rpc).toContain("message_count = message_count + 2");
    expect(rpc).not.toMatch(/count\(\*\)|aggregate_ai_daily_metrics|insert into public.ai_review_items/i);
    expect(migration).toContain("ai_quality_messages_idempotency_idx");
    expect(migration).toContain("ai_quality_events_idempotency_idx");
  });
});
