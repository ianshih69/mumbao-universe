import { adminAuthExpiredMessage } from "./adminAuth";
import { ensureFreshAdminSession } from "./adminIdentityApi";

async function fetchAdminJson<T>(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const activeToken = await ensureFreshAdminSession(token);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${activeToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 401) throw new Error(adminAuthExpiredMessage);
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export type WarehouseMedia = {
  id: string;
  target_type: "supply" | "furniture" | "housekeeping";
  target_id: string;
  r2_key: string;
  public_url: string;
  file_name?: string | null;
  content_type?: string | null;
  size?: number | null;
  sort_order: number;
  created_at?: string;
};

export type WarehouseLocation = {
  id: string;
  code: string;
  floor_label: string;
  shelf_label: string;
  sort_order: number;
};

export type SupplyItem = {
  id: string;
  name: string;
  brand_spec?: string | null;
  quantity: number;
  safety_stock: number;
  location_code: string;
  unit_price?: number | null;
  supplier?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  media?: WarehouseMedia[];
  main_media?: WarehouseMedia | null;
};

export type FurnitureAsset = {
  id: string;
  asset_name: string;
  asset_number: string;
  original_amount?: number | null;
  room_area?: string | null;
  brand_model?: string | null;
  vendor?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  media?: WarehouseMedia[];
  main_media?: WarehouseMedia | null;
};

export type HousekeepingRecord = {
  id: string;
  order_number?: string | null;
  room_area: string;
  record_type: "cleaning_completed" | "checkout_issue";
  captured_at: string;
  note?: string | null;
  related_asset_number?: string | null;
  created_at?: string;
  updated_at?: string;
  media?: WarehouseMedia[];
  main_media?: WarehouseMedia | null;
};

export async function fetchWarehouseDashboard(token: string) {
  return fetchAdminJson<{
    lowStockCount: number;
    outOfStockCount: number;
    supplyCount: number;
  }>("/api/admin-shop?action=warehouse-dashboard", token);
}

export async function fetchWarehouseLocations(token: string) {
  return fetchAdminJson<{ locations: WarehouseLocation[] }>(
    "/api/admin-shop?action=warehouse-locations",
    token
  );
}

export async function fetchSupplyItems(
  token: string,
  filters: { q?: string; status?: string; location?: string } = {}
) {
  const params = new URLSearchParams({ action: "warehouse-supply" });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.location) params.set("location", filters.location);
  return fetchAdminJson<{ items: SupplyItem[] }>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export async function saveSupplyItem(token: string, item: Partial<SupplyItem>) {
  const isUpdate = Boolean(item.id);
  return fetchAdminJson<{ item: SupplyItem }>(
    "/api/admin-shop?action=warehouse-supply",
    token,
    {
      method: isUpdate ? "PATCH" : "POST",
      body: JSON.stringify(item),
    }
  );
}

export async function deleteSupplyItem(token: string, id: string) {
  return fetchAdminJson<{ ok: true }>(
    `/api/admin-shop?action=warehouse-supply&id=${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}

export async function adjustSupplyQuantity(
  token: string,
  id: string,
  delta: number
) {
  return fetchAdminJson<{ item: SupplyItem }>(
    "/api/admin-shop?action=warehouse-supply-quantity",
    token,
    {
      method: "POST",
      body: JSON.stringify({ id, delta }),
    }
  );
}

export async function fetchFurnitureAssets(token: string, q = "") {
  const params = new URLSearchParams({ action: "warehouse-furniture-asset" });
  if (q) params.set("q", q);
  return fetchAdminJson<{ assets: FurnitureAsset[] }>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export async function saveFurnitureAsset(
  token: string,
  asset: Partial<FurnitureAsset>
) {
  return fetchAdminJson<{ asset: FurnitureAsset }>(
    "/api/admin-shop?action=warehouse-furniture-asset",
    token,
    {
      method: asset.id ? "PATCH" : "POST",
      body: JSON.stringify(asset),
    }
  );
}

export async function deleteFurnitureAsset(token: string, id: string) {
  return fetchAdminJson<{ ok: true }>(
    `/api/admin-shop?action=warehouse-furniture-asset&id=${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}

export async function fetchHousekeepingRecords(
  token: string,
  filters: { q?: string; type?: string; date?: string } = {}
) {
  const params = new URLSearchParams({ action: "warehouse-housekeeping-record" });
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.date) params.set("date", filters.date);
  return fetchAdminJson<{ records: HousekeepingRecord[] }>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export async function saveHousekeepingRecord(
  token: string,
  record: Partial<HousekeepingRecord>
) {
  return fetchAdminJson<{ record: HousekeepingRecord }>(
    "/api/admin-shop?action=warehouse-housekeeping-record",
    token,
    {
      method: record.id ? "PATCH" : "POST",
      body: JSON.stringify(record),
    }
  );
}

export async function deleteHousekeepingRecord(token: string, id: string) {
  return fetchAdminJson<{ ok: true }>(
    `/api/admin-shop?action=warehouse-housekeeping-record&id=${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}

export async function uploadWarehouseMedia({
  token,
  targetType,
  targetId,
  file,
  sortOrder = 0,
}: {
  token: string;
  targetType: "supply" | "furniture" | "housekeeping";
  targetId: string;
  file: File;
  sortOrder?: number;
}) {
  const presign = await fetchAdminJson<{
    uploadUrl: string;
    fileName: string;
    contentType: string;
    size: number;
    key: string;
    publicUrl: string;
  }>("/api/admin-shop?action=warehouse-media-upload", token, {
    method: "POST",
    body: JSON.stringify({
      targetType,
      targetId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`R2 上傳失敗：${uploadResponse.status}`);
  }

  return fetchAdminJson<{ media: WarehouseMedia }>(
    "/api/admin-shop?action=warehouse-media",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        r2_key: presign.key,
        public_url: presign.publicUrl,
        file_name: presign.fileName,
        content_type: presign.contentType,
        size: presign.size,
        sort_order: sortOrder,
      }),
    }
  );
}

export async function deleteWarehouseMedia(token: string, id: string) {
  return fetchAdminJson<{ ok: true }>(
    `/api/admin-shop?action=warehouse-media&id=${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}
