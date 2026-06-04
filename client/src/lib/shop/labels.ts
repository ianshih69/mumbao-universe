export const ORDER_SOURCE_LABELS = {
  online: "官網訂單",
  pos: "現場銷售",
} as const;

export const ORDER_STATUS_LABELS = {
  pending_confirm: "待確認",
  pending_payment: "待付款",
  paid: "已付款",
  shipping: "出貨中",
  completed: "已完成",
  cancelled: "已取消",
} as const;

export const PAYMENT_STATUS_LABELS = {
  pending: "待付款",
  confirmed: "已確認付款",
  failed: "付款失敗",
  refunded: "已退款",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "現金",
  transfer: "轉帳",
  other: "其他",
  manual_confirmation: "人工確認付款",
} as const;

export const INVENTORY_MOVEMENT_LABELS = {
  stock_in: "入庫",
  stock_out: "扣庫存",
  adjustment: "盤點調整",
  manual_sale: "現場銷售",
  online_order: "官網訂單",
  return_in: "退貨入庫",
} as const;

export const PRODUCT_STATUS_LABELS = {
  draft: "草稿",
  published: "上架",
  archived: "封存",
} as const;

export const VARIANT_STATUS_LABELS = {
  active: "販售中",
  inactive: "暫停販售",
} as const;

export function getOrderSourceLabel(value?: string) {
  return ORDER_SOURCE_LABELS[value as keyof typeof ORDER_SOURCE_LABELS] || value || "-";
}

export function getOrderStatusLabel(value?: string) {
  return ORDER_STATUS_LABELS[value as keyof typeof ORDER_STATUS_LABELS] || value || "-";
}

export function getPaymentStatusLabel(value?: string) {
  return PAYMENT_STATUS_LABELS[value as keyof typeof PAYMENT_STATUS_LABELS] || value || "-";
}

export function getPaymentMethodLabel(value?: string) {
  return PAYMENT_METHOD_LABELS[value as keyof typeof PAYMENT_METHOD_LABELS] || value || "-";
}

export function getInventoryMovementLabel(value?: string) {
  return (
    INVENTORY_MOVEMENT_LABELS[value as keyof typeof INVENTORY_MOVEMENT_LABELS] ||
    value ||
    "-"
  );
}

export function getProductStatusLabel(value?: string) {
  return PRODUCT_STATUS_LABELS[value as keyof typeof PRODUCT_STATUS_LABELS] || value || "-";
}

export function getVariantStatusLabel(value?: string) {
  return VARIANT_STATUS_LABELS[value as keyof typeof VARIANT_STATUS_LABELS] || value || "-";
}
