import type { CustomerOrderListItem } from "./customerOrdersApi";
import type { CustomerProfile, CustomerProfileUpdatePayload } from "./customerProfileApi";

export const customerAccountOrderPageSize = 10;
export const customerProfileUnlockMs = 10 * 60 * 1000;

export type CustomerAccountMemberLevel = "normal" | "vip" | "diamond";

const customerMemberLevelLabels: Record<CustomerAccountMemberLevel, string> = {
  normal: "普通會員",
  vip: "VIP會員",
  diamond: "鑽石會員",
};

export const editableCustomerProfileFields = [
  "name",
  "phone",
  "default_postal_code",
  "default_city",
  "default_district",
  "default_address",
] as const;

export function normalizeCustomerMemberLevel(level: unknown): CustomerAccountMemberLevel {
  if (level === "vip" || level === "diamond") return level;
  return "normal";
}

export function getCustomerMemberLevelLabel(level: unknown) {
  return customerMemberLevelLabels[normalizeCustomerMemberLevel(level)];
}

export function getCustomerEmailVerificationLabel(isVerified: unknown) {
  return isVerified ? "已驗證" : "尚未驗證";
}

export function getCustomerAccountTotalPages(total: number, pageSize = customerAccountOrderPageSize) {
  const safeTotal = Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0);
  const safePageSize = Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : customerAccountOrderPageSize);
  return Math.max(1, Math.ceil(safeTotal / safePageSize));
}

export function clampCustomerAccountPage(page: number, totalPages: number) {
  const safeTotalPages = Math.max(1, Number.isFinite(totalPages) ? Math.floor(totalPages) : 1);
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  return Math.min(safePage, safeTotalPages);
}

export function buildCustomerProfileUpdatePayload(
  form: Partial<Record<(typeof editableCustomerProfileFields)[number], string>>,
): CustomerProfileUpdatePayload {
  return editableCustomerProfileFields.reduce<CustomerProfileUpdatePayload>((payload, field) => {
    if (Object.prototype.hasOwnProperty.call(form, field)) {
      payload[field] = String(form[field] || "");
    }
    return payload;
  }, {});
}

export function getCustomerDefaultFullAddress(
  profile: Pick<CustomerProfile, "default_postal_code" | "default_city" | "default_district" | "default_address"> | null | undefined,
) {
  if (!profile) return "";
  return [
    profile.default_postal_code,
    profile.default_city,
    profile.default_district,
    profile.default_address,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function buildCustomerFullAddressUpdatePayload(
  form: Pick<CustomerProfileUpdatePayload, "name" | "phone" | "default_address">,
): CustomerProfileUpdatePayload {
  return buildCustomerProfileUpdatePayload({
    name: form.name || "",
    phone: form.phone || "",
    default_postal_code: "",
    default_city: "",
    default_district: "",
    default_address: form.default_address || "",
  });
}

export function hasDefaultShippingProfile(profile: Pick<CustomerProfile, "default_postal_code" | "default_city" | "default_district" | "default_address"> | null | undefined) {
  if (!profile) return false;
  return Boolean(getCustomerDefaultFullAddress(profile));
}

export function getCustomerAccountOrderTypeLabel(orderType: "shop" | "booking") {
  return orderType === "booking" ? "住宿" : "商品";
}

export function getCustomerAccountOrderSummary(order: Pick<CustomerOrderListItem, "item_count" | "item_summary">) {
  const summary = String(order.item_summary || "").trim();
  if (summary) return summary;
  return Number(order.item_count || 0) > 0 ? `商品等 ${order.item_count} 項` : "商品訂單";
}
