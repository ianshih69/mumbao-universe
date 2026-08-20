-- Update the trial booking pricing rule set deposit from 30% to 50%.
-- Safe to rerun: it only touches the intended active rule set when needed.
update public.booking_price_rule_sets
set deposit_rate = 0.50,
    updated_at = now()
where name = '試營運包棟房價'
  and effective_from = '2026-11-01'
  and effective_to = '2027-02-01'
  and is_active = true
  and deposit_rate is distinct from 0.50;
