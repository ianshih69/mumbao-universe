import { Link } from "wouter";
import { Eye, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ShopProduct } from "@/lib/shop/types";
import { formatPrice } from "@/lib/shop/format";

function getProductTag(product: ShopProduct) {
  const text = `${product.category} ${product.name} ${product.subtitle || ""}`.toLowerCase();

  if (text.includes("房內") || text.includes("小物")) return "房內同款";
  if (text.includes("版畫") || text.includes("限量")) return "限量版";
  if (text.includes("慢寶") || text.includes("mumbao")) return "慢寶原創";
  return product.category || "文創選物";
}

export function ProductCard({ product }: { product: ShopProduct }) {
  const imageUrl = product.cover_image_url || "/images/logo.webp";
  const isSoldOut = product.total_inventory <= 0;
  const variantCount = product.variants.length;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[8px] border border-[#eadfce] bg-white shadow-sm shadow-stone-200/50 transition hover:-translate-y-0.5 hover:border-[#d7c6b5] hover:shadow-md">
      <Link href={`/shop/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[#f1ebe2]">
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <Badge className="absolute left-2 top-2 rounded-full bg-[#f7dfe5] px-2 py-1 text-[11px] font-medium text-[#8b5965] hover:bg-[#f7dfe5]">
            {getProductTag(product)}
          </Badge>
          {isSoldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-stone-900/70 py-1.5 text-center text-xs font-medium text-white">
              售完補貨中
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link href={`/shop/${product.slug}`} className="block">
          <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-stone-900 group-hover:text-[#8b6f5b]">
            {product.name}
          </h2>
        </Link>

        {product.subtitle && (
          <p className="mt-1 line-clamp-1 text-xs text-stone-500">
            {product.subtitle}
          </p>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="font-serif text-lg font-semibold text-[#9f7868]">
            {formatPrice(product.min_price)}
          </p>
          <span className="rounded-full bg-[#f8f3eb] px-2 py-1 text-[11px] text-stone-500">
            {variantCount > 1 ? `${variantCount} 種規格` : isSoldOut ? "暫無庫存" : `庫存 ${product.total_inventory}`}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0e5d7] pt-3">
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-stone-500">
            <PackageCheck className="h-3.5 w-3.5 flex-none text-[#b99aa2]" />
            {isSoldOut ? "等待補貨" : "人工確認付款"}
          </span>
          <Button
            asChild
            size="sm"
            className="h-8 flex-none rounded-full bg-[#8b6f5b] px-3 text-xs text-white hover:bg-[#765d4a]"
          >
            <Link href={`/shop/${product.slug}`}>
              <Eye className="h-3.5 w-3.5" />
              查看
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
