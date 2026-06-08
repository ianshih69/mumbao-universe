# 慢慢蒔光官網文創商品購物車 / 宇宙碎品商城 Checkpoint

日期：2026-06-04

本文件記錄目前商城專案狀態，供後續模型或工程接手使用。請勿依此文件重做既有功能；目前已完成項目應視為可用且已測試通過。

## 1. 目前已完成的商城功能

### 前台商城

- `/shop` 商品列表正常
- `/shop/:slug` 商品詳情正常
- `/cart` 購物車正常
- `/checkout` 結帳正常
- `/order-complete` 訂單完成頁正常
- 前台下單會建立 `shop_orders`
- 前台下單會建立 `shop_order_items`
- 前台下單會扣 `shop_product_variants.inventory`

### 後台商城

- `/admin/shop` 商城後台總覽正常
- `/admin/shop/products` 商品管理正常
- `/admin/shop/orders` 訂單管理正常
- `/admin/shop/inventory` 庫存調整正常
- `/admin/shop/scan` 掃描入庫正常
- `/admin/shop/pos` 現場銷售 POS 正常
- 備貨單列印正常
- Dashboard 正常
- 後台中文化正常
- 商城後台共用登入狀態正常
- E1 訂單搜尋 / 篩選強化正常
- E2 訂單匯出 CSV 正常
- E2-2 訂單商品明細 CSV 匯出正常
- E3 / E3-1 低庫存與庫存清單 UX 正常
- E4 商品圖片 URL 管理優化正常
- E5-2A Admin UX 商品規格收合式編輯正常
- D5-2 訂單列表資訊強化與查單自動開明細正常
- E5-3 前台購物車 / 結帳 / 訂單完成頁電腦版 UI 優化正常

## 2. D4 出貨資訊 / 內部備註完成內容

`shop_orders` 已新增欄位：

- `shipping_carrier`
- `tracking_number`
- `internal_note`

已完成功能：

- `/admin/shop/orders` 訂單詳情可填物流方式
- `/admin/shop/orders` 訂單詳情可填物流單號
- `/admin/shop/orders` 訂單詳情可填內部備註
- POS 訂單也可填內部備註
- 備貨單有物流資料時才顯示物流資訊
- 備貨單沒有物流資料時不顯示空欄位

D4 未修改：

- 前台購物流程
- POS 核心邏輯
- QR 核心邏輯
- 核心庫存 RPC

## 3. 提案 A：官網下單寫入 online_order 庫存流水完成內容

`create_shop_order` RPC 已更新。

官網下單扣庫存後會寫入 `shop_inventory_movements`：

- `movement_type = online_order`
- `quantity_delta` 為負數
- `quantity_before` 正確
- `quantity_after` 正確
- `reference_number` 對應 `MS` 訂單編號
- `note = 官網下單`
- `created_by = online`

## 4. E1 訂單搜尋 / 篩選強化完成內容

`/admin/shop/orders` 訂單管理頁已完成更完整的訂單搜尋與篩選。

搜尋支援：

- 訂單編號
- 顧客姓名
- 電話
- Email
- 物流單號

篩選支援：

- 訂單來源：全部 / 官網訂單 / 現場銷售
- 訂單狀態：全部 / 待確認 / 待付款 / 已付款 / 出貨中 / 已完成 / 已取消
- 付款狀態：全部 / 待付款 / 已確認付款
- 日期區間：開始日期 / 結束日期
- 物流單號：全部物流 / 有物流單號 / 無物流單號

其他完成項目：

- 已新增「清除篩選」按鈕
- 清除篩選會重置搜尋、狀態、來源、付款狀態、日期區間與物流篩選
- 清除後會重新查詢全部訂單
- 訂單列表仍維持中文化顯示，不顯示 raw code
- API 仍沿用 `/api/admin-shop?action=orders`
- 未新增 Vercel function
- 未修改資料庫或 RPC
- 未修改前台、POS、QR、庫存流程

## 5. E2 訂單匯出 CSV 完成內容

`/admin/shop/orders` 訂單管理頁已完成訂單主檔 CSV 匯出。

完成項目：

- 新增「匯出 CSV」按鈕
- 可匯出目前篩選結果
- 匯出會套用目前畫面條件：
  - 搜尋關鍵字
  - 訂單來源
  - 訂單狀態
  - 付款狀態
  - 開始日期
  - 結束日期
  - 有 / 無物流單號
- CSV 使用 UTF-8 with BOM，避免 Excel 開啟中文亂碼
- 訂單來源輸出中文，不輸出 raw code
- 付款方式輸出中文，不輸出 raw code
- 付款狀態輸出中文，不輸出 raw code
- 訂單狀態輸出中文，不輸出 raw code
- 第一版只匯出訂單主檔，未展開商品明細

CSV 欄位包含：

- 訂單編號
- 建立時間
- 訂單來源
- 顧客姓名
- 電話
- Email
- 地址
- 付款方式
- 付款狀態
- 訂單狀態
- 商品小計
- 運費
- 總金額
- 物流方式
- 物流單號
- 顧客備註
- 內部備註

E2 未修改：

- 資料庫 schema
- RPC
- 前台購物流程
- POS 銷售邏輯
- QR 掃描邏輯
- 庫存流程
- Vercel function 數量

## 6. E2-2 訂單商品明細 CSV 完成內容

`/admin/shop/orders` 訂單管理頁已完成商品明細版 CSV 匯出。

完成項目：

- 新增「匯出商品明細 CSV」按鈕
- 原訂單主檔匯出按鈕文案已調整為「匯出訂單總表 CSV」
- 商品明細 CSV 可匯出目前篩選結果
- 匯出會套用目前畫面條件：
  - 搜尋關鍵字
  - 訂單來源
  - 訂單狀態
  - 付款狀態
  - 開始日期
  - 結束日期
  - 有 / 無物流單號
- CSV 使用 UTF-8 with BOM，避免 Excel 開啟中文亂碼
- 一個商品明細一列
- 一筆訂單若有多個商品，會輸出多列
- 訂單來源輸出中文，不輸出 raw code
- 訂單狀態輸出中文，不輸出 raw code
- 付款狀態輸出中文，不輸出 raw code
- SKU 由既有 `shop_product_variants.sku` 查出
- 未為 SKU 新增資料庫欄位

商品明細 CSV 欄位包含：

- 訂單編號
- 建立時間
- 訂單來源
- 顧客姓名
- 電話
- Email
- 訂單狀態
- 付款狀態
- 物流方式
- 物流單號
- 商品名稱
- 規格名稱
- 規格選項
- SKU
- 單價
- 數量
- 小計
- 訂單總金額
- 內部備註

E2-2 未修改：

- 資料庫 schema
- RPC
- 前台購物流程
- POS 銷售邏輯
- QR 掃描邏輯
- 庫存流程
- Vercel function 數量

## 7. E3 / E3-1 低庫存與庫存清單 UX 完成內容

`/admin/shop/products` 與 `/admin/shop/inventory` 已完成低庫存 / 售完提醒強化。

商品管理頁完成項目：

- 商品列表依總庫存顯示庫存狀態
- 庫存 `0` 顯示「售完」
- 庫存 `1～3` 顯示「低庫存」
- 庫存 `4` 以上顯示「庫存正常」
- 多規格商品以總庫存判斷狀態

庫存頁完成項目：

- 新增庫存狀態篩選：
  - 全部
  - 低庫存
  - 售完
- 選「全部」會顯示「全部庫存清單」
- 選「低庫存」會顯示「低庫存清單」
- 選「售完」會顯示「售完清單」
- 清單列出商品規格
- 清單每列顯示：
  - 商品名稱
  - 規格名稱
  - SKU
  - 目前庫存
  - 庫存狀態：庫存正常 / 低庫存 / 售完
  - 選擇調整按鈕
- 點「選擇調整」會自動帶入上方商品與規格
- 點「選擇調整」後會自動捲到上方調整庫存表單
- 上方表單會顯示目前正在調整的商品與庫存提示
- 下方選中項目有高亮或「正在調整」狀態
- 手機版沒有水平跑版

E3 / E3-1 未修改：

- API
- 資料庫 schema
- RPC
- 前台購物流程
- POS 銷售邏輯
- QR 掃描邏輯
- CSV 匯出
- 訂單管理
- Vercel function 數量

## 8. E4 商品圖片 URL 管理優化完成內容

`/admin/shop/products` 已完成商品圖片 URL 管理 UI 優化。

完成項目：

- 商品主圖 URL 有值時會顯示預覽
- 沒有主圖 URL 時會顯示「尚未設定商品主圖」
- 主圖載入失敗時會顯示「圖片載入失敗」
- 商品圖片列表每張都有縮圖預覽
- 商品圖片列表載入失敗時會顯示「圖片載入失敗」
- 保留 `cover_image_url` 編輯方式
- 保留 `image_url` 編輯方式
- 保留 `alt` 編輯方式
- 保留 `sort_order` 編輯方式
- 新增圖片 URL 說明：
  - 「可貼官網 public 圖片、外部圖床或 CDN 圖片網址」
  - 「建議使用 WebP / JPG，寬度 1200～1600px，單張小於 500KB」

E4 未實作：

- 圖片上傳
- Supabase Storage
- 拖曳排序
- 圖片壓縮
- 圖片裁切
- 刪除 Storage 檔案

E4 未修改：

- API
- 資料庫 schema
- RPC
- 前台購物流程
- POS 銷售邏輯
- QR 掃描邏輯
- 庫存流程
- 訂單管理
- CSV 匯出
- Vercel function 數量

## 9. E5-2A Admin UX 商品規格收合式編輯完成內容

`/admin/shop/products` 商品編輯頁已完成商品規格區收合式 UI 優化。

完成項目：

- 「價格與庫存 / 販售規格」區塊改成收合式 UI
- 每個規格預設只顯示摘要列
- 摘要列顯示：
  - 規格名稱
  - 售價
  - 庫存
  - 販售狀態
  - SKU / 商品編號
  - 是否有規格圖片
- 點「編輯 / 展開」後才顯示完整欄位
- 同一時間只展開一個規格
- 切換規格時，前一個規格會自動收合
- 展開後保留所有既有欄位：
  - 規格名稱
  - 規格選項
  - 規格圖片 URL
  - 商品編號
  - 販售狀態
  - 售價
  - 原價
  - 庫存
- QR code 不再預設顯示
- 展開規格後需點「顯示 QR code」才會顯示 QR code 與下載功能
- 規格圖片 URL 有值時會顯示小縮圖預覽
- 規格圖片載入失敗時會顯示提示
- 修改規格圖片 URL、價格、庫存、SKU 後可正常儲存

後續可評估的小優化：

- 商品主圖預覽目前偏大，之後可限制桌機版主圖預覽高度，例如 `max-height: 320px～380px`，避免商品編輯頁過長

E5-2A Admin UX 小修未修改：

- API
- 資料庫 schema
- RPC
- 前台 `/shop`
- 前台 `/shop/:slug`
- `ProductDetail`
- `cartStore`
- checkout
- POS
- QR 產生邏輯
- QR 掃描
- 庫存流程
- 訂單管理
- CSV
- Vercel function 數量

## 10. D5-2 訂單列表資訊強化 + 查單自動開明細完成內容

`/admin/shop/orders` 訂單管理頁已完成訂單列表資訊強化，並支援從 `orderNumber` query 進入時自動開啟右側明細。

完成項目：

- `/admin/shop/orders?orderNumber=MS...` 會自動帶入訂單編號搜尋
- 查詢結果只有一筆時，右側訂單明細會自動打開
- 一般 `/admin/shop/orders` 不會自動選取訂單
- 訂單列表已顯示商品摘要
- 單商品訂單顯示「商品名稱 ×數量」
- 多商品訂單顯示「共 X 項商品」
- 訂單列表顯示：
  - 訂單編號
  - 訂單來源
  - 顧客姓名
  - 顧客電話
  - 商品摘要
  - 金額
  - 付款狀態
  - 訂單狀態
  - 建立時間
  - 明確「查看」入口
- 訂單列有 hover、cursor pointer 與明確可點擊狀態
- 點不同訂單卡片時，右側明細可正常切換
- 選中訂單有明顯高亮狀態

D5-2 API 調整：

- 沿用既有 `GET /api/admin-shop?action=orders`
- 訂單列表回傳補上：
  - `items_summary`
  - `item_count`
- 未新增 endpoint
- 未新增 Vercel function

D5-2 未修改：

- 資料庫 schema
- RPC
- 前台購物流程
- `cartStore`
- checkout
- 下單流程
- 庫存扣除
- POS
- QR
- CSV
- Vercel function 數量

## 11. E5-3 前台購物車 / 結帳 / 訂單完成頁電腦版 UI 優化完成內容

前台下單流程的桌機版 UI 已完成整理，範圍包含：

- `/cart`
- `/checkout`
- `/order-complete/:orderNumber`

完成項目：

- `/cart` 商品列可清楚顯示：
  - 商品圖片
  - 商品名稱
  - 規格
  - 單價
  - 數量
  - 小計
  - 移除按鈕
- `/cart` 商品卡片式排版已優化，不再裁切操作欄或移除按鈕
- `/cart` 訂單摘要顯示商品小計、運費與總金額
- `/cart` 總金額與付款採人工確認說明已加強視覺層級
- `/checkout` 收件資料表單排版已整理
- `/checkout` 可填寫姓名、電話、Email、地址與備註
- `/checkout` 付款方式顯示人工確認付款
- `/checkout` 訂單摘要清楚顯示商品、規格、數量與金額
- `/order-complete/:orderNumber` 會明確顯示訂單已送出
- `/order-complete/:orderNumber` 會顯示訂單編號
- `/order-complete/:orderNumber` 會說明付款採人工確認
- `/order-complete/:orderNumber` 會說明管家會再確認付款與出貨

E5-3 測試結果：

- `/cart` 購物車可正常顯示商品、規格、單價、數量、小計與訂單摘要
- 數量調整正常
- `/checkout` 可正常填寫姓名、電話、Email、地址、備註
- 送出訂單後可正常跳轉 `/order-complete/:orderNumber`
- `/order-complete` 正常顯示訂單已送出、訂單編號與人工確認付款說明
- 後台 `/admin/shop/orders` 可查到測試訂單
- 測試訂單資料正確：姓名、電話、Email、地址、備註、商品、金額都有寫入
- 庫存扣除正常，慢寶宇宙明信片組庫存從 `39` 扣為 `38`
- `npm.cmd run build` 已通過，只有既有 chunk size warning

E5-3 未修改：

- API
- 資料庫 schema
- RPC
- `cartStore`
- checkout 下單邏輯
- 庫存扣除流程
- 後台
- POS
- QR
- CSV
- Vercel function 數量

## 12. 測試通過項目

### 前台購物流程

- `/shop` 商品列表正常
- `/shop/:slug` 商品詳情正常
- `/cart` 購物車正常
- `/checkout` 結帳正常
- `/order-complete` 訂單完成頁正常
- 前台下單正常建立訂單
- 前台下單正常建立訂單明細
- 前台下單正常扣庫存

### 庫存與流水

- 官網下單會寫入 `online_order` 庫存流水
- `quantity_before / quantity_after` 正確
- `reference_number` 正確對應訂單編號
- 庫存不足時 rollback 正常
- 庫存不足時不新增訂單
- 庫存不足時不扣庫存
- 庫存不足時不寫流水

### 後台功能

- 商品管理正常
- 訂單管理正常
- 庫存調整正常
- 掃描入庫正常
- POS 現場銷售正常
- 備貨單列印正常
- Dashboard 正常
- 後台中文化正常
- 出貨資訊 / 內部備註正常
- 訂單編號搜尋正常
- 顧客姓名 / 電話 / Email / 物流單號搜尋正常
- 訂單來源篩選正常
- 訂單狀態篩選正常
- 付款狀態篩選正常
- 開始日期 / 結束日期篩選正常
- 有物流單號 / 無物流單號篩選正常
- 清除篩選正常
- E1 後訂單詳情仍可正常開啟
- E1 後備貨單仍可正常開啟
- E2 可成功下載 CSV
- Excel 開啟 CSV 中文沒有亂碼
- CSV 訂單來源 / 付款方式 / 付款狀態 / 訂單狀態皆已中文化
- CSV 包含訂單編號、建立時間、顧客資料、地址、金額、物流方式、物流單號、顧客備註、內部備註
- E2 第一版為訂單主檔匯出，未展開商品明細
- E2 後訂單列表、訂單詳情、備貨單仍正常
- E2-2 商品明細 CSV 可成功匯出
- E2-2 Excel 開啟 CSV 中文沒有亂碼
- E2-2 商品明細 CSV 為一個商品一列
- E2-2 商品名稱、規格、SKU、單價、數量、小計都有值
- E2-2 訂單來源、訂單狀態、付款狀態皆已中文化
- E2-2 未新增 Vercel function
- E2-2 未修改資料庫或 RPC
- E2-2 未修改前台、POS、QR、庫存流程
- E3 商品管理頁庫存狀態顯示正常
- E3 / E3-1 全部會顯示全部庫存清單
- E3 / E3-1 低庫存會顯示低庫存清單
- E3 / E3-1 售完會顯示售完清單
- E3 / E3-1 點選擇調整會自動帶入上方商品與規格
- E3 / E3-1 點選擇調整後會自動捲到上方表單
- E3 / E3-1 上方有明確提示目前正在調整的商品
- E3 / E3-1 下方選中項目有高亮或「正在調整」狀態
- E3 / E3-1 手機版沒有水平跑版
- E3 / E3-1 未影響 API、資料庫、RPC、前台、POS、QR、CSV、訂單管理
- E4 商品主圖 URL 有值時會顯示預覽
- E4 沒有主圖 URL 時會顯示「尚未設定商品主圖」
- E4 主圖載入失敗時會顯示「圖片載入失敗」
- E4 商品圖片列表每張都有縮圖預覽
- E4 圖片列表載入失敗時會顯示「圖片載入失敗」
- E4 `image_url`、`alt`、`sort_order` 仍可正常編輯
- E4 儲存商品後資料可正常保存
- E4 前台 `/shop` 與商品詳情圖片仍正常
- E4 未影響 API、資料庫、RPC、前台購物流程、POS、QR、庫存、訂單管理、CSV
- E4 未新增 Vercel function
- E4 `npm.cmd run build` 已通過
- E5-2A `/admin/shop/products` 商品規格區已改成收合式 UI
- E5-2A 每個規格預設只顯示摘要列
- E5-2A 摘要列可看到規格名稱、售價、庫存、販售狀態、SKU / 商品編號、是否有規格圖片
- E5-2A 點「編輯 / 展開」後才顯示完整欄位
- E5-2A 同一時間只展開一個規格，切換規格時前一個會自動收合
- E5-2A QR code 不再預設顯示，需點「顯示 QR code」才展開
- E5-2A 規格圖片 URL 有小縮圖預覽，載入失敗會顯示提示
- E5-2A 修改規格圖片 URL、價格、庫存、SKU 後可正常儲存
- E5-2A 未改 API、資料庫、RPC、前台、ProductDetail、cartStore、checkout、POS、QR 掃描、庫存、訂單、CSV
- E5-2A 未新增 Vercel function
- E5-2A `npm.cmd run build` 已通過，只有既有 chunk size warning
- D5-2 `/admin/shop/orders?orderNumber=MS...` 會自動帶入訂單編號搜尋
- D5-2 查詢結果只有一筆時，右側訂單明細會自動打開
- D5-2 一般 `/admin/shop/orders` 不會自動選取訂單
- D5-2 訂單列表已顯示商品摘要
- D5-2 單商品訂單顯示「商品名稱 ×數量」
- D5-2 多商品訂單顯示「共 X 項商品」
- D5-2 訂單列表顯示顧客姓名、電話、金額、付款狀態、訂單狀態、建立時間
- D5-2 訂單列有 hover、cursor pointer 與明確「查看」入口
- D5-2 點不同訂單卡片時，右側明細可正常切換
- D5-2 選中訂單有明顯高亮狀態
- D5-2 未改資料庫、RPC、前台、cartStore、checkout、下單流程、庫存扣除、POS、QR、CSV
- D5-2 未新增 Vercel function
- D5-2 `npm.cmd run build` 已通過，只有既有 chunk size warning
- E5-3 `/cart` 購物車可正常顯示商品、規格、單價、數量、小計與訂單摘要
- E5-3 數量調整正常
- E5-3 `/checkout` 可正常填寫姓名、電話、Email、地址、備註
- E5-3 付款方式顯示人工確認付款
- E5-3 送出訂單後可正常跳轉 `/order-complete/:orderNumber`
- E5-3 `/order-complete` 正常顯示訂單已送出、訂單編號與人工確認付款說明
- E5-3 後台 `/admin/shop/orders` 可查到測試訂單
- E5-3 測試訂單資料正確：姓名、電話、Email、地址、備註、商品、金額都有寫入
- E5-3 庫存扣除正常，慢寶宇宙明信片組庫存從 `39` 扣為 `38`
- E5-3 未改 API、資料庫、RPC、cartStore、checkout 下單邏輯、庫存扣除流程、後台、POS、QR、CSV
- E5-3 未新增 Vercel function
- E5-3 `npm.cmd run build` 已通過，只有既有 chunk size warning

## 13. 核心資料表

- `shop_products`
- `shop_product_variants`
- `shop_product_images`
- `shop_orders`
- `shop_order_items`
- `shop_inventory_movements`

`shop_orders` 目前包含出貨與內部備註欄位：

- `shipping_carrier`
- `tracking_number`
- `internal_note`

## 14. 核心 RPC

- `create_shop_order`
  - 官網下單
  - 建立訂單
  - 建立訂單明細
  - 扣商品規格庫存
  - 寫入 `online_order` 庫存流水
  - 庫存不足時整筆 rollback

- `adjust_shop_inventory`
  - 後台手動入庫
  - 後台手動扣庫存
  - 盤點調整
  - 寫入庫存流水
  - 防止庫存扣成負數

- `create_manual_sale_order`
  - POS 現場銷售
  - 建立 POS 訂單
  - 建立訂單明細
  - 扣商品規格庫存
  - 寫入 `manual_sale` 庫存流水
  - 庫存不足時整筆 rollback

## 15. API 架構與 Vercel Function 限制

目前商城 API 已收斂，避免超過 Vercel Hobby serverless functions 限制。

商城 API 繼續沿用：

- `/api/shop`
- `/api/admin-shop`

不要新增或恢復以下舊 endpoint：

- `/api/shop-products`
- `/api/shop-product`
- `/api/shop-orders`
- `/api/admin-shop-orders`
- `/api/admin-shop-order`

不要新增新的 Vercel function，除非有明確需求並重新評估 function 數量。

## 16. 不可亂改的區塊

除非有明確需求，請不要修改：

- `client/api/shop.js`
- 前台 `/shop`
- 前台 `/shop/:slug`
- 前台 `/cart`
- 前台 `/checkout`
- 前台 `/order-complete`
- POS 銷售邏輯
- QR 掃描邏輯
- `create_manual_sale_order` RPC
- `adjust_shop_inventory` RPC
- AI 客服
- LIFF / chat history
- 既有核心庫存扣除流程

任何會影響下單、扣庫存、庫存流水、POS、QR、AI 客服、LIFF session 的修改，都應先規劃並明確列出影響範圍。

## 17. 下一階段候選功能

可評估的後續方向：

- 訂單出貨流程進一步收斂
- 出貨狀態通知文案
- 後台訂單列印版細節優化
- 庫存流水查詢篩選優化
- POS 銷售紀錄整理
- 商品管理圖片上傳
- 商品管理桌機版主圖預覽高度限制，例如 `max-height: 320px～380px`
- 商品批次匯入
- 退貨 / 取消訂單補庫存流程
- 基礎營運報表

目前不建議在未規劃前直接新增：

- 金流串接
- 物流串接
- 會員系統
- 優惠券
- 評價系統
- 多賣家功能
- 新 Vercel function
## 18. 自動發文後台頁面第一版完成

- 新增 /admin/shop/social 自動發文後台頁面。
- 未登入時會要求先登入商城後台，沿用商城後台共用登入狀態。
- 商城後台導覽已新增「自動發文」入口。
- 可填寫發文標題、發文內容、Hashtag、平台、發文模式與排程時間。
- 圖片 / 影片選擇欄位第一版只顯示檔名，不會上傳。
- 右側預覽可顯示文案、hashtag、平台、模式、排程時間與檔名。
- 儲存草稿會寫入 localStorage，key 為 `mumbao_social_post_draft`。
- 重新整理後文字草稿可保留。
- 「之後發文」按鈕 disabled，並顯示「Meta API 串接後啟用」。
- 第一版未新增 API、資料庫、Vercel function。
- 第一版未串 Meta API、Cloudflare R2，也未上傳圖片 / 影片。
- 未影響商城前台、商品、訂單、庫存、POS、QR、CSV 或 RPC。
- `npm.cmd run build` 已通過，只有既有 chunk size warning。
