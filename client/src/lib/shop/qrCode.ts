import QRCode from "qrcode";

const defaultScanUrl = "https://mumbao.tw/admin/shop/scan";

export function buildVariantQrValue(sku: string) {
  const normalizedSku = sku.trim();
  const url = new URL(defaultScanUrl);
  url.searchParams.set("sku", normalizedSku);
  return url.toString();
}

export function buildQrFileName(sku: string) {
  const safeSku = sku.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "mumbao-product";
  return `${safeSku}-qr.png`;
}

export function parseSkuFromQrValue(value: string) {
  const text = value.trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    const sku = url.searchParams.get("sku")?.trim();
    return sku ? decodeURIComponent(sku) : "";
  } catch {
    return text;
  }
}

export async function createQrDataUrl(value: string, width = 900) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 4,
    width,
    color: {
      dark: "#5f4a3b",
      light: "#fffaf5",
    },
  });
}
