-- 提案 A：官網下單寫入 online_order 庫存流水
-- create_shop_order RPC 完整替換版本
--
-- 改動說明（僅在既有邏輯上新增一段，其餘完全不變）：
--   在 loop 內，每個 item 扣庫存成功後，
--   緊接著寫入 shop_inventory_movements。
--
-- 不變的部分：
--   - 輸入參數（order_payload jsonb）
--   - 回傳格式
--   - 訂單編號規則（MS + 時間 + UUID 前 4 碼）
--   - 庫存檢查（INSUFFICIENT_INVENTORY）
--   - status / published 檢查
--   - shop_orders / shop_order_items 寫入邏輯
--   - Rollback 行為（plpgsql 隱式事務，任一 raise exception 均全數回滾）

create or replace function create_shop_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer jsonb := coalesce(order_payload->'customer', '{}'::jsonb);
  item jsonb;
  item_count integer := jsonb_array_length(coalesce(order_payload->'items', '[]'::jsonb));
  current_variant shop_product_variants%rowtype;
  current_product shop_products%rowtype;
  next_order_id uuid;
  next_order_number text;
  line_quantity integer;
  line_total integer;
  next_subtotal integer := 0;
  next_shipping_fee integer := 0;
  -- 新增：庫存流水用的 before/after 暫存變數
  inv_before integer;
  inv_after integer;
begin
  if item_count <= 0 then
    raise exception 'ORDER_ITEMS_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(customer->>'name'), '') is null then
    raise exception 'CUSTOMER_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(customer->>'phone'), '') is null then
    raise exception 'CUSTOMER_PHONE_REQUIRED' using errcode = 'P0001';
  end if;

  if nullif(trim(customer->>'address'), '') is null then
    raise exception 'SHIPPING_ADDRESS_REQUIRED' using errcode = 'P0001';
  end if;

  next_order_number := 'MS' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDDHH24MISS')
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  insert into shop_orders (
    order_number,
    customer_name,
    customer_phone,
    customer_email,
    shipping_address,
    note,
    subtotal,
    shipping_fee,
    total,
    payment_method,
    payment_status,
    order_status
  )
  values (
    next_order_number,
    trim(customer->>'name'),
    trim(customer->>'phone'),
    nullif(trim(coalesce(customer->>'email', '')), ''),
    trim(customer->>'address'),
    nullif(trim(coalesce(order_payload->>'note', '')), ''),
    0,
    next_shipping_fee,
    0,
    'manual_confirmation',
    'pending',
    'pending_confirm'
  )
  returning id into next_order_id;

  for item in select * from jsonb_array_elements(order_payload->'items')
  loop
    line_quantity := greatest(coalesce((item->>'quantity')::integer, 0), 0);

    if line_quantity <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select *
      into current_variant
      from shop_product_variants
      where id = (item->>'variant_id')::uuid
        and status = 'active'
      for update;

    if not found then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select *
      into current_product
      from shop_products
      where id = current_variant.product_id
        and status = 'published';

    if not found then
      raise exception 'PRODUCT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;

    if current_variant.inventory < line_quantity then
      raise exception 'INSUFFICIENT_INVENTORY' using errcode = 'P0001';
    end if;

    -- 計算流水數量（在 UPDATE 前記錄 before）
    inv_before := current_variant.inventory;
    inv_after  := current_variant.inventory - line_quantity;

    update shop_product_variants
      set inventory = inventory - line_quantity,
          updated_at = now()
      where id = current_variant.id;

    -- 新增：寫入 online_order 庫存流水
    insert into shop_inventory_movements (
      product_id,
      variant_id,
      movement_type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reference_type,
      reference_number,
      note,
      created_by
    )
    values (
      current_variant.product_id,
      current_variant.id,
      'online_order',
      line_quantity * -1,
      inv_before,
      inv_after,
      'shop_order',
      next_order_number,
      '官網下單',
      'online'
    );

    line_total := current_variant.price * line_quantity;
    next_subtotal := next_subtotal + line_total;

    insert into shop_order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      product_slug,
      product_image_url,
      variant_name,
      variant_option,
      variant_price,
      unit_price,
      quantity,
      line_total
    )
    values (
      next_order_id,
      current_product.id,
      current_variant.id,
      current_product.name,
      current_product.slug,
      current_product.cover_image_url,
      current_variant.variant_name,
      current_variant.variant_option,
      current_variant.price,
      current_variant.price,
      line_quantity,
      line_total
    );
  end loop;

  update shop_orders
    set subtotal = next_subtotal,
        total = next_subtotal + next_shipping_fee,
        updated_at = now()
    where id = next_order_id;

  return jsonb_build_object(
    'id', next_order_id,
    'order_number', next_order_number,
    'subtotal', next_subtotal,
    'shipping_fee', next_shipping_fee,
    'total', next_subtotal + next_shipping_fee,
    'payment_status', 'pending',
    'order_status', 'pending_confirm'
  );
end;
$$;
