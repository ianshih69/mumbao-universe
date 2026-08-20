import { describe, expect, it } from "vitest";
import {
  buildContextualKnowledgeRouteOverride,
  buildConversationContextUpdate,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  buildOfficialPricingReply,
  buildOfficialPricingRouteOverride,
  buildOfficialPricingResolution,
  calculateVillaLodgingPriceFromKnowledge,
  classifyPricingReplyIntent,
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

const repricedNoPetContext = {
  ...completeDogContext,
  check_in: "2026-10-01",
  check_out: "2026-10-02",
  pet_count: 0,
  pet_type: null,
};

const previousPricingAssistant = {
  sender: "ai",
  message:
    "收到，目前是 2027 年 7 月 26 日入住、7 月 27 日退房，15 位包棟，住宿房價為 NT$48,000。另會攜帶 3 隻狗，目前房價尚未包含寵物相關費用，寵物費與安排需再由管家確認。",
  provider_used: "official_pricing",
  metadata: {
    lodging_price_status: "resolved",
    lodging_price_amount: 48000,
    price_calculation_route: "existing_official_pricing",
    pricing_reply_mode: "initial_quote",
    pricing_override_applied: true,
  },
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

function quoteOptions(message, recentMessages = []) {
  return {
    message,
    recentMessages,
  };
}

function contextChangeOptions(message, previousContext, recentMessages = []) {
  return {
    message,
    previousContext,
    recentMessages,
  };
}

function buildContextUpdate(previousContext, message) {
  return buildConversationContextUpdate({
    previousContext,
    recentMessages: [],
    message,
    dateInfo: {
      todayText: "2026-08-02",
      currentYear: 2026,
    },
    nowIso: "2026-08-02T00:00:00.000Z",
  });
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
      knowledge
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
      base_amount: 32000,
      extra_guest_count: 5,
      extra_guest_unit_amount: 3200,
    });
  });

  it("calculates 10-person multi-night lodging totals and nightly breakdowns", async () => {
    const knowledge = await loadGuesthouseKnowledge();
    const price = calculateVillaLodgingPriceFromKnowledge(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-07",
        check_out: "2026-09-10",
        guest_count: 10,
        pet_count: 0,
      },
      knowledge
    );

    expect(price).toMatchObject({
      status: "resolved",
      amount: 75000,
      nights: 3,
      guest_count: 10,
    });
    expect(price.nightly).toHaveLength(3);
    expect(price.nightly.every((night) => night.amount === 25000)).toBe(true);
    expect(price.nightly.every((night) => night.date_type === "平日（日～四）")).toBe(true);
  });

  it("splits 10-person lodging price across different date types", async () => {
    const knowledge = await loadGuesthouseKnowledge();
    const price = calculateVillaLodgingPriceFromKnowledge(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-10",
        check_out: "2026-09-13",
        guest_count: 10,
        pet_count: 0,
      },
      knowledge
    );

    expect(price).toMatchObject({
      status: "resolved",
      amount: 96000,
      nights: 3,
    });
    expect(price.nightly.map((night) => [night.date, night.date_type, night.amount])).toEqual([
      ["2026-09-10", "平日（日～四）", 25000],
      ["2026-09-11", "週五", 32000],
      ["2026-09-12", "假日／連續假日", 39000],
    ]);
  });

  it("calculates 18-person villa lodging prices", async () => {
    const knowledge = await loadGuesthouseKnowledge();
    const oneNight = calculateVillaLodgingPriceFromKnowledge(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-09",
        check_out: "2026-09-10",
        guest_count: 18,
        pet_count: 0,
      },
      knowledge
    );
    const multiNight = calculateVillaLodgingPriceFromKnowledge(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-10",
        check_out: "2026-09-13",
        guest_count: 18,
        pet_count: 0,
      },
      knowledge
    );

    expect(oneNight).toMatchObject({
      status: "resolved",
      amount: 35000,
      nights: 1,
    });
    expect(multiNight).toMatchObject({
      status: "resolved",
      amount: 126000,
      nights: 3,
    });
    expect(multiNight.nightly.map((night) => night.amount)).toEqual([35000, 42000, 49000]);
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

  it("answers a partial quote only when the current turn asks for pricing", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("總共多少錢")
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
    expect(override.answer).toContain("尚未包含寵物相關費用");
    expect(override.answer).not.toContain("實際房價及寵物安排仍需由管家確認");
    expect(override.semanticMetadata).toMatchObject({
      lodging_price_status: "resolved",
      lodging_price_amount: 48000,
      lodging_price_source: "existing_official_pricing",
      pet_fee_status: "unresolved",
      unresolved_price_items: ["pet_fee"],
      price_calculation_route: "existing_official_pricing",
      pricing_reply_mode: "initial_quote",
      pricing_override_applied: true,
      current_turn_intent: "initial_quote",
      needs_human: true,
    });
  });

  it("answers the lodging price directly when the guest explicitly has no pets", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeNoPetContext,
      route(),
      quoteOptions("總共多少錢")
    );

    expect(override).toMatchObject({
      route: "grounded_reply",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).toContain("不攜帶寵物");
    expect(override.answer).not.toContain("寵物費與安排需再由管家確認");
  });

  it("does not override knowledge gap when lodging price cannot be resolved", async () => {
    const override = await buildOfficialPricingRouteOverride(
      {
        ...completeDogContext,
        stay_type: "room",
      },
      route(),
      quoteOptions("總共多少錢")
    );

    expect(override).toBeNull();
  });

  it("ignores conflicting model drafts and keeps the server-side price", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route({
        route: "semantic_grounded",
        providerUsed: "deepseek_semantic",
        answer: "房價總共是 NT$50,000。",
        semanticMetadata: {
          semantic_route: "grounded_reply",
        },
      }),
      quoteOptions("總共多少錢")
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
        answer: "全部費用都需要由管家確認。",
      }),
      quoteOptions("總共多少錢")
    );

    expect(override.answer).toContain("住宿房價為 NT$48,000");
    expect(override.answer).toContain("寵物費與安排需再由管家確認");
    expect(override.answer).not.toContain("全部費用都需要由管家確認");
  });

  it("can answer a follow-up asking for the lodging subtotal without dog fees", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("不含狗狗多少", [previousPricingAssistant])
    );

    expect(override).toMatchObject({
      route: "lodging_only_quote",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
    expect(override.answer).toContain("住宿小計是 NT$48,000");
    expect(override.answer).toContain("不含 3 隻狗寵物費");
    expect(override.answer).not.toContain("請問");
  });

  it("does not repeat a quote when the guest wants to ask a new question", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("重新問妳問題", [previousPricingAssistant])
    );

    expect(override).toMatchObject({
      route: "new_question_acknowledgement",
      providerUsed: "local_intent",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
      conversationContextPatch: {
        active_intent: null,
        current_topic: null,
      },
    });
    expect(override.answer).toContain("重新了解哪個問題");
    expect(override.answer).not.toContain("NT$48,000");
    expect(override.semanticMetadata).toMatchObject({
      pricing_reply_mode: "new_question_acknowledgement",
      pricing_override_applied: false,
      current_turn_intent: "new_question_acknowledgement",
    });
  });

  it("answers quote confirmation without duplicating the initial quote", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("確定嗎", [previousPricingAssistant])
    );

    expect(override).toMatchObject({
      route: "quote_confirmation",
      providerUsed: "official_pricing",
    });
    expect(override.answer).toContain("是的");
    expect(override.answer).toContain("暑假平日（日～四）");
    expect(override.answer).toContain("10 人包棟為 NT$32,000");
    expect(override.answer).toContain("增加 5 人");
    expect(override.answer).toContain("每人 NT$3,200");
    expect(override.answer).toContain("15 人住宿費為 NT$48,000");
    expect(override.answer).toContain("尚未包含 3 隻狗的寵物費用");
    expect(override.answer).not.toBe(previousPricingAssistant.message);
  });

  it("answers quote breakdown with verified server-side details", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("怎麼算的", [previousPricingAssistant])
    );

    expect(override).toMatchObject({
      route: "quote_breakdown",
      providerUsed: "official_pricing",
    });
    expect(override.answer).toContain("正式價目表");
    expect(override.answer).toContain("10 人包棟 NT$32,000");
    expect(override.answer).toContain("加 5 人 × NT$3,200");
    expect(override.answer).toContain("小計 NT$48,000");
    expect(override.answer).not.toContain("NT$50,000");
  });

  it("does not override another FAQ topic such as barbecue", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route({
        route: "faq_direct",
        providerUsed: "faq_direct",
        answer: "可以使用烤肉區，實際安排請依現場規範。",
        matchedFaqItems: [
          {
            id: "faq-bbq",
            question: "可以烤肉嗎？",
            answer: "可以使用烤肉區，實際安排請依現場規範。",
          },
        ],
      }),
      quoteOptions("可以烤肉嗎", [previousPricingAssistant])
    );

    expect(override).toBeNull();
  });

  it("does not repeat pricing for a casual acknowledgement", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("謝謝", [previousPricingAssistant])
    );

    expect(override).toMatchObject({
      route: "casual_acknowledgement",
      providerUsed: "local_intent",
    });
    expect(override.answer).toContain("可以再問我");
    expect(override.answer).not.toContain("NT$48,000");
    expect(override.semanticMetadata.pricing_override_applied).toBe(false);
  });

  it("does not use pricing facts from another session for confirmation", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("確定嗎", [])
    );

    expect(override).toMatchObject({
      route: "quote_confirmation_missing_context",
      providerUsed: "local_intent",
    });
    expect(override.answer).toContain("想確認哪一項資訊");
    expect(override.answer).not.toContain("NT$48,000");
  });

  it("only treats confirmation as pricing when the latest assistant reply was pricing", async () => {
    const override = await buildOfficialPricingRouteOverride(
      completeDogContext,
      route(),
      quoteOptions("確定嗎", [
        previousPricingAssistant,
        {
          sender: "ai",
          message: "可以使用烤肉區，實際安排請依現場規範。",
          provider_used: "faq_direct",
          metadata: {
            final_route: "faq_direct",
            matchedFaqIds: ["faq-bbq"],
          },
        },
      ])
    );

    expect(override).toMatchObject({
      route: "quote_confirmation_missing_context",
      providerUsed: "local_intent",
    });
    expect(override.answer).not.toContain("NT$48,000");
  });

  it("does not unconditionally quote in legacy, shadow, or hybrid mode", async () => {
    for (const semanticMode of ["legacy", "shadow", "hybrid"]) {
      const override = await buildOfficialPricingRouteOverride(
        completeDogContext,
        route({
          semanticMetadata: {
            semantic_mode: semanticMode,
          },
        }),
        quoteOptions("重新問妳問題", [previousPricingAssistant])
      );

      expect(override.answer).not.toContain("NT$48,000");
      expect(override.semanticMetadata.semantic_mode).toBe(semanticMode);
      expect(override.semanticMetadata.pricing_override_applied).toBe(false);
    }
  });

  it("automatically reprices when pricing context dates are changed", async () => {
    const update = buildContextUpdate(completeDogContext, "日期改到10月1號到2號");

    const override = await buildOfficialPricingRouteOverride(
      update.context,
      route(),
      contextChangeOptions("日期改到10月1號到2號", update.previousContext)
    );

    expect(update.extracted).toMatchObject({
      check_in: "2026-10-01",
      check_out: "2026-10-02",
    });
    expect(override).toMatchObject({
      route: "reprice_after_context_change",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: true,
      knowledgeGap: false,
    });
    expect(override.answer).toContain("已改為 2026 年 10 月 1 日入住");
    expect(override.answer).toContain("15 位包棟");
    expect(override.answer).toContain("住宿房價為 NT$37,500");
    expect(override.answer).toContain("寵物費與安排需再由管家確認");
    expect(override.semanticMetadata).toMatchObject({
      pricing_reply_mode: "reprice_after_context_change",
      lodging_price_amount: 37500,
      pet_fee_status: "unresolved",
      unresolved_price_items: ["pet_fee"],
      needs_human: true,
    });
  });

  it("reprices after changing dates and clearing pets without stale pet uncertainty", async () => {
    const update = buildContextUpdate(
      completeDogContext,
      "日期改了，改到10月1號到2號，不帶狗"
    );

    const override = await buildOfficialPricingRouteOverride(
      update.context,
      route(),
      contextChangeOptions(
        "日期改了，改到10月1號到2號，不帶狗",
        update.previousContext,
        [previousPricingAssistant]
      )
    );

    expect(update.context).toMatchObject({
      check_in: "2026-10-01",
      check_out: "2026-10-02",
      guest_count: 15,
      pet_count: 0,
      pet_type: null,
    });
    expect(override).toMatchObject({
      route: "reprice_after_context_change",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
    expect(override.answer).toContain("已改為 2026 年 10 月 1 日入住");
    expect(override.answer).toContain("10 月 2 日退房");
    expect(override.answer).toContain("15 位包棟");
    expect(override.answer).toContain("不攜帶寵物");
    expect(override.answer).toContain("住宿房價為 NT$37,500");
    expect(override.answer).not.toContain("寵物費需確認");
    expect(override.answer).not.toContain("寵物安排需確認");
    expect(override.answer).not.toContain("尚未包含寵物費");
    expect(override.answer).not.toContain("尚未包含寵物相關費用");
    expect(override.semanticMetadata).toMatchObject({
      lodging_price_status: "resolved",
      lodging_price_amount: 37500,
      pet_fee_status: "not_applicable",
      unresolved_price_items: [],
      pricing_reply_mode: "reprice_after_context_change",
      current_turn_intent: "reprice_after_context_change",
      needs_human: false,
    });
  });

  it("clears pets when the guest says the pet will not come", () => {
    const update = buildContextUpdate(completeDogContext, "毛孩不去了");

    expect(update.context).toMatchObject({
      pet_count: 0,
      pet_type: null,
    });
  });

  it("automatically reprices after changing the guest count", async () => {
    const update = buildContextUpdate(completeDogContext, "改成12人");

    const override = await buildOfficialPricingRouteOverride(
      update.context,
      route(),
      contextChangeOptions("改成12人", update.previousContext)
    );

    expect(update.context.guest_count).toBe(12);
    expect(override).toMatchObject({
      route: "reprice_after_context_change",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: true,
    });
    expect(override.answer).toContain("12 位包棟");
    expect(override.answer).toContain("住宿房價為 NT$38,400");
  });

  it("asks for the missing new dates instead of using old dates when a date change is incomplete", async () => {
    const update = buildContextUpdate(completeDogContext, "日期改了");
    const override = await buildOfficialPricingRouteOverride(
      update.context,
      route(),
      contextChangeOptions("日期改了", update.previousContext)
    );
    const contextualRoute = buildContextualKnowledgeRouteOverride(update.context, route());

    expect(update.context.check_in).toBeNull();
    expect(update.context.check_out).toBeNull();
    expect(override).toBeNull();
    expect(contextualRoute).toMatchObject({
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
    });
    expect(contextualRoute.answer).toContain("入住日期");
    expect(contextualRoute.answer).not.toContain("2027年7月26日");
    expect(contextualRoute.answer).not.toContain("NT$48,000");
  });

  it("does not reprice a new session that only provides new dates", async () => {
    const update = buildContextUpdate(
      normalizeConversationContext({}),
      "改到10月1號到2號"
    );

    const override = await buildOfficialPricingRouteOverride(
      update.context,
      route(),
      contextChangeOptions("改到10月1號到2號", update.previousContext)
    );

    expect(update.context).toMatchObject({
      check_in: "2026-10-01",
      check_out: "2026-10-02",
      guest_count: null,
      stay_type: null,
    });
    expect(override).toBeNull();
  });

  it("reprices consistently in legacy, shadow, and hybrid mode", async () => {
    for (const semanticMode of ["legacy", "shadow", "hybrid"]) {
      const override = await buildOfficialPricingRouteOverride(
        repricedNoPetContext,
        route({
          semanticMetadata: {
            semantic_mode: semanticMode,
          },
        }),
        contextChangeOptions(
          "日期改了，改到10月1號到2號，不帶狗",
          completeDogContext,
          [previousPricingAssistant]
        )
      );

      expect(override).toMatchObject({
        route: "reprice_after_context_change",
        providerUsed: "official_pricing",
      });
      expect(override.answer).toContain("住宿房價為 NT$37,500");
      expect(override.semanticMetadata.semantic_mode).toBe(semanticMode);
      expect(override.semanticMetadata.needs_human).toBe(false);
    }
  });

  it("overrides a DeepSeek draft that hides a verified repriced lodging amount", async () => {
    const override = await buildOfficialPricingRouteOverride(
      repricedNoPetContext,
      route({
        route: "knowledge_gap",
        providerUsed: "deepseek_semantic",
        answer: "實際房價仍需由管家確認。",
        semanticMetadata: {
          semantic_route: "knowledge_gap",
        },
      }),
      contextChangeOptions(
        "日期改了，改到10月1號到2號，不帶狗",
        completeDogContext,
        [previousPricingAssistant]
      )
    );

    expect(override).toMatchObject({
      route: "reprice_after_context_change",
      providerUsed: "official_pricing",
    });
    expect(override.answer).toContain("住宿房價為 NT$37,500");
    expect(override.answer).not.toContain("實際房價仍需由管家確認");
    expect(override.semanticMetadata).toMatchObject({
      semantic_route: "knowledge_gap",
      lodging_price_amount: 37500,
      pricing_override_applied: true,
    });
  });

  it("classifies current-turn pricing reply intents", () => {
    expect(classifyPricingReplyIntent({ message: "總共多少錢" })).toBe(
      "initial_quote"
    );
    expect(
      classifyPricingReplyIntent({
        message: "確定嗎",
        recentMessages: [previousPricingAssistant],
      })
    ).toBe("quote_confirmation");
    expect(classifyPricingReplyIntent({ message: "確定嗎" })).toBe(
      "quote_confirmation_missing_context"
    );
    expect(classifyPricingReplyIntent({ message: "怎麼算的" })).toBe(
      "quote_breakdown"
    );
    expect(classifyPricingReplyIntent({ message: "不含狗狗多少" })).toBe(
      "lodging_only_quote"
    );
    expect(classifyPricingReplyIntent({ message: "重新問妳問題" })).toBe(
      "new_question_acknowledgement"
    );
    expect(classifyPricingReplyIntent({ message: "謝謝" })).toBe(
      "casual_acknowledgement"
    );
    expect(classifyPricingReplyIntent({ message: "可以烤肉嗎" })).toBe(
      "unrelated_or_new_topic"
    );
    expect(
      classifyPricingReplyIntent({
        message: "日期改了，改到10月1號到2號，不帶狗",
        previousContext: completeDogContext,
        context: repricedNoPetContext,
        recentMessages: [previousPricingAssistant],
      })
    ).toBe("reprice_after_context_change");
  });

  it("keeps the base partial quote composer available for direct use", async () => {
    const pricing = await buildOfficialPricingResolution(completeDogContext);
    const reply = buildOfficialPricingReply(completeDogContext, pricing);

    expect(reply).toContain("住宿房價為 NT$48,000");
    expect(reply).toContain("尚未包含寵物相關費用");
  });
});
