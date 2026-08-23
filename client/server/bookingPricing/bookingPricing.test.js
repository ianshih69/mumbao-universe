import { describe, expect, it } from "vitest";
import {
  calculateBookingQuote,
  classifyFallbackDayType,
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

  it("maps actual guests to package-specific pricing rows and extra beds", () => {
    expect(resolvePricingGuestCount(1, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 10, extraBedCount: 0 });
    expect(resolvePricingGuestCount(10, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 10, extraBedCount: 0 });
    expect(resolvePricingGuestCount(17, "villa_10")).toMatchObject({ ok: true, pricingGuestCount: 17, extraBedCount: 0 });
    expect(resolvePricingGuestCount(18, "villa_10")).toEqual({
      ok: false,
      reason: "guest_count_requires_full_villa",
      pricingGuestCount: null,
    });
    expect(resolvePricingGuestCount(2, "villa_18")).toEqual({
      ok: false,
      reason: "full_villa_requires_18_guests",
      pricingGuestCount: null,
    });
    expect(resolvePricingGuestCount(2, "villa_18", { checkIn: "2026-11-07", checkOut: "2026-11-08" })).toMatchObject({
      ok: true,
      pricingGuestCount: 18,
      extraBedCount: 0,
    });
    expect(resolvePricingGuestCount(18, "villa_18")).toMatchObject({ ok: true, pricingGuestCount: 18, extraBedCount: 0 });
    expect(resolvePricingGuestCount(19, "villa_18")).toMatchObject({
      ok: true,
      pricingGuestCount: 18,
      extraBedCount: 1,
      extraBedUnitPrice: 800,
      extraBedAmount: 800,
    });
    expect(resolvePricingGuestCount(23, "villa_18")).toMatchObject({
      ok: true,
      pricingGuestCount: 18,
      extraBedCount: 5,
      extraBedUnitPrice: 800,
      extraBedAmount: 4000,
    });
    expect(resolvePricingGuestCount(24, "villa_18")).toEqual({
      ok: false,
      reason: "unsupported_guest_count",
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

  it("enforces package availability by guest count and Saturday stay nights", async () => {
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
      status: "unavailable",
      pricing: { reason: "saturday_small_package_unavailable" },
    });
    await expect(quote({ adults: 2, packageType: "villa_18", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 18,
      pricing: { total: 49000 },
    });
    await expect(quote({ adults: 10, packageType: "villa_18", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 18,
      pricing: { total: 49000 },
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
      status: "unavailable",
      pricing: { reason: "saturday_small_package_unavailable" },
    });
    await expect(quote({ adults: 17, packageType: "villa_18", checkIn: "2026-11-06", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 18,
      pricing: { total: 91000 },
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

  it("calculates 19-23 guests from the 18 person base rate plus nightly extra beds", async () => {
    const cases = [
      { adults: 19, checkIn: "2026-11-02", checkOut: "2026-11-03", basePrice: 35000, total: 35800 },
      { adults: 20, checkIn: "2026-11-02", checkOut: "2026-11-03", basePrice: 35000, total: 36600 },
      { adults: 23, checkIn: "2026-11-02", checkOut: "2026-11-03", basePrice: 35000, total: 39000 },
      { adults: 19, checkIn: "2026-11-06", checkOut: "2026-11-07", basePrice: 42000, total: 42800 },
      { adults: 23, checkIn: "2026-11-06", checkOut: "2026-11-07", basePrice: 42000, total: 46000 },
      { adults: 19, checkIn: "2026-11-07", checkOut: "2026-11-08", basePrice: 49000, total: 49800 },
      { adults: 23, checkIn: "2026-11-07", checkOut: "2026-11-08", basePrice: 49000, total: 53000 },
    ];

    for (const testCase of cases) {
      const result = await quote({
        adults: testCase.adults,
        packageType: "villa_18",
        checkIn: testCase.checkIn,
        checkOut: testCase.checkOut,
      });
      const extraBedCount = testCase.adults - 18;
      expect(result).toMatchObject({
        status: "resolved",
        guestCount: testCase.adults,
        pricingGuestCount: 18,
        pricing: { total: testCase.total },
      });
      expect(result.pricing.breakdown[0]).toMatchObject({
        baseGuestCount: 18,
        basePrice: testCase.basePrice,
        extraBedCount,
        extraBedUnitPrice: 800,
        extraBedAmount: extraBedCount * 800,
        price: testCase.total,
      });
    }
  });

  it("returns unsupported for 24 or more guests", async () => {
    await expect(quote({ adults: 24, packageType: "villa_18" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "unsupported_guest_count" },
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

  it("makes villa_10 unavailable for 18 or more guests and Saturday stay nights", async () => {
    await expect(quote({ adults: 18, packageType: "villa_10", checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "guest_count_requires_full_villa" },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "saturday_small_package_unavailable" },
    });
    await expect(quote({ adults: 10, packageType: "villa_10", checkIn: "2026-11-06", checkOut: "2026-11-08" })).resolves.toMatchObject({
      status: "unavailable",
      pricing: { reason: "saturday_small_package_unavailable" },
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

  it("charges extra beds per night for multi-night 19-23 guest quotes", async () => {
    const result = await quote({
      adults: 20,
      packageType: "villa_18",
      checkIn: "2026-11-05",
      checkOut: "2026-11-07",
    });

    expect(result.pricing.breakdown.map((night) => night.date)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(result.pricing.breakdown.map((night) => night.price)).toEqual([36600, 43600]);
    expect(result.pricing.breakdown).toEqual([
      expect.objectContaining({
        dayType: "weekday",
        baseGuestCount: 18,
        basePrice: 35000,
        extraBedCount: 2,
        extraBedUnitPrice: 800,
        extraBedAmount: 1600,
        price: 36600,
      }),
      expect.objectContaining({
        dayType: "friday",
        baseGuestCount: 18,
        basePrice: 42000,
        extraBedCount: 2,
        extraBedUnitPrice: 800,
        extraBedAmount: 1600,
        price: 43600,
      }),
    ]);
    expect(result.pricing.total).toBe(80200);
    expect(result.pricing.depositAmount).toBe(24060);
    expect(result.pricing.balanceAmount).toBe(56140);
    expect(result.pricing.depositAmount + result.pricing.balanceAmount).toBe(result.pricing.total);
  });

  it("includes extra beds in the second-night weekday discount", async () => {
    const result = await quote({
      adults: 20,
      packageType: "villa_18",
      checkIn: "2026-11-02",
      checkOut: "2026-11-04",
    });

    expect(result.pricing.breakdown).toEqual([
      expect.objectContaining({
        date: "2026-11-02",
        dayType: "weekday",
        basePrice: 35000,
        extraBedCount: 2,
        extraBedUnitPrice: 800,
        extraBedAmount: 1600,
        preDiscountPrice: 36600,
        discountType: null,
        discountRate: 1,
        discountAmount: 0,
        price: 36600,
      }),
      expect.objectContaining({
        date: "2026-11-03",
        dayType: "weekday",
        basePrice: 35000,
        extraBedCount: 2,
        extraBedUnitPrice: 800,
        extraBedAmount: 1600,
        preDiscountPrice: 36600,
        discountType: "weekday_second_night_95",
        discountRate: 0.95,
        discountAmount: 1830,
        price: 34770,
      }),
    ]);
    expect(result.pricing.total).toBe(71370);
    expect(result.pricing.depositAmount).toBe(21411);
    expect(result.pricing.balanceAmount).toBe(49959);
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
