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
