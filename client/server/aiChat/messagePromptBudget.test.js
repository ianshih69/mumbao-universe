import { describe, expect, it } from "vitest";
import { aiChatPromptBudget } from "./promptBudget.js";
import {
  buildFinalReplyProviderPrompt,
  buildInputTooLongRoute,
} from "./message.js";
import { buildModelUsageMetadata } from "./semanticOrchestrator.js";

const dateInfo = {
  currentDate: "2026-08-04",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};

describe("AI chat final reply provider prompt budget", () => {
  it("fits the actual DeepSeek payload under the hard input cap before fetch", async () => {
    const artifacts = await buildFinalReplyProviderPrompt({
      model: "deepseek-v4-flash",
      userMessage: "Please answer the villa price.",
      recentMessages: Array.from({ length: 30 }, (_, index) => ({
        sender: index % 2 ? "ai" : "user",
        message: `${index}-${"x".repeat(1400)}`,
      })),
      dateInfo,
      retrievedFaqItems: Array.from({ length: 12 }, (_, index) => ({
        id: `faq-${index}`,
        category: "booking",
        question: `question ${index}`,
        answer: "answer ".repeat(700),
        answer_mode: "direct",
      })),
      conversationPromptContext: "context ".repeat(1500),
    });
    const payloadText = JSON.stringify(artifacts.payload);

    expect(payloadText.length).toBeLessThanOrEqual(
      aiChatPromptBudget.maxTotalInputChars
    );
    expect(artifacts.promptBudgetMetadata.prompt_total_chars).toBe(
      payloadText.length
    );
    expect(artifacts.promptBudgetMetadata.prompt_within_hard_limit).toBe(true);
    expect(artifacts.promptBudgetMetadata.prompt_truncated).toBe(true);
    expect(
      artifacts.promptBudgetMetadata.prompt_truncation_sections.length
    ).toBeGreaterThan(0);
  });

  it("rejects an overlong current message instead of silently truncating it", async () => {
    await expect(
      buildFinalReplyProviderPrompt({
        model: "deepseek-v4-flash",
        userMessage: "current-message-too-long ".repeat(2000),
        recentMessages: [],
        dateInfo,
        retrievedFaqItems: [],
        conversationPromptContext: "",
      })
    ).rejects.toMatchObject({
      providerErrorCode: "input_too_long",
      promptBudgetMetadata: {
        prompt_truncated: true,
        prompt_truncation_sections: expect.arrayContaining([
          "current_message",
        ]),
      },
    });
  });

  it("builds deterministic input_too_long metadata without marking a model call", () => {
    const error = {
      promptBudgetMetadata: {
        prompt_total_chars: 15000,
        prompt_hard_limit_chars: aiChatPromptBudget.maxTotalInputChars,
        prompt_within_hard_limit: false,
        prompt_truncated: true,
        prompt_truncation_sections: ["recent_messages", "current_message"],
      },
    };
    const route = buildInputTooLongRoute(
      { route: "deepseek_grounded", shouldCallDeepSeek: true },
      error
    );
    const metadata = {
      ...buildModelUsageMetadata({
        mode: "hybrid",
        routeResult: route,
        modelCalled: false,
        modelCallCount: 0,
      }),
      ...route.promptBudgetMetadata,
    };

    expect(route).toMatchObject({
      route: "input_too_long",
      providerUsed: "input_too_long",
      shouldCallDeepSeek: false,
    });
    expect(metadata).toMatchObject({
      model_called: false,
      model_call_count: 0,
      final_route: "input_too_long",
      prompt_truncated: true,
    });
    expect(metadata.prompt_truncation_sections).toContain("current_message");
  });
});
