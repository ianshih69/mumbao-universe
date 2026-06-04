import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Check, ShoppingBag } from "lucide-react";
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
  const [selectedGalleryImageId, setSelectedGalleryImageId] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchShopProduct(slug)
      .then((nextProduct) => {
        if (!isMounted) return;
        const initialVariant = nextProduct?.variants.find(
          (variant) => variant.inventory > 0
        );
        setProduct(nextProduct);
        setSelectedVariantId(initialVariant?.id || "");
        setSelectedGalleryImageId(
          initialVariant?.image_url
            ? `variant-${initialVariant.id}`
            : nextProduct?.cover_image_url
              ? "cover"
              : nextProduct?.images?.[0]?.id || ""
        );
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
        ...product.variants
          .filter((variant) => Boolean(variant.image_url?.trim()))
          .map((variant) => ({
            id: `variant-${variant.id}`,
            image_url: variant.image_url || "",
            alt: getVariantLabel(variant.variant_name, variant.variant_option),
          })),
      ]
    : [];
  const selectedGalleryImage =
    gallery.find((image) => image.id === selectedGalleryImageId) || gallery[0];
  const mainImage = selectedGalleryImage?.image_url || "/images/logo.webp";

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
        <Link
          href="/shop"
          className="mb-6 inline-flex h-10 items-center gap-2 rounded-full border border-[#eadfce] bg-[#fffdf8] px-4 text-sm font-medium text-[#8b6f5b] shadow-sm shadow-stone-200/50 transition hover:border-[#d7c6b5] hover:bg-[#f3eadf] hover:text-[#765d4a]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回宇宙碎品商店
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_29rem]">
            <section className="space-y-4">
              <div className="overflow-hidden rounded-[8px] border border-[#eadfce] bg-[#fffdf8] shadow-sm shadow-stone-200/60">
                <img src={mainImage} alt={product.name} className="aspect-square w-full object-cover" />
              </div>
              {gallery.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {gallery.map((image) => {
                    const isSelected = image.id === selectedGalleryImage?.id;

                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setSelectedGalleryImageId(image.id)}
                        className={cn(
                          "overflow-hidden rounded-[6px] border bg-white transition",
                          isSelected
                            ? "border-[#8b6f5b] ring-2 ring-[#d7c6b5] ring-offset-2 ring-offset-[#fbf8f2]"
                            : "border-[#eadfce] hover:border-[#cdbca9]"
                        )}
                      >
                        <img
                          src={image.image_url}
                          alt={image.alt || product.name}
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="h-fit space-y-6 rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
              <div className="space-y-4">
                <Badge variant="outline" className="rounded-full bg-[#fbf7f1] text-stone-600">
                  {product.category}
                </Badge>
                <div className="space-y-3">
                  <h1 className="font-serif text-4xl font-light leading-tight text-stone-900">
                    {product.name}
                  </h1>
                  {product.subtitle && (
                    <p className="text-sm leading-7 text-stone-500">{product.subtitle}</p>
                  )}
                </div>
                <div className="rounded-[8px] border border-[#f0e5d7] bg-[#fbf7f1] px-4 py-3">
                  <p className="text-xs font-medium text-stone-500">售價</p>
                  <p className="mt-1 font-serif text-3xl text-[#9f7868]">
                    {formatPrice(selectedVariant?.price || product.min_price)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-[#f0e5d7] pt-5">
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
                          if (variant.image_url?.trim()) {
                            setSelectedGalleryImageId(`variant-${variant.id}`);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-[#8b6f5b] bg-[#f3eadf] shadow-sm"
                            : "border-[#eadfce] bg-white hover:border-[#cdbca9]",
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
                  className="h-11 flex-1 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
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
                className="h-11 w-full rounded-full border-[#eadfce] bg-white text-stone-700 hover:bg-[#f3eadf]"
                onClick={() => setLocation("/cart")}
              >
                查看購物車
              </Button>

              {product.description && (
                <div className="border-t border-[#f0e5d7] pt-6">
                  <h2 className="mb-3 text-sm font-semibold text-stone-700">商品說明</h2>
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
