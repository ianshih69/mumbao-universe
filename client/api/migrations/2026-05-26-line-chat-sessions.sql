alter table public.chat_sessions
  add column if not exists line_user_id text,
  add column if not exists line_display_name text,
  add column if not exists line_picture_url text,
  add column if not exists source text default 'web';

create index if not exists idx_chat_sessions_line_user_id
  on public.chat_sessions(line_user_id);
