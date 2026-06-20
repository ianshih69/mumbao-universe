create extension if not exists pgcrypto;

create table if not exists public.shop_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on update cascade on delete cascade,
  email text not null,
  name text,
  phone text,
  default_postal_code text,
  default_city text,
  default_district text,
  default_address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_customer_profiles_email_lower_check check (email = lower(email))
);

create index if not exists shop_customer_profiles_email_idx
  on public.shop_customer_profiles(email);

drop trigger if exists set_shop_customer_profiles_updated_at on public.shop_customer_profiles;
create trigger set_shop_customer_profiles_updated_at
  before update on public.shop_customer_profiles
  for each row
  execute function public.set_shop_warehouse_updated_at();

alter table public.shop_customer_profiles enable row level security;

revoke all on table public.shop_customer_profiles from public;
revoke all on table public.shop_customer_profiles from anon;
revoke all on table public.shop_customer_profiles from authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shop_customer_profiles to service_role;
