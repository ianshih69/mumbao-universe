create extension if not exists pgcrypto;

create table if not exists public.booking_price_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  effective_from date not null,
  effective_to date not null,
  deposit_rate numeric(5, 4) not null default 0.30,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_price_rule_sets_dates_check check (effective_to >= effective_from),
  constraint booking_price_rule_sets_deposit_rate_check check (deposit_rate >= 0 and deposit_rate <= 1)
);

create table if not exists public.booking_package_rates (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.booking_price_rule_sets(id) on update cascade on delete cascade,
  guest_count integer not null,
  day_type text not null,
  nightly_price integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_package_rates_guest_count_check check (guest_count between 10 and 18),
  constraint booking_package_rates_day_type_check check (day_type in ('weekday', 'friday', 'holiday')),
  constraint booking_package_rates_nightly_price_check check (nightly_price >= 0),
  constraint booking_package_rates_unique unique (rule_set_id, guest_count, day_type)
);

create table if not exists public.booking_special_dates (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.booking_price_rule_sets(id) on update cascade on delete cascade,
  date date not null,
  day_type text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_special_dates_day_type_check check (day_type in ('weekday', 'friday', 'holiday'))
);

create unique index if not exists booking_special_dates_active_unique_idx
  on public.booking_special_dates(rule_set_id, date)
  where is_active;

create index if not exists booking_price_rule_sets_active_dates_idx
  on public.booking_price_rule_sets(is_active, effective_from, effective_to);

create index if not exists booking_package_rates_rule_set_idx
  on public.booking_package_rates(rule_set_id, guest_count, day_type)
  where is_active;

create index if not exists booking_special_dates_rule_set_date_idx
  on public.booking_special_dates(rule_set_id, date)
  where is_active;

alter table public.booking_requests
  add column if not exists selected_package_type text,
  add column if not exists pricing_rule_set_id uuid references public.booking_price_rule_sets(id) on update cascade on delete set null,
  add column if not exists quoted_total integer,
  add column if not exists deposit_rate numeric(5, 4),
  add column if not exists deposit_amount integer,
  add column if not exists balance_amount integer,
  add column if not exists pricing_breakdown jsonb,
  add column if not exists quoted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_selected_package_type_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_selected_package_type_check
      check (selected_package_type is null or selected_package_type in ('villa_10', 'villa_18'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_quote_amounts_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_quote_amounts_check
      check (
        (quoted_total is null or quoted_total >= 0)
        and (deposit_amount is null or deposit_amount >= 0)
        and (balance_amount is null or balance_amount >= 0)
        and (deposit_rate is null or (deposit_rate >= 0 and deposit_rate <= 1))
        and (
          quoted_total is null
          or deposit_amount is null
          or balance_amount is null
          or deposit_amount + balance_amount = quoted_total
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_price_rule_sets_updated_at'
      and tgrelid = 'public.booking_price_rule_sets'::regclass
  ) then
    create trigger set_booking_price_rule_sets_updated_at
      before update on public.booking_price_rule_sets
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_package_rates_updated_at'
      and tgrelid = 'public.booking_package_rates'::regclass
  ) then
    create trigger set_booking_package_rates_updated_at
      before update on public.booking_package_rates
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_special_dates_updated_at'
      and tgrelid = 'public.booking_special_dates'::regclass
  ) then
    create trigger set_booking_special_dates_updated_at
      before update on public.booking_special_dates
      for each row
      execute function public.set_booking_updated_at();
  end if;
end $$;

alter table public.booking_price_rule_sets enable row level security;
alter table public.booking_package_rates enable row level security;
alter table public.booking_special_dates enable row level security;

revoke all on table public.booking_price_rule_sets from public, anon, authenticated;
revoke all on table public.booking_package_rates from public, anon, authenticated;
revoke all on table public.booking_special_dates from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.booking_price_rule_sets to service_role;
grant select, insert, update, delete on table public.booking_package_rates to service_role;
grant select, insert, update, delete on table public.booking_special_dates to service_role;

insert into public.booking_price_rule_sets (
  id,
  name,
  effective_from,
  effective_to,
  deposit_rate,
  is_active,
  notes
)
values (
  '00000000-0000-4000-8000-000000000110',
  '試營運包棟房價',
  '2026-11-01',
  '2027-02-01',
  0.30,
  true,
  'Initial official villa pricing matrix for trial operation.'
)
on conflict (id) do nothing;

insert into public.booking_package_rates (
  rule_set_id,
  guest_count,
  day_type,
  nightly_price
)
values
  ('00000000-0000-4000-8000-000000000110', 10, 'weekday', 25000),
  ('00000000-0000-4000-8000-000000000110', 10, 'friday', 32000),
  ('00000000-0000-4000-8000-000000000110', 10, 'holiday', 39000),
  ('00000000-0000-4000-8000-000000000110', 11, 'weekday', 26250),
  ('00000000-0000-4000-8000-000000000110', 11, 'friday', 33250),
  ('00000000-0000-4000-8000-000000000110', 11, 'holiday', 40250),
  ('00000000-0000-4000-8000-000000000110', 12, 'weekday', 27500),
  ('00000000-0000-4000-8000-000000000110', 12, 'friday', 34500),
  ('00000000-0000-4000-8000-000000000110', 12, 'holiday', 41500),
  ('00000000-0000-4000-8000-000000000110', 13, 'weekday', 28750),
  ('00000000-0000-4000-8000-000000000110', 13, 'friday', 35750),
  ('00000000-0000-4000-8000-000000000110', 13, 'holiday', 42750),
  ('00000000-0000-4000-8000-000000000110', 14, 'weekday', 30000),
  ('00000000-0000-4000-8000-000000000110', 14, 'friday', 37000),
  ('00000000-0000-4000-8000-000000000110', 14, 'holiday', 44000),
  ('00000000-0000-4000-8000-000000000110', 15, 'weekday', 31250),
  ('00000000-0000-4000-8000-000000000110', 15, 'friday', 38250),
  ('00000000-0000-4000-8000-000000000110', 15, 'holiday', 45250),
  ('00000000-0000-4000-8000-000000000110', 16, 'weekday', 32500),
  ('00000000-0000-4000-8000-000000000110', 16, 'friday', 39500),
  ('00000000-0000-4000-8000-000000000110', 16, 'holiday', 46500),
  ('00000000-0000-4000-8000-000000000110', 17, 'weekday', 33750),
  ('00000000-0000-4000-8000-000000000110', 17, 'friday', 40750),
  ('00000000-0000-4000-8000-000000000110', 17, 'holiday', 47750),
  ('00000000-0000-4000-8000-000000000110', 18, 'weekday', 35000),
  ('00000000-0000-4000-8000-000000000110', 18, 'friday', 42000),
  ('00000000-0000-4000-8000-000000000110', 18, 'holiday', 49000)
on conflict (rule_set_id, guest_count, day_type) do nothing;
