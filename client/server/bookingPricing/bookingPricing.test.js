import { describe, expect, it } from "vitest";
import {
  calculateBookingQuote,
  classifyFallbackDayType,
  resolvePricingGuestCount,
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

  it("maps 1-10 actual guests to pricing guest count 10", () => {
    expect(resolvePricingGuestCount(1)).toEqual({ ok: true, pricingGuestCount: 10 });
    expect(resolvePricingGuestCount(10)).toEqual({ ok: true, pricingGuestCount: 10 });
    expect(resolvePricingGuestCount(18)).toEqual({ ok: true, pricingGuestCount: 18 });
    expect(resolvePricingGuestCount(19)).toEqual({
      ok: false,
      reason: "unsupported_guest_count",
      pricingGuestCount: null,
    });
  });

  it("returns exact 10 person weekday, friday, and holiday prices", async () => {
    await expect(quote({ checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
      status: "resolved",
      pricingGuestCount: 10,
      pricing: { total: 25000, depositAmount: 7500, balanceAmount: 17500 },
    });
    await expect(quote({ checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
      pricing: { total: 32000 },
    });
    await expect(quote({ checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
      pricing: { total: 39000 },
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

  it("covers every 11-17 matrix entry", async () => {
    for (const guestCount of [11, 12, 13, 14, 15, 16, 17]) {
      await expect(quote({ adults: guestCount, checkIn: "2026-11-02", checkOut: "2026-11-03" })).resolves.toMatchObject({
        pricingGuestCount: guestCount,
        pricing: { total: matrix[guestCount].weekday },
      });
      await expect(quote({ adults: guestCount, checkIn: "2026-11-06", checkOut: "2026-11-07" })).resolves.toMatchObject({
        pricing: { total: matrix[guestCount].friday },
      });
      await expect(quote({ adults: guestCount, checkIn: "2026-11-07", checkOut: "2026-11-08" })).resolves.toMatchObject({
        pricing: { total: matrix[guestCount].holiday },
      });
    }
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
    await expect(quote({ checkIn: "2026-10-31", checkOut: "2026-11-01" })).resolves.toMatchObject({
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
