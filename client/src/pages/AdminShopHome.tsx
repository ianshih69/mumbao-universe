import {
  Boxes,
  ClipboardList,
  PackageCheck,
  ScanLine,
  ShoppingBag,
} from "lucide-react";
import AdminShopNav from "@/components/shop/AdminShopNav";

const entryCards = [
  {
    title: "商品管理",
    description: "新增商品、調整價格、庫存、圖片與上架狀態。",
    href: "/admin/shop/products",
    icon: Boxes,
  },
  {
    title: "訂單管理",
    description: "查看官網訂單與現場銷售訂單，更新付款與訂單狀態。",
    href: "/admin/shop/orders",
    icon: ClipboardList,
  },
  {
    title: "庫存調整",
    description: "手動入庫、扣庫存、盤點調整，並查看庫存流水。",
    href: "/admin/shop/inventory",
    icon: PackageCheck,
  },
  {
    title: "掃描入庫",
    description: "用手機掃商品 QR code，確認後快速增加庫存。",
    href: "/admin/shop/scan",
    icon: ScanLine,
  },
  {
    title: "現場銷售 POS",
    description: "掃 QR 或手動 key 單，完成現場銷售並扣庫存。",
    href: "/admin/shop/pos",
    icon: ShoppingBag,
  },
];

export default function AdminShopHome() {
  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-7 backdrop-blur md:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            MUMBAO Shop Admin
          </p>
          <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
            商城後台
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
            集中管理慢寶商品、訂單、庫存、入庫與現場銷售。這裡只提供入口，實際操作仍會在各功能頁驗證後台密碼。
          </p>
        </div>
      </header>

      <AdminShopNav current="home" />

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-6 sm:grid-cols-2 lg:grid-cols-3 md:px-8 md:py-8">
        {entryCards.map((card) => {
          const Icon = card.icon;

          return (
            <a
              key={card.href}
              href={card.href}
              className="group rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b99aa2] hover:shadow-md"
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-[#f4ece2] text-[#8b6f5b] group-hover:bg-[#8b6f5b] group-hover:text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-stone-900">{card.title}</h2>
              <p className="mt-2 min-h-[3rem] text-sm leading-6 text-stone-500">
                {card.description}
              </p>
              <span className="mt-5 inline-flex rounded-full bg-[#8b6f5b] px-4 py-2 text-sm font-medium text-white">
                進入管理
              </span>
            </a>
          );
        })}
      </section>
    </main>
  );
}
