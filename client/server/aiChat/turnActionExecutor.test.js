import { describe, expect, it } from "vitest";
import { buildConversationContextUpdate } from "./conversationContext.js";
import { executeTurnAction } from "./turnActionExecutor.js";

const dateInfo = {
  currentDate: "2026-08-02",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};

const completeDogContext = {
  active_intent: "pricing",
  stay_type: "villa",
  check_in: "2027-07-26",
  check_out: "2027-07-27",
  guest_count: 15,
  adult_count: null,
  child_count: null,
  pet_count: 3,
  pet_type: "dog",
  room_count: null,
  current_topic: "booking_price",
  last_updated_at: null,
};

const repricedNoPetContext = {
  ...completeDogContext,
  check_in: "2026-10-01",
  check_out: "2026-10-02",
  pet_count: 0,
  pet_type: null,
  last_updated_at: "2026-08-02T08:00:00.000Z",
};

const previousPricingAssistant = {
  sender: "ai",
  message:
    "收到，目前是 2027 年 7 月 26 日入住、7 月 27 日退房，15 位包棟，住宿房價為 NT$48,000。另會攜帶 3 隻狗，目前房價尚未包含寵物相關費用，寵物費與安排需再由管家確認。",
  metadata: {
    lodging_price_status: "resolved",
    lodging_price_amount: 48000,
    price_calculation_route: "existing_official_pricing",
    pricing_override_applied: true,
    pricing_reply_mode: "initial_quote",
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

function semantic(turnAction, overrides = {}) {
  return {
    turn_action: turnAction,
    intent: "pricing",
    topic: "booking_price",
    is_follow_up: true,
    context_patch: {},
    clear_fields: [],
    selected_faq_ids: [],
    missing_fields: [],
    route: "collect_info",
    needs_human: false,
    reply_draft: "",
    confidence: 0.9,
    ...overrides,
  };
}

function contextUpdate(previousContext, message) {
  return buildConversationContextUpdate({
    previousContext,
    recentMessages: [],
    message,
    dateInfo,
    nowIso: "2026-08-02T08:00:00.000Z",
  });
}

describe("turn action executor", () => {
  it("executes semantic update_quote and reprices changed dates", async () => {
    const result = await executeTurnAction({
      message: "換成下個月第一天",
      semanticResult: semantic("update_quote"),
      routeResult: route(),
      context: repricedNoPetContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(result).toMatchObject({
      route: "reprice_after_context_change",
      providerUsed: "official_pricing",
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
    expect(result.answer).toContain("住宿房價為 NT$37,500");
    expect(result.semanticMetadata).toMatchObject({
      semantic_turn_action: "update_quote",
      validated_turn_action: "update_quote",
      turn_action_validator_result: "accepted",
      changed_fields: ["check_in", "check_out", "pet_count", "pet_type"],
      action_executor_result: "update_quote_pricing_resolved",
      pet_fee_status: "not_applicable",
      unresolved_price_items: [],
      needs_human: false,
    });
  });

  it("produces the same update_quote result for different wording once semantic action is fixed", async () => {
    for (const message of ["日期改10月1號到2號", "剛剛日期講錯了", "毛孩不去了"]) {
      const result = await executeTurnAction({
        message,
        semanticResult: semantic("update_quote"),
        routeResult: route(),
        context: repricedNoPetContext,
        previousContext: completeDogContext,
        recentMessages: [previousPricingAssistant],
      });

      expect(result.route).toBe("reprice_after_context_change");
      expect(result.answer).toContain("NT$37,500");
      expect(result.semanticMetadata.changed_fields).toEqual([
        "check_in",
        "check_out",
        "pet_count",
        "pet_type",
      ]);
    }
  });

  it("asks only for missing fields when update_quote is incomplete", async () => {
    const update = contextUpdate(completeDogContext, "日期改了");
    const result = await executeTurnAction({
      message: "日期改了",
      semanticResult: semantic("update_quote"),
      routeResult: route(),
      context: update.context,
      previousContext: update.previousContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(result).toMatchObject({
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
      shouldMarkNeedsHuman: false,
    });
    expect(result.answer).toContain("入住日期");
    expect(result.answer).not.toContain("NT$48,000");
    expect(result.semanticMetadata.changed_fields).toEqual(["check_in", "check_out"]);
    expect(result.semanticMetadata.action_executor_result).toBe(
      "update_quote_missing_fields"
    );
  });

  it("does not quote a new session that only provides dates", async () => {
    const update = contextUpdate(null, "日期改10月1號到2號");
    const result = await executeTurnAction({
      message: "日期改10月1號到2號",
      semanticResult: semantic("update_quote"),
      routeResult: route(),
      context: update.context,
      previousContext: update.previousContext,
      recentMessages: [],
    });

    expect(result.route).toBe("faq_collect_info");
    expect(result.answer).toContain("已先記下目前資訊");
    expect(result.answer).not.toContain("NT$37,500");
    expect(result.semanticMetadata.action_executor_result).toBe(
      "update_quote_without_pricing_session"
    );
  });

  it("confirms and explains only the latest same-session verified quote", async () => {
    const confirm = await executeTurnAction({
      message: "確定嗎",
      semanticResult: semantic("confirm_quote"),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });
    const explain = await executeTurnAction({
      message: "怎麼算的",
      semanticResult: semantic("explain_quote"),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(confirm.route).toBe("quote_confirmation");
    expect(confirm.answer).toContain("是的");
    expect(confirm.answer).toContain("每人 NT$3,200");
    expect(explain.route).toBe("quote_breakdown");
    expect(explain.answer).toContain("正式價目表");
    expect(explain.answer).toContain("小計 NT$48,000");
  });

  it("does not confirm a quote without same-session verified pricing metadata", async () => {
    const result = await executeTurnAction({
      message: "確定嗎",
      semanticResult: semantic("confirm_quote"),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [],
    });

    expect(result.route).toBe("confirm_quote");
    expect(result.answer).toContain("想確認哪一項資訊");
    expect(result.answer).not.toContain("NT$48,000");
  });

  it("answers lodging_only_quote with server-side subtotal", async () => {
    const result = await executeTurnAction({
      message: "不含狗狗多少",
      semanticResult: semantic("lodging_only_quote"),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(result.route).toBe("lodging_only_quote");
    expect(result.answer).toContain("住宿小計是 NT$48,000");
    expect(result.answer).toContain("不含 3 隻狗寵物費");
  });

  it("keeps ask_information from being covered by pricing", async () => {
    const result = await executeTurnAction({
      message: "可以烤肉嗎",
      semanticResult: semantic("ask_information", {
        intent: "facilities",
        topic: "barbecue",
        route: "grounded_reply",
      }),
      routeResult: route({
        route: "semantic_grounded",
        providerUsed: "deepseek_semantic",
        answer: "可以使用烤肉區，實際安排請依現場規範。",
        knowledgeGap: false,
        shouldMarkNeedsHuman: false,
      }),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(result.route).toBe("semantic_grounded");
    expect(result.answer).toContain("烤肉區");
    expect(result.answer).not.toContain("NT$48,000");
    expect(result.semanticMetadata.pricing_override_applied).toBe(false);
  });

  it("keeps switch_topic and acknowledge from being covered by pricing", async () => {
    const switchTopic = await executeTurnAction({
      message: "重新問妳問題",
      semanticResult: semantic("switch_topic", {
        intent: "general",
        topic: "switch_topic",
      }),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });
    const acknowledge = await executeTurnAction({
      message: "謝謝",
      semanticResult: semantic("acknowledge", {
        intent: "general",
        topic: "acknowledge",
      }),
      routeResult: route(),
      context: completeDogContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(switchTopic.route).toBe("switch_topic");
    expect(switchTopic.answer).toContain("重新了解哪個問題");
    expect(switchTopic.answer).not.toContain("NT$48,000");
    expect(switchTopic.conversationContextPatch).toMatchObject({
      active_intent: null,
      current_topic: null,
    });
    expect(acknowledge.route).toBe("acknowledge");
    expect(acknowledge.answer).toContain("可以再問我");
    expect(acknowledge.answer).not.toContain("NT$48,000");
  });

  it("uses deterministic fallback actions consistently in legacy and shadow", async () => {
    for (const semanticMode of ["legacy", "shadow"]) {
      const result = await executeTurnAction({
        message: "日期改了，改到10月1號到2號，不帶狗",
        semanticResult: null,
        routeResult: route({
          semanticMetadata: {
            semantic_mode: semanticMode,
          },
        }),
        context: repricedNoPetContext,
        previousContext: completeDogContext,
        recentMessages: [previousPricingAssistant],
      });

      expect(result.route).toBe("reprice_after_context_change");
      expect(result.answer).toContain("NT$37,500");
      expect(result.semanticMetadata.semantic_mode).toBe(semanticMode);
      expect(result.semanticMetadata.validated_turn_action).toBe("update_quote");
    }
  });

  it("does not use model-generated pricing over server-side amount", async () => {
    const result = await executeTurnAction({
      message: "日期改了，改到10月1號到2號，不帶狗",
      semanticResult: semantic("update_quote", {
        reply_draft: "新的房價是 NT$1,000。",
      }),
      routeResult: route({
        providerUsed: "deepseek_semantic",
        answer: "新的房價是 NT$1,000。",
      }),
      context: repricedNoPetContext,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
    });

    expect(result.answer).toContain("NT$37,500");
    expect(result.answer).not.toContain("NT$1,000");
  });
});
