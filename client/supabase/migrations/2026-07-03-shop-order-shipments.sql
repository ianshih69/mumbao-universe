create table if not exists public.shop_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  shipment_status text not null default 'shipped'
    check (shipment_status in ('shipped', 'voided')),
  carrier text,
  tracking_number text,
  shipped_at timestamptz not null default now(),
  shipped_by_admin_id uuid references public.admin_profiles(id) on update cascade on delete set null,
  shipped_by_name text,
  shipped_by_email text,
  shipped_by_role text,
  note text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_order_shipments_order_id_idx
  on public.shop_order_shipments(order_id);

create index if not exists shop_order_shipments_shipped_at_idx
  on public.shop_order_shipments(shipped_at desc);

create index if not exists shop_order_shipments_shipped_by_admin_id_idx
  on public.shop_order_shipments(shipped_by_admin_id);

create index if not exists shop_order_shipments_carrier_idx
  on public.shop_order_shipments(carrier);

create or replace function public.set_shop_order_shipments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shop_order_shipments_updated_at on public.shop_order_shipments;
create trigger set_shop_order_shipments_updated_at
  before update on public.shop_order_shipments
  for each row
  execute function public.set_shop_order_shipments_updated_at();

alter table public.shop_order_shipments enable row level security;

revoke all on table public.shop_order_shipments from public, anon, authenticated;
grant select, insert, update on table public.shop_order_shipments to service_role;

create or replace function public.create_shop_order_shipment(shipment_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.shop_orders%rowtype;
  next_shipment public.shop_order_shipments%rowtype;
  raw_order_id text := nullif(trim(coalesce(shipment_payload->>'order_id', '')), '');
  next_order_id uuid;
  next_carrier text := nullif(trim(coalesce(shipment_payload->>'carrier', '')), '');
  next_tracking_number text := nullif(trim(coalesce(shipment_payload->>'tracking_number', '')), '');
  next_note text := nullif(trim(coalesce(shipment_payload->>'note', '')), '');
  next_shipped_by_admin_id uuid := null;
  active_shipment_count integer := 0;
begin
  if raw_order_id is null then
    raise exception 'ORDER_ID_REQUIRED' using errcode = 'P0001';
  end if;

  next_order_id := raw_order_id::uuid;

  if nullif(trim(coalesce(shipment_payload->>'shipped_by_admin_id', '')), '') is not null then
    next_shipped_by_admin_id := (shipment_payload->>'shipped_by_admin_id')::uuid;
  end if;

  select *
    into target_order
    from public.shop_orders
    where id = next_order_id
    for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if target_order.order_status = 'cancelled' then
    raise exception 'ORDER_CANCELLED' using errcode = 'P0001';
  end if;

  if target_order.order_source = 'pos' then
    raise exception 'POS_ORDER_SHIPMENT_UNSUPPORTED' using errcode = 'P0001';
  end if;

  select count(*)
    into active_shipment_count
    from public.shop_order_shipments
    where order_id = target_order.id
      and shipment_status = 'shipped';

  if active_shipment_count > 0 then
    raise exception 'ORDER_ALREADY_SHIPPED' using errcode = 'P0001';
  end if;

  insert into public.shop_order_shipments (
    order_id,
    shipment_status,
    carrier,
    tracking_number,
    shipped_by_admin_id,
    shipped_by_name,
    shipped_by_email,
    shipped_by_role,
    note,
    raw_payload
  )
  values (
    target_order.id,
    'shipped',
    next_carrier,
    next_tracking_number,
    next_shipped_by_admin_id,
    nullif(trim(coalesce(shipment_payload->>'shipped_by_name', '')), ''),
    nullif(trim(coalesce(shipment_payload->>'shipped_by_email', '')), ''),
    nullif(trim(coalesce(shipment_payload->>'shipped_by_role', '')), ''),
    next_note,
    coalesce(shipment_payload, '{}'::jsonb)
  )
  returning * into next_shipment;

  update public.shop_orders
    set shipping_carrier = coalesce(next_carrier, shipping_carrier),
        tracking_number = coalesce(next_tracking_number, tracking_number),
        order_status = case
          when order_status in ('completed', 'cancelled') then order_status
          else 'shipping'
        end,
        updated_at = now()
    where id = target_order.id;

  return jsonb_build_object(
    'shipment', row_to_json(next_shipment),
    'order_id', target_order.id,
    'order_number', target_order.order_number
  );
end;
$$;

revoke all on function public.create_shop_order_shipment(jsonb) from public;
revoke all on function public.create_shop_order_shipment(jsonb) from anon;
revoke all on function public.create_shop_order_shipment(jsonb) from authenticated;
grant execute on function public.create_shop_order_shipment(jsonb) to service_role;
