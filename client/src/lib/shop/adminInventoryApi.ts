export type AdminInventoryMovementType =
  | "stock_in"
  | "stock_out"
  | "adjustment"
  | "manual_sale"
  | "online_order"
  | "return_in";

export type AdminInventoryMovement = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name?: string;
  product_slug?: string;
  variant_name?: string;
  variant_option?: string;
  sku?: string;
  movement_type: AdminInventoryMovementType;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reference_type?: string;
  reference_number?: string;
  note?: string;
  created_at?: string;
  created_by?: string;
};

export type AdminInventoryLookup = {
  product: {
    id: string;
    slug: string;
    name: string;
    category: string;
    status: string;
    cover_image_url?: string;
  };
  variant: {
    id: string;
    product_id: string;
    sku?: string;
    variant_name: string;
    variant_option?: string;
    price: number;
    compare_at_price?: number | null;
    inventory: number;
    status: string;
    sort_order: number;
    created_at?: string;
    updated_at?: string;
  };
  inventory: number;
};

async function fetchAdminJson<T>(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("後台密碼錯誤或登入已過期，請重新登入");
    }

    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export async function fetchAdminInventoryMovements({
  token,
  productId = "",
  variantId = "",
  movementType = "",
  page = 0,
  limit = 30,
}: {
  token: string;
  productId?: string;
  variantId?: string;
  movementType?: "" | AdminInventoryMovementType;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    action: "inventory-movements",
    page: String(page),
    limit: String(limit),
  });

  if (productId.trim()) params.set("productId", productId.trim());
  if (variantId.trim()) params.set("variantId", variantId.trim());
  if (movementType.trim()) params.set("movementType", movementType.trim());

  return fetchAdminJson<{
    movements?: AdminInventoryMovement[];
    page?: number;
    limit?: number;
    hasMore?: boolean;
    nextPage?: number | null;
  }>(`/api/admin-shop?${params.toString()}`, token);
}

export async function adjustAdminInventory({
  token,
  variantId,
  movementType,
  quantity,
  note,
}: {
  token: string;
  variantId: string;
  movementType: "stock_in" | "stock_out" | "adjustment";
  quantity: number;
  note?: string;
}) {
  return fetchAdminJson<{
    inventory?: number;
    movement?: AdminInventoryMovement | null;
  }>("/api/admin-shop?action=inventory-adjust", token, {
    method: "POST",
    body: JSON.stringify({
      variant_id: variantId,
      movement_type: movementType,
      quantity,
      note: note || "",
      created_by: "admin",
    }),
  });
}

export async function lookupAdminInventoryBySku({
  token,
  sku,
}: {
  token: string;
  sku: string;
}) {
  return fetchAdminJson<AdminInventoryLookup>(
    `/api/admin-shop?action=inventory-lookup&sku=${encodeURIComponent(sku.trim())}`,
    token
  );
}
