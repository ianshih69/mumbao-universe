export const shopTestPassword = "123";
export const shopTestStorageKey = "mumbao-shop-test-unlocked";

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function isShopTestPasswordValid(value: string) {
  return value.trim() === shopTestPassword;
}

export function isShopTestUnlocked(storage: Storage | null = getSessionStorage()) {
  try {
    return storage?.getItem(shopTestStorageKey) === "true";
  } catch {
    return false;
  }
}

export function markShopTestUnlocked(storage: Storage | null = getSessionStorage()) {
  try {
    storage?.setItem(shopTestStorageKey, "true");
  } catch {
    // Session storage may be unavailable in strict private modes.
  }
}

export function clearShopTestUnlocked(storage: Storage | null = getSessionStorage()) {
  try {
    storage?.removeItem(shopTestStorageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}
