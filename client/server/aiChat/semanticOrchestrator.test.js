import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConversationContextUpdate } from "./conversationContext.js";
import { routeKnowledge } from "./knowledgeRouter.js";
import {
  allowedTurnActions,
  buildModelUsageMetadata,
  buildNoSecondCallFallbackRoute,
  buildSemanticKnowledgeRoute,
  buildSemanticMessages,
  callSemanticOrchestrator,
  getSemanticRouterMode,
  isSafeLocalKnowledgeRoute,
  limitSemanticFaqItems,
  mergeSemanticContext,
  normalizeTurnAction,
  shouldUseSemanticOrchestrator,
  validateSemanticResult,
} from "./semanticOrchestrator.js";

const dateInfo = {
  currentDate: "2026-08-02",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};

function faq(overrides = {}) {
  return {
    id: "faq-direct",
    category: "入住退房",
    question: "幾點退房？",
    answer: "退房時間為中午 12:00 前。",
    keywords: ["退房時間"],
    priority: 80,
    is_active: true,
    status: "approved",
    answer_mode: "direct",
    ...overrides,
  };
}

function contextUpdate(previousContext, message) {
  return buildConversationContextUpdate({
    previousContext,
    message,
    recentMessages: [],
    dateInfo,
    nowIso: "2026-08-02T08:00:00.000Z",
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("semantic orchestrator routing decisions", () => {
  it("keeps explicit check-in and check-out FAQs local without DeepSeek", async () => {
    for (const item of [
      faq({
        id: "faq-checkin",
        question: "幾點入住？",
        answer: "入住時間為下午 3:00 後。",
        keywords: ["入住時間"],
      }),
      faq({
        id: "faq-checkout",
        question: "幾點退房？",
        answer: "退房時間為中午 12:00 前。",
        keywords: ["退房時間"],
      }),
    ]) {
      const route = await routeKnowledge({
        message: item.question,
        faqItems: [item],
      });

      expect(isSafeLocalKnowledgeRoute({
        message: item.question,
        routeResult: route,
        context: {},
      })).toBe(true);
      expect(shouldUseSemanticOrchestrator({
        mode: "hybrid",
        message: item.question,
        routeResult: route,
        context: {},
      })).toBe(false);
    }
  });

  it("keeps human commands and AI-pause sessions local", async () => {
    const human = await routeKnowledge({ message: "我要人工客服" });
    const paused = await routeKnowledge({
      message: "可以帶狗嗎？",
      session: { status: "human_takeover" },
    });

    expect(shouldUseSemanticOrchestrator({
      mode: "hybrid",
      message: "我要人工客服",
      routeResult: human,
      context: {},
    })).toBe(false);
    expect(shouldUseSemanticOrchestrator({
      mode: "hybrid",
      message: "可以帶狗嗎？",
      routeResult: paused,
      context: {},
    })).toBe(false);
  });

  it.each(["7/26-7/27", "3隻狗", "10人", "不是10人，是12人", "不帶寵物了"])(
    "uses semantic orchestration once for contextual message %s",
    async (message) => {
      const context = {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2027-07-26",
        check_out: "2027-07-27",
        guest_count: 10,
        pet_count: 3,
        pet_type: "dog",
      };
      const route = await routeKnowledge({
        message,
        contextText: "user: 包棟價格\nassistant: 請提供入住日期、人數與寵物需求。",
        faqItems: [],
      });

      expect(shouldUseSemanticOrchestrator({
        mode: "hybrid",
        message,
        routeResult: route,
        context,
      })).toBe(true);
    },
  );

  it("uses semantic orchestration for multi-condition and multi-intent messages", async () => {
    for (const message of [
      "我們五大三小，可能還會再多兩位，帶兩隻狗",
      "可以烤肉，那總共多少？",
    ]) {
      const route = await routeKnowledge({
        message,
        contextText: "user: 包棟價格",
        faqItems: [],
      });

      expect(shouldUseSemanticOrchestrator({
        mode: "hybrid",
        message,
        routeResult: route,
        context: { active_intent: "pricing", stay_type: "villa" },
      })).toBe(true);
    }
  });

  it("normalizes semantic router mode and falls back invalid values to legacy", () => {
    expect(getSemanticRouterMode(undefined)).toBe("legacy");
    expect(getSemanticRouterMode("")).toBe("legacy");
    expect(getSemanticRouterMode("surprise")).toBe("legacy");
    expect(getSemanticRouterMode("hybrid")).toBe("hybrid");
    expect(getSemanticRouterMode("shadow")).toBe("shadow");
    expect(getSemanticRouterMode("legacy")).toBe("legacy");
  });

  it.each(["股票可以買嗎？", "政治新聞有哪些？", "幫我寫程式", "一般數學怎麼算？"])(
    "keeps explicit external question %s as local scope guard",
    async (message) => {
      const route = await routeKnowledge({ message, faqItems: [] });

      expect(route.route).toBe("scope_guard");
      expect(shouldUseSemanticOrchestrator({
        mode: "hybrid",
        message,
        routeResult: route,
        context: {},
      })).toBe(false);
    },
  );

  it.each([
    "那多少錢",
    "三隻狗",
    "十個人",
    "下個月底",
    "不是這天",
    "可能多兩位",
    "附近有什麼",
    "可以帶嗎",
    "有提供嗎",
  ])(
    "does not let scope guard reject ambiguous follow-up %s when lodging context exists",
    async (message) => {
      const route = await routeKnowledge({
        message,
        contextText: "user: 包棟價格",
        faqItems: [],
      });

      expect(shouldUseSemanticOrchestrator({
        mode: "hybrid",
        message,
        routeResult: route,
        context: {
          active_intent: "pricing",
          stay_type: "villa",
          check_in: "2027-07-26",
        },
      })).toBe(true);
    },
  );

  it("sends casual natural language to the semantic planner instead of local scope guard", async () => {
    const route = await routeKnowledge({ message: "你多大", faqItems: [] });

    expect(route.route).toBe("scope_guard");
    expect(shouldUseSemanticOrchestrator({
      mode: "hybrid",
      message: "你多大",
      routeResult: route,
      context: {},
    })).toBe(true);
  });

  it("keeps hybrid disabled unless the server-side env explicitly enables it", () => {
    vi.stubEnv("AI_SEMANTIC_ROUTER_MODE", "");
    expect(getSemanticRouterMode()).toBe("legacy");

    vi.stubEnv("AI_SEMANTIC_ROUTER_MODE", "hybrid");
    expect(getSemanticRouterMode()).toBe("hybrid");
  });
});

describe("semantic orchestrator validation", () => {
  it("rejects invalid JSON and invalid routes", () => {
    expect(() => validateSemanticResult("not json")).toThrow();
    expect(() =>
      validateSemanticResult({
        intent: "pricing",
        route: "made_up",
      }),
    ).toThrow("semantic_orchestrator_invalid_route");
  });

  it("drops unknown context fields and keeps safe fields", () => {
    const result = validateSemanticResult({
      turn_action: "request_quote",
      intent: "pricing",
      route: "collect_info",
      context_patch: {
        guest_count: 12,
        admin_note: "secret",
      },
      clear_fields: [],
      selected_faq_ids: [],
    });

    expect(result.context_patch).toEqual({ guest_count: 12 });
    expect(result.rejected_fields).toContain("admin_note");
  });

  it("accepts only finite turn actions", () => {
    expect(allowedTurnActions.has("update_quote")).toBe(true);
    expect(allowedTurnActions.has("casual_conversation")).toBe(true);
    expect(normalizeTurnAction("update_quote")).toBe("update_quote");
    expect(normalizeTurnAction("invent_price")).toBe("");

    expect(() =>
      validateSemanticResult({
        turn_action: "invent_price",
        intent: "pricing",
        route: "collect_info",
      }),
    ).toThrow("semantic_orchestrator_invalid_turn_action");
  });

  it("keeps mentioned and uncertain fields for freshness validation", () => {
    const result = validateSemanticResult({
      turn_action: "request_quote",
      intent: "pricing",
      route: "collect_info",
      mentioned_fields: ["check_in", "check_out", "guest_count", "admin_note"],
      uncertain_fields: ["check_out", "admin_note"],
      uses_relative_date: true,
      context_patch: {
        check_in: "2026-08-04",
        stay_type: "villa",
        active_intent: "pricing",
      },
      clear_fields: [],
      selected_faq_ids: [],
    });

    expect(result.mentioned_fields).toEqual([
      "check_in",
      "check_out",
      "guest_count",
    ]);
    expect(result.uncertain_fields).toEqual(["check_out"]);
    expect(result.uses_relative_date).toBe(true);
  });

  it("rejects invalid or unavailable FAQ ids", () => {
    expect(() =>
      validateSemanticResult(
        {
          turn_action: "ask_information",
          intent: "pricing",
          route: "grounded_reply",
          selected_faq_ids: ["faq-missing"],
        },
        { faqItems: [faq()] },
      ),
    ).toThrow("semantic_orchestrator_invalid_faq_id");

    expect(() =>
      validateSemanticResult(
        {
          turn_action: "ask_information",
          intent: "pricing",
          route: "grounded_reply",
          selected_faq_ids: ["faq-direct"],
        },
        { faqItems: [faq({ status: "needs_review" })] },
      ),
    ).toThrow("semantic_orchestrator_invalid_faq_id");
  });

  it("clears pet type while preserving an explicit no-pet count", () => {
    const semantic = validateSemanticResult({
      turn_action: "request_quote",
      intent: "pricing",
      route: "collect_info",
      context_patch: { pet_count: 0 },
      clear_fields: ["pet_type"],
      selected_faq_ids: [],
    });
    const merged = mergeSemanticContext(
      {
        active_intent: "pricing",
        pet_count: 3,
        pet_type: "dog",
      },
      semantic,
      "2026-08-02T08:00:00.000Z",
    );

    expect(merged.context.pet_count).toBe(0);
    expect(merged.context.pet_type).toBeNull();
  });

  it("blocks unsupported model-generated prices and routes to knowledge gap", () => {
    const semantic = validateSemanticResult(
      {
        turn_action: "request_quote",
        intent: "pricing",
        route: "grounded_reply",
        context_patch: {},
        selected_faq_ids: ["faq-direct"],
        reply_draft: "包棟價格是 NT$40,000。",
      },
      {
        faqItems: [
          faq({
            answer: "實際房價仍需由管家確認。",
          }),
        ],
      },
    );
    const route = buildSemanticKnowledgeRoute({
      semanticResult: semantic,
      context: {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2027-07-26",
        check_out: "2027-07-27",
        guest_count: 10,
        pet_count: 3,
        pet_type: "dog",
      },
      faqItems: [faq({ answer: "實際房價仍需由管家確認。" })],
      fallbackRoute: { route: "knowledge_gap" },
    });

    expect(route).toMatchObject({
      route: "knowledge_gap",
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
      modelCallCount: 1,
    });
    expect(route.answer).not.toContain("NT$40,000");
  });

  it("routes complete pricing context to knowledge gap when selected FAQ has no reliable price", () => {
    const semantic = validateSemanticResult(
      {
        turn_action: "request_quote",
        intent: "pricing",
        route: "grounded_reply",
        context_patch: {},
        selected_faq_ids: ["faq-027"],
        reply_draft: "收到，已整理完整包棟需求，實際房價需由管家確認。",
      },
      {
        faqItems: [
          faq({
            id: "faq-027",
            question: "包棟價格怎麼算？",
            answer:
              "房價會依日期、平假日、連假、入住人數與方案不同而調整；請提供日期與人數，我們會回覆最準確報價。",
          }),
        ],
      },
    );
    const route = buildSemanticKnowledgeRoute({
      semanticResult: semantic,
      context: {
        active_intent: "pricing",
        stay_type: "villa",
        check_in: "2027-07-26",
        check_out: "2027-07-27",
        guest_count: 10,
        pet_count: 3,
        pet_type: "dog",
      },
      faqItems: [
        faq({
          id: "faq-027",
          question: "包棟價格怎麼算？",
          answer:
            "房價會依日期、平假日、連假、入住人數與方案不同而調整；請提供日期與人數，我們會回覆最準確報價。",
        }),
      ],
      fallbackRoute: { route: "faq_direct" },
    });

    expect(route).toMatchObject({
      route: "knowledge_gap",
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
    });
    expect(route.answer).toContain("10位入住");
    expect(route.answer).toContain("實際房價及寵物安排仍需由管家確認");
  });

  it("prevents a second model call after semantic fallback", () => {
    const fallback = buildNoSecondCallFallbackRoute(
      {
        route: "deepseek_grounded",
        providerUsed: "deepseek_grounded",
        shouldCallDeepSeek: true,
      },
      "semantic_orchestrator_invalid_json",
    );

    expect(fallback).toMatchObject({
      route: "knowledge_gap",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      reason: "semantic_fallback_prevented_second_model_call",
    });
  });
});

describe("semantic prompt and cost metadata", () => {
  it("limits recent messages to 12 and FAQ candidates to 5", () => {
    const messages = buildSemanticMessages({
      message: "那多少錢？",
      context: { active_intent: "pricing", stay_type: "villa" },
      recentMessages: Array.from({ length: 14 }, (_, index) => ({
        sender: index % 2 ? "ai" : "user",
        message: `m-${index}`,
      })),
      faqItems: Array.from({ length: 7 }, (_, index) =>
        faq({ id: `faq-${index}`, question: `問題 ${index}` }),
      ),
      dateInfo,
    });
    const payload = JSON.parse(messages[1].content);

    expect(messages[0].content).toContain('"turn_action"');
    expect(messages[0].content).toContain('"mentioned_fields"');
    expect(messages[0].content).toContain('"uncertain_fields"');
    expect(messages[0].content).toContain('"uses_relative_date"');
    expect(messages[0].content).toContain("update_quote");
    expect(payload.recent_messages).toHaveLength(12);
    expect(payload.faq_candidates).toHaveLength(5);
    expect(limitSemanticFaqItems(payload.faq_candidates)).toHaveLength(5);
  });

  it("records model_call_count as 0 for direct local routes and 1 for semantic routes", () => {
    expect(
      buildModelUsageMetadata({
        mode: "hybrid",
        routeResult: { route: "faq_direct", providerUsed: "faq_direct" },
      }),
    ).toMatchObject({
      model_called: false,
      model_call_count: 0,
      final_route: "faq_direct",
    });

    expect(
      buildModelUsageMetadata({
        mode: "hybrid",
        routeResult: {
          route: "semantic_grounded",
          providerUsed: "deepseek_semantic",
          modelCalled: true,
          modelCallCount: 1,
        },
      }),
    ).toMatchObject({
      model_called: true,
      model_call_count: 1,
      final_route: "semantic_grounded",
    });
  });

  it("calls DeepSeek once and parses a valid semantic JSON response", async () => {
    vi.stubEnv("AI_MODE", "cloud_only");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.test");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  turn_action: "update_quote",
                  intent: "pricing",
                  topic: "booking_price",
                  is_follow_up: true,
                  mentioned_fields: ["guest_count"],
                  context_patch: { guest_count: 12 },
                  clear_fields: [],
                  uncertain_fields: [],
                  uses_relative_date: false,
                  selected_faq_ids: [],
                  missing_fields: [],
                  route: "collect_info",
                  needs_human: false,
                  reply_draft: "收到，已改成 12 位。",
                  confidence: 0.9,
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_cache_hit_tokens: 10,
          },
        }),
    }));

    const result = await callSemanticOrchestrator({
      message: "不是10人，是12人",
      context: {
        active_intent: "pricing",
        stay_type: "villa",
        guest_count: 10,
      },
      recentMessages: [],
      faqItems: [],
      dateInfo,
      requestId: "request-1",
      mode: "shadow",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.semanticResult.context_patch).toEqual({ guest_count: 12 });
    expect(result.metadata).toMatchObject({
      semantic_mode: "shadow",
      model_called: true,
      model_call_count: 1,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      prompt_tokens: 100,
      completion_tokens: 50,
      cache_hit_tokens: 10,
      semantic_validator_result: "accepted",
      semantic_validator_accepted: true,
      semantic_turn_action: "update_quote",
      validated_turn_action: "update_quote",
      turn_action_validator_result: "accepted",
      mentioned_fields: ["guest_count"],
      uncertain_fields: [],
      uses_relative_date: false,
      semantic_route: "collect_info",
      semantic_context_patch: { guest_count: 12 },
      semantic_selected_faq_ids: [],
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      thinking: { type: "disabled" },
      temperature: 0.2,
      max_tokens: 500,
    });
  });

  it("records safe validator rejection metadata without saving raw model output", async () => {
    vi.stubEnv("AI_MODE", "cloud_only");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.test");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "not json" },
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 5,
          },
        }),
    }));

    await expect(
      callSemanticOrchestrator({
        message: "那多少錢？",
        context: { active_intent: "pricing", stay_type: "villa" },
        recentMessages: [],
        faqItems: [],
        dateInfo,
        requestId: "request-invalid",
        mode: "shadow",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      semanticMetadata: {
        semantic_mode: "shadow",
        model_called: true,
        model_call_count: 1,
        provider: "deepseek",
        model: "deepseek-v4-flash",
        prompt_tokens: 20,
        completion_tokens: 5,
        semantic_validator_result: "rejected",
        semantic_validator_accepted: false,
      },
    });
  });

  it("keeps separate session contexts isolated", () => {
    const sessionA = contextUpdate(null, "包棟價格").context;
    const sessionB = contextUpdate(null, "那多少錢？").context;

    expect(sessionA.stay_type).toBe("villa");
    expect(sessionB.stay_type).toBeNull();
    expect(sessionB.check_in).toBeNull();
  });
});
