import { Link } from "wouter";
import {
  Boxes,
  ClipboardList,
  KeyRound,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminIdentity } from "@/lib/shop/adminAuth";

type AdminShopNavKey =
  | "home"
  | "products"
  | "orders"
  | "inventory"
  | "scan"
  | "pos"
  | "warehouse"
  | "account"
  | "users"
  | "audit";

type AdminShopNavProps = {
  current?: AdminShopNavKey;
};

const navItems: Array<{
  key: Exclude<AdminShopNavKey, "home">;
  label: string;
  href: string;
  icon: typeof Boxes;
  permission?: string;
}> = [
  { key: "products", label: "商品", href: "/admin/shop/products", icon: Boxes, permission: "products.view" },
  { key: "orders", label: "訂單", href: "/admin/shop/orders", icon: ClipboardList, permission: "orders.view" },
  { key: "inventory", label: "庫存", href: "/admin/shop/inventory", icon: PackageCheck, permission: "inventory.view" },
  { key: "scan", label: "入庫", href: "/admin/shop/scan", icon: ScanLine, permission: "receiving.view" },
  { key: "pos", label: "POS", href: "/admin/shop/pos", icon: ShoppingBag, permission: "pos.view" },
  { key: "warehouse", label: "倉儲與資產", href: "/admin/shop/warehouse", icon: Warehouse, permission: "warehouse.supplies.view" },
  { key: "account", label: "帳號設定", href: "/admin/shop/account", icon: KeyRound },
  { key: "users", label: "使用者", href: "/admin/shop/users", icon: UserCog, permission: "users.view" },
  { key: "audit", label: "操作紀錄", href: "/admin/shop/audit-logs", icon: ShieldCheck, permission: "audit_logs.view" },
];

export default function AdminShopNav({ current = "home" }: AdminShopNavProps) {
  const identity = getAdminIdentity();
  const permissions = identity?.permissions || [];
  const canView = (permission?: string) =>
    !permission ||
    identity?.role_code === "super_admin" ||
    permissions.includes("*") ||
    permissions.includes(permission);

  return (
    <nav className="border-b border-stone-200 bg-[#fbf7f1]/95 px-4 py-3 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto">
        <Link
          href="/admin/shop"
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
            current === "home"
              ? "bg-[#8b6f5b] text-white"
              : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
          )}
        >
          總覽
        </Link>
        <div className="flex min-w-max gap-2">
          {navItems.filter((item) => canView(item.permission)).map((item) => {
            const Icon = item.icon;
            const isActive = current === item.key;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition",
                  isActive
                    ? "bg-[#8b6f5b] text-white shadow-sm"
                    : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
