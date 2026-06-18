import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import QRCode from "qrcode";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
  getInitialAdminAuthStatus,
  setAdminSession,
  type AdminAuthStatus,
} from "@/lib/shop/adminAuth";
import { fetchAdminSession } from "@/lib/shop/adminIdentityApi";
import {
  adjustSupplyQuantity,
  deleteFurnitureAsset,
  deleteHousekeepingRecord,
  deleteSupplyItem,
  deleteWarehouseMedia,
  fetchFurnitureAssets,
  fetchHousekeepingRecords,
  fetchSupplyItems,
  fetchWarehouseDashboard,
  fetchWarehouseLocations,
  saveFurnitureAsset,
  saveHousekeepingRecord,
  saveSupplyItem,
  uploadWarehouseMedia,
  type FurnitureAsset,
  type HousekeepingRecord,
  type SupplyItem,
  type WarehouseLocation,
  type WarehouseMedia,
} from "@/lib/shop/adminWarehouseApi";

type TabKey = "supplies" | "furniture" | "housekeeping" | "locations";
type UploadTarget = "supply" | "furniture" | "housekeeping";
type QuantityUpdateState = {
  optimisticQuantity: number;
  pendingDelta: number;
  isSaving: boolean;
  error: string | null;
  saved: boolean;
};
type QuantityQueueState = {
  committedQuantity: number;
  optimisticQuantity: number;
  pendingDelta: number;
  isSaving: boolean;
  savedTimer?: number;
};

const emptySupply: Partial<SupplyItem> = {
  name: "",
  brand_spec: "",
  quantity: 0,
  safety_stock: 0,
  location_code: "F1-L1",
  unit_price: 0,
  supplier: "",
  note: "",
};

const emptyFurniture: Partial<FurnitureAsset> = {
  asset_name: "",
  asset_number: "",
  original_amount: 0,
  room_area: "",
  brand_model: "",
  vendor: "",
  note: "",
};

const emptyHousekeeping: Partial<HousekeepingRecord> = {
  order_number: "",
  room_area: "",
  record_type: "cleaning_completed",
  captured_at: new Date().toISOString().slice(0, 16),
  note: "",
  related_asset_number: "",
};

function formatMoney(value?: number | null) {
  return Number(value || 0).toLocaleString("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stockStatus(item: Pick<SupplyItem, "quantity" | "safety_stock">) {
  if (Number(item.quantity) <= 0) return { label: "已用完", tone: "bg-rose-100 text-rose-700" };
  if (Number(item.quantity) <= Number(item.safety_stock)) return { label: "低庫存", tone: "bg-amber-100 text-amber-700" };
  return { label: "庫存正常", tone: "bg-emerald-100 text-emerald-700" };
}

function fieldClass() {
  return "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]";
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-stone-700">
      <span>
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function sectionClass() {
  return "rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm";
}

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82)
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") || "warehouse-photo";
  return new File([blob], `${name}.webp`, { type: "image/webp" });
}

function MediaPreview({ media }: { media?: WarehouseMedia | null }) {
  if (!media?.public_url) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f3ece4] text-xs text-stone-500">
        無照片
      </div>
    );
  }

  return (
    <img
      src={media.public_url}
      alt={media.file_name || "照片"}
      className="h-20 w-20 rounded-2xl object-cover"
    />
  );
}

function LoginCard() {
  return (
    <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
      <div className="mx-auto max-w-md rounded-[8px] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">Warehouse Admin</p>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900">請先登入後台</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          請使用個人管理員帳號登入後再管理備品、傢俱與房務存證。
        </p>
        <a
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#765d4a]"
          href="/admin/shop/login?redirect=/admin/shop/warehouse"
        >
          使用個人帳號登入
        </a>
      </div>
    </main>
  );
}

export default function AdminShopWarehouse() {
  const [location, setLocation] = useLocation();
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<TabKey>("supplies");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [dashboard, setDashboard] = useState({ lowStockCount: 0, outOfStockCount: 0, supplyCount: 0 });
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [furniture, setFurniture] = useState<FurnitureAsset[]>([]);
  const [records, setRecords] = useState<HousekeepingRecord[]>([]);

  const [supplyForm, setSupplyForm] = useState<Partial<SupplyItem>>(emptySupply);
  const [furnitureForm, setFurnitureForm] = useState<Partial<FurnitureAsset>>(emptyFurniture);
  const [recordForm, setRecordForm] = useState<Partial<HousekeepingRecord>>(emptyHousekeeping);
  const [supplyFilter, setSupplyFilter] = useState({ q: "", status: "all", location: "all" });
  const [furnitureQ, setFurnitureQ] = useState("");
  const [recordFilter, setRecordFilter] = useState({ q: "", type: "all", date: "" });
  const [selectedLocation, setSelectedLocation] = useState("");
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [supplyPhotoPreview, setSupplyPhotoPreview] = useState("");
  const [supplyPhotoFileName, setSupplyPhotoFileName] = useState("");
  const [quantityUpdates, setQuantityUpdates] = useState<Record<string, QuantityUpdateState>>({});
  const quantityQueuesRef = useRef<Record<string, QuantityQueueState>>({});
  const identity = getAdminIdentity();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTab = params.get("tab") as TabKey | null;
    const nextLocation = params.get("location") || "";
    if (nextTab && ["supplies", "furniture", "housekeeping", "locations"].includes(nextTab)) {
      setTab(nextTab);
    }
    if (nextLocation) {
      setSelectedLocation(nextLocation);
      setSupplyFilter((current) => ({ ...current, location: nextLocation }));
    }
  }, []);

  const mergeQueuedSupplyQuantities = (items: SupplyItem[]) =>
    items.map((item) => {
      const queue = quantityQueuesRef.current[item.id];
      if (!queue || (!queue.isSaving && queue.pendingDelta === 0)) return item;
      return { ...item, quantity: queue.optimisticQuantity };
    });

  const updateSupplyLocally = (id: string, updater: (item: SupplyItem) => SupplyItem) => {
    setSupplies((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  };

  const setQuantityStatus = (id: string, next: Partial<QuantityUpdateState>) => {
    setQuantityUpdates((current) => {
      const queue = quantityQueuesRef.current[id];
      const previous = current[id] || {
        optimisticQuantity: queue?.optimisticQuantity || 0,
        pendingDelta: queue?.pendingDelta || 0,
        isSaving: Boolean(queue?.isSaving),
        error: null,
        saved: false,
      };
      return {
        ...current,
        [id]: {
          ...previous,
          ...next,
        },
      };
    });
  };

  const clearSavedStatusLater = (id: string) => {
    const queue = quantityQueuesRef.current[id];
    if (!queue) return;
    if (queue.savedTimer) window.clearTimeout(queue.savedTimer);
    queue.savedTimer = window.setTimeout(() => {
      setQuantityUpdates((current) => {
        const previous = current[id];
        if (!previous || previous.isSaving || previous.error) return current;
        return {
          ...current,
          [id]: {
            ...previous,
            saved: false,
          },
        };
      });
    }, 1600);
  };

  const flushSupplyQuantityQueue = async (id: string, activeToken: string) => {
    const queue = quantityQueuesRef.current[id];
    if (!queue || queue.isSaving || queue.pendingDelta === 0) return;

    const deltaToSave = queue.pendingDelta;
    queue.pendingDelta = 0;
    queue.isSaving = true;
    setQuantityStatus(id, {
      optimisticQuantity: queue.optimisticQuantity,
      pendingDelta: queue.pendingDelta,
      isSaving: true,
      error: null,
      saved: false,
    });

    try {
      const result = await adjustSupplyQuantity(activeToken, id, deltaToSave);
      const updatedItem = result.item;
      const serverQuantity = Number(updatedItem?.quantity);
      if (!updatedItem?.id || !Number.isFinite(serverQuantity)) {
        throw new Error("數量儲存回應不完整。");
      }

      queue.committedQuantity = serverQuantity;
      queue.isSaving = false;

      if (queue.pendingDelta === 0) {
        queue.optimisticQuantity = serverQuantity;
        updateSupplyLocally(id, (item) => ({ ...item, ...updatedItem, quantity: serverQuantity }));
        setQuantityStatus(id, {
          optimisticQuantity: serverQuantity,
          pendingDelta: 0,
          isSaving: false,
          error: null,
          saved: true,
        });
        clearSavedStatusLater(id);
        return;
      }

      updateSupplyLocally(id, (item) => ({
        ...item,
        ...updatedItem,
        quantity: queue.optimisticQuantity,
      }));
      setQuantityStatus(id, {
        optimisticQuantity: queue.optimisticQuantity,
        pendingDelta: queue.pendingDelta,
        isSaving: true,
        error: null,
        saved: false,
      });
      void flushSupplyQuantityQueue(id, activeToken);
    } catch (error) {
      queue.pendingDelta = 0;
      queue.isSaving = false;
      queue.optimisticQuantity = queue.committedQuantity;
      updateSupplyLocally(id, (item) => ({ ...item, quantity: queue.committedQuantity }));
      setQuantityStatus(id, {
        optimisticQuantity: queue.committedQuantity,
        pendingDelta: 0,
        isSaving: false,
        error: "數量儲存失敗，已恢復原數量。",
        saved: false,
      });
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
    }
  };

  const queueSupplyQuantityChange = (item: SupplyItem, delta: number) => {
    if (!token || !Number.isInteger(delta) || delta === 0) return;
    const id = item.id;
    const queue =
      quantityQueuesRef.current[id] ||
      {
        committedQuantity: Number(item.quantity || 0),
        optimisticQuantity: Number(item.quantity || 0),
        pendingDelta: 0,
        isSaving: false,
      };
    quantityQueuesRef.current[id] = queue;

    const nextQuantity = Math.max(0, queue.optimisticQuantity + delta);
    const actualDelta = nextQuantity - queue.optimisticQuantity;
    if (actualDelta === 0) return;

    queue.optimisticQuantity = nextQuantity;
    queue.pendingDelta += actualDelta;
    if (queue.savedTimer) {
      window.clearTimeout(queue.savedTimer);
      queue.savedTimer = undefined;
    }

    updateSupplyLocally(id, (currentItem) => ({ ...currentItem, quantity: nextQuantity }));
    setQuantityStatus(id, {
      optimisticQuantity: nextQuantity,
      pendingDelta: queue.pendingDelta,
      isSaving: true,
      error: null,
      saved: false,
    });
    void flushSupplyQuantityQueue(id, token);
  };

  const loadAll = async (nextToken = token) => {
    if (!nextToken) return;
    setIsLoading(true);
    try {
      const session = await fetchAdminSession(nextToken);
      setAdminSession({ accessToken: nextToken, user: session.user, authMode: session.authMode });
      const [locationData, dashboardData, supplyData, furnitureData, recordData] = await Promise.all([
        fetchWarehouseLocations(nextToken),
        fetchWarehouseDashboard(nextToken),
        fetchSupplyItems(nextToken, supplyFilter),
        fetchFurnitureAssets(nextToken, furnitureQ),
        fetchHousekeepingRecords(nextToken, recordFilter),
      ]);
      setLocations(locationData.locations || []);
      setDashboard(dashboardData);
      setSupplies(mergeQueuedSupplyQuantities(supplyData.items || []));
      setFurniture(furnitureData.assets || []);
      setRecords(recordData.records || []);
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "資料讀取失敗。");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === "loggedIn" && token) void loadAll(token);
  }, [authStatus, token]);

  useEffect(() => {
    if (authStatus === "loggedIn" && token) void loadAll(token);
  }, [supplyFilter, furnitureQ, recordFilter]);

  useEffect(() => {
    void Promise.all(
      locations.map(async (item) => {
        const url = `https://mumbao.tw/admin/shop/warehouse?tab=locations&location=${encodeURIComponent(item.code)}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 2 });
        return [item.code, dataUrl] as const;
      })
    ).then((entries) => setQrCodes(Object.fromEntries(entries)));
  }, [locations]);

  useEffect(() => {
    return () => {
      if (supplyPhotoPreview) URL.revokeObjectURL(supplyPhotoPreview);
      Object.values(quantityQueuesRef.current).forEach((queue) => {
        if (queue.savedTimer) window.clearTimeout(queue.savedTimer);
      });
    };
  }, [supplyPhotoPreview]);

  const clearSupplyPhotoSelection = () => {
    if (supplyPhotoPreview) URL.revokeObjectURL(supplyPhotoPreview);
    setSupplyPhotoPreview("");
    setSupplyPhotoFileName("");
    setFiles([]);
  };

  const handleSupplyPhotoChange = (nextFiles: FileList | null) => {
    const nextFile = nextFiles?.[0];
    clearSupplyPhotoSelection();
    if (!nextFile) return;
    setFiles([nextFile]);
    setSupplyPhotoFileName(nextFile.name);
    setSupplyPhotoPreview(URL.createObjectURL(nextFile));
  };

  const editSupply = (item: SupplyItem) => {
    clearSupplyPhotoSelection();
    setSupplyForm(item);
  };

  const clearSupplyForm = () => {
    clearSupplyPhotoSelection();
    setSupplyForm(emptySupply);
  };

  const uploadFiles = async (targetType: UploadTarget, targetId: string) => {
    if (!files.length) return;
    for (let index = 0; index < files.length; index += 1) {
      const compressed = await compressImage(files[index]);
      await uploadWarehouseMedia({
        token,
        targetType,
        targetId,
        file: compressed,
        sortOrder: index,
      });
    }
    setFiles([]);
  };

  const saveSupply = async () => {
    const result = await saveSupplyItem(token, supplyForm);
    if (result.item?.id) await uploadFiles("supply", result.item.id);
    clearSupplyPhotoSelection();
    setSupplyForm(emptySupply);
    setNotice("備品已儲存。");
    await loadAll();
  };

  const saveFurniture = async () => {
    const result = await saveFurnitureAsset(token, furnitureForm);
    if (result.asset?.id) await uploadFiles("furniture", result.asset.id);
    setFurnitureForm(emptyFurniture);
    setNotice("傢俱資產已儲存。");
    await loadAll();
  };

  const saveRecord = async () => {
    const result = await saveHousekeepingRecord(token, recordForm);
    if (result.record?.id) await uploadFiles("housekeeping", result.record.id);
    setRecordForm(emptyHousekeeping);
    setNotice("房務存證已儲存。");
    await loadAll();
  };

  const locationSupplyItems = useMemo(
    () => supplies.filter((item) => item.location_code === selectedLocation),
    [selectedLocation, supplies]
  );

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#f7f1e9] p-8">確認登入狀態中...</main>;
  }

  if (authStatus === "loggedOut") {
    return (
      <LoginCard />
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9] pb-16 text-stone-800">
      <AdminShopNav current="warehouse" />
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">Warehouse & Assets</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-950">倉儲與資產</h1>
            <p className="mt-2 text-sm text-stone-600">
              管理備品庫存、傢俱資產、房務存證與倉庫位置 QR Code。
            </p>
            <p className="mt-2 text-xs text-stone-500">
              登入方式：個人帳號
              {identity?.display_name ? `｜${identity.display_name}` : ""}
              {identity?.role_name ? `｜${identity.role_name}` : ""}
            </p>
          </div>
          <button
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 hover:bg-stone-50"
            onClick={() => {
              clearAdminToken();
              setAuthStatus("loggedOut");
            }}
          >
            登出
          </button>
        </div>

        {notice && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className={sectionClass()}>
            <p className="text-sm text-stone-500">備品總數</p>
            <strong className="mt-2 block text-3xl text-stone-950">{dashboard.supplyCount}</strong>
          </div>
          <div className={sectionClass()}>
            <p className="text-sm text-stone-500">低庫存</p>
            <strong className="mt-2 block text-3xl text-amber-700">{dashboard.lowStockCount}</strong>
          </div>
          <div className={sectionClass()}>
            <p className="text-sm text-stone-500">已用完</p>
            <strong className="mt-2 block text-3xl text-rose-700">{dashboard.outOfStockCount}</strong>
          </div>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {[
            ["supplies", "備品庫存"],
            ["furniture", "傢俱資產"],
            ["housekeeping", "房務存證"],
            ["locations", "倉庫位置"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key as TabKey);
                setLocation(`/admin/shop/warehouse?tab=${key}`);
              }}
              className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition ${
                tab === key
                  ? "bg-[#8b6f5b] text-white"
                  : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading && <p className="mt-4 text-sm text-stone-500">讀取中...</p>}

        {tab === "supplies" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className={sectionClass()}>
              <div className="grid gap-3 md:grid-cols-4">
                <input className={fieldClass()} value={supplyFilter.q} onChange={(event) => setSupplyFilter({ ...supplyFilter, q: event.target.value })} placeholder="搜尋品名、品牌、供應商" />
                <select className={fieldClass()} value={supplyFilter.status} onChange={(event) => setSupplyFilter({ ...supplyFilter, status: event.target.value })}>
                  <option value="all">全部</option>
                  <option value="low">低庫存</option>
                  <option value="out">已用完</option>
                </select>
                <select className={fieldClass()} value={supplyFilter.location} onChange={(event) => setSupplyFilter({ ...supplyFilter, location: event.target.value })}>
                  <option value="all">全部位置</option>
                  {locations.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
                </select>
                <button className="rounded-full bg-[#8b6f5b] px-3 py-2 text-sm font-semibold text-white" onClick={() => void loadAll()}>重新整理</button>
              </div>

              <div className="mt-5 space-y-3">
                {supplies.map((item) => {
                  const status = stockStatus(item);
                  const quantityState = quantityUpdates[item.id];
                  const quantityMessage = quantityState?.isSaving
                    ? "儲存中…"
                    : quantityState?.saved
                      ? "已儲存"
                      : "";
                  return (
                    <article key={item.id} className="grid gap-3 rounded-2xl border border-stone-200 bg-[#fffaf5] p-3 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center md:gap-4">
                      <MediaPreview media={item.main_media} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-stone-950">{item.name}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
                        </div>
                        <p className="mt-1 text-sm text-stone-600">{item.brand_spec || "未填品牌／規格"}｜{item.location_code}</p>
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                          <span><span className="font-semibold text-stone-900">目前庫存 {item.quantity}</span></span>
                          <span>安全庫存 {item.safety_stock}</span>
                          <span>單價 {formatMoney(item.unit_price)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:flex-col md:items-end">
                        <div className="flex flex-col items-start gap-1 sm:items-center md:items-end">
                          <div className="inline-flex items-center overflow-hidden rounded-full border border-stone-200 bg-white/80 shadow-sm">
                            <button
                              className="h-9 w-10 text-base font-semibold text-stone-500 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35"
                              disabled={Number(item.quantity) <= 0}
                              onClick={() => queueSupplyQuantityChange(item, -1)}
                              aria-label="減少備品數量"
                            >
                              －
                            </button>
                            <strong className="min-w-14 px-3 text-center text-xl font-bold text-stone-950">{item.quantity}</strong>
                            <button
                              className="h-9 w-10 text-base font-semibold text-[#8b6f5b] transition hover:bg-stone-50"
                              onClick={() => queueSupplyQuantityChange(item, 1)}
                              aria-label="增加備品數量"
                            >
                              ＋
                            </button>
                          </div>
                          {quantityMessage ? <p className="text-xs font-medium text-stone-500">{quantityMessage}</p> : null}
                          {quantityState?.error ? <p className="max-w-48 text-xs font-medium text-rose-600 sm:text-center md:text-right">{quantityState.error}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-white/80" onClick={() => editSupply(item)}>編輯</button>
                          <button className="rounded-full px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50" onClick={() => confirm("確定刪除這筆備品與照片嗎？") && void deleteSupplyItem(token, item.id).then(() => loadAll())}>刪除</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={sectionClass()}>
              <h2 className="text-xl font-semibold">{supplyForm.id ? "編輯備品" : "新增備品"}</h2>
              <div className="mt-4 space-y-3">
                <FormField label="品名" required>
                  <input className={fieldClass()} value={supplyForm.name || ""} onChange={(e) => setSupplyForm({ ...supplyForm, name: e.target.value })} />
                </FormField>
                <FormField label="品牌／規格">
                  <input className={fieldClass()} value={supplyForm.brand_spec || ""} onChange={(e) => setSupplyForm({ ...supplyForm, brand_spec: e.target.value })} />
                </FormField>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="目前數量" required>
                    <input className={fieldClass()} type="number" min={0} value={supplyForm.quantity ?? 0} onChange={(e) => setSupplyForm({ ...supplyForm, quantity: Number(e.target.value) })} />
                  </FormField>
                  <FormField label="安全庫存" required>
                    <input className={fieldClass()} type="number" min={0} value={supplyForm.safety_stock ?? 0} onChange={(e) => setSupplyForm({ ...supplyForm, safety_stock: Number(e.target.value) })} />
                  </FormField>
                </div>
                <FormField label="存放位置" required>
                  <select className={fieldClass()} value={supplyForm.location_code || "F1-L1"} onChange={(e) => setSupplyForm({ ...supplyForm, location_code: e.target.value })}>
                    {locations.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
                  </select>
                </FormField>
                <FormField label="單價">
                  <input className={fieldClass()} type="number" min={0} value={supplyForm.unit_price ?? 0} onChange={(e) => setSupplyForm({ ...supplyForm, unit_price: Number(e.target.value) })} />
                </FormField>
                <FormField label="供應商">
                  <input className={fieldClass()} value={supplyForm.supplier || ""} onChange={(e) => setSupplyForm({ ...supplyForm, supplier: e.target.value })} />
                </FormField>
                <FormField label="備註">
                  <textarea className={fieldClass()} value={supplyForm.note || ""} onChange={(e) => setSupplyForm({ ...supplyForm, note: e.target.value })} />
                </FormField>
                <FormField label="主照片">
                  <div className="space-y-3 rounded-2xl border border-stone-200 bg-[#fffaf5] p-3">
                    {supplyPhotoPreview ? (
                      <div className="flex gap-3">
                        <img src={supplyPhotoPreview} alt="本次新選主照片" className="h-24 w-24 rounded-2xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-800">本次新選照片</p>
                          <p className="truncate text-xs text-stone-500">{supplyPhotoFileName}</p>
                          <p className="mt-1 text-xs text-stone-500">儲存後才會上傳並成為備品照片。</p>
                        </div>
                      </div>
                    ) : supplyForm.main_media?.public_url ? (
                      <div className="flex gap-3">
                        <img src={supplyForm.main_media.public_url} alt="目前主照片" className="h-24 w-24 rounded-2xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-stone-800">目前主照片</p>
                          <p className="mt-1 text-xs text-stone-500">更換照片會先顯示新預覽；既有照片不會因為選新檔而立即刪除。</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-4 text-sm text-stone-500">
                        尚未設定主照片。
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="supply-main-photo" className="cursor-pointer rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                        更換照片
                      </label>
                      {supplyPhotoPreview ? (
                        <button type="button" className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700" onClick={clearSupplyPhotoSelection}>
                          移除本次新選照片
                        </button>
                      ) : supplyForm.main_media?.public_url ? (
                        <p className="text-xs text-stone-500">要刪除既有照片，請使用下方照片列表的刪除按鈕，避免誤刪。</p>
                      ) : null}
                    </div>
                    <input key={supplyPhotoPreview || supplyPhotoFileName || "empty"} id="supply-main-photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleSupplyPhotoChange(e.target.files)} />
                  </div>
                </FormField>
                {supplyForm.media?.length ? <MediaList token={token} media={supplyForm.media} onDone={loadAll} /> : null}
                <div className="flex gap-2">
                  <button className="rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" onClick={() => void saveSupply()}>{supplyForm.id ? "儲存修改" : "新增備品"}</button>
                  <button className="rounded-full border border-stone-200 bg-white px-5 py-3 text-sm" onClick={clearSupplyForm}>{supplyForm.id ? "取消編輯" : "清空"}</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "furniture" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className={sectionClass()}>
              <input className={fieldClass()} value={furnitureQ} onChange={(event) => setFurnitureQ(event.target.value)} placeholder="搜尋資產名稱、編號、房間／區域" />
              <div className="mt-5 space-y-3">
                {furniture.map((asset) => (
                  <article key={asset.id} className="grid gap-4 rounded-3xl border border-stone-200 bg-[#fffaf5] p-4 md:grid-cols-[90px_1fr_auto] md:items-center">
                    <MediaPreview media={asset.main_media} />
                    <div>
                      <h3 className="text-lg font-semibold">{asset.asset_name}</h3>
                      <p className="text-sm text-stone-600">{asset.asset_number}｜{asset.room_area || "未填區域"}</p>
                      <p className="text-sm text-stone-500">{asset.brand_model || "未填品牌型號"}｜{formatMoney(asset.original_amount)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm" onClick={() => setFurnitureForm(asset)}>查看／編輯</button>
                      <button className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" onClick={() => confirm("確定刪除這筆資產與照片嗎？") && void deleteFurnitureAsset(token, asset.id).then(() => loadAll())}>刪除</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className={sectionClass()}>
              <h2 className="text-xl font-semibold">{furnitureForm.id ? "編輯傢俱資產" : "新增傢俱資產"}</h2>
              <div className="mt-4 space-y-3">
                <FormField label="資產名稱" required>
                  <input className={fieldClass()} value={furnitureForm.asset_name || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, asset_name: e.target.value })} />
                </FormField>
                <FormField label="資產編號" required>
                  <input className={fieldClass()} value={furnitureForm.asset_number || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, asset_number: e.target.value })} />
                </FormField>
                <FormField label="原始金額">
                  <input className={fieldClass()} type="number" min={0} value={furnitureForm.original_amount ?? 0} onChange={(e) => setFurnitureForm({ ...furnitureForm, original_amount: Number(e.target.value) })} />
                </FormField>
                <FormField label="房間／區域">
                  <input className={fieldClass()} value={furnitureForm.room_area || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, room_area: e.target.value })} />
                </FormField>
                <FormField label="品牌型號">
                  <input className={fieldClass()} value={furnitureForm.brand_model || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, brand_model: e.target.value })} />
                </FormField>
                <FormField label="購入廠商">
                  <input className={fieldClass()} value={furnitureForm.vendor || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, vendor: e.target.value })} />
                </FormField>
                <FormField label="備註">
                  <textarea className={fieldClass()} value={furnitureForm.note || ""} onChange={(e) => setFurnitureForm({ ...furnitureForm, note: e.target.value })} />
                </FormField>
                <FormField label="照片">
                  <input className={fieldClass()} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                </FormField>
                {furnitureForm.media?.length ? <MediaList token={token} media={furnitureForm.media} onDone={loadAll} /> : null}
                <div className="flex gap-2">
                  <button className="rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" onClick={() => void saveFurniture()}>儲存資產</button>
                  <button className="rounded-full border border-stone-200 bg-white px-5 py-3 text-sm" onClick={() => setFurnitureForm(emptyFurniture)}>清空</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "housekeeping" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className={sectionClass()}>
              <div className="grid gap-3 md:grid-cols-3">
                <input className={fieldClass()} value={recordFilter.q} onChange={(e) => setRecordFilter({ ...recordFilter, q: e.target.value })} placeholder="搜尋訂單、區域、資產編號" />
                <select className={fieldClass()} value={recordFilter.type} onChange={(e) => setRecordFilter({ ...recordFilter, type: e.target.value })}>
                  <option value="all">全部類型</option>
                  <option value="cleaning_completed">打掃完成</option>
                  <option value="checkout_issue">退房異常</option>
                </select>
                <input className={fieldClass()} type="date" value={recordFilter.date} onChange={(e) => setRecordFilter({ ...recordFilter, date: e.target.value })} />
              </div>
              <div className="mt-5 space-y-3">
                {records.map((record) => (
                  <article key={record.id} className="rounded-3xl border border-stone-200 bg-[#fffaf5] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm text-stone-500">{formatDate(record.captured_at)}</p>
                        <h3 className="text-lg font-semibold">{record.room_area}</h3>
                        <p className="text-sm text-stone-600">訂單：{record.order_number || "未填"}｜{record.record_type === "checkout_issue" ? "退房異常" : "打掃完成"}｜照片 {record.media?.length || 0} 張</p>
                        {record.related_asset_number && <p className="text-sm text-stone-500">關聯資產：{record.related_asset_number}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm" onClick={() => setRecordForm({ ...record, captured_at: record.captured_at?.slice(0, 16) })}>查看／編輯</button>
                        <button className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" onClick={() => confirm("確定刪除這筆房務存證與照片嗎？") && void deleteHousekeepingRecord(token, record.id).then(() => loadAll())}>刪除</button>
                      </div>
                    </div>
                    {record.media?.length ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {record.media.map((media) => <img key={media.id} src={media.public_url} className="h-24 w-24 rounded-2xl object-cover" alt={media.file_name || "房務照片"} />)}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            <section className={sectionClass()}>
              <h2 className="text-xl font-semibold">{recordForm.id ? "編輯房務存證" : "新增房務存證"}</h2>
              <div className="mt-4 space-y-3">
                <FormField label="訂單編號">
                  <input className={fieldClass()} value={recordForm.order_number || ""} onChange={(e) => setRecordForm({ ...recordForm, order_number: e.target.value })} />
                </FormField>
                <FormField label="房間／區域" required>
                  <input className={fieldClass()} value={recordForm.room_area || ""} onChange={(e) => setRecordForm({ ...recordForm, room_area: e.target.value })} />
                </FormField>
                <FormField label="拍攝類型" required>
                  <select className={fieldClass()} value={recordForm.record_type || "cleaning_completed"} onChange={(e) => setRecordForm({ ...recordForm, record_type: e.target.value as HousekeepingRecord["record_type"] })}>
                    <option value="cleaning_completed">打掃完成</option>
                    <option value="checkout_issue">退房異常</option>
                  </select>
                </FormField>
                <FormField label="拍攝時間" required>
                  <input className={fieldClass()} type="datetime-local" value={String(recordForm.captured_at || "").slice(0, 16)} onChange={(e) => setRecordForm({ ...recordForm, captured_at: e.target.value })} />
                </FormField>
                <FormField label="關聯資產編號">
                  <select className={fieldClass()} value={recordForm.related_asset_number || ""} onChange={(e) => setRecordForm({ ...recordForm, related_asset_number: e.target.value })}>
                    <option value="">不關聯資產</option>
                    {furniture.map((asset) => <option key={asset.id} value={asset.asset_number}>{asset.asset_number}｜{asset.asset_name}</option>)}
                  </select>
                </FormField>
                <FormField label="備註">
                  <textarea className={fieldClass()} value={recordForm.note || ""} onChange={(e) => setRecordForm({ ...recordForm, note: e.target.value })} />
                </FormField>
                <FormField label="照片">
                  <input className={fieldClass()} multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                </FormField>
                {recordForm.media?.length ? <MediaList token={token} media={recordForm.media} onDone={loadAll} /> : null}
                <div className="flex gap-2">
                  <button className="rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" onClick={() => void saveRecord()}>儲存存證</button>
                  <button className="rounded-full border border-stone-200 bg-white px-5 py-3 text-sm" onClick={() => setRecordForm(emptyHousekeeping)}>清空</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "locations" && (
          <section className={`${sectionClass()} mt-6`}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {locations.map((item) => {
                const items = supplies.filter((supply) => supply.location_code === item.code);
                const isSelected = selectedLocation === item.code;
                return (
                  <article key={item.code} className={`rounded-3xl border p-4 ${isSelected ? "border-[#8b6f5b] bg-[#fffaf5]" : "border-stone-200 bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold">{item.code}</h3>
                        <p className="text-sm text-stone-500">{item.floor_label}｜{item.shelf_label}</p>
                      </div>
                      {qrCodes[item.code] && <img src={qrCodes[item.code]} alt={`${item.code} QR Code`} className="h-24 w-24 rounded-xl bg-white p-1" />}
                    </div>
                    <button className="mt-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm" onClick={() => {
                      setSelectedLocation(item.code);
                      setSupplyFilter({ ...supplyFilter, location: item.code });
                      setLocation(`/admin/shop/warehouse?tab=locations&location=${item.code}`);
                    }}>查看此層備品</button>
                    {isSelected && (
                      <div className="mt-4 space-y-2">
                        {locationSupplyItems.length ? locationSupplyItems.map((supply) => (
                          <div key={supply.id} className="flex items-center gap-3 rounded-2xl bg-[#f7f1e9] p-3">
                            <MediaPreview media={supply.main_media} />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{supply.name}</p>
                              <p className="text-sm text-stone-500">目前數量 {supply.quantity}</p>
                              {quantityUpdates[supply.id]?.isSaving ? <p className="mt-1 text-xs font-medium text-stone-500">儲存中…</p> : null}
                              {quantityUpdates[supply.id]?.saved ? <p className="mt-1 text-xs font-medium text-stone-500">已儲存</p> : null}
                              {quantityUpdates[supply.id]?.error ? <p className="mt-1 text-xs font-medium text-rose-600">{quantityUpdates[supply.id]?.error}</p> : null}
                            </div>
                            <button
                              className="rounded-full bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={Number(supply.quantity) <= 0}
                              onClick={() => queueSupplyQuantityChange(supply, -1)}
                            >
                              -1
                            </button>
                            <button className="rounded-full bg-white px-3 py-2" onClick={() => queueSupplyQuantityChange(supply, 1)}>+1</button>
                          </div>
                        )) : <p className="text-sm text-stone-500">此層目前沒有備品。</p>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function MediaList({
  token,
  media,
  onDone,
}: {
  token: string;
  media: WarehouseMedia[];
  onDone: () => void | Promise<void>;
}) {
  return (
    <div className="grid gap-2">
      {media.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-[#f7f1e9] p-2">
          <img src={item.public_url} alt={item.file_name || "照片"} className="h-16 w-16 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.file_name || "照片"}</p>
            <a className="text-xs text-[#8b6f5b] underline" href={item.public_url} target="_blank" rel="noreferrer">開啟圖片</a>
          </div>
          <button
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            onClick={() => confirm("確定刪除這張照片嗎？") && void deleteWarehouseMedia(token, item.id).then(() => onDone())}
          >
            刪除
          </button>
        </div>
      ))}
    </div>
  );
}
