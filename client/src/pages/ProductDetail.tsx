import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Check, ShoppingBag } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/shop/QuantityStepper";
import { fetchShopProduct } from "@/lib/shop/api";
import { addCartItem } from "@/lib/shop/cartStore";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import type { ShopProduct, ShopVariant } from "@/lib/shop/types";
import { cn } from "@/lib/utils";

export default function ProductDetail() {
  const [, params] = useRoute("/shop/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug || "";
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchShopProduct(slug)
      .then((nextProduct) => {
        if (!isMounted) return;
        setProduct(nextProduct);
        setSelectedVariantId(nextProduct?.variants.find((variant) => variant.inventory > 0)?.id || "");
        setError(nextProduct ? "" : "找不到這項商品。");
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
  }, [slug]);

  const selectedVariant = useMemo<ShopVariant | undefined>(
    () => product?.variants.find((variant) => variant.id === selectedVariantId),
    [product, selectedVariantId]
  );
  const gallery = product
    ? [
        ...(product.cover_image_url
          ? [{ id: "cover", image_url: product.cover_image_url, alt: product.name }]
          : []),
        ...(product.images || []),
      ]
    : [];
  const mainImage = gallery[0]?.image_url || "/images/logo.webp";

  const addToCart = () => {
    if (!product || !selectedVariant) return;
    addCartItem(product, selectedVariant, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <Link href="/shop" className="mb-6 inline-flex text-sm text-stone-500 hover:text-stone-900">
          返回文創商品
        </Link>

        {isLoading ? (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="aspect-square animate-pulse rounded-[8px] bg-white" />
            <div className="h-96 animate-pulse rounded-[8px] bg-white" />
          </div>
        ) : error || !product ? (
          <div className="rounded-[8px] border border-red-100 bg-red-50 p-6 text-red-600">
            {error || "找不到這項商品。"}
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem]">
            <section className="space-y-4">
              <div className="overflow-hidden rounded-[8px] border border-stone-200 bg-white">
                <img src={mainImage} alt={product.name} className="aspect-square w-full object-cover" />
              </div>
              {gallery.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {gallery.slice(0, 4).map((image) => (
                    <img
                      key={image.id}
                      src={image.image_url}
                      alt={image.alt || product.name}
                      className="aspect-square rounded-[6px] border border-stone-200 bg-white object-cover"
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="h-fit space-y-6 rounded-[8px] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="space-y-3">
                <Badge variant="outline" className="rounded-full bg-[#fbf7f1] text-stone-600">
                  {product.category}
                </Badge>
                <h1 className="font-serif text-4xl font-light leading-tight">{product.name}</h1>
                {product.subtitle && <p className="text-stone-500">{product.subtitle}</p>}
                <p className="font-serif text-3xl text-[#9f7868]">
                  {formatPrice(selectedVariant?.price || product.min_price)}
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-stone-700">選擇規格</h2>
                <div className="grid gap-2">
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariantId === variant.id;
                    const isSoldOut = variant.inventory <= 0;

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => {
                          setSelectedVariantId(variant.id);
                          setQuantity(1);
                        }}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-[#527467] bg-[#eef6f2]"
                            : "border-stone-200 bg-white hover:border-stone-400",
                          isSoldOut && "cursor-not-allowed opacity-45"
                        )}
                      >
                        <span>
                          <span className="block text-sm font-medium">
                            {getVariantLabel(variant.variant_name, variant.variant_option)}
                          </span>
                          <span className="mt-1 block text-xs text-stone-500">
                            {isSoldOut ? "售完" : `庫存 ${variant.inventory}`}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-[#9f7868]">
                          {formatPrice(variant.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <QuantityStepper
                  value={quantity}
                  max={selectedVariant?.inventory}
                  onChange={setQuantity}
                />
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-full bg-[#527467] text-white hover:bg-[#456257]"
                  disabled={!selectedVariant || selectedVariant.inventory <= 0}
                  onClick={addToCart}
                >
                  {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                  {added ? "已加入購物車" : "加入購物車"}
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full bg-white"
                onClick={() => setLocation("/cart")}
              >
                查看購物車
              </Button>

              {product.description && (
                <div className="border-t border-stone-100 pt-5">
                  <h2 className="mb-2 text-sm font-semibold text-stone-700">商品說明</h2>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-stone-600">
                    {product.description}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
