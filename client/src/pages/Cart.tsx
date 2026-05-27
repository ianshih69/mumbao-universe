import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag } from "lucide-react";
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
            <p className="text-sm text-[#527467]">MUMBAO Shop</p>
            <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
              購物車
            </h1>
          </div>
          <Button asChild variant="outline" className="rounded-full bg-white">
            <Link href="/shop">繼續逛逛</Link>
          </Button>
        </div>

        {items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-stone-300" />
            <h2 className="font-serif text-2xl text-stone-900">購物車還是空的</h2>
            <p className="mt-2 text-sm text-stone-500">
              去看看慢寶周邊、明信片、版畫與文創小物吧。
            </p>
            <Button asChild className="mt-6 rounded-full bg-[#527467] text-white hover:bg-[#456257]">
              <Link href="/shop">前往文創商品</Link>
            </Button>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <section className="space-y-3">
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
            <CheckoutSummary items={items} onAction={() => setLocation("/checkout")} actionLabel="前往結帳" />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
