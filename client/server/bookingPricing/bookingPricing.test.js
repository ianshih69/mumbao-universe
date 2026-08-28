import { describe, expect, it } from "vitest";
import {
  calculateBookingQuote,
  classifyFallbackDayType,
  resolveBookingGuestPlan,
  resolvePricingGuestCount,
  roundMoney,
} from "./index.js";

const trialRuleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "試營運包棟房價",
  effective_from: "2026-11-01",
  effective_to: "2027-02-01",
  deposit_rate: 0.3,
  is_active: true,
};

const matrix = {
  10: { weekday: 25000, friday: 32000, holiday: 39000 },
  11: { weekday: 26250, friday: 33250, holiday: 40250 },
  12: { weekday: 27500, friday: 34500, holiday: 41500 },
  13: { weekday: 28750, friday: 35750, holiday: 42750 },
  14: { weekday: 30000, friday: 37000, holiday: 44000 },
  15: { weekday: 31250, friday: 38250, holiday: 45250 },
  16: { weekday: 32500, friday: 39500, holiday: 46500 },
  17: { weekday: 33750, friday: 40750, holiday: 47750 },
  18: { weekday: 35000, friday: 42000, holiday: 49000 },
};

function makeRateRows(customMatrix = matrix) {
  return Object.entries(customMatrix).flatMap(([guestCount, dayPrices]) =>
    Object.entries(dayPrices).map(([dayType, price]) => ({
      id: `${guestCount}-${dayType}`,
      rule_set_id: trialRuleSet.id,
      guest_count: Number(guestCount),
      day_type: dayType,
      nightly_price: price,
      is_active: true,
    }))
  );
}

function createMockSupabaseRequest({
  ruleSets = [trialRuleSet],
  rates = makeRateRows(),
  specialDates = [],
} = {}) {
  return async function supabaseRequest(pathname) {
    const url = new URL(`https://example.test${pathname}`);
    const table = url.pathname.slice(1);
    if (table === "booking_price_rule_sets") {
      const date = String(url.searchParams.get("effective_from") || "").replace(/^lte\./, "");
      return ruleSets
        .filter((ruleSet) => ruleSet.is_active)
        .filter((ruleSet) => ruleSet.effective_from <= date && ruleSet.effective_to >= date)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
        .slice(0, 1);
    }
    if (table === "booking_special_dates") {
      const ruleSetId = String(url.searchParams.get("rule_set_id") || "").replace(/^eq\./, "");
      const date = String(url.searchParams.get("date") || "").replace(/^eq\./, "");
      return specialDates
        .filter((specialDate) => specialDate.rule_set_id === ruleSetId)
        .filter((specialDate) => specialDate.date === date)
        .filter((specialDate) => specialDate.is_active !== false)
        .slice(0, 1);
    }
    if (table === "booking_package_rates") {
      const ruleSetId = String(url.searchParams.get("rule_set_id") || "").replace(/^eq\./, "");
      const guestCount = Number(String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""));
      const dayType = String(url.searchParams.get("day_type") || "").replace(/^eq\./, "");
      return rates
        .filter((rate) => rate.rule_set_id === ruleSetId)
        .filter((rate) => rate.guest_count === guestCount)
        .filter((rate) => rate.day_type === dayType)
        .filter((rate) => rate.is_active !== false)
        .slice(0, 1);
    }
    throw new Error(`Unexpected Supabase path: ${pathname}`);
  };
}

async function quote(input, options) {
  return calculateBookingQuote(
    {
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
      stayType: "villa",
      adults: 10,
      children: 0,
      infants: 0,
      packageType: "villa_10",
      ...input,
    },
    { supabaseRequest: createMockSupabaseRequest(options) }
  );
}

describe("bookingPricing", () => {
  it("classifies fallback day types by charged night date", () => {
    expect(classifyFallbackDayType("2026-11-02")).toBe("weekday");
    expect(classifyFallbackDayType("2026-11-06")).toBe("friday");
    expect(classifyFallbackDayType("2026-11-07")).toBe("holiday");
  });

  it("rounds monetary calculations to whole TWD", () => {
    expect(roundMoney(26250 * 0.95)).toBe(24938);
  });

  it("maps adult guests to package-specific pricing rows and room plans", () => {
    expect(resolvePricingGuestCount(1, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 10, extraBedCount: 0 });
    expect(resolvePricingGuestCount(10, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 10, extraBedCount: 0 });
    expect(resolvePricingGuestCount(17, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 17, extraBedCount: 0 });
    expect(resolvePricingGuestCount(18, "villa_10")).toMatchObject({
      ok: false,
      reason: "guest_count_requires_full_villa",
      pricingGuestCount: null,
    });
    expect(resolvePricingGuestCount(2, "villa_18")).toMatchObject({
      ok: false,
      reason: "full_villa_requires_18_guests",
      pricingGuestCount: null,
    });
    expect(resolvePricingGuestCount(18, "villa_18")).toMatchObject({ ok: true, pricingGuestCount: 18, extraBedCount: 0 });
    expect(resolvePricingGuestCount(19, "villa_18")).toMatchObject({
      ok: true,
      pricingGuestCount: 19,
      rateGuestCount: 18,
      extraAdultCount: 1,
      extraAdultUnitPrice: 800,
      singleBedCount: 1,
      sleepCapacity: 19,
    });
    expect(resolvePricingGuestCount(20, "villa_18")).toMatchObject({
      ok: true,
      pricingGuestCount: 20,
      rateGuestCount: 18,
      extraAdultCount: 2,
      extraAdultUnitPrice: 800,
      singleBedCount: 2,
      sleepCapacity: 20,
    });
    expect(resolvePricingGuestCount(21, "villa_18")).toMatchObject({
      ok: false,
      reason: "adult_count_exceeds_capacity",
      pricingGuestCount: null,
    });
    expect(resolvePricingGuestCount(19, "villa_10")).toMatchObject({
      ok: false,
      reason: "guest_count_requires_full_villa",
      pricingGuestCount: null,
    });
  });

  it("returns exact villa_10 weekday and friday prices without using a formula", async () => {
    await expect(quote({ adults: 8, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 25000, depositAmount: 7500, balanceAmount: 17500 },
    });
    await expect(quote({ adults: 12, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      pricingGuestCount: 12,
      pricing: { total: 27500 },
    });
    await expect(quote({ adults: 17, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      pricingGuestCount: 17,
      pricing: { total: 33750 },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      pricing: { total: 32000 },
    });
  });

  it("enforces package availability by guest count only", async () => {
    await expect(quote({ adults: 2, packageType: "villa_10", checkIn: "2026-11-01", checkOut: "2026-11-02" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 25000 },
    });
    await expect(quote({ adults: 2, packageType: "villa_18", checkIn: "2026-11-01", checkOut: "2026-11-02" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
    });
    await expect(quote({ adults: 10, packageType: "villa_18", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 17, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
    });
    await expect(quote({ adults: 17, packageType: "villa_18", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 18, packageType: "villa_18", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 18,
      pricing: { total: 35000 },
    });
    await expect(quote({ adults: 18, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "guest_count_requires_full_villa" },
    });
    await expect(quote({ adults: 2, packageType: "villa_10", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 39000 },
    });
    await expect(quote({ adults: 2, packageType: "villa_18", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 39000 },
    });
    await expect(quote({ adults: 10, packageType: "villa_18", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 15, packageType: "villa_10", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 15,
      pricing: { total: 45250 },
    });
    await expect(quote({ adults: 17, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
      pricing: { total: 40750 },
    });
    await expect(quote({ adults: 17, packageType: "villa_18", checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
    await expect(quote({ adults: 17, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
      pricing: { total: 88500 },
    });
    await expect(quote({ adults: 17, packageType: "villa_18", checkIn: "2026-11-06", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "full_villa_requires_18_guests" },
    });
  });

  it("returns exact 18 person weekday, friday, and holiday prices", async () => {
    await expect(quote({ adults: 18, packageType: "villa_18", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      pricingGuestCount: 18,
      pricing: { total: 35000 },
    });
    await expect(quote({ adults: 18, packageType: "villa_18", checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      pricing: { total: 42000 },
    });
    await expect(quote({ adults: 18, packageType: "villa_18", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      pricing: { total: 49000 },
    });
  });

  it("keeps the 10 person package as a minimum charge, not a minimum guest count", async () => {
    const oneAdult = await quote({ adults: 1, children: 0, packageType: "villa_10" });
    expect(oneAdult).toMatchObject({
      status: "resolved",
      guestCount: 1,
      pricingGuestCount: 10,
      pricing: {
        total: 25000,
        roomPlanHeadcount: 10,
        doubleBedCount: 5,
        roomCountMin: 3,
        roomCountMax: 3,
        selectedRoomOptionId: "2q1d",
        selectedRoomOption: {
          id: "2q1d",
          quadRoomCount: 2,
          doubleRoomCount: 1,
          roomCount: 3,
        },
      },
    });
    expect(oneAdult.pricing.roomOptions).toHaveLength(1);

    const twoAdults = await quote({ adults: 2, children: 0, packageType: "villa_10" });
    expect(twoAdults).toMatchObject({
      status: "resolved",
      guestCount: 2,
      pricingGuestCount: 10,
      pricing: {
        total: 25000,
        roomCountMin: 3,
        roomCountMax: 3,
        selectedRoomOptionId: "2q1d",
      },
    });
    expect(twoAdults.pricing.roomOptions).toHaveLength(1);

    const fiveAdultsTwoChildren = await quote({ adults: 5, children: 2, packageType: "villa_10" });
    expect(fiveAdultsTwoChildren).toMatchObject({
      status: "resolved",
      guestCount: 7,
      pricingGuestCount: 10,
      pricing: {
        total: 25000,
        chargeableChildCount: 0,
        childFeeTotal: 0,
        roomCountMin: 3,
        roomCountMax: 3,
        selectedRoomOptionId: "2q1d",
      },
    });
    expect(fiveAdultsTwoChildren.pricing.roomOptions).toHaveLength(1);
  });

  it("calculates non-bed child fees without changing adult pricing rows or room plans", async () => {
    const caseA = await quote({ adults: 8, children: 2, packageType: "villa_10" });
    expect(caseA).toMatchObject({
      status: "resolved",
      guestCount: 10,
      pricingGuestCount: 10,
      pricing: {
        chargeableChildCount: 0,
        childFeeTotal: 0,
        roomPlanHeadcount: 10,
        doubleBedCount: 5,
        roomCountMin: 3,
        roomCountMax: 4,
        selectedRoomOptionId: "2q1d",
        total: 25000,
      },
    });
    expect(caseA.pricing.roomOptions.map((option) => option.id)).toEqual(["2q1d", "1q3d"]);

    const caseB = await quote({ adults: 8, children: 3, packageType: "villa_10" });
    expect(caseB).toMatchObject({
      status: "resolved",
      guestCount: 11,
      pricingGuestCount: 10,
      pricing: {
        chargeableChildCount: 1,
        childFeeUnitPrice: 500,
        childFeeTotal: 500,
        roomPlanHeadcount: 10,
        doubleBedCount: 5,
        roomCountMin: 3,
        roomCountMax: 4,
        selectedRoomOptionId: "2q1d",
        total: 25500,
      },
    });
    expect(caseB.pricing.roomOptions.map((option) => option.id)).toEqual(["2q1d", "1q3d"]);
    expect(caseB.pricing.breakdown[0]).toMatchObject({
      baseGuestCount: 10,
      basePrice: 25000,
      chargeableChildCount: 1,
      childFeeUnitPrice: 500,
      childFeeAmount: 500,
      roomPlanHeadcount: 10,
      doubleBedCount: 5,
      roomCountMin: 3,
      roomCountMax: 4,
      price: 25500,
    });

    const caseC = await quote({ adults: 8, children: 3, packageType: "villa_10", checkIn: "2026-11-05", checkOut: "2026-11-07" });
    expect(caseC.pricing.childFeeTotal).toBe(1000);

    const caseD = await quote({ adults: 10, children: 3, packageType: "villa_10", checkIn: "2026-11-05", checkOut: "2026-11-07" });
    expect(caseD).toMatchObject({
      pricingGuestCount: 10,
      pricing: {
        chargeableChildCount: 3,
        childFeeTotal: 3000,
        roomPlanHeadcount: 10,
        doubleBedCount: 5,
        roomCountMin: 3,
        roomCountMax: 4,
      },
    });

    const caseE = await quote({ adults: 11, children: 2, packageType: "villa_10" });
    expect(caseE).toMatchObject({
      pricingGuestCount: 11,
      pricing: {
        total: 27250,
        chargeableChildCount: 2,
        childFeeTotal: 1000,
        roomPlanHeadcount: 11,
        doubleBedCount: 6,
        roomCountMin: 3,
        roomCountMax: 4,
        selectedRoomOptionId: "3q",
      },
    });
    expect(caseE.pricing.roomOptions.map((option) => option.id)).toEqual(["3q", "2q2d"]);
  });

  it("maps adult room-plan tiers from 10 through 20", () => {
    const cases = [
      { adults: 10, doubleBedCount: 5, roomCountMin: 3, roomCountMax: 4 },
      { adults: 11, doubleBedCount: 6, roomCountMin: 3, roomCountMax: 4 },
      { adults: 12, doubleBedCount: 6, roomCountMin: 3, roomCountMax: 4 },
      { adults: 13, doubleBedCount: 7, roomCountMin: 4, roomCountMax: 5 },
      { adults: 14, doubleBedCount: 7, roomCountMin: 4, roomCountMax: 5 },
      { adults: 15, doubleBedCount: 8, roomCountMin: 5, roomCountMax: 5 },
      { adults: 16, doubleBedCount: 8, roomCountMin: 5, roomCountMax: 5 },
      { adults: 17, doubleBedCount: 9, singleBedCount: 0, roomCountMin: 6, roomCountMax: 6 },
      { adults: 18, doubleBedCount: 9, singleBedCount: 0, roomCountMin: 6, roomCountMax: 6 },
      { adults: 19, doubleBedCount: 9, singleBedCount: 1, roomCountMin: 6, roomCountMax: 6 },
      { adults: 20, doubleBedCount: 9, singleBedCount: 2, roomCountMin: 6, roomCountMax: 6 },
    ];

    for (const testCase of cases) {
      expect(resolveBookingGuestPlan({ adults: testCase.adults })).toMatchObject({
        roomPlanHeadcount: testCase.adults,
        doubleBedCount: testCase.doubleBedCount,
        singleBedCount: testCase.singleBedCount ?? 0,
        roomCountMin: testCase.roomCountMin,
        roomCountMax: testCase.roomCountMax,
      });
    }
  });

  it("maps room option combinations for each room plan", () => {
    const cases = [
      { adults: 10, optionIds: ["2q1d", "1q3d"], defaultId: "2q1d", roomCounts: [3, 4] },
      { adults: 11, optionIds: ["3q", "2q2d"], defaultId: "3q", roomCounts: [3, 4] },
      { adults: 12, optionIds: ["3q", "2q2d"], defaultId: "3q", roomCounts: [3, 4] },
      { adults: 13, optionIds: ["3q1d", "2q3d"], defaultId: "3q1d", roomCounts: [4, 5] },
      { adults: 14, optionIds: ["3q1d", "2q3d"], defaultId: "3q1d", roomCounts: [4, 5] },
      { adults: 15, optionIds: ["3q2d"], defaultId: "3q2d", roomCounts: [5] },
      { adults: 16, optionIds: ["3q2d"], defaultId: "3q2d", roomCounts: [5] },
      { adults: 17, optionIds: ["3q3d"], defaultId: "3q3d", roomCounts: [6] },
      { adults: 18, optionIds: ["3q3d"], defaultId: "3q3d", roomCounts: [6] },
      { adults: 19, optionIds: ["3q3d1s"], defaultId: "3q3d1s", roomCounts: [6] },
      { adults: 20, optionIds: ["3q3d2s"], defaultId: "3q3d2s", roomCounts: [6] },
    ];

    for (const testCase of cases) {
      const plan = resolveBookingGuestPlan({ adults: testCase.adults });
      expect(plan.defaultRoomOptionId).toBe(testCase.defaultId);
      expect(plan.roomOptions.map((option) => option.id)).toEqual(testCase.optionIds);
      expect(plan.roomOptions.map((option) => option.roomCount)).toEqual(testCase.roomCounts);
    }
  });

  it("keeps room option selection separate from pricing and rejects invalid options", async () => {
    const defaultOption = await quote({ adults: 11, children: 2, packageType: "villa_10" });
    const alternativeOption = await quote({ adults: 11, children: 2, packageType: "villa_10", selectedRoomOptionId: "2q2d" });

    expect(defaultOption).toMatchObject({
      status: "resolved",
      pricing: {
        total: 27250,
        selectedRoomOptionId: "3q",
        selectedRoomOption: {
          quadRoomCount: 3,
          doubleRoomCount: 0,
          roomCount: 3,
        },
      },
    });
    expect(alternativeOption).toMatchObject({
      status: "resolved",
      pricing: {
        total: 27250,
        selectedRoomOptionId: "2q2d",
        selectedRoomOption: {
          quadRoomCount: 2,
          doubleRoomCount: 2,
          roomCount: 4,
        },
      },
    });
    expect(alternativeOption.pricing.total).toBe(defaultOption.pricing.total);
    expect(alternativeOption.pricing.depositAmount).toBe(defaultOption.pricing.depositAmount);
    expect(alternativeOption.pricing.balanceAmount).toBe(defaultOption.pricing.balanceAmount);

    await expect(quote({ adults: 11, packageType: "villa_10", selectedRoomOptionId: "2q3d" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "invalid_room_option" },
    });

    const thirteenAdults = resolveBookingGuestPlan({ adults: 13 });
    expect(thirteenAdults.defaultRoomOptionId).toBe("3q1d");
    expect(thirteenAdults.roomOptions.some((option) => option.id === "2q2d")).toBe(false);
  });

  it("allows infants beyond pricing caps and prices 19/20 adults from the 18 adult base rate", async () => {
    await expect(quote({ adults: 18, children: 2, packageType: "villa_18" })).resolves.toMatchObject({
      status: "resolved",
      guestCount: 20,
      pricingGuestCount: 18,
      pricing: {
        chargeableChildCount: 2,
        childFeeTotal: 1000,
        roomPlanHeadcount: 18,
        doubleBedCount: 9,
        roomCountMin: 6,
        roomCountMax: 6,
        total: 36000,
      },
    });
    await expect(quote({ adults: 18, children: 2, infants: 1, packageType: "villa_18" })).resolves.toMatchObject({
      status: "resolved",
      guestCount: 21,
      pricingGuestCount: 18,
      pricing: {
        infantCount: 1,
        chargeableChildCount: 2,
        childFeeTotal: 1000,
        total: 36000,
      },
    });
    await expect(quote({ adults: 19, packageType: "villa_18" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 19,
      pricing: {
        total: 35800,
        depositAmount: 10740,
        balanceAmount: 25060,
        extraAdultCount: 1,
        extraAdultUnitPrice: 800,
        extraAdultFeeTotal: 800,
        singleBedCount: 1,
        sleepCapacity: 19,
      },
    });
    await expect(quote({ adults: 20, packageType: "villa_18" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 20,
      pricing: {
        total: 36600,
        depositAmount: 10980,
        balanceAmount: 25620,
        extraAdultCount: 2,
        extraAdultUnitPrice: 800,
        extraAdultFeeTotal: 1600,
        singleBedCount: 2,
        sleepCapacity: 20,
      },
    });
    await expect(quote({ adults: 21, packageType: "villa_18" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "adult_count_exceeds_capacity" },
    });
  });

  it("covers every 11-17 matrix entry", async () => {
    for (const guestCount of [11, 12, 13, 14, 15, 16, 17]) {
      await expect(quote({ adults: guestCount, checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
        pricingGuestCount: guestCount,
        pricing: { total: matrix[guestCount].weekday },
      });
      await expect(quote({ adults: guestCount, checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
        pricing: { total: matrix[guestCount].friday },
      });
    }
  });

  it("keeps villa_10 available across Saturday stay nights for 1-17 guests", async () => {
    await expect(quote({ adults: 18, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "guest_count_requires_full_villa" },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 39000 },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 71000 },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      status: "resolved",
      pricing: { total: 32000 },
    });
  });

  it("calculates multi-night totals and does not charge checkout date", async () => {
    const result = await quote({ checkIn: "2026-11-05", checkOut: "2026-11-07" });
    expect(result.pricing.breakdown.map((night) => night.date)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(result.pricing.total).toBe(57000);
    expect(result.pricing.depositAmount).toBe(17100);
    expect(result.pricing.balanceAmount).toBe(39900);

    const oneNight = await quote({ checkIn: "2026-11-05", checkOut: "2026-11-06" });
    expect(oneNight.pricing.breakdown.map((night) => night.date)).toEqual(["2026-11-05"]);
    expect(oneNight.pricing).toMatchObject({
      total: 25000,
      depositAmount: 7500,
      balanceAmount: 17500,
    });
  });

  it("calculates a 30% deposit and 70% balance for custom totals", async () => {
    const customMatrix = { ...matrix, 10: { ...matrix[10], weekday: 48750 } };
    const result = await quote(
      { adults: 10, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" },
      { rates: makeRateRows(customMatrix) }
    );

    expect(result.pricing).toMatchObject({
      total: 48750,
      depositRate: 0.3,
      depositAmount: 14625,
      balanceAmount: 34125,
    });
    expect(result.pricing.depositAmount + result.pricing.balanceAmount).toBe(result.pricing.total);
  });

  it("applies the 95% weekday consecutive-stay discount to the second night only", async () => {
    const result = await quote({ checkIn: "2026-11-02", checkOut: "2026-11-05" });

    expect(result.pricing.breakdown.map((night) => night.price)).toEqual([25000, 23750, 25000]);
    expect(result.pricing.breakdown[0]).toMatchObject({
      date: "2026-11-02",
      dayType: "weekday",
      preDiscountPrice: 25000,
      discountType: null,
      discountRate: 1,
      discountAmount: 0,
      price: 25000,
    });
    expect(result.pricing.breakdown[1]).toMatchObject({
      date: "2026-11-03",
      dayType: "weekday",
      preDiscountPrice: 25000,
      discountType: "weekday_second_night_95",
      discountRate: 0.95,
      discountAmount: 1250,
      price: 23750,
    });
    expect(result.pricing.breakdown[2]).toMatchObject({
      date: "2026-11-04",
      discountType: null,
      discountRate: 1,
      discountAmount: 0,
      price: 25000,
    });
    expect(result.pricing.total).toBe(73750);
    expect(result.pricing.depositAmount).toBe(22125);
    expect(result.pricing.balanceAmount).toBe(51625);
  });

  it("rounds second-night discounts to whole TWD", async () => {
    const result = await quote({
      adults: 11,
      packageType: "villa_10",
      checkIn: "2026-11-02",
      checkOut: "2026-11-04",
    });

    expect(result.pricing.breakdown.map((night) => night.price)).toEqual([26250, 24938]);
    expect(result.pricing.breakdown[1]).toMatchObject({
      preDiscountPrice: 26250,
      discountType: "weekday_second_night_95",
      discountRate: 0.95,
      discountAmount: 1312,
      price: 24938,
    });
    expect(result.pricing.total).toBe(51188);
    expect(result.pricing.depositAmount).toBe(15356);
    expect(result.pricing.balanceAmount).toBe(35832);
  });

  it("does not apply the weekday consecutive-stay discount to Sunday starts, Fridays, or special-date overrides", async () => {
    const sundayStart = await quote({ checkIn: "2026-11-01", checkOut: "2026-11-03" });
    expect(sundayStart.pricing.breakdown.map((night) => night.price)).toEqual([25000, 25000]);
    expect(sundayStart.pricing.breakdown.map((night) => night.discountType)).toEqual([null, null]);

    const thursdayFriday = await quote({ checkIn: "2026-11-05", checkOut: "2026-11-07" });
    expect(thursdayFriday.pricing.breakdown.map((night) => night.price)).toEqual([25000, 32000]);
    expect(thursdayFriday.pricing.breakdown.map((night) => night.discountType)).toEqual([null, null]);

    const specialDateSecondNight = await quote(
      { checkIn: "2026-11-02", checkOut: "2026-11-04" },
      {
        specialDates: [
          {
            id: "special-2",
            rule_set_id: trialRuleSet.id,
            date: "2026-11-03",
            day_type: "holiday",
            label: "Manual holiday",
            is_active: true,
          },
        ],
      }
    );
    expect(specialDateSecondNight.pricing.breakdown.map((night) => night.price)).toEqual([25000, 39000]);
    expect(specialDateSecondNight.pricing.breakdown[1]).toMatchObject({
      dayType: "holiday",
      specialDateLabel: "Manual holiday",
      discountType: null,
      discountAmount: 0,
    });
  });

  it("charges non-bed children per night for multi-night quotes", async () => {
    const result = await quote({
      adults: 18,
      children: 2,
      packageType: "villa_18",
      checkIn: "2026-11-05",
      checkOut: "2026-11-07",
    });

    expect(result.pricing.breakdown.map((night) => night.date)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(result.pricing.breakdown.map((night) => night.price)).toEqual([36000, 43000]);
    expect(result.pricing.breakdown).toEqual([
      expect.objectContaining({
        dayType: "weekday",
        baseGuestCount: 18,
        basePrice: 35000,
        chargeableChildCount: 2,
        childFeeUnitPrice: 500,
        childFeeAmount: 1000,
        price: 36000,
      }),
      expect.objectContaining({
        dayType: "friday",
        baseGuestCount: 18,
        basePrice: 42000,
        chargeableChildCount: 2,
        childFeeUnitPrice: 500,
        childFeeAmount: 1000,
        price: 43000,
      }),
    ]);
    expect(result.pricing.childFeeTotal).toBe(2000);
    expect(result.pricing.total).toBe(79000);
    expect(result.pricing.depositAmount).toBe(23700);
    expect(result.pricing.balanceAmount).toBe(55300);
    expect(result.pricing.depositAmount + result.pricing.balanceAmount).toBe(result.pricing.total);
  });

  it("charges 19/20 adult extra fees from the 18 adult base rate per night", async () => {
    const nineteenAdults = await quote({
      adults: 19,
      packageType: "villa_18",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
    });
    expect(nineteenAdults).toMatchObject({
      status: "resolved",
      pricingGuestCount: 19,
      pricing: {
        total: 35800,
        depositAmount: 10740,
        balanceAmount: 25060,
        extraAdultCount: 1,
        extraAdultUnitPrice: 800,
        extraAdultFeeTotal: 800,
      },
    });
    expect(nineteenAdults.pricing.breakdown[0]).toMatchObject({
      baseGuestCount: 18,
      basePrice: 35000,
      extraAdultCount: 1,
      extraAdultUnitPrice: 800,
      extraAdultFeeAmount: 800,
      chargeableChildCount: 0,
      childFeeAmount: 0,
      price: 35800,
    });

    const twentyAdults = await quote({
      adults: 20,
      packageType: "villa_18",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
    });
    expect(twentyAdults).toMatchObject({
      status: "resolved",
      pricingGuestCount: 20,
      pricing: {
        total: 36600,
        depositAmount: 10980,
        balanceAmount: 25620,
        extraAdultCount: 2,
        extraAdultUnitPrice: 800,
        extraAdultFeeTotal: 1600,
      },
    });
    expect(twentyAdults.pricing.breakdown[0]).toMatchObject({
      baseGuestCount: 18,
      basePrice: 35000,
      extraAdultCount: 2,
      extraAdultUnitPrice: 800,
      extraAdultFeeAmount: 1600,
      price: 36600,
    });
  });

  it("keeps adult extra fees separate from child fees", async () => {
    const result = await quote({
      adults: 19,
      children: 2,
      packageType: "villa_18",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
    });

    expect(result).toMatchObject({
      status: "resolved",
      pricingGuestCount: 19,
      pricing: {
        total: 36800,
        depositAmount: 11040,
        balanceAmount: 25760,
        extraAdultCount: 1,
        extraAdultUnitPrice: 800,
        extraAdultFeeTotal: 800,
        chargeableChildCount: 2,
        childFeeUnitPrice: 500,
        childFeeTotal: 1000,
      },
    });
    expect(result.pricing.breakdown[0]).toMatchObject({
      baseGuestCount: 18,
      basePrice: 35000,
      extraAdultCount: 1,
      extraAdultFeeAmount: 800,
      chargeableChildCount: 2,
      childFeeAmount: 1000,
      price: 36800,
    });
  });

  it("breaks down regular adult increments from the 10 and 18 adult rates", async () => {
    const result = await quote({
      adults: 17,
      children: 7,
      packageType: "villa_10",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
    });

    expect(result).toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
      pricing: {
        total: 37250,
        depositAmount: 11175,
        balanceAmount: 26075,
        regularExtraAdultCount: 7,
        regularExtraAdultFeeTotal: 8750,
        chargeableChildCount: 7,
        childFeeTotal: 3500,
      },
    });
    expect(result.pricing.breakdown[0]).toMatchObject({
      adultRateBreakdownStatus: "resolved",
      base10GuestRate: 25000,
      adult18GuestRate: 35000,
      adultIncrementRate: 1250,
      regularExtraAdultCount: 7,
      regularExtraAdultFeeAmount: 8750,
      extraBedAdultCount: 0,
      extraBedAdultFeeAmount: 0,
      childFeeAmount: 3500,
      price: 37250,
    });

    const childOnlyExtra = await quote({
      adults: 8,
      children: 3,
      packageType: "villa_10",
      checkIn: "2026-11-02",
      checkOut: "2026-11-03",
    });
    expect(childOnlyExtra).toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: {
        total: 25500,
        regularExtraAdultCount: 0,
        regularExtraAdultFeeTotal: 0,
        chargeableChildCount: 1,
        childFeeTotal: 500,
      },
    });
    expect(childOnlyExtra.pricing.breakdown[0]).toMatchObject({
      base10GuestRate: 25000,
      regularExtraAdultCount: 0,
      regularExtraAdultFeeAmount: 0,
      childFeeAmount: 500,
      price: 25500,
    });
  });

  it("calculates regular adult increment rates per night without hardcoding 1250", async () => {
    const customMatrix = {
      ...matrix,
      10: { ...matrix[10], friday: 40000, holiday: 48000 },
      12: { ...matrix[12], friday: 43000, holiday: 50000 },
      18: { ...matrix[18], friday: 52000, holiday: 56000 },
    };
    const result = await quote(
      {
        adults: 12,
        packageType: "villa_10",
        checkIn: "2026-11-06",
        checkOut: "2026-11-08",
      },
      { rates: makeRateRows(customMatrix) }
    );

    expect(result.pricing.total).toBe(93000);
    expect(result.pricing.breakdown).toEqual([
      expect.objectContaining({
        date: "2026-11-06",
        dayType: "friday",
        base10GuestRate: 40000,
        adult18GuestRate: 52000,
        adultIncrementRate: 1500,
        regularExtraAdultCount: 2,
        regularExtraAdultFeeAmount: 3000,
        price: 43000,
      }),
      expect.objectContaining({
        date: "2026-11-07",
        dayType: "holiday",
        base10GuestRate: 48000,
        adult18GuestRate: 56000,
        adultIncrementRate: 1000,
        regularExtraAdultCount: 2,
        regularExtraAdultFeeAmount: 2000,
        price: 50000,
      }),
    ]);
  });

  it("falls back to the official adult package price when the display breakdown does not match the DB matrix", async () => {
    const customMatrix = {
      ...matrix,
      18: { ...matrix[18], weekday: 36000 },
    };
    const result = await quote(
      {
        adults: 17,
        packageType: "villa_10",
        checkIn: "2026-11-02",
        checkOut: "2026-11-03",
      },
      { rates: makeRateRows(customMatrix) }
    );

    expect(result).toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
      pricing: { total: 33750 },
    });
    expect(result.pricing.breakdown[0]).toMatchObject({
      adultRateBreakdownStatus: "fallback",
      base10GuestRate: null,
      adultIncrementRate: null,
      regularExtraAdultCount: 0,
      regularExtraAdultFeeAmount: 0,
      formalAdultGuestCount: 17,
      formalAdultPrice: 33750,
      price: 33750,
    });
  });

  it("charges 19/20 adult extra fees once per stay night", async () => {
    const nineteenAdults = await quote({
      adults: 19,
      packageType: "villa_18",
      checkIn: "2026-11-05",
      checkOut: "2026-11-07",
    });
    expect(nineteenAdults.pricing.breakdown.map((night) => night.price)).toEqual([35800, 42800]);
    expect(nineteenAdults.pricing.extraAdultFeeTotal).toBe(1600);
    expect(nineteenAdults.pricing.total).toBe(78600);
    expect(nineteenAdults.pricing.depositAmount).toBe(23580);
    expect(nineteenAdults.pricing.balanceAmount).toBe(55020);
    expect(nineteenAdults.pricing.depositAmount + nineteenAdults.pricing.balanceAmount).toBe(nineteenAdults.pricing.total);

    const twentyAdults = await quote({
      adults: 20,
      children: 9,
      packageType: "villa_18",
      checkIn: "2026-11-05",
      checkOut: "2026-11-07",
    });
    expect(twentyAdults.pricing.breakdown.map((night) => night.price)).toEqual([41100, 48100]);
    expect(twentyAdults.pricing.extraAdultFeeTotal).toBe(3200);
    expect(twentyAdults.pricing.childFeeTotal).toBe(9000);
    expect(twentyAdults.pricing.total).toBe(89200);
    expect(twentyAdults.pricing.depositAmount + twentyAdults.pricing.balanceAmount).toBe(twentyAdults.pricing.total);
  });

  it("keeps non-bed child fees separate from the second-night weekday discount", async () => {
    const result = await quote({
      adults: 8,
      children: 3,
      packageType: "villa_10",
      checkIn: "2026-11-02",
      checkOut: "2026-11-04",
    });

    expect(result.pricing.breakdown).toEqual([
      expect.objectContaining({
        date: "2026-11-02",
        dayType: "weekday",
        baseGuestCount: 10,
        basePrice: 25000,
        chargeableChildCount: 1,
        childFeeUnitPrice: 500,
        childFeeAmount: 500,
        preDiscountPrice: 25500,
        discountType: null,
        discountRate: 1,
        discountAmount: 0,
        price: 25500,
      }),
      expect.objectContaining({
        date: "2026-11-03",
        dayType: "weekday",
        baseGuestCount: 10,
        basePrice: 25000,
        chargeableChildCount: 1,
        childFeeUnitPrice: 500,
        childFeeAmount: 500,
        preDiscountPrice: 25500,
        discountType: "weekday_second_night_95",
        discountRate: 0.95,
        discountAmount: 1250,
        price: 24250,
      }),
    ]);
    expect(result.pricing.childFeeTotal).toBe(1000);
    expect(result.pricing.total).toBe(49750);
    expect(result.pricing.depositAmount).toBe(14925);
    expect(result.pricing.balanceAmount).toBe(34825);
    expect(result.pricing.depositAmount + result.pricing.balanceAmount).toBe(result.pricing.total);
  });

  it("uses active special date override before weekday fallback", async () => {
    const result = await quote(
      { checkIn: "2026-11-02", checkOut: "2026-11-03" },
      {
        specialDates: [
          {
            id: "special-1",
            rule_set_id: trialRuleSet.id,
            date: "2026-11-02",
            day_type: "holiday",
            label: "Manual holiday",
            is_active: true,
          },
        ],
      }
    );
    expect(result.pricing.total).toBe(39000);
    expect(result.pricing.breakdown[0]).toMatchObject({
      dayType: "holiday",
      specialDateLabel: "Manual holiday",
    });

    const smallPackageResult = await quote(
      { adults: 17, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" },
      {
        specialDates: [
          {
            id: "special-17",
            rule_set_id: trialRuleSet.id,
            date: "2026-11-02",
            day_type: "holiday",
            label: "Manual holiday",
            is_active: true,
          },
        ],
      }
    );
    expect(smallPackageResult).toMatchObject({
      status: "resolved",
      pricingGuestCount: 17,
      pricing: { total: 47750 },
    });
  });

  it("returns unavailable outside active period", async () => {
    await expect(quote({ checkIn: "2026-10-30", checkOut: "2026-10-31" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "missing_rule_set" },
    });

    await expect(quote({ checkIn: "2026-11-01", checkOut: "2026-11-02" })).resolves.toMatchObject({
      status: "resolved",
      pricing: { total: 25000, depositAmount: 7500, balanceAmount: 17500 },
    });
  });

  it("returns unavailable when one charged night has no price", async () => {
    const customMatrix = { ...matrix, 10: { ...matrix[10] } };
    delete customMatrix[10].friday;
    const result = await quote(
      { checkIn: "2026-11-05", checkOut: "2026-11-07" },
      { rates: makeRateRows(customMatrix) }
    );
    expect(result).toMatchObject({
      status: "unavailable",
      pricing: {
        reason: "missing_nightly_rate",
        missingDate: "2026-11-06",
      },
    });
  });
});
