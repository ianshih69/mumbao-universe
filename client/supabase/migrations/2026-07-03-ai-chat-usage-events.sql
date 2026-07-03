create extension if not exists pgcrypto;

create table if not exists public.ai_chat_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  user_type text not null default 'unknown',
  auth_user_id uuid references auth.users(id) on update cascade on delete set null,
  visitor_id text,
  ip_hash text,
  user_agent_hash text,
  session_id text,
  action text,
  provider text default 'deepseek',
  model text,
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_chat_usage_events_event_type_check
    check (event_type in ('message', 'blocked')),
  constraint ai_chat_usage_events_user_type_check
    check (user_type in ('visitor', 'member', 'admin', 'unknown'))
);

create index if not exists idx_ai_chat_usage_events_created_at
  on public.ai_chat_usage_events (created_at desc);

create index if not exists idx_ai_chat_usage_events_ip_hash_created_at
  on public.ai_chat_usage_events (ip_hash, created_at desc);

create index if not exists idx_ai_chat_usage_events_visitor_id_created_at
  on public.ai_chat_usage_events (visitor_id, created_at desc);

create index if not exists idx_ai_chat_usage_events_auth_user_id_created_at
  on public.ai_chat_usage_events (auth_user_id, created_at desc);

create index if not exists idx_ai_chat_usage_events_user_type_created_at
  on public.ai_chat_usage_events (user_type, created_at desc);

create index if not exists idx_ai_chat_usage_events_event_type_created_at
  on public.ai_chat_usage_events (event_type, created_at desc);

alter table public.ai_chat_usage_events enable row level security;

revoke all on table public.ai_chat_usage_events from public;
revoke all on table public.ai_chat_usage_events from anon;
revoke all on table public.ai_chat_usage_events from authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.ai_chat_usage_events to service_role;
