import { describe, expect, it } from "vitest";
import { retrieveFaqItems } from "./faqRetrieval.js";
import {
  buildKnowledgeMetadata,
  routeKnowledge,
} from "./knowledgeRouter.js";

function faq(overrides = {}) {
  return {
    id: "faq-test",
    category: "寵物友善",
    question: "可以帶狗嗎？",
    answer: "可以，慢慢蒔光是寵物友善 villa，可以帶狗狗一起入住。",
    keywords: ["可以帶狗嗎"],
    priority: 80,
    is_active: true,
    status: "approved",
    answer_mode: "direct",
    ...overrides,
  };
}

describe("strict knowledge router", () => {
  it("routes the dog question to a high-confidence approved FAQ", async () => {
    const result = await routeKnowledge({ message: "可以帶狗嗎？" });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      confidence: "high",
      matchedFaqIds: ["faq-227"],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
  });

  it("formally answers an exact approved active FAQ", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      faqItems: [faq()],
    });

    expect(result.route).toBe("faq_direct");
    expect(result.answer).toContain("寵物友善");
  });

  it("rejects an inactive FAQ even on an exact match", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      faqItems: [faq({ is_active: false })],
    });

    expect(result).toMatchObject({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      matchedFaqIds: [],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
    });
  });

  it("rejects a needs_review FAQ even on an exact match", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      faqItems: [faq({ status: "needs_review" })],
    });

    expect(result.route).toBe("knowledge_gap");
    expect(result.matchedFaqIds).toEqual([]);
  });

  it("does not treat a single broad keyword as high confidence", async () => {
    const result = await routeKnowledge({ message: "入住" });

    expect(result.route).toBe("knowledge_gap");
    expect(result.confidence).toBe("medium");
    expect(result.reason).toBe("single_broad_keyword");
  });

  it("marks in-scope lodging questions without a high FAQ as a knowledge gap", async () => {
    const result = await routeKnowledge({
      message: "民宿可以借直升機嗎？",
    });

    expect(result).toMatchObject({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
  });

  it("keeps clearly out-of-scope questions on the scope guard route", async () => {
    const result = await routeKnowledge({ message: "股票可以買嗎？" });

    expect(result).toMatchObject({
      route: "scope_guard",
      providerUsed: "scope_guard",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
    });
  });

  it("answers greetings locally without DeepSeek or support escalation", async () => {
    const result = await routeKnowledge({ message: "hi" });

    expect(result).toMatchObject({
      route: "local_intent",
      providerUsed: "local_intent",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
    });
    expect(result.answer).toContain("嗨，我是慢寶");
  });

  it("honors answer_mode=ask_human without calling DeepSeek", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      faqItems: [faq({ answer_mode: "ask_human" })],
    });

    expect(result).toMatchObject({
      route: "ask_human",
      providerUsed: "ask_human",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      answerMode: "ask_human",
    });
  });

  it("answers supported parts and escalates unsupported parts without guessing", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？可以借直升機嗎？",
    });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      matchedFaqIds: ["faq-227"],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
    expect(result.answer).toContain("可以，慢慢蒔光是寵物友善");
    expect(result.answer).toContain("請管家協助確認");
  });

  it("downgrades close FAQ candidates instead of marking them high", async () => {
    const items = [
      faq({
        id: "faq-close-a",
        category: "寵物友善",
        question: "寵物可以入住嗎？",
        answer: "可以攜帶寵物入住，請提前告知。",
        keywords: ["寵物"],
      }),
      faq({
        id: "faq-close-b",
        category: "交通停車",
        question: "寵物可以坐接駁車嗎？",
        answer: "接駁安排需由管家確認。",
        keywords: ["寵物"],
      }),
    ];
    const retrieved = await retrieveFaqItems("寵物", { items, limit: 2 });

    expect(retrieved[0].confidence).not.toBe("high");
    expect(retrieved[0].rejectionReason).toBe("single_broad_keyword");
  });

  it("does not ground DeepSeek with different-category top candidates", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？有停車位嗎？",
    });

    expect(result.route).not.toBe("deepseek_grounded");
    expect(result.shouldCallDeepSeek).toBe(false);
  });

  it("exposes safe metadata for faq_direct responses", async () => {
    const result = await routeKnowledge({ message: "可以帶狗嗎？" });
    const metadata = buildKnowledgeMetadata(result, "request-1");

    expect(metadata).toMatchObject({
      requestId: "request-1",
      provider_used: "faq_direct",
      matchedFaqIds: ["faq-227"],
      matchedFaqCount: 1,
      matchConfidence: "high",
      ai_skipped: true,
      knowledge_gap: false,
    });
    expect(result.shouldCallDeepSeek).toBe(false);
  });

  it("keeps human takeover ahead of strict routing", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      session: { status: "human_takeover" },
    });

    expect(result).toMatchObject({
      route: "human_takeover",
      providerUsed: "human_takeover",
      shouldCallDeepSeek: false,
    });
  });

  it("still answers FAQ questions while a session is only needs_human", async () => {
    const result = await routeKnowledge({
      message: "可以帶狗嗎？",
      session: {
        status: "ai_active",
        support_status: "needs_human",
        should_ai_reply: true,
      },
    });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      matchedFaqIds: ["faq-227"],
      shouldCallDeepSeek: false,
    });
  });
});
