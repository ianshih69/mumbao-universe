alter table public.chat_messages
  drop constraint if exists chat_messages_sender_check;

alter table public.chat_messages
  add constraint chat_messages_sender_check
  check (sender in ('user', 'ai', 'assistant', 'human', 'system'));

alter table public.chat_messages
  add column if not exists role text generated always as (sender) stored,
  add column if not exists content text generated always as (message) stored;
