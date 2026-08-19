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
  it("routes a natural approved payment FAQ without requiring the brand name", async () => {
    const result = await routeKnowledge({ message: "可以刷卡嗎？" });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      confidence: "high",
      matchedFaqIds: ["faq-035"],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
    });
  });

  it.each([
    ["我可以先叫你們幫我留房，晚點再匯款嗎？", "faq-006"],
    ["可以先去現場看看房間再決定嗎？", "faq-007"],
    ["你們一般客人可以刷信用卡嗎？", "faq-035"],
    ["退房後可以放行李到下午嗎？", "faq-092"],
  ])("routes natural approved FAQ %s before scope guard", async (message, faqId) => {
    const result = await routeKnowledge({ message });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      confidence: "high",
      matchedFaqIds: [faqId],
      shouldCallDeepSeek: false,
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

    expect(result.route).toBe("faq_selector_required");
    expect(result.providerUsed).toBe("faq_selector_required");
    expect(result.matchedFaqIds).toEqual([]);
    expect(result.lexicalSafeDirect).toBe(false);
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(result.reason).toBe("alias_partial_not_safe_direct");
  });

  it.each(["入住", "退房", "停車", "訂金", "行李", "付款", "刷卡"])(
    "does not lexical-direct broad or incomplete topic %s",
    async (message) => {
      const result = await routeKnowledge({ message });

      expect(result.route).not.toBe("faq_direct");
      expect(result.matchedFaqIds).toEqual([]);
      expect(result.lexicalSafeDirect).toBe(false);
      expect(result.route).toBe("faq_selector_required");
      expect(result.shouldCallDeepSeek).toBe(true);
    },
  );

  it.each(["可以停嗎", "可以刷嗎", "可以帶嗎", "幾點", "可以晚一點嗎"])(
    "does not lexical-direct vague short question %s",
    async (message) => {
      const result = await routeKnowledge({ message });

      expect(result.route).not.toBe("faq_direct");
      expect(result.matchedFaqIds).toEqual([]);
      expect(result.lexicalSafeDirect).toBe(false);
    },
  );

  it.each(["停車在哪裡", "可以停幾台", "附近哪裡可以停車"])(
    "does not lexical-direct adjacent parking intent %s",
    async (message) => {
      const result = await routeKnowledge({ message });

      expect(result.route).not.toBe("faq_direct");
      expect(result.matchedFaqIds).toEqual([]);
      expect(result.lexicalSafeDirect).toBe(false);
    },
  );

  it.each([
    "八台車停得下嗎？",
    "可以停八台嗎？",
    "九人座停得下嗎？",
    "車位夠嗎？",
    "有地方停車嗎？",
    "晚上可以停車嗎？",
    "機車可以停嗎？",
  ])("routes natural parking questions %s to the FAQ selector", async (message) => {
    const result = await routeKnowledge({ message });

    expect(result).toMatchObject({
      route: "faq_selector_required",
      providerUsed: "faq_selector_required",
      shouldCallDeepSeek: true,
      lexicalSafeDirect: false,
    });
    expect(result.matchedFaqIds).toEqual([]);
  });

  it.each(["退房後可以寄行李嗎", "可以晚退房嗎"])(
    "does not lexical-direct adjacent checkout intent %s without strong evidence",
    async (message) => {
      const result = await routeKnowledge({ message });

      expect(result.route).not.toBe("faq_direct");
      expect(result.matchedFaqIds).toEqual([]);
      expect(result.lexicalSafeDirect).toBe(false);
    },
  );

  it.each(["可以晚點匯款嗎", "訂金多少"])(
    "does not lexical-direct adjacent payment intent %s without strong evidence",
    async (message) => {
      const result = await routeKnowledge({ message });

      expect(result.route).not.toBe("faq_direct");
      expect(result.matchedFaqIds).toEqual([]);
      expect(result.lexicalSafeDirect).toBe(false);
    },
  );

  it.each([
    ["可以刷信用卡嗎", "faq-035"],
    ["尾款什麼時候付", "faq-034"],
  ])("still lexical-directs clear payment intent %s", async (message, faqId) => {
    const result = await routeKnowledge({ message });

    expect(result).toMatchObject({
      route: "faq_direct",
      matchedFaqIds: [faqId],
      lexicalSafeDirect: true,
      shouldCallDeepSeek: false,
    });
  });

  it("does not let a lower high-confidence candidate direct a medium top candidate", async () => {
    const result = await routeKnowledge({ message: "付款" });

    expect(result.route).toBe("faq_selector_required");
    expect(result.topCandidateIds[0]).toBe("faq-041");
    expect(result.confidence).toBe("medium");
    expect(result.matchedFaqIds).toEqual([]);
    expect(result.lexicalSafeDirect).toBe(false);
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(result.reason).toBe("question_partial_not_safe_direct");
  });

  it("does not let a lower high alias candidate direct a medium top candidate", async () => {
    const result = await routeKnowledge({ message: "可以停嗎" });

    expect(result.route).not.toBe("faq_direct");
    expect(result.matchedFaqIds).toEqual([]);
    expect(result.lexicalSafeDirect).toBe(false);
  });

  it("routes in-scope lodging questions without a safe FAQ to the full catalog selector", async () => {
    const result = await routeKnowledge({
      message: "民宿可以借直升機嗎？",
    });

    expect(result).toMatchObject({
      route: "faq_selector_required",
      providerUsed: "faq_selector_required",
      shouldCallDeepSeek: true,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
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

  it("keeps external credit-card recommendation questions out of the FAQ selector", async () => {
    const result = await routeKnowledge({ message: "哪張信用卡回饋最好？" });

    expect(result).toMatchObject({
      route: "scope_guard",
      providerUsed: "scope_guard",
      shouldCallDeepSeek: false,
    });
  });

  it.each([
    "9/26-27",
    "9/26-9/27",
    "7/26-7/27",
    "9/30-10/1",
    "12/31-1/1",
    "9/26～27",
    "9/26 至 9/27",
    "2027/9/26-27",
    "10人",
    "3隻狗",
    "兩晚",
    "改成12人",
    "不帶寵物了",
  ])(
    "keeps short lodging follow-up %s inside support scope when the session has pricing context",
    async (message) => {
      const result = await routeKnowledge({
        message,
        contextText: "user: 包棟價格\nassistant: 請提供入住日期、人數與寵物需求。",
        faqItems: [],
      });

      expect(result.route).not.toBe("scope_guard");
      expect(result).toMatchObject({
        route: "knowledge_gap",
        providerUsed: "knowledge_gap",
      });
    },
  );

  it.each([
    "9/26-27",
    "9/26-9/27",
    "10人",
    "兩晚",
    "改成12人",
  ])("does not treat fresh-session fragment %s as in scope by itself", async (message) => {
    const result = await routeKnowledge({
      message,
      faqItems: [],
    });

    expect(result).toMatchObject({
      route: "scope_guard",
      providerUsed: "scope_guard",
    });
  });

  it.each(["4000", "0912-345-678", "MV-00125"])(
    "does not treat %s as a date follow-up even with pricing context",
    async (message) => {
      const result = await routeKnowledge({
        message,
        contextText: "user: 包棟價格\nassistant: 請提供入住日期、人數與寵物需求。",
        faqItems: [],
      });

      expect(result).toMatchObject({
        route: "scope_guard",
        providerUsed: "scope_guard",
      });
    },
  );

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

  it("routes the clear checkout-time FAQ locally", async () => {
    const result = await routeKnowledge({ message: "幾點退房？" });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      matchedFaqIds: ["faq-077"],
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
    });
    expect(result.answer).toContain("翌日上午 11:00 前");
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

  it("does not answer a supported FAQ when the same turn includes unsupported parts", async () => {
    const result = await routeKnowledge({
      message: "可以刷卡嗎？可以借直升機嗎？",
    });

    expect(result.route).not.toBe("faq_direct");
    expect(result.route).toBe("faq_selector_required");
    expect(result.matchedFaqIds).toEqual([]);
    expect(result.shouldCallDeepSeek).toBe(true);
    expect(result.lexicalSafeDirect).toBe(false);
    expect(result.answer).not.toContain("目前一般付款不提供信用卡刷卡");
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
    expect(result.route).toBe("faq_selector_required");
    expect(result.shouldCallDeepSeek).toBe(true);
  });

  it("exposes safe metadata for faq_direct responses", async () => {
    const result = await routeKnowledge({ message: "可以刷卡嗎？" });
    const metadata = buildKnowledgeMetadata(result, "request-1");

    expect(metadata).toMatchObject({
      requestId: "request-1",
      provider_used: "faq_direct",
      matchedFaqIds: ["faq-035"],
      matchedFaqCount: 1,
      matchConfidence: "high",
      lexical_safe_direct: true,
      lexical_safe_direct_reason: "question_exact",
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
      message: "可以刷卡嗎？",
      session: {
        status: "ai_active",
        support_status: "needs_human",
        should_ai_reply: true,
      },
    });

    expect(result).toMatchObject({
      route: "faq_direct",
      providerUsed: "faq_direct",
      matchedFaqIds: ["faq-035"],
      shouldCallDeepSeek: false,
    });
  });

  it("uses normalized conversation context for FAQ retrieval", async () => {
    const normalizedRequest =
      "查詢住宿價格；包棟；2026-09-26入住；2026-09-27退房；10人；3隻狗；客人原句：費用多少";
    const result = await routeKnowledge({
      message: "包棟費用多少",
      retrievalMessage: normalizedRequest,
      contextText: "user: 包棟價格\nuser: 9/26-27",
      faqItems: [
        faq({
          id: "faq-context-price",
          question: normalizedRequest,
          answer: "請由管家依完整需求確認實際房價。",
          keywords: ["2026-09-26入住", "10人", "3隻狗"],
          answer_mode: "direct",
        }),
      ],
    });

    expect(result).toMatchObject({
      route: "faq_direct",
      matchedFaqIds: ["faq-context-price"],
      shouldCallDeepSeek: false,
    });
  });

  it("does not bypass strict knowledge mode when normalized context has no approved FAQ", async () => {
    const result = await routeKnowledge({
      message: "包棟費用多少",
      retrievalMessage: "查詢住宿價格；包棟；2026-09-26入住；2026-09-27退房；10人；3隻狗",
      contextText: "user: 包棟價格\nuser: 9/26-27",
      faqItems: [],
    });

    expect(result).toMatchObject({
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
  });
});
