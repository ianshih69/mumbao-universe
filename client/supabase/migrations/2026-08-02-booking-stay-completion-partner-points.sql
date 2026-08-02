alter table public.booking_requests
  add column if not exists customer_profile_id uuid
    references public.shop_customer_profiles(id) on update cascade on delete set null,
  add column if not exists final_lodging_amount integer,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_admin_id uuid,
  add column if not exists partner_points_awarded_at timestamptz,
  add column if not exists partner_points_awarded_to_profile_id uuid
    references public.shop_customer_profiles(id) on update cascade on delete set null,
  add column if not exists partner_points_ledger_id uuid
    references public.member_points_ledger(id) on update cascade on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'booking_requests_final_lodging_amount_nonnegative_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_final_lodging_amount_nonnegative_check
      check (final_lodging_amount is null or final_lodging_amount >= 0);
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'booking_requests_completed_by_admin_id_fkey'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'booking_requests_completed_by_admin_id_fkey'
        and conrelid = 'public.booking_requests'::regclass
        and confrelid = 'public.admin_profiles'::regclass
        and confupdtype = 'c'
        and confdeltype = 'n'
    ) then
      alter table public.booking_requests
        drop constraint booking_requests_completed_by_admin_id_fkey;

      alter table public.booking_requests
        add constraint booking_requests_completed_by_admin_id_fkey
        foreign key (completed_by_admin_id)
        references public.admin_profiles(id)
        on update cascade
        on delete set null;
    end if;
  else
    alter table public.booking_requests
      add constraint booking_requests_completed_by_admin_id_fkey
      foreign key (completed_by_admin_id)
      references public.admin_profiles(id)
      on update cascade
      on delete set null;
  end if;
end $$;

alter table public.member_points_ledger
  add column if not exists source_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_points_ledger_source_type_check'
      and conrelid = 'public.member_points_ledger'::regclass
  ) then
    alter table public.member_points_ledger
      add constraint member_points_ledger_source_type_check
      check (source_type is null or source_type in ('booking_stay_reward'));
  end if;
end $$;

create index if not exists booking_requests_customer_profile_id_idx
  on public.booking_requests(customer_profile_id);

create index if not exists booking_requests_completed_at_idx
  on public.booking_requests(completed_at desc);

create index if not exists booking_requests_completed_by_admin_id_idx
  on public.booking_requests(completed_by_admin_id);

create index if not exists booking_requests_partner_points_awarded_to_profile_id_idx
  on public.booking_requests(partner_points_awarded_to_profile_id);

create index if not exists member_points_ledger_source_type_order_idx
  on public.member_points_ledger(source_type, source_order_id);

create unique index if not exists member_points_ledger_booking_reward_source_unique_idx
  on public.member_points_ledger(source_order_id)
  where source_type = 'booking_stay_reward'
    and source_order_id is not null;

create or replace function public.complete_booking_stay_with_partner_points(
  p_booking_id uuid,
  p_final_lodging_amount integer,
  p_completed_by_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.booking_requests%rowtype;
  v_customer public.shop_customer_profiles%rowtype;
  v_diamond public.member_diamond_profiles%rowtype;
  v_existing_ledger public.member_points_ledger%rowtype;
  v_ledger public.member_points_ledger%rowtype;
  v_source text;
  v_coupon_key text;
  v_now timestamptz := now();
  v_points integer;
  v_description text;
begin
  if p_booking_id is null then
    raise exception '找不到此住宿訂單。';
  end if;

  if p_completed_by_admin_id is null or not exists (
    select 1 from public.admin_profiles where id = p_completed_by_admin_id
  ) then
    raise exception '找不到執行操作的管理員。';
  end if;

  if p_final_lodging_amount is null
    or p_final_lodging_amount <= 0
    or p_final_lodging_amount > 10000000
  then
    raise exception '請輸入大於 0 且不超過 NT$10,000,000 的整數住宿房費。';
  end if;

  select *
    into v_booking
    from public.booking_requests
   where id = p_booking_id
   for update;

  if v_booking.id is null then
    raise exception '找不到此住宿訂單。';
  end if;

  if v_booking.completed_at is not null then
    return jsonb_build_object(
      'code', 'BOOKING_STAY_ALREADY_COMPLETED',
      'booking_id', v_booking.id,
      'points_award', jsonb_build_object(
        'awarded', false,
        'reason', 'already_completed',
        'points', 0,
        'ledger_id', v_booking.partner_points_ledger_id,
        'diamond_customer_profile_id', v_booking.partner_points_awarded_to_profile_id
      )
    );
  end if;

  v_source := lower(trim(coalesce(v_booking.source, '')));
  if v_source not in ('official_site', 'website', 'line', 'phone', 'manual', 'admin') then
    raise exception '此訂單來源不符合合作回饋資格。';
  end if;

  if v_booking.customer_profile_id is not null then
    select *
      into v_customer
      from public.shop_customer_profiles
     where id = v_booking.customer_profile_id
     for update;
  end if;

  if v_customer.id is null and nullif(trim(coalesce(v_booking.guest_email, '')), '') is not null then
    select *
      into v_customer
      from public.shop_customer_profiles
     where lower(trim(email)) = lower(trim(v_booking.guest_email))
     order by created_at asc
     limit 1
     for update;
  end if;

  if v_customer.id is null then
    raise exception '找不到此訂單對應的會員資料。';
  end if;

  v_coupon_key := lower(trim(coalesce(v_customer.coupon_code, '')));
  if v_coupon_key = '' then
    raise exception '此會員尚未綁定有效合作優惠碼。';
  end if;

  select mdp.*
    into v_diamond
    from public.member_diamond_profiles mdp
    join public.shop_customer_profiles diamond_customer
      on diamond_customer.id = mdp.customer_profile_id
   where lower(trim(coalesce(mdp.exclusive_code, ''))) = v_coupon_key
     and mdp.partnership_status = 'active'
     and diamond_customer.member_level = 'diamond'
   limit 1
   for update of mdp;

  if v_diamond.id is null then
    raise exception '此合作優惠碼目前無效或未啟用。';
  end if;

  select *
    into v_existing_ledger
    from public.member_points_ledger
   where source_type = 'booking_stay_reward'
     and source_order_id = v_booking.id
   limit 1
   for update;

  if v_booking.partner_points_ledger_id is not null or v_existing_ledger.id is not null then
    raise exception '此住宿訂單已發放過合作回饋積分。';
  end if;

  v_points := floor(p_final_lodging_amount * 5 / 100);
  if v_points <= 0 then
    raise exception '合作回饋積分計算結果為 0，不能發放。';
  end if;

  v_description := '訂單 '
    || v_booking.id::text
    || ' 完成住宿，住宿房費 NT$'
    || trim(to_char(p_final_lodging_amount, 'FM999G999G999G999'))
    || ' × 5%';

  insert into public.member_points_ledger (
    customer_profile_id,
    points,
    description,
    source_order_id,
    source_type,
    created_by_admin_id,
    created_at
  )
  values (
    v_diamond.customer_profile_id,
    v_points,
    v_description,
    v_booking.id,
    'booking_stay_reward',
    p_completed_by_admin_id,
    v_now
  )
  returning * into v_ledger;

  update public.booking_requests
     set final_lodging_amount = p_final_lodging_amount,
         completed_at = v_now,
         completed_by_admin_id = p_completed_by_admin_id,
         customer_profile_id = v_customer.id,
         partner_points_awarded_at = v_now,
         partner_points_awarded_to_profile_id = v_diamond.customer_profile_id,
         partner_points_ledger_id = v_ledger.id,
         updated_at = v_now
   where id = v_booking.id
   returning * into v_booking;

  return jsonb_build_object(
    'code', 'BOOKING_STAY_COMPLETED',
    'booking_id', v_booking.id,
    'points_award', jsonb_build_object(
      'awarded', true,
      'reason', 'eligible',
      'points', v_ledger.points,
      'ledger_id', v_ledger.id,
      'diamond_customer_profile_id', v_ledger.customer_profile_id
    )
  );
end;
$$;

revoke execute on function public.complete_booking_stay_with_partner_points(uuid, integer, uuid)
  from public;

revoke execute on function public.complete_booking_stay_with_partner_points(uuid, integer, uuid)
  from anon;

revoke execute on function public.complete_booking_stay_with_partner_points(uuid, integer, uuid)
  from authenticated;

grant execute on function public.complete_booking_stay_with_partner_points(uuid, integer, uuid)
  to service_role;
