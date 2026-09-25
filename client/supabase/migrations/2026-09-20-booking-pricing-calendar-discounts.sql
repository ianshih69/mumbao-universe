-- Apply AFTER 2026-09-20-booking-guest-base-pricing.sql, BEFORE deploying this application.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='booking_price_rule_sets' and column_name='guest_11_18_fee'
    and data_type='integer' and is_nullable='NO')
    or not exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='booking_special_dates' and column_name='base_price_override' and data_type='integer') then
    raise exception 'Apply booking-guest-base-pricing migration first';
  end if;
  if exists (select 1 from public.booking_price_rule_sets
    where guest_11_18_fee is null or guest_11_18_fee not between 0 and 10000000) then
    raise exception 'Guest pricing configuration is invalid; stop before calendar migration';
  end if;
end $$;

alter table public.booking_price_rule_sets
  add column weekday_discount_rate numeric(5,4) not null default 0.80 check (weekday_discount_rate between 0.01 and 1),
  add column friday_discount_rate numeric(5,4) not null default 0.90 check (friday_discount_rate between 0.01 and 1),
  add column saturday_discount_rate numeric(5,4) not null default 0.90 check (saturday_discount_rate between 0.01 and 1),
  add column holiday_discount_rate numeric(5,4) not null default 0.90 check (holiday_discount_rate between 0.01 and 1);
alter table public.booking_special_dates
  add column calendar_discount_rate_override numeric(5,4)
    check (calendar_discount_rate_override between 0.01 and 1);

comment on column public.booking_special_dates.calendar_discount_rate_override is 'NULL inherits the calendar discount; applies to lodging before the existing consecutive-stay discount.';
commit;
