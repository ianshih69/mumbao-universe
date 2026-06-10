create table if not exists public.shop_social_posts (
  id text primary key,
  title text not null default '',
  content text not null default '',
  hashtags text not null default '',
  platforms jsonb not null default '[]'::jsonb,
  mode text not null default 'now'
    check (mode in ('now', 'scheduled')),
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'deleted', 'failed')),
  media_file_names jsonb not null default '[]'::jsonb,
  media_files jsonb not null default '[]'::jsonb,
  fb_post_id text,
  fb_permalink_url text,
  published_at timestamptz,
  deleted_at timestamptz,
  delete_source text
    check (delete_source in ('admin', 'facebook', 'api')),
  last_synced_at timestamptz,
  publish_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_social_posts_status_updated_idx
  on public.shop_social_posts (status, updated_at desc);

grant usage on schema public to service_role;
grant select, insert, update on table public.shop_social_posts to service_role;
