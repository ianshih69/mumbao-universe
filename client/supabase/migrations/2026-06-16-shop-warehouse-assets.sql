create table if not exists public.shop_warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  floor_label text not null,
  shelf_label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_supply_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_spec text,
  quantity integer not null default 0 check (quantity >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  location_code text not null references public.shop_warehouse_locations(code),
  unit_price numeric(12, 2),
  supplier text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_furniture_assets (
  id uuid primary key default gen_random_uuid(),
  asset_name text not null,
  asset_number text not null unique,
  original_amount numeric(12, 2),
  room_area text,
  brand_model text,
  vendor text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_housekeeping_records (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  room_area text not null,
  record_type text not null check (record_type in ('cleaning_completed', 'checkout_issue')),
  captured_at timestamptz not null default now(),
  note text,
  related_asset_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_warehouse_media (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('supply', 'furniture', 'housekeeping')),
  target_id uuid not null,
  r2_key text not null unique,
  public_url text not null,
  file_name text,
  content_type text,
  size integer,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.shop_housekeeping_records
  drop constraint if exists shop_housekeeping_records_related_asset_number_fkey;

alter table public.shop_housekeeping_records
  add constraint shop_housekeeping_records_related_asset_number_fkey
  foreign key (related_asset_number)
  references public.shop_furniture_assets(asset_number)
  on update cascade
  on delete set null;

alter table public.shop_supply_items
  drop constraint if exists shop_supply_items_unit_price_nonnegative_check;

alter table public.shop_supply_items
  add constraint shop_supply_items_unit_price_nonnegative_check
  check (unit_price is null or unit_price >= 0);

alter table public.shop_furniture_assets
  drop constraint if exists shop_furniture_assets_original_amount_nonnegative_check;

alter table public.shop_furniture_assets
  add constraint shop_furniture_assets_original_amount_nonnegative_check
  check (original_amount is null or original_amount >= 0);

alter table public.shop_warehouse_media
  drop constraint if exists shop_warehouse_media_size_nonnegative_check;

alter table public.shop_warehouse_media
  add constraint shop_warehouse_media_size_nonnegative_check
  check (size is null or size >= 0);

alter table public.shop_warehouse_media
  drop constraint if exists shop_warehouse_media_sort_order_nonnegative_check;

alter table public.shop_warehouse_media
  add constraint shop_warehouse_media_sort_order_nonnegative_check
  check (sort_order >= 0);

create or replace function public.set_shop_warehouse_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shop_warehouse_locations_updated_at
  on public.shop_warehouse_locations;

create trigger set_shop_warehouse_locations_updated_at
  before update on public.shop_warehouse_locations
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_shop_supply_items_updated_at
  on public.shop_supply_items;

create trigger set_shop_supply_items_updated_at
  before update on public.shop_supply_items
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_shop_furniture_assets_updated_at
  on public.shop_furniture_assets;

create trigger set_shop_furniture_assets_updated_at
  before update on public.shop_furniture_assets
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_shop_housekeeping_records_updated_at
  on public.shop_housekeeping_records;

create trigger set_shop_housekeeping_records_updated_at
  before update on public.shop_housekeeping_records
  for each row
  execute function public.set_shop_warehouse_updated_at();

create index if not exists shop_supply_items_location_idx
  on public.shop_supply_items (location_code);

create index if not exists shop_supply_items_quantity_idx
  on public.shop_supply_items (quantity, safety_stock);

create index if not exists shop_supply_items_name_idx
  on public.shop_supply_items (name);

create index if not exists shop_furniture_assets_search_idx
  on public.shop_furniture_assets (asset_name, asset_number, room_area);

create index if not exists shop_housekeeping_records_search_idx
  on public.shop_housekeeping_records (order_number, room_area, record_type, captured_at desc);

create index if not exists shop_warehouse_media_target_idx
  on public.shop_warehouse_media (target_type, target_id, sort_order);

alter table public.shop_warehouse_locations enable row level security;
alter table public.shop_supply_items enable row level security;
alter table public.shop_furniture_assets enable row level security;
alter table public.shop_housekeeping_records enable row level security;
alter table public.shop_warehouse_media enable row level security;

revoke all on table public.shop_warehouse_locations from public;
revoke all on table public.shop_supply_items from public;
revoke all on table public.shop_furniture_assets from public;
revoke all on table public.shop_housekeeping_records from public;
revoke all on table public.shop_warehouse_media from public;

revoke all on table public.shop_warehouse_locations from anon;
revoke all on table public.shop_supply_items from anon;
revoke all on table public.shop_furniture_assets from anon;
revoke all on table public.shop_housekeeping_records from anon;
revoke all on table public.shop_warehouse_media from anon;

revoke all on table public.shop_warehouse_locations from authenticated;
revoke all on table public.shop_supply_items from authenticated;
revoke all on table public.shop_furniture_assets from authenticated;
revoke all on table public.shop_housekeeping_records from authenticated;
revoke all on table public.shop_warehouse_media from authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shop_warehouse_locations to service_role;
grant select, insert, update, delete on table public.shop_supply_items to service_role;
grant select, insert, update, delete on table public.shop_furniture_assets to service_role;
grant select, insert, update, delete on table public.shop_housekeeping_records to service_role;
grant select, insert, update, delete on table public.shop_warehouse_media to service_role;

insert into public.shop_warehouse_locations (code, floor_label, shelf_label, sort_order)
values
  ('F1-L1', '一樓倉庫', 'L1', 1),
  ('F1-L2', '一樓倉庫', 'L2', 2),
  ('F1-L3', '一樓倉庫', 'L3', 3),
  ('F1-L4', '一樓倉庫', 'L4', 4),
  ('F1-L5', '一樓倉庫', 'L5', 5),
  ('F1-L6', '一樓倉庫', 'L6', 6),
  ('F1-L7', '一樓倉庫', 'L7', 7),
  ('F2-L1', '二樓倉庫', 'L1', 8),
  ('F2-L2', '二樓倉庫', 'L2', 9),
  ('F2-L3', '二樓倉庫', 'L3', 10),
  ('F2-L4', '二樓倉庫', 'L4', 11),
  ('F2-L5', '二樓倉庫', 'L5', 12),
  ('F2-L6', '二樓倉庫', 'L6', 13),
  ('F2-L7', '二樓倉庫', 'L7', 14)
on conflict (code) do update
set
  floor_label = excluded.floor_label,
  shelf_label = excluded.shelf_label,
  sort_order = excluded.sort_order,
  updated_at = now();
