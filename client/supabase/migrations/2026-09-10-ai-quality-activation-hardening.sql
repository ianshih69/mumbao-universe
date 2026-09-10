begin;

-- Preserve expiry, locking and FK semantics. Correlated scalar LIMIT 1 probes
-- keep the planner from hashing the entire events table for each small batch.
-- Existing conversation-prefix indexes already support both child lookups.
create or replace function public.delete_expired_ai_quality_data(p_batch_size integer default 1000)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cutoff timestamptz := now();
  message_ids uuid[]; event_ids uuid[]; conversation_ids uuid[];
  metric_day date;
  deleted_messages integer; deleted_events integer; deleted_conversations integer;
begin
  if p_batch_size is null or p_batch_size not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'ai_quality_invalid_cleanup_batch';
  end if;
  -- One maintenance transaction at a time; no lock or timeout in the AI response path.
  if not pg_try_advisory_xact_lock(hashtextextended('mumbao:ai-quality:cleanup:v1', 0)) then
    return jsonb_build_object('skipped', true, 'messages_deleted', 0, 'events_deleted', 0, 'conversations_deleted', 0);
  end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into message_ids from (
    select id from public.ai_quality_messages where retention_expires_at <= cutoff
    order by retention_expires_at, id limit p_batch_size for update skip locked
  ) expired;
  select coalesce(array_agg(id), '{}'::uuid[]) into event_ids from (
    select id from public.ai_quality_events where retention_expires_at <= cutoff
    order by retention_expires_at, id limit p_batch_size for update skip locked
  ) expired;

  -- Seal the complete day's counts before any batch removes its source evidence.
  for metric_day in
    select distinct (created_at at time zone 'Asia/Taipei')::date from (
      select created_at from public.ai_quality_messages where id = any(message_ids)
      union all select created_at from public.ai_quality_events where id = any(event_ids)
    ) source_days
  loop
    perform public.aggregate_ai_daily_metrics(metric_day);
    update public.ai_daily_metrics set finalized_at = coalesce(finalized_at, cutoff) where metric_date = metric_day;
  end loop;

  delete from public.ai_quality_events where id = any(event_ids);
  get diagnostics deleted_events = row_count;
  delete from public.ai_quality_messages where id = any(message_ids);
  get diagnostics deleted_messages = row_count;

  select coalesce(array_agg(id), '{}'::uuid[]) into conversation_ids from (
    select c.id from public.ai_quality_conversations c
    where c.retention_expires_at <= cutoff
      and (select 1 from public.ai_quality_messages m where m.quality_conversation_id = c.id limit 1) is null
      and (select 1 from public.ai_quality_events e where e.quality_conversation_id = c.id limit 1) is null
    order by c.retention_expires_at, c.id limit p_batch_size for update skip locked
  ) expired;
  for metric_day in
    select distinct (started_at at time zone 'Asia/Taipei')::date
    from public.ai_quality_conversations where id = any(conversation_ids)
  loop
    perform public.aggregate_ai_daily_metrics(metric_day);
    update public.ai_daily_metrics set finalized_at = coalesce(finalized_at, cutoff) where metric_date = metric_day;
  end loop;
  delete from public.ai_quality_conversations where id = any(conversation_ids);
  get diagnostics deleted_conversations = row_count;
  return jsonb_build_object('skipped', false, 'messages_deleted', deleted_messages,
    'events_deleted', deleted_events, 'conversations_deleted', deleted_conversations);
end;
$$;

revoke all on function public.delete_expired_ai_quality_data(integer) from public, anon, authenticated, service_role;
grant execute on function public.delete_expired_ai_quality_data(integer) to service_role;


-- Eight days cover the seven-day feedback token plus a full-day aggregation
-- grace period. Signal/context/sample evidence keeps the existing 30-day limit.
do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='ai_quality_messages' and column_name='capture_retention_days') then
    drop index public.ai_quality_messages_retention_idx;
    alter table public.ai_quality_messages drop column retention_expires_at;
    alter table public.ai_quality_messages
      add column capture_retention_days smallint not null default 30 check (capture_retention_days in (8,30)),
      add column retention_expires_at timestamptz generated always as (
        ((created_at at time zone 'UTC') + make_interval(days => capture_retention_days)) at time zone 'UTC'
      ) stored;
    create index ai_quality_messages_retention_idx on public.ai_quality_messages(retention_expires_at,id);
  end if;
end;
$$;

create table if not exists public.ai_quality_maintenance_state (
  singleton boolean primary key default true check (singleton),
  last_completed_at timestamptz,
  capture_mode text not null default 'critical' check (capture_mode in ('normal','warning','critical')),
  conversation_rows bigint not null default 0 check (conversation_rows >= 0),
  message_rows bigint not null default 0 check (message_rows >= 0),
  event_rows bigint not null default 0 check (event_rows >= 0),
  cleanup_due_count bigint not null default 0 check (cleanup_due_count >= 0)
);
insert into public.ai_quality_maintenance_state(singleton) values(true) on conflict do nothing;
alter table public.ai_quality_maintenance_state enable row level security;
revoke all on public.ai_quality_maintenance_state from public,anon,authenticated,service_role;
grant select on public.ai_quality_maintenance_state to service_role;

create or replace function public.ai_quality_bounded_excerpt(p_text text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case when char_length(p_text)<=240 then p_text
    else regexp_replace(left(p_text,239),'\[[A-Z_]*$','') || ' [CAPACITY_LIMIT]' end;
$$;

create or replace function public.record_ai_quality_turn(p_turn jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp set lock_timeout = '2s' as $$
declare
  c public.ai_quality_conversations%rowtype;
  m jsonb;
  item jsonb;
  assistant_id uuid;
  turn_number integer;
  event_count integer;
  turn_hash text;
  conversation_hash text;
  capture_mode text;
  keep_full boolean;
  retention_days smallint;
  saved_user text;
  saved_assistant text;
begin
  if p_turn is null or jsonb_typeof(p_turn) <> 'object' or octet_length(p_turn::text) > 100000
    or p_turn - array['conversation_key_hash', 'turn_key_hash', 'user_text', 'assistant_text', 'metadata', 'context', 'events'] <> '{}'::jsonb
    or not (p_turn ?& array['conversation_key_hash', 'turn_key_hash', 'user_text', 'assistant_text', 'metadata', 'context', 'events'])
  then raise exception 'invalid_quality_payload' using errcode = '22023'; end if;
  conversation_hash := p_turn->>'conversation_key_hash';
  turn_hash := p_turn->>'turn_key_hash';
  m := p_turn->'metadata';
  if jsonb_typeof(p_turn->'conversation_key_hash') is distinct from 'string'
    or conversation_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_turn->'turn_key_hash') is distinct from 'string' or turn_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_turn->'user_text') is distinct from 'string'
    or jsonb_typeof(p_turn->'assistant_text') is distinct from 'string'
    or char_length(p_turn->>'user_text') > 8000 or char_length(p_turn->>'assistant_text') > 8000
    or not public.ai_quality_valid_metadata(m) or not public.ai_quality_valid_context(p_turn->'context')
    or not (m ?& array['provider_used', 'provider_call_count', 'scenario_changed', 'pending_created', 'pending_consumed', 'generic_fallback', 'clarification'])
    or jsonb_typeof(p_turn->'events') is distinct from 'array'
  then raise exception 'invalid_quality_payload' using errcode = '22023'; end if;
  if (m->>'provider_used')::boolean is distinct from ((m->>'provider_call_count')::integer > 0)
    or jsonb_array_length(p_turn->'events') > 8
  then raise exception 'invalid_quality_payload' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_turn->'events') loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['event_type', 'severity', 'metadata'] <> '{}'::jsonb
      or not (item ?& array['event_type', 'severity', 'metadata'])
      or coalesce(item->>'event_type', '') not in ('generic_fallback', 'provider_schema_reject', 'provider_error',
        'wrong_mutation_signal', 'context_lost_signal', 'unnecessary_clarification', 'possible_misunderstanding')
      or coalesce(item->>'severity', '') not in ('info', 'low', 'medium', 'high', 'critical')
      or not public.ai_quality_valid_metadata(item->'metadata')
    then raise exception 'invalid_quality_event' using errcode = '22023'; end if;
  end loop;

  select s.capture_mode into capture_mode from public.ai_quality_maintenance_state s
    where s.singleton and s.last_completed_at >= now() - interval '36 hours';
  if not found then
    raise exception 'ai_quality_maintenance_required' using errcode = '55000';
  end if;

  insert into public.ai_quality_conversations(conversation_key_hash) values(conversation_hash)
    on conflict (conversation_key_hash) do nothing;
  select * into strict c from public.ai_quality_conversations
    where conversation_key_hash = conversation_hash for update;

  -- Row lock serializes retries and distinct turns for this conversation.
  if exists(select 1 from public.ai_quality_messages
      where quality_conversation_id = c.id and turn_key_hash = turn_hash)
    or exists(select 1 from public.ai_quality_events
      where quality_conversation_id = c.id and turn_key_hash = turn_hash)
  then return; end if;
  turn_number := c.observer_turn_count + 1;
  keep_full := jsonb_array_length(p_turn->'events') > 0 or exists (
    select 1 from public.ai_quality_messages previous
    join public.ai_quality_events e on e.quality_message_id = previous.id
    where previous.quality_conversation_id = c.id and previous.turn_index = c.observer_turn_count
      and e.event_type <> 'positive_feedback'
  );
  retention_days := case when keep_full or (capture_mode <> 'critical' and left(turn_hash,1) = '0') then 30 else 8 end;
  saved_user := case when capture_mode = 'critical' and not keep_full
    then public.ai_quality_bounded_excerpt(p_turn->>'user_text') else p_turn->>'user_text' end;
  saved_assistant := case when capture_mode = 'critical' and not keep_full
    then public.ai_quality_bounded_excerpt(p_turn->>'assistant_text') else p_turn->>'assistant_text' end;
  insert into public.ai_quality_messages(quality_conversation_id, turn_index, role, sanitized_text, turn_key_hash, capture_retention_days)
    values(c.id, turn_number, 'user', saved_user, turn_hash, retention_days);
  insert into public.ai_quality_messages(
    quality_conversation_id, turn_index, role, sanitized_text, turn_key_hash, capability_id, response_kind,
    provider_used, provider_call_count, scenario_changed, pending_created, pending_consumed,
    generic_fallback, clarification, execution_metadata, capture_retention_days
  ) values (
    c.id, turn_number, 'assistant', saved_assistant, turn_hash, m->>'capability_id', m->>'response_kind',
    (m->>'provider_used')::boolean, (m->>'provider_call_count')::integer, (m->>'scenario_changed')::boolean,
    (m->>'pending_created')::boolean, (m->>'pending_consumed')::boolean,
    (m->>'generic_fallback')::boolean, (m->>'clarification')::boolean, m, retention_days
  ) returning id into assistant_id;
  insert into public.ai_quality_events(
    quality_conversation_id, quality_message_id, turn_key_hash, event_type, severity,
    capability_id, sanitized_context, metadata_json
  )
    select c.id, assistant_id, turn_hash, e->>'event_type', e->>'severity',
      m->>'capability_id', p_turn->'context', e->'metadata'
    from jsonb_array_elements(p_turn->'events') e
    on conflict (quality_conversation_id, turn_key_hash, event_type) do nothing;
  get diagnostics event_count = row_count;
  if event_count > 0 then
    update public.ai_quality_messages set capture_retention_days = 30
    where quality_conversation_id = c.id and turn_index between turn_number - 2 and turn_number
      and retention_expires_at > now() and capture_retention_days <> 30;
  end if;
  update public.ai_quality_conversations set
    last_activity_at = greatest(last_activity_at, now()),
    message_count = message_count + 2, quality_event_count = quality_event_count + event_count,
    observer_turn_count = turn_number
    where id = c.id;
end;
$$;

create or replace function public.submit_ai_quality_feedback(
  p_conversation text, p_turn text, p_polarity text, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
set lock_timeout = '2s' set statement_timeout = '3s' as $$
declare
  c public.ai_quality_conversations%rowtype;
  m public.ai_quality_messages%rowtype;
  e public.ai_quality_events%rowtype;
  event_kind text;
  changed boolean;
begin
  if p_conversation is null or p_conversation !~ '^[a-f0-9]{64}$'
    or p_turn is null or p_turn !~ '^[a-f0-9]{64}$'
    or p_polarity is null or p_polarity not in ('positive','negative')
    or (p_polarity = 'positive' and p_category is not null)
    or (p_polarity = 'negative' and (p_category is null or p_category not in
      ('incorrect_answer','misunderstood_question','repeated_question','too_verbose','other'))) then
    return jsonb_build_object('result','rejected');
  end if;
  -- Same lock order as observer: conversation before message. Rate checks and
  -- current-state upsert are one transaction, including concurrent requests.
  select * into c from public.ai_quality_conversations where conversation_key_hash = p_conversation for update;
  if not found then return jsonb_build_object('result','rejected'); end if;
  select * into m from public.ai_quality_messages where quality_conversation_id = c.id
    and turn_key_hash = p_turn and role = 'assistant' and retention_expires_at > now() for update;
  if not found then return jsonb_build_object('result','rejected'); end if;
  if m.feedback_window_at is null or m.feedback_window_at <= now() - interval '1 minute' then
    m.feedback_request_count := 0;
    m.feedback_window_at := now();
  end if;
  if m.feedback_request_count >= 12 then return jsonb_build_object('result','limited'); end if;
  update public.ai_quality_messages set feedback_window_at = m.feedback_window_at,
    feedback_request_count = m.feedback_request_count + 1 where id = m.id;
  event_kind := p_polarity || '_feedback';
  select * into e from public.ai_quality_events where quality_conversation_id = c.id
    and turn_key_hash = p_turn and event_type in ('positive_feedback','negative_feedback');
  if found then
    changed := e.event_type is distinct from event_kind or e.feedback_category is distinct from p_category;
    if changed then
      update public.ai_quality_events set event_type = event_kind, feedback_category = p_category,
        severity = case when p_polarity = 'negative' then 'low' else 'info' end,
        feedback_updated_at = now(), reviewed_at = null where id = e.id;
    end if;
  else
    insert into public.ai_quality_events(quality_conversation_id,quality_message_id,turn_key_hash,
      event_type,severity,capability_id,metadata_json,feedback_category,feedback_updated_at)
    values(c.id,m.id,p_turn,event_kind,case when p_polarity = 'negative' then 'low' else 'info' end,
      m.capability_id,m.execution_metadata,p_category,now());
    update public.ai_quality_conversations set quality_event_count = quality_event_count + 1 where id = c.id;
  end if;
  if p_polarity = 'negative' then
    update public.ai_quality_messages set capture_retention_days = 30
    where quality_conversation_id = c.id and turn_index between m.turn_index - 2 and m.turn_index + 1
      and retention_expires_at > now() and capture_retention_days <> 30;
  end if;
  update public.ai_quality_conversations set has_negative_feedback = exists(
    select 1 from public.ai_quality_events where quality_conversation_id = c.id and event_type = 'negative_feedback'
  ) where id = c.id;
  return jsonb_build_object('result','saved');
end;
$$;


-- No cron registration or external credential. A separately approved DB
-- scheduler calls this server-only RPC; all work rolls back on a failed run.
create or replace function public.run_ai_quality_maintenance(
  p_batch_size integer default 1000, p_max_batches integer default 40
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
set lock_timeout='2s' set statement_timeout='60s' as $$
declare batch jsonb; health jsonb; mode text; i integer; iterations integer := 0;
  messages_deleted bigint := 0; events_deleted bigint := 0; conversations_deleted bigint := 0;
begin
  if p_batch_size is null or p_batch_size not between 1 and 10000
    or p_max_batches is null or p_max_batches not between 1 and 100 then
    raise exception 'invalid_maintenance_budget' using errcode='22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('mumbao:ai-quality:cleanup:v1',0)) then
    return jsonb_build_object('skipped',true);
  end if;
  perform public.aggregate_ai_daily_metrics((now() at time zone 'Asia/Taipei')::date - 1);
  for i in 1..p_max_batches loop
    batch := public.delete_expired_ai_quality_data(p_batch_size);
    iterations := i;
    messages_deleted := messages_deleted + (batch->>'messages_deleted')::bigint;
    events_deleted := events_deleted + (batch->>'events_deleted')::bigint;
    conversations_deleted := conversations_deleted + (batch->>'conversations_deleted')::bigint;
    exit when (batch->>'messages_deleted')::bigint + (batch->>'events_deleted')::bigint
      + (batch->>'conversations_deleted')::bigint = 0;
  end loop;
  health := public.get_ai_quality_storage_metrics();
  mode := case
    when (health->>'message_rows')::bigint >= 250000 or (health->>'event_rows')::bigint >= 250000
      or (health->>'cleanup_due_count')::bigint >= 50000 then 'critical'
    when (health->>'message_rows')::bigint >= 100000 or (health->>'event_rows')::bigint >= 100000
      or (health->>'cleanup_due_count')::bigint >= 10000 then 'warning'
    else 'normal' end;
  update public.ai_quality_maintenance_state set last_completed_at=now(),capture_mode=mode,
    conversation_rows=(health->>'conversation_rows')::bigint,
    message_rows=(health->>'message_rows')::bigint,event_rows=(health->>'event_rows')::bigint,
    cleanup_due_count=(health->>'cleanup_due_count')::bigint where singleton;
  return jsonb_build_object('skipped',false,'batches',iterations,'capture_mode',mode,
    'messages_deleted',messages_deleted,'events_deleted',events_deleted,
    'conversations_deleted',conversations_deleted,'cleanup_due_count',(health->>'cleanup_due_count')::bigint);
end;
$$;

revoke all on function public.ai_quality_bounded_excerpt(text),
  public.run_ai_quality_maintenance(integer,integer),
  public.record_ai_quality_turn(jsonb),public.submit_ai_quality_feedback(text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ai_quality_bounded_excerpt(text),
  public.run_ai_quality_maintenance(integer,integer),
  public.record_ai_quality_turn(jsonb),public.submit_ai_quality_feedback(text,text,text,text)
  to service_role;

commit;
