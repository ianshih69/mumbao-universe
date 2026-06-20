import type { CheckoutCustomer, CreatedOrder, PublicOrderLookup, ShopProduct } from "./types";

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
  const data = await fetchJson<{ products?: ShopProduct[] }>("/api/shop?action=products");
  return data.products || [];
}

export async function fetchShopProduct(slug: string) {
  const data = await fetchJson<{ product?: ShopProduct }>(
    `/api/shop?action=product&slug=${encodeURIComponent(slug)}`
  );
  return data.product || null;
}

export async function createShopOrder({
  customer,
  checkoutIdempotencyKey,
  customerAccessToken,
  note,
  items,
}: {
  customer: CheckoutCustomer;
  checkoutIdempotencyKey: string;
  customerAccessToken?: string | null;
  note?: string;
  items: Array<{ variant_id: string; quantity: number }>;
}) {
  const data = await fetchJson<{ order?: CreatedOrder; lookupToken?: string }>("/api/shop?action=order", {
    method: "POST",
    headers: customerAccessToken
      ? {
          Authorization: `Bearer ${customerAccessToken}`,
        }
      : undefined,
    body: JSON.stringify({
      customer,
      checkout_idempotency_key: checkoutIdempotencyKey,
      note,
      items,
    }),
  });

  if (!data.order) {
    throw new Error("訂單建立失敗，請稍後再試。");
  }

  if (!data.lookupToken) {
    throw new Error("訂單查詢連結建立失敗，請稍後再試。");
  }

  return {
    order: data.order,
    lookupToken: data.lookupToken,
  };
}

export async function lookupShopOrder(token: string) {
  const data = await fetchJson<{ order?: PublicOrderLookup }>("/api/shop?action=order-lookup", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

  if (!data.order) {
    throw new Error("查詢連結無效或已失效。");
  }

  return data.order;
}
