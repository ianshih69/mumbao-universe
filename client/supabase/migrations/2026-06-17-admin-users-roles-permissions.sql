create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  code text primary key,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  code text primary key,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_code text not null references public.admin_roles(code) on update cascade on delete cascade,
  permission_code text not null references public.admin_permissions(code) on update cascade on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on update cascade on delete cascade,
  display_name text not null,
  email text not null,
  role_code text not null references public.admin_roles(code) on update cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on update cascade on delete set null,
  last_login_at timestamptz,
  constraint admin_profiles_email_lower_check check (email = lower(email))
);

create unique index if not exists admin_profiles_email_unique_idx
  on public.admin_profiles (email);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_name text,
  actor_email text,
  action text not null,
  module text not null,
  target_type text,
  target_id text,
  description text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create or replace function public.set_admin_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_roles_updated_at on public.admin_roles;
create trigger set_admin_roles_updated_at
  before update on public.admin_roles
  for each row
  execute function public.set_admin_updated_at();

drop trigger if exists set_admin_profiles_updated_at on public.admin_profiles;
create trigger set_admin_profiles_updated_at
  before update on public.admin_profiles
  for each row
  execute function public.set_admin_updated_at();

create index if not exists admin_profiles_auth_user_id_idx
  on public.admin_profiles (auth_user_id);

create index if not exists admin_profiles_email_idx
  on public.admin_profiles (email);

create index if not exists admin_profiles_role_code_idx
  on public.admin_profiles (role_code);

create index if not exists admin_activity_logs_actor_idx
  on public.admin_activity_logs (actor_auth_user_id, created_at desc);

create index if not exists admin_activity_logs_module_action_idx
  on public.admin_activity_logs (module, action, created_at desc);

create index if not exists admin_activity_logs_created_at_idx
  on public.admin_activity_logs (created_at desc);

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.admin_activity_logs enable row level security;

revoke all on table public.admin_roles from public, anon, authenticated;
revoke all on table public.admin_permissions from public, anon, authenticated;
revoke all on table public.admin_role_permissions from public, anon, authenticated;
revoke all on table public.admin_profiles from public, anon, authenticated;
revoke all on table public.admin_activity_logs from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.admin_roles to service_role;
grant select, insert, update, delete on table public.admin_permissions to service_role;
grant select, insert, update, delete on table public.admin_role_permissions to service_role;
grant select, insert, update, delete on table public.admin_profiles to service_role;
grant select, insert, update, delete on table public.admin_activity_logs to service_role;

insert into public.admin_roles (code, name, description, is_system)
values
  ('super_admin', 'Super Admin', 'Full system access, including users, roles, permissions, and audit logs.', true),
  ('admin', 'Admin', 'General admin access for shop, warehouse, POS, social publishing, and audit logs.', true),
  ('housekeeper', 'Housekeeper', 'Operations access for orders, supplies, furniture, housekeeping, and warehouse locations.', true),
  ('cleaner', 'Cleaner', 'Limited access for supplies, warehouse locations, and own housekeeping records.', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  updated_at = now();

insert into public.admin_permissions (code, module, action, description)
values
  ('dashboard.view', 'dashboard', 'view', 'View admin dashboard'),
  ('products.view', 'products', 'view', 'View products'),
  ('products.create', 'products', 'create', 'Create products'),
  ('products.update', 'products', 'update', 'Update products'),
  ('products.delete', 'products', 'delete', 'Delete or archive products'),
  ('orders.view', 'orders', 'view', 'View orders'),
  ('orders.update', 'orders', 'update', 'Update orders'),
  ('inventory.view', 'inventory', 'view', 'View shop inventory'),
  ('inventory.update', 'inventory', 'update', 'Update shop inventory'),
  ('receiving.view', 'receiving', 'view', 'View receiving scan'),
  ('receiving.create', 'receiving', 'create', 'Create receiving records'),
  ('receiving.update', 'receiving', 'update', 'Update receiving records'),
  ('pos.view', 'pos', 'view', 'View POS'),
  ('pos.create', 'pos', 'create', 'Create POS sale'),
  ('social.view', 'social', 'view', 'View social publishing'),
  ('social.publish', 'social', 'publish', 'Publish social posts'),
  ('social.manage_connection', 'social', 'manage_connection', 'Manage social platform connections'),
  ('warehouse.supplies.view', 'warehouse', 'supplies.view', 'View supplies'),
  ('warehouse.furniture.view', 'warehouse', 'furniture.view', 'View furniture assets'),
  ('warehouse.housekeeping.view_all', 'warehouse', 'housekeeping.view_all', 'View all housekeeping records'),
  ('warehouse.housekeeping.view_own', 'warehouse', 'housekeeping.view_own', 'View own housekeeping records'),
  ('warehouse.supply.create', 'warehouse', 'supply.create', 'Create supplies'),
  ('warehouse.supply.update', 'warehouse', 'supply.update', 'Update supplies'),
  ('warehouse.supply.delete', 'warehouse', 'supply.delete', 'Delete supplies'),
  ('warehouse.supply.adjust_quantity', 'warehouse', 'supply.adjust_quantity', 'Adjust supply quantity'),
  ('warehouse.furniture.create', 'warehouse', 'furniture.create', 'Create furniture assets'),
  ('warehouse.furniture.update', 'warehouse', 'furniture.update', 'Update furniture assets'),
  ('warehouse.furniture.delete', 'warehouse', 'furniture.delete', 'Delete furniture assets'),
  ('warehouse.housekeeping.create', 'warehouse', 'housekeeping.create', 'Create housekeeping records'),
  ('warehouse.housekeeping.update', 'warehouse', 'housekeeping.update', 'Update housekeeping records'),
  ('warehouse.housekeeping.delete', 'warehouse', 'housekeeping.delete', 'Delete housekeeping records'),
  ('warehouse.locations.view', 'warehouse', 'locations.view', 'View warehouse locations'),
  ('users.view', 'users', 'view', 'View admin users'),
  ('users.create', 'users', 'create', 'Create admin users'),
  ('users.update', 'users', 'update', 'Update admin users'),
  ('users.disable', 'users', 'disable', 'Disable admin users'),
  ('users.manage_roles', 'users', 'manage_roles', 'Manage admin roles'),
  ('audit_logs.view', 'audit_logs', 'view', 'View audit logs')
on conflict (code) do update
set
  module = excluded.module,
  action = excluded.action,
  description = excluded.description;

delete from public.admin_role_permissions
where permission_code = 'warehouse.view';

delete from public.admin_permissions
where code = 'warehouse.view';

insert into public.admin_role_permissions (role_code, permission_code)
select 'super_admin', code from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_code, permission_code)
values
  ('admin', 'dashboard.view'),
  ('admin', 'products.view'),
  ('admin', 'products.create'),
  ('admin', 'products.update'),
  ('admin', 'products.delete'),
  ('admin', 'orders.view'),
  ('admin', 'orders.update'),
  ('admin', 'inventory.view'),
  ('admin', 'inventory.update'),
  ('admin', 'receiving.view'),
  ('admin', 'receiving.create'),
  ('admin', 'receiving.update'),
  ('admin', 'pos.view'),
  ('admin', 'pos.create'),
  ('admin', 'social.view'),
  ('admin', 'social.publish'),
  ('admin', 'social.manage_connection'),
  ('admin', 'warehouse.supplies.view'),
  ('admin', 'warehouse.furniture.view'),
  ('admin', 'warehouse.housekeeping.view_all'),
  ('admin', 'warehouse.supply.create'),
  ('admin', 'warehouse.supply.update'),
  ('admin', 'warehouse.supply.delete'),
  ('admin', 'warehouse.supply.adjust_quantity'),
  ('admin', 'warehouse.furniture.create'),
  ('admin', 'warehouse.furniture.update'),
  ('admin', 'warehouse.furniture.delete'),
  ('admin', 'warehouse.housekeeping.create'),
  ('admin', 'warehouse.housekeeping.update'),
  ('admin', 'warehouse.housekeeping.delete'),
  ('admin', 'warehouse.locations.view'),
  ('admin', 'audit_logs.view'),
  ('housekeeper', 'orders.view'),
  ('housekeeper', 'warehouse.supplies.view'),
  ('housekeeper', 'warehouse.furniture.view'),
  ('housekeeper', 'warehouse.housekeeping.view_all'),
  ('housekeeper', 'warehouse.supply.update'),
  ('housekeeper', 'warehouse.supply.adjust_quantity'),
  ('housekeeper', 'warehouse.furniture.update'),
  ('housekeeper', 'warehouse.housekeeping.create'),
  ('housekeeper', 'warehouse.housekeeping.update'),
  ('housekeeper', 'warehouse.locations.view'),
  ('cleaner', 'warehouse.supplies.view'),
  ('cleaner', 'warehouse.housekeeping.view_own'),
  ('cleaner', 'warehouse.supply.adjust_quantity'),
  ('cleaner', 'warehouse.housekeeping.create'),
  ('cleaner', 'warehouse.locations.view')
on conflict do nothing;
