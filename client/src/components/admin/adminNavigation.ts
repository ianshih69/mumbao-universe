import type { AdminIdentity } from "@/lib/shop/adminAuth";

export type AdminNavItem = {
  key: string;
  label: string;
  href: string;
  permission?: string;
  roles?: string[];
  match?: string[];
};

export type AdminNavSection = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavigationSections: AdminNavSection[] = [
  {
    label: "總覽",
    items: [{ key: "overview", label: "管理總覽", href: "/admin", match: ["/admin"] }],
  },
  {
    label: "房況與訂房",
    items: [{ key: "bookings", label: "房況與訂房管理", href: "/admin/bookings" }],
  },
  {
    label: "官網內容",
    items: [{ key: "site", label: "官網內容管理", href: "/admin/site", roles: ["super_admin", "admin"] }],
  },
  {
    label: "客服管理",
    items: [{ key: "chats", label: "問慢寶客服", href: "/admin/chats", roles: ["super_admin", "admin", "manager"] }],
  },
  {
    label: "商城管理",
    items: [
      { key: "shop", label: "商城總覽", href: "/admin/shop" },
      { key: "products", label: "商品", href: "/admin/shop/products", permission: "products.view" },
      { key: "orders", label: "商城訂單", href: "/admin/shop/orders", permission: "orders.view" },
      { key: "inventory", label: "庫存", href: "/admin/shop/inventory", permission: "inventory.view" },
      { key: "scan", label: "入庫", href: "/admin/shop/scan", permission: "receiving.view" },
      { key: "pos", label: "POS", href: "/admin/shop/pos", permission: "pos.view" },
      { key: "warehouse", label: "倉儲與資產", href: "/admin/shop/warehouse", permission: "warehouse.supplies.view" },
    ],
  },
  {
    label: "會員管理",
    items: [
      { key: "members", label: "會員", href: "/admin/members", permission: "users.view", match: ["/admin/members"] },
      { key: "redemptions", label: "積分兌換", href: "/admin/point-redemptions", permission: "users.view" },
    ],
  },
  {
    label: "系統管理",
    items: [
      { key: "users", label: "管理員／使用者", href: "/admin/shop/users", permission: "users.view" },
      { key: "account", label: "帳號設定", href: "/admin/shop/account" },
      { key: "audit", label: "操作紀錄", href: "/admin/shop/audit-logs", permission: "audit_logs.view" },
    ],
  },
];

export function hasAdminNavPermission(identity: AdminIdentity | null, permission?: string) {
  if (!identity) return false;
  if (identity.is_active === false) return false;
  if (!permission) return true;
  return (
    identity.role_code === "super_admin" ||
    identity.permissions.includes("*") ||
    identity.permissions.includes(permission)
  );
}

export function canViewAdminNavItem(item: AdminNavItem, identity: AdminIdentity | null) {
  if (!identity) return false;
  if (identity.is_active === false) return false;
  if (item.roles?.length && !item.roles.includes(identity.role_code)) return false;
  return hasAdminNavPermission(identity, item.permission);
}

export function getVisibleAdminNavigation(identity: AdminIdentity | null) {
  return adminNavigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canViewAdminNavItem(item, identity)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isAdminNavItemActive(pathname: string, item: AdminNavItem) {
  const candidates = item.match || [item.href];
  return candidates.some((candidate) => {
    if (candidate === "/admin") return pathname === "/admin";
    return pathname === candidate || pathname.startsWith(`${candidate}/`);
  });
}

export function findAdminNavItemByPath(pathname: string) {
  for (const section of adminNavigationSections) {
    for (const item of section.items) {
      if (isAdminNavItemActive(pathname, item)) return item;
    }
  }
  return null;
}

export function getAdminPageTitle(pathname: string, fallback = "管理總覽") {
  if (pathname === "/admin/legacy-content") return "舊版內容管理";
  return findAdminNavItemByPath(pathname)?.label || fallback;
}
