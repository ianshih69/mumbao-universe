import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
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
          <Link href="/cart" className="text-sm text-stone-500 hover:text-stone-900">
            返回購物車
          </Link>
          <h1 className="mt-3 font-serif text-4xl font-light tracking-wide">
            結帳
          </h1>
        </div>

        {items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <h2 className="font-serif text-2xl text-stone-900">購物車目前沒有商品</h2>
            <Button asChild className="mt-6 rounded-full bg-[#527467] text-white hover:bg-[#456257]">
              <Link href="/shop">回到文創商品</Link>
            </Button>
          </section>
        ) : (
          <form onSubmit={submitOrder} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <section className="space-y-6">
              <div className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-2xl text-stone-900">收件資料</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">姓名</span>
                    <Input
                      value={customer.name}
                      onChange={(event) => updateCustomer("name", event.target.value)}
                      required
                      className="rounded-[8px]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600">
                    <span className="font-medium text-stone-900">電話</span>
                    <Input
                      value={customer.phone}
                      onChange={(event) => updateCustomer("phone", event.target.value)}
                      required
                      className="rounded-[8px]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-2">
                    <span className="font-medium text-stone-900">Email</span>
                    <Input
                      type="email"
                      value={customer.email}
                      onChange={(event) => updateCustomer("email", event.target.value)}
                      className="rounded-[8px]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-2">
                    <span className="font-medium text-stone-900">收件地址</span>
                    <Input
                      value={customer.address}
                      onChange={(event) => updateCustomer("address", event.target.value)}
                      required
                      className="rounded-[8px]"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-stone-600 md:col-span-2">
                    <span className="font-medium text-stone-900">備註</span>
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="min-h-24 rounded-[8px]"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
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
              <div className="rounded-[8px] border border-stone-200 bg-white p-5 text-sm leading-7 text-stone-600 shadow-sm">
                <h2 className="mb-2 font-serif text-2xl text-stone-900">付款方式</h2>
                <p className="font-medium text-stone-800">人工確認付款</p>
                <p>送出後會保留商品庫存，待慢慢蒔光確認付款與出貨資訊。</p>
              </div>
              {error && (
                <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">
                  {error}
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
