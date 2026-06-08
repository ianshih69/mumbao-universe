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
    <article className="grid grid-cols-[5.5rem_1fr] gap-4 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-4 shadow-sm shadow-stone-200/50 md:grid-cols-[7.5rem_minmax(14rem,1fr)_6.5rem_8.5rem_6.8rem_5.5rem] md:items-center md:p-5">
      <Link href={`/shop/${item.slug}`}>
        <img
          src={item.imageUrl || "/images/logo.webp"}
          alt={item.name}
          className="aspect-square w-full rounded-[6px] border border-[#f0e5d7] bg-[#f6f1ea] object-cover md:w-[120px]"
        />
      </Link>
      <div className="min-w-0 space-y-2.5">
        <Link href={`/shop/${item.slug}`}>
          <h2 className="text-base font-semibold leading-6 text-stone-900 hover:text-[#8b6f5b] md:text-lg">
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
      <div className="hidden text-right text-sm md:block">
        <p className="text-xs text-stone-400">單價</p>
        <p className="mt-1 font-serif text-lg text-[#9f7868]">{formatPrice(item.price)}</p>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:flex md:justify-center">
        <span className="text-xs text-stone-400 md:hidden">數量</span>
        <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
      </div>
      <div className="col-span-2 flex items-center justify-between border-t border-[#f0e5d7] pt-3 md:col-span-1 md:block md:border-t-0 md:pt-0 md:text-right">
        <span className="text-xs text-stone-400 md:hidden">小計</span>
        <span className="font-serif text-lg font-semibold text-stone-900">
          {formatPrice(lineTotal)}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        className="col-span-2 h-10 rounded-full border-[#eadfce] bg-white text-stone-600 hover:bg-red-50 hover:text-red-600 md:col-span-1 md:w-full md:px-3"
        onClick={onRemove}
        aria-label="移除商品"
      >
        <Trash2 className="h-4 w-4" />
        移除
      </Button>
    </article>
  );
}
