import { describe, expect, it } from "vitest";
import { __testing } from "../../api/admin-bookings.js";

describe("admin booking stay completion reward helpers", () => {
  const booking = {
    id: "90000000-0000-4000-8000-000000000125",
    source: "official_site",
    partner_points_ledger_id: null,
  };
  const customerProfile = {
    id: "profile-customer",
    coupon_code: " PET001 ",
  };
  const diamondProfile = {
    customer_profile_id: "profile-diamond",
    exclusive_code: "PET001",
    partnership_status: "active",
  };

  it("calculates 5 percent partner points from reliable final lodging amount", () => {
    expect(__testing.parseFinalLodgingAmount("40000")).toBe(40000);
    expect(__testing.parseFinalLodgingAmount("40019")).toBe(40019);
    expect(__testing.calculatePartnerRewardPoints(40000)).toBe(2000);
    expect(__testing.calculatePartnerRewardPoints(40019)).toBe(2000);
    expect(__testing.parseFinalLodgingAmount("0")).toBe(null);
    expect(__testing.parseFinalLodgingAmount("-1")).toBe(null);
    expect(__testing.parseFinalLodgingAmount("40000.5")).toBe(null);
    expect(__testing.parseFinalLodgingAmount("")).toBe(null);
    expect(__testing.parseFinalLodgingAmount("not-a-number")).toBe(null);
    expect(__testing.parseFinalLodgingAmount(10000001)).toBe(null);
  });

  it("allows only explicit direct booking sources for partner points", () => {
    expect(__testing.isDirectBookingSource("official_site")).toBe(true);
    expect(__testing.isDirectBookingSource("website")).toBe(true);
    expect(__testing.isDirectBookingSource("line")).toBe(true);
    expect(__testing.isDirectBookingSource("phone")).toBe(true);
    expect(__testing.isDirectBookingSource("manual")).toBe(true);
    expect(__testing.isDirectBookingSource("admin")).toBe(true);
    expect(__testing.isDirectBookingSource("booking")).toBe(false);
    expect(__testing.isDirectBookingSource("booking_ical")).toBe(false);
    expect(__testing.isDirectBookingSource("airbnb")).toBe(false);
    expect(__testing.isDirectBookingSource("agoda")).toBe(false);
    expect(__testing.isDirectBookingSource("")).toBe(false);
    expect(__testing.isDirectBookingSource(null)).toBe(false);
    expect(__testing.isDirectBookingSource("offical_site")).toBe(false);
  });

  it("requires customer profile, coupon code, active diamond profile, and no previous reward", () => {
    expect(
      __testing.buildPartnerPointsEligibility({
        booking,
        customerProfile,
        diamondProfile,
        finalLodgingAmount: 40000,
        existingLedger: null,
      }),
    ).toMatchObject({
      eligible: true,
      points: 2000,
      reason: "eligible",
    });

    expect(
      __testing.buildPartnerPointsEligibility({
        booking: { ...booking, source: "booking" },
        customerProfile,
        diamondProfile,
        finalLodgingAmount: 40000,
        existingLedger: null,
      }),
    ).toMatchObject({ eligible: false, reason: "source_not_eligible" });

    expect(
      __testing.buildPartnerPointsEligibility({
        booking: { ...booking, source: "" },
        customerProfile,
        diamondProfile,
        finalLodgingAmount: 40000,
        existingLedger: null,
      }),
    ).toMatchObject({ eligible: false, reason: "source_not_eligible" });

    expect(
      __testing.buildPartnerPointsEligibility({
        booking,
        customerProfile: { ...customerProfile, coupon_code: "" },
        diamondProfile,
        finalLodgingAmount: 40000,
        existingLedger: null,
      }),
    ).toMatchObject({ eligible: false, reason: "missing_coupon_code" });

    expect(
      __testing.buildPartnerPointsEligibility({
        booking,
        customerProfile,
        diamondProfile: null,
        finalLodgingAmount: 40000,
        existingLedger: null,
      }),
    ).toMatchObject({ eligible: false, reason: "invalid_or_inactive_coupon_code" });

    expect(
      __testing.buildPartnerPointsEligibility({
        booking,
        customerProfile,
        diamondProfile,
        finalLodgingAmount: 40000,
        existingLedger: { id: "ledger-existing" },
      }),
    ).toMatchObject({ eligible: false, reason: "already_awarded" });
  });
});
