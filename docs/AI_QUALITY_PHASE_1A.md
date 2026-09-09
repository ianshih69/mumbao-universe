# AI Quality Phase 1A: Data and Privacy Foundation

## Scope and Preflight

- Repository: E:\mumbao\newCode\mumbao-universe
- Baseline branch: main; HEAD: 5ebb155a9971dea82eb87121f8061a5a19e53cee
- Initial working tree: clean; required ancestor check passed.
- New schema and independent server helpers only. No logger, event producer,
  existing AI hook, customer/Admin UI, scheduler, backfill, or provider call.
- No migration was applied to Supabase. Local SQL tests use in-memory PGlite.
- No Production, environment, FAQ, MD, pricing, or Booking change.

## Existing Architecture Audit

- Migrations live in client/supabase/migrations with dated SQL names, UUID
  defaults, timestamptz, RLS and server/service_role-only access.
- Existing chat_sessions/chat_messages persist chat history; customer/visitor
  identifiers and raw content make them unsuitable as quality storage.
  ai_chat_usage_events is usage accounting, not the requested review model.
- aiChat/message.js builds runtime-authority diagnostics;
  modelExecutionContext.js builds provider-call diagnostics. No hooks were added.
- Conversation/scenario/pending authorities and browser session IDs remain
  unchanged. Quality will use a separate UUID and a keyed anonymous correlation hash.
- Provider-only sanitizeStructuredTurnUtterance truncates early, uses different
  placeholders, and guesses names/addresses. It was deliberately left unchanged;
  sanitizeAiQualityText is the sole authority for future quality text writes.
- Existing private shop HMAC uses node:crypto; that standard primitive is reused.
  Salted plain-hash/fallback patterns and broad .env loaders are not reused.
- Metadata reuses the existing pure semanticDialogueCapabilities registry.

## Schema

Migration: client/supabase/migrations/2026-09-09-ai-quality-foundation.sql

| Table | Purpose / lifetime |
| --- | --- |
| ai_quality_conversations | Anonymous hash + counters; idle 30 days, retained while any message/event references it |
| ai_quality_messages | Sanitized user/assistant text and bounded diagnostics; 30 days |
| ai_quality_events | Typed quality signals and minimal diagnostic JSON; 90 days |
| ai_review_items | Self-contained sanitized representative evidence, classification and owner queue; permanent |
| ai_owner_decisions | Sanitized owner decisions; permanent; NOT Production knowledge authority |
| ai_eval_cases | Sanitized evaluation drafts; permanent; no automatic promotion |
| ai_daily_metrics | Taipei-day aggregates, unique date, nonnegative counts; permanent |

UUID PKs, required fields, typed enums, bounded JSON/text/counts, timestamp order
checks and unique (conversation, turn, role) prevent malformed records.
Expiry is generated from timestamps and cannot be overridden independently.
Index coverage includes hashes, retention, created/started timelines, child FKs,
event types, unresolved events, review status/classification/owner queue/last seen,
review first seen (daily aggregation), and the metric date PK.

FKs never cascade-delete permanent evidence. Messages/events RESTRICT deleting
their conversation. Event-to-message composite FK also enforces matching
conversation; message deletion sets only quality_message_id to NULL.
Event/review and eval/review links use SET NULL; owner/review uses RESTRICT.
Reviews have their own sanitized examples, not transcript-dependent references.
The column-specific SET NULL syntax requires PostgreSQL 15 or later; verify
target server version in a separately authorized migration preflight.

All seven tables enable RLS with no public policies. PUBLIC, anon and
authenticated have no CRUD privileges; only service_role receives CRUD.
Maintenance RPCs are SECURITY DEFINER with pinned search_path and EXECUTE
revoked from PUBLIC/anon/authenticated. No browser Supabase access is introduced.

## Privacy Contract

client/server/aiQuality/privacy.js exports:

- sanitizeAiQualityText(text): server-only, deterministic, no network/model/log.
  Redacts common Taiwan mobile/landline/ID formats, emails, ten-digit booking
  references, obvious bank/card numbers, UUIDs, bearer/opaque tokens, and decoded
  sensitive URL query/fragment parameters. Nested redirect URLs are bounded.
  URL credentials are removed. Placeholders are [PHONE], [EMAIL], [ID],
  [BOOKING_REF], [BANK_DATA], [CARD_DATA], [TOKEN].
- Text longer than 64,000 UTF-16 units is rejected; the entire accepted input is
  sanitized BEFORE truncation to 8,000 units. Placeholders/surrogate pairs are
  not split. Ordinary dates, prices, weights, counts, room numbers, FAQ IDs and
  Chinese punctuation survive; normalization only targets fullwidth ASCII-like
  identifiers and invisible control characters. Output is idempotent.
- No heuristic name/address guessing. This is explicit-format redaction, NOT a
  guarantee to identify every possible PII format or arbitrary unlabelled secret.
  Future writers must not collect identity fields or treat sanitized free text
  as public data.
- hashAiQualityConversationKey(sourceId): domain-separated HMAC-SHA256 using ONLY
  process.env.AI_QUALITY_HMAC_SECRET (minimum 32 UTF-8 bytes; use a randomly
  generated dedicated server secret). Missing/short secret or invalid input
  fails closed with a generic error. No plain hash, .env loading, default,
  Supabase secret, or browser fallback. No environment value was configured.
  Rotating the dedicated secret intentionally changes correlation hashes.

client/server/aiQuality/metadata.js allows only explicit capability/response/mode/
validation/error enums, booleans and bounded integers. Unknown or mistyped
fields are dropped; getters and inherited properties are not copied.
sanitizeAiQualityContext permits only scenario_present, pending_present,
scenario_version and an allowlisted list of missing field names. No IDs, raw
scenario, request/response, headers/cookies, prompt, booking/payment object or env.
Matching DB JSON CHECK functions reject unsafe metadata/context on insertion.

There is intentionally no insert utility yet. A future authorized writer must
sanitize EVERY free-text field before INSERT, including review titles/examples,
owner answers and eval inputs; never INSERT raw text then UPDATE it.
Sanitized column names/length CHECKs are not a SQL-level free-text PII detector.
Eval expected_behavior is only a size-bounded JSON object at this stage; its
future authoring path needs a typed, privacy-reviewed expectation schema before
accepting user/runtime objects. It is not a metadata dump escape hatch.

## Maintenance Contracts (Not Scheduled or Executed Remotely)

- aggregate_ai_daily_metrics(date): idempotent upsert, Asia/Taipei calendar day.
  Conversation count uses started_at; review counts use first_seen_at.
  Message count includes both roles; provider/fallback/clarification counts use
  assistant messages only. Signal counts use typed events. Independent source
  aggregates avoid join fan-out. Empty sources produce zero.
- delete_expired_ai_quality_data(batch_size default 1000): accepts 1..10000;
  server now() cutoff, no caller-controlled future time. Bounded per-table batches,
  row locks/SKIP LOCKED and a transaction advisory lock. Cleanup skips if already
  running. Aggregation uses the same lock to avoid partial-deletion snapshots.
- Before first deletion of any source for a day, the COMPLETE day is aggregated
  and finalized_at is set. Later aggregation cannot overwrite sealed historical
  counts from incomplete sources. Multiple small batches remain safe/idempotent.
- Seal semantics: this is an ingestion-day historical snapshot, not a live
  permanent-owner-queue total. Late backdated imports or retroactive changes
  must NOT be introduced without a separately designed reconciliation path.
  The future writer must maintain last_activity_at/counters and use server
  timestamps. Future scheduler cadence determines actual deletion delay.
- get_ai_quality_storage_metrics(): row counts for all seven tables,
  oldest_message_at (NULL when empty), cleanup_due_count for expired messages,
  events and already-unreferenced expired conversations. No invented DB MB size.
- No automatic knowledge updates, schedules, or maintenance calls from AI replies.

## Verification and Rollout Boundary

Tests: privacy.test.js, metadata.test.js, migration.test.js,
foundationBoundary.test.js under client/server/aiQuality.
The SQL suite executes the migration twice against actual in-memory PostgreSQL,
checks roles/RLS/constraints, expiry boundaries, permanent-data survival, metrics,
and idempotency. Synthetic fixtures only; no customer data or secrets.

Commands from the repository root:

    npx.cmd vitest run client/server/aiQuality --no-cache
    npx.cmd vitest run --no-cache
    npm.cmd run check -- --incremental false
    npm.cmd run build
    git diff --check

The dev-only, exact-pinned @electric-sql/pglite dependency is used only by SQL
tests and is not imported by runtime/client bundles. No Production DB is needed.
Local PostgreSQL/RLS coverage is not a substitute for an authorized target
Supabase version/role/migration preflight.

Do not auto-apply or automatically roll back this migration. Before future
rollout, review target schema/version/role compatibility and backup requirements.
If disabling a later integration, stop its writer/scheduler first; do not DROP
permanent owner/eval/review/metric tables or use CASCADE as rollback.
Phase 1B needs separate approval and must deliberately replace the no-runtime-hook
test with the approved nonblocking writer/privacy/failure-isolation contract.

## Local Verification Result

- Phase 1A: 276/276 PASS across four suites (privacy 157, metadata 56,
  executed SQL/RLS/maintenance 61, no-runtime/security boundary 2).
- Related quality + AI + pricing + booking/payment/cancellation integration:
  42 files, 1943/1943 PASS.
- Actual AI API handler: 125/125 PASS. Semantic orchestrator 47/47,
  architecture 28/28, routing certification 59/59 PASS.
- Shared bookingPricing: 34/34 PASS.
- Full repository: 2138/2140 PASS; two EXISTING failures in
  client/src/data/aboutContent.test.ts (lines 9 and 14).
  About paragraph A omits the closing quotation mark required by its exact-text
  tests. Neither About content nor its test was changed in Phase 1A.
  HEAD and working-file Git blob IDs are identical for each:
  aboutContent.ts = 4105f513ddf44217f52c797629dde26c384bce62;
  aboutContent.test.ts = 6076280ef725796b8c5cf66f6e6f4f2f519c354f.
- TypeScript check with incremental=false: PASS.
- Build: PASS after permission approval for local dist output. Existing >500 kB
  Vite chunk warning remains; no Production deployment.
- git diff --check: PASS; new files also checked separately because untracked
  files are not included by ordinary git diff.
- No new real provider call, remote DB operation, runtime hook or UI change.
- Phase 1A scope gate: PASS. This is NOT a full-repository green release gate;
  the two unrelated About failures are reported, not fixed or waived.
- Phase 1B development recommendation: YES, subject to separate approval.

## Exact Change List

1. package.json (test-only exact-pinned PGlite dependency)
2. package-lock.json (matching dependency entry, no unrelated upgrade)
3. client/server/aiQuality/privacy.js
4. client/server/aiQuality/metadata.js
5. client/server/aiQuality/privacy.test.js
6. client/server/aiQuality/metadata.test.js
7. client/server/aiQuality/migration.test.js
8. client/server/aiQuality/foundationBoundary.test.js
9. client/supabase/migrations/2026-09-09-ai-quality-foundation.sql
10. docs/AI_QUALITY_PHASE_1A.md

No commit, push, deployment, Promote, environment update, or migration execution
outside the in-memory SQL test database was performed.
