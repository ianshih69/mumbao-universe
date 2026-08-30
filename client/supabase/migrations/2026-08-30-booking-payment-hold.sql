alter table public.booking_requests
  add column if not exists hold_expires_at timestamptz,
  add column if not exists recovery_token_hash text,
  add column if not exists submitted_snapshot jsonb;

alter table public.booking_availability_blocks
  add column if not exists external_reservation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_availability_blocks_external_reservation_id_fkey'
      and conrelid = 'public.booking_availability_blocks'::regclass
  ) then
    alter table public.booking_availability_blocks
      add constraint booking_availability_blocks_external_reservation_id_fkey
      foreign key (external_reservation_id)
      references public.booking_external_reservations(id)
      on update cascade
      on delete set null;
  end if;
end $$;

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
    check (status in ('payment_hold', 'confirmed', 'expired', 'cancelled', 'pending_review'));
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_hold_expiry_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_hold_expiry_check
      check (status <> 'payment_hold' or hold_expires_at is not null);
  end if;
end $$;

create index if not exists booking_requests_inventory_dates_idx
  on public.booking_requests(check_in, check_out, status, hold_expires_at)
  where status in ('confirmed', 'payment_hold');

create unique index if not exists booking_requests_recovery_token_hash_unique_idx
  on public.booking_requests(recovery_token_hash)
  where recovery_token_hash is not null;

create index if not exists booking_availability_blocks_external_reservation_idx
  on public.booking_availability_blocks(external_reservation_id)
  where external_reservation_id is not null;

create or replace function public.lock_villa_inventory_nights(
  p_check_in date,
  p_check_out date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inventory_night date;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception using errcode = '22023', message = 'invalid_villa_inventory_range';
  end if;

  for inventory_night in
    select generated_night::date
    from generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) as generated_nights(generated_night)
    order by generated_night
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('mumbao:villa-night:' || inventory_night::text, 0)
    );
  end loop;
end;
$$;

create or replace function public.guard_booking_request_inventory_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('confirmed', 'payment_hold') then
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
        or (
          request.status = 'payment_hold'
          and request.hold_expires_at > clock_timestamp()
        )
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
        or (
          request.status = 'payment_hold'
          and request.hold_expires_at > clock_timestamp()
        )
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
        or (
          request.status = 'payment_hold'
          and request.hold_expires_at > clock_timestamp()
        )
      )
  ) then
    raise exception using errcode = '23P01', message = 'villa_inventory_conflict';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_booking_request_inventory_write on public.booking_requests;
create trigger guard_booking_request_inventory_write
  before insert or update on public.booking_requests
  for each row
  execute function public.guard_booking_request_inventory_write();

drop trigger if exists guard_external_reservation_inventory_write on public.booking_external_reservations;
create trigger guard_external_reservation_inventory_write
  before insert or update on public.booking_external_reservations
  for each row
  execute function public.guard_external_reservation_inventory_write();

drop trigger if exists guard_availability_block_inventory_write on public.booking_availability_blocks;
create trigger guard_availability_block_inventory_write
  before insert or update on public.booking_availability_blocks
  for each row
  execute function public.guard_availability_block_inventory_write();

create or replace function public.protect_booking_submission_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.recovery_token_hash is distinct from new.recovery_token_hash
    or old.submitted_snapshot is distinct from new.submitted_snapshot
  then
    raise exception using errcode = '55000', message = 'booking_submission_snapshot_is_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_booking_submission_snapshot on public.booking_requests;
create trigger protect_booking_submission_snapshot
  before update of recovery_token_hash, submitted_snapshot
  on public.booking_requests
  for each row
  execute function public.protect_booking_submission_snapshot();

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
    'booking_request'::text as source,
    request.hold_expires_at
  from public.booking_requests as request
  where request.check_in < p_check_out
    and request.check_out > p_check_in
    and (
      request.status = 'confirmed'
      or (
        request.status = 'payment_hold'
        and request.hold_expires_at > now()
      )
    );
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
    where request.status = 'confirmed'
      and request.check_in < requested_check_out
      and request.check_out > requested_check_in
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'date_unavailable'
    );
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
  )
  values (
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

  return jsonb_build_object(
    'ok', true,
    'request', to_jsonb(inserted_request)
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
  recovered_request public.booking_requests%rowtype;
begin
  if p_recovery_token_hash is null
    or p_recovery_token_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'booking_recovery_unavailable'
    );
  end if;

  select request.*
  into recovered_request
  from public.booking_requests as request
  where request.recovery_token_hash = p_recovery_token_hash
    and request.status = 'payment_hold'
    and request.hold_expires_at > clock_timestamp()
  limit 1;

  if recovered_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'booking_recovery_unavailable'
    );
  end if;

  return coalesce(recovered_request.submitted_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'ok', true,
      'request', jsonb_build_object(
        'id', recovered_request.id,
        'status', recovered_request.status,
        'check_in', recovered_request.check_in,
        'check_out', recovered_request.check_out,
        'created_at', recovered_request.created_at,
        'hold_expires_at', recovered_request.hold_expires_at
      )
    );
end;
$$;

revoke all on function public.get_public_booking_unavailable_ranges(date, date) from public, anon, authenticated;
revoke all on function public.acquire_villa_booking_hold(jsonb) from public, anon, authenticated;
revoke all on function public.recover_booking_hold(text) from public, anon, authenticated;
revoke all on function public.lock_villa_inventory_nights(date, date) from public, anon, authenticated;
revoke all on function public.guard_booking_request_inventory_write() from public, anon, authenticated;
revoke all on function public.guard_external_reservation_inventory_write() from public, anon, authenticated;
revoke all on function public.guard_availability_block_inventory_write() from public, anon, authenticated;

grant execute on function public.get_public_booking_unavailable_ranges(date, date) to service_role;
grant execute on function public.acquire_villa_booking_hold(jsonb) to service_role;
grant execute on function public.recover_booking_hold(text) to service_role;

notify pgrst, 'reload schema';
