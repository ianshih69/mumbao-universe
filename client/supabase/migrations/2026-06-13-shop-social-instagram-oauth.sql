create table if not exists public.shop_social_platform_credentials (
  platform text primary key
    check (platform in ('instagram')),
  external_user_id text not null,
  username text not null,
  account_name text,
  account_type text,
  access_token text not null,
  token_expires_at timestamptz,
  granted_scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_social_platform_credentials enable row level security;

revoke all on table public.shop_social_platform_credentials from public;
revoke all on table public.shop_social_platform_credentials from anon;
revoke all on table public.shop_social_platform_credentials from authenticated;

grant usage on schema public to service_role;
grant select, insert, update
  on table public.shop_social_platform_credentials
  to service_role;
