alter table public.chat_sessions
  add column if not exists conversation_context jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'chat_sessions_conversation_context_object_check'
       and conrelid = 'public.chat_sessions'::regclass
  ) then
    alter table public.chat_sessions
      add constraint chat_sessions_conversation_context_object_check
      check (jsonb_typeof(conversation_context) = 'object');
  end if;
end
$$;
