create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter database booking_payment_test set search_path = "$user", public, extensions;
set search_path = "$user", public, extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create table public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  email text,
  display_name text,
  role_code text,
  is_active boolean not null default true
);

create or replace function public.set_booking_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.booking_external_reservations (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  reference_number text,
  check_in date not null,
  check_out date not null,
  guest_name text,
  guest_count integer,
  amount numeric,
  status text not null default 'confirmed',
  accommodation_name text,
  confidence integer,
  raw_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_external_reservations_date_check check (check_out > check_in),
  constraint booking_external_reservations_status_check
    check (status in ('confirmed', 'cancelled', 'pending_review'))
);

create table public.booking_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null default 'manual',
  source text not null default 'manual',
  check_in date not null,
  check_out date not null,
  status text not null default 'confirmed',
  title text,
  notes text,
  ical_uid text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_availability_blocks_date_check check (check_out > check_in),
  constraint booking_availability_blocks_status_check
    check (status in ('confirmed', 'cancelled', 'pending_review'))
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  guest_count integer not null,
  notes text,
  stay_type text not null default 'villa',
  adults integer not null default 1,
  children integer not null default 0,
  room_count integer,
  has_pets boolean not null default false,
  pet_count integer,
  pet_type text,
  pet_notes text,
  source text not null default 'official_site',
  raw_payload jsonb not null default '{}'::jsonb,
  selected_package_type text,
  pricing_rule_set_id uuid,
  quoted_total integer,
  deposit_rate numeric,
  deposit_amount integer,
  balance_amount integer,
  pricing_breakdown jsonb not null default '{}'::jsonb,
  quoted_at timestamptz,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_date_check check (check_out > check_in),
  constraint booking_requests_status_check
    check (status in ('pending_review', 'confirmed', 'cancelled'))
);

create trigger set_booking_requests_updated_at
  before update on public.booking_requests
  for each row
  execute function public.set_booking_updated_at();

create trigger set_booking_availability_blocks_updated_at
  before update on public.booking_availability_blocks
  for each row
  execute function public.set_booking_updated_at();

create trigger set_booking_external_reservations_updated_at
  before update on public.booking_external_reservations
  for each row
  execute function public.set_booking_updated_at();

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.admin_profiles to service_role;
grant select, insert, update, delete on table public.booking_external_reservations to service_role;
grant select, insert, update, delete on table public.booking_availability_blocks to service_role;
grant select, insert, update, delete on table public.booking_requests to service_role;
