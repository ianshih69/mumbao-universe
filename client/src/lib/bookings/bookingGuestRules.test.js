import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bookingChildPolicyDescription, classifyBookingGuestAge, resolveBookingGuestPlan, resolvePackageAvailability } from "./bookingGuestRules.js";

describe("approved child age and fee policy", () => {
  it("uses the same age labels and infant guard in Booking UI", () => {
    const source = readFileSync(new URL("../../pages/Booking.tsx", import.meta.url), "utf8");
    expect(source).toContain("滿 {bookingGuestRules.adultMinAge} 歲以上");
    expect(source).toContain("{bookingGuestRules.childMinAge} 歲至未滿 {bookingGuestRules.adultMinAge} 歲");
    expect(source).toContain("未滿 {bookingGuestRules.childMinAge} 歲・不佔床免費，每次最多 {bookingGuestRules.maxFreeInfantCount} 位");
    expect(source).toContain("!guestPlan.isInfantCountSupported");
    expect(source).toContain("if (guestCountExceedsLimit)");
    expect(source).not.toMatch(/12 歲以上|4～11 歲|0～3 歲/);
  });
  it.each([[2, "infant"], [3, "child"], [5, "child"], [6, "adult"], [12, "adult"], [13, "adult"]])("classifies age %s as %s", (age, expected) => {
    expect(classifyBookingGuestAge(age)).toBe(expected);
  });
  it.each([-1, NaN, undefined, null, "6"])("rejects non-age value %s", (age) => {
    expect(classifyBookingGuestAge(age)).toBeNull();
  });
  it.each([1, 2])("allows %s free infants", (infants) => {
    expect(resolveBookingGuestPlan({ adults: 8, infants })).toMatchObject({ isInfantCountSupported: true, unsupportedReason: "" });
  });
  it.each([3, 5])("requires a product decision for %s infants instead of inventing a rate", (infants) => {
    expect(resolveBookingGuestPlan({ adults: 8, infants })).toMatchObject({ isInfantCountSupported: false, unsupportedReason: "infant_count_requires_confirmation" });
    expect(resolvePackageAvailability({ adults: 8, infants }, "villa_10")).toMatchObject({ ok: false, reason: "infant_count_requires_confirmation" });
  });
  it("charges every child, including below the minimum adult package", () => {
    expect(resolveBookingGuestPlan({ adults: 9, children: 1, nights: 1 })).toMatchObject({ chargeableChildCount: 1, childFeeUnitPrice: 500 });
    expect(resolveBookingGuestPlan({ adults: 8, children: 2, nights: 1 }).chargeableChildCount).toBe(2);
    expect(bookingChildPolicyDescription).toBe("未滿3歲不佔床免費，每次最多2位；3歲至未滿6歲不佔床每位每晚500元；滿6歲視同成人。");
  });
});
