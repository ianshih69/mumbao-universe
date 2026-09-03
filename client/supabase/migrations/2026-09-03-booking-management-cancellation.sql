begin;

create table if not exists public.booking_lookup_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_lookup_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint booking_lookup_rate_limits_attempt_count_check
    check (attempt_count >= 0)
);

create table if not exists public.booking_management_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null,
  token_hash text not null unique,
  created_ip_hash text,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_management_sessions_booking_fkey
    foreign key (booking_request_id)
    references public.booking_requests(id)
    on update cascade
    on delete cascade,
  constraint booking_management_sessions_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint booking_management_sessions_created_ip_hash_check
    check (created_ip_hash is null or created_ip_hash ~ '^[0-9a-f]{64}$'),
  constraint booking_management_sessions_user_agent_check
    check (user_agent is null or char_length(user_agent) <= 500),
  constraint booking_management_sessions_expiry_check
    check (expires_at > created_at)
);

create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null,
  requested_by text not null,
  status text not null default 'pending',
  reason_code text not null,
  reason_text text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid,
  admin_note text,
  public_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_cancellation_requests_booking_fkey
    foreign key (booking_request_id)
    references public.booking_requests(id)
    on update cascade
    on delete restrict,
  constraint booking_cancellation_requests_admin_fkey
    foreign key (reviewed_by_admin_id)
    references public.admin_profiles(id)
    on update cascade
    on delete restrict,
  constraint booking_cancellation_requests_requested_by_check
    check (requested_by in ('customer', 'admin')),
  constraint booking_cancellation_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint booking_cancellation_requests_reason_code_check
    check (reason_code in ('schedule_change', 'guest_count_change', 'weather', 'other', 'admin_direct')),
  constraint booking_cancellation_requests_reason_text_check
    check (reason_text is null or char_length(reason_text) <= 1000),
  constraint booking_cancellation_requests_admin_note_check
    check (admin_note is null or char_length(admin_note) <= 1000),
  constraint booking_cancellation_requests_public_note_check
    check (public_note is null or char_length(public_note) <= 1000)
);

create unique index if not exists booking_cancellation_requests_one_pending_idx
  on public.booking_cancellation_requests(booking_request_id)
  where status = 'pending';

create table if not exists public.booking_cancellation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null,
  booking_reference text not null,
  cancellation_request_id uuid,
  actor_type text not null,
  admin_profile_id uuid,
  admin_auth_user_id uuid,
  action text not null,
  previous_booking_status text,
  new_booking_status text,
  previous_payment_status text,
  new_payment_status text,
  reason text,
  action_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint booking_cancellation_audit_booking_fkey
    foreign key (booking_request_id)
    references public.booking_requests(id)
    on update cascade
    on delete restrict,
  constraint booking_cancellation_audit_request_fkey
    foreign key (cancellation_request_id)
    references public.booking_cancellation_requests(id)
    on update cascade
    on delete restrict,
  constraint booking_cancellation_audit_admin_fkey
    foreign key (admin_profile_id)
    references public.admin_profiles(id)
    on update cascade
    on delete restrict,
  constraint booking_cancellation_audit_reference_check
    check (booking_reference ~ '^[0-9]{10}$'),
  constraint booking_cancellation_audit_actor_type_check
    check (actor_type in ('customer', 'admin')),
  constraint booking_cancellation_audit_action_check
    check (action in (
      'customer_booking_cancelled',
      'customer_cancellation_requested',
      'admin_booking_cancelled',
      'admin_cancellation_approved',
      'admin_cancellation_rejected'
    )),
  constraint booking_cancellation_audit_reason_check
    check (reason is null or char_length(reason) <= 1000)
);

create index if not exists booking_management_sessions_booking_idx
  on public.booking_management_sessions(booking_request_id, expires_at desc);

create index if not exists booking_management_sessions_expires_at_idx
  on public.booking_management_sessions(expires_at);

create index if not exists booking_lookup_rate_limits_expires_at_idx
  on public.booking_lookup_rate_limits(expires_at);

create index if not exists booking_cancellation_requests_booking_idx
  on public.booking_cancellation_requests(booking_request_id, created_at desc);

create index if not exists booking_cancellation_requests_status_idx
  on public.booking_cancellation_requests(status, requested_at desc);

create index if not exists booking_cancellation_audit_booking_idx
  on public.booking_cancellation_audit_logs(booking_request_id, action_at desc);

alter table public.booking_lookup_rate_limits enable row level security;
alter table public.booking_management_sessions enable row level security;
alter table public.booking_cancellation_requests enable row level security;
alter table public.booking_cancellation_audit_logs enable row level security;

revoke all on table public.booking_lookup_rate_limits from public, anon, authenticated, service_role;
revoke all on table public.booking_management_sessions from public, anon, authenticated, service_role;
revoke all on table public.booking_cancellation_requests from public, anon, authenticated, service_role;
revoke all on table public.booking_cancellation_audit_logs from public, anon, authenticated, service_role;

grant select on table public.booking_cancellation_requests to service_role;
grant select on table public.booking_cancellation_audit_logs to service_role;

drop trigger if exists set_booking_lookup_rate_limits_updated_at on public.booking_lookup_rate_limits;
create trigger set_booking_lookup_rate_limits_updated_at
  before update on public.booking_lookup_rate_limits
  for each row
  execute function public.set_booking_updated_at();

drop trigger if exists set_booking_cancellation_requests_updated_at on public.booking_cancellation_requests;
create trigger set_booking_cancellation_requests_updated_at
  before update on public.booking_cancellation_requests
  for each row
  execute function public.set_booking_updated_at();

create or replace function public.prevent_booking_cancellation_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'booking_cancellation_audit_is_append_only';
end;
$$;

drop trigger if exists prevent_booking_cancellation_audit_mutation
  on public.booking_cancellation_audit_logs;
create trigger prevent_booking_cancellation_audit_mutation
  before update or delete on public.booking_cancellation_audit_logs
  for each row
  execute function public.prevent_booking_cancellation_audit_mutation();

create or replace function public.consume_booking_lookup_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  rate_limit_row public.booking_lookup_rate_limits%rowtype;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_key';
  end if;

  if p_limit < 1 or p_limit > 100 or p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_policy';
  end if;

  database_now := clock_timestamp();

  insert into public.booking_lookup_rate_limits (
    key_hash,
    window_started_at,
    attempt_count,
    expires_at
  ) values (
    p_key_hash,
    database_now,
    1,
    database_now + make_interval(secs => p_window_seconds)
  )
  on conflict (key_hash) do update
  set window_started_at = case
        when public.booking_lookup_rate_limits.expires_at <= database_now then database_now
        else public.booking_lookup_rate_limits.window_started_at
      end,
      attempt_count = case
        when public.booking_lookup_rate_limits.expires_at <= database_now then 1
        else public.booking_lookup_rate_limits.attempt_count + 1
      end,
      expires_at = case
        when public.booking_lookup_rate_limits.expires_at <= database_now
          then database_now + make_interval(secs => p_window_seconds)
        else public.booking_lookup_rate_limits.expires_at
      end,
      updated_at = database_now
  returning * into rate_limit_row;

  return jsonb_build_object(
    'allowed', rate_limit_row.attempt_count <= p_limit,
    'retry_after_seconds', greatest(
      ceil(extract(epoch from (rate_limit_row.expires_at - database_now)))::integer,
      0
    )
  );
end;
$$;

create or replace function public.get_booking_management_session(
  p_session_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  active_session public.booking_management_sessions%rowtype;
begin
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  database_now := clock_timestamp();

  select session.*
  into active_session
  from public.booking_management_sessions as session
  where session.token_hash = p_session_token_hash
    and session.expires_at > database_now
  limit 1;

  if active_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'database_now', database_now,
    'session', jsonb_build_object(
      'id', active_session.id,
      'booking_request_id', active_session.booking_request_id,
      'expires_at', active_session.expires_at
    )
  );
end;
$$;

create or replace function public.create_booking_management_session(
  p_booking_request_id uuid,
  p_token_hash text,
  p_created_ip_hash text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  active_session public.booking_management_sessions%rowtype;
begin
  if p_booking_request_id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  if p_created_ip_hash is not null and p_created_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  if p_user_agent is not null and char_length(p_user_agent) > 500 then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  database_now := clock_timestamp();

  insert into public.booking_management_sessions (
    booking_request_id,
    token_hash,
    created_ip_hash,
    user_agent,
    expires_at
  ) values (
    p_booking_request_id,
    p_token_hash,
    p_created_ip_hash,
    nullif(trim(coalesce(p_user_agent, '')), ''),
    database_now + interval '30 minutes'
  )
  returning * into active_session;

  return jsonb_build_object(
    'ok', true,
    'database_now', database_now,
    'session', jsonb_build_object(
      'id', active_session.id,
      'booking_request_id', active_session.booking_request_id,
      'expires_at', active_session.expires_at
    )
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
end;
$$;

create or replace function public.customer_cancel_payment_hold_booking(
  p_booking_request_id uuid,
  p_session_token_hash text,
  p_reason_code text,
  p_reason_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  active_session public.booking_management_sessions%rowtype;
  requested_booking public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  audit_record public.booking_cancellation_audit_logs%rowtype;
  previous_booking_status text;
  previous_payment_status text;
begin
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  if p_reason_code not in ('schedule_change', 'guest_count_change', 'weather', 'other') then
    return jsonb_build_object('ok', false, 'code', 'invalid_cancellation_reason');
  end if;

  database_now := clock_timestamp();

  select session.*
  into active_session
  from public.booking_management_sessions as session
  where session.token_hash = p_session_token_hash
    and session.booking_request_id = p_booking_request_id
    and session.expires_at > database_now
  limit 1;

  if active_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  for update;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
  order by payment.created_at desc
  limit 1
  for update;

  if requested_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end
    );
  end if;

  if requested_booking.status <> 'payment_hold' then
    return jsonb_build_object('ok', false, 'code', 'customer_direct_cancel_not_allowed');
  end if;

  if requested_booking.hold_expires_at is null or requested_booking.hold_expires_at <= database_now then
    return jsonb_build_object('ok', false, 'code', 'booking_hold_expired');
  end if;

  previous_booking_status := requested_booking.status;
  previous_payment_status := payment_record.status;

  update public.booking_requests
  set status = 'cancelled'
  where id = requested_booking.id
  returning * into requested_booking;

  if payment_record.id is not null and payment_record.status <> 'verified' then
    update public.booking_payment_records
    set status = 'cancelled'
    where id = payment_record.id
    returning * into payment_record;
  end if;

  insert into public.booking_cancellation_audit_logs (
    booking_request_id,
    booking_reference,
    actor_type,
    action,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    reason,
    action_at
  ) values (
    requested_booking.id,
    requested_booking.booking_reference,
    'customer',
    'customer_booking_cancelled',
    previous_booking_status,
    requested_booking.status,
    previous_payment_status,
    payment_record.status,
    left(
      concat_ws(
        ': ',
        p_reason_code,
        nullif(trim(coalesce(p_reason_text, '')), '')
      ),
      1000
    ),
    database_now
  )
  returning * into audit_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end,
    'audit', jsonb_build_object('id', audit_record.id, 'action', audit_record.action, 'action_at', audit_record.action_at)
  );
end;
$$;

create or replace function public.customer_request_booking_cancellation(
  p_booking_request_id uuid,
  p_session_token_hash text,
  p_reason_code text,
  p_reason_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  active_session public.booking_management_sessions%rowtype;
  requested_booking public.booking_requests%rowtype;
  cancellation_request public.booking_cancellation_requests%rowtype;
  existing_request public.booking_cancellation_requests%rowtype;
  audit_record public.booking_cancellation_audit_logs%rowtype;
begin
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  if p_reason_code not in ('schedule_change', 'guest_count_change', 'weather', 'other') then
    return jsonb_build_object('ok', false, 'code', 'invalid_cancellation_reason');
  end if;

  database_now := clock_timestamp();

  select session.*
  into active_session
  from public.booking_management_sessions as session
  where session.token_hash = p_session_token_hash
    and session.booking_request_id = p_booking_request_id
    and session.expires_at > database_now
  limit 1;

  if active_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  for update;

  if requested_booking.status not in ('payment_review', 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'customer_cancellation_request_not_allowed');
  end if;

  select cancel_request.*
  into existing_request
  from public.booking_cancellation_requests as cancel_request
  where cancel_request.booking_request_id = requested_booking.id
    and cancel_request.status = 'pending'
  limit 1
  for update;

  if existing_request.id is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'cancellation_request', to_jsonb(existing_request)
    );
  end if;

  insert into public.booking_cancellation_requests (
    booking_request_id,
    requested_by,
    status,
    reason_code,
    reason_text,
    requested_at
  ) values (
    requested_booking.id,
    'customer',
    'pending',
    p_reason_code,
    nullif(left(trim(coalesce(p_reason_text, '')), 1000), ''),
    database_now
  )
  returning * into cancellation_request;

  insert into public.booking_cancellation_audit_logs (
    booking_request_id,
    booking_reference,
    cancellation_request_id,
    actor_type,
    action,
    previous_booking_status,
    new_booking_status,
    reason,
    action_at
  ) values (
    requested_booking.id,
    requested_booking.booking_reference,
    cancellation_request.id,
    'customer',
    'customer_cancellation_requested',
    requested_booking.status,
    requested_booking.status,
    left(
      concat_ws(
        ': ',
        cancellation_request.reason_code,
        cancellation_request.reason_text
      ),
      1000
    ),
    database_now
  )
  returning * into audit_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'cancellation_request', to_jsonb(cancellation_request),
    'audit', jsonb_build_object('id', audit_record.id, 'action', audit_record.action, 'action_at', audit_record.action_at)
  );
end;
$$;

create or replace function public.report_booking_bank_transfer_from_management_session(
  p_booking_request_id uuid,
  p_session_token_hash text,
  p_bank_last5 text,
  p_payer_name text,
  p_notes text,
  p_review_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  active_session public.booking_management_sessions%rowtype;
  requested_booking public.booking_requests%rowtype;
begin
  if p_session_token_hash is null or p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  database_now := clock_timestamp();

  select session.*
  into active_session
  from public.booking_management_sessions as session
  where session.token_hash = p_session_token_hash
    and session.booking_request_id = p_booking_request_id
    and session.expires_at > database_now
  limit 1;

  if active_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_management_session_invalid');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  return public.report_booking_bank_transfer(
    requested_booking.recovery_token_hash,
    p_bank_last5,
    p_payer_name,
    p_notes,
    p_review_minutes
  );
end;
$$;

create or replace function public.admin_cancel_confirmed_booking(
  p_booking_request_id uuid,
  p_admin_profile_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  admin_profile public.admin_profiles%rowtype;
  requested_booking public.booking_requests%rowtype;
  pending_cancellation_request public.booking_cancellation_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  audit_record public.booking_cancellation_audit_logs%rowtype;
  previous_booking_status text;
  previous_payment_status text;
begin
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

  if nullif(left(trim(coalesce(p_reason, '')), 1000), '') is null then
    return jsonb_build_object('ok', false, 'code', 'cancellation_reason_required');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  for update;

  select cancel_request.*
  into pending_cancellation_request
  from public.booking_cancellation_requests as cancel_request
  where cancel_request.booking_request_id = requested_booking.id
    and cancel_request.status = 'pending'
  order by cancel_request.created_at desc
  limit 1
  for update;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
  order by payment.created_at desc
  limit 1
  for update;

  if requested_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end
    );
  end if;

  if requested_booking.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'code', 'admin_direct_cancel_not_allowed');
  end if;

  if pending_cancellation_request.id is not null then
    return jsonb_build_object('ok', false, 'code', 'pending_cancellation_request_requires_review');
  end if;

  database_now := clock_timestamp();
  previous_booking_status := requested_booking.status;
  previous_payment_status := payment_record.status;

  update public.booking_requests
  set status = 'cancelled'
  where id = requested_booking.id
  returning * into requested_booking;

  insert into public.booking_cancellation_audit_logs (
    booking_request_id,
    booking_reference,
    actor_type,
    admin_profile_id,
    admin_auth_user_id,
    action,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    reason,
    action_at
  ) values (
    requested_booking.id,
    requested_booking.booking_reference,
    'admin',
    admin_profile.id,
    admin_profile.auth_user_id,
    'admin_booking_cancelled',
    previous_booking_status,
    requested_booking.status,
    previous_payment_status,
    payment_record.status,
    left(trim(coalesce(p_reason, '')), 1000),
    database_now
  )
  returning * into audit_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end,
    'audit', jsonb_build_object('id', audit_record.id, 'action', audit_record.action, 'action_at', audit_record.action_at)
  );
end;
$$;

create or replace function public.review_booking_cancellation_request(
  p_cancellation_request_id uuid,
  p_admin_profile_id uuid,
  p_decision text,
  p_admin_note text,
  p_public_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  admin_profile public.admin_profiles%rowtype;
  cancellation_request public.booking_cancellation_requests%rowtype;
  requested_booking public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  audit_record public.booking_cancellation_audit_logs%rowtype;
  previous_booking_status text;
  previous_payment_status text;
  next_request_status text;
  audit_action text;
begin
  if p_decision not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_cancellation_review_decision');
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

  select cancel_request.*
  into cancellation_request
  from public.booking_cancellation_requests as cancel_request
  where cancel_request.id = p_cancellation_request_id
  limit 1;

  if cancellation_request.id is null then
    return jsonb_build_object('ok', false, 'code', 'cancellation_request_not_found');
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = cancellation_request.booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = cancellation_request.booking_request_id
  for update;

  select cancel_request.*
  into cancellation_request
  from public.booking_cancellation_requests as cancel_request
  where cancel_request.id = p_cancellation_request_id
  for update;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
  order by payment.created_at desc
  limit 1
  for update;

  if cancellation_request.status <> 'pending' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'cancellation_request', to_jsonb(cancellation_request),
      'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end
    );
  end if;

  if requested_booking.status not in ('payment_review', 'confirmed') then
    return jsonb_build_object('ok', false, 'code', 'cancellation_review_invalid_booking_status');
  end if;

  database_now := clock_timestamp();
  previous_booking_status := requested_booking.status;
  previous_payment_status := payment_record.status;
  next_request_status := p_decision;
  audit_action := case
    when p_decision = 'approved' then 'admin_cancellation_approved'
    else 'admin_cancellation_rejected'
  end;

  update public.booking_cancellation_requests
  set status = next_request_status,
      reviewed_at = database_now,
      reviewed_by_admin_id = admin_profile.id,
      admin_note = nullif(left(trim(coalesce(p_admin_note, '')), 1000), ''),
      public_note = nullif(left(trim(coalesce(p_public_note, '')), 1000), '')
  where id = cancellation_request.id
  returning * into cancellation_request;

  if p_decision = 'approved' then
    update public.booking_requests
    set status = 'cancelled'
    where id = requested_booking.id
    returning * into requested_booking;
  end if;

  insert into public.booking_cancellation_audit_logs (
    booking_request_id,
    booking_reference,
    cancellation_request_id,
    actor_type,
    admin_profile_id,
    admin_auth_user_id,
    action,
    previous_booking_status,
    new_booking_status,
    previous_payment_status,
    new_payment_status,
    reason,
    action_at
  ) values (
    requested_booking.id,
    requested_booking.booking_reference,
    cancellation_request.id,
    'admin',
    admin_profile.id,
    admin_profile.auth_user_id,
    audit_action,
    previous_booking_status,
    requested_booking.status,
    previous_payment_status,
    payment_record.status,
    left(
      concat_ws(
        ' | ',
        concat_ws(': ', cancellation_request.reason_code, cancellation_request.reason_text),
        cancellation_request.admin_note
      ),
      1000
    ),
    database_now
  )
  returning * into audit_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'cancellation_request', to_jsonb(cancellation_request),
    'payment_record', case when payment_record.id is null then null else to_jsonb(payment_record) end,
    'audit', jsonb_build_object('id', audit_record.id, 'action', audit_record.action, 'action_at', audit_record.action_at)
  );
end;
$$;

revoke all on function public.prevent_booking_cancellation_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function public.consume_booking_lookup_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_booking_management_session(text) from public, anon, authenticated;
revoke all on function public.create_booking_management_session(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_cancel_payment_hold_booking(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_request_booking_cancellation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.report_booking_bank_transfer_from_management_session(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_cancel_confirmed_booking(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.review_booking_cancellation_request(uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.consume_booking_lookup_rate_limit(text, integer, integer) to service_role;
grant execute on function public.get_booking_management_session(text) to service_role;
grant execute on function public.create_booking_management_session(uuid, text, text, text) to service_role;
grant execute on function public.customer_cancel_payment_hold_booking(uuid, text, text, text) to service_role;
grant execute on function public.customer_request_booking_cancellation(uuid, text, text, text) to service_role;
grant execute on function public.report_booking_bank_transfer_from_management_session(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.admin_cancel_confirmed_booking(uuid, uuid, text) to service_role;
grant execute on function public.review_booking_cancellation_request(uuid, uuid, text, text, text) to service_role;

commit;
