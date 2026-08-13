import { describe, expect, it } from "vitest";
import {
  clearShopTestUnlocked,
  isShopTestPasswordValid,
  isShopTestUnlocked,
  markShopTestUnlocked,
  shopTestStorageKey,
} from "./shopTestGate";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
}

describe("shop frontend test gate helpers", () => {
  it("uses an independent session storage key for the shop gate", () => {
    expect(shopTestStorageKey).toBe("mumbao-shop-test-unlocked");
    expect(shopTestStorageKey).not.toBe("mumbao_booking_test_unlocked_v1");
  });

  it("accepts only the test password", () => {
    expect(isShopTestPasswordValid("123")).toBe(true);
    expect(isShopTestPasswordValid(" 123 ")).toBe(true);
    expect(isShopTestPasswordValid("wrong")).toBe(false);
  });

  it("stores and clears the unlock state in session storage", () => {
    const storage = createMemoryStorage();

    expect(isShopTestUnlocked(storage)).toBe(false);

    markShopTestUnlocked(storage);
    expect(isShopTestUnlocked(storage)).toBe(true);
    expect(storage.getItem(shopTestStorageKey)).toBe("true");

    clearShopTestUnlocked(storage);
    expect(isShopTestUnlocked(storage)).toBe(false);
    expect(storage.getItem(shopTestStorageKey)).toBeNull();
  });

  it("fails closed when storage is unavailable", () => {
    expect(isShopTestUnlocked(null)).toBe(false);
  });
});
