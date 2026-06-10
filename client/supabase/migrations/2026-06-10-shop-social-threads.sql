alter table public.shop_social_posts
  add column if not exists threads_media_id text,
  add column if not exists threads_permalink_url text,
  add column if not exists threads_published_at timestamptz,
  add column if not exists threads_status text,
  add column if not exists threads_error text;

alter table public.shop_social_posts
  drop constraint if exists shop_social_posts_threads_status_check;

alter table public.shop_social_posts
  add constraint shop_social_posts_threads_status_check
  check (
    threads_status is null
    or threads_status in ('draft', 'published', 'failed')
  );
