alter table public.shop_social_posts
  add column if not exists ig_media_id text,
  add column if not exists ig_permalink_url text,
  add column if not exists ig_published_at timestamptz,
  add column if not exists ig_status text,
  add column if not exists image_url text,
  add column if not exists r2_key text,
  add column if not exists platform_status jsonb not null default '{}'::jsonb;

alter table public.shop_social_posts
  drop constraint if exists shop_social_posts_ig_status_check;

alter table public.shop_social_posts
  add constraint shop_social_posts_ig_status_check
  check (
    ig_status is null
    or ig_status in ('draft', 'published', 'failed')
  );
