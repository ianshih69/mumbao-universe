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
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-4 shadow-sm shadow-stone-200/50 min-[1120px]:grid-cols-[120px_minmax(180px,1fr)_90px_150px_90px_80px] min-[1120px]:items-center min-[1120px]:p-5">
      <Link href={`/shop/${item.slug}`}>
        <img
          src={item.imageUrl || "/images/logo.webp"}
          alt={item.name}
          className="aspect-square w-full rounded-[6px] border border-[#f0e5d7] bg-[#f6f1ea] object-cover min-[1120px]:w-[120px]"
        />
      </Link>
      <div className="min-w-0 space-y-2.5">
        <Link href={`/shop/${item.slug}`}>
          <h2 className="break-words text-base font-semibold leading-6 text-stone-900 hover:text-[#8b6f5b] min-[1120px]:text-lg">
            {item.name}
          </h2>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-400">已選規格</span>
          <p className="inline-flex max-w-full rounded-full bg-[#f3eadf] px-2.5 py-1 text-xs leading-5 text-[#7b6a58]">
            {getVariantLabel(item.variantName, item.variantOption)}
          </p>
        </div>
      </div>
      <div className="hidden text-right text-sm min-[1120px]:block">
        <p className="text-xs text-stone-400">單價</p>
        <p className="mt-1 font-serif text-lg text-[#9f7868]">{formatPrice(item.price)}</p>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 min-[1120px]:col-span-1 min-[1120px]:flex min-[1120px]:justify-center">
        <span className="text-xs text-stone-400 min-[1120px]:hidden">數量</span>
        <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
      </div>
      <div className="col-span-2 flex items-center justify-between border-t border-[#f0e5d7] pt-3 min-[1120px]:col-span-1 min-[1120px]:block min-[1120px]:border-t-0 min-[1120px]:pt-0 min-[1120px]:text-right">
        <span className="text-xs text-stone-400 min-[1120px]:hidden">小計</span>
        <span className="font-serif text-lg font-semibold text-stone-900">
          {formatPrice(lineTotal)}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        className="col-span-2 h-10 rounded-full border-[#eadfce] bg-white text-stone-600 hover:bg-red-50 hover:text-red-600 min-[1120px]:col-span-1 min-[1120px]:w-full min-[1120px]:px-3"
        onClick={onRemove}
        aria-label="移除商品"
      >
        <Trash2 className="h-4 w-4" />
        移除
      </Button>
    </article>
  );
}
