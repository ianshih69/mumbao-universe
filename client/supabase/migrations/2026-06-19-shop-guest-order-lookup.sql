alter table public.shop_orders
  add column if not exists guest_lookup_token_hash text,
  add column if not exists checkout_idempotency_key text;

create unique index if not exists shop_orders_guest_lookup_token_hash_unique_idx
  on public.shop_orders (guest_lookup_token_hash)
  where guest_lookup_token_hash is not null;

create unique index if not exists shop_orders_checkout_idempotency_key_unique_idx
  on public.shop_orders (checkout_idempotency_key)
  where checkout_idempotency_key is not null;

create or replace function public.create_shop_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer jsonb := coalesce(order_payload->'customer', '{}'::jsonb);
  item jsonb;
  item_count integer := jsonb_array_length(coalesce(order_payload->'items', '[]'::jsonb));
  current_variant public.shop_product_variants%rowtype;
  current_product public.shop_products%rowtype;
  existing_order public.shop_orders%rowtype;
  next_order_id uuid;
  next_order_number text;
  checkout_key text := nullif(trim(coalesce(order_payload->>'checkout_idempotency_key', '')), '');
  lookup_hash text := nullif(trim(coalesce(order_payload->>'guest_lookup_token_hash', '')), '');
  line_quantity integer;
  line_total integer;
  next_subtotal integer := 0;
  next_shipping_fee integer := 0;
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

  if (checkout_key is null and lookup_hash is not null)
    or (checkout_key is not null and lookup_hash is null) then
    raise exception 'INVALID_CHECKOUT_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;

  if checkout_key is not null then
    select *
      into existing_order
      from public.shop_orders
      where checkout_idempotency_key = checkout_key
      limit 1;

    if found then
      return jsonb_build_object(
        'id', existing_order.id,
        'order_number', existing_order.order_number,
        'subtotal', existing_order.subtotal,
        'shipping_fee', existing_order.shipping_fee,
        'total', existing_order.total,
        'payment_status', existing_order.payment_status,
        'order_status', existing_order.order_status
      );
    end if;
  end if;

  next_order_number := 'MS' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDDHH24MISS')
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  begin
    insert into public.shop_orders (
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
      guest_lookup_token_hash,
      checkout_idempotency_key
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
      'pending_confirm',
      lookup_hash,
      checkout_key
    )
    returning id into next_order_id;
  exception
    when unique_violation then
      if checkout_key is not null then
        select *
          into existing_order
          from public.shop_orders
          where checkout_idempotency_key = checkout_key
          limit 1;

        if found then
          return jsonb_build_object(
            'id', existing_order.id,
            'order_number', existing_order.order_number,
            'subtotal', existing_order.subtotal,
            'shipping_fee', existing_order.shipping_fee,
            'total', existing_order.total,
            'payment_status', existing_order.payment_status,
            'order_status', existing_order.order_status
          );
        end if;
      end if;

      raise;
  end;

  for item in select * from jsonb_array_elements(order_payload->'items')
  loop
    line_quantity := greatest(coalesce((item->>'quantity')::integer, 0), 0);

    if line_quantity <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select *
      into current_variant
      from public.shop_product_variants
      where id = (item->>'variant_id')::uuid
        and status = 'active'
      for update;

    if not found then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0001';
    end if;

    select *
      into current_product
      from public.shop_products
      where id = current_variant.product_id
        and status = 'published';

    if not found then
      raise exception 'PRODUCT_NOT_AVAILABLE' using errcode = 'P0001';
    end if;

    if current_variant.inventory < line_quantity then
      raise exception 'INSUFFICIENT_INVENTORY' using errcode = 'P0001';
    end if;

    inv_before := current_variant.inventory;
    inv_after := current_variant.inventory - line_quantity;

    update public.shop_product_variants
      set inventory = inventory - line_quantity,
          updated_at = now()
      where id = current_variant.id;

    insert into public.shop_inventory_movements (
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
      'online order',
      'online'
    );

    line_total := current_variant.price * line_quantity;
    next_subtotal := next_subtotal + line_total;

    insert into public.shop_order_items (
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

  update public.shop_orders
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

revoke all on function public.create_shop_order(jsonb) from public;
revoke all on function public.create_shop_order(jsonb) from anon;
revoke all on function public.create_shop_order(jsonb) from authenticated;
grant execute on function public.create_shop_order(jsonb) to service_role;
