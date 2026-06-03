alter table if exists shop_orders
  add column if not exists order_source text not null default 'online';

do $$
begin
  alter table shop_orders
    add constraint shop_orders_order_source_check
    check (order_source in ('online', 'pos'));
exception
  when duplicate_object then null;
end;
$$;

create or replace function create_manual_sale_order(sale_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item_count integer := jsonb_array_length(coalesce(sale_payload->'items', '[]'::jsonb));
  sale_item record;
  current_variant shop_product_variants%rowtype;
  current_product shop_products%rowtype;
  next_order_id uuid;
  next_order_number text;
  next_payment_method text := trim(coalesce(sale_payload->>'payment_method', 'cash'));
  next_note text := nullif(trim(coalesce(sale_payload->>'note', '')), '');
  line_total integer;
  next_total integer := 0;
  quantity_before_value integer;
  quantity_after_value integer;
  result_items jsonb := '[]'::jsonb;
begin
  if item_count <= 0 then
    raise exception 'SALE_ITEMS_REQUIRED' using errcode = 'P0001';
  end if;

  if next_payment_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;

  next_order_number := 'POS' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDDHH24MISS')
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
    order_status,
    order_source
  )
  values (
    next_order_number,
    '現場顧客',
    'POS',
    null,
    '現場銷售',
    coalesce(next_note, '現場銷售'),
    0,
    0,
    0,
    next_payment_method,
    'confirmed',
    'completed',
    'pos'
  )
  returning id into next_order_id;

  for sale_item in
    select
      variant_id,
      sum(quantity)::integer as quantity
    from (
      select
        nullif(trim(item->>'variant_id'), '')::uuid as variant_id,
        coalesce((item->>'quantity')::integer, 0) as quantity
      from jsonb_array_elements(sale_payload->'items') as item
    ) normalized_items
    group by variant_id
  loop
    if sale_item.variant_id is null or sale_item.quantity <= 0 then
      raise exception 'INVALID_SALE_ITEM' using errcode = 'P0001';
    end if;

    select *
      into current_variant
      from shop_product_variants
      where id = sale_item.variant_id
        and status = 'active'
      for update;

    if not found then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select *
      into current_product
      from shop_products
      where id = current_variant.product_id;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
    end if;

    if current_variant.inventory < sale_item.quantity then
      raise exception 'INSUFFICIENT_INVENTORY' using errcode = 'P0001';
    end if;

    quantity_before_value := current_variant.inventory;
    quantity_after_value := quantity_before_value - sale_item.quantity;
    line_total := current_variant.price * sale_item.quantity;
    next_total := next_total + line_total;

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
      sale_item.quantity,
      line_total
    );

    update shop_product_variants
      set inventory = quantity_after_value,
          updated_at = now()
      where id = current_variant.id;

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
      current_product.id,
      current_variant.id,
      'manual_sale',
      sale_item.quantity * -1,
      quantity_before_value,
      quantity_after_value,
      'manual_sale',
      next_order_number,
      '現場銷售：' || next_order_number,
      'admin'
    );

    result_items := result_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', current_product.id,
        'variant_id', current_variant.id,
        'product_name', current_product.name,
        'product_slug', current_product.slug,
        'product_image_url', current_product.cover_image_url,
        'variant_name', current_variant.variant_name,
        'variant_option', current_variant.variant_option,
        'sku', current_variant.sku,
        'unit_price', current_variant.price,
        'quantity', sale_item.quantity,
        'line_total', line_total,
        'quantity_before', quantity_before_value,
        'quantity_after', quantity_after_value
      )
    );
  end loop;

  update shop_orders
    set subtotal = next_total,
        total = next_total,
        updated_at = now()
    where id = next_order_id;

  return jsonb_build_object(
    'id', next_order_id,
    'order_number', next_order_number,
    'subtotal', next_total,
    'shipping_fee', 0,
    'total', next_total,
    'payment_method', next_payment_method,
    'payment_status', 'confirmed',
    'order_status', 'completed',
    'order_source', 'pos',
    'items', result_items
  );
end;
$$;

grant usage on schema public to service_role;
grant select, insert, update on table shop_orders to service_role;
grant select, insert on table shop_order_items to service_role;
grant select, update on table shop_product_variants to service_role;
grant select on table shop_products to service_role;
grant select, insert on table shop_inventory_movements to service_role;
grant execute on function create_manual_sale_order(jsonb) to service_role;
