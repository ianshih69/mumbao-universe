# AI Quality Production Activation

## A1.1 Current Verdict

Local hardening completed 2026-09-10 against main checkpoint
`3c8842a50441d8e9d59831bb7407bfd405038870`. Initial preflight matched exactly:
only this pre-existing untracked A1 runbook was dirty. No reset/stash/restore.
The historical A1 report below is retained as evidence, not current instructions.

**A1.1 PASS; recommend A1 PASS for readiness and a separately authorized A2
schema-only gate. This is NOT permission to run A2, enable flags, or collect
Production transcripts.** No Production access, migration, env write, scheduler
registration, deploy, Promote, commit or push occurred. New real model calls: 0.

A2 may apply the four exact artifacts in order with ALL Quality flags OFF.
An enabled scheduler is not required for an empty, disabled schema. Before
Observer Canary, the maintenance schedule, successful scheduled execution,
freshness/backlog checks, alert ownership and target-engine capacity must all
be verified. Missing any of these is an explicit Canary STOP.

### Scope And Manifest

| Phase | File under client/supabase/migrations/ | SHA256 of exact file bytes |
| --- | --- | --- |
| 1A | 2026-09-09-ai-quality-foundation.sql | f1ef296f6b77addb0461a82c19ea13c4ef2f41d783c7290fb70dfadfd5e5e637 |
| 1B | 2026-09-09-ai-quality-runtime-observer.sql | f18a1fbc61eeefc5bd15e4a741cfd88c5e374e464eea3d89e99193493fcd59c1 |
| 1C | 2026-09-10-ai-quality-feedback-admin.sql | 3a05655b38c180bae1529383662005bf5297e8ecb9b0c0ba35f371b71477ee94 |
| A1.1 | 2026-09-10-ai-quality-activation-hardening.sql | 5d00895e62c6da599aa4a4beb3a38c7f6d8e32f522aed61653ebde194dddbd34 |

Historical files were compared with raw `git show` buffers, not normalized text:
A against e4650054, B against 08002542, C against 3c8842a5: byte-identical.
Never replay A alone after B/C/hardening: it replaces a newer metadata validator.
Never replay B or C alone over hardening: their older RPC definitions would undo
capture protections. The approved final order is A -> B -> C -> A1.1.
Repeated A1.1 on the resulting schema succeeded locally without duplicating objects.

Hardening replaces only Quality cleanup/record/feedback functions, adds an
immutable bounded-excerpt helper and a maintenance RPC, adds a singleton Quality
maintenance state and message `capture_retention_days`. It rebuilds the same
message retention index around the new generated expiry column, preserving
historical rows' 30-day default. No new cleanup lookup index was needed.
This DDL rewrites/locks the Quality messages table; A2 must verify its expected
empty/inactive state first. Unexpected existing data/drift: STOP, not ad hoc repair.

Current local catalog: **8 RLS-enabled tables, 102 columns, 35 indexes,
79 non-NOT-NULL constraints (62 CHECK, 8 PK, 6 FK, 3 UNIQUE),
16 functions, 3 triggers, zero Quality RLS policies.**
PostgreSQL 18 additionally reports 78 NOT NULL constraints separately.
The old seven-table inventory later in this file describes A/B/C only.
All existing ACLs remain; the new state table grants service_role SELECT only,
not UPDATE/DELETE. New maintenance and excerpt RPCs plus replaced write RPCs
revoke PUBLIC/anon/authenticated and grant only service_role EXECUTE.
Definer functions retain fixed public,pg_temp search paths. Database owners
necessarily remain trusted administrators.

### Privacy Sources And Handling

Root cause: the existing sanitizer recognized numeric identifiers, credentials
and communication fields, but had no contextual name/full-address rules.
Punctuation normalization was not anonymization.

| Source | Deterministic handling |
| --- | --- |
| A: natural introduction | Bounded common Chinese surname/name or capitalized English name only after an introduction; never treat arbitrary 2-4 Han characters as a name. |
| B: explicit identity label | Bounded Chinese/English values after guest/contact/name labels become [NAME]. Spaces, colon variants, quoted keys and line breaks are covered. Unsupported explicit values fail closed. |
| C: labelled full address | Precise Taiwan street/door matcher, plus high-confidence residual label + street + door detection for unsupported separators/spelling. |
| D: natural full address | City/county, optional district, street/section/lane/alley and door/unit become [ADDRESS]. |
| E: ordinary geography | City/district/street without a private door remains; ordinary dates, prices, dog weights, times and guest counts remain. |
| F: public venue address | Only the fixed server-owned faq-101 business address is preserved; different door/floor/unit is not allowlisted. Client allowlists are ignored. |
| G: structured identity | Existing metadata/context allowlists exclude name/guest_name/contact_name/customer_name/profile/address/booking objects. They are never concatenated into Quality text. SQL rejects unknown payload keys. |

The one fixed business address is `宜蘭縣員山鄉深洲二路158號`. Its canonical
FAQ answer passes unchanged; optional recognized postal/country/spacing forms
do not authorize any arbitrary address. Neither FAQ nor MD was edited.

Flow: existing normalization/URL/numeric redaction -> name/address redaction ->
`detectResidualHighRiskPii` -> bounded Quality text. High-confidence remaining
PII replaces the WHOLE Quality text with `[PRIVACY_REDACTED]`. Safe typed
metadata/events remain. No raw fallback, provider request, logger or new model
call is introduced. The original user/assistant response objects are not mutated.

Privacy limits are explicit: these are high-precision supported formats and
fail-closed explicit-label rules, not a claim to recognize every possible
unlabelled personal name/address in arbitrary prose. No NER/model is used.
A new known leak must stop Canary and extend the synthetic gate before collection.

**270 adversarial persisted-payload cases PASS** through snapshot -> preparation
-> real persistence serialization (intercepted synthetic HTTP). Every known
synthetic name/address/phone/email/ID/card/bank/token is absent from the emitted
Quality payload; both sides are idempotent. Includes 168 name-label combinations,
18 introductions, 36 address combinations and 48 mixed booking/privacy inputs.
All data is synthetic; no customer records or real secrets were read.
Privacy hardening suite: 336/336; prior privacy suite: 157/157.
43 ordinary geography/booking controls PASS, plus five unsupported-format checks;
normal prices, dates, dog weights and place names are preserved.
Three new actual-handler OFF/ON privacy probes also PASS.

### Real PostgreSQL Cleanup And Concurrency

The old PGlite-only limitation is resolved with a disposable, loopback-only
PostgreSQL **18.4**, 40 independent backend processes and synthetic data.
Native tooling: @embedded-postgres/windows-x64 18.4.0-beta.17, pg 8.16.3,
installed under the OS TEMP directory with install scripts disabled; no repo
dependency/lockfile changed. PGlite 0.5.8 / PG18.3 separately runs migration tests.

Runner: `client/scripts/ai/runQualityPostgresGate.mjs`.
It accepts only an absolute pg client module path, fixes host/port/user locally,
clears fixed PG environment names in its own process without reading values,
uses an empty password callback (no pgpass) with SSL disabled, and never loads a
connection URL/Production credential,
creates a fresh synthetic DB each run and logs aggregate evidence only.
Do not put a tunnel on 127.0.0.1:55439. This is not a Production CLI.
Both official predecessor migrations were applied unaltered before A/B/C/A1.1;
no partial SQL extraction or repair was used for schema creation.

Evidence DB: `ai_quality_gate_1789025516932` (TEMP cluster only).
Plan fixture: 10,020 conversations, 59,700 messages, 20,000 events.

| Query | Before | After |
| --- | --- | --- |
| Empty conversation batch | Hash anti-join; Seq Scan all 20,000 events; message index probe only after hash filtering | Correlated scalar LIMIT 1; message Index Only Scan 520 loops; events Index Only Scan 70 loops; same 20 IDs |
| Expired messages | Existing retention index | Existing retention Index Scan, 100 rows |
| Expired events | Existing retention index | Existing retention Index Scan, 100 rows |

Root cause was planner decorrelation of NOT EXISTS into a hash anti-join, not a
missing event FK-prefix index. The scalar LIMIT probes retain indexed existence
checks. After plan: no unnecessary full events scan. Measured empty-batch time
2.876 ms before / 2.915 ms after: **not a speedup claim**. Gate is plan shape and
equal candidate IDs, not sub-millisecond noise. Real cleanup deleted exactly
100 messages, 100 events and 20 truly empty conversations, preserving event
FK semantics. Daily aggregation and storage counts still scan their relevant
data; the batch bound limits deletion, not all scan work.

40 unique pg_backend_pid sessions waited behind the same verified advisory
start barrier: 40 observations, 30 logical turns, 10 duplicate retries,
11 conversations, 60 messages, 30 deduplicated events.
Lost updates = 0; duplicate logical turns = 0.
20 concurrent feedback calls: 12 saved, 8 rate-limited, one active feedback row.
An overlapping maintenance transaction returned skipped rather than running twice.
Row/backlog thresholds were executed, not inferred:
99,999 messages normal; 100,000 warning; 250,000 critical;
50,000 due rows critical; 10,000 due rows warning.

### Measured Storage

All figures below are **local estimates**, not live Supabase allocation.
Each flavor uses 2,000 conversations, 4,000 messages and 2,000 events,
all actual schema indexes, mixed synthetic Chinese/English vocabulary.
User/assistant lengths: short 60/120; median 300/600; long 4,000/8,000
characters. A separate critical-excerpt sample uses 256/256 characters.
The repeatable vocabulary is compressible: incompressible text, metadata,
index fill/bloat, PG version, TOAST and workload can increase Production usage.

| Flavor / table | Heap bytes | Index bytes | Total bytes incl. TOAST/FSM/VM | Rounded total bytes/row |
| --- | ---: | ---: | ---: | ---: |
| Short messages | 1,859,584 | 1,605,632 | 3,497,984 | 875 |
| Short events | 1,171,456 | 1,032,192 | 2,236,416 | 1,119 |
| Short conversations | 385,024 | 565,248 | 983,040 | 492 |
| Median messages | 3,719,168 | 1,597,440 | 5,349,376 | 1,338 |
| Median events | 1,171,456 | 1,138,688 | 2,342,912 | 1,172 |
| Median conversations | 385,024 | 573,440 | 991,232 | 496 |
| Long messages | 3,899,392 | 1,654,784 | 11,173,888 | 2,794 |
| Long events | 1,171,456 | 1,122,304 | 2,326,528 | 1,164 |
| Long conversations | 385,024 | 573,440 | 991,232 | 496 |
| Critical excerpt messages | 2,678,784 | 1,638,400 | 4,349,952 | 1,088 |

Measurements use pg_relation_size, pg_indexes_size and pg_total_relation_size.
Total is not merely heap + indexes because TOAST and auxiliary forks matter.

Nine steady-state scenarios (decimal MB, **not a quota/headroom claim**):
C = conversations/day; M = persisted user + assistant messages/conversation;
T = M/2 turns. Assume 0.2 events/turn, events 90 days, conversations 90 days
after activity, messages 30 days for the original all-turn policy.
For a flavor with measured per-row bytes bm/be/bc:
`bytes = C*M*30*bm + C*T*0.2*90*be + C*90*bc`.

The last column illustrates the new non-critical policy with independent
20% signal probability and four-turn context coverage:
p = 1 - 0.8^4 + 0.8^4/16; effective message days = 8 + 22*p = 21.552.
It is an explicit illustrative model, not measured Production signal frequency.

| Conversations/day | Messages/conversation | All-turn 30d: short / median / long MB | Context/sample policy short-long MB |
| ---: | ---: | ---: | ---: |
| 100 | 6 | 26.2 / 34.9 / 61.0 | 21.8 - 46.9 |
| 100 | 12 | 48.0 / 65.3 / 117.6 | 39.1 - 89.3 |
| 100 | 20 | 77.1 / 105.8 / 193.1 | 62.3 - 145.8 |
| 500 | 6 | 131.1 / 174.4 / 305.2 | 108.9 - 234.4 |
| 500 | 12 | 240.1 / 326.4 / 588.1 | 195.7 - 446.5 |
| 500 | 20 | 385.4 / 529.2 / 965.3 | 311.4 - 729.2 |
| 1000 | 6 | 262.2 / 348.8 / 610.4 | 217.9 - 468.8 |
| 1000 | 12 | 480.1 / 652.9 / 1176.2 | 391.4 - 892.9 |
| 1000 | 20 | 770.7 / 1058.4 / 1930.6 | 622.9 - 1458.5 |

No-signal clean retention averages 9.375 days (15/16 at 8d, 1/16 at 30d).
All-signal workloads still require 30 days. Negative feedback frequency and
correlation can increase context coverage. Up to seven distinct observer
event types plus one active feedback can exist per turn: at eight events/turn,
the 1,000/day x 20-message event-only estimate rises to roughly 8.1-8.4 GB
over 90 days. Events cannot be silently dropped to fit a fictional Free quota.

These estimates exclude permanent review/owner/eval/metrics growth, other app
tables, WAL/backups, free-space reserve and late active conversations.
100/500/1000 conv/day correspond to low/medium/high TRAFFIC, not plan tiers.
Before Canary, measure the actual target PG/schema size and available headroom;
name the accountable operator and approved traffic/capture budget.
High signal/feedback pressure may require reducing collection or capacity
approval even with this protection. No Free-tier sustainability is certified.

### Capture Policy Decision

Keeping every normal transcript 30 days is unnecessary for error analysis and
costly: at 1,000 conversations/day x 20 messages, baseline is about
771-1,931 MB before other app/permanent data.
Chosen incremental policy keeps existing APIs and the sanitized feedback path:

- Normal clean turns: complete sanitized text for 8 days, preserving the existing
  7-day feedback-token window plus one calendar-day aggregation grace period.
- Stable clean sample: turn-hash bucket 0 out of 16 retains 30 days outside
  critical mode; retries never resample. This is a proportion, not a hard row cap.
- Signal or negative-feedback turn: 30 days; promote still-live prior two turns
  and current turn; next one is retained when it arrives. Late negative feedback
  also promotes an already-present next turn. No unbounded context recovery.
- Critical: disable clean long-term sampling and replace normal long transcripts
  with a <=256-character sanitized excerpt INCLUDING [CAPACITY_LIMIT] (at most
  239 text characters plus the marker for truncated input). Keep eight days for
  feedback; a subsequent negative vote promotes that already-sanitized excerpt
  to 30 days. Existing signal/current-neighbor evidence remains full and bounded.
- Events keep 90 days; review items, owner decisions, evals and daily metrics
  retain their permanent semantics. No pressure-based deletion of those records.

Tradeoff: critical-mode feedback still retrieves sanitized Q/A excerpts, but a
later negative vote cannot recover the omitted tail. Likewise pre-signal context
already truncated during critical pressure remains excerpted. Admin/Analyzer
must treat [CAPACITY_LIMIT] as incomplete evidence, never infer missing content.
There is NO client raw-transcript upload and NO read from original chat storage.
If complete late-feedback transcripts are an operational requirement, do not
activate critical collection without a separately approved capacity solution.

Capacity protection is row/backlog based, not guessed MB:
warning at message_rows or event_rows >=100,000, or due rows >=10,000;
critical at either >=250,000, or due rows >=50,000.
Daily maintenance refreshes the cached state once, so protection is not a
per-request hard quota and may lag a surge up to a schedule interval.
No per-turn global COUNT is introduced. Recent state is required by the
record RPC; missing or older-than-36-hour maintenance fails closed with 55000
before any Quality observation write. This isolates collection failure,
not a customer response failure. Operators must respond to signals, not assume
that bounded excerpts alone make unlimited event traffic safe.

### Maintenance Proposal (Not Executed)

Repo audit found no existing Vercel crons, pg_cron registration, maintenance
endpoint or cron-auth pattern for Quality. No scheduler/third-party service,
HTTP endpoint or Production secret was created here.
Prefer the existing Supabase database scheduler capability, subject to an
authorized target check. It can schedule SQL/functions and expose job history.
[Official Supabase Cron documentation](https://supabase.com/docs/guides/cron)
and [job management instructions](https://supabase.com/docs/guides/cron/quickstart)
were checked 2026-09-10. This does not verify pg_cron is installed in this project.

The proposal is server-internal SQL, no URL/header credential and no public
unauthenticated HTTP entrypoint. A future authorized operator should:
1. Verify exact project/database, PG version, extension availability, migration
   hashes, final grants and inactive collection flags. Check existing jobs for
   collisions; do not overwrite a same-name job.
2. Install/enable pg_cron only under separate approval if absent. If unavailable,
   keep Observer OFF and obtain approval for an authenticated operator runner;
   do not invent a new external scheduler or expose a public cleanup endpoint.
3. Assign the trusted job owner. The database owner schedules the SQL below,
   then SET LOCAL ROLE service_role limits the job's invocation privilege.
   No HMAC/service-role value belongs in SQL, URLs, report or cron metadata.
4. Schedule daily 02:20 Asia/Taipei. For a verified UTC cron timezone this is
   `20 18 * * *`; inspect `current_setting('cron.timezone', true)` first.
   Dashboard: Integrations -> Cron -> Jobs -> Create job, distinct name
   `ai-quality-daily-maintenance`, SQL snippet. Verify timezone before saving.
5. Job SQL to configure later (a WRITE, not an A2 read-only probe):

~~~sql
begin;
set local role service_role;
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select public.run_ai_quality_maintenance(1000, 40);
commit;
~~~

At most 40 batches, each at most 1,000 messages/events/conversations selected;
aggregate Taipei yesterday first, then seal complete source days before cleanup.
Locks and expired-row selection are reused; overlapping runs skip, retries
continue from remaining evidence, metrics upserts/sealed days are idempotent.
Failure rolls the whole maintenance transaction back, including freshness.
The explicit outer session timeout is required; do not rely solely on a
function-local statement_timeout to bound an already-started SQL command.

Before Canary, execute one authorized maintenance rehearsal, then observe an
actual scheduled success and verify its state/metrics/deletion behavior. An
ad hoc recent successful call alone is NOT proof a scheduler is active.
Inspect only safe operational fields:

~~~sql
select last_completed_at, capture_mode, conversation_rows, message_rows,
       event_rows, cleanup_due_count
from public.ai_quality_maintenance_state;

select jobid, jobname, schedule, active
from cron.job where jobname = 'ai-quality-daily-maintenance';

select status, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'ai-quality-daily-maintenance'
)
order by start_time desc limit 10;
~~~

Do not dump job commands/connection metadata or arbitrary return_message values.
Use Dashboard job history plus safe counts; never log payload/PII on failure.
Assign the site owner or named approved operator to daily checks and alerts:
failed job, no completed run by 26h, oldest/critical backlog, or critical mode
requires action. At >36h collection rejects automatically; customer AI continues.
If a bounded run leaves backlog, diagnose/approve a retry or schedule change;
never run an unbounded DELETE, truncate Production tables or drop safety checks.
A dry empty-schema test does not certify Production throughput. Verify autovacuum
and actual disk headroom before high-volume collection; deletion can free
reusable space without immediately shrinking physical files.

### Activation Boundaries And Stop Conditions

A2 schema-only with all flags OFF: scheduler may be absent. Must still obtain
new approval, inspect live drift/dependencies/ACLs and compare these exact bytes.
No A2 execution was performed during A1.1.
Before Observer Canary: deployed hardening sanitizer AND all four migrations,
successful scheduled maintenance, freshness/backlog alert owner, target-engine
measurement and actual available capacity are mandatory. Flags remain OFF here.

STOP for: any synthetic leak; any new unrelated regression; changed historical
migration; unknown Production schema/grants; missing fresh maintenance or job
proof; unexpected raw text in Quality; absent target capacity evidence;
unbounded backlog, or new model/customer-state behavior.
The RPC freshness guard blocks observations when maintenance is missing/stale.
It does not itself inspect cron registration; the release gate must verify the
schedule and alert path, not merely set an env flag.

### Verification And Changed Files

Local automated evidence:
- Quality suites: 769/769; hardening migration suite 41/41.
- Privacy hardening: 336/336 (270 persisted corpus); legacy privacy: 157/157.
- Actual handler: 170/170. OFF/ON answer, response_kind, scenario, pending,
  quote and provider counts stay equal; existing certified 20-case owner paths
  are still covered. Mock provider paths are not real model requests.
- Real PG large-plan, 40-session concurrency, feedback, pressure and storage gate:
  PASS; real DeepSeek/model calls: 0.
- FAQ: 98/98; CSV 310 approved, 0 errors, 98 pre-existing warnings;
  official build dry-run byte projection unchanged. Optional embeddings absent,
  not required. No FAQ/MD writes.
- Full repo: **2708/2710 PASS**, exactly the two existing
  `client/src/data/aboutContent.test.ts` failures. Its source/test and About.tsx
  are raw-byte identical to HEAD. No assertion was relaxed.
- `npm.cmd run check -- --incremental false`: PASS.
- `npm.cmd run build`: PASS after retrying a sandbox EPERM on generated dist
  copying with authorized local permissions. Existing Vite large-chunk warning
  remains. FAQ tooling's existing Node module-type warning remains.
- `git diff --check`: PASS; untracked new artifacts also checked separately.
- Historical migrations: byte-identical; no extra runtime model call,
  semantic/scenario/pending/pricing/customer-wording change.

Exactly seven changed/untracked files, none staged:
1. client/server/aiQuality/privacy.js
2. client/server/aiQuality/privacyHardening.test.js
3. client/server/aiQuality/activationHardening.test.js
4. client/tests/api/ai-chat-structured.test.js
5. client/scripts/ai/runQualityPostgresGate.mjs
6. client/supabase/migrations/2026-09-10-ai-quality-activation-hardening.sql
7. docs/AI_QUALITY_PRODUCTION_ACTIVATION.md (pre-existing A1 runbook)

Temporary DB files contain synthetic data only and are outside the repo.
No dependency or lockfile edit. Local PostgreSQL is stopped after verification.
Production DB/env unchanged; no migration execution artifact from Production.
A1.1 = PASS; recommend A1 = PASS; recommend next **approval for A2 schema-only**.
Observer/feedback activation remains a later explicit gate.

## Historical A1 Audit (Superseded)

The following is the original A1 FAIL record. Its three-migration inventory,
old privacy limitations and old capacity conclusions are historical. Use the
A1.1 manifest, capture policy and activation boundaries above for next steps.

## A1 Verdict

Audit date: 2026-09-10. Checkpoint: `3c8842a50441d8e9d59831bb7407bfd405038870`.
Branch: `main`. Initial worktree: clean. No Production connection, schema write,
env change, deployment, commit, or push was performed.

**A1 GATE: FAIL. Step A2 recommendation: NO until the readiness findings below
are resolved or explicitly dispositioned in a new gate.**
The three application migrations apply successfully on the official local
predecessor schema. Do not confuse that SQL success with permission to activate
the observer or a guarantee that sanitized free text contains no PII.

### Findings

| ID | Finding | Evidence / required disposition |
| --- | --- | --- |
| A1-01 | Privacy canary does not satisfy a no-raw-PII activation claim. | The current `sanitizeAiQualityText` retains synthetic, explicitly labelled name and address values. It normalizes punctuation, which is NOT redaction. Phase 1A/1B/1C documents already disclose incomplete name/address coverage. No real customer data was read or leaked during this audit. Do not enable collection until an owner-approved privacy boundary/remediation passes a separate gate. No runtime fix is authorized here. |
| A1-02 | Cleanup scan work is not bounded by the delete batch. | At 10,000 conversations / 20,000 messages / 20,000 events, the empty-conversation anti-join used a sequential scan over events. Expired messages/events used their retention indexes. Full-day aggregation and storage COUNTs can also examine many rows. This is not an unbounded DELETE, but a blanket no-full-scan/performance PASS is unsupported. Benchmark the target engine and planned volume before collection. |
| A1-03 | Retention is callable, not scheduled. | Foundation explicitly installs no scheduler. A generated expiry timestamp does not delete a row. Assign an approved cleanup operator/schedule, timeout and backlog alert before Observer Canary; none was created here. Free-tier capacity cannot be certified from row counts without current headroom and measured row/index size. |
| A1-04 | Concurrent-transaction evidence has a limit. | RPC row locks, arithmetic updates, unique indexes and rollback were verified. Existing concurrent Promise tests use one PGlite connection, not independent server sessions. No local psql/postgres/docker command was available. A separate target-version, multi-session rehearsal is required before claiming measured contention/latency safety. This is not a discovered lost-update defect. |

Schema-only findings that are operational preconditions, not new code defects:
- Phase 1C requires existing `public.admin_permissions`. A platform-only database
  passes A/B but C fails `42P01`, with its transaction rolled back.
- Replaying A alone after B/C downgrades `ai_quality_valid_metadata`. Ordered
  A/B/C replay and repeated B/C preserve the final schema. Never retry old A
  against active writers or replay the entire historical application directory.
- Repo collision audit cannot detect manual Production drift. A2 must start with
  separately authorized, read-only live prechecks and exact artifact comparison.

## Migration Manifest

All paths below are relative to the repository root. Execute these files only
after a new explicit A2 approval, exactly in this order:

| Phase | File under `client/supabase/migrations/` | SHA256 of working bytes |
| --- | --- | --- |
| 1A | `2026-09-09-ai-quality-foundation.sql` | `f1ef296f6b77addb0461a82c19ea13c4ef2f41d783c7290fb70dfadfd5e5e637` |
| 1B | `2026-09-09-ai-quality-runtime-observer.sql` | `f18a1fbc61eeefc5bd15e4a741cfd88c5e374e464eea3d89e99193493fcd59c1` |
| 1C | `2026-09-10-ai-quality-feedback-admin.sql` | `3a05655b38c180bae1529383662005bf5297e8ecb9b0c0ba35f371b71477ee94` |

Byte-identical to their committed versions:
- A: `e4650054bb7b4017061426ef3db1d97d9bdbd486`; Git blob `c6840931a467e8753870cfa10ec681db5f3f2fa5`.
- B: `08002542eaf1a655e79bf5970127ad3af6aff212`; Git blob `61508aaac7b3e94b66213b9ba99d98c3de73b233`.
- C: current checkpoint; Git blob `c49d7f33e3a098c1131eecd713c99a1a8e736853`.
- No historical migration was edited.

A creates seven tables, their checks/FKs/indexes, four immutable validators,
an updated-at trigger function, three triggers and three maintenance functions.
It enables RLS, installs **zero policies**, revokes PUBLIC/anon/authenticated CRUD,
and grants service_role CRUD/EXECUTE.

B extends the metadata validator, adds conversation `observer_turn_count`,
message `turn_key_hash` / `execution_metadata`, event `turn_key_hash`, two
unique idempotency indexes and `record_ai_quality_turn(jsonb)`.
It initializes observer_turn_count from historical AI message turn indexes.
That UPDATE is an AI-only compatibility backfill, not a runtime COUNT query.

C adds message `feedback_window_at` / `feedback_request_count` and event
`feedback_category` / `feedback_updated_at` / `reviewed_at`, three indexes,
five RPCs and two Admin permission codes (`ai_quality.view` / `ai_quality.review`).
It does not grant those permissions to every ordinary Admin role.
Existing super_admin permission loading reads all permission codes; other roles
still need deliberately approved permission assignments.

Final executed catalog: **7 tables, 94 columns, 34 indexes, 71 non-NOT-NULL
constraints (55 CHECK, 7 PK, 6 FK, 3 UNIQUE), 14 functions, 3 triggers, 0 policies**.
PostgreSQL 18 reports NOT NULL constraints separately; do not compare that
engine-specific total blindly to older server versions.
Detailed column, constraint and index inventory appears below.

## Fresh Apply And Dependencies

Engine: in-memory PGlite 0.5.8, PostgreSQL 18.3; no network/Production data.
The local platform fixture only supplies Supabase's three roles and auth.users(id).
It is not a claim to reproduce the complete Supabase platform or its live ACLs.

Before the A/B/C test, the empty application database received these **unaltered
official predecessor migrations**, with the bundled pgcrypto extension available:
1. `2026-06-16-shop-warehouse-assets.sql`
2. `2026-06-17-admin-users-roles-permissions.sql`

The latter requires auth.users, pgcrypto and shop_housekeeping_records. No
hand-created admin_permissions table, partial SQL extraction, skipped statement
or repair SQL was used. Immediately before A, the AI table count was zero.
A -> B -> C then completed without intervention (local times 22 / 4 / 3 ms,
not Production estimates). Tests add synthetic rows only AFTER successful apply.

A/B/C alone are not a standalone application bootstrap: on a second platform-only
database, A and B passed, C failed on missing admin_permissions. That negative
dependency test is expected; do not repair Production ad hoc or replay the
Admin predecessor there (it also reseeds roles/permissions).

Dependency graph: platform -> official warehouse -> official Admin permissions;
A -> B -> C, with Admin permissions -> C. No function/policy dependency cycle.
FKs are confined to these seven Quality tables; C's permission INSERT is the only
write to a pre-existing application table. No Booking/chat core schema change.

Repo audit scanned all 49 tracked SQL files and searched Quality references
repo-wide. The 45 distinct explicit Quality table/function/index names have no
unexpected definitions outside A/B/C. The same-signature metadata replacement
in A/B is intentional. There are no SQL enum objects or new policies.
Unexpected overloads/objects in live Production remain unknown, not assumed absent.

## Replay And Migration Mechanism

Each Quality file has its own BEGIN/COMMIT. A failed file rolls back that file;
successfully committed earlier files remain. Transport uncertainty requires
inspection of actual schema/ledger before any retry.

Fresh final catalog and complete ordered A/B/C replay were identical, including
columns/checks/indexes/function definitions and permission rows. Repeated B and C
were also identical. Tables/indexes/columns use IF NOT EXISTS, functions use
CREATE OR REPLACE, and permission rows use ON CONFLICT DO NOTHING. No duplicated
table/function/policy/index/enum/constraint was produced in these local replays.
IF NOT EXISTS is **not** validation or repair of an incompatible existing object.

The repo has dated hyphenated SQL files but no tracked Supabase config.toml,
migration application npm script or demonstrated migration ledger integration.
Do not claim that a framework has guaranteed exactly-once execution. Inspect the
actual chosen operator/tool and its history in A2. Do not blindly run db push,
rename historical files, or infer deployment automatically applies migrations.

A-alone regression was explicitly tested using valid B metadata:
`{before_version:1,after_version:1,read_only_turn:true}` within observer metadata.
Validation: before replay TRUE -> after A alone FALSE -> after B/C TRUE.
Keep all flags OFF while applying/resuming an approved ordered migration plan.

## Security And Data Lifecycle

Seven-table ACL checks: anon/authenticated deny all **56 CRUD combinations**;
service_role has all 28 CRUD grants. RLS is enabled on 7/7 tables, FORCE RLS is
not set, and policies are absent. Owner/BYPASSRLS access is intentional.
Function EXECUTE checks: anon/authenticated deny 28/28; service_role allowed 14/14.

Nine RPCs use SECURITY DEFINER; four validators and the trigger function use
invoker rights. Fixed `search_path=public, pg_temp` applies to all 14. Application
objects are schema qualified; pg_catalog resolves implicitly first; pg_temp is
last. This is safe only if untrusted users cannot CREATE in public. The local
roles could not; verify every live untrusted role/PUBLIC membership before A2.
SECURITY DEFINER is not strictly necessary for service_role today because it
already has BYPASSRLS/CRUD. It preserves the repo's privileged RPC boundary;
do not broaden EXECUTE or treat it as an additional browser permission.
No user-controlled SQL identifiers/interpolation occur in the RPCs. The only
dynamic SQL is fixed-table-list migration DDL using format %I.

Messages expire at created_at + 30 UTC days; events at +90 UTC days.
Conversation expiry is last_activity_at +30 days but deletion requires no retained
messages AND no retained events, so event-bearing conversations can live ~90 days
or longer if active. Resolved reviews, owner decisions, eval cases and daily
metrics are permanent until a separately authorized process handles them.

All six Quality FKs use RESTRICT or SET NULL, **zero CASCADE**. Message deletion
clears only event.quality_message_id, preserving conversation/review references.
Owner decision -> review is RESTRICT; eval -> review is SET NULL.
Cleanup never deletes the four permanent tables. Daily metrics are finalized
before a partial batch removes source evidence; subsequent aggregation returns
the finalized snapshot instead of recounting deleted rows.

Cleanup is one advisory-lock-protected transaction, batch 1..10000, with
SKIP LOCKED selections and UUID/PK-based deletion. The batch limit applies
separately to each table, not total work or scanned rows. Do not schedule cleanup
inside the customer response path. Use an explicitly approved maintenance timeout
and retry policy; the maintenance functions themselves have no statement timeout.
Dead tuples still require normal vacuum; deleting rows does not immediately
shrink relation files or recover physical quota.

Observer: conversation upsert -> FOR UPDATE -> same-turn existence check ->
two messages -> unique events -> arithmetic counters, all within one function
transaction. Distinct turn sequence and same-turn replay were verified.
An injected local event-insert error rolled back the entire new turn.
Counters are cumulative accepted writes, NOT retained-row counts after cleanup.
Idempotency survives while a message or event hash remains; after all evidence
expires this is not an eternal replay ledger. Do not replay old observations.

Feedback: same conversation-then-message lock order, atomic minute-window limit
(12 requests/message/minute), partial unique active-feedback index for non-null
runtime turn hashes, repeat idempotency, polarity switch and latest-category
replacement. Existing null-hash legacy rows are outside that uniqueness guarantee;
precheck them rather than assuming every service-role insert followed the RPC.
Verified positive -> positive -> negative(A) -> negative(B): one active record,
latest category, counter increment only for first insertion.

Feedback tokens contain only HMAC conversation/turn references and version/time;
no raw conversation/message identifier. Signature and expiry are checked before
the service RPC. Token values are not stored in Quality tables. Unknown/expired/
invalid references safely reject. Admin evidence UUIDs are exposed only through
authenticated permission-checked server APIs, not public enumeration endpoints.
DB sanitized-text checks enforce lengths, NOT universal PII recognition (A1-01).

## Capacity And Index Cost

Assumptions: messages include BOTH user and assistant rows (two rows per turn).
Steady daily traffic, timely cleanup, average 0.2 persisted events/turn including
feedback is a planning scenario, not an observed rate. Stress column assumes
8 unique events/turn (7 observer types plus 1 active feedback); direct service
writes outside the runtime contract are not bounded by this assumption.

| Conversations/day | Messages/conversation | Messages retained 30d | Events retained 90d at 0.2/turn | Stress events at 8/turn |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 6 | 18,000 | 5,400 | 216,000 |
| 100 | 12 | 36,000 | 10,800 | 432,000 |
| 100 | 20 | 60,000 | 18,000 | 720,000 |
| 500 | 6 | 90,000 | 27,000 | 1,080,000 |
| 500 | 12 | 180,000 | 54,000 | 2,160,000 |
| 500 | 20 | 300,000 | 90,000 | 3,600,000 |
| 1,000 | 6 | 180,000 | 54,000 | 2,160,000 |
| 1,000 | 12 | 360,000 | 108,000 | 4,320,000 |
| 1,000 | 20 | 600,000 | 180,000 | 7,200,000 |

Formulas: C*M*30; C*(M/2)*event_rate*90.
Without cleanup these are NOT upper bounds. Four permanent tables also grow
outside the retention windows. Messages (up to 8,000 characters each plus metadata)
and events (90d, multiple JSON fields and 11 indexes) are the main risks.
UTF-8 bytes, TOAST/compression, UUID/hash B-trees, bloat, WAL and existing database
usage prevent a precise MB estimate from row counts. No current Free-tier quota
was looked up or assumed. The largest scenario cannot honestly be certified as
fitting a Free project without measuring representative byte sizes and headroom.

Final index count 34: 10 PK/UNIQUE-constraint indexes plus 24 explicit indexes.
The per-index mapping in the inventory distinguishes live queries, integrity/FK
support, and future-only overhead. No index was added/removed in A1.

Local plan fixture: 10,000 conversations / 20,000 messages / 20,000 events,
5% expired conversations and 5% expired messages/events; ANALYZE performed locally.
- Expired message selection: ai_quality_messages_retention_idx, Index Scan.
- Expired event selection: ai_quality_events_retention_idx, Index Scan.
- Empty conversations: conversation retention Bitmap Index Scan, message
  turn-role index probe, but events Hash Anti Join with Seq Scan over 20,000 rows.
- Admin page: ai_quality_events_page_idx, Index Scan, LIMIT 26.
- Daily message count: ai_quality_messages_created_idx, Index Only Scan.
- Actual local batch100: 100 messages / 100 events deleted, 0 conversations,
  ~19 ms. This is NOT a hosted latency prediction or sustained-load test.
- No forced planner settings were used. Index presence alone does not prove
  index use for all distributions. Explain the actual target-version plan.

## Lock And Rollback Plan

A creates new Quality objects and grants; there is no Booking/chat backfill.
B/C ALTER the newly created Quality tables and build normal (non-concurrent)
indexes; ALTER can take strong locks, and index builds block writes on those
Quality tables. B's counter initialization scans existing Quality messages and
may update Quality conversations. Adding constant-default columns on the tested
engine does not require a data rewrite; still verify the actual server version.
The C unique index can fail if existing active-feedback duplicates exist.

C also takes an INSERT/ROW EXCLUSIVE lock on existing admin_permissions for two
codes (and index row locks if concurrent permission editing occurs). No migration
targets Booking, payment, cancellation, core chat or customer tables and there
are no FKs from the Quality schema into those tables. Shared catalog/I/O load
still affects the same database. Do not promise zero Production impact or exact
wall-clock time; keep flags OFF, use a quiet window and an approved lock timeout.

Rollback strategies, not executed:
- **A: failed/uncertain migration.** Stop immediately. Roll back the failed open
  transaction via the operator's approved tool; inspect schema and confirmed
  commit boundaries. A/B may already be committed when C fails. Preserve approved
  SQL byte hashes and metadata-only execution status. Do not blindly retry, edit
  an old migration, create a substitute table or run historical Admin reseeding.
- **B: all applied, observer OFF.** Leave dormant schema in place with all flags
  OFF. No table DROP is needed. Correct problems with a separately approved new
  migration or a reviewed recovery plan after verified backup.
- **C: enabled and a problem occurs.** Stop rollout, disable observer and feedback;
  disable Admin if its read load or exposure contributes. Verify the *effective
  deployed* flags and in-flight writes actually stop. Changing a project setting
  is not by itself proof an existing deployment changed. Use an explicitly
  approved release/rollback route if needed; none is authorized by A1. Retain
  incident evidence under access control, avoid copying raw content into reports,
  and perform backup before any later data correction or schema rollback.
- Do not propose unbacked DROP, destructive cascade, blind schema rollback or
  cleanup as an emergency substitute for disabling collection.

## Planned Activation Order

Nothing in this section is executed or authorized by A1.

1. **A2 - Schema:** only after A1 findings are closed and explicit approval.
   Verify exact project/database identity privately, checkpoint/artifact hashes,
   platform version, roles/schema ACL, Admin dependency, absence or exact known
   migration prefix, no conflicting overloads/policies/indexes, backup/restore
   readiness and an ordered execution ledger. All flags OFF. Apply exact A/B/C
   separately with stop-on-error, checking each result. Never apply all repo SQL.
2. **B - Secret:** separately approve secure provisioning of the dedicated
   AI_QUALITY_HMAC_SECRET (at least 32 UTF-8 bytes; generate a high-entropy value
   in the owner's secret-management workflow). No value in commands, artifacts,
   logs, chat or git. Existing server database credentials are not this secret.
   Secret rotation invalidates existing feedback tokens and pseudonymous linkage;
   treat rotation as a separately reviewed operation, not routine retry.
3. **C - Observer Canary:** after privacy/cleanup/capacity/contention gates pass,
   enable only observer (100) on the explicitly approved deployment/cohort.
   Do not assume this global boolean provides per-customer sampling; code has no
   percentage/cohort switch. An isolated deployment using synthetic traffic is
   the safest first canary. Never route unapproved real customer data into it.
4. **D - Data Integrity:** audit count-only and privilege queries below. Compare
   the same synthetic turns with flags OFF/ON: customer answer, semantic state,
   provider count and HTTP status unchanged; one pair per unique turn, no lost
   counters, no unexpected Quality table writes. Check final effective flags,
   sidecar completion, PII canaries and latency before increasing exposure.
5. **E - Feedback:** separately approve 110. Check one signed token per eligible
   assistant result, absent token when disabled/missing secret, no raw references.
   Wait for that synthetic turn's sidecar completion before voting. Exercise
   positive/repeat/negative/category-change, expired/unknown tokens, one active
   row, rate limiting, and no extra model calls. Do not use real bookings.
6. **F - Admin:** separately approve 111. Verify least-privilege view/review
   permissions and expired-auth/401/403. Read only sanitized bounded evidence,
   keyset pagination and separately requested health metrics. Review only an
   approved synthetic event. No owner decisions/FAQ publishing/eval activation.

Canary acceptance: pre-agree duration/volume and a numeric latency threshold.
Suggested starting evidence: 20 unique synthetic turns, known-answer and
clarification/provider-error fixtures without calling a real provider, same-turn
delivery retries, two independent DB clients for concurrent persistence, missing
HMAC/DB timeout/schema-unavailable faults, and the complete supported PII matrix.
Record only counts/categories/latencies, never messages, tokens or secrets.
The model budget must not increase relative to the same baseline turns.

Daily maintenance ownership and a bounded schedule must be approved before
collection. Do not schedule a deletion job as part of this schema-only gate.
After separate approval, start with a small batch, observe due-count backlog,
duration, lock waits, vacuum and table/index bytes; do not loop indefinitely
inside a request or run unbounded maintenance automatically.

## Flag And Secret Matrix

Bit order: observer / feedback / Admin. Only the literal server string `true`
enables a flag. Unset/false/other values are OFF. No flag value was read or changed
on Production in A1.

| Bits | Observer writes | Customer feedback | Admin |
| --- | --- | --- | --- |
| 000 | None | No token; endpoint 404 | Auth checked; enabled:false |
| 100 | Best-effort sidecar | No token; endpoint 404 | Auth checked; enabled:false |
| 110 | Best-effort sidecar | Token + verified feedback RPC | Auth checked; enabled:false |
| 101 | Best-effort sidecar | No token; endpoint 404 | Permission-checked evidence access |
| 111 | Best-effort sidecar | Token + verified feedback RPC | Permission-checked evidence access |
| 010 | None | Disabled because observer OFF; endpoint 404 | Auth checked; enabled:false |
| 001 | None | No token; endpoint 404 | Existing evidence may be read |
| 011 | None | Disabled because observer OFF; endpoint 404 | Existing evidence may be read |

Observer ON with missing/short HMAC: preparation rejects, no Quality RPC write,
customer AI already has its response; only a safe warning category is logged.
Feedback ON with missing/short HMAC: no valid token; submitted tokens fail safely.
Admin reads do not require HMAC; they require Admin authentication/permissions,
Admin flag and existing server DB connectivity. Missing schema/DB failure returns
a controlled unavailable/not_initialized response, not fabricated statistics.
Feedback never signs with Supabase/Vercel/DeepSeek credentials.
No additional LLM request is introduced by observer/feedback/Admin or migrations.

## Verification SQL

**Prepared only. No query below was sent to Production in A1.**
Execute these only in the exact separately approved database. Read-only catalog
queries do not replace authenticated HTTP behavior checks. Do not export private
roles/accounts, raw data, connection strings or SQL-client credentials.

### Before A2: identity, dependencies and collisions

```sql
begin read only;
select current_setting('server_version') as server_version,
       current_setting('server_version_num') as server_version_num;
select r.rolname, r.rolcanlogin, r.rolbypassrls
from pg_roles r where r.rolname in ('anon','authenticated','service_role');
select to_regclass('public.admin_permissions') as admin_permissions,
       to_regclass('auth.users') as platform_users,
       to_regnamespace('supabase_migrations') as possible_migration_ledger;
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='admin_permissions'
order by ordinal_position;
select k.conname,pg_get_constraintdef(k.oid)
from pg_constraint k
where k.conrelid=to_regclass('public.admin_permissions');
select r,has_schema_privilege(r,'public','CREATE') as public_create
from unnest(array['anon','authenticated','service_role']) r;
-- Count, do not display credentials or private role metadata.
select count(*) as public_create_acl_entries
from pg_namespace n cross join lateral aclexplode(
  coalesce(n.nspacl,acldefault('n',n.nspowner))) a
where n.nspname='public' and a.grantee=0 and a.privilege_type='CREATE';
select c.relname,c.relkind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and
 (c.relname like 'ai_quality_%' or c.relname like 'ai_review_%'
  or c.relname like 'ai_owner_%' or c.relname like 'ai_eval_%'
  or c.relname like 'ai_daily_%')
order by c.relname;
select p.proname,pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
 and (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics')
order by p.proname,args;
rollback;
```

Expected on first activation: required platform roles/Admin permission schema
exist, untrusted public CREATE is false, Quality objects/functions are absent.
A live role hierarchy/extra schema owner must be reviewed, not merely the three
named role booleans. A ledger namespace alone is not proof these filenames were
recorded or applied by that framework. Inspect its actual version entries safely
only after confirming the ledger contract. Any unexpected Quality object,
signature or permission/policy drift: STOP. On a deliberate resume compare the
whole confirmed prefix, not merely object existence.

### After exact A/B/C: schema and RLS

```sql
begin read only;
with t(name) as (values ('ai_quality_conversations'),('ai_quality_messages'),
 ('ai_quality_events'),('ai_review_items'),('ai_owner_decisions'),
 ('ai_eval_cases'),('ai_daily_metrics'))
select t.name,c.relrowsecurity,c.relforcerowsecurity
from t left join pg_class c on c.oid=to_regclass('public.'||t.name);
select table_name,column_name,data_type,is_nullable,column_default,
       is_generated,generation_expression
from information_schema.columns
where table_schema='public' and table_name in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by table_name,ordinal_position;
select tablename,indexname,indexdef
from pg_indexes where schemaname='public' and tablename in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by tablename,indexname;
select c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by c.relname,k.conname;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
with t(name) as (values ('ai_quality_conversations'),('ai_quality_messages'),
 ('ai_quality_events'),('ai_review_items'),('ai_owner_decisions'),
 ('ai_eval_cases'),('ai_daily_metrics'))
select name,r,priv,has_table_privilege(r,'public.'||name,priv) as allowed
from t cross join unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv;
select p.proname,pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as public_user_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
 and (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics')
order by p.proname,args;
select tg.tgname,c.relname,pg_get_triggerdef(tg.oid)
from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
where not tg.tgisinternal and c.oid in
 (to_regclass('public.ai_quality_conversations'),
  to_regclass('public.ai_review_items'),to_regclass('public.ai_eval_cases'));
select code,module,action from public.admin_permissions
where code in ('ai_quality.view','ai_quality.review') order by code;
rollback;
```

Expected: complete inventory below, 7 RLS enabled, 0 policies, 56 denied browser
CRUD checks, 14 functions with the stated fixed path and no browser EXECUTE.
Validate function bodies against the approved artifacts in a secure SQL session;
a matching name/signature alone is insufficient.

### Read-only canary integrity and privacy screening

Run in an explicitly approved short-lived canary dataset or bounded period.
These queries return counts only. Do not compare cumulative conversation counters
to retained rows after cleanup without accounting for deletions.

```sql
begin read only;
select count(*) as duplicate_message_groups from (
 select quality_conversation_id,turn_key_hash,role
 from public.ai_quality_messages where turn_key_hash is not null
 group by 1,2,3 having count(*)>1
) d;
select count(*) as duplicate_active_feedback_groups from (
 select quality_conversation_id,turn_key_hash
 from public.ai_quality_events
 where event_type in ('positive_feedback','negative_feedback')
 group by 1,2 having count(*)>1
) d;
select count(*) as null_turn_feedback_rows
from public.ai_quality_events
where event_type in ('positive_feedback','negative_feedback')
 and turn_key_hash is null;
select count(*) as incomplete_recent_turns from (
 select quality_conversation_id,turn_key_hash
 from public.ai_quality_messages
 where turn_key_hash is not null and created_at>=now()-interval '1 day'
 group by 1,2 having count(*)<>2 or count(distinct role)<>2
) t;
-- Allow in-flight sidecars to settle; audit a fixed canary window.
select count(*) as counter_mismatches_before_cleanup
from public.ai_quality_conversations c
where c.started_at>=now()-interval '1 day' and (
 c.message_count<>(select count(*) from public.ai_quality_messages m
                  where m.quality_conversation_id=c.id)
 or c.quality_event_count<>(select count(*) from public.ai_quality_events e
                         where e.quality_conversation_id=c.id)
 or c.observer_turn_count<>(select coalesce(max(turn_index),0)
                          from public.ai_quality_messages m
                          where m.quality_conversation_id=c.id));
select count(*) as unexpected_metadata_or_context
from public.ai_quality_events
where not public.ai_quality_valid_metadata(metadata_json)
   or not public.ai_quality_valid_context(sanitized_context);
select count(*) as invalid_hash_rows
from public.ai_quality_messages
where turn_key_hash is not null and turn_key_hash !~ '^[a-f0-9]{64}$';
-- Detection aid, NOT proof that PII is absent. Never select offending text.
select count(*) as recent_text_screen_hits
from public.ai_quality_messages
where created_at>=now()-interval '1 day' and (
 sanitized_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
 or sanitized_text ~ '(^|[^0-9])09[0-9 -]{8,12}([^0-9]|$)'
 or sanitized_text ~ '(^|[^0-9])[0-9]{10,30}([^0-9]|$)'
 or sanitized_text ~* '(sk-|sb_secret_|ghp_)[A-Za-z0-9_-]+'
 or sanitized_text ~* '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}');
select count(*) as negative_flag_mismatches_before_event_cleanup
from public.ai_quality_conversations c
where c.started_at>=now()-interval '1 day'
 and c.has_negative_feedback is distinct from exists(
   select 1 from public.ai_quality_events e
   where e.quality_conversation_id=c.id and e.event_type='negative_feedback');
rollback;
```

Expected anomaly counts zero in a settled fresh canary. Run schema key allowlists
and supported-format redaction canaries on both question and answer, plus explicit
labelled/unlabelled names and addresses. This regex scan cannot certify them.
Also screen any future review/owner/eval free text before collection. Today
observer/feedback/Admin do not populate those permanent evidence tables.
Do not join Production chat tables to export raw identifiers as an audit shortcut.
If synthetic source IDs are used, assert their absence locally/in the approved
canary without recording the source values. Do not dump message rows to a report.

### Performance and storage (read only)

```sql
begin read only;
explain (format json)
select id from public.ai_quality_messages where retention_expires_at<=now()
order by retention_expires_at,id limit 100;
explain (format json)
select id from public.ai_quality_events where retention_expires_at<=now()
order by retention_expires_at,id limit 100;
explain (format json)
select c.id from public.ai_quality_conversations c
where c.retention_expires_at<=now()
 and not exists(select 1 from public.ai_quality_messages m where m.quality_conversation_id=c.id)
 and not exists(select 1 from public.ai_quality_events e where e.quality_conversation_id=c.id)
order by c.retention_expires_at,c.id limit 100;
select relname,n_live_tup,n_dead_tup,last_autovacuum,last_autoanalyze
from pg_stat_user_tables where schemaname='public'
 and relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
select c.relname,pg_table_size(c.oid) as table_bytes,
       pg_indexes_size(c.oid) as index_bytes,pg_total_relation_size(c.oid) as total_bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
 and c.relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
select relname,indexrelname,idx_scan,idx_tup_read,idx_tup_fetch
from pg_stat_user_indexes where schemaname='public'
 and relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
-- Full counts: request deliberately, not on every UI load.
select public.get_ai_quality_storage_metrics();
rollback;
```

The read-only EXPLAINs deliberately omit row locks. Local audit also inspected
the exact FOR UPDATE SKIP LOCKED variants. Repeat those in an approved local
multi-session clone; never EXPLAIN ANALYZE a mutating Production RPC in a
read-only gate. Do not export pg_stat_activity.query (it can contain private data).
Measure lock waits via counts/categories only. A low idx_scan before activation
does not prove an integrity/FK index is unnecessary.

Cleanup/aggregation RPCs are **writes**, despite SELECT-call syntax. They are not
part of the SQL blocks above. Only after separate maintenance approval may an
operator use `select public.delete_expired_ai_quality_data(100);`, verify bounded
deletions and permanent rows/daily totals, then stop or schedule approved batches.
`aggregate_ai_daily_metrics(date)` also writes; never call it as a harmless
Production read probe.

## Stop Conditions And Evidence

Immediately stop further activation switches on any:
- Migration error, ambiguous commit boundary or unexpected schema/ledger drift.
- Public RLS/ACL/EXECUTE exposure or untrusted CREATE in the definer search path.
- Raw PII, raw conversation identifier, token, secret, prompt or model dump found.
- AI response/state/pricing regression or any additional provider call.
- Noticeable latency increase, breached agreed budget or problematic lock waits.
- Wrong counters, duplicate messages, duplicate active feedback or incomplete pair.
- Quality API failure affecting customer AI, false success metrics, or unbounded backlog.

Local evidence in this audit:
- Official predecessor + unchanged A/B/C fresh apply: PASS.
- Ordered replay and B/C retry schema equality: PASS; A-alone caveat documented.
- Schema contract / RLS / RPC privilege: PASS.
- Observer retry/25 distinct turns/forced-error full rollback: PASS.
- Feedback repeat, polarity/category switch, latest-state counters: PASS.
- Batch7 cleanup preserves 26 retained events, nulls only message references;
  later event cleanup preserves resolved review, owner decision, eval and sealed
  metrics: PASS. Storage counts and repeated daily aggregation: PASS.
- Existing focused Quality/API suites: 418/418 PASS (9 files).
- Full repo: 2327/2329; only the two pre-existing About copy assertions fail.
  Actual-handler 166/166 and feedback UI 6/6 included. No baseline test changed.
- Existing tests simulate provider/DB faults; real external LLM calls in A1: 0.
- Multi-session hosted concurrency/performance and current Free headroom:
  NOT VERIFIED; Production schema/private manual drift: NOT READ.
- Synthetic explicit name/address value retention: FAIL for a no-raw-PII gate.
  No real customer data or Production secret was used to discover it.
- Code, migrations, FAQ/MD, Booking, Facilities and About: unchanged.
- All four documented read-only SQL blocks executed successfully in the local
  fresh database; zero Production queries. Final tracked diff has no changes;
  the runbook is the only untracked file. Whitespace verification includes it.
- Typecheck/build were not requested for this documentation-only A1 and were not
  rerun; no code/build artifact modification was necessary.

Only `docs/AI_QUALITY_PRODUCTION_ACTIVATION.md` is the A1 deliverable.
No commit, push, deployment, Promote, Production migration or env change.
The runbook is a plan with an explicit hold, not approval to execute A2/B/C/D/E/F.

## Executed Schema Inventory

### Columns

Types/nullability below come from the fresh executed catalog, not a stub.
`?` means nullable; generated expiry values still derive from required timestamps.
Defaults and generation expressions are verified with the exact schema query above.

#### ai_quality_conversations

- `id`: `uuid` (NOT NULL).
- `conversation_key_hash`: `text` (NOT NULL).
- `started_at`: `timestamp with time zone` (NOT NULL).
- `last_activity_at`: `timestamp with time zone` (NOT NULL).
- `message_count`: `bigint` (NOT NULL).
- `quality_event_count`: `bigint` (NOT NULL).
- `has_negative_feedback`: `boolean` (NOT NULL).
- `has_escalation`: `boolean` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((last_activity_at AT TIME ZONE 'UTC'::text) + '30 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).
- `observer_turn_count`: `integer` (NOT NULL).

#### ai_quality_messages

- `id`: `uuid` (NOT NULL).
- `quality_conversation_id`: `uuid` (NOT NULL).
- `turn_index`: `integer` (NOT NULL).
- `role`: `text` (NOT NULL).
- `sanitized_text`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `response_kind`: `text` (nullable).
- `provider_used`: `boolean` (NOT NULL).
- `provider_call_count`: `integer` (NOT NULL).
- `scenario_changed`: `boolean` (NOT NULL).
- `pending_created`: `boolean` (NOT NULL).
- `pending_consumed`: `boolean` (NOT NULL).
- `generic_fallback`: `boolean` (NOT NULL).
- `clarification`: `boolean` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((created_at AT TIME ZONE 'UTC'::text) + '30 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `turn_key_hash`: `text` (nullable).
- `execution_metadata`: `jsonb` (NOT NULL).
- `feedback_window_at`: `timestamp with time zone` (nullable).
- `feedback_request_count`: `integer` (NOT NULL).

#### ai_quality_events

- `id`: `uuid` (NOT NULL).
- `quality_conversation_id`: `uuid` (NOT NULL).
- `quality_message_id`: `uuid` (nullable).
- `review_item_id`: `uuid` (nullable).
- `event_type`: `text` (NOT NULL).
- `severity`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `sanitized_context`: `jsonb` (NOT NULL).
- `metadata_json`: `jsonb` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((created_at AT TIME ZONE 'UTC'::text) + '90 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `resolved_at`: `timestamp with time zone` (nullable).
- `turn_key_hash`: `text` (nullable).
- `feedback_category`: `text` (nullable).
- `feedback_updated_at`: `timestamp with time zone` (nullable).
- `reviewed_at`: `timestamp with time zone` (nullable).

#### ai_review_items

- `id`: `uuid` (NOT NULL).
- `cluster_key`: `text` (nullable).
- `title`: `text` (NOT NULL).
- `sanitized_example`: `text` (NOT NULL).
- `sanitized_ai_answer`: `text` (nullable).
- `occurrence_count`: `bigint` (NOT NULL).
- `classification`: `text` (NOT NULL).
- `classification_confidence`: `numeric` (nullable).
- `status`: `text` (NOT NULL).
- `owner_action_required`: `boolean` (NOT NULL).
- `first_seen_at`: `timestamp with time zone` (NOT NULL).
- `last_seen_at`: `timestamp with time zone` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).
- `resolved_at`: `timestamp with time zone` (nullable).

#### ai_owner_decisions

- `id`: `uuid` (NOT NULL).
- `review_item_id`: `uuid` (NOT NULL).
- `action_type`: `text` (NOT NULL).
- `sanitized_owner_answer`: `text` (nullable).
- `created_at`: `timestamp with time zone` (NOT NULL).

#### ai_eval_cases

- `id`: `uuid` (NOT NULL).
- `source_review_item_id`: `uuid` (nullable).
- `eval_type`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `sanitized_input`: `text` (NOT NULL).
- `sanitized_context`: `jsonb` (NOT NULL).
- `expected_behavior`: `jsonb` (NOT NULL).
- `status`: `text` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).

#### ai_daily_metrics

- `metric_date`: `date` (NOT NULL).
- `conversation_count`: `bigint` (NOT NULL).
- `message_count`: `bigint` (NOT NULL).
- `positive_feedback_count`: `bigint` (NOT NULL).
- `negative_feedback_count`: `bigint` (NOT NULL).
- `generic_fallback_count`: `bigint` (NOT NULL).
- `clarification_count`: `bigint` (NOT NULL).
- `context_lost_signal_count`: `bigint` (NOT NULL).
- `wrong_mutation_signal_count`: `bigint` (NOT NULL).
- `provider_call_count`: `bigint` (NOT NULL).
- `provider_schema_reject_count`: `bigint` (NOT NULL).
- `provider_error_count`: `bigint` (NOT NULL).
- `review_item_count`: `bigint` (NOT NULL).
- `owner_required_count`: `bigint` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `finalized_at`: `timestamp with time zone` (nullable).

### Constraints

These 71 entries exclude PostgreSQL-18-specific NOT NULL catalog rows; required
columns are listed above. There are no custom enum types. Text enums remain CHECKs.

| Table | Constraint | Definition |
| --- | --- | --- |
| `ai_daily_metrics` | `ai_daily_metrics_clarification_count_check` | `CHECK ((clarification_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_context_lost_signal_count_check` | `CHECK ((context_lost_signal_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_conversation_count_check` | `CHECK ((conversation_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_generic_fallback_count_check` | `CHECK ((generic_fallback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_message_count_check` | `CHECK ((message_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_negative_feedback_count_check` | `CHECK ((negative_feedback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_owner_required_count_check` | `CHECK ((owner_required_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_pkey` | `PRIMARY KEY (metric_date)` |
| `ai_daily_metrics` | `ai_daily_metrics_positive_feedback_count_check` | `CHECK ((positive_feedback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_call_count_check` | `CHECK ((provider_call_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_error_count_check` | `CHECK ((provider_error_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_schema_reject_count_check` | `CHECK ((provider_schema_reject_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_review_item_count_check` | `CHECK ((review_item_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_wrong_mutation_signal_count_check` | `CHECK ((wrong_mutation_signal_count >= 0))` |
| `ai_eval_cases` | `ai_eval_cases_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_eval_cases` | `ai_eval_cases_eval_type_check` | `CHECK ((eval_type = ANY (ARRAY['semantic'::text, 'context'::text, 'knowledge'::text, 'tool'::text, 'privacy'::text, 'regression'::text])))` |
| `ai_eval_cases` | `ai_eval_cases_expected_behavior_check` | `CHECK (((jsonb_typeof(expected_behavior) = 'object'::text) AND (octet_length((expected_behavior)::text) <= 16000)))` |
| `ai_eval_cases` | `ai_eval_cases_pkey` | `PRIMARY KEY (id)` |
| `ai_eval_cases` | `ai_eval_cases_sanitized_context_check` | `CHECK (ai_quality_valid_context(sanitized_context))` |
| `ai_eval_cases` | `ai_eval_cases_sanitized_input_check` | `CHECK (((char_length(sanitized_input) >= 1) AND (char_length(sanitized_input) <= 8000)))` |
| `ai_eval_cases` | `ai_eval_cases_source_review_item_id_fkey` | `FOREIGN KEY (source_review_item_id) REFERENCES ai_review_items(id) ON DELETE SET NULL` |
| `ai_eval_cases` | `ai_eval_cases_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'retired'::text])))` |
| `ai_owner_decisions` | `ai_owner_decisions_action_type_check` | `CHECK ((action_type = ANY (ARRAY['reply_once'::text, 'create_knowledge_draft'::text, 'ai_should_know'::text, 'special_case'::text, 'ignore'::text])))` |
| `ai_owner_decisions` | `ai_owner_decisions_pkey` | `PRIMARY KEY (id)` |
| `ai_owner_decisions` | `ai_owner_decisions_review_item_id_fkey` | `FOREIGN KEY (review_item_id) REFERENCES ai_review_items(id) ON DELETE RESTRICT` |
| `ai_owner_decisions` | `ai_owner_decisions_sanitized_owner_answer_check` | `CHECK ((char_length(sanitized_owner_answer) <= 8000))` |
| `ai_quality_conversations` | `ai_quality_conversations_check` | `CHECK ((last_activity_at >= started_at))` |
| `ai_quality_conversations` | `ai_quality_conversations_conversation_key_hash_check` | `CHECK ((conversation_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_conversations` | `ai_quality_conversations_conversation_key_hash_key` | `UNIQUE (conversation_key_hash)` |
| `ai_quality_conversations` | `ai_quality_conversations_message_count_check` | `CHECK ((message_count >= 0))` |
| `ai_quality_conversations` | `ai_quality_conversations_observer_turn_count_check` | `CHECK ((observer_turn_count >= 0))` |
| `ai_quality_conversations` | `ai_quality_conversations_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_conversations` | `ai_quality_conversations_quality_event_count_check` | `CHECK ((quality_event_count >= 0))` |
| `ai_quality_events` | `ai_quality_events_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_quality_events` | `ai_quality_events_check` | `CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))` |
| `ai_quality_events` | `ai_quality_events_event_type_check` | `CHECK ((event_type = ANY (ARRAY['positive_feedback'::text, 'negative_feedback'::text, 'generic_fallback'::text, 'possible_misunderstanding'::text, 'repeated_question'::text, 'unnecessary_clarification'::text, 'context_lost_signal'::text, 'wrong_mutation_signal'::text, 'provider_schema_reject'::text, 'provider_error'::text, 'manual_escalation'::text, 'owner_correction'::text, 'knowledge_gap_candidate'::text, 'tool_gap_candidate'::text])))` |
| `ai_quality_events` | `ai_quality_events_feedback_category_check` | `CHECK ((feedback_category = ANY (ARRAY['incorrect_answer'::text, 'misunderstood_question'::text, 'repeated_question'::text, 'too_verbose'::text, 'other'::text])))` |
| `ai_quality_events` | `ai_quality_events_message_conversation_fkey` | `FOREIGN KEY (quality_message_id, quality_conversation_id) REFERENCES ai_quality_messages(id, quality_conversation_id) ON DELETE SET NULL (quality_message_id)` |
| `ai_quality_events` | `ai_quality_events_metadata_json_check` | `CHECK (ai_quality_valid_metadata(metadata_json))` |
| `ai_quality_events` | `ai_quality_events_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_events` | `ai_quality_events_quality_conversation_id_fkey` | `FOREIGN KEY (quality_conversation_id) REFERENCES ai_quality_conversations(id) ON DELETE RESTRICT` |
| `ai_quality_events` | `ai_quality_events_review_item_id_fkey` | `FOREIGN KEY (review_item_id) REFERENCES ai_review_items(id) ON DELETE SET NULL` |
| `ai_quality_events` | `ai_quality_events_sanitized_context_check` | `CHECK (ai_quality_valid_context(sanitized_context))` |
| `ai_quality_events` | `ai_quality_events_severity_check` | `CHECK ((severity = ANY (ARRAY['info'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text])))` |
| `ai_quality_events` | `ai_quality_events_turn_key_hash_check` | `CHECK ((turn_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_messages` | `ai_quality_messages_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_quality_messages` | `ai_quality_messages_execution_metadata_check` | `CHECK (ai_quality_valid_metadata(execution_metadata))` |
| `ai_quality_messages` | `ai_quality_messages_feedback_request_count_check` | `CHECK ((feedback_request_count >= 0))` |
| `ai_quality_messages` | `ai_quality_messages_id_conversation_key` | `UNIQUE (id, quality_conversation_id)` |
| `ai_quality_messages` | `ai_quality_messages_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_messages` | `ai_quality_messages_provider_call_count_check` | `CHECK (((provider_call_count >= 0) AND (provider_call_count <= 32)))` |
| `ai_quality_messages` | `ai_quality_messages_provider_check` | `CHECK ((provider_used = (provider_call_count > 0)))` |
| `ai_quality_messages` | `ai_quality_messages_quality_conversation_id_fkey` | `FOREIGN KEY (quality_conversation_id) REFERENCES ai_quality_conversations(id) ON DELETE RESTRICT` |
| `ai_quality_messages` | `ai_quality_messages_response_kind_check` | `CHECK (ai_quality_valid_response_kind(response_kind))` |
| `ai_quality_messages` | `ai_quality_messages_role_check` | `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))` |
| `ai_quality_messages` | `ai_quality_messages_sanitized_text_check` | `CHECK ((char_length(sanitized_text) <= 8000))` |
| `ai_quality_messages` | `ai_quality_messages_turn_index_check` | `CHECK ((turn_index > 0))` |
| `ai_quality_messages` | `ai_quality_messages_turn_key_hash_check` | `CHECK ((turn_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_messages` | `ai_quality_messages_turn_role_key` | `UNIQUE (quality_conversation_id, turn_index, role)` |
| `ai_quality_messages` | `ai_quality_messages_user_provider_check` | `CHECK (((role = 'assistant'::text) OR (provider_call_count = 0)))` |
| `ai_review_items` | `ai_review_items_check` | `CHECK ((last_seen_at >= first_seen_at))` |
| `ai_review_items` | `ai_review_items_check1` | `CHECK (((resolved_at IS NULL) OR (resolved_at >= first_seen_at)))` |
| `ai_review_items` | `ai_review_items_classification_check` | `CHECK ((classification = ANY (ARRAY['semantic_gap'::text, 'context_gap'::text, 'knowledge_gap'::text, 'tool_gap'::text, 'special_case'::text, 'unknown'::text])))` |
| `ai_review_items` | `ai_review_items_classification_confidence_check` | `CHECK (((classification_confidence >= (0)::numeric) AND (classification_confidence <= (1)::numeric)))` |
| `ai_review_items` | `ai_review_items_cluster_key_check` | `CHECK (((cluster_key IS NULL) OR (cluster_key ~ '^[0-9a-f]{64}$'::text)))` |
| `ai_review_items` | `ai_review_items_occurrence_count_check` | `CHECK ((occurrence_count > 0))` |
| `ai_review_items` | `ai_review_items_pkey` | `PRIMARY KEY (id)` |
| `ai_review_items` | `ai_review_items_sanitized_ai_answer_check` | `CHECK ((char_length(sanitized_ai_answer) <= 8000))` |
| `ai_review_items` | `ai_review_items_sanitized_example_check` | `CHECK (((char_length(sanitized_example) >= 1) AND (char_length(sanitized_example) <= 8000)))` |
| `ai_review_items` | `ai_review_items_status_check` | `CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'needs_owner'::text, 'auto_improvement_candidate'::text, 'resolved'::text, 'ignored'::text])))` |
| `ai_review_items` | `ai_review_items_title_check` | `CHECK (((char_length(title) >= 1) AND (char_length(title) <= 240)))` |

### Indexes

All 34 indexes are B-tree. Future-only indexes are reported, not removed.
PK/UNIQUE and FK-support indexes are not judged solely by user-facing SELECT usage.

| Index | Definition | Current use / overhead |
| --- | --- | --- |
| `ai_daily_metrics_pkey` | `CREATE UNIQUE INDEX ai_daily_metrics_pkey ON public.ai_daily_metrics USING btree (metric_date)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_eval_cases_pkey` | `CREATE UNIQUE INDEX ai_eval_cases_pkey ON public.ai_eval_cases USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_eval_cases_review_idx` | `CREATE INDEX ai_eval_cases_review_idx ON public.ai_eval_cases USING btree (source_review_item_id)` | Review FK SET NULL and future linked eval lookup. |
| `ai_owner_decisions_pkey` | `CREATE UNIQUE INDEX ai_owner_decisions_pkey ON public.ai_owner_decisions USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_owner_decisions_review_created_idx` | `CREATE INDEX ai_owner_decisions_review_created_idx ON public.ai_owner_decisions USING btree (review_item_id, created_at)` | Review FK and future ordered owner decision history. |
| `ai_quality_conversations_activity_idx` | `CREATE INDEX ai_quality_conversations_activity_idx ON public.ai_quality_conversations USING btree (last_activity_at DESC)` | Admin overview recent conversations, bounded sample. |
| `ai_quality_conversations_conversation_key_hash_key` | `CREATE UNIQUE INDEX ai_quality_conversations_conversation_key_hash_key ON public.ai_quality_conversations USING btree (conversation_key_hash)` | Required unique HMAC lookup/upsert and feedback lookup. |
| `ai_quality_conversations_pkey` | `CREATE UNIQUE INDEX ai_quality_conversations_pkey ON public.ai_quality_conversations USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_conversations_retention_idx` | `CREATE INDEX ai_quality_conversations_retention_idx ON public.ai_quality_conversations USING btree (retention_expires_at, id)` | Cleanup/health expiry selection. |
| `ai_quality_conversations_started_idx` | `CREATE INDEX ai_quality_conversations_started_idx ON public.ai_quality_conversations USING btree (started_at)` | Daily conversation aggregation by started_at. |
| `ai_quality_active_feedback_idx` | `CREATE UNIQUE INDEX ai_quality_active_feedback_idx ON public.ai_quality_events USING btree (quality_conversation_id, turn_key_hash) WHERE (event_type = ANY (ARRAY['positive_feedback'::text, 'negative_feedback'::text]))` | Required one current feedback polarity per non-null hashed turn. |
| `ai_quality_events_conversation_idx` | `CREATE INDEX ai_quality_events_conversation_idx ON public.ai_quality_events USING btree (quality_conversation_id, created_at DESC)` | Conversation existence/FK/recent-event lookup; overlapping left prefix with idempotency index, but adds created_at order. |
| `ai_quality_events_created_idx` | `CREATE INDEX ai_quality_events_created_idx ON public.ai_quality_events USING btree (created_at)` | Daily aggregation date range; overlaps page index's created_at prefix. Measure redundancy before any later removal. |
| `ai_quality_events_idempotency_idx` | `CREATE UNIQUE INDEX ai_quality_events_idempotency_idx ON public.ai_quality_events USING btree (quality_conversation_id, turn_key_hash, event_type)` | Required unique observer event type per hashed turn and idempotency lookup. |
| `ai_quality_events_message_idx` | `CREATE INDEX ai_quality_events_message_idx ON public.ai_quality_events USING btree (quality_message_id, quality_conversation_id)` | FK action when message expires; same-conversation message reference. |
| `ai_quality_events_page_idx` | `CREATE INDEX ai_quality_events_page_idx ON public.ai_quality_events USING btree (created_at DESC, id DESC)` | Current Admin descending created_at/id keyset page and overview sample. |
| `ai_quality_events_pkey` | `CREATE UNIQUE INDEX ai_quality_events_pkey ON public.ai_quality_events USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_events_retention_idx` | `CREATE INDEX ai_quality_events_retention_idx ON public.ai_quality_events USING btree (retention_expires_at, id)` | 90-day cleanup and due-count range. |
| `ai_quality_events_review_idx` | `CREATE INDEX ai_quality_events_review_idx ON public.ai_quality_events USING btree (review_item_id)` | Review FK and review-linked evidence. No current Admin review-item UI query; retain FK-support distinction. |
| `ai_quality_events_type_created_idx` | `CREATE INDEX ai_quality_events_type_created_idx ON public.ai_quality_events USING btree (event_type, created_at DESC)` | Type-filtered Admin timeline/negative state; query planner may prefer page index for keyset ordering. |
| `ai_quality_events_unresolved_idx` | `CREATE INDEX ai_quality_events_unresolved_idx ON public.ai_quality_events USING btree (created_at DESC) WHERE (resolved_at IS NULL)` | FUTURE-ONLY overhead: current Admin pending filter uses reviewed_at, not resolved_at. No production query path using this partial predicate found. |
| `ai_quality_messages_created_idx` | `CREATE INDEX ai_quality_messages_created_idx ON public.ai_quality_messages USING btree (created_at)` | Daily message aggregation / oldest-message metric. |
| `ai_quality_messages_id_conversation_key` | `CREATE UNIQUE INDEX ai_quality_messages_id_conversation_key ON public.ai_quality_messages USING btree (id, quality_conversation_id)` | Composite FK target; enforces event message belongs to the same conversation (not redundant despite UUID PK). |
| `ai_quality_messages_idempotency_idx` | `CREATE UNIQUE INDEX ai_quality_messages_idempotency_idx ON public.ai_quality_messages USING btree (quality_conversation_id, turn_key_hash, role)` | Required runtime same-turn/role retry uniqueness and lookup. |
| `ai_quality_messages_pkey` | `CREATE UNIQUE INDEX ai_quality_messages_pkey ON public.ai_quality_messages USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_messages_retention_idx` | `CREATE INDEX ai_quality_messages_retention_idx ON public.ai_quality_messages USING btree (retention_expires_at, id)` | Cleanup and due-count expiry range. |
| `ai_quality_messages_turn_role_key` | `CREATE UNIQUE INDEX ai_quality_messages_turn_role_key ON public.ai_quality_messages USING btree (quality_conversation_id, turn_index, role)` | Required unique turn/role; ordered nearby-turn context and conversation existence probe. |
| `ai_review_items_classification_seen_idx` | `CREATE INDEX ai_review_items_classification_seen_idx ON public.ai_review_items USING btree (classification, last_seen_at DESC)` | FUTURE-ONLY classification triage; no current live query path. |
| `ai_review_items_cluster_idx` | `CREATE UNIQUE INDEX ai_review_items_cluster_idx ON public.ai_review_items USING btree (cluster_key) WHERE (cluster_key IS NOT NULL)` | Cluster uniqueness integrity; no current producer/cluster lookup path in Phase 1C. |
| `ai_review_items_first_seen_idx` | `CREATE INDEX ai_review_items_first_seen_idx ON public.ai_review_items USING btree (first_seen_at)` | Daily metrics review/owner-required aggregation. |
| `ai_review_items_last_seen_idx` | `CREATE INDEX ai_review_items_last_seen_idx ON public.ai_review_items USING btree (last_seen_at DESC)` | FUTURE-ONLY review-item recency; no current live query path. |
| `ai_review_items_owner_seen_idx` | `CREATE INDEX ai_review_items_owner_seen_idx ON public.ai_review_items USING btree (last_seen_at DESC) WHERE (owner_action_required AND (status <> ALL (ARRAY['resolved'::text, 'ignored'::text])))` | FUTURE-ONLY owner queue; no current live query path. |
| `ai_review_items_pkey` | `CREATE UNIQUE INDEX ai_review_items_pkey ON public.ai_review_items USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_review_items_status_seen_idx` | `CREATE INDEX ai_review_items_status_seen_idx ON public.ai_review_items USING btree (status, last_seen_at DESC)` | FUTURE-ONLY review-item triage; current UI pages events, not review items. |

### Functions And Triggers

All functions have fixed `search_path=public, pg_temp`; PUBLIC/anon/authenticated
EXECUTE revoked; service_role EXECUTE granted. Nine are SECURITY DEFINER.

| Function signature | Definer | Purpose |
| --- | --- | --- |
| `aggregate_ai_daily_metrics(p_metric_date date)` | YES | Privileged day aggregation/upsert and sealed-snapshot return; advisory lock. |
| `ai_quality_valid_capability_id(p_value text)` | NO | Immutable capability allowlist; invoker. |
| `ai_quality_valid_context(p_value jsonb)` | NO | Immutable context/slot/size allowlist; invoker. |
| `ai_quality_valid_metadata(p_value jsonb)` | NO | Immutable enum/size/shape allowlist; B intentionally replaces A; invoker. |
| `ai_quality_valid_response_kind(p_value text)` | NO | Immutable response-kind allowlist; invoker. |
| `delete_expired_ai_quality_data(p_batch_size integer)` | YES | Privileged bounded maintenance deletion and metric finalization. |
| `get_ai_quality_storage_metrics()` | YES | Privileged stable exact-count/expiry metrics; can be expensive. |
| `list_ai_quality_events(p_days integer, p_type text, p_severity text, p_reviewed text, p_before_at timestamp with time zone, p_before_id uuid)` | YES | Privileged stable bounded event page; statement 3s. |
| `read_ai_quality_detail(p_event uuid)` | YES | Privileged stable retained evidence window; statement 3s. |
| `read_ai_quality_overview(p_days integer)` | YES | Privileged stable bounded current overview; statement 3s. |
| `record_ai_quality_turn(p_turn jsonb)` | YES | Privileged atomic pair/events/counters; lock_timeout 2s. |
| `review_ai_quality_event(p_event uuid)` | YES | Privileged idempotent reviewed_at mutation; lock 2s / statement 3s. |
| `set_ai_quality_updated_at()` | NO | BEFORE UPDATE trigger on conversations/reviews/evals; invoker. |
| `submit_ai_quality_feedback(p_conversation text, p_turn text, p_polarity text, p_category text)` | YES | Privileged active feedback/rate-window mutation; lock 2s / statement 3s. |

Trigger name `set_ai_quality_updated_at` is scoped to each of
`ai_quality_conversations`, `ai_review_items`, `ai_eval_cases` (three triggers).
No trigger on core Booking or chat tables; zero Quality RLS policies.
