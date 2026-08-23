-- Revert the trial booking pricing rule set deposit from 50% to 30%.
-- Safe to rerun: it only touches the intended active rule set while it is still at 50%.
update public.booking_price_rule_sets
set deposit_rate = 0.30,
    updated_at = now()
where name = '試營運包棟房價'
  and effective_from = '2026-11-01'
  and effective_to = '2027-02-01'
  and is_active = true
  and deposit_rate = 0.50;
