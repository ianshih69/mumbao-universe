begin;

-- Requires complete hold/review/audit/management migrations plus room Phases 1/2.
-- The Phase 1.5 schema-only bootstrap is insufficient. No checkout flag changes.
do $$
begin
  if to_regclass('public.booking_payment_records') is null
    or to_regclass('public.booking_payment_admin_audit_logs') is null
    or to_regclass('public.booking_management_sessions') is null
    or to_regclass('public.booking_lookup_rate_limits') is null
    or to_regclass('public.booking_cancellation_audit_logs') is null
    or to_regprocedure('public.report_booking_bank_transfer(text,text,text,text,integer)') is null
    or to_regprocedure('public.review_booking_bank_transfer(uuid,uuid,text)') is null
    or to_regprocedure('public.get_booking_management_session(text)') is null then
    raise exception 'room_checkout_requires_complete_payment_and_management_schema';
  end if;
end;
$$;

alter table public.booking_requests
  add column room_id uuid references public.booking_rooms(id),
  add column client_request_id uuid;
create unique index booking_requests_client_request_id_unique_idx
  on public.booking_requests(client_request_id) where client_request_id is not null;
alter table public.booking_room_holds
  add column booking_request_id uuid unique references public.booking_requests(id);

-- No capacity backfill: unconfigured master capacity fails closed at checkout.

create or replace function public.booking_villa_occupied(p_date date, p_now timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists(select 1 from public.booking_availability_blocks
    where status = 'confirmed' and check_in <= p_date and check_out > p_date)
  or exists(select 1 from public.booking_external_reservations
    where status = 'confirmed' and check_in <= p_date and check_out > p_date)
  or exists(select 1 from public.booking_requests
    where stay_type <> 'room' and check_in <= p_date and check_out > p_date
    and public.booking_room_hold_active(status,hold_expires_at,review_expires_at,p_now));
$$;

create or replace function public.get_booking_room_availability(p_check_in date, p_check_out date)
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
    'publicName',r.public_name,'capacity',r.capacity,'price',null)
    order by r.is_fallback,r.sort_order),'[]'::jsonb)
  into options from public.booking_rooms r
  where enabled and r.id = any(available_ids) and (not r.is_fallback or normal_unavailable);
  return jsonb_build_object('salesMode',case when enabled then 'room_and_villa' else 'villa_only' end,
    'roomBookingEnabled',enabled,'roomBookable',jsonb_array_length(options)>0,
    'villaBookable',villa_free,'availableRoomOptions',options,'pricingStatus','not_configured');
end;
$$;

create or replace function public.get_booking_inventory_calendar(p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>732 then
    raise exception using errcode='22023',message='invalid_date_range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date',d::date,
    'roomBookingEnabled',a->'roomBookingEnabled','roomBookable',a->'roomBookable',
    'villaBookable',a->'villaBookable','availableRoomOptions',a->'availableRoomOptions') order by d),'[]'::jsonb)
    into result
  from generate_series(p_from::timestamp,(p_to-1)::timestamp,interval '1 day') d
  cross join lateral public.get_booking_room_availability(d::date,d::date+1) a;
  return result;
end;
$$;

-- Legacy guards inspect villa requests only. The separate Phase 1 room guard
-- still protects villa requests, external reservations and manual blocks.
create or replace function public.guard_booking_request_inventory_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare instant timestamptz := clock_timestamp();
begin
  if new.stay_type = 'room' then return new; end if;
  if not public.booking_room_hold_active(new.status,new.hold_expires_at,new.review_expires_at,instant) then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status and new.check_in = old.check_in and new.check_out = old.check_out
      and new.hold_expires_at is not distinct from old.hold_expires_at
      and new.review_expires_at is not distinct from old.review_expires_at then return new; end if;
  end if;
  perform public.lock_villa_inventory_nights(new.check_in,new.check_out);
  instant := clock_timestamp();
  if exists(select 1 from public.booking_availability_blocks b where b.status='confirmed'
    and b.check_in<new.check_out and b.check_out>new.check_in)
    or exists(select 1 from public.booking_external_reservations e where e.status='confirmed'
      and e.check_in<new.check_out and e.check_out>new.check_in)
    or exists(select 1 from public.booking_requests r where r.id is distinct from new.id
      and r.stay_type <> 'room' and r.check_in<new.check_out and r.check_out>new.check_in
      and public.booking_room_hold_active(r.status,r.hold_expires_at,r.review_expires_at,instant)) then
    raise exception using errcode='23P01',message='villa_inventory_conflict';
  end if;
  return new;
end;
$$;

create or replace function public.guard_external_reservation_inventory_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare instant timestamptz;
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status=old.status and new.check_in=old.check_in and new.check_out=old.check_out then return new; end if;
  end if;
  perform public.lock_villa_inventory_nights(new.check_in,new.check_out);
  instant := clock_timestamp();
  if exists(select 1 from public.booking_availability_blocks b where b.external_reservation_id is distinct from new.id
      and b.status='confirmed' and b.check_in<new.check_out and b.check_out>new.check_in)
    or exists(select 1 from public.booking_external_reservations e where e.id is distinct from new.id
      and e.status='confirmed' and e.check_in<new.check_out and e.check_out>new.check_in)
    or exists(select 1 from public.booking_requests r where r.stay_type <> 'room'
      and r.check_in<new.check_out and r.check_out>new.check_in
      and public.booking_room_hold_active(r.status,r.hold_expires_at,r.review_expires_at,instant)) then
    raise exception using errcode='23P01',message='villa_inventory_conflict';
  end if;
  return new;
end;
$$;

create or replace function public.guard_availability_block_inventory_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare instant timestamptz;
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status=old.status and new.check_in=old.check_in and new.check_out=old.check_out then return new; end if;
  end if;
  perform public.lock_villa_inventory_nights(new.check_in,new.check_out);
  instant := clock_timestamp();
  if exists(select 1 from public.booking_availability_blocks b where b.id is distinct from new.id
      and b.status='confirmed' and b.check_in<new.check_out and b.check_out>new.check_in)
    or exists(select 1 from public.booking_external_reservations e where e.id is distinct from new.external_reservation_id
      and e.status='confirmed' and e.check_in<new.check_out and e.check_out>new.check_in)
    or exists(select 1 from public.booking_requests r where r.stay_type <> 'room'
      and r.check_in<new.check_out and r.check_out>new.check_in
      and public.booking_room_hold_active(r.status,r.hold_expires_at,r.review_expires_at,instant)) then
    raise exception using errcode='23P01',message='villa_inventory_conflict';
  end if;
  return new;
end;
$$;

create or replace function public.guard_villa_against_room_inventory()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare active boolean; instant timestamptz;
begin
  if tg_table_name='booking_requests' then
    if new.stay_type='room' then return new; end if;
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

create function public.guard_room_booking_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare room public.booking_rooms; instant timestamptz; options jsonb; night jsonb;
  price jsonb; total bigint := 0; i integer := 0; base numeric; discount numeric;
  after_calendar numeric; final_price numeric; room_snapshot jsonb;
begin
  if tg_op='UPDATE' then
    if old.stay_type='room' or new.stay_type='room' then
      if row(new.stay_type,new.room_id,new.check_in,new.check_out,new.client_request_id,
        new.guest_count,new.adults,new.children,new.room_count,new.quoted_total,new.deposit_rate,
        new.deposit_amount,new.balance_amount,new.pricing_breakdown,new.quoted_at,new.pricing_rule_set_id,
        new.submitted_snapshot,new.recovery_token_hash,new.selected_package_type)
        is distinct from row(old.stay_type,old.room_id,old.check_in,old.check_out,old.client_request_id,
        old.guest_count,old.adults,old.children,old.room_count,old.quoted_total,old.deposit_rate,
        old.deposit_amount,old.balance_amount,old.pricing_breakdown,old.quoted_at,old.pricing_rule_set_id,
        old.submitted_snapshot,old.recovery_token_hash,old.selected_package_type) then
        raise exception using errcode='55000',message='room_booking_snapshot_is_immutable';
      end if;
    end if;
  end if;
  if new.stay_type <> 'room' then
    if new.room_id is not null then raise exception using errcode='22023',message='invalid_room_id'; end if;
    return new;
  end if;
  if tg_op='INSERT' then
    if new.room_id is null or new.client_request_id is null or new.check_in is null or new.check_out is null
      or new.check_out<=new.check_in or new.check_out-new.check_in>366
      or new.check_in<(clock_timestamp() at time zone 'Asia/Taipei')::date
      or new.room_count is distinct from 1 or new.status is distinct from 'payment_hold' then
      raise exception using errcode='22023',message='invalid_room_booking_request';
    end if;
    select * into room from public.booking_rooms where id=new.room_id for share;
    if not found or not room.is_active or not room.is_sellable then
      raise exception using errcode='22023',message='invalid_room_id'; end if;
    if room.capacity is null or new.guest_count is null or new.adults is null or new.children is null
      or new.adults<1 or new.children<0 or new.guest_count<new.adults+new.children
      or new.guest_count>room.capacity then
      raise exception using errcode='22023',message='room_capacity_exceeded'; end if;
    if new.recovery_token_hash is null or new.recovery_token_hash !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(new.submitted_snapshot) is distinct from 'object'
      or jsonb_typeof(new.submitted_snapshot->'summary') is distinct from 'object'
      or jsonb_typeof(new.submitted_snapshot->'contact') is distinct from 'object' then
      raise exception using errcode='22023',message='invalid_booking_recovery_snapshot'; end if;

    -- Phase 2 server quote remains the price source. The service-only RPC must
    -- receive a freshly recomputed quote, never browser-supplied prices.
    price := new.pricing_breakdown;
    if jsonb_typeof(price) is distinct from 'object'
      or price->>'stayType' is distinct from 'room' or price->>'stay_type' is distinct from 'room'
      or price->>'room_id' is distinct from new.room_id::text
      or price->>'room_code' is distinct from room.code
      or price#>>'{room,roomId}' is distinct from new.room_id::text
      or price#>>'{room,code}' is distinct from room.code
      or (price->>'version')::integer is distinct from 1
      or price->>'status' is distinct from 'resolved'
      or jsonb_typeof(price->'breakdown') is distinct from 'array' then
      raise exception using errcode='22023',message='invalid_room_pricing_snapshot'; end if;
    for night in select value from jsonb_array_elements(price->'breakdown') loop
      base := (night->>'basePrice')::numeric;
      discount := (night->>'calendarDiscountRate')::numeric;
      after_calendar := (night->>'priceAfterCalendarDiscount')::numeric;
      final_price := (night->>'finalNightPrice')::numeric;
      if night->>'date' is distinct from (new.check_in+i)::text
        or night->>'pricingStatus' is distinct from 'configured'
        or nullif(night->>'ruleSetId','')::uuid is null
        or base is null or base not between 1 and 10000000 or trunc(base)<>base
        or discount is null or discount not between 0.01 and 1
        or after_calendar is distinct from round(base*discount)
        or (night->>'stayDiscountRate')::numeric is distinct from (case when i=0 then 1 else 0.95 end)
        or final_price is distinct from round(after_calendar*(case when i=0 then 1 else 0.95 end))
        or (night->>'base_price')::numeric is distinct from base
        or (night->>'calendar_discount_rate')::numeric is distinct from discount
        or (night->>'price_after_calendar_discount')::numeric is distinct from after_calendar
        or (night->>'stay_discount_rate')::numeric is distinct from (night->>'stayDiscountRate')::numeric
        or (night->>'final_nightly_price')::numeric is distinct from final_price then
        raise exception using errcode='22023',message='invalid_room_pricing_snapshot'; end if;
      total := total+final_price::bigint;
      i := i+1;
    end loop;
    if i<>new.check_out-new.check_in or total<=0 or total>2147483647
      or new.quoted_total is distinct from total or (price->>'total')::bigint is distinct from total
      or new.deposit_rate is distinct from 0.30
      or new.deposit_amount is distinct from round(total*0.30)
      or new.balance_amount is distinct from total-round(total*0.30)
      or (price->>'depositRate')::numeric is distinct from new.deposit_rate
      or (price->>'depositAmount')::integer is distinct from new.deposit_amount
      or (price->>'balanceAmount')::integer is distinct from new.balance_amount then
      raise exception using errcode='22023',message='invalid_room_pricing_snapshot'; end if;
    room_snapshot := jsonb_build_object('roomId',room.id,'code',room.code,'publicName',room.public_name,'capacity',room.capacity);
    new.pricing_breakdown := price || jsonb_build_object('room',room_snapshot,'room_name',room.public_name,'capacity',room.capacity);
    new.submitted_snapshot := new.submitted_snapshot || jsonb_build_object(
      'pricing',jsonb_build_object('quotedTotal',new.quoted_total,'depositRate',new.deposit_rate,
        'depositAmount',new.deposit_amount,'balanceAmount',new.balance_amount,'pricingBreakdown',new.pricing_breakdown),
      'summary',(new.submitted_snapshot->'summary') || jsonb_build_object('stayType','room','room',room_snapshot,
        'adultCount',new.adults,'childCount',new.children,'guestCount',new.guest_count,'nightCount',i));
  end if;

  -- Releasing inventory needs no date lock. review(cancelled) already holds a
  -- request-row lock, so acquiring the date lock here would invert lock order.
  if tg_op='UPDATE' and not coalesce(public.booking_room_hold_active(
    new.status,new.hold_expires_at,new.review_expires_at,clock_timestamp()),false) then return new; end if;
  perform public.lock_villa_inventory_nights(new.check_in,new.check_out);
  instant := clock_timestamp();
  if tg_op='INSERT' then
    options := public.get_booking_room_availability(new.check_in,new.check_out);
    if not (options->>'roomBookingEnabled')::boolean then
      raise exception using errcode='23P01',message='room_booking_disabled'; end if;
    if not exists(select 1 from jsonb_array_elements(options->'availableRoomOptions') r
      where r->>'roomId'=new.room_id::text) then
      raise exception using errcode='23P01',message='room_unavailable'; end if;
    new.hold_expires_at := instant+interval '15 minutes';
    new.review_expires_at := null;
  end if;
  if exists(select 1 from generate_series(new.check_in::timestamp,(new.check_out-1)::timestamp,interval '1 day') d
      where public.booking_villa_occupied(d::date,instant))
    or exists(select 1 from public.booking_room_blocks b where b.room_id=new.room_id and b.is_active
      and b.stay_date>=new.check_in and b.stay_date<new.check_out)
    or exists(select 1 from public.booking_room_hold_nights n join public.booking_room_holds h on h.id=n.hold_id
      where n.room_id=new.room_id and n.stay_date>=new.check_in and n.stay_date<new.check_out
      and h.booking_request_id is distinct from new.id
      and public.booking_room_hold_active(h.status,h.hold_expires_at,h.review_expires_at,instant)) then
    raise exception using errcode='23P01',message='room_inventory_conflict';
  end if;
  return new;
end;
$$;
create trigger guard_room_booking_request before insert or update on public.booking_requests
  for each row execute function public.guard_room_booking_request();

-- AFTER triggers see the canonical request. A hold/night insertion failure
-- aborts the whole request statement, including its unique idempotency key.
create function public.sync_room_booking_hold()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted_hold_id uuid;
begin
  if new.stay_type <> 'room' then return new; end if;
  if tg_op='INSERT' then
    insert into public.booking_room_holds(booking_request_id,check_in,check_out,status,hold_expires_at,review_expires_at)
      values(new.id,new.check_in,new.check_out,new.status,new.hold_expires_at,new.review_expires_at)
      returning id into inserted_hold_id;
    insert into public.booking_room_hold_nights(hold_id,room_id,stay_date)
      select inserted_hold_id,new.room_id,d::date
      from generate_series(new.check_in::timestamp,(new.check_out-1)::timestamp,interval '1 day') d;
  else
    update public.booking_room_holds set
      status=case when new.status in ('payment_hold','payment_review','confirmed') then new.status else 'cancelled' end,
      hold_expires_at=new.hold_expires_at,review_expires_at=new.review_expires_at,updated_at=clock_timestamp()
      where booking_request_id=new.id;
    if not found then raise exception 'room_booking_hold_missing'; end if;
  end if;
  return new;
end;
$$;
create trigger sync_room_booking_hold after insert or update on public.booking_requests
  for each row execute function public.sync_room_booking_hold();

-- Standalone Phase 1 transitions must not diverge a linked hold from its order.
create function public.protect_linked_room_hold()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.booking_requests;
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.booking_request_id is not null and (tg_op='DELETE'
      or new.booking_request_id is distinct from old.booking_request_id
      or new.id is distinct from old.id) then
      raise exception using errcode='55000',message='linked_room_hold_is_managed_by_booking'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.booking_request_id is null then return new; end if;
  select * into r from public.booking_requests where id=new.booking_request_id;
  if not found or r.stay_type <> 'room' or new.check_in is distinct from r.check_in
    or new.check_out is distinct from r.check_out
    or new.hold_expires_at is distinct from r.hold_expires_at
    or new.review_expires_at is distinct from r.review_expires_at
    or new.status is distinct from (case when r.status in ('payment_hold','payment_review','confirmed') then r.status else 'cancelled' end) then
    raise exception using errcode='55000',message='linked_room_hold_is_managed_by_booking'; end if;
  return new;
end;
$$;
create trigger protect_linked_room_hold before insert or update or delete on public.booking_room_holds
  for each row execute function public.protect_linked_room_hold();

create function public.protect_linked_room_night()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.booking_requests;
begin
  if tg_op in ('UPDATE','DELETE') and exists(select 1 from public.booking_room_holds
    where id=old.hold_id and booking_request_id is not null) then
    raise exception using errcode='55000',message='linked_room_nights_are_immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  select b.* into r from public.booking_room_holds h join public.booking_requests b on b.id=h.booking_request_id
    where h.id=new.hold_id;
  if found and (new.room_id is distinct from r.room_id or new.stay_date<r.check_in or new.stay_date>=r.check_out) then
    raise exception using errcode='55000',message='linked_room_nights_are_immutable'; end if;
  return new;
end;
$$;
create trigger protect_linked_room_night before insert or update or delete on public.booking_room_hold_nights
  for each row execute function public.protect_linked_room_night();

-- Same success envelope as acquire_villa_booking_hold; duplicate UUIDs never
-- return private existing rows or associate a new recovery token with them.
create function public.acquire_room_booking_hold(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.booking_requests; client_id uuid; instant timestamptz; attempt integer;
  violated_constraint text; conflict_message text; start_date date; end_date date;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or p_request->>'stay_type' is distinct from 'room' then
    raise exception using errcode='22023',message='invalid_room_booking_request'; end if;
  client_id := (p_request->>'client_request_id')::uuid;
  if client_id is null then raise exception using errcode='22023',message='invalid_client_request_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mumbao:room-request:'||client_id::text,0));
  if exists(select 1 from public.booking_requests where client_request_id=client_id) then
    return jsonb_build_object('ok',false,'code','duplicate_booking_request'); end if;
  start_date := (p_request->>'check_in')::date;
  end_date := (p_request->>'check_out')::date;
  if start_date is null or end_date is null or end_date<=start_date or end_date-start_date>366
    or start_date<(clock_timestamp() at time zone 'Asia/Taipei')::date then
    raise exception using errcode='22023',message='invalid_date_range'; end if;
  perform public.lock_villa_inventory_nights(start_date,end_date);
  instant := clock_timestamp();
  for attempt in 1..20 loop
    begin
      insert into public.booking_requests(customer_profile_id,guest_name,guest_email,guest_phone,
        check_in,check_out,guest_count,notes,stay_type,room_id,client_request_id,adults,children,room_count,
        has_pets,pet_count,pet_type,pet_notes,source,raw_payload,selected_package_type,pricing_rule_set_id,
        quoted_total,deposit_rate,deposit_amount,balance_amount,pricing_breakdown,
        quoted_at,status,hold_expires_at,recovery_token_hash,submitted_snapshot)
      values(nullif(p_request->>'customer_profile_id','')::uuid,p_request->>'guest_name',
        nullif(p_request->>'guest_email',''),nullif(p_request->>'guest_phone',''),
        start_date,end_date,(p_request->>'guest_count')::integer,nullif(p_request->>'notes',''),
        'room',(p_request->>'room_id')::uuid,client_id,
        coalesce((p_request->>'adults')::integer,(p_request->>'guest_count')::integer),
        coalesce((p_request->>'children')::integer,0),1,coalesce((p_request->>'has_pets')::boolean,false),
        nullif(p_request->>'pet_count','')::integer,nullif(p_request->>'pet_type',''),nullif(p_request->>'pet_notes',''),
        coalesce(nullif(p_request->>'source',''),'official_site'),coalesce(p_request->'raw_payload','{}'::jsonb),
        nullif(p_request->>'selected_package_type',''),nullif(p_request->>'pricing_rule_set_id','')::uuid,
        (p_request->>'quoted_total')::integer,(p_request->>'deposit_rate')::numeric,
        (p_request->>'deposit_amount')::integer,(p_request->>'balance_amount')::integer,p_request->'pricing_breakdown',
        coalesce(nullif(p_request->>'quoted_at','')::timestamptz,instant),'payment_hold',instant+interval '15 minutes',
        p_request->>'recovery_token_hash',p_request->'submitted_snapshot')
      returning * into r;
      return jsonb_build_object('ok',true,'database_now',instant,'request',to_jsonb(r));
    exception
      when unique_violation then
        get stacked diagnostics violated_constraint=constraint_name;
        if violated_constraint='booking_requests_client_request_id_unique_idx' then
          return jsonb_build_object('ok',false,'code','duplicate_booking_request');
        elsif violated_constraint<>'booking_requests_booking_reference_key' then raise; end if;
      when exclusion_violation then
        get stacked diagnostics conflict_message=message_text;
        if conflict_message in ('room_booking_disabled','room_unavailable','room_inventory_conflict','villa_inventory_conflict') then
          return jsonb_build_object('ok',false,'code',case when conflict_message='room_booking_disabled'
            then 'room_booking_disabled' else 'date_unavailable' end);
        end if;
        raise;
    end;
  end loop;
  raise exception using errcode='54000',message='booking_reference_collision_retry_exhausted';
end;
$$;

revoke all on function public.guard_room_booking_request(),public.sync_room_booking_hold(),
  public.protect_linked_room_hold(),public.protect_linked_room_night(),
  public.acquire_room_booking_hold(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.acquire_room_booking_hold(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
