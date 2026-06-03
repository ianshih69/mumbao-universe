import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
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
import {
  type AdminInventoryLookup,
  adjustAdminInventory,
  lookupAdminInventoryBySku,
} from "@/lib/shop/adminInventoryApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import { cn } from "@/lib/utils";

const adminScanTokenKey = "mumbao-admin-shop-order-token";

function getStoredAdminToken() {
  try {
    return sessionStorage.getItem(adminScanTokenKey) || "";
  } catch {
    return "";
  }
}

function saveAdminToken(token: string) {
  sessionStorage.setItem(adminScanTokenKey, token);
}

function clearAdminToken() {
  sessionStorage.removeItem(adminScanTokenKey);
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

export default function AdminShopScan() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [skuInput, setSkuInput] = useState(() => getInitialSku());
  const [lookup, setLookup] = useState<AdminInventoryLookup | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef("");

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }, []);

  const lookupSku = useCallback(
    async (rawSku: string) => {
      const sku = parseSkuFromText(rawSku);
      if (!token || !sku) return;

      setIsLookingUp(true);
      setSuccess("");
      try {
        const result = await lookupAdminInventoryBySku({ token, sku });
        setLookup(result);
        setSkuInput(result.variant.sku || sku);
        setQuantity("1");
        setError("");
      } catch (lookupError) {
        setLookup(null);
        setError(lookupError instanceof Error ? lookupError.message : "商品查詢失敗");
      } finally {
        setIsLookingUp(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    const initialSku = getInitialSku();
    if (initialSku) lookupSku(initialSku);
  }, [lookupSku, token]);

  useEffect(() => stopScanner, [stopScanner]);

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
    setLookup(null);
    setSuccess("");
    setError("");
  };

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    lookupSku(skuInput);
  };

  const startScanner = async () => {
    if (!videoRef.current) return;

    stopScanner();
    setError("");
    setSuccess("");
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
          setSkuInput(sku);
          lookupSku(sku);
          controlsRef.current?.stop();
          controlsRef.current = null;
          setIsScanning(false);
        }
      );

      controlsRef.current = controls;
      setIsScanning(true);
    } catch (scanError) {
      setIsScanning(false);
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
      setSuccess(`入庫完成，目前庫存 ${nextInventory}`);
    } catch (saveError) {
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
              掃描商品 QR code 後入庫，會沿用庫存調整流程並留下流水。
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

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4 rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">相機掃描</h2>
                <p className="mt-1 text-sm text-stone-500">
                  支援網址型 QR code，也支援純商品編號。
                </p>
              </div>
              <Camera className="h-6 w-6 text-[#8b6f5b]" />
            </div>

            <div className="overflow-hidden rounded-[8px] border border-stone-100 bg-stone-900">
              <video
                ref={videoRef}
                className="aspect-[4/3] w-full object-cover"
                muted
                playsInline
              />
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
                <span className="font-medium text-stone-900">商品編號</span>
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

            {lookup ? (
              <div className="space-y-4 rounded-[8px] bg-[#fbf7f1] p-4">
                <div className="flex items-start gap-3">
                  {lookup.product.cover_image_url ? (
                    <img
                      src={lookup.product.cover_image_url}
                      alt={lookup.product.name}
                      className="size-20 rounded-[6px] bg-white object-cover"
                    />
                  ) : (
                    <div className="flex size-20 items-center justify-center rounded-[6px] bg-white text-stone-300">
                      <PackageCheck className="h-6 w-6" />
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
                    <p className="mt-1 break-all font-mono text-xs text-stone-500">
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
              </div>
            ) : (
              <div className="rounded-[8px] border border-dashed border-stone-200 p-6 text-center text-sm text-stone-400">
                掃描或輸入商品編號後，這裡會顯示商品資料。
              </div>
            )}

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
          </aside>
        </section>
      </div>
    </main>
  );
}
