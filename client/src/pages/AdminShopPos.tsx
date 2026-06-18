import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  CheckCircle2,
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
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  lookupAdminInventoryBySku,
  type AdminInventoryLookup,
} from "@/lib/shop/adminInventoryApi";
import {
  adminAuthExpiredMessage,
  clearAdminToken as clearStoredAdminToken,
  getAdminToken,
  isAdminAuthError,
} from "@/lib/shop/adminAuth";
import { parseSkuFromQrValue } from "@/lib/shop/qrCode";
import {
  type AdminInventorySearchResult,
  type ManualSaleOrder,
  type PosPaymentMethod,
  createManualSale,
  searchAdminInventory,
} from "@/lib/shop/adminPosApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/shop/labels";
import { cn } from "@/lib/utils";

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

type LastAddedItem = {
  variant_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  subtotal: number;
  wasExisting: boolean;
};

const paymentLabels: Record<PosPaymentMethod, string> = {
  cash: PAYMENT_METHOD_LABELS.cash,
  transfer: PAYMENT_METHOD_LABELS.transfer,
  other: PAYMENT_METHOD_LABELS.other,
};

function getStoredAdminToken() {
  return getAdminToken();
}


function clearAdminToken() {
  clearStoredAdminToken();
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

function getScanStatusText(status: "idle" | "scanning" | "success" | "stopped" | "error") {
  if (status === "scanning") return "掃描中";
  if (status === "success") return "掃描成功，已停止，等待繼續掃描";
  if (status === "stopped") return "已停止，等待繼續掃描";
  if (status === "error") return "相機啟動失敗";
  return "尚未開始掃描";
}

export default function AdminShopPos() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [manualSku, setManualSku] = useState("");
  const [scannedSku, setScannedSku] = useState("");
  const [lastAddedItem, setLastAddedItem] = useState<LastAddedItem | null>(null);
  const [highlightedVariantId, setHighlightedVariantId] = useState("");
  const [searchResults, setSearchResults] = useState<AdminInventorySearchResult[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [lastOrder, setLastOrder] = useState<ManualSaleOrder | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingSku, setIsAddingSku] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "stopped" | "error">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cartSectionRef = useRef<HTMLElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isScanProcessingRef = useRef(false);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);
  const highlightTimerRef = useRef<number | null>(null);

  const total = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.unit_price * Math.max(item.quantity, 0),
        0
      ),
    [cartItems]
  );
  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0),
    [cartItems]
  );

  const scrollToCart = useCallback(() => {
    window.setTimeout(() => {
      cartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, []);

  const flashItem = useCallback((variantId: string) => {
    setHighlightedVariantId(variantId);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedVariantId("");
      highlightTimerRef.current = null;
    }, 1500);
  }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const handleAuthFailure = useCallback(() => {
    stopScanner();
    clearAdminToken();
    setToken("");
    setError("");
    setSuccess("");
  }, [stopScanner]);

  useEffect(() => {
    return () => {
      stopScanner();
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, [stopScanner]);

  const addLookupToCart = useCallback(
    (lookup: AdminInventoryLookup, source: "scan" | "manual" | "search" = "search") => {
      const nextItem = toCartItem(lookup);

      setCartItems((current) => {
        const existing = current.find((item) => item.variant_id === nextItem.variant_id);
        const nextQuantity = existing ? existing.quantity + 1 : 1;
        const feedback: LastAddedItem = {
          variant_id: nextItem.variant_id,
          product_name: nextItem.product_name,
          sku: nextItem.sku,
          quantity: nextQuantity,
          subtotal: nextQuantity * nextItem.unit_price,
          wasExisting: Boolean(existing),
        };

        setLastAddedItem(feedback);
        flashItem(nextItem.variant_id);
        setSuccess(
          source === "scan"
            ? `已掃到 ${nextItem.sku || nextItem.product_name}。已加入銷售清單，目前數量 ${nextQuantity}。請按「繼續掃描」再掃下一個商品`
            : existing
              ? `已增加數量，目前數量 ${nextQuantity}`
              : `${lookup.product.name} 已加入銷售清單`
        );

        if (!existing) return [nextItem, ...current];

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
      scrollToCart();
    },
    [flashItem, scrollToCart]
  );

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
        addLookupToCart(lookup, source);
        setManualSku("");
        setError("");
      } catch (lookupError) {
        if (isAdminAuthError(lookupError)) {
          handleAuthFailure();
          return;
        }
        setError(getLookupErrorMessage(lookupError));
      } finally {
        setIsAddingSku(false);
      }
    },
    [addLookupToCart, handleAuthFailure, token]
  );

  const startScanner = async () => {
    if (!videoRef.current) return;

    stopScanner();
    setError("");
    setSuccess("相機啟動中，請將 QR code 放入框內。");
    setScannedSku("");
    setScanStatus("idle");
    isScanProcessingRef.current = false;
    lastScanRef.current = "";
    lastScanAtRef.current = 0;

    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          const rawText = result?.getText();
          if (!rawText) return;
          if (isScanProcessingRef.current) return;

          const sku = parseSkuFromQrValue(rawText);
          const now = Date.now();
          if (!sku) return;
          if (lastScanRef.current === sku && now - lastScanAtRef.current < 2000) {
            return;
          }

          isScanProcessingRef.current = true;
          lastScanRef.current = sku;
          lastScanAtRef.current = now;
          stopScanner();
          setScanStatus("success");
          setIsScanning(false);
          addSkuToCart(sku, "scan");
        }
      );

      controlsRef.current = controls;
      setIsScanning(true);
      setScanStatus("scanning");
      setSuccess("掃描中，請將 QR code 放入框內。建議使用 Safari / Chrome，不建議用 LINE 內建瀏覽器。");
    } catch {
      setIsScanning(false);
      setScanStatus("error");
      setError("相機無法啟動，請確認瀏覽器權限，或改用手動輸入商品編號");
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    window.location.href = "/admin/shop/login?redirect=/admin/shop/pos";
  };

  const logout = () => {
    stopScanner();
    clearAdminToken();
    setToken("");
    setCartItems([]);
    setSearchResults([]);
    setLastOrder(null);
    setManualSku("");
    setScannedSku("");
    setLastAddedItem(null);
  };

  const submitManualSku = (event: FormEvent) => {
    event.preventDefault();
    addSkuToCart(manualSku, "manual");
  };

  const continueScanning = () => {
    setScannedSku("");
    setSuccess("");
    setError("");
    isScanProcessingRef.current = false;
    lastScanRef.current = "";
    lastScanAtRef.current = 0;
    setScanStatus("idle");
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
      if (isAdminAuthError(searchError)) {
        handleAuthFailure();
        return;
      }
      setError(searchError instanceof Error ? searchError.message : "搜尋失敗");
    } finally {
      setIsSearching(false);
    }
  };

  const updateQuantity = (variantId: string, value: string) => {
    const nextQuantity = Math.max(numberValue(value), 1);
    setCartItems((current) =>
      current.map((item) => {
        if (item.variant_id !== variantId) return item;
        const nextItem = { ...item, quantity: nextQuantity };
        setLastAddedItem({
          variant_id: item.variant_id,
          product_name: item.product_name,
          sku: item.sku,
          quantity: nextQuantity,
          subtotal: nextQuantity * item.unit_price,
          wasExisting: true,
        });
        flashItem(item.variant_id);
        return nextItem;
      })
    );
  };

  const removeItem = (variantId: string) => {
    setCartItems((current) => current.filter((item) => item.variant_id !== variantId));
    if (lastAddedItem?.variant_id === variantId) setLastAddedItem(null);
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
      setLastAddedItem(null);
      setError("");
      setLastOrder(order);
      setSuccess(`現場銷售完成：${order.order_number}`);
    } catch (saleError) {
      if (isAdminAuthError(saleError)) {
        handleAuthFailure();
        return;
      }
      setError(saleError instanceof Error ? saleError.message : "現場銷售建立失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const startNewSale = () => {
    setLastOrder(null);
    setLastAddedItem(null);
    setSearchResults([]);
    setSearchText("");
    setManualSku("");
    setScannedSku("");
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          <p className="text-sm leading-6 text-stone-600">請使用個人管理員帳號登入後再進入此功能。</p>
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

      <AdminShopNav current="pos" />

      <div className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-5 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-stone-900">
              銷售清單：{cartItems.length} 種商品 / 共 {totalQuantity} 件
            </p>
            <p className="text-xs text-stone-500">總金額 {formatPrice(total)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full bg-white"
            onClick={scrollToCart}
          >
            查看銷售清單
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 xl:grid-cols-[minmax(0,1fr)_420px] md:px-8 md:py-8">
        <section className="space-y-5">
          <div className="hidden rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm md:flex md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-900">
                銷售清單：{cartItems.length} 種商品 / 共 {totalQuantity} 件
              </p>
              <p className="mt-1 text-sm text-stone-500">總金額 {formatPrice(total)}</p>
            </div>
            <Button variant="outline" className="rounded-full bg-white" onClick={scrollToCart}>
              查看銷售清單
            </Button>
          </div>

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
          {lastAddedItem && (
            <div className="rounded-[8px] border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-700">
                    {lastAddedItem.wasExisting
                      ? `已增加數量，目前數量 ${lastAddedItem.quantity}`
                      : "已加入銷售清單"}
                  </p>
                  <p className="mt-2 text-sm text-stone-900">
                    商品：{lastAddedItem.product_name}
                  </p>
                  {lastAddedItem.sku && (
                    <p className="mt-1 break-all font-mono text-xs text-stone-500">
                      商品編號：{lastAddedItem.sku}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-stone-600">
                    目前數量：{lastAddedItem.quantity}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-stone-900">
                    小計：{formatPrice(lastAddedItem.subtotal)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full bg-white"
                  onClick={continueScanning}
                  disabled={isScanning}
                >
                  <Camera className="h-4 w-4" />
                  繼續掃描
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  onClick={scrollToCart}
                >
                  查看銷售清單
                </Button>
              </div>
            </div>
          )}
          {lastOrder && (
            <div className="rounded-[8px] border border-emerald-100 bg-white p-4 text-sm text-stone-700 shadow-sm">
              <p className="font-semibold text-emerald-700">銷售完成</p>
              <p className="mt-2">訂單編號：{lastOrder.order_number}</p>
              <p>總金額：{formatPrice(lastOrder.total)}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <a
                  href="/admin/shop/orders"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  查看訂單
                </a>
                <Button
                  type="button"
                  className="h-10 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                  onClick={startNewSale}
                >
                  再開一筆銷售
                </Button>
              </div>
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
              <div className="rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3 text-sm text-stone-600">
                目前掃描狀態：<span className="font-semibold text-stone-900">{getScanStatusText(scanStatus)}</span>
              </div>
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
                  onClick={() => {
                    stopScanner();
                    setScanStatus("stopped");
                    setSuccess("已停止掃描，請按「繼續掃描」掃下一個商品");
                  }}
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
                      onClick={() => addLookupToCart(result, "search")}
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

        <aside
          ref={cartSectionRef}
          className="h-fit scroll-mt-24 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                銷售清單
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
                    "rounded-[8px] border bg-[#fbf7f1] p-3 transition duration-300",
                    item.quantity > item.inventory ? "border-red-200" : "border-stone-100",
                    highlightedVariantId === item.variant_id &&
                      "border-emerald-300 bg-emerald-50 shadow-lg shadow-emerald-100"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {item.product_image_url ? (
                      <img
                        src={item.product_image_url}
                        alt={item.product_name}
                        className="size-16 rounded-[6px] bg-white object-cover sm:size-14"
                      />
                    ) : (
                      <span className="flex size-16 items-center justify-center rounded-[6px] bg-white text-stone-300 sm:size-14">
                        <PackageCheck className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-base font-semibold text-stone-900 sm:text-sm">
                        {item.product_name}
                      </p>
                      <p className="mt-1 text-sm text-stone-600 sm:text-xs">
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
                  <div className="mt-4 grid gap-3 rounded-[8px] bg-white p-3 sm:grid-cols-[1fr_100px] sm:items-end">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-stone-400">單價</p>
                        <p className="font-medium text-stone-900">
                          {formatPrice(item.unit_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">目前庫存</p>
                        <p className="font-medium text-stone-900">{item.inventory}</p>
                      </div>
                      {item.quantity > item.inventory && (
                        <p className="col-span-2 text-xs text-red-600">
                          數量超過目前庫存，送出時會失敗
                        </p>
                      )}
                    </div>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-stone-900">數量</span>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => updateQuantity(item.variant_id, event.target.value)}
                        className="h-11 rounded-[8px] bg-white text-right text-base"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-stone-100 pt-3 text-base">
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
