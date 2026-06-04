import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Boxes,
  Copy,
  ImageOff,
  LogOut,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminShopNav from "@/components/shop/AdminShopNav";
import VariantQrCode from "@/components/shop/VariantQrCode";
import {
  type AdminProductStatus,
  type AdminShopImage,
  type AdminShopProductDetail,
  type AdminShopProductSummary,
  type AdminShopVariant,
  type AdminVariantStatus,
  createAdminShopProduct,
  fetchAdminShopProduct,
  fetchAdminShopProducts,
  updateAdminShopProduct,
} from "@/lib/shop/adminProductsApi";
import { formatPrice } from "@/lib/shop/format";
import { cn } from "@/lib/utils";

const adminProductTokenKey = "mumbao-admin-shop-order-token";
const productListLimit = 30;

const productStatusLabels: Record<AdminProductStatus, string> = {
  draft: "草稿",
  published: "上架",
  archived: "封存",
};

const variantStatusLabels: Record<AdminVariantStatus, string> = {
  active: "販售中",
  inactive: "暫停販售",
};

const productStatusOptions: Array<{ value: "" | AdminProductStatus; label: string }> = [
  { value: "", label: "全部上架狀態" },
  { value: "published", label: "上架" },
  { value: "draft", label: "草稿" },
  { value: "archived", label: "封存" },
];

const editableProductStatuses: AdminProductStatus[] = ["draft", "published", "archived"];
const editableVariantStatuses: AdminVariantStatus[] = ["active", "inactive"];

function getStoredAdminToken() {
  try {
    return sessionStorage.getItem(adminProductTokenKey) || "";
  } catch {
    return "";
  }
}

function saveAdminToken(token: string) {
  sessionStorage.setItem(adminProductTokenKey, token);
}

function clearAdminToken() {
  sessionStorage.removeItem(adminProductTokenKey);
}

function formatDateTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "-";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function numberValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatusPill({
  children,
  tone = "stone",
}: {
  children: ReactNode;
  tone?: "stone" | "green" | "pink" | "red";
}) {
  const toneClass = {
    stone: "border-stone-200 bg-stone-50 text-stone-600",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    pink: "border-pink-100 bg-pink-50 text-pink-700",
    red: "border-red-100 bg-red-50 text-red-600",
  }[tone];

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", toneClass)}>
      {children}
    </span>
  );
}

function getProductTone(status: AdminProductStatus) {
  if (status === "published") return "green";
  if (status === "archived") return "red";
  return "stone";
}

function getVariantTone(status: AdminVariantStatus) {
  return status === "active" ? "green" : "stone";
}

function createEmptyProduct(): AdminShopProductDetail {
  return {
    id: "__new_product__",
    slug: "",
    name: "",
    subtitle: "",
    description: "",
    category: "",
    status: "draft",
    featured: false,
    sort_order: 0,
    cover_image_url: "",
    min_price: 0,
    total_inventory: 0,
    variant_count: 1,
    image_count: 1,
    created_at: "",
    updated_at: "",
    variants: [
      {
        id: "__new_variant_1__",
        product_id: "",
        sku: "",
        variant_name: "",
        variant_option: "",
        price: 0,
        compare_at_price: null,
        inventory: 0,
        status: "active",
        sort_order: 0,
      },
    ],
    images: [
      {
        id: "__new_image_1__",
        product_id: "",
        image_url: "",
        alt: "",
        sort_order: 0,
      },
    ],
  };
}

export default function AdminShopProducts() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [products, setProducts] = useState<AdminShopProductSummary[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<AdminShopProductDetail | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | AdminProductStatus>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [failedCoverImageUrl, setFailedCoverImageUrl] = useState("");
  const [copiedSkuId, setCopiedSkuId] = useState("");

  const selectedSummary = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId]
  );
  const coverImageUrl = selectedProduct?.cover_image_url?.trim() || "";
  const isCoverImageFailed = Boolean(
    coverImageUrl && failedCoverImageUrl === coverImageUrl
  );

  const loadProducts = useCallback(
    async ({ nextPage = 0, append = false }: { nextPage?: number; append?: boolean } = {}) => {
      if (!token) return;

      setIsLoading(true);
      try {
        const data = await fetchAdminShopProducts({
          token,
          q: query,
          status,
          page: nextPage,
          limit: productListLimit,
        });
        const nextProducts = data.products || [];

        setProducts((current) => (append ? [...current, ...nextProducts] : nextProducts));
        setPage(typeof data.nextPage === "number" ? data.nextPage : nextPage + 1);
        setHasMore(Boolean(data.hasMore));
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "商品列表載入失敗");
      } finally {
        setIsLoading(false);
      }
    },
    [query, status, token]
  );

  const loadProductDetail = useCallback(
    async (productId: string) => {
      if (!token || !productId) return;

      setSelectedProductId(productId);
      setIsCreating(false);
      setIsAdvancedOpen(false);
      setFailedCoverImageUrl("");
      setCopiedSkuId("");
      setIsDetailLoading(true);
      setSuccess("");
      try {
        const detail = await fetchAdminShopProduct(token, productId);
        setSelectedProduct(detail);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "商品明細載入失敗");
      } finally {
        setIsDetailLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    loadProducts({ nextPage: 0 });
  }, [loadProducts, token]);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    const nextToken = password.trim();

    if (!nextToken) {
      setLoginError("請輸入 ADMIN_PASSWORD");
      return;
    }

    saveAdminToken(nextToken);
    setToken(nextToken);
    setLoginError("");
  };

  const logout = () => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setProducts([]);
    setSelectedProductId("");
    setSelectedProduct(null);
    setIsCreating(false);
    setIsAdvancedOpen(false);
    setFailedCoverImageUrl("");
    setCopiedSkuId("");
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(searchInput.trim());
    setSelectedProductId("");
    setSelectedProduct(null);
    setIsCreating(false);
    setIsAdvancedOpen(false);
    setFailedCoverImageUrl("");
    setCopiedSkuId("");
  };

  const startCreateProduct = () => {
    setSelectedProduct(createEmptyProduct());
    setSelectedProductId("__new_product__");
    setIsCreating(true);
    setIsAdvancedOpen(false);
    setFailedCoverImageUrl("");
    setCopiedSkuId("");
    setError("");
    setSuccess("");
  };

  const copySku = async (variant: AdminShopVariant) => {
    const sku = variant.sku?.trim();
    if (!sku) return;

    try {
      await navigator.clipboard.writeText(sku);
      setCopiedSkuId(variant.id);
      window.setTimeout(() => {
        setCopiedSkuId((current) => (current === variant.id ? "" : current));
      }, 1600);
    } catch {
      setError("商品編號複製失敗，請手動選取複製");
    }
  };

  const cancelEdit = () => {
    if (isCreating) {
      setSelectedProduct(null);
      setSelectedProductId("");
      setIsCreating(false);
      setIsAdvancedOpen(false);
      setFailedCoverImageUrl("");
      setError("");
      setSuccess("");
      return;
    }

    if (selectedProductId) {
      loadProductDetail(selectedProductId);
    }
  };

  const updateProductField = <K extends keyof AdminShopProductDetail>(
    field: K,
    value: AdminShopProductDetail[K]
  ) => {
    setSelectedProduct((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateVariantField = <K extends keyof AdminShopVariant>(
    variantId: string,
    field: K,
    value: AdminShopVariant[K]
  ) => {
    setSelectedProduct((current) =>
      current
        ? {
            ...current,
            variants: current.variants.map((variant) =>
              variant.id === variantId ? { ...variant, [field]: value } : variant
            ),
          }
        : current
    );
  };

  const updateImageField = <K extends keyof AdminShopImage>(
    imageId: string,
    field: K,
    value: AdminShopImage[K]
  ) => {
    setSelectedProduct((current) =>
      current
        ? {
            ...current,
            images: current.images.map((image) =>
              image.id === imageId ? { ...image, [field]: value } : image
            ),
          }
        : current
    );
  };

  const saveProduct = async () => {
    if (!token || !selectedProduct) return;

    setIsSaving(true);
    setSuccess("");
    try {
      const productPayload = {
        ...(isCreating ? {} : { id: selectedProduct.id }),
        name: selectedProduct.name,
        slug: selectedProduct.slug,
        subtitle: selectedProduct.subtitle || "",
        description: selectedProduct.description || "",
        category: selectedProduct.category,
        status: selectedProduct.status,
        featured: selectedProduct.featured,
        sort_order: selectedProduct.sort_order,
        cover_image_url: selectedProduct.cover_image_url || "",
      };
      const saved = isCreating
        ? await createAdminShopProduct({
            token,
            product: productPayload,
            variants: selectedProduct.variants,
            images: selectedProduct.images,
          })
        : await updateAdminShopProduct({
            token,
            product: productPayload,
            variants: selectedProduct.variants,
            images: selectedProduct.images,
          });

      setSelectedProduct(saved);
      setSelectedProductId(saved.id);
      setIsCreating(false);
      setFailedCoverImageUrl("");
      setProducts((current) =>
        isCreating
          ? [saved, ...current.filter((product) => product.id !== saved.id)]
          : current.map((product) => (product.id === saved.id ? saved : product))
      );
      setError("");
      setSuccess(isCreating ? "商品已新增" : "商品已更新");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "商品更新失敗");
    } finally {
      setIsSaving(false);
    }
  };

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="text-2xl font-semibold">商品管理登入</h1>
            </div>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="請輸入 ADMIN_PASSWORD"
            className="h-11 rounded-[8px]"
          />
          {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
          >
            進入商品管理
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] max-w-full overflow-x-hidden bg-[#f7f2ea] pb-[calc(140px+env(safe-area-inset-bottom))] text-stone-900 md:pb-0">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              商品管理
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/shop/orders"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              訂單管理
            </a>
            <Button
              type="button"
              className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              onClick={startCreateProduct}
            >
              <Plus className="h-4 w-4" />
              新增商品
            </Button>
            <Button
              variant="outline"
              className="rounded-full bg-white"
              onClick={() => loadProducts({ nextPage: 0 })}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              重新整理
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="products" />

      <div className="mx-auto grid w-full max-w-7xl gap-6 overflow-x-hidden px-4 py-6 xl:grid-cols-[minmax(0,1fr)_520px] md:px-8 md:py-8">
        <section className="min-w-0 max-w-full space-y-4 overflow-hidden">
          <form
            onSubmit={submitSearch}
            className="rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-center">
              <label className="flex h-11 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="搜尋商品名稱、商品網址代碼、商品分類"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as "" | AdminProductStatus);
                  setSelectedProductId("");
                  setSelectedProduct(null);
                }}
                className="h-11 rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
              >
                {productStatusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              >
                搜尋
              </Button>
            </div>
          </form>

          {error && (
            <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="grid gap-3 md:hidden">
            {products.length === 0 ? (
              <div className="rounded-[8px] border border-stone-200 bg-white px-5 py-14 text-center text-stone-400">
                <PackageSearch className="mx-auto mb-3 h-9 w-9" />
                <p>{isLoading ? "商品載入中..." : "目前沒有符合條件的商品"}</p>
              </div>
            ) : (
              products.map((product) => {
                const isSelected = selectedProductId === product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => loadProductDetail(product.id)}
                    className={cn(
                      "grid w-full max-w-full grid-cols-[76px_1fr] gap-3 rounded-[8px] border p-3 text-left shadow-sm transition",
                      isSelected
                        ? "border-[#b99aa2] bg-[#f4ece2]"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    )}
                  >
                    {product.cover_image_url ? (
                      <img
                        src={product.cover_image_url}
                        alt={product.name}
                        className="size-[76px] rounded-[6px] bg-[#f6f1ea] object-cover"
                      />
                    ) : (
                      <span className="flex size-[76px] items-center justify-center rounded-[6px] bg-[#f6f1ea] text-stone-300">
                        <ImageOff className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 space-y-2">
                      <span className="block truncate font-semibold text-stone-900">
                        {product.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span>{product.category || "未分類"}</span>
                        <StatusPill tone={getProductTone(product.status)}>
                          {productStatusLabels[product.status]}
                        </StatusPill>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-stone-900">
                          {formatPrice(product.min_price)}
                        </span>
                        <span className="text-stone-500">庫存 {product.total_inventory}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-[8px] border border-stone-200 bg-white shadow-sm md:block">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[76px_1.4fr_0.9fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_0.9fr] gap-3 border-b border-stone-100 bg-[#fbf7f1] px-4 py-3 text-xs font-medium text-stone-500">
                <span>主圖</span>
                <span>商品</span>
                <span>分類</span>
                <span>上架狀態</span>
                <span>精選商品</span>
                <span>最低價</span>
                <span>庫存</span>
                <span>規格/圖</span>
                <span>更新時間</span>
              </div>

              {products.length === 0 ? (
                <div className="px-5 py-14 text-center text-stone-400">
                  <PackageSearch className="mx-auto mb-3 h-9 w-9" />
                  <p>{isLoading ? "商品載入中..." : "目前沒有符合條件的商品"}</p>
                </div>
              ) : (
                products.map((product) => {
                  const isSelected = selectedProductId === product.id;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => loadProductDetail(product.id)}
                      className={cn(
                        "grid w-full grid-cols-[76px_1.4fr_0.9fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_0.9fr] gap-3 border-b border-stone-100 px-4 py-3 text-left text-sm transition last:border-b-0",
                        isSelected ? "bg-[#f4ece2]" : "bg-white hover:bg-stone-50"
                      )}
                    >
                      <span className="block">
                        {product.cover_image_url ? (
                          <img
                            src={product.cover_image_url}
                            alt={product.name}
                            className="size-14 rounded-[6px] bg-[#f6f1ea] object-cover"
                          />
                        ) : (
                          <span className="flex size-14 items-center justify-center rounded-[6px] bg-[#f6f1ea] text-stone-300">
                            <ImageOff className="h-5 w-5" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-stone-900">
                          {product.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-stone-400">
                          {product.subtitle || "點擊編輯商品"}
                        </span>
                      </span>
                      <span className="truncate text-stone-700">{product.category}</span>
                      <StatusPill tone={getProductTone(product.status)}>
                        {productStatusLabels[product.status]}
                      </StatusPill>
                      <span className="text-stone-600">
                        {product.featured ? "是" : "否"}
                      </span>
                      <span className="font-medium text-stone-800">
                        {formatPrice(product.min_price)}
                      </span>
                      <span className="text-stone-700">{product.total_inventory}</span>
                      <span className="text-stone-600">
                        {product.variant_count} / {product.image_count}
                      </span>
                      <span className="text-xs text-stone-500">
                        {formatDateTime(product.updated_at)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {hasMore && (
            <Button
              variant="outline"
              className="w-full rounded-full bg-white"
              disabled={isLoading}
              onClick={() => loadProducts({ nextPage: page, append: true })}
            >
              載入更多商品
            </Button>
          )}
        </section>

        <aside className="h-fit min-w-0 max-w-full overflow-hidden rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm md:p-5">
          {isDetailLoading ? (
            <div className="py-12 text-center text-sm text-stone-400">商品明細載入中...</div>
          ) : selectedProduct ? (
            <div className="max-w-full space-y-6 overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    商品詳情
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold">
                    {isCreating ? "新增商品" : selectedProduct.name}
                  </h2>
                  <p className="mt-1 text-xs text-stone-400">
                    目前編輯商品：{selectedProduct.name || "尚未命名"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveProduct}
                    disabled={isSaving}
                    className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  >
                    <Save className="h-4 w-4" />
                    儲存
                  </Button>
                  <Boxes className="hidden h-6 w-6 text-[#b99aa2] sm:block" />
                </div>
              </div>

              <section className="max-w-full space-y-4 overflow-hidden rounded-[8px] border border-stone-100 bg-white p-4">
                <div>
                  <h3 className="text-base font-semibold text-stone-900">商品基本資料</h3>
                  <p className="mt-1 text-xs text-stone-400">
                    先填管家最常會確認的商品資訊。
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-stone-900">商品名稱</span>
                    <Input
                      value={selectedProduct.name}
                      onChange={(event) => updateProductField("name", event.target.value)}
                      className="rounded-[8px]"
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-stone-900">商品分類</span>
                    <Input
                      value={selectedProduct.category}
                      onChange={(event) => updateProductField("category", event.target.value)}
                      className="rounded-[8px]"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-stone-900">上架狀態</span>
                    <select
                      value={selectedProduct.status}
                      onChange={(event) =>
                        updateProductField("status", event.target.value as AdminProductStatus)
                      }
                      className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3"
                    >
                      {editableProductStatuses.map((option) => (
                        <option key={option} value={option}>
                          {productStatusLabels[option]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-stone-900">精選商品</span>
                    <select
                      value={selectedProduct.featured ? "true" : "false"}
                      onChange={(event) =>
                        updateProductField("featured", event.target.value === "true")
                      }
                      className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3"
                    >
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  </label>
                </div>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">副標題</span>
                  <Input
                    value={selectedProduct.subtitle || ""}
                    onChange={(event) => updateProductField("subtitle", event.target.value)}
                    className="rounded-[8px]"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">商品描述</span>
                  <Textarea
                    value={selectedProduct.description || ""}
                    onChange={(event) => updateProductField("description", event.target.value)}
                    className="min-h-28 rounded-[8px]"
                  />
                </label>
              </section>

              <section className="max-w-full space-y-4 overflow-hidden rounded-[8px] border border-stone-100 bg-white p-4">
                <div>
                  <h3 className="text-base font-semibold text-stone-900">商品圖片</h3>
                  <p className="mt-1 text-xs text-stone-400">
                    前台商品列表會顯示這張圖。
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">商品主圖</span>
                  {coverImageUrl && !isCoverImageFailed ? (
                    <img
                      src={coverImageUrl}
                      alt={selectedProduct.name || "商品主圖"}
                      onError={() => setFailedCoverImageUrl(coverImageUrl)}
                      onLoad={() => {
                        if (failedCoverImageUrl === coverImageUrl) {
                          setFailedCoverImageUrl("");
                        }
                      }}
                      className="h-[280px] max-h-[320px] w-full rounded-[8px] border border-stone-100 bg-[#f6f1ea] object-contain md:h-[320px] md:max-h-[360px]"
                    />
                  ) : (
                    <div className="flex h-[280px] max-h-[320px] w-full items-center justify-center rounded-[8px] border border-dashed border-stone-200 bg-[#f6f1ea] text-sm text-stone-400 md:h-[320px] md:max-h-[360px]">
                      {coverImageUrl ? "圖片無法顯示" : "尚未設定商品主圖"}
                    </div>
                  )}
                </div>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">主圖圖片位置</span>
                  <p className="text-xs text-stone-400">
                    目前先貼圖片位置，之後可再改成上傳圖片
                  </p>
                  <Input
                    value={selectedProduct.cover_image_url || ""}
                    onChange={(event) => {
                      setFailedCoverImageUrl("");
                      updateProductField("cover_image_url", event.target.value);
                    }}
                    placeholder="/shop-products/01.png"
                    className="rounded-[8px]"
                  />
                </label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-stone-900">其他圖片</h4>
                    <span className="text-xs text-stone-400">
                      {isCreating ? "新增商品至少需要 1 張圖片路徑" : "可編輯既有圖片路徑"}
                    </span>
                  </div>
                  {selectedProduct.images.length === 0 ? (
                    <p className="rounded-[8px] bg-stone-50 p-4 text-sm text-stone-400">
                      目前沒有其他圖片
                    </p>
                  ) : (
                    selectedProduct.images.map((image) => (
                      <div
                        key={image.id}
                        className="grid max-w-full gap-3 overflow-hidden rounded-[8px] border border-stone-100 p-3 sm:grid-cols-[72px_1fr]"
                      >
                        {image.image_url ? (
                          <img
                            src={image.image_url}
                            alt={image.alt || selectedProduct.name}
                            className="size-16 rounded-[6px] bg-[#f6f1ea] object-cover"
                          />
                        ) : (
                          <span className="flex size-16 items-center justify-center rounded-[6px] bg-[#f6f1ea] text-stone-300">
                            <ImageOff className="h-5 w-5" />
                          </span>
                        )}
                        <label className="min-w-0 space-y-1 text-xs text-stone-500">
                          <span>圖片路徑</span>
                          <Input
                            value={image.image_url}
                            onChange={(event) =>
                              updateImageField(image.id, "image_url", event.target.value)
                            }
                            placeholder="/shop-products/01.png"
                            className="h-9 max-w-full rounded-[8px]"
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="max-w-full space-y-3 overflow-hidden rounded-[8px] border border-stone-100 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">
                      價格與庫存 / 販售規格
                    </h3>
                    <p className="mt-1 text-xs text-stone-400">
                      每個尺寸、款式、組合都可以有自己的價格與庫存。
                    </p>
                  </div>
                  <span className="text-xs text-stone-400">
                    {isCreating ? "新增商品至少需要 1 個規格" : "只編輯既有規格，不新增不刪除"}
                  </span>
                </div>
                {selectedProduct.variants.length === 0 ? (
                  <p className="rounded-[8px] bg-stone-50 p-4 text-sm text-stone-400">
                    目前沒有規格
                  </p>
                ) : (
                  selectedProduct.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="max-w-full space-y-3 overflow-hidden rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-stone-900">
                          {variant.variant_name || "未命名規格"}
                        </p>
                        <StatusPill tone={getVariantTone(variant.status)}>
                          {variantStatusLabels[variant.status]}
                        </StatusPill>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>規格名稱</span>
                          <Input
                            value={variant.variant_name}
                            onChange={(event) =>
                              updateVariantField(variant.id, "variant_name", event.target.value)
                            }
                            className="h-9 rounded-[8px] bg-white"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>規格選項</span>
                          <Input
                            value={variant.variant_option || ""}
                            onChange={(event) =>
                              updateVariantField(variant.id, "variant_option", event.target.value)
                            }
                            className="h-9 rounded-[8px] bg-white"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-stone-500 sm:col-span-2">
                          <span>商品編號</span>
                          <p className="text-[11px] leading-4 text-stone-400">
                            掃 QR code、進貨入庫、現場銷售時會用到這個編號
                          </p>
                          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <Input
                              value={variant.sku || ""}
                              onChange={(event) =>
                                updateVariantField(variant.id, "sku", event.target.value)
                              }
                              className="h-10 min-w-0 max-w-full rounded-[8px] bg-white font-mono text-sm"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 w-full rounded-full bg-white sm:w-auto"
                              onClick={() => copySku(variant)}
                              disabled={!variant.sku?.trim()}
                            >
                              <Copy className="h-4 w-4" />
                              複製
                            </Button>
                          </div>
                          {copiedSkuId === variant.id && (
                            <p className="text-xs text-emerald-700">已複製商品編號</p>
                          )}
                        </label>
                        <div className="sm:col-span-2">
                          <VariantQrCode
                            sku={variant.sku}
                            title="商品 QR code"
                            subtitle="手機相機掃描會開啟掃描入庫頁"
                            compact
                          />
                        </div>
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>販售狀態</span>
                          <select
                            value={variant.status}
                            onChange={(event) =>
                              updateVariantField(
                                variant.id,
                                "status",
                                event.target.value as AdminVariantStatus
                              )
                            }
                            className="h-9 w-full rounded-[8px] border border-stone-200 bg-white px-3"
                          >
                            {editableVariantStatuses.map((option) => (
                              <option key={option} value={option}>
                                {variantStatusLabels[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>售價</span>
                          <Input
                            type="number"
                            value={variant.price}
                            onChange={(event) =>
                              updateVariantField(
                                variant.id,
                                "price",
                                numberValue(event.target.value)
                              )
                            }
                            className="h-9 rounded-[8px] bg-white"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>原價</span>
                          <Input
                            type="number"
                            value={variant.compare_at_price ?? ""}
                            onChange={(event) =>
                              updateVariantField(
                                variant.id,
                                "compare_at_price",
                                event.target.value === "" ? null : numberValue(event.target.value)
                              )
                            }
                            className="h-9 rounded-[8px] bg-white"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-stone-500">
                          <span>庫存</span>
                          <Input
                            type="number"
                            value={variant.inventory}
                            onChange={(event) =>
                              updateVariantField(
                                variant.id,
                                "inventory",
                                numberValue(event.target.value)
                              )
                            }
                            className="h-9 rounded-[8px] bg-white"
                          />
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </section>

              <section className="max-w-full overflow-hidden rounded-[8px] border border-stone-100 bg-stone-50/60 p-3">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen((current) => !current)}
                  className="flex w-full items-center justify-between text-left text-sm font-medium text-stone-800"
                >
                    <span className="min-w-0">
                    進階設定
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      一般情況不用修改
                    </span>
                  </span>
                  <span className="text-xs text-stone-400">
                    {isAdvancedOpen ? "收合" : "展開"}
                  </span>
                </button>
                {isAdvancedOpen && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-stone-900">商品網址代碼</span>
                        <p className="text-xs text-stone-400">
                          用於商品頁網址，一般不用修改
                        </p>
                        <Input
                          value={selectedProduct.slug}
                          onChange={(event) => updateProductField("slug", event.target.value)}
                          className="rounded-[8px] bg-white"
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="font-medium text-stone-900">顯示順序</span>
                        <p className="text-xs text-stone-400">數字越小越前面</p>
                        <Input
                          type="number"
                          value={selectedProduct.sort_order}
                          onChange={(event) =>
                            updateProductField("sort_order", numberValue(event.target.value))
                          }
                          className="rounded-[8px] bg-white"
                        />
                      </label>
                    </div>

                    {selectedProduct.variants.length > 0 && (
                      <div className="max-w-full space-y-2 overflow-hidden">
                        <p className="text-sm font-medium text-stone-900">規格顯示順序</p>
                        <p className="text-xs text-stone-400">數字越小越前面</p>
                        <div className="grid gap-2">
                          {selectedProduct.variants.map((variant) => (
                            <label
                              key={`advanced-variant-${variant.id}`}
                                className="grid min-w-0 gap-2 text-xs text-stone-500 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center"
                            >
                                <span className="min-w-0 truncate">{variant.variant_name || "未命名規格"}</span>
                              <Input
                                type="number"
                                value={variant.sort_order}
                                onChange={(event) =>
                                  updateVariantField(
                                    variant.id,
                                    "sort_order",
                                    numberValue(event.target.value)
                                  )
                                }
                                className="h-9 rounded-[8px] bg-white"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.images.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-stone-900">圖片進階設定</p>
                        <div className="grid max-w-full gap-3 overflow-hidden">
                          {selectedProduct.images.map((image, imageIndex) => (
                            <div
                              key={`advanced-image-${image.id}`}
                              className="grid max-w-full gap-2 overflow-hidden rounded-[8px] border border-stone-100 bg-white p-3"
                            >
                              <p className="text-xs font-medium text-stone-500">
                                圖片 {imageIndex + 1}
                              </p>
                              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                                <label className="space-y-1 text-xs text-stone-500">
                                  <span>圖片說明文字</span>
                                  <Input
                                    value={image.alt || ""}
                                    onChange={(event) =>
                                      updateImageField(image.id, "alt", event.target.value)
                                    }
                                    className="h-9 rounded-[8px]"
                                  />
                                </label>
                                <label className="space-y-1 text-xs text-stone-500">
                                  <span>圖片顯示順序</span>
                                  <Input
                                    type="number"
                                    value={image.sort_order}
                                    onChange={(event) =>
                                      updateImageField(
                                        image.id,
                                        "sort_order",
                                        numberValue(event.target.value)
                                      )
                                    }
                                    className="h-9 rounded-[8px]"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="sticky bottom-4 hidden rounded-[8px] border border-stone-200 bg-white/95 p-3 shadow-lg shadow-stone-200/70 backdrop-blur md:block">
                <Button
                  type="button"
                  onClick={saveProduct}
                  disabled={isSaving}
                  className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "儲存中..." : "儲存商品"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-stone-400">
              <PackageSearch className="mx-auto mb-3 h-9 w-9" />
              <p>{selectedSummary ? "商品明細準備中..." : "請選擇既有商品，或點新增商品建立一筆資料"}</p>
            </div>
          )}
        </aside>
      </div>
      {selectedProduct && (
        <div className="fixed inset-x-0 bottom-0 z-40 min-h-[calc(64px+env(safe-area-inset-bottom))] border-t border-stone-200 bg-white/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl shadow-stone-300/50 backdrop-blur md:hidden">
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full bg-white"
              onClick={cancelEdit}
              disabled={isSaving}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              onClick={saveProduct}
              disabled={isSaving}
            >
              {isSaving ? "儲存中..." : "儲存商品"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
