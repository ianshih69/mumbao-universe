export const aiChatPromptBudget = Object.freeze({
  maxRecentTurns: 6,
  maxRecentMessageChars: 3000,
  maxSummaryChars: 1200,
  maxFaqCandidates: 5,
  maxFaqChars: 3000,
  maxContextChars: 2000,
  maxPendingChars: 1000,
  maxCurrentMessageChars: 4000,
  maxTotalInputChars: 12000,
  maxOutputTokens: 300,
});

export function countPromptChars(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countPromptChars(item), 0);
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value).length;
  }
  return String(value || "").length;
}

export function estimatePromptTokens(chars) {
  return Math.max(0, Math.ceil(Number(chars || 0) / 4));
}

export function measurePromptPayloadChars(value) {
  return JSON.stringify(value || {}).length;
}

export function truncateTextForPrompt(value, maxChars) {
  const text = String(value || "").trim();
  const limit = Number(maxChars || 0);
  if (!limit || text.length <= limit) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, limit),
    truncated: true,
  };
}

export function limitMessagesForPrompt(
  recentMessages,
  {
    maxRecentTurns = aiChatPromptBudget.maxRecentTurns,
    maxRecentMessageChars = aiChatPromptBudget.maxRecentMessageChars,
  } = {}
) {
  const maxMessages = Math.max(0, Number(maxRecentTurns || 0) * 2);
  const source = Array.isArray(recentMessages) ? recentMessages : [];
  const selected = [];
  const truncatedSections = [];
  let totalChars = 0;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (selected.length >= maxMessages) {
      truncatedSections.push("older_recent_messages");
      break;
    }

    const message = source[index];
    const content = String(message?.message || "").trim();
    if (!content) continue;
    if (totalChars + content.length > maxRecentMessageChars) {
      truncatedSections.push("recent_messages_chars");
      break;
    }

    selected.unshift(message);
    totalChars += content.length;
  }

  return {
    messages: selected,
    recentTurnCount: Math.ceil(selected.length / 2),
    recentMessageChars: totalChars,
    promptTruncated: truncatedSections.length > 0,
    promptTruncationSections: [...new Set(truncatedSections)],
  };
}

export function limitFaqItemsForPrompt(
  items,
  {
    maxFaqCandidates = aiChatPromptBudget.maxFaqCandidates,
    maxFaqChars = aiChatPromptBudget.maxFaqChars,
  } = {}
) {
  const source = Array.isArray(items) ? items : [];
  const selected = [];
  const truncatedSections = [];
  let totalChars = 0;

  for (const item of source) {
    if (selected.length >= maxFaqCandidates) {
      truncatedSections.push("faq_candidates_count");
      break;
    }

    const estimatedChars = countPromptChars({
      id: item?.id,
      category: item?.category,
      question: item?.question,
      answer: item?.answer,
      answer_mode: item?.answer_mode,
    });
    if (totalChars + estimatedChars > maxFaqChars) {
      truncatedSections.push("faq_candidates_chars");
      break;
    }

    selected.push(item);
    totalChars += estimatedChars;
  }

  return {
    items: selected,
    faqCandidateCount: selected.length,
    faqChars: totalChars,
    promptTruncated: truncatedSections.length > 0,
    promptTruncationSections: [...new Set(truncatedSections)],
  };
}

export function buildPromptBudgetMetadata({
  messages = [],
  faqItems = [],
  context = null,
  pendingInteraction = null,
  summary = "",
  prompt = "",
  currentMessage = "",
  actualPromptChars = null,
  hardLimitChars = aiChatPromptBudget.maxTotalInputChars,
  extraSections = [],
  truncatedSections = [],
} = {}) {
  const recentMessageChars = countPromptChars(messages);
  const faqChars = countPromptChars(faqItems);
  const contextChars = countPromptChars(context);
  const pendingChars = countPromptChars(pendingInteraction);
  const summaryChars = countPromptChars(summary);
  const currentMessageChars = countPromptChars(currentMessage);
  const estimatedPromptTotalChars =
    countPromptChars(prompt) +
    recentMessageChars +
    faqChars +
    contextChars +
    pendingChars +
    summaryChars +
    currentMessageChars +
    countPromptChars(extraSections);
  const promptTotalChars = Number.isFinite(actualPromptChars)
    ? Number(actualPromptChars)
    : estimatedPromptTotalChars;
  const sections = [...new Set((truncatedSections || []).filter(Boolean))];
  const hardLimit = Math.max(1, Number(hardLimitChars || 0));
  const exceedsHardLimit = promptTotalChars > hardLimit;

  return {
    model_call_budget: 1,
    prompt_total_chars: promptTotalChars,
    prompt_hard_limit_chars: hardLimit,
    prompt_within_hard_limit: !exceedsHardLimit,
    estimated_input_tokens: estimatePromptTokens(promptTotalChars),
    recent_turn_count: Math.ceil((Array.isArray(messages) ? messages.length : 0) / 2),
    recent_message_chars: recentMessageChars,
    faq_candidate_count: Array.isArray(faqItems) ? faqItems.length : 0,
    faq_chars: faqChars,
    context_chars: contextChars,
    pending_chars: pendingChars,
    summary_chars: summaryChars,
    current_message_chars: currentMessageChars,
    prompt_truncated:
      sections.length > 0 || exceedsHardLimit,
    prompt_truncation_sections: exceedsHardLimit
      ? [...new Set([...sections, "max_total_input_chars"])]
      : sections,
  };
}
