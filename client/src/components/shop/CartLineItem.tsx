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
    <article className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-4 shadow-sm shadow-stone-200/50 xl:grid xl:grid-cols-[140px_minmax(220px,1fr)_100px_160px_100px_90px] xl:items-center xl:gap-4 xl:p-5">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 xl:contents">
        <Link href={`/shop/${item.slug}`} className="block">
          <img
            src={item.imageUrl || "/images/logo.webp"}
            alt={item.name}
            className="aspect-square w-full rounded-[6px] border border-[#f0e5d7] bg-[#f6f1ea] object-cover xl:w-[120px]"
          />
        </Link>
        <div className="min-w-0 space-y-2.5">
          <Link href={`/shop/${item.slug}`}>
            <h2 className="break-words text-base font-semibold leading-6 text-stone-900 hover:text-[#8b6f5b] xl:text-lg">
              {item.name}
            </h2>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-400">已選規格</span>
            <p className="inline-flex max-w-full rounded-full bg-[#f3eadf] px-2.5 py-1 text-xs leading-5 text-[#7b6a58]">
              {getVariantLabel(item.variantName, item.variantOption)}
            </p>
          </div>
          <p className="font-serif text-lg text-[#9f7868] xl:hidden">
            {formatPrice(item.price)}
          </p>
        </div>
      </div>
      <div className="hidden text-right text-sm xl:block">
        <p className="text-xs text-stone-400">單價</p>
        <p className="mt-1 font-serif text-lg text-[#9f7868]">{formatPrice(item.price)}</p>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[#f0e5d7] pt-4 sm:flex-row sm:items-center sm:justify-between xl:contents xl:border-t-0 xl:pt-0">
        <div className="flex items-center justify-between gap-3 xl:flex xl:justify-center">
          <span className="text-xs text-stone-400 xl:hidden">數量</span>
          <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
        </div>
        <div className="flex items-center justify-between gap-3 xl:block xl:text-right">
          <span className="text-xs text-stone-400 xl:hidden">小計</span>
          <span className="font-serif text-lg font-semibold text-stone-900">
            {formatPrice(lineTotal)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 rounded-full border-[#eadfce] bg-white text-stone-600 hover:bg-red-50 hover:text-red-600 sm:w-auto sm:px-4 xl:w-full xl:px-3"
          onClick={onRemove}
          aria-label="移除商品"
        >
          <Trash2 className="h-4 w-4" />
          移除
        </Button>
      </div>
    </article>
  );
}
