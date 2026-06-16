import { Link } from "wouter";
import {
  Boxes,
  ClipboardList,
  Megaphone,
  PackageCheck,
  ScanLine,
  ShoppingBag,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminShopNavKey =
  | "home"
  | "products"
  | "orders"
  | "inventory"
  | "scan"
  | "pos"
  | "social"
  | "warehouse";

type AdminShopNavProps = {
  current?: AdminShopNavKey;
};

const navItems: Array<{
  key: Exclude<AdminShopNavKey, "home">;
  label: string;
  href: string;
  icon: typeof Boxes;
}> = [
  { key: "products", label: "商品", href: "/admin/shop/products", icon: Boxes },
  { key: "orders", label: "訂單", href: "/admin/shop/orders", icon: ClipboardList },
  { key: "inventory", label: "庫存", href: "/admin/shop/inventory", icon: PackageCheck },
  { key: "scan", label: "入庫", href: "/admin/shop/scan", icon: ScanLine },
  { key: "pos", label: "現場銷售 POS", href: "/admin/shop/pos", icon: ShoppingBag },
  { key: "social", label: "自動發文", href: "/admin/shop/social", icon: Megaphone },
  { key: "warehouse", label: "倉儲與資產", href: "/admin/shop/warehouse", icon: Warehouse },
];

export default function AdminShopNav({ current = "home" }: AdminShopNavProps) {
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
          {navItems.map((item) => {
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
