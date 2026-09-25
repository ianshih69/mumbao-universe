-- DATA ACTIVATION ONLY: separately authorize AFTER schema migrations and app rollout.
-- This changes date classification for old and new engines; never bundle with schema expansion.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
-- Keep the collision check and insert stable against concurrent Admin writes.
lock table public.booking_price_rule_sets, public.booking_special_dates in share row exclusive mode;
do $$ begin
  if exists (select 1 from public.booking_special_dates
    where date=date '2026-12-31' and day_type <> 'holiday') then
    raise exception '2026-12-31 has a non-holiday override; review before seed';
  end if;
  if exists (select 1 from public.booking_special_dates
    where date=date '2026-12-31' and not is_active) then
    raise exception '2026-12-31 has an inactive override; review before seed';
  end if;
  if exists (select 1 from public.booking_special_dates
    where date=date '2026-12-31' group by rule_set_id,date having count(*) > 1) then
    raise exception '2026-12-31 has conflicting duplicate rows; review before seed';
  end if;
  if exists (select 1 from public.booking_price_rule_sets a
    join public.booking_price_rule_sets b on a.id < b.id
    where a.is_active and b.is_active
      and date '2026-12-31' between a.effective_from and a.effective_to
      and date '2026-12-31' between b.effective_from and b.effective_to) then
    raise exception '2026-12-31 has overlapping active rule sets; review before seed';
  end if;
end $$;
insert into public.booking_special_dates (rule_set_id,date,day_type,label,is_active)
select r.id,date '2026-12-31','holiday','跨年假日',true
from public.booking_price_rule_sets r
where r.is_active and date '2026-12-31' between r.effective_from and r.effective_to
  and not exists (select 1 from public.booking_special_dates s
    where s.rule_set_id=r.id and s.date=date '2026-12-31');
commit;
