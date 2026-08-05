import { Link, useLocation } from "wouter";
import {
  CalendarDays,
  FileText,
  Gem,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  UsersRound,
} from "lucide-react";
import { getAdminIdentity } from "@/lib/shop/adminAuth";
import { canViewAdminNavItem } from "@/components/admin/adminNavigation";

const overviewCards = [
  {
    title: "房況與訂房管理",
    description: "查看房況日曆、訂房申請、同步狀態與房況警示。",
    href: "/admin/bookings",
    icon: CalendarDays,
  },
  {
    title: "官網內容管理",
    description: "管理官網頁面內容與圖片素材。",
    href: "/admin/site",
    icon: FileText,
    roles: ["super_admin", "admin"],
  },
  {
    title: "問慢寶客服",
    description: "查看客服對話、人工接手與待處理訊息。",
    href: "/admin/chats",
    icon: MessageCircle,
    roles: ["super_admin", "admin", "manager"],
  },
  {
    title: "商城管理",
    description: "管理商品、商城訂單、庫存、入庫與 POS。",
    href: "/admin/shop",
    icon: ShoppingBag,
  },
  {
    title: "會員管理",
    description: "查看會員資料、會員等級與消費紀錄。",
    href: "/admin/members",
    icon: UsersRound,
    permission: "users.view",
  },
  {
    title: "積分兌換",
    description: "處理鑽石會員合作回饋積分兌換申請。",
    href: "/admin/point-redemptions",
    icon: Gem,
    permission: "users.view",
  },
  {
    title: "操作紀錄",
    description: "查詢管理員操作紀錄與登入安全紀錄。",
    href: "/admin/shop/audit-logs",
    icon: ShieldCheck,
    permission: "audit_logs.view",
  },
];

export default function AdminOverview() {
  const [, setLocation] = useLocation();
  const identity = getAdminIdentity();
  const visibleCards = overviewCards.filter((card) =>
    canViewAdminNavItem(
      {
        key: card.href,
        label: card.title,
        href: card.href,
        permission: card.permission,
        roles: card.roles,
      },
      identity
    )
  );

  return (
    <main className="px-4 py-5 md:px-8 md:py-6">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                aria-label={`前往${card.title}`}
                onKeyDown={(event) => {
                  if (event.key !== " " && event.key !== "Spacebar") return;
                  event.preventDefault();
                  setLocation(card.href);
                }}
                className="group rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-[#b99aa2] hover:shadow-md focus-visible:border-[#8b6f5b] focus-visible:ring-2 focus-visible:ring-[#ead8c8]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-stone-900">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{card.description}</p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f4ece2] text-[#8b6f5b] transition group-hover:bg-[#8b6f5b] group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-5 text-sm font-semibold text-[#8b6f5b]" aria-hidden="true">
                  →
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
