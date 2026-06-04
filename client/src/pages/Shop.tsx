import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, ShoppingBag, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { fetchShopProducts } from "@/lib/shop/api";
import type { ShopProduct } from "@/lib/shop/types";

const categoryTabs = ["全部", "明信片", "杯墊", "版畫", "房內小物", "慢寶周邊"];
const sortOptions = [
  { value: "recommended", label: "推薦" },
  { value: "latest", label: "最新" },
  { value: "price-asc", label: "價格由低到高" },
  { value: "price-desc", label: "價格由高到低" },
] as const;

type SortValue = (typeof sortOptions)[number]["value"];

function productMatchesCategory(product: ShopProduct, category: string) {
  if (category === "全部") return true;
  const text = `${product.category} ${product.name} ${product.subtitle || ""}`.toLowerCase();

  if (category === "慢寶周邊") {
    return text.includes("慢寶") || text.includes("mumbao") || text.includes("周邊");
  }

  return text.includes(category.toLowerCase());
}

function productMatchesSearch(product: ShopProduct, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const variantText = product.variants
    .map((variant) => `${variant.variant_name} ${variant.variant_option || ""}`)
    .join(" ");
  const searchableText = [
    product.name,
    product.subtitle,
    product.description,
    product.category,
    variantText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

function sortProducts(products: ShopProduct[], sort: SortValue) {
  const nextProducts = [...products];

  if (sort === "price-asc") {
    return nextProducts.sort((first, second) => first.min_price - second.min_price);
  }

  if (sort === "price-desc") {
    return nextProducts.sort((first, second) => second.min_price - first.min_price);
  }

  if (sort === "latest") {
    return nextProducts.reverse();
  }

  return nextProducts.sort((first, second) => {
    if (first.featured !== second.featured) {
      return first.featured ? -1 : 1;
    }

    return Number(first.sort_order || 0) - Number(second.sort_order || 0);
  });
}

export default function Shop() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("recommended");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetchShopProducts()
      .then((nextProducts) => {
        if (isMounted) {
          setProducts(nextProducts);
          setError("");
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "商品載入失敗");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const filteredProducts = products.filter(
      (product) =>
        productMatchesCategory(product, activeCategory) &&
        productMatchesSearch(product, search)
    );

    return sortProducts(filteredProducts, sort);
  }, [activeCategory, products, search, sort]);

  return (
    <div className="min-h-screen bg-[#f8f3eb] text-stone-900">
      <Header />
      <main className="mx-auto max-w-[1440px] px-3 pb-16 pt-28 sm:px-5 md:px-7 md:pt-32">
        <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-3 shadow-sm shadow-stone-200/60 md:p-4">
          <div className="grid gap-3 lg:grid-cols-[21rem_minmax(20rem,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3 rounded-[8px] bg-[#f3eadf] px-4 py-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-[#9f7868] shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-stone-900">
                  宇宙碎品商店
                </span>
                <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-[#9f7868]">
                  MUMBAO SHOP
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-stone-500 xl:text-xs">
                  把慢寶宇宙裡的小小陪伴，帶回你的日常。
                </span>
              </span>
            </div>

            <label className="flex h-11 items-center gap-3 rounded-full border border-[#eadfce] bg-white px-4 shadow-inner shadow-stone-100">
              <Search className="h-5 w-5 flex-none text-[#b99aa2]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜尋明信片、杯墊、版畫、慢寶周邊"
                className="min-w-0 flex-1 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              />
            </label>

            <Button
              asChild
              className="h-11 rounded-full bg-[#8b6f5b] px-5 text-white hover:bg-[#765d4a]"
            >
              <Link href="/cart">
                <ShoppingBag className="h-4 w-4" />
                購物車
              </Link>
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categoryTabs.map((category) => {
              const isActive = activeCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`h-10 flex-none rounded-full border px-4 text-sm font-medium transition ${
                    isActive
                      ? "border-[#8b6f5b] bg-[#8b6f5b] text-white shadow-sm"
                      : "border-[#eadfce] bg-white text-stone-600 hover:border-[#cdbca9]"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-3 shadow-sm shadow-stone-200/60 md:p-4">
          <div className="mb-4 flex flex-col gap-3 border-b border-[#f0e5d7] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">
                共 {visibleProducts.length} 件商品
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {activeCategory === "全部" ? "全部分類" : activeCategory}
                {search.trim() ? ` / 搜尋「${search.trim()}」` : ""}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-600">
              <span className="flex-none">排序</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortValue)}
                className="h-10 rounded-full border border-[#eadfce] bg-white px-4 text-sm text-stone-800 outline-none focus:border-[#8b6f5b]"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <div className="rounded-[8px] border border-red-100 bg-red-50 p-6 text-sm text-red-600">
              {error}
            </div>
          ) : (
            <>
              <ProductGrid products={visibleProducts} isLoading={isLoading} />
              <div className="mt-5 flex flex-col gap-3 rounded-[8px] border border-[#eadfce] bg-[#fbf7f1] px-4 py-3 text-sm leading-6 text-stone-600 sm:flex-row sm:items-center">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-[#b99aa2] shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </span>
                <p>
                  每一件宇宙碎品都由慢慢蒔光整理上架，付款採人工確認。若想確認現貨或大量訂購，可先聯繫我們。
                </p>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
