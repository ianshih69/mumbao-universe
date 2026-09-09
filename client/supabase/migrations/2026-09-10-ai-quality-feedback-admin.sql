begin;

-- Feedback is current state, not an accumulating audit history.
alter table public.ai_quality_messages
  add column if not exists feedback_window_at timestamptz,
  add column if not exists feedback_request_count integer not null default 0 check (feedback_request_count >= 0);
alter table public.ai_quality_events
  add column if not exists feedback_category text check (feedback_category in
    ('incorrect_answer','misunderstood_question','repeated_question','too_verbose','other')),
  add column if not exists feedback_updated_at timestamptz,
  add column if not exists reviewed_at timestamptz;
create unique index if not exists ai_quality_active_feedback_idx
  on public.ai_quality_events(quality_conversation_id, turn_key_hash)
  where event_type in ('positive_feedback','negative_feedback');
create index if not exists ai_quality_events_page_idx on public.ai_quality_events(created_at desc, id desc);
create index if not exists ai_quality_conversations_activity_idx on public.ai_quality_conversations(last_activity_at desc);

insert into public.admin_permissions(code, module, action, description) values
  ('ai_quality.view','ai_quality','view','View sanitized AI quality evidence'),
  ('ai_quality.review','ai_quality','review','Mark AI quality evidence as reviewed')
on conflict (code) do nothing;

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
  update public.ai_quality_conversations set has_negative_feedback = exists(
    select 1 from public.ai_quality_events where quality_conversation_id = c.id and event_type = 'negative_feedback'
  ) where id = c.id;
  return jsonb_build_object('result','saved');
end;
$$;

-- Read only, bounded current-state metrics. Never run archival aggregation on page load.
create or replace function public.read_ai_quality_overview(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
set statement_timeout = '3s' as $$
declare result jsonb;
begin
  if p_days is null or p_days not in (7,30) then raise exception using errcode='22023',message='invalid_request'; end if;
  with recent as materialized (
    select event_type,severity,feedback_category,quality_conversation_id,turn_key_hash,id,created_at
    from public.ai_quality_events where created_at >= now() - make_interval(days => p_days)
    order by created_at desc,id desc limit 5001
  ), sample as (select * from recent order by created_at desc,id desc limit 5000),
  conversations as (
    select id from public.ai_quality_conversations where last_activity_at >= now() - make_interval(days => p_days)
    order by last_activity_at desc limit 5001
  )
  select jsonb_build_object(
    'conversations',least((select count(*) from conversations),5000),
    'positive',(select count(*) from sample where event_type='positive_feedback'),
    'negative',(select count(*) from sample where event_type='negative_feedback'),
    'high_risk',(select count(*) from sample where severity in ('high','critical')),
    'problem_turns',(select count(distinct (quality_conversation_id,coalesce(turn_key_hash,id::text))) from sample
      where event_type <> 'positive_feedback'),
    'categories',(select coalesce(jsonb_object_agg(feedback_category,n),'{}'::jsonb) from (
      select feedback_category,count(*) n from sample where event_type='negative_feedback'
        and feedback_category is not null group by feedback_category) categories),
    'limited',(select count(*)>5000 from recent) or (select count(*)>5000 from conversations),
    'sample_limit',5000
  ) into result;
  return result;
end;
$$;

create or replace function public.list_ai_quality_events(
  p_days integer default 7, p_type text default 'all', p_severity text default 'all',
  p_reviewed text default 'pending', p_before_at timestamptz default null, p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
set statement_timeout = '3s' as $$
declare result jsonb;
begin
  if p_days is null or p_days not in (7,30) or p_type is null or p_type not in
    ('all','negative','fallback','context','mutation','provider','clarification','pending','budget')
    or p_severity is null or p_severity not in ('all','high','other')
    or p_reviewed is null or p_reviewed not in ('all','pending','reviewed')
    or (p_before_at is null) <> (p_before_id is null) then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  with page as materialized (
    select e.* from public.ai_quality_events e
    where e.created_at >= now() - make_interval(days => p_days)
      and e.event_type <> 'positive_feedback'
      and (p_before_at is null or (e.created_at,e.id) < (p_before_at,p_before_id))
      and (p_reviewed='all' or (p_reviewed='pending' and e.reviewed_at is null)
        or (p_reviewed='reviewed' and e.reviewed_at is not null))
      and (p_severity='all' or (p_severity='high' and e.severity in ('high','critical'))
        or (p_severity='other' and e.severity not in ('high','critical')))
      and (p_type='all'
        or (p_type='negative' and e.event_type='negative_feedback')
        or (p_type='fallback' and e.event_type='generic_fallback')
        or (p_type='context' and e.event_type='context_lost_signal')
        or (p_type='mutation' and e.event_type='wrong_mutation_signal')
        or (p_type='provider' and e.event_type in ('provider_error','provider_schema_reject'))
        or (p_type='clarification' and e.event_type in ('unnecessary_clarification','repeated_question'))
        or (p_type='pending' and e.metadata_json->>'signal_code'='pending_disappeared')
        or (p_type='budget' and e.metadata_json->>'signal_code'='provider_budget_exceeded'))
    order by e.created_at desc,e.id desc limit 26
  ), visible as (select * from page order by created_at desc,id desc limit 25)
  select jsonb_build_object('has_more',(select count(*)>25 from page),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'severity',e.severity,'capability_id',e.capability_id,
      'created_at',e.created_at,'reviewed_at',e.reviewed_at,'feedback_category',e.feedback_category,
      'signal_code',e.metadata_json->>'signal_code',
      'question',left(u.sanitized_text,240),'answer',left(a.sanitized_text,240)
    ) order by e.created_at desc,e.id desc)
    from visible e
    left join public.ai_quality_messages a on a.id=e.quality_message_id and a.retention_expires_at>now()
    left join public.ai_quality_messages u on u.quality_conversation_id=a.quality_conversation_id
      and u.turn_index=a.turn_index and u.role='user' and u.retention_expires_at>now()),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.read_ai_quality_detail(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
set statement_timeout = '3s' as $$
declare e public.ai_quality_events%rowtype; m public.ai_quality_messages%rowtype; context jsonb;
begin
  select * into e from public.ai_quality_events where id=p_event and retention_expires_at>now();
  if not found then return null; end if;
  select * into m from public.ai_quality_messages where id=e.quality_message_id and retention_expires_at>now();
  with turns as (
    (select turn_index from public.ai_quality_messages where quality_conversation_id=e.quality_conversation_id
      and role='assistant' and turn_index<m.turn_index and retention_expires_at>now() order by turn_index desc limit 2)
    union select m.turn_index where m.turn_index is not null
    union
    (select turn_index from public.ai_quality_messages where quality_conversation_id=e.quality_conversation_id
      and role='assistant' and turn_index>m.turn_index and retention_expires_at>now() order by turn_index limit 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'relative',case when q.turn_index<m.turn_index then 'before' when q.turn_index=m.turn_index then 'current' else 'after' end,
    'role',q.role,'text',q.sanitized_text,'created_at',q.created_at
  ) order by q.turn_index,q.role desc),'[]'::jsonb) into context
    from public.ai_quality_messages q where q.quality_conversation_id=e.quality_conversation_id
      and q.turn_index in (select turn_index from turns) and q.retention_expires_at>now();
  return jsonb_build_object('id',e.id,'event_type',e.event_type,'severity',e.severity,
    'capability_id',e.capability_id,'created_at',e.created_at,'reviewed_at',e.reviewed_at,
    'feedback_category',e.feedback_category,'metadata',e.metadata_json,
    'execution',coalesce(m.execution_metadata,'{}'::jsonb),'context',context);
end;
$$;

create or replace function public.review_ai_quality_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
set lock_timeout='2s' set statement_timeout='3s' as $$
begin
  update public.ai_quality_events set reviewed_at=coalesce(reviewed_at,now())
    where id=p_event and retention_expires_at>now();
  return jsonb_build_object('reviewed',found);
end;
$$;

revoke all on function public.submit_ai_quality_feedback(text,text,text,text),
  public.read_ai_quality_overview(integer),
  public.list_ai_quality_events(integer,text,text,text,timestamptz,uuid),
  public.read_ai_quality_detail(uuid),public.review_ai_quality_event(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_ai_quality_feedback(text,text,text,text),
  public.read_ai_quality_overview(integer),
  public.list_ai_quality_events(integer,text,text,text,timestamptz,uuid),
  public.read_ai_quality_detail(uuid),public.review_ai_quality_event(uuid) to service_role;

commit;
