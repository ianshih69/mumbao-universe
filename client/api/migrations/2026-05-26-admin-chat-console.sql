alter table public.chat_sessions
  add column if not exists status text default 'ai_active',
  add column if not exists should_ai_reply boolean default true,
  add column if not exists unread_count integer default 0,
  add column if not exists last_message text,
  add column if not exists latest_message_at timestamptz,
  add column if not exists source text default 'web';

alter table public.chat_messages
  add column if not exists read_by_admin boolean default false,
  add column if not exists metadata jsonb;

create index if not exists idx_chat_sessions_latest_message_at
  on public.chat_sessions(latest_message_at desc);

create index if not exists idx_chat_sessions_status
  on public.chat_sessions(status);

create index if not exists idx_chat_messages_read_by_admin
  on public.chat_messages(read_by_admin);
