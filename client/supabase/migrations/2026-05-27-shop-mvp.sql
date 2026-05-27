create table if not exists shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text,
  description text,
  category text not null default '文創商品',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  sort_order integer not null default 0,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shop_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references shop_products(id) on delete cascade,
  image_url text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists shop_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references shop_products(id) on delete cascade,
  sku text,
  variant_name text not null,
  variant_option text,
  price integer not null check (price >= 0),
  compare_at_price integer,
  inventory integer not null default 0 check (inventory >= 0),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  shipping_address text not null,
  note text,
  subtotal integer not null default 0,
  shipping_fee integer not null default 0,
  total integer not null default 0,
  payment_method text not null default 'manual_confirmation',
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'confirmed', 'failed', 'refunded')),
  order_status text not null default 'pending_confirm'
    check (
      order_status in (
        'pending_confirm',
        'pending_payment',
        'paid',
        'shipping',
        'completed',
        'cancelled'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shop_orders(id) on delete cascade,
  product_id uuid references shop_products(id) on delete set null,
  variant_id uuid references shop_product_variants(id) on delete set null,
  product_name text not null,
  product_slug text,
  product_image_url text,
  variant_name text,
  variant_option text,
  variant_price integer not null,
  unit_price integer not null,
  quantity integer not null check (quantity > 0),
  line_total integer not null,
  created_at timestamptz not null default now()
);

create index if not exists shop_products_status_sort_idx
  on shop_products (status, sort_order, created_at desc);

create index if not exists shop_product_variants_product_sort_idx
  on shop_product_variants (product_id, status, sort_order);

create index if not exists shop_product_images_product_sort_idx
  on shop_product_images (product_id, sort_order);

create index if not exists shop_orders_created_at_idx
  on shop_orders (created_at desc);

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

    update shop_product_variants
      set inventory = inventory - line_quantity,
          updated_at = now()
      where id = current_variant.id;

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
