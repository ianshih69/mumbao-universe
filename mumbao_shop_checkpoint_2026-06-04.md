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

## 9. 測試通過項目

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

## 10. 核心資料表

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

## 11. 核心 RPC

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

## 12. API 架構與 Vercel Function 限制

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

## 13. 不可亂改的區塊

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

## 14. 下一階段候選功能

可評估的後續方向：

- 訂單出貨流程進一步收斂
- 出貨狀態通知文案
- 後台訂單列印版細節優化
- 庫存流水查詢篩選優化
- POS 銷售紀錄整理
- 商品管理圖片上傳
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
