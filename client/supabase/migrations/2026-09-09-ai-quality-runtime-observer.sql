-- Phase 1B. Apply only after separate environment approval; no runtime enablement.
begin;

create or replace function public.ai_quality_valid_metadata(p_value jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare item record;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 4096 then return false; end if;
  for item in select key, value from jsonb_each(p_value) loop
    if item.key in ('provider_used', 'scenario_changed', 'pending_created', 'pending_consumed',
      'generic_fallback', 'clarification', 'semantic_resolver_used', 'read_only_turn') then
      if jsonb_typeof(item.value) <> 'boolean' then return false; end if;
    elsif item.key in ('provider_call_count', 'latency_ms', 'before_version', 'after_version') then
      if jsonb_typeof(item.value) <> 'number' or (item.value #>> '{}') !~ '^[0-9]+$' then return false; end if;
      if (item.value #>> '{}')::numeric > (case item.key when 'provider_call_count' then 32 when 'latency_ms' then 120000 else 1000000 end) then return false; end if;
    elsif item.key = 'capability_id' then
      if jsonb_typeof(item.value) <> 'string' or not public.ai_quality_valid_capability_id(item.value #>> '{}') then return false; end if;
    elsif item.key = 'response_kind' then
      if jsonb_typeof(item.value) <> 'string' or not public.ai_quality_valid_response_kind(item.value #>> '{}') then return false; end if;
    elsif item.key = 'structured_mode' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('legacy', 'shadow', 'active') then return false; end if;
    elsif item.key = 'validation_outcome' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('accepted', 'rejected', 'not_called') then return false; end if;
    elsif item.key = 'provider_error_type' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in
        ('timeout', 'network', 'network_error', 'rate_limit', 'http_error', 'schema_reject', 'invalid_response', 'unknown') then return false; end if;
    elsif item.key = 'provider_role' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('semantic_resolver', 'faq_selector', 'answer', 'unknown') then return false; end if;
    elsif item.key = 'route_kind' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in ('informational', 'transactional', 'dialogue', 'fallback', 'other') then return false; end if;
    elsif item.key = 'goal_id' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in (
        'pet_eligibility_lookup', 'pet_fee_lookup', 'pet_deposit_lookup', 'child_policy_lookup',
        'breakfast_info_lookup', 'checkin_info', 'checkout_info', 'facility_policy_lookup',
        'payment_policy_lookup', 'cancellation_policy_lookup', 'transport_policy_lookup',
        'general_policy_lookup', 'lodging_fee_lookup', 'guest_count_lookup', 'stay_duration_lookup',
        'quote_snapshot', 'quote_patch_add', 'quote_patch_replace', 'quote_patch_remove',
        'request_quote', 'request_availability', 'pending_slot_fill', 'confirmation',
        'correction', 'clarification', 'unrelated', 'true_knowledge_gap'
      ) then return false; end if;
    elsif item.key = 'signal_code' then
      if jsonb_typeof(item.value) <> 'string' or (item.value #>> '{}') not in (
        'readonly_scenario_changed', 'continuation_lost', 'pending_disappeared',
        'known_slot_requested', 'provider_budget_exceeded'
      ) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.ai_quality_conversations
  add column if not exists observer_turn_count integer not null default 0 check (observer_turn_count >= 0);
alter table public.ai_quality_messages
  add column if not exists turn_key_hash text check (turn_key_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists execution_metadata jsonb not null default '{}'::jsonb
    check (public.ai_quality_valid_metadata(execution_metadata));
alter table public.ai_quality_events
  add column if not exists turn_key_hash text check (turn_key_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists ai_quality_messages_idempotency_idx
  on public.ai_quality_messages(quality_conversation_id, turn_key_hash, role);
create unique index if not exists ai_quality_events_idempotency_idx
  on public.ai_quality_events(quality_conversation_id, turn_key_hash, event_type);

-- One-time compatibility with existing Phase 1A rows, never a per-turn count scan.
update public.ai_quality_conversations c set observer_turn_count = greatest(c.observer_turn_count, m.last_turn)
from (select quality_conversation_id, max(turn_index) last_turn from public.ai_quality_messages group by quality_conversation_id) m
where c.id = m.quality_conversation_id and c.observer_turn_count < m.last_turn;

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
  insert into public.ai_quality_messages(quality_conversation_id, turn_index, role, sanitized_text, turn_key_hash)
    values(c.id, turn_number, 'user', p_turn->>'user_text', turn_hash);
  insert into public.ai_quality_messages(
    quality_conversation_id, turn_index, role, sanitized_text, turn_key_hash, capability_id, response_kind,
    provider_used, provider_call_count, scenario_changed, pending_created, pending_consumed,
    generic_fallback, clarification, execution_metadata
  ) values (
    c.id, turn_number, 'assistant', p_turn->>'assistant_text', turn_hash, m->>'capability_id', m->>'response_kind',
    (m->>'provider_used')::boolean, (m->>'provider_call_count')::integer, (m->>'scenario_changed')::boolean,
    (m->>'pending_created')::boolean, (m->>'pending_consumed')::boolean,
    (m->>'generic_fallback')::boolean, (m->>'clarification')::boolean, m
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
  update public.ai_quality_conversations set
    last_activity_at = greatest(last_activity_at, now()),
    message_count = message_count + 2, quality_event_count = quality_event_count + event_count,
    observer_turn_count = turn_number
    where id = c.id;
end;
$$;
revoke all on function public.record_ai_quality_turn(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_ai_quality_turn(jsonb) to service_role;
-- Existing table RLS, retention and permanent owner evidence are unchanged.
commit;
