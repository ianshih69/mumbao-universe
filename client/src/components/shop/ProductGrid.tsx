import { Link } from "wouter";
import { ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./ProductCard";
import type { ShopProduct } from "@/lib/shop/types";

function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#eadfce] bg-white">
      <div className="aspect-square animate-pulse bg-[#f1ebe2]" />
      <div className="space-y-3 p-3">
        <div className="h-4 w-11/12 animate-pulse rounded-full bg-stone-100" />
        <div className="h-4 w-8/12 animate-pulse rounded-full bg-stone-100" />
        <div className="h-6 w-5/12 animate-pulse rounded-full bg-stone-100" />
        <div className="h-8 w-full animate-pulse rounded-full bg-stone-100" />
      </div>
    </div>
  );
}

function EmptyProducts() {
  return (
    <div className="rounded-[8px] border border-dashed border-[#d7c6b5] bg-[#fbf7f1] px-5 py-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#b99aa2] shadow-sm">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="font-serif text-2xl font-light text-stone-900">
        商品正在雲朵上整理中
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-stone-500">
        慢寶正在把明信片、杯墊、版畫與房內小物排好隊。你也可以先看看購物車，稍後再回來逛逛。
      </p>
      <Button
        asChild
        className="mt-6 rounded-full bg-[#8b6f5b] px-5 text-white hover:bg-[#765d4a]"
      >
        <Link href="/cart">
          <ShoppingBag className="h-4 w-4" />
          查看購物車
        </Link>
      </Button>
    </div>
  );
}

export function ProductGrid({
  products,
  isLoading,
}: {
  products: ShopProduct[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <ProductSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <EmptyProducts />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
