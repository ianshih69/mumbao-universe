import { describe, expect, it } from "vitest";
import faqItems from "../../api/knowledge/faq-items.json";
import {
  buildConversationContextUpdate,
  classifyGuestAgeForPricing,
} from "./conversationContext.js";
import { routeKnowledge } from "./knowledgeRouter.js";
import { executeTurnAction } from "./turnActionExecutor.js";

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

async function pricingReader(pathname) {
  const url = new URL(`https://pricing.test${pathname}`);
  const table = url.pathname.slice(1);
  if (table === "booking_price_rule_sets") return [ruleSet];
  if (table === "booking_special_dates") return [];
  if (table === "booking_package_rates") {
    const count = Number(String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""));
    const dayType = String(url.searchParams.get("day_type") || "").replace(/^eq\./, "");
    const price = matrix[count]?.[dayType];
    return price == null
      ? []
      : [{ rule_set_id: ruleSet.id, guest_count: count, day_type: dayType, nightly_price: price, is_active: true }];
  }
  throw new Error(`Unexpected pricing table: ${table}`);
}

async function runFormalPriceFlow(message) {
  const update = buildConversationContextUpdate({
    previousContext: null,
    recentMessages: [],
    message,
    dateInfo: { currentDate: "2026-09-05" },
    nowIso: "2026-09-05T00:00:00.000Z",
  });
  const lexicalRoute = await routeKnowledge({
    message,
    retrievalMessage: update.retrievalText,
    contextText: update.promptContext,
    faqItems,
    limit: 8,
  });
  const finalRoute = await executeTurnAction({
    message,
    semanticResult: null,
    routeResult: lexicalRoute,
    context: update.context,
    previousContext: update.previousContext,
    recentMessages: [],
    nowIso: "2026-09-05T00:00:00.000Z",
    sourceMessageId: "price-gate",
    pricingOptions: {
      supabaseRequest: pricingReader,
      referenceDate: "2026-09-05",
    },
  });
  return { update, lexicalRoute, finalRoute };
}

describe("Price Answer Release Gate formal flow", () => {
  it("answers the finalized 8-adult 2-child case through lexical route and turn action", async () => {
    const result = await runFormalPriceFlow(
      "2026年11月1日，8個大人2個4到12歲小孩，住一晚多少？"
    );

    expect(result.update.context).toMatchObject({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 8,
      child_count: 2,
    });
    expect(result.lexicalRoute.route).toMatch(/faq_/);
    expect(result.finalRoute).toMatchObject({
      route: "grounded_reply",
      providerUsed: "official_pricing",
      shouldCallDeepSeek: false,
      knowledgeGap: false,
    });
    expect(result.finalRoute.answer).toContain("TWD 25,000");
    expect(result.finalRoute.answer).toContain("基本 10 位計價名額已涵蓋這 2 位兒童");
    expect(result.finalRoute.answer).toContain("沒有另外加收兒童費");
    expect(result.finalRoute.answer).not.toContain("missing_date_type_price");
    expect(result.finalRoute.answer).not.toContain("請提供");
    expect(result.finalRoute.semanticMetadata).toMatchObject({
      pricing_called: true,
      price_calculation_route: "booking_pricing_core",
      total_price_amount: 25000,
      child_fee_amount: 0,
    });
  });

  it.each([
    ["2026年11月1日，10位成人住一晚多少？", "TWD 25,000"],
    ["2026年11月6日，12位成人住一晚多少？", "TWD 34,500"],
    ["2026年11月7日，15位成人住一晚多少？", "TWD 45,250"],
    ["2026年11月7日，18位成人住一晚多少？", "TWD 49,000"],
    ["2026年11月7日，20位成人住一晚多少？", "TWD 50,600"],
    ["週五15個大人包棟一晚多少？", "TWD 38,250"],
    ["平日12人包棟一晚多少？", "TWD 27,500"],
    ["連假18人包棟一晚多少？", "TWD 49,000"],
  ])("returns a final amount for %s", async (message, amount) => {
    const { finalRoute } = await runFormalPriceFlow(message);
    expect(finalRoute.answer).toContain(amount);
    expect(finalRoute.semanticMetadata.pricing_called).toBe(true);
    expect(finalRoute.answer).not.toMatch(/請提供|官方 LINE/);
  });

  it.each([
    ["2026年11月1日入住，2026年11月3日退房，10位成人多少？", "TWD 48,750"],
    ["2026年11月5日入住，2026年11月7日退房，10位成人多少？", "TWD 55,400"],
    ["2026年11月6日入住，2026年11月8日退房，12位成人多少？", "TWD 73,925"],
    ["週五入住，兩天一夜，10人多少？", "TWD 32,000"],
    ["週五入住，三天兩夜，10人多少？", "TWD 69,050"],
  ])("handles nights and checkout semantics for %s", async (message, amount) => {
    const { finalRoute } = await runFormalPriceFlow(message);
    expect(finalRoute.answer).toContain(amount);
    expect(finalRoute.semanticMetadata.pricing_called).toBe(true);
  });

  it.each([
    ["包棟多少錢？", ["入住日期或日期類型與晚數", "成人與4～12歲兒童各有幾位"]],
    ["12人多少？", ["入住日期或日期類型與晚數"]],
    ["2026年11月1日多少？", ["住宿晚數", "成人與4～12歲兒童各有幾位"]],
    ["帶3隻狗多少？", ["每隻狗狗體重", "住宿晚數"]],
    ["暑假週六10人一晚多少？", ["確切入住日期與年份"]],
  ])("asks only for missing data for %s", async (message, expectedFragments) => {
    const { finalRoute } = await runFormalPriceFlow(message);
    expect(finalRoute.route).toBe("faq_collect_info");
    for (const fragment of expectedFragments) expect(finalRoute.answer).toContain(fragment);
    if (message.startsWith("12人")) expect(finalRoute.answer).not.toContain("成人與4～12歲兒童各有幾位");
    if (message.startsWith("2026年")) expect(finalRoute.answer).not.toContain("入住日期或日期類型");
  });

  it("separates price from live availability in the final answer", async () => {
    const { finalRoute } = await runFormalPriceFlow(
      "2026年11月1日10位成人住一晚還有房嗎？多少錢？"
    );
    expect(finalRoute.answer).toContain("TWD 25,000");
    expect(finalRoute.answer).toContain("實際房況仍須以官網即時訂房系統為準");
    expect(finalRoute.answer).not.toMatch(/保證有房|確定有房/);
  });

  it("classifies the finalized age boundaries", () => {
    expect(classifyGuestAgeForPricing({ years: 3, months: 11 })).toBe("infant");
    expect(classifyGuestAgeForPricing({ years: 4 })).toBe("child");
    expect(classifyGuestAgeForPricing({ years: 12 })).toBe("child");
    expect(classifyGuestAgeForPricing({ years: 13 })).toBe("adult");
  });
});
