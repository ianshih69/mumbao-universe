import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  LogOut,
  PackageSearch,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminShopNav from "@/components/shop/AdminShopNav";
import VariantQrCode from "@/components/shop/VariantQrCode";
import {
  type AdminShopProductDetail,
  type AdminShopProductSummary,
  type AdminShopVariant,
  fetchAdminShopProduct,
  fetchAdminShopProducts,
} from "@/lib/shop/adminProductsApi";
import {
  type AdminInventoryMovement,
  type AdminInventoryMovementType,
  adjustAdminInventory,
  fetchAdminInventoryMovements,
} from "@/lib/shop/adminInventoryApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import { INVENTORY_MOVEMENT_LABELS } from "@/lib/shop/labels";
import {
  adminAuthExpiredMessage,
  clearAdminToken as clearStoredAdminToken,
  getAdminToken,
  isAdminAuthError,
  setAdminToken as setStoredAdminToken,
} from "@/lib/shop/adminAuth";
import { cn } from "@/lib/utils";

const productListLimit = 50;
const movementListLimit = 30;

const movementLabels: Record<AdminInventoryMovementType, string> =
  INVENTORY_MOVEMENT_LABELS;

const actionOptions: Array<{
  value: "stock_in" | "stock_out" | "adjustment";
  label: string;
  description: string;
}> = [
  { value: "stock_in", label: "入庫", description: "增加這個規格的庫存" },
  { value: "stock_out", label: "扣庫存", description: "手動扣除庫存，不可扣到小於 0" },
  { value: "adjustment", label: "盤點調整", description: "直接填入盤點後的實際庫存" },
];

function getStoredAdminToken() {
  return getAdminToken();
}

function saveAdminToken(token: string) {
  setStoredAdminToken(token);
}

function clearAdminToken() {
  clearStoredAdminToken();
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

function getDeltaText(delta: number) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function getMovementTone(type: AdminInventoryMovementType) {
  if (type === "stock_in" || type === "return_in") return "text-emerald-700 bg-emerald-50";
  if (type === "stock_out" || type === "manual_sale" || type === "online_order") {
    return "text-red-600 bg-red-50";
  }
  return "text-stone-700 bg-stone-100";
}

function variantLabel(variant?: AdminShopVariant | null) {
  if (!variant) return "請先選擇規格";
  return getVariantLabel(variant.variant_name, variant.variant_option);
}

export default function AdminShopInventory() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [products, setProducts] = useState<AdminShopProductSummary[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<AdminShopProductDetail | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [movementType, setMovementType] =
    useState<"stock_in" | "stock_out" | "adjustment">("stock_in");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [movements, setMovements] = useState<AdminInventoryMovement[]>([]);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);
  const [movementPage, setMovementPage] = useState(0);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isMovementsLoading, setIsMovementsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleAuthFailure = useCallback(() => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setLoginError(adminAuthExpiredMessage);
    setError("");
    setSuccess("");
  }, []);

  const selectedVariant = useMemo(
    () => selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) || null,
    [selectedProduct, selectedVariantId]
  );
  const selectedAction = actionOptions.find((option) => option.value === movementType);

  const loadProducts = useCallback(async () => {
    if (!token) return;

    setIsProductsLoading(true);
    try {
      const data = await fetchAdminShopProducts({
        token,
        page: 0,
        limit: productListLimit,
      });
      const nextProducts = data.products || [];

      setProducts(nextProducts);
      setError("");
    } catch (loadError) {
      if (isAdminAuthError(loadError)) {
        handleAuthFailure();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "商品讀取失敗");
    } finally {
      setIsProductsLoading(false);
    }
  }, [handleAuthFailure, token]);

  const loadProductDetail = useCallback(
    async (productId: string) => {
      if (!token || !productId) {
        setSelectedProduct(null);
        setSelectedVariantId("");
        return;
      }

      setIsProductLoading(true);
      try {
        const detail = await fetchAdminShopProduct(token, productId);
        const firstVariantId = detail.variants[0]?.id || "";

        setSelectedProduct(detail);
        setSelectedVariantId(firstVariantId);
        setError("");
      } catch (loadError) {
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "商品規格讀取失敗");
      } finally {
        setIsProductLoading(false);
      }
    },
    [handleAuthFailure, token]
  );

  const loadMovements = useCallback(
    async ({
      nextPage = 0,
      append = false,
      variantId = selectedVariantId,
    }: {
      nextPage?: number;
      append?: boolean;
      variantId?: string;
    } = {}) => {
      if (!token) return;

      setIsMovementsLoading(true);
      try {
        const data = await fetchAdminInventoryMovements({
          token,
          variantId,
          page: nextPage,
          limit: movementListLimit,
        });
        const nextMovements = data.movements || [];

        setMovements((current) => (append ? [...current, ...nextMovements] : nextMovements));
        setMovementPage(typeof data.nextPage === "number" ? data.nextPage : nextPage + 1);
        setHasMoreMovements(Boolean(data.hasMore));
        setError("");
      } catch (loadError) {
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "庫存流水讀取失敗");
      } finally {
        setIsMovementsLoading(false);
      }
    },
    [handleAuthFailure, selectedVariantId, token]
  );

  useEffect(() => {
    if (!token) return;
    loadProducts();
    loadMovements({ nextPage: 0, variantId: "" });
  }, [loadMovements, loadProducts, token]);

  useEffect(() => {
    if (!selectedProductId) return;
    loadProductDetail(selectedProductId);
  }, [loadProductDetail, selectedProductId]);

  useEffect(() => {
    if (!token) return;
    loadMovements({ nextPage: 0, variantId: selectedVariantId });
  }, [loadMovements, selectedVariantId, token]);

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
    setSelectedVariantId("");
    setMovements([]);
  };

  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();

    if (!token || !selectedVariant) return;

    const nextQuantity = numberValue(quantity);

    if (
      (movementType === "stock_in" || movementType === "stock_out") &&
      nextQuantity <= 0
    ) {
      setError("入庫或扣庫存的數量必須大於 0");
      return;
    }

    if (movementType === "adjustment" && nextQuantity < 0) {
      setError("盤點後庫存不能小於 0");
      return;
    }

    setIsSaving(true);
    setSuccess("");
    try {
      const result = await adjustAdminInventory({
        token,
        variantId: selectedVariant.id,
        movementType,
        quantity: nextQuantity,
        note,
      });
      const nextInventory = Number(result.inventory ?? selectedVariant.inventory);

      setSelectedProduct((current) =>
        current
          ? {
              ...current,
              variants: current.variants.map((variant) =>
                variant.id === selectedVariant.id
                  ? { ...variant, inventory: nextInventory }
                  : variant
              ),
            }
          : current
      );
      setProducts((current) =>
        current.map((product) =>
          product.id === selectedProduct?.id
            ? {
                ...product,
                total_inventory:
                  product.total_inventory + nextInventory - selectedVariant.inventory,
              }
            : product
        )
      );
      setNote("");
      setQuantity(movementType === "adjustment" ? String(nextInventory) : "1");
      setError("");
      setSuccess(`庫存已更新，目前庫存 ${nextInventory}`);
      await loadMovements({ nextPage: 0, variantId: selectedVariant.id });
    } catch (saveError) {
      if (isAdminAuthError(saveError)) {
        handleAuthFailure();
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "庫存調整失敗");
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
              <h1 className="text-2xl font-semibold">庫存管理登入</h1>
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
            登入庫存管理
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              庫存調整
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              手動入庫、扣庫存與盤點調整都會留下庫存流水。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/shop/pos"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              現場銷售
            </a>
            <a
              href="/admin/shop/scan"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              掃描入庫
            </a>
            <a
              href="/admin/shop/products"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              商品管理
            </a>
            <a
              href="/admin/shop/orders"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              訂單管理
            </a>
            <Button
              variant="outline"
              className="rounded-full bg-white"
              onClick={() => {
                loadProducts();
                loadMovements({ nextPage: 0 });
              }}
              disabled={isProductsLoading || isMovementsLoading}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (isProductsLoading || isMovementsLoading) && "animate-spin"
                )}
              />
              重新整理
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="inventory" />

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_430px] md:px-8 md:py-8">
        <section className="space-y-4">
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

          <form
            onSubmit={submitAdjustment}
            className="space-y-5 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">調整庫存</h2>
                <p className="text-sm text-stone-500">請先選商品，再選要調整的規格。</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">商品</span>
                <select
                  value={selectedProductId}
                  onChange={(event) => {
                    setSelectedProductId(event.target.value);
                    setSelectedProduct(null);
                    setSelectedVariantId("");
                    setSuccess("");
                  }}
                  className="h-11 w-full rounded-[8px] border border-stone-200 bg-white px-3 outline-none"
                >
                  <option value="">請選擇商品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}（{product.category || "未分類"}）
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">規格</span>
                <select
                  value={selectedVariantId}
                  onChange={(event) => {
                    setSelectedVariantId(event.target.value);
                    setSuccess("");
                  }}
                  disabled={!selectedProduct || isProductLoading}
                  className="h-11 w-full rounded-[8px] border border-stone-200 bg-white px-3 outline-none disabled:bg-stone-50"
                >
                  <option value="">
                    {isProductLoading ? "規格讀取中..." : "請選擇規格"}
                  </option>
                  {selectedProduct?.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variantLabel(variant)}
                      {variant.sku ? ` / ${variant.sku}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 rounded-[8px] bg-[#fbf7f1] p-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-stone-500">目前庫存</p>
                <p className="mt-1 text-3xl font-semibold text-stone-900">
                  {selectedVariant ? selectedVariant.inventory : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">目前規格</p>
                <p className="mt-1 text-sm font-medium text-stone-900">
                  {variantLabel(selectedVariant)}
                </p>
                {selectedVariant?.sku && (
                  <p className="mt-1 break-all text-xs text-stone-500">
                    商品編號：{selectedVariant.sku}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-stone-500">售價</p>
                <p className="mt-1 text-sm font-medium text-stone-900">
                  {selectedVariant ? formatPrice(selectedVariant.price) : "-"}
                </p>
              </div>
            </div>

            {selectedVariant && (
              <VariantQrCode
                sku={selectedVariant.sku}
                title="商品 QR code"
                subtitle="可下載後印成入庫貼紙"
              />
            )}

            <div className="grid gap-3 md:grid-cols-3">
              {actionOptions.map((option) => {
                const isActive = movementType === option.value;
                const Icon =
                  option.value === "stock_in"
                    ? ArrowUpCircle
                    : option.value === "stock_out"
                      ? ArrowDownCircle
                      : ClipboardList;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setMovementType(option.value);
                      setQuantity(option.value === "adjustment" && selectedVariant ? String(selectedVariant.inventory) : "1");
                      setSuccess("");
                    }}
                    className={cn(
                      "rounded-[8px] border p-4 text-left transition",
                      isActive
                        ? "border-[#8b6f5b] bg-[#f4ece2]"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    )}
                  >
                    <Icon className="mb-3 h-5 w-5 text-[#8b6f5b]" />
                    <p className="font-medium text-stone-900">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">
                  {movementType === "adjustment" ? "盤點後實際庫存" : "數量"}
                </span>
                <Input
                  type="number"
                  min={movementType === "adjustment" ? 0 : 1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-11 rounded-[8px]"
                />
                <p className="text-xs text-stone-400">
                  {selectedAction?.description}
                </p>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">備註</span>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="例如：補貨入庫、盤點修正、展場售出"
                  className="min-h-[96px] rounded-[8px]"
                />
              </label>
            </div>

            <Button
              type="submit"
              disabled={!selectedVariant || isSaving}
              className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a] md:w-auto md:px-8"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "更新中..." : "確認調整庫存"}
            </Button>
          </form>
        </section>

        <aside className="h-fit rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                最近庫存異動
              </p>
              <h2 className="mt-1 text-xl font-semibold">最近庫存流水</h2>
              <p className="mt-1 text-xs text-stone-500">
                {selectedVariant ? "目前顯示所選規格的紀錄" : "尚未選規格時顯示全部紀錄"}
              </p>
            </div>
            <PackageSearch className="h-6 w-6 text-[#b99aa2]" />
          </div>

          {movements.length === 0 ? (
            <div className="py-12 text-center text-sm text-stone-400">
              <ClipboardList className="mx-auto mb-3 h-9 w-9" />
              <p>{isMovementsLoading ? "庫存流水讀取中..." : "目前尚無庫存流水"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">
                        {movement.product_name || "商品"}
                      </p>
                      <p className="mt-1 truncate text-xs text-stone-500">
                        {getVariantLabel(movement.variant_name, movement.variant_option)}
                      </p>
                      {movement.sku && (
                        <p className="mt-1 break-all text-xs text-stone-400">
                          {movement.sku}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs",
                        getMovementTone(movement.movement_type)
                      )}
                    >
                      {movementLabels[movement.movement_type]}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-[6px] bg-white p-2">
                      <p className="text-stone-400">調整前</p>
                      <p className="mt-1 font-semibold text-stone-900">
                        {movement.quantity_before}
                      </p>
                    </div>
                    <div className="rounded-[6px] bg-white p-2">
                      <p className="text-stone-400">變動</p>
                      <p
                        className={cn(
                          "mt-1 font-semibold",
                          movement.quantity_delta > 0
                            ? "text-emerald-700"
                            : movement.quantity_delta < 0
                              ? "text-red-600"
                              : "text-stone-700"
                        )}
                      >
                        {getDeltaText(movement.quantity_delta)}
                      </p>
                    </div>
                    <div className="rounded-[6px] bg-white p-2">
                      <p className="text-stone-400">調整後</p>
                      <p className="mt-1 font-semibold text-stone-900">
                        {movement.quantity_after}
                      </p>
                    </div>
                  </div>
                  {movement.note && (
                    <p className="mt-3 rounded-[6px] bg-white p-2 text-xs text-stone-600">
                      {movement.note}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
                    <span>{formatDateTime(movement.created_at)}</span>
                    <span>{movement.reference_number || "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMoreMovements && (
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full rounded-full bg-white"
              disabled={isMovementsLoading}
              onClick={() => loadMovements({ nextPage: movementPage, append: true })}
            >
              載入更多紀錄
            </Button>
          )}
        </aside>
      </div>
    </main>
  );
}
