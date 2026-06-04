export type AdminOrderStatus =
  | "pending_confirm"
  | "pending_payment"
  | "paid"
  | "shipping"
  | "completed"
  | "cancelled";

export type AdminPaymentStatus = "pending" | "confirmed" | "failed" | "refunded";

export type AdminOrderSource = "online" | "pos";

const adminAuthExpiredMessage = "登入已過期，請重新登入";

export type AdminShopOrderSummary = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  payment_status: AdminPaymentStatus;
  order_status: AdminOrderStatus;
  order_source: AdminOrderSource;
  created_at?: string;
  updated_at?: string;
};

export type AdminShopOrderItem = {
  id: string;
  product_name: string;
  product_slug?: string;
  product_image_url?: string;
  variant_name?: string;
  variant_option?: string;
  variant_price: number;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type AdminShopOrderDetail = AdminShopOrderSummary & {
  shipping_address: string;
  note?: string;
  items: AdminShopOrderItem[];
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
      throw new Error(adminAuthExpiredMessage);
    }

    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export async function fetchAdminShopOrders({
  token,
  q = "",
  status = "",
  source = "",
  page = 0,
  limit = 30,
}: {
  token: string;
  q?: string;
  status?: string;
  source?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (q.trim()) params.set("q", q.trim());
  if (status.trim()) params.set("status", status.trim());
  if (source.trim()) params.set("source", source.trim());
  params.set("action", "orders");

  return fetchAdminJson<{
    orders?: AdminShopOrderSummary[];
    page?: number;
    limit?: number;
    hasMore?: boolean;
    nextPage?: number | null;
  }>(`/api/admin-shop?${params.toString()}`, token);
}

export async function fetchAdminShopOrder(token: string, orderNumber: string) {
  const data = await fetchAdminJson<{ order?: AdminShopOrderDetail }>(
    `/api/admin-shop?action=order&orderNumber=${encodeURIComponent(orderNumber)}`,
    token
  );

  if (!data.order) {
    throw new Error("訂單不存在。");
  }

  return data.order;
}

export async function updateAdminShopOrderStatus({
  token,
  orderNumber,
  order_status,
  payment_status,
}: {
  token: string;
  orderNumber: string;
  order_status?: AdminOrderStatus;
  payment_status?: AdminPaymentStatus;
}) {
  const data = await fetchAdminJson<{ order?: AdminShopOrderDetail }>(
    "/api/admin-shop?action=order",
    token,
    {
      method: "PATCH",
      body: JSON.stringify({
        orderNumber,
        ...(order_status ? { order_status } : {}),
        ...(payment_status ? { payment_status } : {}),
      }),
    }
  );

  if (!data.order) {
    throw new Error("訂單更新失敗。");
  }

  return data.order;
}
