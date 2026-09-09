# PHASE 1C - Customer Feedback & AI Improvement Center

## 結論

PHASE 1C 本機開發 Gate：PASS。
採用使用者已接受的兩個 About baseline failures，並非宣稱全庫零失敗。
未 stage、commit、push、deploy、Promote；未執行 Production migration 或修改 Production DB/env。
本報告不構成 Production 啟用核准。瀏覽器驗證全部使用 synthetic fixtures。

## 47 項完成報告

1. **Preflight**：main，起始 working tree clean，HEAD 為
   08002542eaf1a655e79bf5970127ad3af6aff212，checkpoint ancestor 檢查 PASS。
2. **Chat UI audit**：MumbaoChat.tsx 負責完整訊息與獨立 loading bubble；
   使用完整 JSON 回覆而非串流片段。只在帶 server token 的正常 assistant final answer 顯示控制。
   user、human、system、welcome、optimistic/loading、過長輸入提示及 API error bubble 均不發 token。
3. **Admin audit**：沿用 AdminLayout、navigation、wouter、requirePermission、
   現有 auth-expiry handling、lucide 與 Radix Dialog，不新增 auth architecture。
4. **Flags**：AI_QUALITY_FEEDBACK_ENABLED / AI_QUALITY_ADMIN_ENABLED，
   只有 literal true 啟用；undefined、false、active、1、yes、TRUE 皆 OFF。
   .env.example 僅新增 false 預設說明，未改實際環境檔。
5. **Feedback token**：隨 aiMessage.feedback_token 返回，只含 version、
   conversation HMAC、turn HMAC、iat、exp。無 raw conversation/message ID 或個資。
6. **Signing / expiry**：HMAC-SHA256，從既有 AI_QUALITY_HMAC_SECRET 以
   ai-quality-feedback-v1\0signing-key 獨立 domain 衍生 signing key。
   timing-safe 比對、canonical encoding、version/fields/time 嚴格驗證，有效七天。
   缺少或過弱 secret 時不發 token，沒有弱 secret fallback。
7. **Feedback API**：POST /api/ai-quality-feedback，僅接受 token、polarity、
   negative category；2 KiB body 上限。驗簽後依 authoritative hashes 呼叫一個 atomic RPC。
   Browser 不寫 Supabase，沒有每則訊息新增 read API。
8. **Schema / migration**：只新增 2026-09-10-ai-quality-feedback-admin.sql。
   messages 增加 rate-window counters；events 增加 category、feedback_updated_at、reviewed_at；
   增加 active-feedback unique index 與受保護 RPC。
   註冊 ai_quality.view / ai_quality.review，不自動授權 ordinary roles。
   前置需求為既有 Admin permission schema 與 Phase 1A/1B migrations。
9. **Positive**：同 observed assistant turn 一個 positive_feedback，重複按不增加 active count。
10. **Negative**：incorrect_answer、misunderstood_question、repeated_question、
    too_verbose、other 五種 enum；不收自由文字。
11. **Switching**：正負與 category 更新同一筆 current-state event，只保留最新值；
    內容改變時清除 reviewed state。
12. **Duplicate protection**：conversation + turn 的 partial unique index；
    沿用 observer 的 conversation → message lock 順序。相同 vote 保留 reviewed state，
    quality_event_count 只在首次建立時增加。
13. **Rate limit**：沿用 server window/count 概念，以 Quality RPC 原子實作，
    不沿用 chat usage 的非原子讀寫。每個已簽章 turn 每分鐘 12 次，包含相同重送。
    Counter 跟著 message retention 移除；一般改票一兩次不受阻。
14. **Tamper**：改一 byte、invalid signature、expired/random/version/future token、
    unknown turn、非法 enum、oversized body 均拒絕。未知 turn 與無效 token 使用同一 generic response。
15. **PII safety**：不接受 transcript text；只讀既有 sanitized records。
    Admin API 再次 sanitize 並 allowlist projection，不回 raw IDs/hashes、prompt、model output 或 headers。
    Synthetic phone/email 在儲存與 Admin evidence 中只有 [PHONE] / [EMAIL]。
    這不是宣稱 regex 可辨識所有未標記姓名或地址；既有 Phase 1A sanitizer 限制仍須納入啟用審查。
16. **Customer UI**：小型有標籤 thumbs buttons、keyboard/focus、aria-pressed、
    submitting disabled、inline negative options、簡短成功/失敗提示。Feedback failure 不 retry AI。
    polling/response 兩種抵達順序都保留 token；不寫入既有 transcript cache/context/debug summary。
17. **Mobile**：375/390/430 操作與截圖 PASS；展開選項不 overflow，
    controls 高度至少 40 px；selected/submitting 狀態與 keyboard focus 已驗證。
18. **Admin route**：/admin/ai-improvement，沿用 route guard。
    navigation 需要 ai_quality.view；flag OFF 為安全未啟用狀態。
19. **Top metrics**：期間對話、負面回饋、高風險訊號、去重問題回合，
    加上正負及 category counts。僅觀測事實，沒有 AI root-cause 分類或 fake occurrence。
20. **Review list**：每 event 一列，sanitized question/answer、type、severity、
    capability、時間與 reviewed state。
21. **Detail**：sanitized excerpts、category、signal、capability、provider used/count、
    scenario changed、pending state、時間。缺少 telemetry 顯示未知，不捏造 NO/0。
22. **Limited context**：SQL 最多前兩輪、本輪、後一輪，至多八則 user/assistant messages。
    無全對話/download；超過 30 天的文字即使尚未實體 cleanup 也不回傳。
23. **Reviewed**：使用獨立 reviewed_at，不改 resolved_at，不使用 ai_owner_decisions。
    Server 需要 ai_quality.review 或 Super Admin。
24. **Retention health**：獨立頁籤按需讀既有真實 storage helper：
    conversation/message/event/review/eval rows、oldest message、cleanup due。
    Messages 30 天 / Events 90 天；不捏造 MB，不執行 cleanup/scheduler。
25. **Filters**：7/30 天；all/negative/fallback/context/mutation/provider/clarification，
    另支援 pending/budget signals；severity all/high-critical/other；reviewed state。
26. **States**：loading、zero-event、未啟用、schema 未初始化與安全錯誤；
    不顯示 SQL/stack，不把 0 events 表達成 AI 100% 正確。
27. **Admin auth**：以 synthetic transport 執行正式 permission framework。
    public/expired/ordinary ungranted admin/inactive Super Admin denied；
    Super Admin 與明確權限 allowed。401 login、403 permission、503 data error 分開。
28. **RLS**：anon/authenticated 對新 RPC 與 Quality tables 皆 denied；service_role only。
    本機 PGlite 實際執行 migration 與權限測試，RLS/no-public-policy 維持。
29. **Pagination**：25 筆，26th-row sentinel；created_at/id 倒序 keyset cursor。
    測過翻頁無重複、filters/schema rejection 與 bounded response。
30. **Performance**：token creation 無同步 DB lookup，無新增訊息讀取 API。
    Quality HTTP transport 四秒上限、256 KiB response cap、no retry/error-body dump。
    Overview 最多讀 5,001 筆近期 events/conversations，依固定順序統計最近 5,000；
    超過上限清楚標示 sample，非全期間總數。不在 dashboard 執行全歷史 daily aggregate。
31. **新增 DeepSeek calls**：0。未使用 real provider 或 key。
    Feedback/Admin/dashboard 只有 Quality RPC；auth 為既有 Supabase auth/profile/permissions。
32. **Actual handler**：166/166 PASS；五個 direct feedback equivalence cases，
    加上既有 20-case owner canary 的 feedback ON 比對，answer/scenario/pending/calls unchanged。
33. **Observer**：observer 42/42、observer migration 20/20 PASS；
    privacy、metadata、foundation migration/boundary suites 亦 PASS。
34. **Semantic**：semantic/scenario/pending/reference suites 全 PASS，
    含 769 reference holdout cases 與 200 multi-turn architecture conversations。
35. **FAQ**：98/98 PASS，FAQ / guesthouse rules 未改。
36. **Booking**：pricing 34/34 與 booking/payment/cancel/API/UI-contract suites PASS；
    Booking/pricing/payment/cancel source 未改。
37. **Admin regression**：既有 auth/route/navigation PASS；新增 Admin API 26/26 PASS。
    瀏覽器另驗證 auth expiry、forbidden、flag OFF 與 missing schema。
38. **Full repo**：2327/2329 PASS；只有兩個既有 About failures。
    新 feedback tests 39、local migration tests 14、client tests 6、Admin API tests 26，
    加六個 actual-handler tests；沒有新增 unrelated failure。
39. **About baseline**：src/data/aboutContent.test.ts 的完整文字與 paragraph A closing quote
    兩個既有斷言仍失敗；About page/data/tests 與 checkpoint byte-identical，未放寬 assertion。
40. **check/build/diff**：check --incremental false、build、tracked/untracked whitespace PASS。
    首次 build 遇 generated .gitkeep EPERM，以相同指令取得本機寫入權限後 PASS。
    Vite chunk-size warning 保留，屬既有 informational warning。
41. **Modified files**：22 個，完整清單如下，全部為 Phase 1C；無 unrelated dirty，未 stage。
42. **Phase 1A migration**：與 checkpoint byte-identical。
43. **Phase 1B migration**：與 checkpoint byte-identical。
44. **Production DB modified**：NO。新 migration 只在隔離的 in-memory PGlite 執行。
45. **Production env modified**：NO。無 deploy、Promote、remote schema 操作或 secret retrieval。
46. **PHASE 1C GATE**：PASS，依明確接受的 baseline。
47. **建議 Production Activation Gate**：YES，僅建議另外核准審查/驗證，
    不代表本輪可啟用、部署或修改任何 Production 設定。

## 下一個 Gate 需知

- Observer 在 response 後保存；立即回饋可能早於 Quality message 寫入。
  Missing turn 安全拒絕，不建立 orphan，也不要求 raw transcript。可以人工重送回饋，但絕不 retry AI。
- Controls 僅適用當前 browser memory 中新完成、具有 token 的回答；
  reload history 不補發 token、不持久保存 token，也不增加 lookup calls。
- 12/minute 是 signed-turn limit，不是 global firewall；invalid signatures 不進 DB。
  既有 chat limits 繼續限制合法 turn 建立量。
- Retention scheduler 不在本輪範圍，資料健康不觸發 cleanup；
  Maintenance/scheduler 啟用必須另行核准。
- Dashboard 使用 active events，不以可能過時的 daily feedback counters 假造現況；
  不重寫既有歷史 daily records。
- 截圖為 synthetic data，並非 live deployment/正式資料驗證。
- Production Activation Gate 必須另查 migration 順序、grants、HMAC 配置、Admin 權限、
  retention operation 與 exact deployment flags，且不得輸出 secret。

## Modified Files

既有檔案：

- .env.example
- client/server/aiChat/message.js
- client/server/aiQuality/foundationBoundary.test.js
- client/src/App.tsx
- client/src/components/admin/AdminLayout.tsx
- client/src/components/admin/adminNavigation.ts
- client/src/components/ai/MumbaoChat.tsx
- client/tests/api/ai-chat-structured.test.js

新增檔案：

- client/api/admin-ai-quality.js
- client/api/ai-quality-feedback.js
- client/scripts/ai/verifyQualityUi.mjs
- client/server/aiQuality/feedback.test.js
- client/server/aiQuality/feedbackMigration.test.js
- client/server/aiQuality/feedbackToken.js
- client/server/aiQuality/http.js
- client/src/components/ai/AiAnswerFeedback.test.tsx
- client/src/components/ai/AiAnswerFeedback.tsx
- client/src/lib/aiQualityAdmin.ts
- client/src/pages/AdminAiImprovement.tsx
- client/supabase/migrations/2026-09-10-ai-quality-feedback-admin.sql
- client/tests/api/admin-ai-quality.test.js
- docs/AI_QUALITY_PHASE_1C.md

## 重現方式

Repository root，不需 Production credentials：

- npx.cmd vitest run --no-cache --silent
- npm.cmd run faq:test
- npm.cmd run check -- --incremental false
- npm.cmd run build
- git diff --check

Synthetic browser test 需要本機 Playwright 與 Chrome，使用 local Vite，不使用 vercel dev。
所有 API 被 synthetic fixtures 攔截，禁止 non-local requests，不會呼叫真實 AI/Admin/feedback API。

- 啟動：node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort
- 另一個 PowerShell 執行：node client/scripts/ai/verifyQualityUi.mjs
- 必要時將 PLAYWRIGHT_MODULE_PATH 設為本機既有 Playwright package 路徑。
- 截圖輸出到 OS temporary directory 下 mumbao-quality-phase-1c-ui，只有 synthetic data，不進 Git。
