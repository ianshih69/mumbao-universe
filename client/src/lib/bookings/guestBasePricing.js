import { bookingGuestRules } from "./bookingGuestRules.js";

export function isValidGuestFee(value) {
  return (typeof value === "number" || typeof value === "string") && value !== ""
    && (typeof value !== "string" || /^\d+$/.test(value))
    && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10000000;
}

export function isValidBasePriceOverride(value) {
  return value === null || (isValidGuestFee(value) && Number(value) > 0);
}

// This is the pre-discount lodging amount. Existing discount steps remain in bookingPricing.
export function calculateGuestBasePrice(guestCount, basePrice, guest11To18Fee) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > bookingGuestRules.maxAdultCount
    || !isValidGuestFee(basePrice) || !isValidGuestFee(guest11To18Fee)) {
    throw new Error("invalid_guest_base_pricing");
  }
  const regularCount = Math.max(0, Math.min(guestCount, bookingGuestRules.fullVillaAdultCount) - bookingGuestRules.basePackageGuestCount);
  const extraCount = Math.max(0, guestCount - bookingGuestRules.fullVillaAdultCount);
  return Number(basePrice) + regularCount * Number(guest11To18Fee) + extraCount * bookingGuestRules.extraAdultUnitPrice;
}
