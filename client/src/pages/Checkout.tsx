import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, CreditCard, MapPin, MessageSquare, UserRound } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CartLineItem } from "@/components/shop/CartLineItem";
import { CheckoutSummary } from "@/components/shop/CheckoutSummary";
import { createShopOrder } from "@/lib/shop/api";
import {
  clearCartItems,
  readCartItems,
  removeCartItem,
  subscribeCart,
  updateCartItemQuantity,
} from "@/lib/shop/cartStore";
import type { CartItem, CheckoutCustomer } from "@/lib/shop/types";

export default function Checkout() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<CartItem[]>(() => readCartItems());
  const [customer, setCustomer] = useState<CheckoutCustomer>({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => subscribeCart(() => setItems(readCartItems())), []);

  const updateCustomer = (key: keyof CheckoutCustomer, value: string) => {
    setCustomer((current) => ({ ...current, [key]: value }));
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (items.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const order = await createShopOrder({
        customer,
        note,
        items: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
      });
      clearCartItems();
      setLocation(`/order-complete/${encodeURIComponent(order.order_number)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "訂單建立失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <Link
            href="/cart"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#eadfce] bg-[#fffdf8] px-4 text-sm font-medium text-[#8b6f5b] shadow-sm shadow-stone-200/50 transition hover:bg-[#f3eadf]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回購物車
          </Link>
          <p className="mt-6 text-sm uppercase tracking-[0.2em] text-[#9f7868]">
            Checkout
          </p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
            結帳
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            填寫收件資料後送出訂單，管家會再確認付款與出貨。
          </p>
        </div>

        {items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-[#fffdf8] px-6 py-14 text-center">
            <h2 className="font-serif text-2xl text-stone-900">購物車目前沒有商品</h2>
            <Button asChild className="mt-6 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              <Link href="/shop">返回宇宙碎品商店</Link>
            </Button>
          </section>
        ) : (
          <form onSubmit={submitOrder} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="space-y-6">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">基本資料</h2>
                    <p className="mt-1 text-xs text-stone-500">姓名與電話為必填，方便管家確認訂單。</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">收件人姓名</span>
                    <Input
                      value={customer.name}
                      onChange={(event) => updateCustomer("name", event.target.value)}
                      required
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">聯絡電話</span>
                    <Input
                      value={customer.phone}
                      onChange={(event) => updateCustomer("phone", event.target.value)}
                      required
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-2">
                    <span className="font-medium text-stone-900">Email</span>
                    <Input
                      type="email"
                      value={customer.email}
                      onChange={(event) => updateCustomer("email", event.target.value)}
                      className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">收件地址</h2>
                    <p className="mt-1 text-xs text-stone-500">請填寫可收件的完整地址。</p>
                  </div>
                </div>
                <label className="mt-5 block space-y-2 text-sm text-stone-600">
                  <span className="font-medium text-stone-900">地址</span>
                  <Input
                    value={customer.address}
                    onChange={(event) => updateCustomer("address", event.target.value)}
                    required
                    className="h-11 rounded-[8px] border-[#eadfce] bg-white"
                  />
                </label>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">備註</h2>
                    <p className="mt-1 text-xs text-stone-500">有指定時間或包裝需求，可寫在這裡。</p>
                  </div>
                </div>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-5 min-h-24 rounded-[8px] border-[#eadfce] bg-white"
                />
              </div>

              <div className="space-y-3">
                <h2 className="font-serif text-2xl text-stone-900">商品明細</h2>
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
              </div>
            </section>

            <div className="space-y-4">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 text-sm leading-7 text-stone-600 shadow-sm shadow-stone-200/60">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#f3eadf] text-[#9f7868]">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">付款方式</h2>
                    <p className="mt-2 font-semibold text-stone-800">人工確認付款</p>
                    <p className="mt-1">
                      送出訂單後，商品會先為你保留。管家會再確認付款方式、金額與出貨資訊。
                    </p>
                  </div>
                </div>
              </div>
              {error && (
                <div className="flex gap-3 rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{error}</span>
                </div>
              )}
              <CheckoutSummary
                items={items}
                actionLabel={isSubmitting ? "建立訂單中..." : "送出訂單"}
                disabled={isSubmitting}
                onAction={() => {
                  const submitButton = document.getElementById("checkout-submit");
                  submitButton?.click();
                }}
              />
              <button id="checkout-submit" type="submit" className="hidden" />
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
