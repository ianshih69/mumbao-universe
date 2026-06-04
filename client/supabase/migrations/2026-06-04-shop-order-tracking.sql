-- D4：出貨資訊 / 內部備註
-- 在 shop_orders 新增三個欄位：
--   shipping_carrier  物流方式 / 物流公司
--   tracking_number   物流追蹤號碼
--   internal_note     後台內部備註（顧客不可見）
--
-- 使用 ADD COLUMN IF NOT EXISTS，向後相容，不影響現有資料。
-- 執行後三個欄位預設值皆為 null。

alter table shop_orders
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text,
  add column if not exists internal_note text;
