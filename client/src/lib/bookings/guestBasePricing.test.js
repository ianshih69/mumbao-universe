import { describe, expect, it } from "vitest";
import { calculateGuestBasePrice, isValidGuestFee, isValidBasePriceOverride } from "./guestBasePricing.js";

describe("configured guest base pricing before existing discounts", () => {
  it.each([0,"0",-1,"-1",1.5,"", " ",true,[],{},undefined,10000001])("rejects invalid Base override %s", value => {
    expect(isValidBasePriceOverride(value)).toBe(false);
  });
  it.each([null,1,"1",25000,10000000])("accepts inherited or positive Base override %s", value => {
    expect(isValidBasePriceOverride(value)).toBe(true);
  });
  it.each([[10,25000],[11,26250],[15,31250],[18,35000],[19,35800],[20,36600]])("prices %i guests at %i", (guests, expected) => {
    expect(calculateGuestBasePrice(guests,25000,1250)).toBe(expected);
  });
  it.each([[18,37000],[19,37800],[20,38600]])("propagates a changed base to %i guests", (guests, expected) => {
    expect(calculateGuestBasePrice(guests,27000,1250)).toBe(expected);
  });
  it("uses the configured fee without changing the extra-bed fee", () => {
    expect(calculateGuestBasePrice(18,25000,1500)).toBe(37000);
    expect(calculateGuestBasePrice(19,25000,1500)).toBe(37800);
    expect(calculateGuestBasePrice(20,25000,1500)).toBe(38600);
  });
  it.each([null,undefined,""," ",true,-1,1.5,NaN,Infinity,"invalid",10000001])("rejects invalid or missing fee %s", fee => {
    expect(isValidGuestFee(fee)).toBe(false);
    expect(() => calculateGuestBasePrice(12,25000,fee)).toThrow();
  });
  it("accepts an explicit zero fee", () => {
    expect(calculateGuestBasePrice(20,25000,0)).toBe(26600);
  });
  it("rejects JSON containers instead of coercing them to money", () => {
    for (const value of [[], [1250], {}]) {
      expect(isValidGuestFee(value)).toBe(false);
      expect(() => calculateGuestBasePrice(12,25000,value)).toThrow();
    }
  });
});
