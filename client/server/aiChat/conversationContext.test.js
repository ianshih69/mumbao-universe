import { describe, expect, it } from "vitest";
import {
  buildConversationContextUpdate,
  buildConversationPromptContext,
  buildConversationRetrievalText,
  buildContextualKnowledgeGapReply,
  buildContextualKnowledgeRouteOverride,
} from "./conversationContext.js";

const dateInfo = {
  currentDate: "2026-08-02",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};

function update(previousContext, message, recentMessages = []) {
  return buildConversationContextUpdate({
    previousContext,
    message,
    recentMessages,
    dateInfo,
    nowIso: "2026-08-02T08:00:00.000Z",
  });
}

describe("AI chat conversation context", () => {
  it("carries villa pricing intent into a short date fragment", () => {
    const first = update(null, "包棟價格");
    const second = update(null, "9/26-27", [
      {
        sender: "user",
        message: "包棟價格",
        created_at: "2026-08-02T07:59:00.000Z",
      },
    ]);

    expect(first.context).toMatchObject({
      active_intent: "pricing",
      stay_type: "villa",
      current_topic: "booking_price",
    });
    expect(second.context).toMatchObject({
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
    });
    expect(second.retrievalText).toContain("查詢住宿價格");
    expect(second.retrievalText).toContain("包棟");
    expect(second.retrievalText).toContain("2026-09-26入住");
  });

  it("merges people and pets into the existing stay request", () => {
    const state = {
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
    };
    const result = update(state, "10人＋3隻狗費用多少");

    expect(result.context).toMatchObject({
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    });
    expect(result.retrievalText).toContain("10人");
    expect(result.retrievalText).toContain("3隻狗");
  });

  it("overwrites guest count without losing dates or pets", () => {
    const result = update(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-26",
        check_out: "2026-09-27",
        guest_count: 10,
        pet_count: 3,
        pet_type: "dog",
      },
      "改成12人",
    );

    expect(result.context).toMatchObject({
      guest_count: 12,
      pet_count: 3,
      pet_type: "dog",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
    });
  });

  it("clears old pet data when the customer says they will not bring pets", () => {
    const result = update(
      {
        active_intent: "pricing",
        stay_type: "villa",
        pet_count: 3,
        pet_type: "dog",
      },
      "不帶狗了",
    );

    expect(result.context.pet_count).toBe(0);
    expect(result.context.pet_type).toBeNull();
    expect(result.retrievalText).toContain("不帶寵物");
  });

  it("overwrites dates using the nearest future year", () => {
    const result = update(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-26",
        check_out: "2026-09-27",
      },
      "日期改10/3-4",
    );

    expect(result.context.check_in).toBe("2026-10-03");
    expect(result.context.check_out).toBe("2026-10-04");
  });

  it("does not infer yearless dates into the past", () => {
    const result = buildConversationContextUpdate({
      previousContext: { active_intent: "pricing", stay_type: "villa" },
      message: "9/26-27",
      dateInfo: {
        ...dateInfo,
        currentDate: "2026-10-01",
      },
      nowIso: "2026-10-01T08:00:00.000Z",
    });

    expect(result.context.check_in).toBe("2027-09-26");
    expect(result.context.check_out).toBe("2027-09-27");
  });

  it("infers a past yearless date range as the nearest future year", () => {
    const result = buildConversationContextUpdate({
      previousContext: { active_intent: "pricing", stay_type: "villa" },
      message: "7/26-7/27",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    expect(result.context.check_in).toBe("2027-07-26");
    expect(result.context.check_out).toBe("2027-07-27");
  });

  it("parses cross-month date fragments in the current future year", () => {
    const result = update(
      { active_intent: "pricing", stay_type: "villa" },
      "9/30-10/1",
    );

    expect(result.context.check_in).toBe("2026-09-30");
    expect(result.context.check_out).toBe("2026-10-01");
  });

  it("parses cross-year date fragments using checkout in the next year", () => {
    const result = update(
      { active_intent: "pricing", stay_type: "villa" },
      "12/31-1/1",
    );

    expect(result.context.check_in).toBe("2026-12-31");
    expect(result.context.check_out).toBe("2027-01-01");
  });

  it("parses year-qualified start dates with same-month checkout day", () => {
    const result = update(
      { active_intent: "pricing", stay_type: "villa" },
      "2027/9/26-27",
    );

    expect(result.context.check_in).toBe("2027-09-26");
    expect(result.context.check_out).toBe("2027-09-27");
  });

  it("keeps stay conditions while switching between facilities and pricing topics", () => {
    const stayState = {
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    };
    const barbecue = update(stayState, "那可以烤肉嗎？");
    const price = update(barbecue.context, "那總共多少？");

    expect(barbecue.context).toMatchObject({
      active_intent: "facilities",
      current_topic: "barbecue",
      stay_type: "villa",
      guest_count: 10,
      pet_count: 3,
    });
    expect(price.context).toMatchObject({
      active_intent: "pricing",
      current_topic: "booking_price",
      stay_type: "villa",
      guest_count: 10,
      pet_count: 3,
    });
  });

  it("does not leak context into a fresh session", () => {
    const fresh = update(null, "多少錢？");

    expect(fresh.context.check_in).toBeNull();
    expect(fresh.context.guest_count).toBeNull();
    expect(fresh.context.pet_count).toBeNull();
    expect(fresh.context.stay_type).toBeNull();
  });

  it("restores stored session context after reopening the same session", () => {
    const storedContext = {
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
      current_topic: "booking_price",
    };

    const result = update(storedContext, "改成12人");

    expect(result.previousContext).toMatchObject(storedContext);
    expect(result.context.guest_count).toBe(12);
    expect(result.context.check_in).toBe("2026-09-26");
  });

  it("keeps pending interaction inside the stored conversation context", () => {
    const pending = {
      action: "confirm_quote_dates",
      proposed_values: {
        check_in: "2026-08-04",
        check_out: "2026-08-05",
      },
      required_response_type: "confirmation",
      resume_action: "request_quote",
      source_assistant_message_id: "request-1",
      created_at: "2026-08-02T08:00:00.000Z",
      expires_at: "2026-08-02T08:30:00.000Z",
    };
    const result = update({ pending_interaction: pending }, "對");

    expect(result.previousContext.pending_interaction).toMatchObject({
      action: "confirm_quote_dates",
      proposed_values: {
        check_in: "2026-08-04",
        check_out: "2026-08-05",
      },
    });
    expect(result.promptContext).toContain("pending_interaction");
    expect(result.promptContext).toContain("confirm_quote_dates");
  });

  it("resets context for explicit restart messages", () => {
    const result = update(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2026-09-26",
        guest_count: 10,
        pet_count: 3,
      },
      "重新開始",
    );

    expect(result.reset).toBe(true);
    expect(result.context.active_intent).toBeNull();
    expect(result.context.check_in).toBeNull();
    expect(result.context.guest_count).toBeNull();
    expect(result.context.pet_count).toBeNull();
  });

  it("keeps the structured prompt context compact and factual about customer needs only", () => {
    const context = update(null, "包棟 9/26-27 10人 3隻狗費用多少").context;
    const promptContext = buildConversationPromptContext(context);

    expect(promptContext.length).toBeLessThan(1500);
    expect(promptContext).toContain("<customer_request_context>");
    expect(promptContext).toContain("active_intent: pricing");
    expect(promptContext).toContain("check_in: 2026-09-26");
    expect(promptContext).toContain("這不是民宿事實");
  });

  it("builds a normalized retrieval query from the full collected request", () => {
    const retrievalText = buildConversationRetrievalText("費用多少", {
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    });

    expect(retrievalText).toBe("查詢住宿價格；包棟；2026-09-26入住；2026-09-27退房；10人；3隻狗；客人原句：費用多少");
  });

  it("asks only for missing booking details in a pricing knowledge gap", () => {
    const reply = buildContextualKnowledgeGapReply({
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
    });

    expect(reply).toContain("2026年9月26日入住");
    expect(reply).toContain("2026年9月27日退房");
    expect(reply).toContain("包棟");
    expect(reply).toContain("入住人數");
    expect(reply).toContain("是否攜帶寵物");
    expect(reply).not.toContain("入住日期");
  });

  it("summarizes complete pricing requirements without inventing a price", () => {
    const reply = buildContextualKnowledgeGapReply({
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2026-09-26",
      check_out: "2026-09-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    });

    expect(reply).toContain("10位入住");
    expect(reply).toContain("攜帶3隻狗");
    expect(reply).toContain("實際房價及寵物安排仍需由管家確認");
    expect(reply).not.toContain("NT$");
  });

  it("overrides generic faq_direct answers and asks only for missing guest count", () => {
    const stateAfterPets = update(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2027-07-26",
        check_out: "2027-07-27",
      },
      "3隻狗",
    ).context;
    const override = buildContextualKnowledgeRouteOverride(stateAfterPets, {
      route: "faq_direct",
      providerUsed: "faq_direct",
      answer: "請提供日期與人數。",
      answerMode: "direct",
      knowledgeGap: false,
      aiSkipped: true,
      matchedFaqItems: [
        {
          id: "faq-price-collect",
          answer: "請提供日期、人數、寵物需求。",
          answer_mode: "direct",
        },
      ],
    });

    expect(stateAfterPets).toMatchObject({
      stay_type: "villa",
      check_in: "2027-07-26",
      check_out: "2027-07-27",
      pet_count: 3,
      pet_type: "dog",
    });
    expect(override).toMatchObject({
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
      answerMode: "collect_info",
      knowledgeGap: false,
      shouldMarkNeedsHuman: false,
    });
    expect(override.answer).toContain("2027年7月26日入住");
    expect(override.answer).toContain("2027年7月27日退房");
    expect(override.answer).toContain("包棟");
    expect(override.answer).toContain("攜帶3隻狗");
    expect(override.answer).toContain("共有幾位入住");
    expect(override.answer).not.toContain("入住日期");
    expect(override.answer).not.toContain("是否攜帶寵物");
  });

  it("keeps complete villa date guest and dog context after short follow-ups", () => {
    const first = update(null, "包棟價格");
    const second = update(first.context, "7/26-27");
    const third = update(second.context, "10人");
    const fourth = update(third.context, "3隻狗");

    expect(fourth.context).toMatchObject({
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2027-07-26",
      check_out: "2027-07-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    });
    expect(
      buildContextualKnowledgeRouteOverride(fourth.context, {
        route: "faq_direct",
        providerUsed: "faq_direct",
        answer: "請提供日期與人數。",
        answerMode: "direct",
        knowledgeGap: false,
        aiSkipped: true,
      }),
    ).toMatchObject({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
  });

  it("summarizes complete needs instead of returning generic collect_info when no reliable price exists", () => {
    const override = buildContextualKnowledgeRouteOverride(
      {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2027-07-26",
        check_out: "2027-07-27",
        guest_count: 10,
        pet_count: 3,
        pet_type: "dog",
      },
      {
        route: "faq_collect_info",
        providerUsed: "faq_collect_info",
        answer: "請提供日期與人數。",
        answerMode: "collect_info",
        knowledgeGap: false,
        aiSkipped: true,
      },
    );

    expect(override).toMatchObject({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
    expect(override.answer).toContain("2027年7月26日入住");
    expect(override.answer).toContain("10位入住");
    expect(override.answer).toContain("攜帶3隻狗");
    expect(override.answer).toContain("實際房價及寵物安排仍需由管家確認");
    expect(override.answer).not.toContain("請提供日期");
  });

  it("does not use another session's collected fields for contextual FAQ overrides", () => {
    const otherSessionState = {
      active_intent: "pricing",
      stay_type: "villa",
      check_in: "2027-07-26",
      check_out: "2027-07-27",
      guest_count: 10,
      pet_count: 3,
      pet_type: "dog",
    };
    const freshSession = update(null, "多少錢？").context;
    const override = buildContextualKnowledgeRouteOverride(freshSession, {
      route: "faq_direct",
      providerUsed: "faq_direct",
      answer: "請提供日期與人數。",
      answerMode: "direct",
      knowledgeGap: false,
      aiSkipped: true,
    });

    expect(otherSessionState.check_in).toBe("2027-07-26");
    expect(freshSession.check_in).toBeNull();
    expect(override.answer).toContain("入住日期");
    expect(override.answer).toContain("共有幾位入住");
    expect(override.answer).not.toContain("2027年7月26日");
    expect(override.answer).not.toContain("10位入住");
    expect(override.answer).not.toContain("3隻狗");
  });
});
