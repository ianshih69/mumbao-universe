import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  CheckCircle2,
  LogOut,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  Save,
  ShieldCheck,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  type AdminInventoryLookup,
  adjustAdminInventory,
  lookupAdminInventoryBySku,
} from "@/lib/shop/adminInventoryApi";
import {
  adminAuthExpiredMessage,
  clearAdminToken as clearStoredAdminToken,
  getAdminToken,
  isAdminAuthError,
} from "@/lib/shop/adminAuth";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";

function getStoredAdminToken() {
  return getAdminToken();
}


function clearAdminToken() {
  clearStoredAdminToken();
}

function parseSkuFromText(value: string) {
  const text = value.trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    const sku = url.searchParams.get("sku")?.trim();
    if (sku) return sku;
  } catch {
    // Plain SKU values are expected too.
  }

  return text;
}

function getInitialSku() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("sku")?.trim() || "";
}

function numberValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLookupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("重複") || message.toLowerCase().includes("duplicate")) {
    return "商品編號重複，請先到商品管理修正";
  }

  if (message.toLowerCase().includes("not found") || message.includes("找不到")) {
    return "找不到商品編號，請確認 QR code 或商品編號是否正確";
  }

  return message || "商品查詢失敗";
}

export default function AdminShopScan() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [skuInput, setSkuInput] = useState(() => getInitialSku());
  const [scannedSku, setScannedSku] = useState("");
  const [lookup, setLookup] = useState<AdminInventoryLookup | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef("");

  const scrollToResult = useCallback(() => {
    window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }, []);

  const handleAuthFailure = useCallback(() => {
    stopScanner();
    clearAdminToken();
    setToken("");
    setError("");
    setSuccess("");
  }, [stopScanner]);

  const lookupSku = useCallback(
    async (rawSku: string, source: "scan" | "manual" | "url" = "manual") => {
      const sku = parseSkuFromText(rawSku);
      if (!token || !sku) return;

      setScannedSku(sku);
      setSkuInput(sku);
      setIsLookingUp(true);
      setSuccess(source === "scan" ? "掃描成功，正在查詢商品..." : "");
      setError("");
      scrollToResult();

      try {
        const result = await lookupAdminInventoryBySku({ token, sku });
        setLookup(result);
        setSkuInput(result.variant.sku || sku);
        setQuantity("1");
        setSuccess(source === "scan" ? "掃描成功，請確認商品後按確認入庫" : "");
        setError("");
        scrollToResult();
      } catch (lookupError) {
        if (isAdminAuthError(lookupError)) {
          handleAuthFailure();
          return;
        }
        setLookup(null);
        setSuccess(source === "scan" ? "掃描成功，但沒有找到對應商品" : "");
        setError(getLookupErrorMessage(lookupError));
        scrollToResult();
      } finally {
        setIsLookingUp(false);
      }
    },
    [handleAuthFailure, scrollToResult, token]
  );

  useEffect(() => {
    if (!token) return;
    const initialSku = getInitialSku();
    if (initialSku) lookupSku(initialSku, "url");
  }, [lookupSku, token]);

  useEffect(() => stopScanner, [stopScanner]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    window.location.href = "/admin/shop/login?redirect=/admin/shop/scan";
  };

  const logout = () => {
    stopScanner();
    clearAdminToken();
    setToken("");
    setLookup(null);
    setScannedSku("");
    setSuccess("");
    setError("");
  };

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    lookupSku(skuInput, "manual");
  };

  const continueScanning = () => {
    setLookup(null);
    setScannedSku("");
    setSuccess("");
    setError("");
    setQuantity("1");
    lastScanRef.current = "";
    startScanner();
  };

  const startScanner = async () => {
    if (!videoRef.current) return;

    stopScanner();
    setError("");
    setSuccess("相機啟動中，請把 QR code 放在畫面中央。");
    lastScanRef.current = "";

    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          const rawText = result?.getText();
          if (!rawText) return;

          const sku = parseSkuFromText(rawText);
          if (!sku || lastScanRef.current === sku) return;

          lastScanRef.current = sku;
          controlsRef.current?.stop();
          controlsRef.current = null;
          setIsScanning(false);
          lookupSku(sku, "scan");
        }
      );

      controlsRef.current = controls;
      setIsScanning(true);
      setSuccess("掃描中，請讓 QR code 填滿掃描框。");
    } catch (scanError) {
      setIsScanning(false);
      setSuccess("");
      setError(
        scanError instanceof Error
          ? `相機啟動失敗：${scanError.message}`
          : "相機啟動失敗，請確認瀏覽器已允許相機權限"
      );
    }
  };

  const submitStockIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !lookup) return;

    const nextQuantity = numberValue(quantity);
    if (nextQuantity <= 0) {
      setError("入庫數量必須大於 0");
      return;
    }

    const beforeInventory = lookup.inventory;

    setIsSaving(true);
    setSuccess("");
    try {
      const sku = lookup.variant.sku || skuInput.trim();
      const result = await adjustAdminInventory({
        token,
        variantId: lookup.variant.id,
        movementType: "stock_in",
        quantity: nextQuantity,
        note: `掃描入庫：${sku}`,
      });
      const nextInventory = Number(result.inventory ?? lookup.inventory);

      setLookup((current) =>
        current
          ? {
              ...current,
              inventory: nextInventory,
              variant: {
                ...current.variant,
                inventory: nextInventory,
              },
            }
          : current
      );
      setQuantity("1");
      setError("");
      setSuccess(`入庫成功，庫存已從 ${beforeInventory} 增加到 ${nextInventory}`);
      scrollToResult();
    } catch (saveError) {
      if (isAdminAuthError(saveError)) {
        handleAuthFailure();
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "入庫失敗");
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
              <h1 className="text-2xl font-semibold">掃描入庫登入</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-stone-600">請使用個人管理員帳號登入後再進入此功能。</p>
          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
          >
            登入掃描入庫
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              掃描入庫
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              這是入庫模式。掃描後請確認商品，再按確認入庫，庫存才會增加。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/shop/inventory"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              庫存調整
            </a>
            <a
              href="/admin/shop/products"
              className="inline-flex h-10 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
            >
              商品管理
            </a>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="scan" />

      <div className="mx-auto grid max-w-5xl gap-5 px-5 py-6 md:px-8 md:py-8">
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

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">相機掃描</h2>
                <p className="mt-1 text-sm text-stone-500">
                  掃描時請靠近 QR code，讓 QR code 盡量填滿畫面中央。
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

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                onClick={startScanner}
                disabled={isScanning}
              >
                <Camera className="h-4 w-4" />
                {isScanning ? "掃描中..." : "啟動相機掃描"}
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
          </div>

          <aside className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
            <form onSubmit={submitLookup} className="space-y-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">手動輸入商品編號</span>
                <Input
                  value={skuInput}
                  onChange={(event) => setSkuInput(parseSkuFromText(event.target.value))}
                  placeholder="MUMBAO-POSTCARD-SET"
                  className="h-11 rounded-[8px] font-mono"
                />
              </label>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full rounded-full bg-white"
                disabled={!skuInput.trim() || isLookingUp}
              >
                <PackageSearch className="h-4 w-4" />
                {isLookingUp ? "查詢中..." : "查詢商品"}
              </Button>
            </form>

            <div
              ref={resultRef}
              className="scroll-mt-6 space-y-4 rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-4"
            >
              {scannedSku && (
                <div className="rounded-[8px] border border-emerald-100 bg-white p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    掃描成功
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-stone-600">
                    {scannedSku}
                  </p>
                </div>
              )}

              {isLookingUp ? (
                <div className="py-8 text-center text-sm text-stone-400">
                  <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" />
                  正在查詢商品資料...
                </div>
              ) : lookup ? (
                <>
                  <div className="flex items-start gap-3">
                    {lookup.product.cover_image_url ? (
                      <img
                        src={lookup.product.cover_image_url}
                        alt={lookup.product.name}
                        className="size-24 rounded-[6px] bg-white object-cover"
                      />
                    ) : (
                      <div className="flex size-24 items-center justify-center rounded-[6px] bg-white text-stone-300">
                        <PackageCheck className="h-7 w-7" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900">{lookup.product.name}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {getVariantLabel(
                          lookup.variant.variant_name,
                          lookup.variant.variant_option
                        )}
                      </p>
                      <p className="mt-2 text-xs text-stone-400">商品編號</p>
                      <p className="break-all font-mono text-xs text-stone-600">
                        {lookup.variant.sku}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-[6px] bg-white p-3">
                      <p className="text-xs text-stone-400">目前庫存</p>
                      <p className="mt-1 text-2xl font-semibold text-stone-900">
                        {lookup.inventory}
                      </p>
                    </div>
                    <div className="rounded-[6px] bg-white p-3">
                      <p className="text-xs text-stone-400">售價</p>
                      <p className="mt-1 font-semibold text-stone-900">
                        {formatPrice(lookup.variant.price)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-sm text-stone-400">
                  掃描或輸入商品編號後，這裡會顯示商品資料。
                </div>
              )}
            </div>

            <form onSubmit={submitStockIn} className="space-y-3">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-stone-900">入庫數量</span>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-11 rounded-[8px]"
                />
                <p className="text-xs text-stone-400">
                  預設掃一次入庫 +1，也可以改成 +10。
                </p>
              </label>
              <Button
                type="submit"
                className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                disabled={!lookup || isSaving}
              >
                {isSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "入庫中..." : "確認入庫"}
              </Button>
            </form>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full bg-white"
                onClick={continueScanning}
              >
                <Camera className="h-4 w-4" />
                繼續掃描
              </Button>
              <a
                href="/admin/shop/inventory"
                className="inline-flex h-10 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 hover:bg-stone-50"
              >
                查看庫存流水
              </a>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
