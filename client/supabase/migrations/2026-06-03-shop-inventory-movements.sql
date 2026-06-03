create table if not exists shop_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references shop_products(id) on delete set null,
  variant_id uuid references shop_product_variants(id) on delete set null,
  movement_type text not null
    check (
      movement_type in (
        'stock_in',
        'stock_out',
        'adjustment',
        'manual_sale',
        'online_order',
        'return_in'
      )
    ),
  quantity_delta integer not null,
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reference_type text,
  reference_number text,
  note text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists shop_inventory_movements_variant_created_idx
  on shop_inventory_movements (variant_id, created_at desc);

create index if not exists shop_inventory_movements_product_created_idx
  on shop_inventory_movements (product_id, created_at desc);

create index if not exists shop_inventory_movements_type_created_idx
  on shop_inventory_movements (movement_type, created_at desc);

create index if not exists shop_inventory_movements_reference_idx
  on shop_inventory_movements (reference_type, reference_number);

create or replace function adjust_shop_inventory(adjustment_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_variant shop_product_variants%rowtype;
  movement_row shop_inventory_movements%rowtype;
  requested_variant_id uuid;
  requested_type text := trim(coalesce(adjustment_payload->>'movement_type', ''));
  requested_quantity integer;
  quantity_before_value integer;
  quantity_after_value integer;
  quantity_delta_value integer;
  next_reference_type text := nullif(trim(coalesce(adjustment_payload->>'reference_type', 'manual_adjustment')), '');
  next_reference_number text := nullif(trim(coalesce(adjustment_payload->>'reference_number', '')), '');
  next_note text := nullif(trim(coalesce(adjustment_payload->>'note', '')), '');
  next_created_by text := nullif(trim(coalesce(adjustment_payload->>'created_by', 'admin')), '');
begin
  requested_variant_id := nullif(trim(coalesce(adjustment_payload->>'variant_id', '')), '')::uuid;
  requested_quantity := coalesce((adjustment_payload->>'quantity')::integer, -1);

  if requested_variant_id is null then
    raise exception 'VARIANT_ID_REQUIRED' using errcode = 'P0001';
  end if;

  if requested_type not in ('stock_in', 'stock_out', 'adjustment') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = 'P0001';
  end if;

  if requested_type in ('stock_in', 'stock_out') and requested_quantity <= 0 then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  if requested_type = 'adjustment' and requested_quantity < 0 then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  select *
    into current_variant
    from shop_product_variants
    where id = requested_variant_id
    for update;

  if not found then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0001';
  end if;

  quantity_before_value := current_variant.inventory;

  if requested_type = 'stock_in' then
    quantity_delta_value := requested_quantity;
    quantity_after_value := quantity_before_value + requested_quantity;
  elsif requested_type = 'stock_out' then
    quantity_delta_value := requested_quantity * -1;
    quantity_after_value := quantity_before_value - requested_quantity;
  else
    quantity_after_value := requested_quantity;
    quantity_delta_value := quantity_after_value - quantity_before_value;
  end if;

  if quantity_after_value < 0 then
    raise exception 'INSUFFICIENT_INVENTORY' using errcode = 'P0001';
  end if;

  if next_reference_type is null then
    next_reference_type := 'manual_adjustment';
  end if;

  if next_reference_number is null then
    next_reference_number := 'INV-' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDDHH24MISS')
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  end if;

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
    current_variant.product_id,
    current_variant.id,
    requested_type,
    quantity_delta_value,
    quantity_before_value,
    quantity_after_value,
    next_reference_type,
    next_reference_number,
    next_note,
    next_created_by
  )
  returning * into movement_row;

  return jsonb_build_object(
    'inventory', quantity_after_value,
    'movement', to_jsonb(movement_row)
  );
end;
$$;

grant usage on schema public to service_role;
grant select, insert on table shop_inventory_movements to service_role;
grant select, update on table shop_product_variants to service_role;
grant select on table shop_products to service_role;
grant execute on function adjust_shop_inventory(jsonb) to service_role;
