import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Local-only synthetic certification. No connection URL, password or remote host
// is accepted; no environment credential is read. Never point a tunnel at this port.
const args = process.argv.slice(2);
assert.equal(args.length, 2, "usage: --client-module <absolute path to pg/lib/index.js>");
assert.equal(args[0], "--client-module");
// pg evaluates environment defaults even with explicit config. Clear known
// names without reading values, in this disposable runner process only.
for (const name of ["PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE",
  "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSSLMODE", "PGOPTIONS",
  "PGAPPNAME", "PGCONNECT_TIMEOUT", "PGCLIENT_ENCODING", "PGREPLICATION"])
  delete process.env[name];
const { default: pg } = await import(pathToFileURL(resolve(args[1])));
const options = { host: "127.0.0.1", port: 55439, user: "quality_local_owner",
  database: "postgres", password: () => "", ssl: false, connectionTimeoutMillis: 5000 };
const admin = new pg.Client(options);
await admin.connect();
const database = "ai_quality_gate_" + Date.now();
const report = { database, provider_calls: 0 };
const root = new URL("../../supabase/migrations/", import.meta.url);
const migration = name => readFileSync(new URL(name, root), "utf8");
const files = ["2026-09-09-ai-quality-foundation.sql", "2026-09-09-ai-quality-runtime-observer.sql",
  "2026-09-10-ai-quality-feedback-admin.sql"];
const tables = ["ai_quality_messages", "ai_quality_events", "ai_quality_conversations"];
let db;
const clients = [];
let stage = "setup";
try {
  assert.equal((await admin.query("select current_user as u")).rows[0].u, "quality_local_owner");
  await admin.query("create database " + database);
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount)
      await admin.query("create role " + role + (role === "service_role" ? " bypassrls" : ""));
  }
  db = new pg.Client({ ...options, database }); await db.connect();
  const query = async (sql, values = []) => (await db.query(sql, values)).rows;
  report.version = (await query("select version() as v"))[0].v;
  await db.query("create schema auth;create table auth.users(id uuid primary key)");
  for (const file of ["2026-06-16-shop-warehouse-assets.sql", "2026-06-17-admin-users-roles-permissions.sql", ...files])
    await db.query(migration(file));
  const clear = () => db.query("truncate ai_quality_events,ai_quality_messages,ai_quality_conversations,ai_daily_metrics");
  const hash = value => createHash("sha256").update(String(value)).digest("hex");
  const metadata = { provider_used: false, provider_call_count: 0, scenario_changed: false,
    pending_created: false, pending_consumed: false, generic_fallback: true, clarification: false,
    response_kind: "knowledge_gap", before_version: 1, after_version: 1, read_only_turn: true };
  const payload = (conversation, turn) => ({
    conversation_key_hash: hash(conversation), turn_key_hash: hash(conversation + ":" + turn),
    user_text: "synthetic sanitized question", assistant_text: "synthetic sanitized answer",
    metadata, context: { scenario_present: true, pending_present: false },
    events: Array.from({ length: 2 }, () => ({ event_type: "generic_fallback", severity: "low", metadata })),
  });
  const nodes = node => [node, ...(node.Plans || []).flatMap(nodes)];
  const summarize = plan => ({ ms: plan["Execution Time"], nodes: nodes(plan.Plan).map(n => ({
    type: n["Node Type"], relation: n["Relation Name"], index: n["Index Name"],
    rows: n["Actual Rows"], loops: n["Actual Loops"],
  })) });
  const extractEmpty = sql => {
    const start = sql.indexOf("select c.id from public.ai_quality_conversations c");
    assert(start >= 0);
    return sql.slice(start, sql.indexOf("\n  ) expired;", start)).replaceAll("cutoff", "now()").replaceAll("p_batch_size", "100");
  };
  const explain = async sql => (await query("explain (analyze,buffers,format json) " + sql))[0]["QUERY PLAN"][0];
  await db.query("insert into ai_quality_conversations(conversation_key_hash,started_at,last_activity_at) select repeat(md5('plan-'||i),2),now()-interval '100 days',case when i%20=0 then now()-interval '100 days' else now() end from generate_series(1,10000) i");
  await db.query("insert into ai_quality_messages(quality_conversation_id,turn_index,role,sanitized_text,created_at) select c.id,t,case when t%2=1 then 'user' else 'assistant' end,'synthetic',case when c.last_activity_at<now()-interval '90 days' then now()-interval '31 days' else now()-interval '1 day' end from ai_quality_conversations c cross join generate_series(1,6) t");
  await db.query("insert into ai_quality_events(quality_conversation_id,quality_message_id,event_type,created_at) select quality_conversation_id,id,'generic_fallback',case when created_at<now()-interval '30 days' then now()-interval '91 days' else now()-interval '1 day' end from ai_quality_messages where turn_index<=2");
  // Include event-bearing conversations with no messages, and truly empty ones.
  await db.query("delete from ai_quality_messages where quality_conversation_id in (select id from ai_quality_conversations where last_activity_at<now()-interval '90 days' order by id limit 50)");
  await db.query("insert into ai_quality_conversations(conversation_key_hash,started_at,last_activity_at) select repeat(md5('empty-'||i),2),now()-interval '100 days',now()-interval '100 days' from generate_series(1,20) i");
  await db.query("analyze ai_quality_conversations;analyze ai_quality_messages;analyze ai_quality_events");
  report.plan_dataset = { conversations: 10020, messages: 59700, events: 20000 };
  const beforeSql = extractEmpty(migration(files[0]));
  report.cleanup_before = summarize(await explain(beforeSql));
  const hardening = migration("2026-09-10-ai-quality-activation-hardening.sql");
  stage = "hardening_migration";
  await db.query(hardening);
  await db.query(hardening);
  await db.query("analyze ai_quality_conversations;analyze ai_quality_messages;analyze ai_quality_events");
  const afterSql = extractEmpty(hardening);
  report.cleanup_after = summarize(await explain(afterSql));
  assert.deepEqual((await query(beforeSql)).map(r => r.id), (await query(afterSql)).map(r => r.id));
  assert(report.cleanup_before.nodes.some(n => n.type === "Seq Scan" && n.relation === "ai_quality_events"));
  assert(!report.cleanup_after.nodes.some(n => n.type === "Seq Scan" && tables.includes(n.relation)));
  assert(report.cleanup_after.nodes.some(n => /Index/.test(n.type) && n.relation === "ai_quality_events" && n.loops > 0));
  for (const table of ["ai_quality_messages", "ai_quality_events"]) {
    const plan = summarize(await explain("select id from " + table + " where retention_expires_at<=now() order by retention_expires_at,id limit 100 for update skip locked"));
    assert(plan.nodes.some(n => /Index/.test(n.type) && n.index?.includes("retention")));
    report[table + "_expiry"] = plan;
  }
  report.cleanup_batch = (await query("select delete_expired_ai_quality_data(100) as result"))[0].result;
  assert.equal(report.cleanup_batch.messages_deleted, 100);
  assert.equal(report.cleanup_batch.events_deleted, 100);
  await clear();
  stage = "maintenance";
  report.initial_maintenance = (await query("select run_ai_quality_maintenance() as result"))[0].result;

  // Hold an exclusive start barrier, then let 40 real backend sessions compete.
  stage = "concurrency";
  await db.query("select pg_advisory_lock(191011)");
  for (let i = 0; i < 40; i++) {
    const client = new pg.Client({ ...options, database }); await client.connect();
    clients.push(client);
  }
  const pids = await Promise.all(clients.map(async c => (await c.query("select pg_backend_pid() as pid")).rows[0].pid));
  assert.equal(new Set(pids).size, 40);
  const requests = clients.map((client, i) => (async () => {
    await client.query("begin");
    await client.query("set local role service_role");
    await client.query("select pg_advisory_xact_lock_shared(191011)");
    const turn = i < 30 ? i % 20 : i - 30;
    const p = payload(i < 30 ? "same-conversation" : "different-" + turn, turn);
    await client.query("select record_ai_quality_turn($1::jsonb)", [JSON.stringify(p)]);
    await client.query("commit");
  })());
  const deadline = Date.now() + 10000;
  while (true) {
    const waiting = (await query("select count(*)::int n from pg_locks where locktype='advisory' and objid=191011 and not granted"))[0].n;
    if (waiting === 40) break;
    assert(Date.now() < deadline, "concurrency_start_barrier_timeout");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await db.query("select pg_advisory_unlock(191011)");
  await Promise.all(requests);
  const counters = await query("select sum(message_count)::int messages,sum(quality_event_count)::int events,sum(observer_turn_count)::int turns,count(*)::int conversations from ai_quality_conversations");
  assert.deepEqual(counters[0], { messages: 60, events: 30, turns: 30, conversations: 11 });
  assert.equal((await query("select count(*)::int n from ai_quality_messages"))[0].n, 60);
  assert.equal((await query("select count(*)::int n from ai_quality_events"))[0].n, 30);
  const duplicateGroups = (await query("select count(*)::int n from (select quality_conversation_id,turn_key_hash,role from ai_quality_messages group by 1,2,3 having count(*)>1) d"))[0].n;
  assert.equal(duplicateGroups, 0);
  report.concurrency = { sessions: 40, observations: 40, unique_turns: 30, retries: 10, ...counters[0], lost_updates: 0, duplicates: duplicateGroups };
  const vote = payload("same-conversation", 1);
  const votes = await Promise.all(clients.slice(0, 20).map((c, i) => c.query(
    "select submit_ai_quality_feedback($1,$2,$3,$4) as result",
    [vote.conversation_key_hash, vote.turn_key_hash, i % 2 ? "positive" : "negative", i % 2 ? null : "other"])));
  assert.equal(votes.filter(v => v.rows[0].result.result === "saved").length, 12);
  assert.equal(votes.filter(v => v.rows[0].result.result === "limited").length, 8);
  assert.equal((await query("select count(*)::int n from ai_quality_events where event_type like '%feedback'"))[0].n, 1);
  report.concurrent_feedback = { requests: 20, saved: 12, limited: 8, active_rows: 1 };
  await db.query("begin");
  await db.query("select pg_advisory_xact_lock(hashtextextended('mumbao:ai-quality:cleanup:v1',0))");
  assert.deepEqual((await clients[0].query("select run_ai_quality_maintenance() as result")).rows[0].result, { skipped: true });
  await db.query("rollback");
  report.overlapping_maintenance = "SKIPPED";
  for (const client of clients) await client.end();
  clients.length = 0;

  stage = "capacity_thresholds";
  await clear();
  await db.query("insert into ai_quality_conversations(conversation_key_hash) values($1)", [hash("pressure")]);
  const addRows = (start, end) => db.query("insert into ai_quality_messages(quality_conversation_id,turn_index,role,sanitized_text) select c.id,i,'user','synthetic pressure fixture' from ai_quality_conversations c cross join generate_series($1::int,$2::int) i", [start, end]);
  const mode = async () => (await query("select run_ai_quality_maintenance(1,1) as result"))[0].result.capture_mode;
  await addRows(1, 99999); assert.equal(await mode(), "normal");
  await addRows(100000, 100000); assert.equal(await mode(), "warning");
  await addRows(100001, 250000); assert.equal(await mode(), "critical");
  report.capacity_thresholds = { messages_99999: "normal", messages_100000: "warning", messages_250000: "critical" };
  await clear();
  await db.query("insert into ai_quality_conversations(conversation_key_hash) values($1)", [hash("backlog")]);
  await addRows(1, 50001);
  await db.query("update ai_quality_messages set created_at=now()-interval '31 days'");
  assert.equal(await mode(), "critical");
  assert.equal(Number((await query("select cleanup_due_count from ai_quality_maintenance_state"))[0].cleanup_due_count), 50000);
  // A second independently sized fixture proves the warning backlog boundary.
  await db.query("delete from ai_quality_messages where id in (select id from ai_quality_messages order by id limit 39999)");
  assert.equal(await mode(), "warning");
  assert.equal(Number((await query("select cleanup_due_count from ai_quality_maintenance_state"))[0].cleanup_due_count), 10000);
  report.capacity_thresholds.backlog_50000 = "critical";
  report.capacity_thresholds.backlog_10000 = "warning";

  report.storage = {};
  stage = "storage";
  const words = ["arrival", "breakfast", "parking", "room", "quiet", "garden", "family", "travel",
    "calendar", "night", "guest", "pet", "checkin", "request", "answer", "stay", "window", "weekend",
    "\u5165\u4f4f", "\u65e5\u671f", "\u4eba\u6578", "\u65e9\u9910", "\u5bf5\u7269", "\u623f\u9593", "\u505c\u8eca"];
  const text = (seed, size) => {
    let result = "", state = seed + 1;
    while (result.length < size) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; result += words[state % words.length] + " "; }
    return result.slice(0, size);
  };
  for (const [flavor, lengths] of Object.entries({ short: [60, 120], median: [300, 600], long: [4000, 8000], critical_excerpt: [256, 256] })) {
    await clear();
    const conversations = await query("insert into ai_quality_conversations(conversation_key_hash) select repeat(md5('storage-'||i),2) from generate_series(1,2000) i returning id");
    for (let start = 0; start < 2000; start += 100) {
      const ids = conversations.slice(start, start + 100).map(r => r.id);
      const users = ids.map((_, i) => text(start + i, lengths[0]));
      const answers = ids.map((_, i) => text(10000 + start + i, lengths[1]));
      await db.query("insert into ai_quality_messages(quality_conversation_id,turn_index,role,sanitized_text,execution_metadata,turn_key_hash) select id,1,'user',u,'{}'::jsonb,repeat(md5(id::text),2) from unnest($1::uuid[],$2::text[],$3::text[]) as x(id,u,a) union all select id,1,'assistant',a,$4::jsonb,repeat(md5(id::text),2) from unnest($1::uuid[],$2::text[],$3::text[]) as x(id,u,a)", [ids, users, answers, JSON.stringify(metadata)]);
    }
    await db.query("insert into ai_quality_events(quality_conversation_id,quality_message_id,turn_key_hash,event_type,metadata_json,sanitized_context) select quality_conversation_id,id,turn_key_hash,'generic_fallback',$1::jsonb,'{\"scenario_present\":true,\"pending_present\":false}'::jsonb from ai_quality_messages where role='assistant'", [JSON.stringify(metadata)]);
    await db.query("analyze ai_quality_conversations;analyze ai_quality_messages;analyze ai_quality_events");
    report.storage[flavor] = {};
    for (const table of tables) {
      const [size] = await query("select pg_relation_size($1::regclass)::float8 heap,pg_indexes_size($1::regclass)::float8 indexes,pg_total_relation_size($1::regclass)::float8 total", [table]);
      const rows = (await query("select count(*)::int n from " + table))[0].n;
      report.storage[flavor][table] = { rows, ...size, total_bytes_per_row: Math.ceil(size.total / rows) };
    }
  }
  report.gate = "PASS";
  console.log("AI QUALITY LOCAL POSTGRES GATE\n" + JSON.stringify(report, null, 2));
} catch (error) {
  // No SQL payloads/row contents/headers/credentials are logged on failure.
  console.error("LOCAL_GATE_FAIL " + stage + " " + (error.code || error.name || "unknown"));
  process.exitCode = 1;
} finally {
  for (const client of clients) await client.end().catch(() => {});
  await db?.end().catch(() => {});
  await admin.end().catch(() => {});
}
