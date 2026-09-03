begin;

create table if not exists public.booking_payment_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null,
  booking_reference text not null,
  payment_id uuid not null,
  admin_profile_id uuid not null,
  admin_auth_user_id uuid not null,
  action text not null,
  previous_booking_status text not null,
  new_booking_status text not null,
  previous_payment_status text not null,
  new_payment_status text not null,
  reason text,
  action_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_payment_admin_audit_booking_request_fkey
    foreign key (booking_request_id)
    references public.booking_requests(id)
    on update cascade
    on delete restrict,
  constraint booking_payment_admin_audit_payment_fkey
    foreign key (payment_id)
    references public.booking_payment_records(id)
    on update cascade
    on delete restrict,
  constraint booking_payment_admin_audit_admin_profile_fkey
    foreign key (admin_profile_id)
    references public.admin_profiles(id)
    on update cascade
    on delete restrict,
  constraint booking_payment_admin_audit_reference_check
    check (booking_reference ~ '^[0-9]{10}$'),
  constraint booking_payment_admin_audit_action_check
    check (action in (
      'bank_payment_confirmed',
      'bank_payment_cancelled',
      'bank_payment_booking_cancelled'
    )),
  constraint booking_payment_admin_audit_reason_check
    check (reason is null or char_length(reason) <= 1000),
  constraint booking_payment_admin_audit_transition_key
    unique (
      booking_request_id,
      payment_id,
      action,
      previous_booking_status,
      new_booking_status,
      previous_payment_status,
      new_payment_status
    )
);

create index if not exists booking_payment_admin_audit_booking_idx
  on public.booking_payment_admin_audit_logs(booking_request_id, action_at desc);

create index if not exists booking_payment_admin_audit_payment_idx
  on public.booking_payment_admin_audit_logs(payment_id, action_at desc);

create index if not exists booking_payment_admin_audit_admin_idx
  on public.booking_payment_admin_audit_logs(admin_profile_id, action_at desc);

alter table public.booking_payment_admin_audit_logs enable row level security;

revoke all on table public.booking_payment_admin_audit_logs from public, anon, authenticated, service_role;
grant select on table public.booking_payment_admin_audit_logs to service_role;

create or replace function public.prevent_booking_payment_admin_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'booking_payment_admin_audit_is_append_only';
end;
$$;

drop trigger if exists prevent_booking_payment_admin_audit_mutation
  on public.booking_payment_admin_audit_logs;
create trigger prevent_booking_payment_admin_audit_mutation
  before update or delete on public.booking_payment_admin_audit_logs
  for each row
  execute function public.prevent_booking_payment_admin_audit_mutation();

create or replace function public.review_booking_bank_transfer(
  p_booking_request_id uuid,
  p_admin_profile_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  requested_booking public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  admin_profile public.admin_profiles%rowtype;
  audit_record public.booking_payment_admin_audit_logs%rowtype;
  previous_booking_status text;
  previous_payment_status text;
  target_booking_status text;
  target_payment_status text;
  audit_action text;
begin
  if p_decision not in ('confirmed', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid_payment_review_decision';
  end if;

  select profile.*
  into admin_profile
  from public.admin_profiles as profile
  where profile.id = p_admin_profile_id
    and profile.is_active is not false
    and profile.auth_user_id is not null
  limit 1
  for share;

  if admin_profile.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_admin_context');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  if p_decision = 'confirmed' then
    perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  for update;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
    and payment.payment_method = 'bank_transfer'
  for update;

  if payment_record.id is null then
    return jsonb_build_object('ok', false, 'code', 'payment_record_not_found');
  end if;

  if p_decision = 'confirmed'
    and requested_booking.status = 'confirmed'
    and payment_record.status = 'verified'
  then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', to_jsonb(payment_record)
    );
  end if;

  if p_decision = 'cancelled'
    and requested_booking.status = 'cancelled'
    and payment_record.status in ('rejected', 'verified')
  then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', to_jsonb(payment_record)
    );
  end if;

  previous_booking_status := requested_booking.status;
  previous_payment_status := payment_record.status;

  if p_decision = 'confirmed' then
    if requested_booking.status <> 'payment_review' or payment_record.status <> 'reported' then
      return jsonb_build_object('ok', false, 'code', 'payment_review_invalid_status');
    end if;

    database_now := clock_timestamp();
    if requested_booking.review_expires_at <= database_now then
      return jsonb_build_object('ok', false, 'code', 'payment_review_expired');
    end if;

    target_booking_status := 'confirmed';
    target_payment_status := 'verified';
    audit_action := 'bank_payment_confirmed';
  elsif requested_booking.status = 'payment_review' and payment_record.status = 'reported' then
    database_now := clock_timestamp();
    target_booking_status := 'cancelled';
    target_payment_status := 'rejected';
    audit_action := 'bank_payment_cancelled';
  elsif requested_booking.status = 'confirmed' and payment_record.status = 'verified' then
    database_now := clock_timestamp();
    target_booking_status := 'cancelled';
    target_payment_status := 'verified';
    audit_action := 'bank_payment_booking_cancelled';
  else
    return jsonb_build_object('ok', false, 'code', 'payment_review_invalid_status');
  end if;

  update public.booking_requests
  set status = target_booking_status
  where id = requested_booking.id
  returning * into requested_booking;

  if previous_payment_status <> target_payment_status then
    update public.booking_payment_records
    set status = target_payment_status,
        verified_at = case when target_payment_status = 'verified' then database_now else null end,
        verified_by_admin_id = case when target_payment_status = 'verified' then admin_profile.id else null end
    where id = payment_record.id
    returning * into payment_record;
  end if;

  insert into public.booking_payment_admin_audit_logs (
    booking_request_id,
    booking_reference,
    payment_id,
    admin_profile_id,
    admin_auth_user_id,
    action,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    action_at
  ) values (
    requested_booking.id,
    requested_booking.booking_reference,
    payment_record.id,
    admin_profile.id,
    admin_profile.auth_user_id,
    audit_action,
    previous_booking_status,
    requested_booking.status,
    previous_payment_status,
    payment_record.status,
    database_now
  )
  returning * into audit_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'payment_record', to_jsonb(payment_record),
    'audit', jsonb_build_object(
      'id', audit_record.id,
      'action', audit_record.action,
      'action_at', audit_record.action_at
    )
  );
end;
$$;

revoke all on function public.prevent_booking_payment_admin_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function public.review_booking_bank_transfer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_booking_bank_transfer(uuid, uuid, text) to service_role;

commit;
