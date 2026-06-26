create extension if not exists pgcrypto;

create or replace function public.set_booking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.booking_settings (
  id integer primary key default 1,
  booking_window_months integer not null default 6,
  allow_villa_booking boolean not null default true,
  allow_room_booking boolean not null default false,
  total_room_count integer not null default 5,
  allow_pets boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_settings_singleton_check check (id = 1),
  constraint booking_settings_window_check check (booking_window_months between 1 and 24),
  constraint booking_settings_total_room_count_check check (total_room_count = 5)
);

insert into public.booking_settings (
  id,
  booking_window_months,
  allow_villa_booking,
  allow_room_booking,
  total_room_count,
  allow_pets
)
values (1, 6, true, false, 5, true)
on conflict (id) do nothing;

create table if not exists public.booking_external_reservations (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  reference_number text,
  check_in date not null,
  check_out date not null,
  guest_name text,
  guest_count integer,
  amount numeric(12, 2),
  status text not null default 'pending_review',
  accommodation_name text,
  confidence integer,
  raw_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_external_reservations_date_check check (check_out > check_in),
  constraint booking_external_reservations_status_check check (status in ('confirmed', 'cancelled', 'pending_review'))
);

create table if not exists public.booking_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null,
  source text not null,
  external_reservation_id uuid references public.booking_external_reservations(id) on update cascade on delete set null,
  ical_uid text,
  check_in date not null,
  check_out date not null,
  status text not null default 'confirmed',
  title text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_availability_blocks_date_check check (check_out > check_in),
  constraint booking_availability_blocks_status_check check (status in ('confirmed', 'cancelled', 'pending_review'))
);

create table if not exists public.booking_availability_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  alert_type text not null,
  title text not null,
  description text,
  check_in date,
  check_out date,
  source text,
  related_reservation_id uuid references public.booking_external_reservations(id) on update cascade on delete set null,
  related_block_id uuid references public.booking_availability_blocks(id) on update cascade on delete set null,
  status text not null default 'open',
  handled_at timestamptz,
  handled_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_availability_alerts_severity_check check (severity in ('P0', 'P1', 'P2', 'review')),
  constraint booking_availability_alerts_status_check check (status in ('open', 'handled'))
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_email text,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  guest_count integer,
  notes text,
  status text not null default 'pending_review',
  stay_type text not null default 'villa',
  adults integer not null default 2,
  children integer not null default 0,
  room_count integer,
  has_pets boolean not null default false,
  pet_count integer,
  pet_type text,
  pet_notes text,
  source text not null default 'official_site',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_date_check check (check_out > check_in),
  constraint booking_requests_status_check check (status in ('pending_review', 'confirmed', 'cancelled')),
  constraint booking_requests_stay_type_check check (stay_type in ('villa', 'room')),
  constraint booking_requests_guest_counts_check check (adults >= 1 and children >= 0),
  constraint booking_requests_room_count_check check (
    (
      stay_type = 'villa'
      and (room_count is null or room_count = 5)
    )
    or (
      stay_type = 'room'
      and room_count between 1 and 5
    )
  ),
  constraint booking_requests_pet_details_check check (
    (
      has_pets = false
      and (pet_count is null or pet_count >= 0)
    )
    or (
      has_pets = true
      and pet_count >= 1
    )
  ),
  constraint booking_requests_pet_type_check check (pet_type is null or pet_type in ('dog', 'cat', 'other'))
);

alter table public.booking_requests
  add column if not exists stay_type text not null default 'villa',
  add column if not exists adults integer not null default 2,
  add column if not exists children integer not null default 0,
  add column if not exists room_count integer,
  add column if not exists has_pets boolean not null default false,
  add column if not exists pet_count integer,
  add column if not exists pet_type text,
  add column if not exists pet_notes text,
  add column if not exists source text not null default 'official_site',
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_stay_type_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_stay_type_check
      check (stay_type in ('villa', 'room'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_guest_counts_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_guest_counts_check
      check (adults >= 1 and children >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_room_count_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_room_count_check
      check (
        (
          stay_type = 'villa'
          and (room_count is null or room_count = 5)
        )
        or (
          stay_type = 'room'
          and room_count between 1 and 5
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_pet_details_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_pet_details_check
      check (
        (
          has_pets = false
          and (pet_count is null or pet_count >= 0)
        )
        or (
          has_pets = true
          and pet_count >= 1
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_requests_pet_type_check'
      and conrelid = 'public.booking_requests'::regclass
  ) then
    alter table public.booking_requests
      add constraint booking_requests_pet_type_check
      check (pet_type is null or pet_type in ('dog', 'cat', 'other'));
  end if;
end $$;

create index if not exists booking_settings_updated_at_idx
  on public.booking_settings(updated_at desc);

create index if not exists booking_external_reservations_dates_idx
  on public.booking_external_reservations(check_in, check_out, status);

create index if not exists booking_availability_blocks_dates_idx
  on public.booking_availability_blocks(check_in, check_out, status);

create unique index if not exists booking_availability_blocks_ical_uid_unique_idx
  on public.booking_availability_blocks(source, ical_uid)
  where ical_uid is not null;

create index if not exists booking_availability_alerts_status_idx
  on public.booking_availability_alerts(status, severity, created_at desc);

create index if not exists booking_requests_status_idx
  on public.booking_requests(status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_settings_updated_at'
      and tgrelid = 'public.booking_settings'::regclass
  ) then
    create trigger set_booking_settings_updated_at
      before update on public.booking_settings
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_external_reservations_updated_at'
      and tgrelid = 'public.booking_external_reservations'::regclass
  ) then
    create trigger set_booking_external_reservations_updated_at
      before update on public.booking_external_reservations
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_availability_blocks_updated_at'
      and tgrelid = 'public.booking_availability_blocks'::regclass
  ) then
    create trigger set_booking_availability_blocks_updated_at
      before update on public.booking_availability_blocks
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_availability_alerts_updated_at'
      and tgrelid = 'public.booking_availability_alerts'::regclass
  ) then
    create trigger set_booking_availability_alerts_updated_at
      before update on public.booking_availability_alerts
      for each row
      execute function public.set_booking_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_booking_requests_updated_at'
      and tgrelid = 'public.booking_requests'::regclass
  ) then
    create trigger set_booking_requests_updated_at
      before update on public.booking_requests
      for each row
      execute function public.set_booking_updated_at();
  end if;
end $$;

alter table public.booking_settings enable row level security;
alter table public.booking_external_reservations enable row level security;
alter table public.booking_availability_blocks enable row level security;
alter table public.booking_availability_alerts enable row level security;
alter table public.booking_requests enable row level security;

revoke all on table public.booking_settings from public, anon, authenticated;
revoke all on table public.booking_external_reservations from public, anon, authenticated;
revoke all on table public.booking_availability_blocks from public, anon, authenticated;
revoke all on table public.booking_availability_alerts from public, anon, authenticated;
revoke all on table public.booking_requests from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.booking_settings to service_role;
grant select, insert, update, delete on table public.booking_external_reservations to service_role;
grant select, insert, update, delete on table public.booking_availability_blocks to service_role;
grant select, insert, update, delete on table public.booking_availability_alerts to service_role;
grant select, insert, update, delete on table public.booking_requests to service_role;
