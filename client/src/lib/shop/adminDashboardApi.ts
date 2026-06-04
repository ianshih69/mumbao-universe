import { adminAuthExpiredMessage } from "@/lib/shop/adminAuth";
import type { AdminOrderStatus, AdminPaymentStatus } from "@/lib/shop/adminOrdersApi";
import type { AdminInventoryMovementType } from "@/lib/shop/adminInventoryApi";

export type AdminDashboardOrderSource = "online" | "pos";

export type AdminDashboardToday = {
  sales_total: number;
  online_sales_total: number;
  pos_sales_total: number;
  order_count: number;
  online_order_count: number;
  pos_order_count: number;
};

export type AdminDashboardLowInventory = {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  variant_option?: string;
  sku?: string;
  inventory: number;
};

export type AdminDashboardRecentOrder = {
  id: string;
  order_number: string;
  order_source: AdminDashboardOrderSource;
  total: number;
  payment_status: AdminPaymentStatus;
  order_status: AdminOrderStatus;
  created_at?: string;
};

export type AdminDashboardRecentMovement = {
  id: string;
  movement_type: AdminInventoryMovementType;
  product_name?: string;
  variant_name?: string;
  variant_option?: string;
  sku?: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  note?: string;
  created_at?: string;
};

export type AdminShopDashboard = {
  today: AdminDashboardToday;
  pending_online_order_count: number;
  low_inventory: AdminDashboardLowInventory[];
  recent_orders: AdminDashboardRecentOrder[];
  recent_movements: AdminDashboardRecentMovement[];
};

export async function fetchAdminShopDashboard(token: string) {
  const response = await fetch("/api/admin-shop?action=dashboard", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await response.json().catch(() => ({}))) as {
    dashboard?: AdminShopDashboard;
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(adminAuthExpiredMessage);
    }

    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  if (!data.dashboard) {
    throw new Error("Dashboard data is missing.");
  }

  return data.dashboard;
}
