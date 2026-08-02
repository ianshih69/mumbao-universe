alter table public.member_points_ledger
  add column if not exists source_type text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'member_points_ledger_source_type_check'
      and conrelid = 'public.member_points_ledger'::regclass
  ) then
    alter table public.member_points_ledger
      drop constraint member_points_ledger_source_type_check;
  end if;

  update public.member_points_ledger
     set source_type = 'redemption'
   where source_type = 'points_redemption';

  alter table public.member_points_ledger
    add constraint member_points_ledger_source_type_check
    check (source_type is null or source_type in ('booking_stay_reward', 'redemption'));
end $$;

create table if not exists public.member_points_redemption_requests (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null,
  points integer not null,
  bank_name text not null,
  account_holder text not null,
  account_number text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_admin_id uuid,
  rejected_at timestamptz,
  rejected_by_admin_id uuid,
  rejection_reason text,
  ledger_id uuid,
  constraint member_points_redemption_requests_customer_profile_id_fkey
    foreign key (customer_profile_id)
    references public.shop_customer_profiles(id)
    on update cascade
    on delete restrict,
  constraint member_points_redemption_requests_completed_by_admin_id_fkey
    foreign key (completed_by_admin_id)
    references public.admin_profiles(id)
    on update cascade
    on delete set null,
  constraint member_points_redemption_requests_rejected_by_admin_id_fkey
    foreign key (rejected_by_admin_id)
    references public.admin_profiles(id)
    on update cascade
    on delete set null,
  constraint member_points_redemption_requests_ledger_id_fkey
    foreign key (ledger_id)
    references public.member_points_ledger(id)
    on update cascade
    on delete restrict,
  constraint member_points_redemption_requests_points_positive_check
    check (points > 0),
  constraint member_points_redemption_requests_status_check
    check (status in ('pending', 'completed', 'rejected')),
  constraint member_points_redemption_requests_bank_name_nonblank_check
    check (trim(bank_name) <> ''),
  constraint member_points_redemption_requests_account_holder_nonblank_check
    check (trim(account_holder) <> ''),
  constraint member_points_redemption_requests_account_number_nonblank_check
    check (trim(account_number) <> '')
);

create index if not exists member_points_redemption_requests_customer_requested_idx
  on public.member_points_redemption_requests(customer_profile_id, requested_at desc);

create index if not exists member_points_redemption_requests_status_requested_idx
  on public.member_points_redemption_requests(status, requested_at desc);

create index if not exists member_points_redemption_requests_completed_by_admin_idx
  on public.member_points_redemption_requests(completed_by_admin_id);

create index if not exists member_points_redemption_requests_rejected_by_admin_idx
  on public.member_points_redemption_requests(rejected_by_admin_id);

create unique index if not exists member_points_redemption_requests_ledger_id_unique_idx
  on public.member_points_redemption_requests(ledger_id)
  where ledger_id is not null;

drop index if exists public.member_points_ledger_redemption_source_unique_idx;

create unique index if not exists member_points_ledger_redemption_source_unique_idx
  on public.member_points_ledger(source_order_id)
  where source_type = 'redemption'
    and source_order_id is not null;

alter table public.member_points_redemption_requests enable row level security;

revoke all on table public.member_points_redemption_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.member_points_redemption_requests to service_role;

create or replace function public.create_member_points_redemption_request(
  p_customer_profile_id uuid,
  p_points integer,
  p_bank_name text,
  p_account_holder text,
  p_account_number text
)
returns public.member_points_redemption_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.shop_customer_profiles%rowtype;
  v_total_points integer;
  v_pending_points integer;
  v_available_points integer;
  v_request public.member_points_redemption_requests%rowtype;
begin
  if p_customer_profile_id is null then
    raise exception 'MEMBER_PROFILE_REQUIRED';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'INVALID_REDEMPTION_POINTS';
  end if;

  if trim(coalesce(p_bank_name, '')) = ''
    or trim(coalesce(p_account_holder, '')) = ''
    or trim(coalesce(p_account_number, '')) = ''
  then
    raise exception 'REDEMPTION_BANK_FIELDS_REQUIRED';
  end if;

  select *
    into v_profile
    from public.shop_customer_profiles
   where id = p_customer_profile_id
   for update;

  if v_profile.id is null then
    raise exception 'MEMBER_PROFILE_NOT_FOUND';
  end if;

  if v_profile.member_level <> 'diamond' then
    raise exception 'REDEMPTION_DIAMOND_ONLY';
  end if;

  perform 1
    from public.member_points_redemption_requests
   where customer_profile_id = p_customer_profile_id
     and status = 'pending'
   for update;

  select coalesce(sum(points), 0)
    into v_total_points
    from public.member_points_ledger
   where customer_profile_id = p_customer_profile_id;

  select coalesce(sum(points), 0)
    into v_pending_points
    from public.member_points_redemption_requests
   where customer_profile_id = p_customer_profile_id
     and status = 'pending';

  v_available_points := greatest(0, v_total_points - v_pending_points);

  if p_points > v_available_points then
    raise exception 'REDEMPTION_POINTS_EXCEED_AVAILABLE';
  end if;

  insert into public.member_points_redemption_requests (
    customer_profile_id,
    points,
    bank_name,
    account_holder,
    account_number,
    status,
    requested_at
  )
  values (
    p_customer_profile_id,
    p_points,
    trim(p_bank_name),
    trim(p_account_holder),
    trim(p_account_number),
    'pending',
    now()
  )
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.complete_member_points_redemption_request(
  p_request_id uuid,
  p_completed_by_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.member_points_redemption_requests%rowtype;
  v_admin public.admin_profiles%rowtype;
  v_ledger public.member_points_ledger%rowtype;
  v_total_points integer;
begin
  if p_request_id is null then
    raise exception 'REDEMPTION_REQUEST_NOT_FOUND';
  end if;

  select *
    into v_admin
    from public.admin_profiles
   where id = p_completed_by_admin_id
     and is_active is true;

  if v_admin.id is null then
    raise exception 'ADMIN_PROFILE_NOT_FOUND';
  end if;

  select *
    into v_request
    from public.member_points_redemption_requests
   where id = p_request_id
   for update;

  if v_request.id is null then
    raise exception 'REDEMPTION_REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REDEMPTION_REQUEST_NOT_PENDING';
  end if;

  if v_request.ledger_id is not null then
    raise exception 'REDEMPTION_LEDGER_ALREADY_EXISTS';
  end if;

  perform 1
    from public.shop_customer_profiles
   where id = v_request.customer_profile_id
   for update;

  select coalesce(sum(points), 0)
    into v_total_points
    from public.member_points_ledger
   where customer_profile_id = v_request.customer_profile_id;

  if v_total_points < v_request.points then
    raise exception 'REDEMPTION_POINTS_EXCEED_AVAILABLE';
  end if;

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
    v_request.customer_profile_id,
    -v_request.points,
    '合作回饋兌換已完成',
    v_request.id,
    'redemption',
    p_completed_by_admin_id,
    now()
  )
  returning * into v_ledger;

  update public.member_points_redemption_requests
     set status = 'completed',
         completed_at = now(),
         completed_by_admin_id = p_completed_by_admin_id,
         ledger_id = v_ledger.id
   where id = v_request.id
   returning * into v_request;

  return jsonb_build_object(
    'code', 'REDEMPTION_COMPLETED',
    'request_id', v_request.id,
    'ledger_id', v_ledger.id,
    'points', v_request.points
  );
end;
$$;

create or replace function public.reject_member_points_redemption_request(
  p_request_id uuid,
  p_rejected_by_admin_id uuid,
  p_rejection_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.member_points_redemption_requests%rowtype;
  v_admin public.admin_profiles%rowtype;
begin
  if p_request_id is null then
    raise exception 'REDEMPTION_REQUEST_NOT_FOUND';
  end if;

  if trim(coalesce(p_rejection_reason, '')) = '' then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;

  select *
    into v_admin
    from public.admin_profiles
   where id = p_rejected_by_admin_id
     and is_active is true;

  if v_admin.id is null then
    raise exception 'ADMIN_PROFILE_NOT_FOUND';
  end if;

  select *
    into v_request
    from public.member_points_redemption_requests
   where id = p_request_id
   for update;

  if v_request.id is null then
    raise exception 'REDEMPTION_REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REDEMPTION_REQUEST_NOT_PENDING';
  end if;

  update public.member_points_redemption_requests
     set status = 'rejected',
         rejected_at = now(),
         rejected_by_admin_id = p_rejected_by_admin_id,
         rejection_reason = trim(p_rejection_reason)
   where id = v_request.id
   returning * into v_request;

  return jsonb_build_object(
    'code', 'REDEMPTION_REJECTED',
    'request_id', v_request.id
  );
end;
$$;

create or replace function public.adjust_member_points_with_redemption_reserve(
  p_customer_profile_id uuid,
  p_points integer,
  p_description text,
  p_source_order_id uuid,
  p_created_by_admin_id uuid
)
returns public.member_points_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.shop_customer_profiles%rowtype;
  v_admin public.admin_profiles%rowtype;
  v_total_points integer;
  v_pending_points integer;
  v_ledger public.member_points_ledger%rowtype;
begin
  if p_customer_profile_id is null then
    raise exception 'MEMBER_PROFILE_REQUIRED';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'INVALID_POINTS';
  end if;

  if trim(coalesce(p_description, '')) = '' then
    raise exception 'POINTS_DESCRIPTION_REQUIRED';
  end if;

  select *
    into v_admin
    from public.admin_profiles
   where id = p_created_by_admin_id
     and is_active is true;

  if v_admin.id is null then
    raise exception 'ADMIN_PROFILE_NOT_FOUND';
  end if;

  select *
    into v_profile
    from public.shop_customer_profiles
   where id = p_customer_profile_id
   for update;

  if v_profile.id is null then
    raise exception 'MEMBER_PROFILE_NOT_FOUND';
  end if;

  if v_profile.member_level <> 'diamond' then
    raise exception 'MEMBER_POINTS_DIAMOND_ONLY';
  end if;

  perform 1
    from public.member_points_redemption_requests
   where customer_profile_id = p_customer_profile_id
     and status = 'pending'
   for update;

  select coalesce(sum(points), 0)
    into v_total_points
    from public.member_points_ledger
   where customer_profile_id = p_customer_profile_id;

  select coalesce(sum(points), 0)
    into v_pending_points
    from public.member_points_redemption_requests
   where customer_profile_id = p_customer_profile_id
     and status = 'pending';

  if p_points < 0 and (v_total_points + p_points) < v_pending_points then
    raise exception 'MEMBER_POINTS_RESERVED_BALANCE_NEGATIVE';
  end if;

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
    p_customer_profile_id,
    p_points,
    trim(p_description),
    p_source_order_id,
    null,
    p_created_by_admin_id,
    now()
  )
  returning * into v_ledger;

  return v_ledger;
end;
$$;

revoke execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)
  from public;
revoke execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)
  from anon;
revoke execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)
  from authenticated;
grant execute on function public.create_member_points_redemption_request(uuid, integer, text, text, text)
  to service_role;

revoke execute on function public.complete_member_points_redemption_request(uuid, uuid)
  from public;
revoke execute on function public.complete_member_points_redemption_request(uuid, uuid)
  from anon;
revoke execute on function public.complete_member_points_redemption_request(uuid, uuid)
  from authenticated;
grant execute on function public.complete_member_points_redemption_request(uuid, uuid)
  to service_role;

revoke execute on function public.reject_member_points_redemption_request(uuid, uuid, text)
  from public;
revoke execute on function public.reject_member_points_redemption_request(uuid, uuid, text)
  from anon;
revoke execute on function public.reject_member_points_redemption_request(uuid, uuid, text)
  from authenticated;
grant execute on function public.reject_member_points_redemption_request(uuid, uuid, text)
  to service_role;

revoke execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)
  from public;
revoke execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)
  from anon;
revoke execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)
  from authenticated;
grant execute on function public.adjust_member_points_with_redemption_reserve(uuid, integer, text, uuid, uuid)
  to service_role;
