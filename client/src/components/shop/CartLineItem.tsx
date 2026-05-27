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
  return (
    <article className="grid grid-cols-[5rem_1fr] gap-4 rounded-[8px] border border-stone-200 bg-white p-3 shadow-sm md:grid-cols-[6rem_1fr_auto] md:items-center">
      <Link href={`/shop/${item.slug}`}>
        <img
          src={item.imageUrl || "/images/logo.webp"}
          alt={item.name}
          className="aspect-square w-full rounded-[6px] bg-[#f6f1ea] object-cover"
        />
      </Link>
      <div className="min-w-0 space-y-2">
        <Link href={`/shop/${item.slug}`}>
          <h2 className="line-clamp-2 text-base font-semibold text-stone-900">
            {item.name}
          </h2>
        </Link>
        <p className="text-sm text-stone-500">
          {getVariantLabel(item.variantName, item.variantOption)}
        </p>
        <p className="font-serif text-lg text-[#9f7868]">{formatPrice(item.price)}</p>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:flex-col md:items-end">
        <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-700">
            {formatPrice(item.price * item.quantity)}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 rounded-full p-0 text-stone-400 hover:text-red-500"
            onClick={onRemove}
            aria-label="移除商品"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}
