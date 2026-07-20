alter table public.chat_sessions
  add column if not exists ai_paused_until timestamptz;
