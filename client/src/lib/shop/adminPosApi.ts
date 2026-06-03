import type { AdminInventoryLookup } from "@/lib/shop/adminInventoryApi";

export type PosPaymentMethod = "cash" | "transfer" | "other";

export type AdminInventorySearchResult = AdminInventoryLookup;

export type ManualSaleOrderItem = {
  product_id: string;
  variant_id: string;
  product_name: string;
  product_slug?: string;
  product_image_url?: string;
  variant_name: string;
  variant_option?: string;
  sku?: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  quantity_before: number;
  quantity_after: number;
};

export type ManualSaleOrder = {
  id: string;
  order_number: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: PosPaymentMethod;
  payment_status: "confirmed";
  order_status: "completed";
  order_source: "pos";
  items: ManualSaleOrderItem[];
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

export async function searchAdminInventory({
  token,
  q,
  limit = 30,
}: {
  token: string;
  q: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    action: "inventory-search",
    q: q.trim(),
    limit: String(limit),
  });

  return fetchAdminJson<{ results?: AdminInventorySearchResult[] }>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export async function createManualSale({
  token,
  paymentMethod,
  items,
}: {
  token: string;
  paymentMethod: PosPaymentMethod;
  items: Array<{ variant_id: string; quantity: number }>;
}) {
  const data = await fetchAdminJson<{ order?: ManualSaleOrder }>(
    "/api/admin-shop?action=manual-sale",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        payment_method: paymentMethod,
        note: "現場銷售",
        items,
      }),
    }
  );

  if (!data.order) {
    throw new Error("現場銷售建立失敗");
  }

  return data.order;
}
