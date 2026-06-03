import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  LogOut,
  PackageCheck,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  StopCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  lookupAdminInventoryBySku,
  type AdminInventoryLookup,
} from "@/lib/shop/adminInventoryApi";
import { parseSkuFromQrValue } from "@/lib/shop/qrCode";
import {
  type AdminInventorySearchResult,
  type ManualSaleOrder,
  type PosPaymentMethod,
  createManualSale,
  searchAdminInventory,
} from "@/lib/shop/adminPosApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import { cn } from "@/lib/utils";

const adminPosTokenKey = "mumbao-admin-shop-order-token";

type PosCartItem = {
  variant_id: string;
  sku?: string;
  product_name: string;
  product_image_url?: string;
  variant_name: string;
  variant_option?: string;
  unit_price: number;
  inventory: number;
  quantity: number;
};

const paymentLabels: Record<PosPaymentMethod, string> = {
  cash: "現金",
  transfer: "轉帳",
  other: "其他",
};

function getStoredAdminToken() {
  try {
    return sessionStorage.getItem(adminPosTokenKey) || "";
  } catch {
    return "";
  }
}

function saveAdminToken(token: string) {
  sessionStorage.setItem(adminPosTokenKey, token);
}

function clearAdminToken() {
  sessionStorage.removeItem(adminPosTokenKey);
}

function numberValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCartItem(lookup: AdminInventoryLookup): PosCartItem {
  return {
    variant_id: lookup.variant.id,
    sku: lookup.variant.sku || "",
    product_name: lookup.product.name,
    product_image_url: lookup.product.cover_image_url,
    variant_name: lookup.variant.variant_name,
    variant_option: lookup.variant.variant_option,
    unit_price: lookup.variant.price,
    inventory: lookup.inventory,
    quantity: 1,
  };
}

function getLookupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("重複") || message.toLowerCase().includes("duplicate")) {
    return "商品編號重複，請先到商品管理修正";
  }

  if (message.toLowerCase().includes("not found") || message.includes("找不到")) {
    return "找不到商品編號，請確認 QR code 或商品編號是否正確";
  }

  return message || "找不到商品編號，請確認 QR code 或商品編號是否正確";
}

export default function AdminShopPos() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [manualSku, setManualSku] = useState("");
  const [scannedSku, setScannedSku] = useState("");
  const [searchResults, setSearchResults] = useState<AdminInventorySearchResult[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [lastOrder, setLastOrder] = useState<ManualSaleOrder | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingSku, setIsAddingSku] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef("");

  const total = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.unit_price * Math.max(item.quantity, 0),
        0
      ),
    [cartItems]
  );

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  const addLookupToCart = useCallback((lookup: AdminInventoryLookup) => {
    const nextItem = toCartItem(lookup);

    setCartItems((current) => {
      const existing = current.find((item) => item.variant_id === nextItem.variant_id);
      if (!existing) return [nextItem, ...current];

      const nextQuantity = existing.quantity + 1;
      return current.map((item) =>
        item.variant_id === nextItem.variant_id
          ? {
              ...item,
              inventory: nextItem.inventory,
              unit_price: nextItem.unit_price,
              quantity: nextQuantity,
            }
          : item
      );
    });
    setLastOrder(null);
    setSuccess(`${lookup.product.name} 已加入銷售清單`);
  }, []);

  const addSkuToCart = useCallback(
    async (rawSku: string, source: "scan" | "manual" = "manual") => {
      const sku = parseSkuFromQrValue(rawSku);
      if (!token || !sku) return;

      setIsAddingSku(true);
      setScannedSku(source === "scan" ? sku : "");
      setSuccess(source === "scan" ? `掃描成功：${sku}` : "");
      setError("");

      try {
        const lookup = await lookupAdminInventoryBySku({ token, sku });
        addLookupToCart(lookup);
        setManualSku("");
        setError("");
        setSuccess(
          source === "scan"
            ? `掃描成功：${sku}，已加入銷售清單`
            : `${lookup.product.name} 已加入銷售清單`
        );
      } catch (lookupError) {
        setError(getLookupErrorMessage(lookupError));
      } finally {
        setIsAddingSku(false);
      }
    },
    [addLookupToCart, token]
  );

  const startScanner = async () => {
    if (!videoRef.current) return;

    stopScanner();
    setError("");
    setSuccess("相機啟動中，請將 QR code 放入框內。");
    setScannedSku("");
    lastScanRef.current = "";

    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          const rawText = result?.getText();
          if (!rawText) return;

          const sku = parseSkuFromQrValue(rawText);
          if (!sku || lastScanRef.current === sku) return;

          lastScanRef.current = sku;
          controlsRef.current?.stop();
          controlsRef.current = null;
          setIsScanning(false);
          addSkuToCart(sku, "scan");
        }
      );

      controlsRef.current = controls;
      setIsScanning(true);
      setSuccess("掃描中，請將 QR code 放入框內。建議使用 Safari / Chrome，不建議用 LINE 內建瀏覽器。");
    } catch (scanError) {
      setIsScanning(false);
      setError(
        "相機無法啟動，請確認瀏覽器權限，或改用手動輸入商品編號"
      );
    }
  };

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
    stopScanner();
    clearAdminToken();
    setToken("");
    setPassword("");
    setCartItems([]);
    setSearchResults([]);
    setLastOrder(null);
    setManualSku("");
    setScannedSku("");
  };

  const submitManualSku = (event: FormEvent) => {
    event.preventDefault();
    addSkuToCart(manualSku, "manual");
  };

  const continueScanning = () => {
    setScannedSku("");
    setSuccess("");
    setError("");
    lastScanRef.current = "";
    startScanner();
  };

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setIsSearching(true);
    try {
      const data = await searchAdminInventory({
        token,
        q: searchText,
        limit: 30,
      });
      setSearchResults(data.results || []);
      setError("");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "搜尋失敗");
    } finally {
      setIsSearching(false);
    }
  };

  const updateQuantity = (variantId: string, value: string) => {
    const nextQuantity = Math.max(numberValue(value), 1);
    setCartItems((current) =>
      current.map((item) =>
        item.variant_id === variantId ? { ...item, quantity: nextQuantity } : item
      )
    );
  };

  const removeItem = (variantId: string) => {
    setCartItems((current) => current.filter((item) => item.variant_id !== variantId));
  };

  const completeSale = async () => {
    if (!token || !cartItems.length) return;

    setIsSaving(true);
    setSuccess("");
    setLastOrder(null);
    try {
      const order = await createManualSale({
        token,
        paymentMethod,
        items: cartItems.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
        })),
      });

      setCartItems([]);
      setSearchResults([]);
      setError("");
      setLastOrder(order);
      setSuccess(`現場銷售完成：${order.order_number}`);
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : "現場銷售建立失敗");
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
              <h1 className="text-2xl font-semibold">現場銷售登入</h1>
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
            登入現場銷售
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
              現場銷售 POS
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              掃 QR 或手動搜尋商品，完成銷售後會建立訂單並扣庫存。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/shop/scan"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              掃描入庫
            </a>
            <a
              href="/admin/shop/inventory"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              庫存調整
            </a>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 xl:grid-cols-[minmax(0,1fr)_420px] md:px-8 md:py-8">
        <section className="space-y-5">
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
          {lastOrder && (
            <div className="rounded-[8px] border border-emerald-100 bg-white p-4 text-sm text-stone-700 shadow-sm">
              <p className="font-semibold text-emerald-700">銷售完成</p>
              <p className="mt-2">訂單編號：{lastOrder.order_number}</p>
              <p>總金額：{formatPrice(lastOrder.total)}</p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">掃 QR 加入</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    請將 QR code 放入框內。建議使用 Safari / Chrome，不建議用 LINE 內建瀏覽器。
                  </p>
                </div>
                <Camera className="h-6 w-6 text-[#8b6f5b]" />
              </div>
              <div className="relative overflow-hidden rounded-[8px] border border-stone-100 bg-stone-900">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-52 w-52 rounded-[12px] border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
                </div>
              </div>
              {scannedSku && (
                <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <p className="font-semibold">掃描成功</p>
                  <p className="mt-1 break-all font-mono text-xs">{scannedSku}</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  onClick={startScanner}
                  disabled={isScanning}
                >
                  <Camera className="h-4 w-4" />
                  {isScanning ? "掃描中..." : "啟動掃描"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full bg-white"
                  onClick={stopScanner}
                  disabled={!isScanning}
                >
                  <StopCircle className="h-4 w-4" />
                  停止掃描
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-full bg-white"
                onClick={continueScanning}
                disabled={isScanning}
              >
                <Camera className="h-4 w-4" />
                繼續掃描
              </Button>
            </section>

            <section className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-xl font-semibold">手動 key 單</h2>
                <p className="mt-1 text-sm text-stone-500">
                  可搜尋商品名稱、分類或商品編號。
                </p>
              </div>
              <form onSubmit={submitManualSku} className="space-y-3 rounded-[8px] bg-[#fbf7f1] p-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">商品編號</span>
                  <Input
                    value={manualSku}
                    onChange={(event) => setManualSku(parseSkuFromQrValue(event.target.value))}
                    placeholder="MUMBAO-TEST-001"
                    className="h-11 rounded-[8px] bg-white font-mono"
                  />
                </label>
                <Button
                  type="submit"
                  className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  disabled={!manualSku.trim() || isAddingSku}
                >
                  <Plus className="h-4 w-4" />
                  {isAddingSku ? "加入中..." : "加入銷售清單"}
                </Button>
              </form>
              <form onSubmit={submitSearch} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="flex h-11 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4">
                  <Search className="h-4 w-4 text-stone-400" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="搜尋商品名稱 / SKU / 分類"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </label>
                <Button
                  type="submit"
                  className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  disabled={isSearching}
                >
                  <PackageSearch className="h-4 w-4" />
                  {isSearching ? "搜尋中..." : "搜尋"}
                </Button>
              </form>

              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-stone-200 p-6 text-center text-sm text-stone-400">
                    搜尋後可把商品加入銷售清單。
                  </div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.variant.id}
                      type="button"
                      onClick={() => addLookupToCart(result)}
                      className="grid w-full grid-cols-[64px_1fr_auto] gap-3 rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3 text-left hover:bg-[#f4ece2]"
                    >
                      {result.product.cover_image_url ? (
                        <img
                          src={result.product.cover_image_url}
                          alt={result.product.name}
                          className="size-16 rounded-[6px] bg-white object-cover"
                        />
                      ) : (
                        <span className="flex size-16 items-center justify-center rounded-[6px] bg-white text-stone-300">
                          <PackageCheck className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-stone-900">
                          {result.product.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-stone-500">
                          {getVariantLabel(
                            result.variant.variant_name,
                            result.variant.variant_option
                          )}
                        </span>
                        <span className="mt-1 block break-all font-mono text-xs text-stone-400">
                          {result.variant.sku || "未設定 SKU"}
                        </span>
                      </span>
                      <span className="flex flex-col items-end justify-between text-right text-xs">
                        <span className="font-semibold text-stone-900">
                          {formatPrice(result.variant.price)}
                        </span>
                        <span className="text-stone-400">庫存 {result.inventory}</span>
                        <Plus className="h-4 w-4 text-[#8b6f5b]" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>

        <aside className="h-fit rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                POS Cart
              </p>
              <h2 className="mt-1 text-xl font-semibold">銷售清單</h2>
            </div>
            <span className="rounded-full bg-[#f4ece2] px-3 py-1 text-sm text-[#765d4a]">
              {cartItems.length} 項
            </span>
          </div>

          <div className="space-y-3">
            {cartItems.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
                掃 QR 或手動搜尋後，商品會出現在這裡。
              </div>
            ) : (
              cartItems.map((item) => (
                <div
                  key={item.variant_id}
                  className={cn(
                    "rounded-[8px] border bg-[#fbf7f1] p-3",
                    item.quantity > item.inventory ? "border-red-200" : "border-stone-100"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {item.product_image_url ? (
                      <img
                        src={item.product_image_url}
                        alt={item.product_name}
                        className="size-14 rounded-[6px] bg-white object-cover"
                      />
                    ) : (
                      <span className="flex size-14 items-center justify-center rounded-[6px] bg-white text-stone-300">
                        <PackageCheck className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-stone-900">
                        {item.product_name}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {getVariantLabel(item.variant_name, item.variant_option)}
                      </p>
                      {item.sku && (
                        <p className="mt-1 break-all font-mono text-xs text-stone-400">
                          {item.sku}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-9 rounded-full text-red-500 hover:text-red-600"
                      onClick={() => removeItem(item.variant_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_100px] items-end gap-3">
                    <div className="text-sm">
                      <p className="text-stone-500">{formatPrice(item.unit_price)}</p>
                      <p className="mt-1 text-xs text-stone-400">目前庫存 {item.inventory}</p>
                      {item.quantity > item.inventory && (
                        <p className="mt-1 text-xs text-red-600">
                          數量超過目前庫存，送出時會失敗
                        </p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => updateQuantity(item.variant_id, event.target.value)}
                      className="h-10 rounded-[8px] bg-white text-right"
                    />
                  </div>
                  <div className="mt-3 flex justify-between border-t border-stone-100 pt-3 text-sm">
                    <span className="text-stone-500">小計</span>
                    <span className="font-semibold text-stone-900">
                      {formatPrice(item.unit_price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-4 border-t border-stone-100 pt-5">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-stone-900">付款方式</span>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PosPaymentMethod)}
                className="h-11 w-full rounded-[8px] border border-stone-200 bg-white px-3"
              >
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between text-lg font-semibold">
              <span>總金額</span>
              <span>{formatPrice(total)}</span>
            </div>

            <Button
              type="button"
              onClick={completeSale}
              disabled={!cartItems.length || isSaving}
              className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? "建立中..." : "完成銷售"}
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}
