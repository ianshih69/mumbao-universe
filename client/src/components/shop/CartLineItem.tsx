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
    <article className="relative grid gap-4 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-3.5 shadow-sm shadow-stone-200/50 sm:grid-cols-[120px_minmax(0,1fr)] sm:p-4">
      <Link href={`/shop/${item.slug}`} className="block w-[116px] shrink-0 sm:w-[120px]">
        <img
          src={item.imageUrl || "/images/logo.webp"}
          alt={item.name}
          className="aspect-square w-full rounded-[6px] border border-[#f0e5d7] bg-[#f6f1ea] object-cover"
        />
      </Link>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute right-3 top-3 h-9 rounded-full border-[#eadfce] bg-white px-3 text-sm font-medium text-[#765d4a] shadow-sm hover:bg-red-50 hover:text-red-600"
        onClick={onRemove}
        aria-label="移除商品"
      >
        <Trash2 className="h-4 w-4" />
        移除
      </Button>

      <div className="min-w-0 pr-0 sm:pr-24">
        <div className="min-w-0 pr-24 sm:pr-0">
          <Link href={`/shop/${item.slug}`}>
            <h2 className="break-words text-lg font-semibold leading-7 text-stone-950 hover:text-[#8b6f5b]">
              {item.name}
            </h2>
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-500">已選規格</span>
            <span className="inline-flex rounded-full bg-[#f3eadf] px-3 py-1 text-sm leading-5 text-[#765d4a]">
              {getVariantLabel(item.variantName, item.variantOption)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(110px,1fr)_auto_minmax(120px,1fr)] md:items-center">
          <div className="rounded-[8px] border border-[#f0e5d7] bg-white/70 px-3 py-2">
            <p className="text-sm font-medium text-stone-600">單價</p>
            <p className="mt-1 font-serif text-lg text-[#9f7868]">
              {formatPrice(item.price)}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[#f0e5d7] bg-white/70 px-3 py-2 md:justify-center">
            <span className="text-sm font-medium text-stone-600 md:hidden">數量</span>
            <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
          </div>

          <div className="rounded-[8px] border border-[#eadfce] bg-[#f8f1e8] px-3 py-2 text-right">
            <p className="text-sm font-medium text-[#765d4a]">小計</p>
            <p className="mt-1 font-serif text-xl font-semibold text-stone-950">
              {formatPrice(lineTotal)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
