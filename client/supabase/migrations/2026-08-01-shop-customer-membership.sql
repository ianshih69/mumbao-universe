alter table public.shop_customer_profiles
  add column if not exists member_level text not null default 'normal',
  add column if not exists admin_note text,
  add column if not exists admin_note_updated_at timestamptz,
  add column if not exists admin_note_updated_by uuid references public.admin_profiles(id) on update cascade on delete set null,
  add column if not exists coupon_code text,
  add column if not exists coupon_bound_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shop_customer_profiles_member_level_check'
      and conrelid = 'public.shop_customer_profiles'::regclass
  ) then
    alter table public.shop_customer_profiles
      add constraint shop_customer_profiles_member_level_check
      check (member_level in ('normal', 'vip', 'diamond'));
  end if;
end $$;

create index if not exists shop_customer_profiles_member_level_idx
  on public.shop_customer_profiles(member_level);

create index if not exists shop_customer_profiles_admin_note_updated_by_idx
  on public.shop_customer_profiles(admin_note_updated_by);

create table if not exists public.member_diamond_profiles (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null unique references public.shop_customer_profiles(id) on update cascade on delete cascade,
  partner_name text,
  exclusive_code text,
  partnership_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_diamond_profiles_partnership_status_check
    check (partnership_status in ('active', 'paused', 'ended'))
);

create index if not exists member_diamond_profiles_customer_profile_id_idx
  on public.member_diamond_profiles(customer_profile_id);

do $$
declare
  duplicate_codes text;
begin
  select string_agg(normalized_code, ', ' order by normalized_code)
    into duplicate_codes
  from (
    select lower(trim(exclusive_code)) as normalized_code
    from public.member_diamond_profiles
    where exclusive_code is not null
      and trim(exclusive_code) <> ''
    group by lower(trim(exclusive_code))
    having count(*) > 1
  ) duplicates;

  if duplicate_codes is not null then
    raise exception
      'Cannot create member_diamond_profiles_exclusive_code_unique_idx: duplicate normalized exclusive codes exist: %',
      duplicate_codes;
  end if;
end $$;

create unique index if not exists member_diamond_profiles_exclusive_code_unique_idx
  on public.member_diamond_profiles((lower(trim(exclusive_code))))
  where exclusive_code is not null
    and trim(exclusive_code) <> '';

drop trigger if exists set_member_diamond_profiles_updated_at on public.member_diamond_profiles;
create trigger set_member_diamond_profiles_updated_at
  before update on public.member_diamond_profiles
  for each row
  execute function public.set_shop_warehouse_updated_at();

create table if not exists public.member_points_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null,
  points integer not null,
  description text not null,
  source_order_id uuid,
  created_by_admin_id uuid references public.admin_profiles(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  constraint member_points_ledger_customer_profile_id_fkey
    foreign key (customer_profile_id)
    references public.shop_customer_profiles(id)
    on update cascade
    on delete restrict,
  constraint member_points_ledger_points_nonzero_check
    check (points <> 0)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'member_points_ledger_customer_profile_id_fkey'
      and conrelid = 'public.member_points_ledger'::regclass
      and confdeltype = 'c'
  ) then
    alter table public.member_points_ledger
      drop constraint member_points_ledger_customer_profile_id_fkey;

    alter table public.member_points_ledger
      add constraint member_points_ledger_customer_profile_id_fkey
      foreign key (customer_profile_id)
      references public.shop_customer_profiles(id)
      on update cascade
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_points_ledger_points_nonzero_check'
      and conrelid = 'public.member_points_ledger'::regclass
  ) then
    alter table public.member_points_ledger
      add constraint member_points_ledger_points_nonzero_check
      check (points <> 0);
  end if;
end $$;

create index if not exists member_points_ledger_customer_profile_created_at_idx
  on public.member_points_ledger(customer_profile_id, created_at desc);

create index if not exists member_points_ledger_source_order_id_idx
  on public.member_points_ledger(source_order_id);

create index if not exists member_points_ledger_created_by_admin_id_idx
  on public.member_points_ledger(created_by_admin_id);

alter table public.member_diamond_profiles enable row level security;
alter table public.member_points_ledger enable row level security;

revoke all on table public.member_diamond_profiles from public, anon, authenticated;
revoke all on table public.member_points_ledger from public, anon, authenticated;

grant select, insert, update, delete on table public.member_diamond_profiles to service_role;
grant select, insert, update, delete on table public.member_points_ledger to service_role;
