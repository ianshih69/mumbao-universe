# Phase 1B: Runtime Quality Observer

Local development gate: PASS, with the two explicitly accepted About baseline failures.
No commit, push, deployment, Promote, Production migration or Production env change.

## 1. Preflight

- Repository: E:\mumbao\newCode\mumbao-universe
- Branch: main.
- Starting/current HEAD: e4650054bb7b4017061426ef3db1d97d9bdbd486.
- Starting working tree: clean; ancestor check for the Phase 1A checkpoint passed.
- The changes listed below were made in this Phase 1B task.

## 2. Actual runtime audit

Browser MumbaoChat sends a UUID client_message_id to /api/ai-chat?action=message.
client/api/ai-chat.js dispatches to client/server/aiChat/message.js.
The handler validates the session and deduplicates incoming IDs, resolves the existing
conversation authority, executes the Unified Dialogue Goal Planner / transaction route,
enforces modelExecutionContext, persists the existing chat, and sends the final response.

The observer projects a snapshot immediately before each of the three completed-answer
responses. Its persistence is invoked in finally, after res.end and lock release.
History, human takeover without an assistant answer, rejected requests, deduplicated
reply replay, and incomplete/error turns do not create a new quality message pair.
No browser hook, API route, response wording or decision branch was added.

## 3. Existing authorities reused

- conversationContextUpdate.previousContext and finalConversationContext.
- quote_scenario.scenario_id / context_version; existing normalized booking values.
- Existing pending_interaction, isPendingInteractionCurrent, pending status/events.
- plan.resolved_intent_ast (preferred over the pre-provider AST), scenario_action.
- plan.semantic_capabilities and dialogue_goal_plan.primary_goal_id.
- Final response metadata, route knowledgeGap / answerMode, final_missing_fields.
- executionContext.model_call_count / model_call_purposes; structured provider metadata.

No second intent parser, classifier, scenario reducer, pending engine or answer generator.
Capabilities are copied from already-selected metadata and matched plan goal IDs.
When no existing capability ID is available it remains null; a goal is not fabricated.

## 4. Feature flag

AI_QUALITY_OBSERVER_ENABLED is evaluated server-side at request runtime.
Only the exact string "true" enables it; all other strings and unset are OFF.
OFF does not project inputs, read the HMAC secret, schedule work or access Quality DB.
Production remains unconfigured by this task and must not be enabled yet.

## 5. Observer authority

captureAiQualityTurn -> buildAiQualityTurnSnapshot -> observeAiQualityTurn
-> prepareAiQualityTurn -> deriveAiQualitySignals -> persistAiQualityTurn
-> one record_ai_quality_turn RPC.

The only existing runtime file changed is message.js, with passive completed-turn hooks.
No quality consumer can change the response, pending, scenario or model-call budget.

## 6. Typed, server-only snapshot

AiQualityTurnObservationInput is an explicit JSDoc contract. It contains ephemeral source
IDs/text, allowlisted execution metadata/context, diagnostic booleans, and slot-name sets.
The builder explicitly projects fields; it never serializes a runtime/context object.
Raw input text and IDs are not passed to the persistence transport.

## 7. Scenario change detection

Compare existing scenario identity/version and a fixed-order SHA256 fingerprint of
normalized booking fields: stay, dates, duration, party, child ages, pet weights/tiers,
breakfast and rooms. The fingerprint is process-local and never persisted.
This detects a field mutation even if an injected bug fails to advance the version.
Timestamps, discourse anchors, provenance, dialogue events and pending are excluded.
DB metadata contains only scenario_changed and safe before/after versions.

## 8-16. Deterministic signals

| Item | Rule |
| --- | --- |
| 8. Engine | Pure invariant checks; no text inspection or model calls. |
| 9. generic_fallback | Explicit knowledgeGap / knowledge_gap route or response kind. |
| 10. provider_schema_reject | Existing structured candidate/schema/provenance rejection codes or semantic validator rejection. |
| 11. provider_error | Safe enums: timeout, network, rate_limit, http_error, invalid_response, unknown. No raw errors. |
| 12. wrong_mutation_signal | Read-only authority plus changed booking fingerprint/identity/version; severity high. |
| 13. context_lost_signal | Explicit continuation loses scenario identity or regresses version, or existing stale-reference invariant. |
| 14. unnecessary_clarification | Final requested/missing slot is route-required and validly known before the turn. New mutation values and pending replacement values are excluded. |
| 15. Pending integrity | Current, nonexpired pending disappears on an explicitly neutral/read-only status, without completion, cancellation, expiry, stale replacement or reset. |
| 16. repeated_question | OFF. No sufficiently reliable cross-turn same-capability/slot/distance authority; no fuzzy approximation. |

New/reset/replacement/cancel/expired transitions are excluded from continuity alarms.
Call count >1 emits possible_misunderstanding/provider_budget_exceeded.
The engine emits at most one event of each type per turn; different types can coexist.

## 17. Sanitized messages

Both sides use the committed Phase 1A sanitizer before constructing the RPC payload.
The RPC inserts one user/assistant pair with the same explicit turn_index. Assistant
execution metadata is stored even when the turn has no quality events.
User provider count is always zero, so reporting does not double-count provider usage.
There is no raw INSERT followed by a sanitizing UPDATE.

## 18. HMAC

Reuse hashAiQualityConversationKey and the dedicated AI_QUALITY_HMAC_SECRET.
Conversation and domain-scoped composite conversation/turn source IDs become HMACs.
Missing/invalid HMAC configuration skips observation with a safe warning.
There is no raw-ID, fixed-secret or plain SHA256 fallback for identity.

## 19. Idempotency

Use the existing incoming client message ID; use the persisted user message ID only
when an older caller supplies no incoming ID. Message text is never the unique key.
RPC retry with the same HMAC is a no-op. Legitimately repeated text with different IDs
creates separate turns. Existing client replay returns its prior answer without a hook.
An observation lost to a DB outage is not replayed from historical chat on a later retry.
Callers without stable incoming IDs inherit the existing handler's replay limitations.

Idempotency is retention-bounded: messages retain the key for 30 days, and event-bearing
turns retain it with their events for 90 days. No permanent transcript/key ledger is added.

## 20. Atomic persistence

New migration: client/supabase/migrations/2026-09-09-ai-quality-runtime-observer.sql.
It extends safe metadata, adds turn HMAC uniqueness and an atomic turn counter, and
defines a service-role-only SECURITY DEFINER RPC with a fixed search_path.
The RPC validates bounded allowlisted payloads, upserts/locks one conversation row,
checks idempotency, inserts the pair/events, and increments counts in one transaction.
Counter allocation remains monotonic after message retention deletes rows.
The migration initializes the counter from existing rows once; runtime does not COUNT.
SQL uniqueness and row locking cover concurrent retries/turns. In-memory tests exercise
transactional behavior and constraints; live multi-connection Supabase load is not claimed.

## 21-22. Failure isolation / missing HMAC

Tested: missing table/RPC, DB throw, ignored-abort timeout, sanitizer throw, missing HMAC,
permission error and duplicate conflict. All leave the actual customer answer, HTTP status,
scenario, pending, quote and provider count identical to OFF.
Only an allowlisted category is logged. No error object, text, ID or metadata blob is logged.
HMAC/sanitizer preparation failures issue category=preparation and never call the DB.

## 23. Lifetime and performance

Use @vercel/functions 3.9.6 waitUntil for the Vercel request lifetime; no blind detached
promise. In local execution the handler awaits the already-bounded work after res.end.
Transport has one RPC, a 3,000ms AbortController plus Promise.race deadline, and no retry.
The SQL RPC has a 2s lock timeout; its payload and event count are bounded.
No per-turn aggregation, review builder, scheduler, backfill or analyzer.

Official lifecycle reference:
[Vercel Functions package / waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).

Local synthetic actual-handler benchmark, 12 warmed samples per mode; means in ms:

| Mode | Customer response | Handler/sidecar completion |
| --- | ---: | ---: |
| OFF | 12.339 | 12.351 |
| ON, healthy mocked DB | 10.927 | 11.235 |
| ON, failing mocked DB | 10.590 | 10.823 |

These are local comparative measurements, not Production latency claims or speedups.
The ignored-abort test verifies that persistence terminates after 3s and cannot hang
indefinitely. Response is already sent; the Vercel lifetime test confirms work registration.

## 24-26. Behavioral equivalence and provider budget

Actual-handler OFF/ON comparisons cover normal parking FAQ, nights continuation,
large-dog read-only policy, the existing 20 owner semantic/reference/pending cases,
and provider timeout/schema rejection. All pass.
Injected read-only mutation is detected; ordinary policy cases have zero false events.
Known-slot redundant clarification is detected; expected mutation-value requests are not.
Provider calls still use the existing counter/budget, at most one per tested turn.
Observer model calls = 0. Real DeepSeek calls during this task = 0; all providers mocked.
No provider-only benchmark or API key was needed.

## 27-28. Migration and env boundaries

Phase 1A migration 2026-09-09-ai-quality-foundation.sql is unchanged.
Only local, in-memory PGlite applied the two migrations; the new migration was applied
twice to verify repeatability. No Supabase project/Production connection was used.
.env.example adds the disabled flag and an empty HMAC placeholder, with a Production warning.
No actual env file or Project env was edited.

## 29-30. Privacy, signals and safety verification

- Existing privacy tests: 157/157; metadata tests: 56/56.
- Observer/privacy/invariant/lifetime tests: 42/42.
- Observer migration tests: 20/20; original foundation migration tests: 61/61.
- Source boundary/security tests: 3/3.
- PII fixtures redact phone/email/identifiers/tokens before transport and both-side text.
- Raw source IDs, provider output and private diagnostic objects reaching Quality payloads: 0 in tested fixtures.
- Quality warnings contain only constant text and safe categories.
- New transport uses the existing service-role credential only in request auth headers,
  never in payloads, artifacts or logs. Source contains header/env names, no real values.
- No browser quality import, model client, file writer, daily aggregation or review insertion.

Privacy scope is the existing deterministic Phase 1A redaction contract, not a claim
that arbitrary unlabeled names or every possible free-text identifier can be recognized.
Preserve this limitation in any later live-data rollout review; do not enable Production
as a side effect of passing this local gate.

## 31-36. Verification results

- Actual-handler suite: 160/160 PASS (35 new Phase 1B cases).
- Semantic orchestrator/architecture, routing, reference/holdout, pending, transition and
  model budget suites: PASS in full repo run.
- FAQ regression: 98/98 PASS.
- Booking pricing: 34/34 PASS; quote, payment, management, cancellation and Admin tests PASS.
- Full repo: 2236/2238 PASS; 98 new tests pass, no new regression.
- The only two failures remain in client/src/data/aboutContent.test.ts:
  line 9 complete-text equality and line 14 the paragraph-A closing quotation mark.
  Neither the About source nor these tests was changed.
- npm.cmd run check -- --incremental false: PASS.
- npm.cmd run build: PASS. Initial sandbox EPERM copying dist/public/.gitkeep was
  resolved by rerunning the identical local command with filesystem permission.
- git diff --check: PASS. Git CRLF conversion notices and the existing Vite large-chunk
  warning are informational, not new test failures.

## 37. Changed files (15)

- .env.example
- package.json
- package-lock.json
- client/server/aiChat/message.js
- client/server/aiQuality/metadata.js
- client/server/aiQuality/foundationBoundary.test.js
- client/server/aiQuality/snapshot.js
- client/server/aiQuality/signals.js
- client/server/aiQuality/persistence.js
- client/server/aiQuality/observer.js
- client/server/aiQuality/observer.test.js
- client/server/aiQuality/observerMigration.test.js
- client/tests/api/ai-chat-structured.test.js
- client/supabase/migrations/2026-09-09-ai-quality-runtime-observer.sql
- docs/AI_QUALITY_PHASE_1B.md

Dependency changes are for official Vercel background lifecycle support only. The
incidental unrelated npm lockfile package update was removed.
No FAQ/MD, booking, About, Facilities, Admin UI or pricing file changed.

## 38-41. Final verdict

- Production DB modified: NO.
- Production env modified: NO.
- Production migration executed: NO.
- PHASE 1B LOCAL GATE: PASS, accepting only the two explicitly grandfathered About failures.
- Recommend Phase 1C development: YES, after owner approval; it has not been started.
- Production enablement: NOT approved by this gate. Requires separate migration/env and
  live lifecycle/privacy verification approval.
- Commit / push / deploy / Promote: NO.
