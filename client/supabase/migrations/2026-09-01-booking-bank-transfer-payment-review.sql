begin;

alter table public.booking_requests
  add column if not exists booking_reference text,
  add column if not exists payment_reported_at timestamptz,
  add column if not exists review_expires_at timestamptz;

create or replace function public.generate_booking_reference()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select lpad(
    (
      (
        ('x' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 15))::bit(60)::bigint
        % 10000000000
      )
    )::text,
    10,
    '0'
  );
$$;

create or replace function public.assign_booking_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate text;
  attempt integer;
begin
  for attempt in 1..25 loop
    candidate := public.generate_booking_reference();
    exit when not exists (
      select 1
      from public.booking_requests as request
      where request.booking_reference = candidate
    );
  end loop;

  if candidate is null or exists (
    select 1
    from public.booking_requests as request
    where request.booking_reference = candidate
  ) then
    raise exception using errcode = '54000', message = 'booking_reference_generation_failed';
  end if;

  new.booking_reference := candidate;
  return new;
end;
$$;

drop trigger if exists assign_booking_reference on public.booking_requests;
create trigger assign_booking_reference
  before insert on public.booking_requests
  for each row
  execute function public.assign_booking_reference();

do $$
declare
  target_id uuid;
  candidate text;
  attempt integer;
begin
  for target_id in
    select request.id
    from public.booking_requests as request
    where request.booking_reference is null
    order by request.created_at, request.id
  loop
    candidate := null;
    for attempt in 1..25 loop
      candidate := public.generate_booking_reference();
      exit when not exists (
        select 1
        from public.booking_requests as request
        where request.booking_reference = candidate
      );
    end loop;

    if candidate is null or exists (
      select 1
      from public.booking_requests as request
      where request.booking_reference = candidate
    ) then
      raise exception using errcode = '54000', message = 'booking_reference_backfill_failed';
    end if;

    update public.booking_requests
    set booking_reference = candidate
    where id = target_id
      and booking_reference is null;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_booking_reference_key'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_booking_reference_key unique (booking_reference);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_booking_reference_format_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_booking_reference_format_check
      check (booking_reference ~ '^[0-9]{10}$');
  end if;
end $$;

alter table public.booking_requests
  alter column booking_reference set not null;

do $$
declare
  status_constraint record;
begin
  alter table public.booking_requests
    drop constraint if exists booking_requests_status_check;

  for status_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.booking_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%pending_review%'
      and pg_get_constraintdef(oid) ilike '%confirmed%'
  loop
    execute format(
      'alter table public.booking_requests drop constraint %I',
      status_constraint.conname
    );
  end loop;

  alter table public.booking_requests
    add constraint booking_requests_status_check
    check (status in (
      'payment_hold',
      'payment_review',
      'confirmed',
      'expired',
      'cancelled',
      'pending_review'
    ));
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_review_expiry_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_review_expiry_check
      check (status <> 'payment_review' or review_expires_at is not null);
  end if;
end $$;

create table if not exists public.booking_payment_records (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null,
  payment_method text not null,
  expected_amount integer not null,
  currency text not null default 'TWD',
  status text not null default 'reported',
  bank_last5 text,
  payer_name text,
  report_notes text,
  reported_at timestamptz,
  verified_at timestamptz,
  verified_by_admin_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_payment_records_booking_request_id_fkey
    foreign key (booking_request_id)
    references public.booking_requests(id)
    on update cascade
    on delete restrict,
  constraint booking_payment_records_verified_by_admin_id_fkey
    foreign key (verified_by_admin_id)
    references public.admin_profiles(id)
    on update cascade
    on delete set null,
  constraint booking_payment_records_method_check
    check (payment_method in ('bank_transfer', 'credit_card', 'paypal')),
  constraint booking_payment_records_amount_check
    check (expected_amount > 0),
  constraint booking_payment_records_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint booking_payment_records_status_check
    check (status in ('reported', 'verified', 'rejected', 'cancelled', 'expired')),
  constraint booking_payment_records_bank_last5_check
    check (bank_last5 is null or bank_last5 ~ '^[0-9]{5}$'),
  constraint booking_payment_records_booking_method_key
    unique (booking_request_id, payment_method)
);

create table if not exists public.booking_payment_report_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint booking_payment_report_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint booking_payment_report_rate_limits_attempt_count_check
    check (attempt_count >= 1)
);

drop trigger if exists set_booking_payment_records_updated_at on public.booking_payment_records;
create trigger set_booking_payment_records_updated_at
  before update on public.booking_payment_records
  for each row
  execute function public.set_booking_updated_at();

drop trigger if exists set_booking_payment_report_rate_limits_updated_at on public.booking_payment_report_rate_limits;
create trigger set_booking_payment_report_rate_limits_updated_at
  before update on public.booking_payment_report_rate_limits
  for each row
  execute function public.set_booking_updated_at();

create index if not exists booking_payment_records_booking_request_idx
  on public.booking_payment_records(booking_request_id, status);

create index if not exists booking_payment_records_reported_at_idx
  on public.booking_payment_records(reported_at desc)
  where reported_at is not null;

create index if not exists booking_payment_report_rate_limits_expires_at_idx
  on public.booking_payment_report_rate_limits(expires_at);

drop index if exists public.booking_requests_inventory_dates_idx;
create index booking_requests_inventory_dates_idx
  on public.booking_requests(check_in, check_out, status, hold_expires_at, review_expires_at)
  where status in ('confirmed', 'payment_hold', 'payment_review');

create index if not exists booking_requests_payment_review_idx
  on public.booking_requests(status, review_expires_at, created_at desc)
  where status = 'payment_review';

create or replace function public.guard_booking_request_inventory_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
begin
  database_now := clock_timestamp();

  if not (
    new.status = 'confirmed'
    or (new.status = 'payment_hold' and new.hold_expires_at > database_now)
    or (new.status = 'payment_review' and new.review_expires_at > database_now)
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = old.status
      and new.check_in = old.check_in
      and new.check_out = old.check_out
      and new.hold_expires_at is not distinct from old.hold_expires_at
      and new.review_expires_at is not distinct from old.review_expires_at
    then
      return new;
    end if;
  end if;

  perform public.lock_villa_inventory_nights(new.check_in, new.check_out);

  if exists (
    select 1
    from public.booking_availability_blocks as block
    where block.status = 'confirmed'
      and block.check_in < new.check_out
      and block.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_external_reservations as reservation
    where reservation.status = 'confirmed'
      and reservation.check_in < new.check_out
      and reservation.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_requests as request
    where request.id is distinct from new.id
      and request.check_in < new.check_out
      and request.check_out > new.check_in
      and (
        request.status = 'confirmed'
        or (request.status = 'payment_hold' and request.hold_expires_at > database_now)
        or (request.status = 'payment_review' and request.review_expires_at > database_now)
      )
  ) then
    raise exception using errcode = '23P01', message = 'villa_inventory_conflict';
  end if;

  return new;
end;
$$;

create or replace function public.guard_external_reservation_inventory_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = old.status
      and new.check_in = old.check_in
      and new.check_out = old.check_out
    then
      return new;
    end if;
  end if;

  perform public.lock_villa_inventory_nights(new.check_in, new.check_out);
  database_now := clock_timestamp();

  if exists (
    select 1
    from public.booking_availability_blocks as block
    where block.external_reservation_id is distinct from new.id
      and block.status = 'confirmed'
      and block.check_in < new.check_out
      and block.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_external_reservations as reservation
    where reservation.id is distinct from new.id
      and reservation.status = 'confirmed'
      and reservation.check_in < new.check_out
      and reservation.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_requests as request
    where request.check_in < new.check_out
      and request.check_out > new.check_in
      and (
        request.status = 'confirmed'
        or (request.status = 'payment_hold' and request.hold_expires_at > database_now)
        or (request.status = 'payment_review' and request.review_expires_at > database_now)
      )
  ) then
    raise exception using errcode = '23P01', message = 'villa_inventory_conflict';
  end if;

  return new;
end;
$$;

create or replace function public.guard_availability_block_inventory_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = old.status
      and new.check_in = old.check_in
      and new.check_out = old.check_out
    then
      return new;
    end if;
  end if;

  perform public.lock_villa_inventory_nights(new.check_in, new.check_out);
  database_now := clock_timestamp();

  if exists (
    select 1
    from public.booking_availability_blocks as block
    where block.id is distinct from new.id
      and block.status = 'confirmed'
      and block.check_in < new.check_out
      and block.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_external_reservations as reservation
    where reservation.id is distinct from new.external_reservation_id
      and reservation.status = 'confirmed'
      and reservation.check_in < new.check_out
      and reservation.check_out > new.check_in
  ) or exists (
    select 1
    from public.booking_requests as request
    where request.check_in < new.check_out
      and request.check_out > new.check_in
      and (
        request.status = 'confirmed'
        or (request.status = 'payment_hold' and request.hold_expires_at > database_now)
        or (request.status = 'payment_review' and request.review_expires_at > database_now)
      )
  ) then
    raise exception using errcode = '23P01', message = 'villa_inventory_conflict';
  end if;

  return new;
end;
$$;

create or replace function public.get_public_booking_unavailable_ranges(
  p_check_in date,
  p_check_out date
)
returns table (
  id uuid,
  check_in date,
  check_out date,
  source text,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    block.id,
    block.check_in,
    block.check_out,
    block.source,
    null::timestamptz as hold_expires_at
  from public.booking_availability_blocks as block
  where block.status = 'confirmed'
    and block.check_in < p_check_out
    and block.check_out > p_check_in

  union all

  select
    reservation.id,
    reservation.check_in,
    reservation.check_out,
    reservation.source,
    null::timestamptz as hold_expires_at
  from public.booking_external_reservations as reservation
  where reservation.status = 'confirmed'
    and reservation.check_in < p_check_out
    and reservation.check_out > p_check_in

  union all

  select
    request.id,
    request.check_in,
    request.check_out,
    case
      when request.status = 'payment_review' then 'booking_payment_review'
      else 'booking_request'
    end::text as source,
    case
      when request.status = 'payment_review' then request.review_expires_at
      else request.hold_expires_at
    end as hold_expires_at
  from public.booking_requests as request
  where request.check_in < p_check_out
    and request.check_out > p_check_in
    and (
      request.status = 'confirmed'
      or (request.status = 'payment_hold' and request.hold_expires_at > now())
      or (request.status = 'payment_review' and request.review_expires_at > now())
    );
$$;

create or replace function public.consume_booking_payment_report_rate_limit(
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
  rate_limit_row public.booking_payment_report_rate_limits%rowtype;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_key';
  end if;

  if p_limit < 1 or p_limit > 100 or p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_policy';
  end if;

  database_now := clock_timestamp();

  insert into public.booking_payment_report_rate_limits (
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
        when public.booking_payment_report_rate_limits.expires_at <= database_now then database_now
        else public.booking_payment_report_rate_limits.window_started_at
      end,
      attempt_count = case
        when public.booking_payment_report_rate_limits.expires_at <= database_now then 1
        else public.booking_payment_report_rate_limits.attempt_count + 1
      end,
      expires_at = case
        when public.booking_payment_report_rate_limits.expires_at <= database_now
          then database_now + make_interval(secs => p_window_seconds)
        else public.booking_payment_report_rate_limits.expires_at
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

create or replace function public.report_booking_bank_transfer(
  p_recovery_token_hash text,
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
  requested_booking public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  expected_amount integer;
begin
  if p_recovery_token_hash is null or p_recovery_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_recovery_unavailable');
  end if;

  if p_bank_last5 is null or p_bank_last5 !~ '^[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_bank_last5');
  end if;

  if p_review_minutes < 15 or p_review_minutes > 1440 then
    raise exception using errcode = '22023', message = 'invalid_payment_review_minutes';
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.recovery_token_hash = p_recovery_token_hash
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_recovery_unavailable');
  end if;

  perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = requested_booking.id
  for update;

  database_now := clock_timestamp();

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
    and payment.payment_method = 'bank_transfer'
  limit 1;

  if requested_booking.status = 'payment_review' then
    if requested_booking.review_expires_at <= database_now then
      return jsonb_build_object('ok', false, 'code', 'payment_review_expired');
    end if;

    if payment_record.id is null then
      raise exception using errcode = '55000', message = 'payment_review_record_missing';
    end if;

    return coalesce(requested_booking.submitted_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'database_now', database_now,
        'request', jsonb_build_object(
          'id', requested_booking.id,
          'booking_reference', requested_booking.booking_reference,
          'status', requested_booking.status,
          'check_in', requested_booking.check_in,
          'check_out', requested_booking.check_out,
          'created_at', requested_booking.created_at,
          'hold_expires_at', requested_booking.hold_expires_at,
          'payment_reported_at', requested_booking.payment_reported_at,
          'review_expires_at', requested_booking.review_expires_at
        ),
        'payment_record', jsonb_build_object(
          'id', payment_record.id,
          'payment_method', payment_record.payment_method,
          'expected_amount', payment_record.expected_amount,
          'currency', payment_record.currency,
          'status', payment_record.status,
          'bank_last5', payment_record.bank_last5,
          'payer_name', payment_record.payer_name,
          'reported_at', payment_record.reported_at
        )
      );
  end if;

  if requested_booking.status <> 'payment_hold' then
    return jsonb_build_object('ok', false, 'code', 'payment_report_invalid_booking_status');
  end if;

  if requested_booking.hold_expires_at is null or requested_booking.hold_expires_at <= database_now then
    return jsonb_build_object('ok', false, 'code', 'booking_hold_expired');
  end if;

  expected_amount := nullif(
    requested_booking.submitted_snapshot #>> '{pricing,depositAmount}',
    ''
  )::integer;

  if expected_amount is null
    or expected_amount <= 0
    or requested_booking.deposit_amount is distinct from expected_amount
  then
    raise exception using errcode = '55000', message = 'booking_deposit_snapshot_invalid';
  end if;

  if payment_record.id is not null then
    raise exception using errcode = '55000', message = 'booking_payment_record_already_exists';
  end if;

  insert into public.booking_payment_records (
    booking_request_id,
    payment_method,
    expected_amount,
    currency,
    status,
    bank_last5,
    payer_name,
    report_notes,
    reported_at
  ) values (
    requested_booking.id,
    'bank_transfer',
    expected_amount,
    'TWD',
    'reported',
    p_bank_last5,
    nullif(left(trim(coalesce(p_payer_name, '')), 80), ''),
    nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    database_now
  )
  returning * into payment_record;

  update public.booking_requests
  set status = 'payment_review',
      payment_reported_at = database_now,
      review_expires_at = database_now + make_interval(mins => p_review_minutes)
  where id = requested_booking.id
  returning * into requested_booking;

  return coalesce(requested_booking.submitted_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'database_now', database_now,
      'request', jsonb_build_object(
        'id', requested_booking.id,
        'booking_reference', requested_booking.booking_reference,
        'status', requested_booking.status,
        'check_in', requested_booking.check_in,
        'check_out', requested_booking.check_out,
        'created_at', requested_booking.created_at,
        'hold_expires_at', requested_booking.hold_expires_at,
        'payment_reported_at', requested_booking.payment_reported_at,
        'review_expires_at', requested_booking.review_expires_at
      ),
      'payment_record', jsonb_build_object(
        'id', payment_record.id,
        'payment_method', payment_record.payment_method,
        'expected_amount', payment_record.expected_amount,
        'currency', payment_record.currency,
        'status', payment_record.status,
        'bank_last5', payment_record.bank_last5,
        'payer_name', payment_record.payer_name,
        'reported_at', payment_record.reported_at
      )
    );
end;
$$;

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
  target_booking_status text;
  target_payment_status text;
begin
  if p_decision not in ('confirmed', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid_payment_review_decision';
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

  target_booking_status := p_decision;
  target_payment_status := case when p_decision = 'confirmed' then 'verified' else 'rejected' end;

  if requested_booking.status = target_booking_status
    and payment_record.status = target_payment_status
  then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', to_jsonb(payment_record)
    );
  end if;

  if requested_booking.status <> 'payment_review' or payment_record.status <> 'reported' then
    return jsonb_build_object('ok', false, 'code', 'payment_review_invalid_status');
  end if;

  database_now := clock_timestamp();

  if p_decision = 'confirmed'
    and requested_booking.review_expires_at <= database_now
  then
    return jsonb_build_object('ok', false, 'code', 'payment_review_expired');
  end if;

  update public.booking_requests
  set status = target_booking_status
  where id = requested_booking.id
  returning * into requested_booking;

  update public.booking_payment_records
  set status = target_payment_status,
      verified_at = case when p_decision = 'confirmed' then database_now else null end,
      verified_by_admin_id = case when p_decision = 'confirmed' then p_admin_profile_id else null end
  where id = payment_record.id
  returning * into payment_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'payment_record', to_jsonb(payment_record)
  );
end;
$$;

create or replace function public.recover_booking_hold(p_recovery_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  recovered_request public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
begin
  if p_recovery_token_hash is null or p_recovery_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'booking_recovery_unavailable');
  end if;

  database_now := clock_timestamp();

  select request.*
  into recovered_request
  from public.booking_requests as request
  where request.recovery_token_hash = p_recovery_token_hash
  limit 1;

  if recovered_request.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_recovery_unavailable');
  end if;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = recovered_request.id
    and payment.payment_method = 'bank_transfer'
  limit 1;

  return coalesce(recovered_request.submitted_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'ok', true,
      'database_now', database_now,
      'request', jsonb_build_object(
        'id', recovered_request.id,
        'booking_reference', recovered_request.booking_reference,
        'status', recovered_request.status,
        'check_in', recovered_request.check_in,
        'check_out', recovered_request.check_out,
        'created_at', recovered_request.created_at,
        'hold_expires_at', recovered_request.hold_expires_at,
        'payment_reported_at', recovered_request.payment_reported_at,
        'review_expires_at', recovered_request.review_expires_at
      ),
      'payment_record', case
        when payment_record.id is null then null
        else jsonb_build_object(
          'id', payment_record.id,
          'payment_method', payment_record.payment_method,
          'expected_amount', payment_record.expected_amount,
          'currency', payment_record.currency,
          'status', payment_record.status,
          'bank_last5', payment_record.bank_last5,
          'payer_name', payment_record.payer_name,
          'reported_at', payment_record.reported_at,
          'verified_at', payment_record.verified_at
        )
      end
    );
end;
$$;

create or replace function public.acquire_villa_booking_hold(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  requested_check_in date;
  requested_check_out date;
  requested_adults integer;
  requested_children integer;
  conflicting_hold_expires_at timestamptz;
  inserted_request public.booking_requests%rowtype;
  attempt integer;
  violated_constraint text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_booking_request';
  end if;

  if coalesce(p_request->>'recovery_token_hash', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_request->'submitted_snapshot') <> 'object'
  then
    raise exception using errcode = '22023', message = 'invalid_booking_recovery_snapshot';
  end if;

  requested_check_in := (p_request->>'check_in')::date;
  requested_check_out := (p_request->>'check_out')::date;
  requested_adults := (p_request->>'adults')::integer;
  requested_children := coalesce((p_request->>'children')::integer, 0);

  if requested_check_out <= requested_check_in then
    raise exception using errcode = '22023', message = 'invalid_date_range';
  end if;

  if requested_check_in < (clock_timestamp() at time zone 'Asia/Taipei')::date then
    raise exception using errcode = '22023', message = 'date_in_past';
  end if;

  if coalesce(p_request->>'stay_type', '') <> 'villa' then
    raise exception using errcode = '22023', message = 'invalid_stay_type';
  end if;

  if requested_adults < 1 or requested_adults > 20 then
    raise exception using errcode = '22023', message = 'invalid_adults';
  end if;

  if requested_children < 0 or requested_children > 9 then
    raise exception using errcode = '22023', message = 'invalid_children';
  end if;

  perform public.lock_villa_inventory_nights(requested_check_in, requested_check_out);
  database_now := clock_timestamp();

  if exists (
    select 1
    from public.booking_availability_blocks as block
    where block.status = 'confirmed'
      and block.check_in < requested_check_out
      and block.check_out > requested_check_in
  ) or exists (
    select 1
    from public.booking_external_reservations as reservation
    where reservation.status = 'confirmed'
      and reservation.check_in < requested_check_out
      and reservation.check_out > requested_check_in
  ) or exists (
    select 1
    from public.booking_requests as request
    where request.check_in < requested_check_out
      and request.check_out > requested_check_in
      and (
        request.status = 'confirmed'
        or (request.status = 'payment_review' and request.review_expires_at > database_now)
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'date_unavailable');
  end if;

  select max(request.hold_expires_at)
  into conflicting_hold_expires_at
  from public.booking_requests as request
  where request.status = 'payment_hold'
    and request.hold_expires_at > database_now
    and request.check_in < requested_check_out
    and request.check_out > requested_check_in;

  if conflicting_hold_expires_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'booking_temporarily_held',
      'hold_expires_at', conflicting_hold_expires_at,
      'retry_after_seconds', greatest(
        ceil(extract(epoch from (conflicting_hold_expires_at - database_now)))::integer,
        0
      )
    );
  end if;

  for attempt in 1..20 loop
    begin
      insert into public.booking_requests (
        customer_profile_id,
        guest_name,
        guest_email,
        guest_phone,
        check_in,
        check_out,
        guest_count,
        notes,
        stay_type,
        adults,
        children,
        room_count,
        has_pets,
        pet_count,
        pet_type,
        pet_notes,
        source,
        raw_payload,
        selected_package_type,
        pricing_rule_set_id,
        quoted_total,
        deposit_rate,
        deposit_amount,
        balance_amount,
        pricing_breakdown,
        quoted_at,
        status,
        hold_expires_at,
        recovery_token_hash,
        submitted_snapshot
      ) values (
        nullif(p_request->>'customer_profile_id', '')::uuid,
        p_request->>'guest_name',
        nullif(p_request->>'guest_email', ''),
        nullif(p_request->>'guest_phone', ''),
        requested_check_in,
        requested_check_out,
        (p_request->>'guest_count')::integer,
        nullif(p_request->>'notes', ''),
        'villa',
        requested_adults,
        requested_children,
        nullif(p_request->>'room_count', '')::integer,
        coalesce((p_request->>'has_pets')::boolean, false),
        nullif(p_request->>'pet_count', '')::integer,
        nullif(p_request->>'pet_type', ''),
        nullif(p_request->>'pet_notes', ''),
        coalesce(nullif(p_request->>'source', ''), 'official_site'),
        coalesce(p_request->'raw_payload', '{}'::jsonb),
        nullif(p_request->>'selected_package_type', ''),
        nullif(p_request->>'pricing_rule_set_id', '')::uuid,
        (p_request->>'quoted_total')::integer,
        (p_request->>'deposit_rate')::numeric,
        (p_request->>'deposit_amount')::integer,
        (p_request->>'balance_amount')::integer,
        coalesce(p_request->'pricing_breakdown', '{}'::jsonb),
        coalesce(nullif(p_request->>'quoted_at', '')::timestamptz, database_now),
        'payment_hold',
        database_now + interval '15 minutes',
        nullif(p_request->>'recovery_token_hash', ''),
        coalesce(p_request->'submitted_snapshot', '{}'::jsonb)
      )
      returning * into inserted_request;

      exit;
    exception
      when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'booking_requests_booking_reference_key' then
          raise;
        end if;
    end;
  end loop;

  if inserted_request.id is null then
    raise exception using errcode = '54000', message = 'booking_reference_collision_retry_exhausted';
  end if;

  return jsonb_build_object(
    'ok', true,
    'database_now', database_now,
    'request', to_jsonb(inserted_request)
  );
end;
$$;

revoke all on table public.booking_payment_records from public, anon, authenticated;
revoke all on table public.booking_payment_report_rate_limits from public, anon, authenticated;
grant select on table public.booking_payment_records to service_role;

revoke all on function public.generate_booking_reference() from public, anon, authenticated;
revoke all on function public.assign_booking_reference() from public, anon, authenticated;
revoke all on function public.consume_booking_payment_report_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.report_booking_bank_transfer(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.review_booking_bank_transfer(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.consume_booking_payment_report_rate_limit(text, integer, integer) to service_role;
grant execute on function public.report_booking_bank_transfer(text, text, text, text, integer) to service_role;
grant execute on function public.review_booking_bank_transfer(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
