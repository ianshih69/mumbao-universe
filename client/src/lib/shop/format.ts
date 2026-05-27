export function formatPrice(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getVariantLabel(variantName?: string, variantOption?: string) {
  return [variantName, variantOption].filter(Boolean).join(" / ");
}
