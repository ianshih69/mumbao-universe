# 問慢寶 FAQ 維護說明

這份文件寫給維護 FAQ 的非工程人員。日常只需要維護 `client/api/knowledge/faq-master.csv`。

## 只手動維護哪個檔案

請只手動編輯：

- `client/api/knowledge/faq-master.csv`

請不要手動編輯：

- `client/api/knowledge/faq-items.json`
- `client/api/knowledge/faq-regression-cases.json`
- `client/server/aiChat/*.js`
- `guesthouse-rules.md` 裡的正式價格、時間、費用與規定

`faq-items.json` 是由工具從 `faq-master.csv` 產生的 runtime 檔案，不要直接改。

## 用 Excel 開啟 faq-master.csv

1. 開啟 Excel。
2. 使用「資料」→「從文字/CSV」匯入。
3. 選擇 `client/api/knowledge/faq-master.csv`。
4. 檔案原始格式請選 `65001: Unicode (UTF-8)`。
5. 分隔符號選「逗號」。
6. 確認中文字沒有亂碼後再載入。

## 欄位說明

| 欄位 | 用途 |
|---|---|
| `id` | 穩定 FAQ ID，格式如 `faq-001`，不要重複也不要隨意改 |
| `category` | 分類，例如訂房、寵物、早餐 |
| `question` | 主要問題，一題一個正式問法 |
| `aliases` | 同義完整問句，用 `｜` 分隔 |
| `answer` | 標準答案 |
| `keywords` | 短關鍵字，用 `｜` 分隔 |
| `answer_mode` | 回答模式：`direct`、`collect_info`、`ask_human` |
| `status` | 狀態：`approved`、`needs_review`、`archived` |
| `priority` | 檢索優先度，通常維持 `80` |
| `last_verified_at` | 最後人工確認日期，例如 `2026-07-23` |
| `internal_note` | 內部備註，不會輸出到 runtime JSON |

## 如何修改答案

直接修改 `answer` 欄位即可。請注意：

- 時間、價格、費用、押金、退款、訪客費、早餐價格，要先確認正式規則。
- 不確定的內容不要寫成肯定承諾。
- 如果需要管家確認，請把 `answer_mode` 改成 `collect_info` 或 `ask_human`。

## 如何新增 alias

`aliases` 放完整問句，不放短詞。

例：

```text
狗狗可以一起住嗎？｜可以帶毛孩嗎？｜可以帶寵物入住嗎？
```

請使用全形分隔符號 `｜`，不要用半形 `|`。

## 何時新增新題，何時只補 alias

只補 alias：

- 使用者問法不同，但答案完全相同。
- 只是語氣不同，例如「狗狗可以住嗎」與「可以帶狗嗎」。

新增新題：

- 答案條件不同。
- 涉及不同費用、時間、限制或流程。
- 原本問題太籠統，容易誤導。

## answer_mode 怎麼選

`direct`：

- 答案已確認，可以直接正式回答。
- 例如已確認的入住時間、退房時間、是否寵物友善。

`collect_info`：

- 需要先收集日期、人數、寵物數量、車輛數、特殊需求。
- 慢寶可以先問客人補資料，再交給管家確認。

`ask_human`：

- 涉及價格例外、退款、客訴、安全、法律、個資、特殊服務。
- 不希望慢寶直接承諾，需由管家處理。

## status 怎麼選

`approved`：

- 已由負責人確認，允許問慢寶正式使用。

`needs_review`：

- 需要人工複核。
- 問慢寶嚴格模式不會把這題當成可直接回答資料。

`archived`：

- 題目過時或不再使用。
- 會輸出為 `is_active=false`。

## 如何儲存成 UTF-8 CSV

Excel 儲存時請選：

- `CSV UTF-8 (逗號分隔) (*.csv)`

儲存後如果開啟看到亂碼，請不要提交，先重新以 UTF-8 匯出。

## 如何執行工具

在專案根目錄執行：

```bash
npm run faq:validate
```

檢查 `faq-master.csv` 結構與品質警告。

```bash
npm run faq:build -- --dry-run
```

先做 dry-run，不覆寫正式 `faq-items.json`。

```bash
npm run faq:test
```

跑 FAQ routing regression cases。

```bash
npm run faq:audit
```

一次跑 validate、JSON dry-run 與 regression。

## guesthouse-rules.md 的角色

`guesthouse-rules.md` 只放共同規則、角色語氣與整理中的背景。正式會被慢寶回答的價格、時間、費用、設備與禁止事項，仍應整理進 `faq-master.csv`，再由工具產生 `faq-items.json`。

## Git 操作

Git commit / push 由使用者本人執行。維護者完成 CSV 修改與工具驗證後，請把結果交給使用者確認，不要自行 push。
