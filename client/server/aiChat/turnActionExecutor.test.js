import { describe, expect, it } from "vitest";
import { buildConversationContextUpdate } from "./conversationContext.js";
import { applyContextFreshnessGuard } from "./contextFreshnessGuard.js";
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

const oldQuoteContext = {
  active_intent: "pricing",
  stay_type: "villa",
  check_in: "2026-10-01",
  check_out: "2026-10-02",
  guest_count: 15,
  adult_count: null,
  child_count: null,
  pet_count: 0,
  pet_type: null,
  room_count: null,
  current_topic: "booking_price",
  last_updated_at: null,
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

const septemberVillaDogDetails = {
  active_intent: null,
  stay_type: "villa",
  check_in: "2026-09-09",
  check_out: "2026-09-10",
  guest_count: 10,
  adult_count: null,
  child_count: null,
  pet_count: 3,
  pet_type: "dog",
  room_count: null,
  current_topic: null,
  last_updated_at: null,
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
    mentioned_fields: [],
    uncertain_fields: [],
    uses_relative_date: false,
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

function expectSeptemberPartialQuote(result, expectedRoute = "partial_grounded_reply") {
  expect(result).toMatchObject({
    route: expectedRoute,
    providerUsed: "official_pricing",
    shouldMarkNeedsHuman: true,
    knowledgeGap: false,
  });
  expect(result.answer).toContain("NT$25,000");
  expect(result.answer).toContain("3 隻狗");
  expect(result.answer).not.toContain("實際房價及寵物安排仍需由管家確認");
  expect(result.answer).not.toContain("實際房價需由管家確認");
  expect(result.semanticMetadata).toMatchObject({
    pricing_called: true,
    lodging_price_status: "resolved",
    lodging_price_amount: 25000,
    pet_fee_status: "unresolved",
    unresolved_price_items: ["pet_fee"],
    final_route: expectedRoute,
    needs_human: true,
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

  it("does not reuse stale dates when the current turn mentions a relative date", async () => {
    const freshnessGuard = applyContextFreshnessGuard({
      oldContext: repricedNoPetContext,
      context: repricedNoPetContext,
      semanticResult: semantic("request_quote", {
        mentioned_fields: ["check_in", "stay_type"],
        context_patch: {
          active_intent: "pricing",
          stay_type: "villa",
        },
        uncertain_fields: ["check_out"],
        uses_relative_date: true,
      }),
      currentMessage: "後天包棟多少錢",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
      sourceMessageId: "request-relative-date",
    });

    const result = await executeTurnAction({
      message: "後天包棟多少錢",
      semanticResult: semantic("request_quote", {
        mentioned_fields: ["check_in", "stay_type"],
        uncertain_fields: ["check_out"],
        uses_relative_date: true,
      }),
      routeResult: route(),
      context: freshnessGuard.context,
      previousContext: repricedNoPetContext,
      recentMessages: [previousPricingAssistant],
      freshnessGuard,
    });

    expect(result.route).toBe("faq_collect_info");
    expect(result.answer).toContain("2026年8月4日");
    expect(result.answer).toContain("2026年8月5日");
    expect(result.answer).not.toContain("NT$37,500");
    expect(result.semanticMetadata).toMatchObject({
      freshness_guard_result: "blocked_stale_fields",
      stale_fields_blocked: expect.arrayContaining(["check_in", "check_out"]),
      uncertain_fields: expect.arrayContaining(["check_out"]),
      pricing_called: false,
      action_executor_result: "freshness_guard_blocked_pricing",
    });
    expect(result.conversationContextPatch.pending_interaction).toMatchObject({
      action: "confirm_quote_dates",
      proposed_values: {
        check_in: "2026-08-04",
        check_out: "2026-08-05",
      },
      required_response_type: "confirmation",
    });
  });

  it("handles the quote date pending flow before pricing", async () => {
    const initialSemantic = semantic("request_quote", {
      is_follow_up: false,
      mentioned_fields: ["check_in", "stay_type"],
      context_patch: {
        active_intent: "pricing",
        stay_type: "villa",
      },
      uncertain_fields: ["check_out"],
      uses_relative_date: true,
    });
    const initialGuard = applyContextFreshnessGuard({
      oldContext: oldQuoteContext,
      context: oldQuoteContext,
      semanticResult: initialSemantic,
      currentMessage: "後天包棟多少錢",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
      sourceMessageId: "request-a",
    });
    const initial = await executeTurnAction({
      message: "後天包棟多少錢",
      semanticResult: initialSemantic,
      routeResult: route(),
      context: initialGuard.context,
      previousContext: oldQuoteContext,
      recentMessages: [previousPricingAssistant],
      freshnessGuard: initialGuard,
      nowIso: "2026-08-02T08:00:00.000Z",
      sourceMessageId: "request-a",
    });
    const afterInitial = {
      ...initialGuard.context,
      ...(initial.conversationContextPatch || {}),
    };

    expect(initial.answer).toContain("2026年8月4日");
    expect(initial.answer).not.toContain("NT$37,500");
    expect(afterInitial.guest_count).toBeNull();
    expect(afterInitial.pet_count).toBeNull();
    expect(afterInitial.pending_interaction.action).toBe("confirm_quote_dates");

    const confirm = await executeTurnAction({
      message: "對",
      semanticResult: semantic("confirm_pending", {
        intent: "pricing",
        topic: "booking_price",
        route: "collect_info",
      }),
      routeResult: route(),
      context: afterInitial,
      previousContext: initialGuard.context,
      recentMessages: [],
      nowIso: "2026-08-02T08:01:00.000Z",
      sourceMessageId: "request-b",
    });
    const afterConfirm = {
      ...afterInitial,
      ...(confirm.conversationContextPatch || {}),
    };

    expect(confirm.route).toBe("faq_collect_info");
    expect(confirm.answer).toContain("已確認為2026年8月4日入住、2026年8月5日退房");
    expect(confirm.answer).toContain("共有幾位入住");
    expect(confirm.answer).toContain("是否攜帶寵物");
    expect(confirm.answer).not.toContain("NT$37,500");
    expect(afterConfirm.check_in).toBe("2026-08-04");
    expect(afterConfirm.check_out).toBe("2026-08-05");
    expect(afterConfirm.pending_interaction.action).toBe("collect_quote_fields");

    const answeredContext = {
      ...afterConfirm,
      guest_count: 15,
      pet_count: 0,
      pet_type: null,
    };
    const answered = await executeTurnAction({
      message: "15人，不帶狗",
      semanticResult: semantic("answer_pending", {
        intent: "pricing",
        topic: "booking_price",
        mentioned_fields: ["guest_count", "pet_count", "pet_type"],
        context_patch: {
          guest_count: 15,
          pet_count: 0,
        },
        clear_fields: ["pet_type"],
      }),
      routeResult: route(),
      context: answeredContext,
      previousContext: afterConfirm,
      recentMessages: [],
      nowIso: "2026-08-02T08:02:00.000Z",
      sourceMessageId: "request-c",
    });

    expect(answered.providerUsed).toBe("official_pricing");
    expect(answered.answer).toContain("15 位包棟");
    expect(answered.answer).toContain("住宿房價");
    expect(answered.answer).not.toContain("寵物費");
    expect(answered.conversationContextPatch.pending_interaction).toBeNull();
    expect(answered.semanticMetadata).toMatchObject({
      pending_action_before: "collect_quote_fields",
      pending_resolution: "answered",
      resumed_turn_action: "request_quote",
      pricing_called: true,
    });
  });

  it("resumes request_quote from confirm_pending and calculates partial lodging price", async () => {
    const result = await executeTurnAction({
      message: "YES",
      semanticResult: semantic("confirm_pending", {
        intent: "pricing",
        topic: "booking_price",
      }),
      routeResult: route(),
      context: {
        ...septemberVillaDogDetails,
        check_in: null,
        check_out: null,
        pending_interaction: {
          action: "confirm_quote_dates",
          proposed_values: {
            check_in: "2026-09-09",
            check_out: "2026-09-10",
          },
          required_response_type: "confirmation",
          resume_action: "request_quote",
          source_assistant_message_id: "assistant-september",
          created_at: "2026-08-02T08:00:00.000Z",
          expires_at: "2026-08-02T08:30:00.000Z",
        },
      },
      previousContext: {
        ...septemberVillaDogDetails,
        check_in: null,
        check_out: null,
      },
      recentMessages: [],
      nowIso: "2026-08-02T08:01:00.000Z",
      sourceMessageId: "request-september-confirm",
    });

    expectSeptemberPartialQuote(result);
    expect(result.answer).toContain("已確認為");
    expect(result.conversationContextPatch).toMatchObject({
      check_in: "2026-09-09",
      check_out: "2026-09-10",
      pending_interaction: null,
    });
    expect(result.semanticMetadata).toMatchObject({
      pending_action_before: "confirm_quote_dates",
      pending_resolution: "confirmed",
      resumed_turn_action: "request_quote",
      action_executor_result: "request_quote_pricing_resolved",
    });
  });

  it("uses the same pricing capability for direct request_quote with complete context", async () => {
    const result = await executeTurnAction({
      message: "那房價呢",
      semanticResult: semantic("request_quote"),
      routeResult: route(),
      context: septemberVillaDogDetails,
      previousContext: septemberVillaDogDetails,
      recentMessages: [],
    });

    expectSeptemberPartialQuote(result);
    expect(result.semanticMetadata).toMatchObject({
      semantic_turn_action: "request_quote",
      validated_turn_action: "request_quote",
      action_executor_result: "request_quote_pricing_resolved",
    });
  });

  it("resumes request_quote after answer_pending supplies the final guest count", async () => {
    const result = await executeTurnAction({
      message: "10人",
      semanticResult: semantic("answer_pending", {
        context_patch: { guest_count: 10 },
        mentioned_fields: ["guest_count"],
      }),
      routeResult: route(),
      context: {
        ...septemberVillaDogDetails,
        pending_interaction: {
          action: "collect_quote_fields",
          required_response_type: "fields",
          required_fields: ["guest_count"],
          resume_action: "request_quote",
          source_assistant_message_id: "assistant-collect",
          created_at: "2026-08-02T08:00:00.000Z",
          expires_at: "2026-08-02T08:30:00.000Z",
        },
      },
      previousContext: {
        ...septemberVillaDogDetails,
        guest_count: null,
      },
      recentMessages: [],
      nowIso: "2026-08-02T08:01:00.000Z",
      sourceMessageId: "request-september-answer",
    });

    expectSeptemberPartialQuote(result);
    expect(result.conversationContextPatch.pending_interaction).toBeNull();
    expect(result.semanticMetadata).toMatchObject({
      pending_action_before: "collect_quote_fields",
      pending_resolution: "answered",
      resumed_turn_action: "request_quote",
      action_executor_result: "request_quote_pricing_resolved",
    });
  });

  it("uses the same pricing handler after update_quote changes the date", async () => {
    const result = await executeTurnAction({
      message: "改成9月9到10號",
      semanticResult: semantic("update_quote", {
        context_patch: {
          check_in: "2026-09-09",
          check_out: "2026-09-10",
        },
        mentioned_fields: ["check_in", "check_out"],
      }),
      routeResult: route(),
      context: septemberVillaDogDetails,
      previousContext: {
        ...septemberVillaDogDetails,
        check_in: "2026-10-01",
        check_out: "2026-10-02",
      },
      recentMessages: [previousPricingAssistant],
    });

    expectSeptemberPartialQuote(result, "reprice_after_context_change");
    expect(result.route).toBe("reprice_after_context_change");
    expect(result.semanticMetadata).toMatchObject({
      validated_turn_action: "update_quote",
      action_executor_result: "update_quote_pricing_resolved",
    });
  });

  it("keeps pricing capability results consistent across semantic modes", async () => {
    for (const semanticMode of ["legacy", "shadow", "hybrid"]) {
      const result = await executeTurnAction({
        message: "那房價呢",
        semanticResult: semantic("request_quote"),
        routeResult: route({
          semanticMetadata: { semantic_mode: semanticMode },
        }),
        context: septemberVillaDogDetails,
        previousContext: septemberVillaDogDetails,
        recentMessages: [],
      });

      expectSeptemberPartialQuote(result);
      expect(result.semanticMetadata.semantic_mode).toBe(semanticMode);
    }
  });

  it("rejects and modifies pending values without applying stale proposals", async () => {
    const pending = {
      action: "confirm_quote_dates",
      proposed_values: {
        check_in: "2026-08-04",
        check_out: "2026-08-05",
        stay_type: "villa",
      },
      required_response_type: "confirmation",
      resume_action: "request_quote",
      source_assistant_message_id: "assistant-a",
      created_at: "2026-08-02T08:00:00.000Z",
      expires_at: "2026-08-02T08:30:00.000Z",
    };
    const contextWithPending = {
      ...oldQuoteContext,
      guest_count: null,
      pet_count: null,
      pending_interaction: pending,
    };
    const rejected = await executeTurnAction({
      message: "不是",
      semanticResult: semantic("reject_pending"),
      routeResult: route(),
      context: contextWithPending,
      previousContext: oldQuoteContext,
      recentMessages: [],
      nowIso: "2026-08-02T08:01:00.000Z",
    });

    expect(rejected.answer).toContain("先不套用");
    expect(rejected.conversationContextPatch.pending_interaction).toBeNull();
    expect(rejected.semanticMetadata.pending_resolution).toBe("rejected");

    const modifiedContext = {
      ...contextWithPending,
      check_in: "2026-08-06",
      check_out: "2026-08-07",
    };
    const modified = await executeTurnAction({
      message: "不是，是8/6到8/7",
      semanticResult: semantic("modify_pending", {
        context_patch: {
          check_in: "2026-08-06",
          check_out: "2026-08-07",
        },
        mentioned_fields: ["check_in", "check_out"],
      }),
      routeResult: route(),
      context: modifiedContext,
      previousContext: contextWithPending,
      recentMessages: [],
      nowIso: "2026-08-02T08:01:00.000Z",
    });

    expect(modified.route).toBe("faq_collect_info");
    expect(modified.answer).toContain("2026年8月6日");
    expect(modified.answer).toContain("共有幾位入住");
    expect(modified.conversationContextPatch.pending_interaction.action).toBe(
      "collect_quote_fields"
    );
    expect(modified.semanticMetadata.pending_resolution).toBe("modified");
  });

  it("does not apply expired pending interactions", async () => {
    const result = await executeTurnAction({
      message: "對",
      semanticResult: semantic("confirm_pending"),
      routeResult: route(),
      context: {
        ...oldQuoteContext,
        pending_interaction: {
          action: "confirm_quote_dates",
          proposed_values: {
            check_in: "2026-08-04",
            check_out: "2026-08-05",
          },
          required_response_type: "confirmation",
          resume_action: "request_quote",
          created_at: "2026-08-02T08:00:00.000Z",
          expires_at: "2026-08-02T08:10:00.000Z",
        },
      },
      previousContext: oldQuoteContext,
      recentMessages: [],
      nowIso: "2026-08-02T08:31:00.000Z",
    });

    expect(result.answer).toContain("已過期");
    expect(result.conversationContextPatch.pending_interaction).toBeNull();
    expect(result.semanticMetadata.pending_resolution).toBe("expired");
  });

  it("does not reuse stale guest count when the customer only says the count changed", async () => {
    const freshnessGuard = applyContextFreshnessGuard({
      oldContext: completeDogContext,
      context: completeDogContext,
      semanticResult: semantic("update_quote", {
        mentioned_fields: ["guest_count"],
        uncertain_fields: ["guest_count"],
      }),
      currentMessage: "人數要改",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    const result = await executeTurnAction({
      message: "人數要改",
      semanticResult: semantic("update_quote", {
        mentioned_fields: ["guest_count"],
        uncertain_fields: ["guest_count"],
      }),
      routeResult: route(),
      context: freshnessGuard.context,
      previousContext: completeDogContext,
      recentMessages: [previousPricingAssistant],
      freshnessGuard,
    });

    expect(result.route).toBe("faq_collect_info");
    expect(result.answer).toContain("新的入住人數");
    expect(result.answer).not.toContain("15");
    expect(result.answer).not.toContain("NT$48,000");
    expect(result.semanticMetadata.stale_fields_blocked).toContain("guest_count");
    expect(result.semanticMetadata.pricing_called).toBe(false);
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

  it("handles casual conversation without scope guard wording", async () => {
    const result = await executeTurnAction({
      message: "你多大",
      semanticResult: semantic("casual_conversation", {
        intent: "general",
        topic: "about_mumbao",
        route: "grounded_reply",
      }),
      routeResult: route({
        route: "scope_guard",
        providerUsed: "scope_guard",
        answer: "慢寶目前主要協助回答慢慢蒔光住宿問題喔。",
      }),
      context: {},
      previousContext: {},
      recentMessages: [],
    });

    expect(result.route).toBe("casual_conversation");
    expect(result.answer).toContain("我是慢寶");
    expect(result.answer).toContain("沒有真正的年齡");
    expect(result.answer).not.toContain("主要協助回答");
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
