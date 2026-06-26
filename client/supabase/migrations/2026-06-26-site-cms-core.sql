create extension if not exists pgcrypto;

create or replace function public.set_site_cms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  page_type text,
  seo_title text,
  seo_description text,
  og_image_url text,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.site_pages(id) on delete cascade,
  section_key text not null,
  section_type text not null,
  title text,
  subtitle text,
  content_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, section_key)
);

create table if not exists public.site_media (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  original_name text,
  url text not null,
  thumbnail_url text,
  width integer,
  height integer,
  size_bytes integer,
  mime_type text,
  alt_text text,
  caption text,
  category text,
  usage_hint text,
  status text not null default 'published'
    check (status in ('published', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content_revisions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  before_json jsonb,
  after_json jsonb,
  action text,
  edited_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists site_pages_slug_idx
  on public.site_pages(slug);

create index if not exists site_sections_page_sort_idx
  on public.site_sections(page_id, sort_order, section_key);

create index if not exists site_sections_status_visible_idx
  on public.site_sections(status, is_visible);

create index if not exists site_media_status_category_idx
  on public.site_media(status, category);

create index if not exists site_content_revisions_target_created_at_idx
  on public.site_content_revisions(target_type, target_id, created_at desc);

drop trigger if exists site_pages_set_updated_at on public.site_pages;
create trigger site_pages_set_updated_at
before update on public.site_pages
for each row execute function public.set_site_cms_updated_at();

drop trigger if exists site_sections_set_updated_at on public.site_sections;
create trigger site_sections_set_updated_at
before update on public.site_sections
for each row execute function public.set_site_cms_updated_at();

drop trigger if exists site_media_set_updated_at on public.site_media;
create trigger site_media_set_updated_at
before update on public.site_media
for each row execute function public.set_site_cms_updated_at();

alter table public.site_pages enable row level security;
alter table public.site_sections enable row level security;
alter table public.site_media enable row level security;
alter table public.site_content_revisions enable row level security;

revoke all on table public.site_pages from public, anon, authenticated;
revoke all on table public.site_sections from public, anon, authenticated;
revoke all on table public.site_media from public, anon, authenticated;
revoke all on table public.site_content_revisions from public, anon, authenticated;

grant select, insert, update, delete on table public.site_pages to service_role;
grant select, insert, update, delete on table public.site_sections to service_role;
grant select, insert, update, delete on table public.site_media to service_role;
grant select, insert on table public.site_content_revisions to service_role;

insert into public.site_pages (slug, title, page_type, status)
values
  ('global', '全站設定', 'global', 'published'),
  ('home', '首頁', 'page', 'published'),
  ('about', '關於我們', 'page', 'draft'),
  ('news', '最新消息', 'page', 'draft'),
  ('mumbao', '認識慢寶', 'page', 'draft'),
  ('rooms', '房型介紹', 'page', 'published'),
  ('booking', '線上訂房頁', 'page', 'published'),
  ('shop', '宇宙碎品頁', 'page', 'published'),
  ('press', '媒體報導', 'page', 'draft')
on conflict (slug) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'global.top_banner', 'top_banner', '全站上方公告', null,
  '{
    "text": "官網建置中｜預計 2026 年 7～9 月試營運／正式營業",
    "is_visible": true
  }'::jsonb,
  10
from public.site_pages where slug = 'global'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'global.navigation', 'navigation', '前台導覽選單', null,
  '{
    "items": [
      { "label": "關於我們", "href": "/about", "internal": true, "is_visible": true, "sort_order": 10 },
      { "label": "最新消息", "href": "/#news", "internal": false, "is_visible": true, "sort_order": 20 },
      { "label": "認識慢寶", "href": "/about-mumbao", "internal": true, "is_visible": true, "sort_order": 30 },
      { "label": "房型介紹", "href": "/#rooms", "internal": false, "is_visible": true, "sort_order": 40 },
      { "label": "線上訂房", "href": "/booking", "internal": true, "is_visible": true, "sort_order": 50 },
      { "label": "宇宙碎品", "href": "/shop", "internal": true, "is_visible": true, "sort_order": 60 },
      { "label": "媒體報導", "href": "/#news", "internal": false, "is_visible": true, "sort_order": 70 }
    ]
  }'::jsonb,
  20
from public.site_pages where slug = 'global'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'global.footer', 'footer', 'Footer', null,
  '{"note": "慢慢蒔光 STime Villa"}'::jsonb,
  30
from public.site_pages where slug = 'global'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'global.seo', 'seo', '全站 SEO', null,
  '{"site_name": "慢慢蒔光 STime Villa", "description": "宜蘭員山包棟 villa"}'::jsonb,
  40
from public.site_pages where slug = 'global'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'home.hero', 'hero', '首頁主視覺', null,
  '{
    "eyebrow": "慢下來，回到有光的地方",
    "title": "慢慢蒔光 STime Villa",
    "subtitle": "宜蘭員山包棟 villa，一天只接待一組客人。",
    "body": "在山與田之間，留一段安靜給自己、家人與毛孩。",
    "button_text": "查看線上訂房",
    "button_href": "/booking",
    "desktop_image_url": "/images/Hero.webp",
    "mobile_image_url": "/images/Hero.webp",
    "alt_text": "慢慢蒔光 villa 主視覺"
  }'::jsonb,
  10
from public.site_pages where slug = 'home'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'home.booking_cta', 'cta', '首頁預約導引', null,
  '{"title": "預約一段慢下來的時間", "button_text": "前往線上訂房", "button_href": "/booking"}'::jsonb,
  50
from public.site_pages where slug = 'home'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'booking.hero', 'hero', '訂房頁主視覺', null,
  '{
    "eyebrow": "STime Villa Booking",
    "title": "預約・歸零",
    "subtitle": "請先選擇入住與退房日期。目前開放未來 {bookingWindowLabel} 內預約，實際可預約日期以房況日曆為準。"
  }'::jsonb,
  10
from public.site_pages where slug = 'booking'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'booking.instructions', 'instructions', '預約說明', null,
  '{
    "items": [
      "此頁為預約申請，送出後由我們人工確認。",
      "可預約範圍、包棟或單間開放狀態，依後台設定顯示。",
      "若日期已被訂房、保留或維修封鎖，將無法送出申請。"
    ]
  }'::jsonb,
  20
from public.site_pages where slug = 'booking'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'booking.pet_note', 'note', '寵物友善說明', null,
  '{"text": "慢慢蒔光為寵物友善 villa，實際入住規範與清潔注意事項，將於人工確認時一併說明。"}'::jsonb,
  30
from public.site_pages where slug = 'booking'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'booking.success_message', 'message', '送出成功文案', null,
  '{"text": "已收到您的預約申請。我們會先確認房況，再與您聯繫付款與訂房細節。此申請尚未代表訂房成立。"}'::jsonb,
  40
from public.site_pages where slug = 'booking'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'rooms.hero', 'hero', '房型介紹主視覺', null,
  '{"eyebrow": "The Sanctuaries", "title": "房型介紹", "subtitle": "五間主題房，留給一組客人的完整時光。"}'::jsonb,
  10
from public.site_pages where slug = 'rooms'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'rooms.villa_intro', 'text', '整棟 Villa 介紹', null,
  '{"text": "慢慢蒔光目前共有 5 間主題房，包棟入住時整棟 villa 只接待同一組客人。"}'::jsonb,
  20
from public.site_pages where slug = 'rooms'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'rooms.room_list', 'room_list', '五間房介紹', null,
  '{
    "rooms": [
      { "name": "Blue Ocean", "title": "藍色主題房", "description": "留給海風與睡眠的一間房。", "image_url": "", "alt_text": "藍色主題房" },
      { "name": "Acacia", "title": "相思主題房", "description": "把樹影與日光收進窗邊。", "image_url": "", "alt_text": "相思主題房" },
      { "name": "Moon Pond", "title": "月池主題房", "description": "適合把夜晚放慢的一間房。", "image_url": "", "alt_text": "月池主題房" },
      { "name": "Mist Valley", "title": "霧谷主題房", "description": "山色與清晨霧氣在這裡停留。", "image_url": "", "alt_text": "霧谷主題房" },
      { "name": "Starry Night", "title": "星夜主題房", "description": "把星光留給入睡前的片刻。", "image_url": "", "alt_text": "星夜主題房" }
    ]
  }'::jsonb,
  30
from public.site_pages where slug = 'rooms'
on conflict (page_id, section_key) do nothing;

insert into public.site_sections (page_id, section_key, section_type, title, subtitle, content_json, sort_order)
select id, 'shop.hero', 'hero', '宇宙碎品頁主視覺', null,
  '{"title": "宇宙碎品", "subtitle": "慢慢蒔光的文創小物與生活選品。"}'::jsonb,
  10
from public.site_pages where slug = 'shop'
on conflict (page_id, section_key) do nothing;
