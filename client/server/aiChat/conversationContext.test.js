import { describe, expect, it } from "vitest";
import {
  buildConversationContextUpdate,
  buildConversationPromptContext,
  buildConversationRetrievalText,
  buildContextualKnowledgeGapReply,
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
});
