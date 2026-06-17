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

grant select, insert, update, delete on table public.admin_roles to service_role;
grant select, insert, update, delete on table public.admin_permissions to service_role;
grant select, insert, update, delete on table public.admin_role_permissions to service_role;
grant select, insert, update, delete on table public.admin_profiles to service_role;
grant select, insert, update, delete on table public.admin_activity_logs to service_role;

insert into public.admin_roles (code, name, description, is_system)
values
  ('super_admin', '超級管理員', '擁有全部後台功能與使用者權限管理能力。', true),
  ('admin', '一般管理員', '可管理商城、倉儲、POS 與社群日常營運。', true),
  ('housekeeper', '管家', '可查看訂單、調整備品、管理房務存證與倉庫位置。', true),
  ('cleaner', '清潔人員', '可查看倉庫位置、調整備品數量並新增房務照片。', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system;

insert into public.admin_permissions (code, module, action, description)
values
  ('dashboard.view', 'dashboard', 'view', '查看後台總覽'),
  ('products.view', 'products', 'view', '查看商品'),
  ('products.create', 'products', 'create', '新增商品'),
  ('products.update', 'products', 'update', '編輯商品'),
  ('products.delete', 'products', 'delete', '刪除或封存商品'),
  ('orders.view', 'orders', 'view', '查看訂單'),
  ('orders.update', 'orders', 'update', '更新訂單'),
  ('inventory.view', 'inventory', 'view', '查看庫存'),
  ('inventory.update', 'inventory', 'update', '調整庫存'),
  ('receiving.view', 'receiving', 'view', '查看入庫'),
  ('receiving.create', 'receiving', 'create', '新增入庫'),
  ('receiving.update', 'receiving', 'update', '更新入庫'),
  ('pos.view', 'pos', 'view', '查看 POS'),
  ('pos.create', 'pos', 'create', '建立 POS 銷售'),
  ('social.view', 'social', 'view', '查看社群發文'),
  ('social.publish', 'social', 'publish', '發布社群貼文'),
  ('social.manage_connection', 'social', 'manage_connection', '管理社群連線'),
  ('warehouse.view', 'warehouse', 'view', '查看倉儲與資產'),
  ('warehouse.supply.create', 'warehouse', 'supply.create', '新增備品'),
  ('warehouse.supply.update', 'warehouse', 'supply.update', '編輯備品'),
  ('warehouse.supply.delete', 'warehouse', 'supply.delete', '刪除備品'),
  ('warehouse.supply.adjust_quantity', 'warehouse', 'supply.adjust_quantity', '調整備品數量'),
  ('warehouse.furniture.create', 'warehouse', 'furniture.create', '新增傢俱資產'),
  ('warehouse.furniture.update', 'warehouse', 'furniture.update', '編輯傢俱資產'),
  ('warehouse.furniture.delete', 'warehouse', 'furniture.delete', '刪除傢俱資產'),
  ('warehouse.housekeeping.create', 'warehouse', 'housekeeping.create', '新增房務存證'),
  ('warehouse.housekeeping.update', 'warehouse', 'housekeeping.update', '編輯房務存證'),
  ('warehouse.housekeeping.delete', 'warehouse', 'housekeeping.delete', '刪除房務存證'),
  ('warehouse.locations.view', 'warehouse', 'locations.view', '查看倉庫位置'),
  ('users.view', 'users', 'view', '查看後台使用者'),
  ('users.create', 'users', 'create', '新增後台使用者'),
  ('users.update', 'users', 'update', '編輯後台使用者'),
  ('users.disable', 'users', 'disable', '啟用或停用後台使用者'),
  ('users.manage_roles', 'users', 'manage_roles', '管理角色與權限'),
  ('audit_logs.view', 'audit_logs', 'view', '查看操作紀錄')
on conflict (code) do update
set
  module = excluded.module,
  action = excluded.action,
  description = excluded.description;

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
  ('admin', 'warehouse.view'),
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
  ('housekeeper', 'warehouse.view'),
  ('housekeeper', 'warehouse.supply.update'),
  ('housekeeper', 'warehouse.supply.adjust_quantity'),
  ('housekeeper', 'warehouse.furniture.update'),
  ('housekeeper', 'warehouse.housekeeping.create'),
  ('housekeeper', 'warehouse.housekeeping.update'),
  ('housekeeper', 'warehouse.locations.view'),
  ('cleaner', 'warehouse.view'),
  ('cleaner', 'warehouse.supply.adjust_quantity'),
  ('cleaner', 'warehouse.housekeeping.create'),
  ('cleaner', 'warehouse.locations.view')
on conflict do nothing;
