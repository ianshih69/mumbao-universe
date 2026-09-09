-- Phase 1A only. No chat hooks, backfill, scheduler, or changes to existing tables.
begin;

create or replace function public.ai_quality_valid_capability_id(p_value text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_value is null or p_value = any(array[
    'luggage_delivery_policy', 'post_checkout_luggage_policy', 'precheckin_luggage_policy',
    'late_checkout_policy', 'visitor_policy', 'general_deposit_policy', 'cancellation_policy',
    'pet_supplies_policy', 'pet_shedding_policy', 'pet_bathing_policy', 'large_dog_policy',
    'pet_deposit_policy', 'vegetarian_breakfast_policy', 'room_allocation_policy',
    'room_count_policy', 'quad_room_policy', 'pet_eligibility_policy', 'breakfast_policy',
    'checkout_policy', 'checkin_policy', 'kitchen_policy', 'pool_policy'
  ]::text[]);
$$;

create or replace function public.ai_quality_valid_response_kind(p_value text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p_value is null or p_value = any(array[
    'transactional_quote', 'transactional_update', 'confirmation', 'clarification',
    'partial_answer', 'informational_answer', 'knowledge_gap', 'action_request',
    'knowledge_candidate', 'slot_fill_transaction', 'quote_with_addons', 'quote_only', 'other'
  ]::text[]);
$$;

create or replace function public.ai_quality_valid_metadata(p_value jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare item record;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 4096 then return false; end if;
  for item in select key, value from jsonb_each(p_value) loop
    if item.key in ('provider_used', 'scenario_changed', 'pending_created', 'pending_consumed',
      'generic_fallback', 'clarification', 'semantic_resolver_used') then
      if jsonb_typeof(item.value) <> 'boolean' then return false; end if;
    elsif item.key in ('provider_call_count', 'latency_ms') then
      if jsonb_typeof(item.value) <> 'number' or (item.value #>> '{}') !~ '^[0-9]+$' then return false; end if;
      if (item.value #>> '{}')::numeric > (case when item.key = 'provider_call_count' then 32 else 120000 end) then return false; end if;
    elsif item.key = 'capability_id' then
      if jsonb_typeof(item.value) <> 'string' or not public.ai_quality_valid_capability_id(item.value #>> '{}') then return false; end if;
    elsif item.key = 'response_kind' then
      if jsonb_typeof(item.value) <> 'string' or not public.ai_quality_valid_response_kind(item.value #>> '{}') then return false; end if;
    elsif item.key = 'structured_mode' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('legacy', 'shadow', 'active') then return false; end if;
    elsif item.key = 'validation_outcome' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('accepted', 'rejected', 'not_called') then return false; end if;
    elsif item.key = 'provider_error_type' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('timeout', 'network_error', 'http_error', 'schema_reject', 'invalid_response', 'unknown') then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.ai_quality_valid_context(p_value jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare item record; field jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 4096 then return false; end if;
  for item in select key, value from jsonb_each(p_value) loop
    if item.key in ('scenario_present', 'pending_present') then
      if jsonb_typeof(item.value) <> 'boolean' then return false; end if;
    elsif item.key = 'scenario_version' then
      if jsonb_typeof(item.value) <> 'number' or (item.value #>> '{}') !~ '^[0-9]+$' then return false; end if;
      if (item.value #>> '{}')::numeric > 1000000 then return false; end if;
    elsif item.key = 'pending_missing_fields' then
      if jsonb_typeof(item.value) <> 'array' then return false; end if;
      if jsonb_array_length(item.value) > 10 then return false; end if;
      for field in select value from jsonb_array_elements(item.value) loop
        if jsonb_typeof(field) <> 'string' or (field #>> '{}') not in
          ('check_in', 'check_out', 'nights', 'adults', 'children', 'infants',
           'pet_count', 'pet_weight', 'target_pet', 'breakfast_quantity') then return false; end if;
      end loop;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;

create table if not exists public.ai_quality_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key_hash text not null unique check (conversation_key_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now() check (last_activity_at >= started_at),
  message_count bigint not null default 0 check (message_count >= 0),
  quality_event_count bigint not null default 0 check (quality_event_count >= 0),
  has_negative_feedback boolean not null default false,
  has_escalation boolean not null default false,
  retention_expires_at timestamptz generated always as
    (((last_activity_at at time zone 'UTC') + interval '30 days') at time zone 'UTC') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_quality_conversations_retention_idx on public.ai_quality_conversations(retention_expires_at, id);
create index if not exists ai_quality_conversations_started_idx on public.ai_quality_conversations(started_at);

create table if not exists public.ai_quality_messages (
  id uuid primary key default gen_random_uuid(),
  quality_conversation_id uuid not null references public.ai_quality_conversations(id) on delete restrict,
  turn_index integer not null check (turn_index > 0),
  role text not null check (role in ('user', 'assistant')),
  sanitized_text text not null check (char_length(sanitized_text) <= 8000),
  capability_id text check (public.ai_quality_valid_capability_id(capability_id)),
  response_kind text check (public.ai_quality_valid_response_kind(response_kind)),
  provider_used boolean not null default false,
  provider_call_count integer not null default 0 check (provider_call_count between 0 and 32),
  scenario_changed boolean not null default false,
  pending_created boolean not null default false,
  pending_consumed boolean not null default false,
  generic_fallback boolean not null default false,
  clarification boolean not null default false,
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz generated always as
    (((created_at at time zone 'UTC') + interval '30 days') at time zone 'UTC') stored,
  constraint ai_quality_messages_turn_role_key unique (quality_conversation_id, turn_index, role),
  constraint ai_quality_messages_id_conversation_key unique (id, quality_conversation_id),
  constraint ai_quality_messages_provider_check check (provider_used = (provider_call_count > 0)),
  constraint ai_quality_messages_user_provider_check check (role = 'assistant' or provider_call_count = 0)
);
create index if not exists ai_quality_messages_retention_idx on public.ai_quality_messages(retention_expires_at, id);
create index if not exists ai_quality_messages_created_idx on public.ai_quality_messages(created_at);

-- Review examples are self-contained and have no FK to a short-lived transcript.
create table if not exists public.ai_review_items (
  id uuid primary key default gen_random_uuid(),
  cluster_key text check (cluster_key is null or cluster_key ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(title) between 1 and 240),
  sanitized_example text not null check (char_length(sanitized_example) between 1 and 8000),
  sanitized_ai_answer text check (char_length(sanitized_ai_answer) <= 8000),
  occurrence_count bigint not null default 1 check (occurrence_count > 0),
  classification text not null default 'unknown' check (classification in
    ('semantic_gap', 'context_gap', 'knowledge_gap', 'tool_gap', 'special_case', 'unknown')),
  classification_confidence numeric(4,3) check (classification_confidence between 0 and 1),
  status text not null default 'new' check (status in
    ('new', 'triaged', 'needs_owner', 'auto_improvement_candidate', 'resolved', 'ignored')),
  owner_action_required boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now() check (last_seen_at >= first_seen_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz check (resolved_at is null or resolved_at >= first_seen_at)
);
create unique index if not exists ai_review_items_cluster_idx on public.ai_review_items(cluster_key) where cluster_key is not null;
create index if not exists ai_review_items_status_seen_idx on public.ai_review_items(status, last_seen_at desc);
create index if not exists ai_review_items_classification_seen_idx on public.ai_review_items(classification, last_seen_at desc);
create index if not exists ai_review_items_owner_seen_idx on public.ai_review_items(last_seen_at desc)
  where owner_action_required and status not in ('resolved', 'ignored');
create index if not exists ai_review_items_last_seen_idx on public.ai_review_items(last_seen_at desc);
create index if not exists ai_review_items_first_seen_idx on public.ai_review_items(first_seen_at);

create table if not exists public.ai_quality_events (
  id uuid primary key default gen_random_uuid(),
  quality_conversation_id uuid not null references public.ai_quality_conversations(id) on delete restrict,
  quality_message_id uuid,
  review_item_id uuid references public.ai_review_items(id) on delete set null,
  event_type text not null check (event_type in (
    'positive_feedback', 'negative_feedback', 'generic_fallback', 'possible_misunderstanding',
    'repeated_question', 'unnecessary_clarification', 'context_lost_signal', 'wrong_mutation_signal',
    'provider_schema_reject', 'provider_error', 'manual_escalation', 'owner_correction',
    'knowledge_gap_candidate', 'tool_gap_candidate'
  )),
  severity text not null default 'info' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  capability_id text check (public.ai_quality_valid_capability_id(capability_id)),
  sanitized_context jsonb not null default '{}'::jsonb check (public.ai_quality_valid_context(sanitized_context)),
  metadata_json jsonb not null default '{}'::jsonb check (public.ai_quality_valid_metadata(metadata_json)),
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz generated always as
    (((created_at at time zone 'UTC') + interval '90 days') at time zone 'UTC') stored,
  resolved_at timestamptz check (resolved_at is null or resolved_at >= created_at),
  constraint ai_quality_events_message_conversation_fkey
    foreign key (quality_message_id, quality_conversation_id)
    references public.ai_quality_messages(id, quality_conversation_id)
    on delete set null (quality_message_id)
);
create index if not exists ai_quality_events_conversation_idx on public.ai_quality_events(quality_conversation_id, created_at desc);
create index if not exists ai_quality_events_message_idx on public.ai_quality_events(quality_message_id, quality_conversation_id);
create index if not exists ai_quality_events_review_idx on public.ai_quality_events(review_item_id);
create index if not exists ai_quality_events_retention_idx on public.ai_quality_events(retention_expires_at, id);
create index if not exists ai_quality_events_created_idx on public.ai_quality_events(created_at);
create index if not exists ai_quality_events_type_created_idx on public.ai_quality_events(event_type, created_at desc);
create index if not exists ai_quality_events_unresolved_idx on public.ai_quality_events(created_at desc) where resolved_at is null;

create table if not exists public.ai_owner_decisions (
  id uuid primary key default gen_random_uuid(),
  review_item_id uuid not null references public.ai_review_items(id) on delete restrict,
  action_type text not null check (action_type in ('reply_once', 'create_knowledge_draft', 'ai_should_know', 'special_case', 'ignore')),
  sanitized_owner_answer text check (char_length(sanitized_owner_answer) <= 8000),
  created_at timestamptz not null default now()
);
comment on table public.ai_owner_decisions is 'Review evidence only. Not Production FAQ or policy authority.';
create index if not exists ai_owner_decisions_review_created_idx on public.ai_owner_decisions(review_item_id, created_at);

create table if not exists public.ai_eval_cases (
  id uuid primary key default gen_random_uuid(),
  source_review_item_id uuid references public.ai_review_items(id) on delete set null,
  eval_type text not null check (eval_type in ('semantic', 'context', 'knowledge', 'tool', 'privacy', 'regression')),
  capability_id text check (public.ai_quality_valid_capability_id(capability_id)),
  sanitized_input text not null check (char_length(sanitized_input) between 1 and 8000),
  sanitized_context jsonb not null default '{}'::jsonb check (public.ai_quality_valid_context(sanitized_context)),
  expected_behavior jsonb not null default '{}'::jsonb check
    (jsonb_typeof(expected_behavior) = 'object' and octet_length(expected_behavior::text) <= 16000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_eval_cases_review_idx on public.ai_eval_cases(source_review_item_id);

create table if not exists public.ai_daily_metrics (
  metric_date date primary key,
  conversation_count bigint not null default 0 check (conversation_count >= 0),
  message_count bigint not null default 0 check (message_count >= 0),
  positive_feedback_count bigint not null default 0 check (positive_feedback_count >= 0),
  negative_feedback_count bigint not null default 0 check (negative_feedback_count >= 0),
  generic_fallback_count bigint not null default 0 check (generic_fallback_count >= 0),
  clarification_count bigint not null default 0 check (clarification_count >= 0),
  context_lost_signal_count bigint not null default 0 check (context_lost_signal_count >= 0),
  wrong_mutation_signal_count bigint not null default 0 check (wrong_mutation_signal_count >= 0),
  provider_call_count bigint not null default 0 check (provider_call_count >= 0),
  provider_schema_reject_count bigint not null default 0 check (provider_schema_reject_count >= 0),
  provider_error_count bigint not null default 0 check (provider_error_count >= 0),
  review_item_count bigint not null default 0 check (review_item_count >= 0),
  owner_required_count bigint not null default 0 check (owner_required_count >= 0),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
comment on column public.ai_daily_metrics.finalized_at is
  'Set before retention deletes any source rows for this Taipei day; sealed aggregates must not be overwritten from incomplete sources.';

create or replace function public.set_ai_quality_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['ai_quality_conversations', 'ai_review_items', 'ai_eval_cases'] loop
    execute format('drop trigger if exists set_ai_quality_updated_at on public.%I', table_name);
    execute format('create trigger set_ai_quality_updated_at before update on public.%I for each row execute function public.set_ai_quality_updated_at()', table_name);
  end loop;
  foreach table_name in array array['ai_quality_conversations', 'ai_quality_messages', 'ai_quality_events',
    'ai_review_items', 'ai_owner_decisions', 'ai_eval_cases', 'ai_daily_metrics'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;

grant usage on schema public to service_role;
revoke all on function public.ai_quality_valid_capability_id(text),
  public.ai_quality_valid_response_kind(text), public.ai_quality_valid_metadata(jsonb),
  public.ai_quality_valid_context(jsonb), public.set_ai_quality_updated_at()
  from public, anon, authenticated, service_role;
grant execute on function public.ai_quality_valid_capability_id(text),
  public.ai_quality_valid_response_kind(text), public.ai_quality_valid_metadata(jsonb),
  public.ai_quality_valid_context(jsonb), public.set_ai_quality_updated_at() to service_role;

-- Maintenance RPCs follow below; intentionally no scheduler or runtime insert hook.
create or replace function public.aggregate_ai_daily_metrics(p_metric_date date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare day_start timestamptz; day_end timestamptz; result public.ai_daily_metrics%rowtype;
begin
  if p_metric_date is null then raise exception using errcode = '22023', message = 'ai_quality_metric_date_required'; end if;
  -- Serialize aggregation with cleanup so no caller snapshots half-deleted sources.
  perform pg_advisory_xact_lock(hashtextextended('mumbao:ai-quality:cleanup:v1', 0));
  select * into result from public.ai_daily_metrics where metric_date = p_metric_date;
  if result.finalized_at is not null then return to_jsonb(result); end if;
  day_start := p_metric_date::timestamp at time zone 'Asia/Taipei';
  day_end := (p_metric_date + 1)::timestamp at time zone 'Asia/Taipei';

  insert into public.ai_daily_metrics (
    metric_date, conversation_count, message_count, positive_feedback_count, negative_feedback_count,
    generic_fallback_count, clarification_count, context_lost_signal_count, wrong_mutation_signal_count,
    provider_call_count, provider_schema_reject_count, provider_error_count, review_item_count, owner_required_count
  )
  select p_metric_date, c.total, m.total, e.positive, e.negative,
    m.fallback, m.clarifications, e.context_lost, e.wrong_mutation,
    m.provider_calls, e.schema_rejects, e.provider_errors, r.total, r.owner_required
  from (
    select count(*) as total from public.ai_quality_conversations
    where started_at >= day_start and started_at < day_end
  ) c cross join (
    select count(*) as total,
      count(*) filter (where role = 'assistant' and generic_fallback) as fallback,
      count(*) filter (where role = 'assistant' and clarification) as clarifications,
      coalesce(sum(provider_call_count) filter (where role = 'assistant'), 0) as provider_calls
    from public.ai_quality_messages where created_at >= day_start and created_at < day_end
  ) m cross join (
    select count(*) filter (where event_type = 'positive_feedback') as positive,
      count(*) filter (where event_type = 'negative_feedback') as negative,
      count(*) filter (where event_type = 'context_lost_signal') as context_lost,
      count(*) filter (where event_type = 'wrong_mutation_signal') as wrong_mutation,
      count(*) filter (where event_type = 'provider_schema_reject') as schema_rejects,
      count(*) filter (where event_type = 'provider_error') as provider_errors
    from public.ai_quality_events where created_at >= day_start and created_at < day_end
  ) e cross join (
    select count(*) as total, count(*) filter (where owner_action_required) as owner_required
    from public.ai_review_items where first_seen_at >= day_start and first_seen_at < day_end
  ) r
  on conflict (metric_date) do update set
    conversation_count = excluded.conversation_count,
    message_count = excluded.message_count,
    positive_feedback_count = excluded.positive_feedback_count,
    negative_feedback_count = excluded.negative_feedback_count,
    generic_fallback_count = excluded.generic_fallback_count,
    clarification_count = excluded.clarification_count,
    context_lost_signal_count = excluded.context_lost_signal_count,
    wrong_mutation_signal_count = excluded.wrong_mutation_signal_count,
    provider_call_count = excluded.provider_call_count,
    provider_schema_reject_count = excluded.provider_schema_reject_count,
    provider_error_count = excluded.provider_error_count,
    review_item_count = excluded.review_item_count,
    owner_required_count = excluded.owner_required_count
  where public.ai_daily_metrics.finalized_at is null;

  select * into result from public.ai_daily_metrics where metric_date = p_metric_date;
  return to_jsonb(result);
end;
$$;

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
      and not exists (select 1 from public.ai_quality_messages m where m.quality_conversation_id = c.id)
      and not exists (select 1 from public.ai_quality_events e where e.quality_conversation_id = c.id)
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

create or replace function public.get_ai_quality_storage_metrics()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'conversation_rows', (select count(*) from public.ai_quality_conversations),
    'message_rows', (select count(*) from public.ai_quality_messages),
    'event_rows', (select count(*) from public.ai_quality_events),
    'review_rows', (select count(*) from public.ai_review_items),
    'owner_decision_rows', (select count(*) from public.ai_owner_decisions),
    'eval_rows', (select count(*) from public.ai_eval_cases),
    'daily_metric_rows', (select count(*) from public.ai_daily_metrics),
    'oldest_message_at', (select min(created_at) from public.ai_quality_messages),
    'cleanup_due_count',
      (select count(*) from public.ai_quality_messages where retention_expires_at <= now()) +
      (select count(*) from public.ai_quality_events where retention_expires_at <= now()) +
      (select count(*) from public.ai_quality_conversations c where c.retention_expires_at <= now()
        and not exists (select 1 from public.ai_quality_messages m where m.quality_conversation_id = c.id)
        and not exists (select 1 from public.ai_quality_events e where e.quality_conversation_id = c.id))
  );
$$;

revoke all on function public.aggregate_ai_daily_metrics(date),
  public.delete_expired_ai_quality_data(integer), public.get_ai_quality_storage_metrics()
  from public, anon, authenticated, service_role;
grant execute on function public.aggregate_ai_daily_metrics(date),
  public.delete_expired_ai_quality_data(integer), public.get_ai_quality_storage_metrics() to service_role;

commit;
