begin;

-- Phase 1 inventory only. No prices, customer orders or public room checkout.
create table public.booking_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  public_name text not null,
  sort_order integer not null unique check (sort_order > 0),
  is_active boolean not null default true,
  is_sellable boolean not null default true,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.booking_rooms(code, public_name, sort_order, is_fallback) values
  ('S360','畫雲 S360',1,false), ('S521','雲心 S521',2,false),
  ('S530','雲間 S530',3,false), ('S666','牧雲 S666',4,false),
  ('S888','雲容 S888',5,false), ('S520','S520',6,true);

create table public.booking_room_sales_dates (
  date date primary key,
  room_booking_enabled_override boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.booking_room_holds (
  id uuid primary key default gen_random_uuid(),
  check_in date not null,
  check_out date not null,
  status text not null default 'payment_hold'
    check (status in ('payment_hold','payment_review','confirmed','cancelled')),
  hold_expires_at timestamptz not null,
  review_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in and check_out - check_in <= 366),
  check (status <> 'payment_review' or review_expires_at is not null)
);
create table public.booking_room_hold_nights (
  hold_id uuid not null references public.booking_room_holds(id),
  room_id uuid not null references public.booking_rooms(id),
  stay_date date not null,
  primary key (hold_id, room_id, stay_date)
);
create index booking_room_night_lookup on public.booking_room_hold_nights(room_id, stay_date);
create table public.booking_room_blocks (
  room_id uuid not null references public.booking_rooms(id),
  stay_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, stay_date)
);

create function public.booking_room_hold_active(p_status text, p_hold timestamptz,
  p_review timestamptz, p_now timestamptz)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_status = 'confirmed'
    or (p_status = 'payment_hold' and p_hold > p_now)
    or (p_status = 'payment_review' and p_review > p_now);
$$;
create function public.booking_room_enabled(p_date date)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce((select room_booking_enabled_override
    from public.booking_room_sales_dates where date = p_date), extract(dow from p_date) not in (5,6));
$$;
create function public.booking_room_occupied(p_room uuid, p_date date, p_now timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists(select 1 from public.booking_room_blocks
    where room_id = p_room and stay_date = p_date and is_active)
  or exists(select 1 from public.booking_room_hold_nights n
    join public.booking_room_holds h on h.id = n.hold_id
    where n.room_id = p_room and n.stay_date = p_date
    and public.booking_room_hold_active(h.status,h.hold_expires_at,h.review_expires_at,p_now));
$$;
create function public.booking_villa_occupied(p_date date, p_now timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists(select 1 from public.booking_availability_blocks
    where status = 'confirmed' and check_in <= p_date and check_out > p_date)
  or exists(select 1 from public.booking_external_reservations
    where status = 'confirmed' and check_in <= p_date and check_out > p_date)
  or exists(select 1 from public.booking_requests
    where check_in <= p_date and check_out > p_date
    and public.booking_room_hold_active(status,hold_expires_at,review_expires_at,p_now));
$$;

create function public.get_booking_room_availability(p_check_in date, p_check_out date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare enabled boolean; options jsonb; normal_unavailable boolean; available_ids uuid[];
  instant timestamptz := statement_timestamp(); villa_free boolean;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in
    or p_check_out - p_check_in > 366 then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  select bool_and(public.booking_room_enabled(d::date)),
    bool_and(not public.booking_villa_occupied(d::date, instant)
      and not exists(select 1 from public.booking_rooms r
        where public.booking_room_occupied(r.id,d::date,instant)))
  into enabled, villa_free
  from generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') d;

  select coalesce(array_agg(r.id),array[]::uuid[]) into available_ids
  from public.booking_rooms r where r.is_active and r.is_sellable and not exists (
    select 1 from generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') d
    where public.booking_villa_occupied(d::date,instant) or public.booking_room_occupied(r.id,d::date,instant));
  select exists(select 1 from public.booking_rooms r where not r.is_fallback
    and (not r.is_active or not r.is_sellable or not (r.id = any(available_ids)))) into normal_unavailable;
  select coalesce(jsonb_agg(jsonb_build_object('roomId',r.id,'code',r.code,
    'publicName',r.public_name,'price',null) order by r.is_fallback,r.sort_order),'[]'::jsonb)
  into options from public.booking_rooms r
  where enabled and r.id = any(available_ids) and (not r.is_fallback or normal_unavailable);
  return jsonb_build_object('salesMode',case when enabled then 'room_and_villa' else 'villa_only' end,
    'roomBookingEnabled',enabled,'roomBookable',jsonb_array_length(options)>0,
    'villaBookable',villa_free,'availableRoomOptions',options,'pricingStatus','not_configured');
end;
$$;

-- Sharing the existing date mutex serializes conflicting villa/room decisions.
-- Different rooms on a night still succeed; no date-wide room reservation is made.
create function public.acquire_room_inventory_hold(p_room_ids uuid[], p_check_in date, p_check_out date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.booking_room_holds; instant timestamptz; d date; room uuid;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in
    or p_check_out - p_check_in > 366 or p_check_in < (clock_timestamp() at time zone 'Asia/Taipei')::date
    or coalesce(cardinality(p_room_ids),0) < 1 or cardinality(p_room_ids) > 6
    or exists(select 1 from unnest(p_room_ids) r where r is null)
    or cardinality(p_room_ids) <> (select count(distinct r) from unnest(p_room_ids) r)
    or (select count(*) from public.booking_rooms where id = any(p_room_ids) and is_active and is_sellable) <> cardinality(p_room_ids)
  then raise exception using errcode='22023',message='invalid_room_hold'; end if;
  perform public.lock_villa_inventory_nights(p_check_in,p_check_out);
  instant := clock_timestamp();
  for d in select x::date from generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') x loop
    if not public.booking_room_enabled(d) then
      return jsonb_build_object('ok',false,'code','room_booking_disabled');
    end if;
    if public.booking_villa_occupied(d,instant) then
      return jsonb_build_object('ok',false,'code','date_unavailable');
    end if;
    for room in select r from unnest(p_room_ids) r order by r loop
      perform pg_advisory_xact_lock(hashtextextended('mumbao:room-night:'||room::text||':'||d::text,0));
      if public.booking_room_occupied(room,d,instant) then
        return jsonb_build_object('ok',false,'code','room_unavailable');
      end if;
    end loop;
  end loop;
  insert into public.booking_room_holds(check_in,check_out,hold_expires_at)
    values(p_check_in,p_check_out,instant+interval '15 minutes') returning * into h;
  insert into public.booking_room_hold_nights(hold_id,room_id,stay_date)
    select h.id,r,night::date from unnest(p_room_ids) r cross join
    generate_series(p_check_in::timestamp,(p_check_out-1)::timestamp,interval '1 day') night;
  return jsonb_build_object('ok',true,'hold',to_jsonb(h));
end;
$$;

create function public.transition_room_inventory_hold(p_id uuid,p_status text,p_review_minutes integer default 120)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.booking_room_holds; instant timestamptz;
begin
  select * into h from public.booking_room_holds where id=p_id;
  if not found then raise exception using errcode='22023',message='unknown_room_hold'; end if;
  perform public.lock_villa_inventory_nights(h.check_in,h.check_out);
  select * into h from public.booking_room_holds where id=p_id for update;
  instant := clock_timestamp();
  if p_status is null or p_status not in ('payment_review','confirmed','cancelled')
    or p_review_minutes is null or p_review_minutes not between 15 and 1440 then
    raise exception using errcode='22023',message='invalid_room_transition';
  end if;
  if p_status = h.status then return jsonb_build_object('ok',true,'hold',to_jsonb(h)); end if;
  if not coalesce(public.booking_room_hold_active(h.status,h.hold_expires_at,h.review_expires_at,instant),false)
    or not (p_status='cancelled' or (h.status='payment_hold' and p_status='payment_review')
      or (h.status='payment_review' and p_status='confirmed')) then
    return jsonb_build_object('ok',false,'code','room_hold_expired_or_invalid_transition');
  end if;
  update public.booking_room_holds set status=p_status,updated_at=instant,
    review_expires_at=case when p_status='payment_review' then instant+make_interval(mins=>p_review_minutes) else review_expires_at end
    where id=p_id returning * into h;
  return jsonb_build_object('ok',true,'hold',to_jsonb(h));
end;
$$;

create function public.get_booking_inventory_calendar(p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>732 then
    raise exception using errcode='22023',message='invalid_date_range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',d::date,
    'roomBookingEnabled',a->'roomBookingEnabled','roomBookable',a->'roomBookable',
    'villaBookable',a->'villaBookable') order by d),'[]'::jsonb) into result
  from generate_series(p_from::timestamp,(p_to-1)::timestamp,interval '1 day') d
  cross join lateral public.get_booking_room_availability(d::date,d::date+1) a;
  return result;
end;
$$;

create function public.set_booking_room_sales_date(p_date date,p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_date is null then raise exception using errcode='22023',message='invalid_date'; end if;
  perform public.lock_villa_inventory_nights(p_date,p_date+1);
  insert into public.booking_room_sales_dates(date,room_booking_enabled_override) values(p_date,p_enabled)
    on conflict(date) do update set room_booking_enabled_override=excluded.room_booking_enabled_override,updated_at=now();
end;
$$;
create function public.set_booking_room_block(p_room uuid,p_date date,p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_date is null or p_enabled is null or not exists(select 1 from public.booking_rooms where id=p_room) then
    raise exception using errcode='22023',message='invalid_room_block'; end if;
  perform public.lock_villa_inventory_nights(p_date,p_date+1);
  if p_enabled and (public.booking_villa_occupied(p_date,clock_timestamp()) or exists(
    select 1 from public.booking_room_hold_nights n join public.booking_room_holds h on h.id=n.hold_id
    where n.room_id=p_room and n.stay_date=p_date
    and public.booking_room_hold_active(h.status,h.hold_expires_at,h.review_expires_at,clock_timestamp()))) then
    raise exception using errcode='23P01',message='room_inventory_conflict'; end if;
  insert into public.booking_room_blocks(room_id,stay_date,is_active) values(p_room,p_date,p_enabled)
    on conflict(room_id,stay_date) do update set is_active=excluded.is_active,updated_at=now();
end;
$$;

-- Add a guard without replacing legacy villa payment, pricing or snapshot code.
create function public.guard_villa_against_room_inventory()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare active boolean; instant timestamptz;
begin
  if tg_table_name='booking_requests' then
    active := coalesce(public.booking_room_hold_active(new.status,new.hold_expires_at,new.review_expires_at,clock_timestamp()),false);
  else active := new.status='confirmed'; end if;
  if not active then return new; end if;
  perform public.lock_villa_inventory_nights(new.check_in,new.check_out);
  instant := clock_timestamp();
  if exists(select 1 from public.booking_rooms r cross join
    generate_series(new.check_in::timestamp,(new.check_out-1)::timestamp,interval '1 day') d
    where public.booking_room_occupied(r.id,d::date,instant)) then
    raise exception using errcode='23P01',message='villa_inventory_conflict';
  end if;
  return new;
end;
$$;
create trigger guard_villa_room_requests before insert or update on public.booking_requests
  for each row execute function public.guard_villa_against_room_inventory();
create trigger guard_villa_room_external before insert or update on public.booking_external_reservations
  for each row execute function public.guard_villa_against_room_inventory();
create trigger guard_villa_room_blocks before insert or update on public.booking_availability_blocks
  for each row execute function public.guard_villa_against_room_inventory();

-- Preserve the public villa calendar contract while including room occupation.
create or replace function public.get_public_booking_unavailable_ranges(p_check_in date,p_check_out date)
returns table(id uuid,check_in date,check_out date,source text,hold_expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.id,b.check_in,b.check_out,b.source,null::timestamptz
    from public.booking_availability_blocks b where b.status='confirmed' and b.check_in<p_check_out and b.check_out>p_check_in
  union all
  select e.id,e.check_in,e.check_out,e.source,null::timestamptz
    from public.booking_external_reservations e where e.status='confirmed' and e.check_in<p_check_out and e.check_out>p_check_in
  union all
  select r.id,r.check_in,r.check_out,case when r.status='payment_review' then 'booking_payment_review' else 'booking_request' end,
    case when r.status='payment_review' then r.review_expires_at else r.hold_expires_at end
    from public.booking_requests r where r.check_in<p_check_out and r.check_out>p_check_in
    and public.booking_room_hold_active(r.status,r.hold_expires_at,r.review_expires_at,now())
  union all
  select h.id,h.check_in,h.check_out,'room_inventory',
    case when h.status='payment_review' then h.review_expires_at else h.hold_expires_at end
    from public.booking_room_holds h where h.check_in<p_check_out and h.check_out>p_check_in
    and public.booking_room_hold_active(h.status,h.hold_expires_at,h.review_expires_at,now())
  union all
  select b.room_id,b.stay_date,b.stay_date+1,'room_block',null::timestamptz
    from public.booking_room_blocks b where b.is_active and b.stay_date>=p_check_in and b.stay_date<p_check_out;
$$;

alter table public.booking_rooms enable row level security;
alter table public.booking_room_sales_dates enable row level security;
alter table public.booking_room_holds enable row level security;
alter table public.booking_room_hold_nights enable row level security;
alter table public.booking_room_blocks enable row level security;
revoke all on public.booking_rooms,public.booking_room_sales_dates,public.booking_room_holds,
  public.booking_room_hold_nights,public.booking_room_blocks from public,anon,authenticated,service_role;
grant select on public.booking_rooms,public.booking_room_sales_dates,public.booking_room_holds,
  public.booking_room_hold_nights,public.booking_room_blocks to service_role;
revoke all on function public.booking_room_hold_active(text,timestamptz,timestamptz,timestamptz),
  public.booking_room_enabled(date),public.booking_room_occupied(uuid,date,timestamptz),
  public.booking_villa_occupied(date,timestamptz),public.guard_villa_against_room_inventory(),
  public.get_booking_room_availability(date,date),public.get_booking_inventory_calendar(date,date),public.acquire_room_inventory_hold(uuid[],date,date),
  public.transition_room_inventory_hold(uuid,text,integer),public.set_booking_room_sales_date(date,boolean),
  public.set_booking_room_block(uuid,date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_booking_room_availability(date,date),public.get_booking_inventory_calendar(date,date),
  public.acquire_room_inventory_hold(uuid[],date,date),public.transition_room_inventory_hold(uuid,text,integer),
  public.set_booking_room_sales_date(date,boolean),public.set_booking_room_block(uuid,date,boolean) to service_role;

-- Preserve the existing villa RPC response contract for room conflicts.
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

  if exists(select 1 from public.booking_rooms r cross join
    generate_series(requested_check_in::timestamp,(requested_check_out-1)::timestamp,interval '1 day') d
    where public.booking_room_occupied(r.id,d::date,database_now)) then
    return jsonb_build_object('ok', false, 'code', 'date_unavailable');
  end if;

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

notify pgrst, 'reload schema';
commit;
