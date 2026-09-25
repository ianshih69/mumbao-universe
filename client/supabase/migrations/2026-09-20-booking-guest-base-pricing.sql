-- Local migration artifact only. Preserve existing rates, orders and discount rules.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
alter table public.booking_price_rule_sets add column guest_11_18_fee integer;
alter table public.booking_special_dates add column base_price_override integer;
do $$
declare
  rule record;
  kind text;
  base_amount integer;
  top_amount integer;
  step_amount integer;
  selected_step integer;
  row_count integer;
begin
  for rule in select id from public.booking_price_rule_sets loop
    selected_step := null;
    foreach kind in array array['weekday','friday','holiday'] loop
      select count(*), min(nightly_price) filter (where guest_count = 10),
        min(nightly_price) filter (where guest_count = 18)
      into row_count, base_amount, top_amount
      from public.booking_package_rates
      where rule_set_id = rule.id and day_type = kind and is_active;
      if row_count <> 9 or base_amount is null or top_amount is null
        or top_amount < base_amount or mod(top_amount - base_amount, 8) <> 0 then
        raise exception 'Guest pricing migration requires a complete linear matrix: rule %, type %', rule.id, kind;
      end if;
      step_amount := (top_amount - base_amount) / 8;
      if exists (
        select 1 from public.booking_package_rates
        where rule_set_id = rule.id and day_type = kind and is_active
          and nightly_price <> base_amount + (guest_count - 10) * step_amount
      ) or (selected_step is not null and selected_step <> step_amount) then
        raise exception 'Guest pricing migration requires one consistent increment: rule %, type %', rule.id, kind;
      end if;
      selected_step := step_amount;
    end loop;
    update public.booking_price_rule_sets set guest_11_18_fee = selected_step where id = rule.id;
  end loop;
end $$;
alter table public.booking_price_rule_sets
  -- Only future inserts that omit the field use this compatibility default.
  -- Existing rows above must pass matrix derivation, including inactive periods.
  alter column guest_11_18_fee set default 1250,
  alter column guest_11_18_fee set not null,
  add constraint booking_price_rule_sets_guest_fee_check check (guest_11_18_fee between 0 and 10000000);
alter table public.booking_special_dates
  add constraint booking_special_dates_base_override_check check (base_price_override > 0 and base_price_override <= 10000000);
comment on column public.booking_price_rule_sets.guest_11_18_fee is 'Configured nightly increment for guests 11-18 before existing discounts.';
comment on column public.booking_special_dates.base_price_override is 'Optional 10-person nightly base. NULL inherits the date-type base.';
comment on table public.booking_package_rates is 'guest_count=10 is the live base. Historical 11-18 rows are retained but not used by configured guest-fee pricing.';
commit;
