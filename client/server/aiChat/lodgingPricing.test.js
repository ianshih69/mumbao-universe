import { describe, expect, it } from "vitest";
import {
  buildOfficialPricingReply,
  buildOfficialPricingRouteOverride,
  buildOfficialPricingResolution,
  calculateVillaLodgingPriceFromKnowledge,
  classifyVillaDateType,
  parseVillaPricingRules,
} from "./lodgingPricing.js";
import { loadGuesthouseKnowledge } from "./guesthouseKnowledge.js";

const completeDogContext = {
  active_intent: "pricing",
  stay_type: "villa",
  check_in: "2027-07-26",
  check_out: "2027-07-27",
  guest_count: 15,
  pet_count: 3,
  pet_type: "dog",
};

const completeNoPetContext = {
  ...completeDogContext,
  pet_count: 0,
  pet_type: null,
};

function route(overrides = {}) {
  return {
    route: "knowledge_gap",
    providerUsed: "knowledge_gap",
    matchedFaqItems: [],
    matchedFaqIds: [],
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: true,
    knowledgeGap: true,
    aiSkipped: true,
    answer: "實際房價及寵物安排仍需由管家確認。",
    ...overrides,
  };
}

describe("official lodging pricing", () => {
  it("parses the existing guesthouse rules price table", async () => {
    const knowledge = await loadGuesthouseKnowledge();
    const rules = parseVillaPricingRules(knowledge);

    expect(rules["暑假平日（日～四）"]).toMatchObject({
      tenPersonAmount: 32000,
      tenPersonUnitAmount: 3200,
      eighteenPersonAmount: 42000,
    });
  });

  it("classifies 2027 summer weekdays from the existing pricing rules", () => {
    expect(classifyVillaDateType("2027-07-26")).toMatchObject({
      label: "暑假平日（日～四）",
      basis: "summer_month_and_weekday",
    });
  });

  it("calculates the specified 15-person villa lodging price without pet fees", async () => {
    const knowledge = await loadGuesthouseKnowledge();
    const price = calculateVillaLodgingPriceFromKnowledge(
      completeDogContext,
      knowledge,
    );

    expect(price).toMatchObject({
      status: "resolved",
      amount: 48000,
      source: "existing_official_pricing",
      source_file: "client/api/knowledge/guesthouse-rules.md",
      guest_count: 15,
      nights: 1,
    });
    expect(price.nightly[0]).toMatchObject({
      date: "2027-07-26",
      date_type: "暑假平日（日～四）",
      amount: 48000,
      formula: "ten_person_base_plus_extra_guests",
    });
  });

  it("splits known lodging price from unresolved pet fee", async () => {
    const pricing = await buildOfficialPricingResolution(completeDogContext);

    expect(pricing).toMatchObject({
      lodging_price: {
        status: "resolved",
        amount: 48000,
        source: "existing_official_pricing",
      },
      pet_fee: {
        status: "unresolved",
        amount: null,
        reason: "no_approved_pet_fee_rule",
      },
      unresolved_price_items: ["pet_fee"],
      price_calculation_route: "existing_official_pricing",
    });
  });

  it("answers a partial quote when lodging price is known but pet fee is unresolved", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
    );

    expect(override).toMatchObject({
      route: "partial_grounded_reply",
      providerUsed: "official_pricing",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      knowledgeGap: false,
      reason: "official_lodging_price_resolved_with_unresolved_items",
    });
    expect(override.answer).toContain("2027 年 7 月 26 日入住");
    expect(override.answer).toContain("15 位包棟");
    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).toContain("攜帶 3 隻狗");
    expect(override.answer).toContain("房價尚未包含寵物相關費用");
    expect(override.answer).not.toContain("實際房價及寵物安排仍需由管家確認");
    expect(override.semanticMetadata).toMatchObject({
      lodging_price_status: "resolved",
      lodging_price_amount: 48000,
      lodging_price_source: "existing_official_pricing",
      pet_fee_status: "unresolved",
      unresolved_price_items: ["pet_fee"],
      price_calculation_route: "existing_official_pricing",
      needs_human: true,
    });
  });

  it("answers the lodging price directly when the guest explicitly has no pets", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeNoPetContext,
      route(),
    );

    expect(override).toMatchObject({
      route: "grounded_reply",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).toContain("不含寵物費的住宿小計");
    expect(override.answer).not.toContain("寵物費與安排需再由管家確認");
  });

  it("does not override knowledge gap when lodging price cannot be resolved", async () => {
    const override = await buildOfficialPricingRouteOverride(
      {
        ...completeDogContext,
        stay_type: "room",
      },
      route(),
    );

    expect(override).toBeNull();
  });

  it("ignores conflicting model drafts and keeps the server-side price", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route({
        route: "semantic_grounded",
        providerUsed: "deepseek_semantic",
        answer: "包棟總價是 NT$50,000。",
        semanticMetadata: {
          semantic_route: "grounded_reply",
        },
      }),
    );

    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).not.toContain("NT$50,000");
    expect(override.semanticMetadata).toMatchObject({
      semantic_route: "grounded_reply",
      lodging_price_amount: 48000,
    });
  });

  it("replaces a model draft that says all pricing must be confirmed", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route({
        route: "knowledge_gap",
        providerUsed: "deepseek_semantic",
        answer: "全部費用都需要管家確認。",
      }),
    );

    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).toContain("寵物費與安排需再由管家確認");
    expect(override.answer).not.toContain("全部費用都需要管家確認");
  });

  it("can answer a follow-up asking for the lodging subtotal without dog fees", async () => {
    const pricing = await buildOfficialPricingResolution(completeDogContext);
    const reply = buildOfficialPricingReply(completeDogContext, pricing);

    expect(reply).toContain("住宿房價為 NT$48,000");
    expect(reply).toContain("房價尚未包含寵物相關費用");
  });
});
