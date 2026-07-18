# Codex Handoff

## Current Status

- Branch: `main`
- Local HEAD before this fix: `0eae49dc65c16370b407f37f19040dea590c6a10`
- GitHub `main` was verified by read-only REST lookup at the same hash.
- Worktree was clean before the storage/session fix work began.
- Production domain: `www.mumbao.tw`
- Production deployment inspected read-only: `mumbao-universe-fw6veb93k-ianshihs-projects.vercel.app`
- Deployment status: Ready
- Deployment created: 2026-07-18 15:22 Asia/Taipei

## Completed Before This Round

- DeepSeek model is `deepseek-v4-flash`.
- DeepSeek request payload includes `thinking: { type: "disabled" }`.
- DeepSeek empty final content is classified as `provider_empty_content`.
- Assistant insert failures are classified separately as `assistant_insert_failed`.
- `guesthouse-rules.md` / knowledge files are included in the Vercel function bundle through `client/vercel.json`.
- Production smoke for a fresh visitor/session passed:
  - `可以帶狗嗎？` returned HTTP 200.
  - `provider_used=deepseek`.
  - `providerStatus=200`.
  - `finishReason=stop`.
  - FAQ hit `faq-227`.
  - User and assistant messages were saved.
  - History returned user plus assistant immediately and after 10 seconds.

## Root Cause Found

Normal browser profiles can retain stale `localStorage["mumbao-chat-session-id"]`.

When that stored session is malformed, deleted, or owned by another visitor/customer, the frontend keeps sending it as `session_id`. Incognito works because it starts without that stale storage.

Production observations:

- Fresh visitor/session: HTTP 200, DeepSeek used, assistant saved.
- Valid UUID but mismatched session: HTTP 403.
- Malformed non-UUID session: previously became HTTP 500 through Supabase UUID parsing.

## Files Changed In This Round

- `client/src/components/ai/MumbaoChat.tsx`
- `client/src/components/ai/MumbaoChat.test.ts`
- `client/server/aiChat/message.js`
- `client/server/aiChat/history.js`
- `client/server/aiChat/sessionValidation.js`
- `client/server/aiChat/sessionValidation.test.js`
- `docs/CODEX_HANDOFF.md`

## Fix Scope

- Added chat storage version key: `mumbao-chat-storage-version = 2`.
- Added visitor UUID validation and migration:
  - Preserve valid `mumbao-chat-visitor-id`.
  - Migrate valid legacy `mumbao_visitor_id`.
  - Migrate valid `mumbao_chat_visitor_id` cookie.
  - Replace malformed visitor IDs with a new UUID.
- Added strict active session parsing:
  - JSON shape: `{ visitor_id, session_id }`.
  - Legacy raw UUID is migrated to JSON.
  - Malformed raw strings are cleared.
  - Visitor mismatch clears active session and chat cache.
- Added frontend typed API error handling:
  - `httpStatus`
  - `errorCode`
  - `failureStage`
  - `reason`
  - `requestId`
  - `retryAfter`
- Added one-time auto recovery for session errors during send:
  - Clear active session and chat cache.
  - Keep current visitor ID.
  - Retry the same user question once without `session_id`.
- Added history/polling recovery for invalid sessions.
- Added backend pre-validation for malformed `session_id`.

## Must Not Change

- Do not change DeepSeek model, payload, API key, or env.
- Do not remove `thinking.type = "disabled"`.
- Do not change FAQ retrieval.
- Do not change rate-limit rules.
- Do not change DB schema or add migrations.
- Do not call LINE APIs during verification unless explicitly testing LIFF with user approval.
- Do not delete cloud `chat_sessions` or `chat_messages`.
- Do not clear Supabase member auth, cart, admin, checkout, or shop storage.
- Do not deploy without confirmation.

## Pending Verification

- Run `npm run check`.
- Run `npm run build`.
- Run `git diff --check`.
- Run Vitest for chat/session tests.
- Verify fresh visitor/session still answers `可以帶狗嗎？`.
- Verify stale valid UUID session recovers and resends once.
- Verify malformed non-UUID session clears locally and does not call the API with that value.
- Verify 429 and provider errors do not rebuild session.
- Verify member auth, cart, admin session, checkout storage, and LIFF entry are unaffected.
