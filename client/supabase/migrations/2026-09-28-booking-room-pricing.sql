begin;

-- Room prices share date periods, never villa amounts or discount settings.
create table public.booking_room_pricing_settings (
  rule_set_id uuid primary key references public.booking_price_rule_sets(id),
  room_weekday_discount_rate numeric not null check (room_weekday_discount_rate between 0.01 and 1 and trunc(room_weekday_discount_rate,4)=room_weekday_discount_rate),
  room_weekend_discount_rate numeric not null check (room_weekend_discount_rate between 0.01 and 1 and trunc(room_weekend_discount_rate,4)=room_weekend_discount_rate),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.booking_room_rates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.booking_rooms(id),
  rule_set_id uuid not null references public.booking_price_rule_sets(id),
  weekday_base_price numeric check (weekday_base_price between 1 and 10000000 and trunc(weekday_base_price)=weekday_base_price),
  friday_base_price numeric check (friday_base_price between 1 and 10000000 and trunc(friday_base_price)=friday_base_price),
  saturday_base_price numeric check (saturday_base_price between 1 and 10000000 and trunc(saturday_base_price)=saturday_base_price),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(room_id,rule_set_id)
);
create table public.booking_room_price_overrides (
  room_id uuid not null references public.booking_rooms(id), stay_date date not null,
  base_price_override numeric check (base_price_override between 1 and 10000000 and trunc(base_price_override)=base_price_override),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(room_id,stay_date)
);
create table public.booking_room_discount_dates (
  stay_date date primary key,
  room_discount_rate_override numeric check (room_discount_rate_override between 0.01 and 1 and trunc(room_discount_rate_override,4)=room_discount_rate_override),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create function public.save_booking_room_price_defaults(p_payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare period uuid := (p_payload->>'ruleSetId')::uuid; item jsonb;
begin
  if jsonb_typeof(p_payload->'rates') is distinct from 'array' then raise exception 'invalid_room_rates'; end if;
  if not exists(select 1 from booking_price_rule_sets where id=period and is_active)
    or jsonb_array_length(p_payload->'rates') <> (select count(*) from booking_rooms where is_active and is_sellable)
    or (select count(distinct r->>'room_id') from jsonb_array_elements(p_payload->'rates') r) <> jsonb_array_length(p_payload->'rates') then
    raise exception 'invalid_room_rates'; end if;
  perform pg_advisory_xact_lock(hashtextextended('room-pricing-default:'||period::text,0));
  insert into booking_room_pricing_settings(rule_set_id,room_weekday_discount_rate,room_weekend_discount_rate)
    values(period,(p_payload->>'weekdayDiscount')::numeric,(p_payload->>'weekendDiscount')::numeric)
    on conflict(rule_set_id) do update set room_weekday_discount_rate=excluded.room_weekday_discount_rate,
      room_weekend_discount_rate=excluded.room_weekend_discount_rate,updated_at=now();
  for item in select * from jsonb_array_elements(p_payload->'rates') loop
    if not exists(select 1 from booking_rooms where id=(item->>'room_id')::uuid and is_active and is_sellable)
      or not (item ?& array['weekday_base_price','friday_base_price','saturday_base_price']) then raise exception 'invalid_room_rate'; end if;
    insert into booking_room_rates(room_id,rule_set_id,weekday_base_price,friday_base_price,saturday_base_price)
      values((item->>'room_id')::uuid,period,(item->>'weekday_base_price')::numeric,(item->>'friday_base_price')::numeric,(item->>'saturday_base_price')::numeric)
      on conflict(room_id,rule_set_id) do update set weekday_base_price=excluded.weekday_base_price,
        friday_base_price=excluded.friday_base_price,saturday_base_price=excluded.saturday_base_price,updated_at=now();
  end loop;
end;
$$;

create function public.save_booking_room_price_day(p_payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d date := (p_payload->>'date')::date; item jsonb;
begin
  if d is null or jsonb_typeof(p_payload->'bases') is distinct from 'array' then raise exception 'invalid_room_price_day'; end if;
  if (select count(*) from booking_price_rule_sets where is_active and effective_from<=d and effective_to>=d) <> 1
    or (select count(distinct r->>'room_id') from jsonb_array_elements(p_payload->'bases') r) <> jsonb_array_length(p_payload->'bases') then
    raise exception 'invalid_room_price_day'; end if;
  perform public.lock_villa_inventory_nights(d,d+1);
  for item in select * from jsonb_array_elements(p_payload->'bases') loop
    if not exists(select 1 from booking_rooms where id=(item->>'room_id')::uuid and is_active and is_sellable)
      or not item ? 'base_price_override' then raise exception 'invalid_room_override'; end if;
    insert into booking_room_price_overrides(room_id,stay_date,base_price_override)
      values((item->>'room_id')::uuid,d,(item->>'base_price_override')::numeric)
      on conflict(room_id,stay_date) do update set base_price_override=excluded.base_price_override,updated_at=now();
  end loop;
  if p_payload ? 'discount' then
    insert into booking_room_discount_dates(stay_date,room_discount_rate_override) values(d,(p_payload->>'discount')::numeric)
      on conflict(stay_date) do update set room_discount_rate_override=excluded.room_discount_rate_override,updated_at=now();
  end if;
  if p_payload ? 'salesMode' then
    if jsonb_typeof(p_payload->'salesMode') not in ('boolean','null') then raise exception 'invalid_room_mode'; end if;
    perform public.set_booking_room_sales_date(d,(p_payload->>'salesMode')::boolean);
  end if;
end;
$$;

alter table public.booking_room_pricing_settings enable row level security;
alter table public.booking_room_rates enable row level security;
alter table public.booking_room_price_overrides enable row level security;
alter table public.booking_room_discount_dates enable row level security;
revoke all on public.booking_room_pricing_settings,public.booking_room_rates,public.booking_room_price_overrides,public.booking_room_discount_dates from public,anon,authenticated,service_role;
grant select,insert,update on public.booking_room_pricing_settings,public.booking_room_rates,public.booking_room_price_overrides,public.booking_room_discount_dates to service_role;
revoke all on function public.save_booking_room_price_defaults(jsonb),public.save_booking_room_price_day(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_booking_room_price_defaults(jsonb),public.save_booking_room_price_day(jsonb) to service_role;
commit;
