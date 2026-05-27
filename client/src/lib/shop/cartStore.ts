import type { CartItem, ShopProduct, ShopVariant } from "./types";

const cartStorageKey = "mumbao-shop-cart";

type CartListener = () => void;

const listeners = new Set<CartListener>();

function emitCartChange() {
  listeners.forEach((listener) => listener());
}

function sanitizeCartItem(item: CartItem): CartItem | null {
  const quantity = Number.parseInt(String(item.quantity || ""), 10);

  if (!item.productId || !item.variantId || !item.slug || !item.name) {
    return null;
  }

  return {
    productId: String(item.productId),
    slug: String(item.slug),
    name: String(item.name),
    imageUrl: item.imageUrl ? String(item.imageUrl) : "",
    variantId: String(item.variantId),
    variantName: String(item.variantName || ""),
    variantOption: item.variantOption ? String(item.variantOption) : "",
    price: Number(item.price || 0),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

export function readCartItems(): CartItem[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(cartStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCartItem).filter(Boolean) as CartItem[];
  } catch {
    return [];
  }
}

export function writeCartItems(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
  emitCartChange();
}

export function clearCartItems() {
  writeCartItems([]);
}

export function subscribeCart(listener: CartListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function addCartItem(product: ShopProduct, variant: ShopVariant, quantity: number) {
  const current = readCartItems();
  const nextQuantity = Math.max(1, Math.floor(quantity || 1));
  const existingIndex = current.findIndex((item) => item.variantId === variant.id);
  const imageUrl =
    product.cover_image_url || product.images?.[0]?.image_url || "/images/logo.webp";

  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    current[existingIndex] = {
      ...existing,
      price: variant.price,
      quantity: existing.quantity + nextQuantity,
    };
    writeCartItems(current);
    return;
  }

  writeCartItems([
    ...current,
    {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl,
      variantId: variant.id,
      variantName: variant.variant_name,
      variantOption: variant.variant_option || "",
      price: variant.price,
      quantity: nextQuantity,
    },
  ]);
}

export function updateCartItemQuantity(variantId: string, quantity: number) {
  const nextQuantity = Math.max(1, Math.floor(quantity || 1));
  writeCartItems(
    readCartItems().map((item) =>
      item.variantId === variantId ? { ...item, quantity: nextQuantity } : item
    )
  );
}

export function removeCartItem(variantId: string) {
  writeCartItems(readCartItems().filter((item) => item.variantId !== variantId));
}

export function getCartSubtotal(items = readCartItems()) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}

export function getCartCount(items = readCartItems()) {
  return items.reduce((total, item) => total + item.quantity, 0);
}
