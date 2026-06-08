import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { CartLineItem } from "@/components/shop/CartLineItem";
import { CheckoutSummary } from "@/components/shop/CheckoutSummary";
import {
  readCartItems,
  removeCartItem,
  subscribeCart,
  updateCartItemQuantity,
} from "@/lib/shop/cartStore";
import type { CartItem } from "@/lib/shop/types";

export default function Cart() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<CartItem[]>(() => readCartItems());

  useEffect(() => subscribeCart(() => setItems(readCartItems())), []);

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">
              MUMBAO SHOP
            </p>
            <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
              購物車
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              確認商品、規格與數量後，就可以前往結帳。
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-[#eadfce] bg-white text-[#8b6f5b] hover:bg-[#f3eadf]"
          >
            <Link href="/shop">
              <ArrowLeft className="h-4 w-4" />
              返回宇宙碎品商店
            </Link>
          </Button>
        </div>

        {items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-[#fffdf8] px-6 py-16 text-center shadow-sm shadow-stone-200/50">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <h2 className="font-serif text-2xl text-stone-900">購物車還是空的</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-stone-500">
              慢寶宇宙裡的小小陪伴還在架上等你。可以先回商店看看明信片、杯墊、版畫與文創小物。
            </p>
            <Button asChild className="mt-6 rounded-full bg-[#8b6f5b] px-6 text-white hover:bg-[#765d4a]">
              <Link href="/shop">返回宇宙碎品商店</Link>
            </Button>
          </section>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* 左側商品列表 */}
            <section className="min-w-0 flex-1 space-y-3">
              {items.map((item) => (
                <CartLineItem
                  key={item.variantId}
                  item={item}
                  onQuantityChange={(quantity) =>
                    updateCartItemQuantity(item.variantId, quantity)
                  }
                  onRemove={() => removeCartItem(item.variantId)}
                />
              ))}
            </section>

            {/* 右側訂單摘要 */}
            <aside className="w-full lg:w-[360px] lg:shrink-0 lg:sticky lg:top-32">
              <CheckoutSummary items={items} onAction={() => setLocation("/checkout")} actionLabel="前往結帳" />
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
