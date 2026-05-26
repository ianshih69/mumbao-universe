alter table public.chat_messages
  add column if not exists created_at timestamptz default now();

create index if not exists idx_chat_messages_session_created_at
  on public.chat_messages(session_id, created_at);
