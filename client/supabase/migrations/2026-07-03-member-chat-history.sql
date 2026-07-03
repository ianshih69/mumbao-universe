alter table public.chat_sessions
  add column if not exists auth_user_id uuid references auth.users(id) on update cascade on delete set null,
  add column if not exists customer_profile_id uuid references public.shop_customer_profiles(id) on update cascade on delete set null,
  add column if not exists customer_email text,
  add column if not exists linked_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists title text,
  add column if not exists summary text;

alter table public.chat_messages
  add column if not exists deleted_at timestamptz;

create index if not exists idx_chat_sessions_auth_user_latest
  on public.chat_sessions(auth_user_id, latest_message_at desc)
  where deleted_at is null;

create index if not exists idx_chat_sessions_customer_profile_latest
  on public.chat_sessions(customer_profile_id, latest_message_at desc)
  where deleted_at is null;

create index if not exists idx_chat_sessions_deleted_at
  on public.chat_sessions(deleted_at);

create index if not exists idx_chat_messages_deleted_at
  on public.chat_messages(deleted_at);

create index if not exists idx_chat_messages_active_session_created_at
  on public.chat_messages(session_id, created_at)
  where deleted_at is null;

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.chat_sessions from public;
revoke all on table public.chat_sessions from anon;
revoke all on table public.chat_sessions from authenticated;

revoke all on table public.chat_messages from public;
revoke all on table public.chat_messages from anon;
revoke all on table public.chat_messages from authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.chat_sessions to service_role;
grant select, insert, update, delete on table public.chat_messages to service_role;
