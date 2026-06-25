create extension if not exists pgcrypto;

create table if not exists public.booking_platform_settings (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  ical_url text,
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.booking_email_detections (
  id uuid primary key default gen_random_uuid(),
  sender text,
  subject text,
  raw_email text,
  detection_type text not null default 'unknown',
  confidence integer not null default 0,
  reference_number text,
  check_in date,
  check_out date,
  accommodation_name text,
  suggested_auto_block boolean not null default false,
  status text not null default 'pending_review',
  external_reservation_id uuid references public.booking_external_reservations(id) on update cascade on delete set null,
  ai_review_status text not null default 'not_requested',
  ai_confidence integer,
  ai_result_json jsonb,
  raw_result_json jsonb,
  handled_at timestamptz,
  handled_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_email_detections_type_check check (detection_type in ('new_reservation', 'cancellation', 'modification', 'guest_message', 'unknown')),
  constraint booking_email_detections_status_check check (status in ('auto_blocked', 'pending_review', 'ignored', 'handled'))
);

create table if not exists public.booking_ical_sync_logs (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'booking',
  ical_url text,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  events_found integer not null default 0,
  blocks_written integer not null default 0,
  error text,
  raw_result_json jsonb,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_date_check check (check_out > check_in),
  constraint booking_requests_status_check check (status in ('pending_review', 'confirmed', 'cancelled'))
);

create table if not exists public.booking_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_name text,
  actor_email text,
  action text not null,
  module text not null default 'booking',
  target_type text,
  target_id text,
  description text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists booking_external_reservations_dates_idx
  on public.booking_external_reservations(check_in, check_out, status);

create index if not exists booking_availability_blocks_dates_idx
  on public.booking_availability_blocks(check_in, check_out, status);

create unique index if not exists booking_availability_blocks_ical_uid_unique_idx
  on public.booking_availability_blocks(source, ical_uid)
  where ical_uid is not null;

create index if not exists booking_email_detections_status_idx
  on public.booking_email_detections(status, created_at desc);

create index if not exists booking_ical_sync_logs_platform_idx
  on public.booking_ical_sync_logs(platform, started_at desc);

create index if not exists booking_availability_alerts_status_idx
  on public.booking_availability_alerts(status, severity, created_at desc);

create index if not exists booking_requests_status_idx
  on public.booking_requests(status, created_at desc);

drop trigger if exists set_booking_platform_settings_updated_at on public.booking_platform_settings;
create trigger set_booking_platform_settings_updated_at
  before update on public.booking_platform_settings
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_booking_external_reservations_updated_at on public.booking_external_reservations;
create trigger set_booking_external_reservations_updated_at
  before update on public.booking_external_reservations
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_booking_availability_blocks_updated_at on public.booking_availability_blocks;
create trigger set_booking_availability_blocks_updated_at
  before update on public.booking_availability_blocks
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_booking_email_detections_updated_at on public.booking_email_detections;
create trigger set_booking_email_detections_updated_at
  before update on public.booking_email_detections
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_booking_availability_alerts_updated_at on public.booking_availability_alerts;
create trigger set_booking_availability_alerts_updated_at
  before update on public.booking_availability_alerts
  for each row
  execute function public.set_shop_warehouse_updated_at();

drop trigger if exists set_booking_requests_updated_at on public.booking_requests;
create trigger set_booking_requests_updated_at
  before update on public.booking_requests
  for each row
  execute function public.set_shop_warehouse_updated_at();

alter table public.booking_platform_settings enable row level security;
alter table public.booking_external_reservations enable row level security;
alter table public.booking_availability_blocks enable row level security;
alter table public.booking_email_detections enable row level security;
alter table public.booking_ical_sync_logs enable row level security;
alter table public.booking_availability_alerts enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_admin_audit_logs enable row level security;

revoke all on table public.booking_platform_settings from public, anon, authenticated;
revoke all on table public.booking_external_reservations from public, anon, authenticated;
revoke all on table public.booking_availability_blocks from public, anon, authenticated;
revoke all on table public.booking_email_detections from public, anon, authenticated;
revoke all on table public.booking_ical_sync_logs from public, anon, authenticated;
revoke all on table public.booking_availability_alerts from public, anon, authenticated;
revoke all on table public.booking_requests from public, anon, authenticated;
revoke all on table public.booking_admin_audit_logs from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.booking_platform_settings to service_role;
grant select, insert, update, delete on table public.booking_external_reservations to service_role;
grant select, insert, update, delete on table public.booking_availability_blocks to service_role;
grant select, insert, update, delete on table public.booking_email_detections to service_role;
grant select, insert, update, delete on table public.booking_ical_sync_logs to service_role;
grant select, insert, update, delete on table public.booking_availability_alerts to service_role;
grant select, insert, update, delete on table public.booking_requests to service_role;
grant select, insert, update, delete on table public.booking_admin_audit_logs to service_role;
