import { Link } from "wouter";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import type { CartItem } from "@/lib/shop/types";
import { QuantityStepper } from "./QuantityStepper";

export function CartLineItem({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const lineTotal = item.price * item.quantity;

  return (
    <article className="flex gap-4 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-4 shadow-sm shadow-stone-200/50">
      {/* 商品圖片 */}
      <Link href={`/shop/${item.slug}`} className="block shrink-0">
        <img
          src={item.imageUrl || "/images/logo.webp"}
          alt={item.name}
          className="h-[110px] w-[110px] rounded-[6px] border border-[#f0e5d7] bg-[#f6f1ea] object-cover sm:h-[120px] sm:w-[120px]"
        />
      </Link>

      {/* 商品資訊區 */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* 商品名稱 + 規格 */}
        <div className="min-w-0">
          <Link href={`/shop/${item.slug}`}>
            <h2 className="break-words text-sm font-semibold leading-6 text-stone-900 hover:text-[#8b6f5b] sm:text-base">
              {item.name}
            </h2>
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400">已選規格</span>
            <span className="inline-flex rounded-full bg-[#f3eadf] px-2.5 py-0.5 text-xs text-[#7b6a58]">
              {getVariantLabel(item.variantName, item.variantOption)}
            </span>
          </div>
        </div>

        {/* 單價 / 數量 / 小計 */}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-stone-400">單價</span>
            <span className="font-serif text-base text-[#9f7868]">
              {formatPrice(item.price)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-stone-400">數量</span>
            <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-stone-400">小計</span>
            <span className="font-serif text-base font-semibold text-stone-900">
              {formatPrice(lineTotal)}
            </span>
          </div>
        </div>

        {/* 移除按鈕 */}
        <div className="mt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600"
            onClick={onRemove}
            aria-label="移除商品"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            移除
          </Button>
        </div>
      </div>
    </article>
  );
}
