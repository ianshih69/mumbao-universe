import { describe, expect, it } from "vitest";
import {
  consumeCustomerEmailVerificationSuccessNotice,
  customerAccountOrigin,
  customerEmailVerificationNoticeStorageKey,
  customerEmailVerificationSuccessMessage,
  getSafeAccountReturnTo,
  markCustomerEmailVerificationSuccessNotice,
  resolveCustomerLoginReturnTo,
} from "./customerAuthClient";

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

describe("customer login redirect helpers", () => {
  it("returns to the previous same-site page after a general login", () => {
    expect(
      resolveCustomerLoginReturnTo({
        referrer: `${customerAccountOrigin}/rooms/room-888-xinghuo?view=detail#gallery`,
      }),
    ).toBe("/rooms/room-888-xinghuo?view=detail#gallery");
  });

  it("returns to the booking flow with its path state intact", () => {
    expect(
      resolveCustomerLoginReturnTo({
        returnTo: "/booking?check_in=2026-11-20&check_out=2026-11-22&adults=4&pets=1#stay",
      }),
    ).toBe("/booking?check_in=2026-11-20&check_out=2026-11-22&adults=4&pets=1#stay");
  });

  it("sends member-center login entries to /account", () => {
    expect(resolveCustomerLoginReturnTo({ returnTo: "/account" })).toBe("/account");
  });

  it("falls back to the homepage when no return path is available", () => {
    expect(resolveCustomerLoginReturnTo({})).toBe("/");
  });

  it("rejects external URLs and forbidden account auth pages as return paths", () => {
    expect(resolveCustomerLoginReturnTo({ returnTo: "https://evil.example/booking" })).toBe("/");
    expect(resolveCustomerLoginReturnTo({ returnTo: "//evil.example/booking" })).toBe("/");
    expect(resolveCustomerLoginReturnTo({ returnTo: "/account/login?returnTo=/booking" })).toBe("/");
    expect(resolveCustomerLoginReturnTo({ returnTo: "/account/register" })).toBe("/");
    expect(resolveCustomerLoginReturnTo({ returnTo: "/account/reset-password" })).toBe("/");
    expect(getSafeAccountReturnTo("/admin/shop")).toBe("/");
  });

  it("stores the email verification success notice once for the homepage", () => {
    const storage = createMemoryStorage();

    markCustomerEmailVerificationSuccessNotice(storage);

    expect(storage.getItem(customerEmailVerificationNoticeStorageKey)).toBe(
      customerEmailVerificationSuccessMessage,
    );
    expect(consumeCustomerEmailVerificationSuccessNotice(storage)).toBe(
      "Email 驗證成功，歡迎加入慢慢蒔光。",
    );
    expect(consumeCustomerEmailVerificationSuccessNotice(storage)).toBe("");
  });
});
