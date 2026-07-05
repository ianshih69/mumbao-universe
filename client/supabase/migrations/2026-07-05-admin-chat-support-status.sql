alter table public.chat_sessions
  add column if not exists support_status text default 'ai_replying',
  add column if not exists support_status_updated_at timestamptz,
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by_admin_id uuid references public.admin_profiles(id) on update cascade on delete set null,
  add column if not exists handled_by_name text,
  add column if not exists handled_by_email text,
  add column if not exists handled_by_role text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_admin_id uuid references public.admin_profiles(id) on update cascade on delete set null,
  add column if not exists closed_by_name text,
  add column if not exists closed_by_email text,
  add column if not exists closed_by_role text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_sessions_support_status_check'
      and conrelid = 'public.chat_sessions'::regclass
  ) then
    alter table public.chat_sessions
      add constraint chat_sessions_support_status_check
      check (
        support_status is null
        or support_status in (
          'ai_replying',
          'needs_human',
          'human_takeover',
          'replied',
          'closed'
        )
      );
  end if;
end $$;

create index if not exists idx_chat_sessions_support_status_latest
  on public.chat_sessions(support_status, latest_message_at desc)
  where deleted_at is null;

create index if not exists idx_chat_sessions_source_latest
  on public.chat_sessions(source, latest_message_at desc)
  where deleted_at is null;

create index if not exists idx_chat_sessions_closed_at
  on public.chat_sessions(closed_at);

create index if not exists idx_chat_sessions_handled_by_admin
  on public.chat_sessions(handled_by_admin_id, handled_at desc)
  where handled_by_admin_id is not null;
