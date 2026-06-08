import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import type { CartItem } from "@/lib/shop/types";

export function CheckoutSummary({
  items,
  actionLabel,
  onAction,
  disabled,
}: {
  items: CartItem[];
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const shippingFee = 0;
  const total = subtotal + shippingFee;

  return (
    <aside className="space-y-5 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60 lg:sticky lg:top-28">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[#9f7868]">
          Order Summary
        </p>
        <h2 className="mt-1 font-serif text-2xl text-stone-900">訂單摘要</h2>
      </div>

      <div className="space-y-3 rounded-[8px] border border-[#f0e5d7] bg-white/70 p-3">
        {items.map((item) => (
          <div key={item.variantId} className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium text-stone-900">{item.name}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {getVariantLabel(item.variantName, item.variantOption)} / {item.quantity} 件
                </p>
              </div>
              <span className="flex-none font-medium text-stone-700">
                {formatPrice(item.price * item.quantity)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 text-stone-700">
          <span>商品小計</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between gap-4 text-stone-700">
          <span>運費</span>
          <span>人工確認</span>
        </div>
        <div className="rounded-[8px] border border-[#eadfce] bg-[#f8f1e8] px-4 py-3">
          <div className="flex items-end justify-between gap-4 text-lg font-semibold text-stone-900">
            <span>總金額</span>
            <span className="font-serif text-3xl text-[#9f7868]">{formatPrice(total)}</span>
          </div>
        </div>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          className="h-12 w-full rounded-full bg-[#8b6f5b] text-base text-white shadow-sm hover:bg-[#765d4a]"
          disabled={disabled || items.length === 0}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
      {!actionLabel && (
        <Button
          asChild
          className="h-12 w-full rounded-full bg-[#8b6f5b] text-base text-white shadow-sm hover:bg-[#765d4a]"
          disabled={items.length === 0}
        >
          <Link href="/checkout">前往結帳</Link>
        </Button>
      )}
      <div className="rounded-[8px] bg-[#f3eadf] px-4 py-3 text-sm leading-6 text-[#765d4a]">
        付款採人工確認。送出訂單後，管家會再與你確認付款、庫存與出貨細節。
      </div>
    </aside>
  );
}
