import type { CheckoutCustomer, CreatedOrder, ShopProduct } from "./types";

async function fetchJson<T>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export async function fetchShopProducts() {
  const data = await fetchJson<{ products?: ShopProduct[] }>("/api/shop-products");
  return data.products || [];
}

export async function fetchShopProduct(slug: string) {
  const data = await fetchJson<{ product?: ShopProduct }>(
    `/api/shop-product?slug=${encodeURIComponent(slug)}`
  );
  return data.product || null;
}

export async function createShopOrder({
  customer,
  note,
  items,
}: {
  customer: CheckoutCustomer;
  note?: string;
  items: Array<{ variant_id: string; quantity: number }>;
}) {
  const data = await fetchJson<{ order?: CreatedOrder }>("/api/shop-orders", {
    method: "POST",
    body: JSON.stringify({
      customer,
      note,
      items,
    }),
  });

  if (!data.order) {
    throw new Error("訂單建立失敗，請稍後再試。");
  }

  return data.order;
}
