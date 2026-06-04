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

## 4. 測試通過項目

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

## 5. 核心資料表

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

## 6. 核心 RPC

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

## 7. API 架構與 Vercel Function 限制

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

## 8. 不可亂改的區塊

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

## 9. 下一階段候選功能

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
