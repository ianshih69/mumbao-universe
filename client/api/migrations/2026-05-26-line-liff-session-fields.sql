alter table public.chat_sessions
  add column if not exists visitor_id text,
  add column if not exists line_user_id text,
  add column if not exists line_display_name text,
  add column if not exists line_picture_url text,
  add column if not exists source text default 'web',
  add column if not exists status text default 'ai_active',
  add column if not exists last_message text,
  add column if not exists latest_message_at timestamptz,
  add column if not exists unread_count integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_chat_sessions_line_user_id
  on public.chat_sessions(line_user_id);

create index if not exists idx_chat_sessions_visitor_id
  on public.chat_sessions(visitor_id);
