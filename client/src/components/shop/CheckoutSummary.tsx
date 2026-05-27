import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/shop/format";
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
    <aside className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-2xl text-stone-900">訂單摘要</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 text-stone-600">
          <span>商品小計</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="flex justify-between gap-4 text-stone-600">
          <span>運費</span>
          <span>人工確認</span>
        </div>
        <div className="border-t border-stone-100 pt-3">
          <div className="flex justify-between gap-4 text-lg font-semibold text-stone-900">
            <span>合計</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          className="h-11 w-full rounded-full bg-[#527467] text-white hover:bg-[#456257]"
          disabled={disabled || items.length === 0}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
      {!actionLabel && (
        <Button
          asChild
          className="h-11 w-full rounded-full bg-[#527467] text-white hover:bg-[#456257]"
          disabled={items.length === 0}
        >
          <Link href="/checkout">前往結帳</Link>
        </Button>
      )}
      <p className="text-xs leading-5 text-stone-400">
        第一版採人工確認付款；送出訂單後，慢慢蒔光會再與你確認付款與出貨細節。
      </p>
    </aside>
  );
}
