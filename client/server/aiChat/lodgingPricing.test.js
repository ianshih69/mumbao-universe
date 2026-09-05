import { describe, expect, it } from "vitest";
import { buildConversationContextUpdate } from "./conversationContext.js";
import {
  buildOfficialPricingResolution,
  buildOfficialPricingRouteOverride,
  classifyPricingReplyIntent,
} from "./lodgingPricing.js";

const ruleSet = {
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

function createPricingReader() {
  return async (pathname) => {
    const url = new URL(`https://pricing.test${pathname}`);
    const table = url.pathname.slice(1);
    if (table === "booking_price_rule_sets") return [ruleSet];
    if (table === "booking_special_dates") return [];
    if (table === "booking_package_rates") {
      const guestCount = Number(String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""));
      const dayType = String(url.searchParams.get("day_type") || "").replace(/^eq\./, "");
      const price = matrix[guestCount]?.[dayType];
      return price == null
        ? []
        : [{
            id: `${guestCount}-${dayType}`,
            rule_set_id: ruleSet.id,
            guest_count: guestCount,
            day_type: dayType,
            nightly_price: price,
            is_active: true,
          }];
    }
    throw new Error(`Unexpected pricing table: ${table}`);
  };
}

const pricingOptions = {
  supabaseRequest: createPricingReader(),
  referenceDate: "2026-09-05",
};

function baseContext(overrides = {}) {
  return {
    active_intent: "pricing",
    current_topic: "booking_price",
    stay_type: "villa",
    check_in: "2026-11-01",
    check_out: "2026-11-02",
    stay_nights: 1,
    adult_count: 10,
    child_count: 0,
    infant_count: 0,
    ...overrides,
  };
}

function route(overrides = {}) {
  return {
    route: "faq_selector_required",
    providerUsed: "faq_selector_required",
    matchedFaqItems: [],
    matchedFaqIds: [],
    shouldCallDeepSeek: true,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: false,
    answer: "",
    ...overrides,
  };
}

async function overrideFor(message, context) {
  return buildOfficialPricingRouteOverride(context, route(), {
    message,
    recentMessages: [],
    turnAction: "request_quote",
    ...pricingOptions,
  });
}

function parsedContext(message) {
  return buildConversationContextUpdate({
    previousContext: null,
    recentMessages: [],
    message,
    dateInfo: { currentDate: "2026-09-05" },
    nowIso: "2026-09-05T00:00:00.000Z",
  }).context;
}

describe("shared Booking pricing for AI answers", () => {
  it("uses the Booking price matrix for every required adult price", async () => {
    const cases = [
      ["2026-11-01", "2026-11-02", "weekday", 10, 25000],
      ["2026-11-01", "2026-11-02", "weekday", 12, 27500],
      ["2026-11-01", "2026-11-02", "weekday", 15, 31250],
      ["2026-11-01", "2026-11-02", "weekday", 18, 35000],
      ["2026-11-01", "2026-11-02", "weekday", 20, 36600],
      ["2026-11-06", "2026-11-07", "friday", 10, 32000],
      ["2026-11-06", "2026-11-07", "friday", 12, 34500],
      ["2026-11-06", "2026-11-07", "friday", 15, 38250],
      ["2026-11-06", "2026-11-07", "friday", 18, 42000],
      ["2026-11-06", "2026-11-07", "friday", 20, 43600],
      ["2026-11-07", "2026-11-08", "holiday", 10, 39000],
      ["2026-11-07", "2026-11-08", "holiday", 12, 41500],
      ["2026-11-07", "2026-11-08", "holiday", 15, 45250],
      ["2026-11-07", "2026-11-08", "holiday", 18, 49000],
      ["2026-11-07", "2026-11-08", "holiday", 20, 50600],
    ];

    for (const [checkIn, checkOut, dayType, adults, expected] of cases) {
      const result = await buildOfficialPricingResolution(
        baseContext({ check_in: checkIn, check_out: checkOut, adult_count: adults }),
        pricingOptions
      );
      expect(result.lodging_price.amount, `${dayType}/${adults}`).toBe(expected);
      expect(result.total_amount, `${dayType}/${adults}`).toBe(expected);
    }
  });

  it.each([
    [8, 2, 0, 25000],
    [8, 3, 500, 25500],
    [10, 3, 1500, 26500],
    [11, 2, 1000, 27250],
  ])("prices %i adults and %i children", async (adults, children, childFee, total) => {
    const result = await buildOfficialPricingResolution(
      baseContext({ adult_count: adults, child_count: children }),
      pricingOptions
    );
    expect(result.child_fee.amount).toBe(childFee);
    expect(result.total_amount).toBe(total);
  });

  it.each([1, 5])("keeps %i non-bed infants free without a free-count cap", async (infants) => {
    const result = await buildOfficialPricingResolution(
      baseContext({ infant_count: infants }),
      pricingOptions
    );
    expect(result.infant_fee).toMatchObject({ amount: 0, infant_count: infants, free_count_limit: null });
    expect(result.total_amount).toBe(25000);
  });

  it.each([
    ["2026-11-01", "2026-11-03", 10, 48750],
    ["2026-11-05", "2026-11-07", 10, 55400],
    ["2026-11-06", "2026-11-08", 12, 73925],
  ])("applies the night-2 discount for %s to %s", async (checkIn, checkOut, adults, total) => {
    const result = await buildOfficialPricingResolution(
      baseContext({ check_in: checkIn, check_out: checkOut, stay_nights: 2, adult_count: adults }),
      pricingOptions
    );
    expect(result.total_amount).toBe(total);
    expect(result.booking_quote.pricing.breakdown[0].discountRate).toBe(1);
    expect(result.booking_quote.pricing.breakdown[1].discountRate).toBe(0.95);
  });

  it("supports date-type-only quotes through the same Booking core", async () => {
    const friday = await buildOfficialPricingResolution(
      baseContext({ check_in: null, check_out: null, pricing_day_type: "friday", stay_nights: 1, adult_count: 15 }),
      pricingOptions
    );
    const fridayTwoNights = await buildOfficialPricingResolution(
      baseContext({ check_in: null, check_out: null, pricing_day_type: "friday", stay_nights: 2 }),
      pricingOptions
    );
    expect(friday.total_amount).toBe(38250);
    expect(fridayTwoNights.total_amount).toBe(69050);
    expect(fridayTwoNights.requested_day_types).toEqual(["friday", "holiday"]);
  });

  it("calculates dog tiers, consecutive discount, deposit, and breakfast from shared helpers", async () => {
    const dogOneNight = await overrideFor("一隻22公斤狗狗住一晚多少？", parsedContext("一隻22公斤狗狗住一晚多少？"));
    const dogTwoNights = await overrideFor("一隻22公斤狗狗住兩晚多少？", parsedContext("一隻22公斤狗狗住兩晚多少？"));
    const mixedDogs = await overrideFor(
      "一隻8公斤狗狗、一隻15公斤狗狗，住一晚多少？",
      parsedContext("一隻8公斤狗狗、一隻15公斤狗狗，住一晚多少？")
    );
    const breakfast = await overrideFor("早餐4份多少？", parsedContext("早餐4份多少？"));
    const deposit = await overrideFor("寵物押金多少？", parsedContext("寵物押金多少？"));

    expect(dogOneNight.answer).toContain("TWD 1,200");
    expect(dogTwoNights.answer).toContain("TWD 2,340");
    expect(mixedDogs.answer).toContain("TWD 1,300");
    expect(dogTwoNights.answer).toContain("押金 TWD 3,000");
    expect(breakfast.answer).toContain("TWD 1,000");
    expect(breakfast.answer).toContain("不套用住宿第 2 晚起 95 折");
    expect(deposit.answer).toContain("不是狗狗住宿費");
  });

  it("keeps live availability separate from the static price", async () => {
    const message = "2026年11月1日10位成人住一晚還有房嗎？多少錢？";
    const result = await overrideFor(message, parsedContext(message));
    expect(result.answer).toContain("TWD 25,000");
    expect(result.answer).toContain("實際房況仍須以官網即時訂房系統為準");
    expect(result.answer).not.toMatch(/保證有房|確定有房/);
  });

  it("keeps deterministic pricing intent independent from faq-026", () => {
    expect(classifyPricingReplyIntent({ message: "12人多少？" })).toBe("initial_quote");
    expect(classifyPricingReplyIntent({ message: "早餐4份多少？" })).toBe("initial_quote");
    expect(classifyPricingReplyIntent({ message: "寵物押金是幾多" })).toBe("initial_quote");
  });
});
