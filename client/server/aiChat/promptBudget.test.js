import { describe, expect, it } from "vitest";
import {
  aiChatPromptBudget,
  buildPromptBudgetMetadata,
  measurePromptPayloadChars,
  limitFaqItemsForPrompt,
  limitMessagesForPrompt,
} from "./promptBudget.js";

describe("AI chat prompt budget", () => {
  it("limits recent messages to the configured turn and character budget", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      sender: index % 2 ? "ai" : "user",
      message: `message-${index}`,
    }));

    const limited = limitMessagesForPrompt(messages, aiChatPromptBudget);

    expect(limited.messages).toHaveLength(aiChatPromptBudget.maxRecentTurns * 2);
    expect(limited.recentTurnCount).toBe(aiChatPromptBudget.maxRecentTurns);
    expect(limited.promptTruncated).toBe(true);
    expect(limited.promptTruncationSections).toContain("older_recent_messages");
  });

  it("limits FAQ candidates and records prompt size metadata", () => {
    const faqItems = Array.from({ length: 9 }, (_, index) => ({
      id: `faq-${index}`,
      category: "booking",
      question: `question ${index}`,
      answer: `answer ${index}`,
      answer_mode: "direct",
    }));

    const limitedFaqs = limitFaqItemsForPrompt(faqItems, aiChatPromptBudget);
    const metadata = buildPromptBudgetMetadata({
      prompt: "system",
      messages: [],
      faqItems: limitedFaqs.items,
      context: { active_intent: "pricing" },
      pendingInteraction: null,
      truncatedSections: limitedFaqs.promptTruncationSections,
    });

    expect(limitedFaqs.items).toHaveLength(aiChatPromptBudget.maxFaqCandidates);
    expect(metadata).toMatchObject({
      model_call_budget: 1,
      faq_candidate_count: aiChatPromptBudget.maxFaqCandidates,
      prompt_truncated: true,
    });
    expect(metadata.prompt_truncation_sections).toContain(
      "faq_candidates_count"
    );
    expect(metadata.estimated_input_tokens).toBeGreaterThan(0);
  });

  it("records actual provider payload chars and hard-limit status", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hello" }],
    };
    const actualPromptChars = measurePromptPayloadChars(payload);
    const metadata = buildPromptBudgetMetadata({
      actualPromptChars,
      currentMessage: "hello",
      truncatedSections: ["recent_messages_hard_limit"],
    });

    expect(metadata.prompt_total_chars).toBe(actualPromptChars);
    expect(metadata.prompt_hard_limit_chars).toBe(
      aiChatPromptBudget.maxTotalInputChars
    );
    expect(metadata.prompt_within_hard_limit).toBe(true);
    expect(metadata.current_message_chars).toBe(5);
    expect(metadata.prompt_truncation_sections).toContain(
      "recent_messages_hard_limit"
    );
  });
});
