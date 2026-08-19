import {
  buildDeepSeekRequestPayload,
  createAiChatFailure,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import {
  buildModelExecutionMetadata,
  reserveModelCall,
} from "./modelExecutionContext.js";
import { isApprovedActiveFaqItem, normalizeAnswerMode } from "./faqRetrieval.js";

const verifierTimeoutMs = 12000;

function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is missing");
    error.reason = "missing deepseek api key";
    throw error;
  }

  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  };
}

function parseJsonObject(text) {
  const trimmed = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw createAiChatFailure(
      "provider_invalid_json",
      "FAQ semantic verifier returned invalid JSON.",
      { providerErrorCode: "faq_semantic_verifier_invalid_json" }
    );
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function buildCandidatePayload(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter(isApprovedActiveFaqItem)
    .map((item) => ({
      id: String(item.id || ""),
      category: String(item.category || ""),
      question: String(item.question || ""),
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      answer_mode: normalizeAnswerMode(item.answer_mode),
    }))
    .filter((item) => item.id && item.question);
}

export function buildFaqSemanticVerifierMessages({ message, candidates }) {
  const candidatePayload = buildCandidatePayload(candidates);
  return [
    {
      role: "system",
      content:
        "You are a selector for Mumbao guesthouse FAQ retrieval. Select exactly one approved FAQ id only when it clearly answers the user's current question. If none clearly answer it, select NONE. Do not write policy content or a customer-facing reply. Return compact JSON only: {\"selection\":\"faq-000\"} or {\"selection\":\"NONE\"}.",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          user_message: String(message || "").trim(),
          approved_candidates: candidatePayload,
        },
        null,
        2
      ),
    },
  ];
}

export function normalizeFaqSemanticVerifierSelection(value, candidates = []) {
  const selection = String(value || "").trim();
  if (!selection || selection.toUpperCase() === "NONE") {
    return { selection: "NONE", selectedFaqItem: null, accepted: true };
  }

  const selectedFaqItem = (Array.isArray(candidates) ? candidates : []).find(
    (item) => String(item?.id || "") === selection && isApprovedActiveFaqItem(item)
  );

  if (!selectedFaqItem) {
    return { selection: "NONE", selectedFaqItem: null, accepted: false };
  }

  return { selection, selectedFaqItem, accepted: true };
}

export async function callFaqSemanticVerifier({
  message,
  candidates,
  requestId = "",
  executionContext = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const candidatePayload = buildCandidatePayload(candidates);
  if (!candidatePayload.length) {
    return {
      selection: "NONE",
      selectedFaqItem: null,
      metadata: {
        semantic_verifier_selection: "NONE",
        semantic_verifier_result: "no_candidates",
      },
    };
  }
  if (typeof fetchImpl !== "function") {
    throw createAiChatFailure(
      "provider_request_failed",
      "FAQ semantic verifier fetch implementation is unavailable.",
      { providerErrorCode: "faq_semantic_verifier_fetch_unavailable" }
    );
  }

  const { apiKey, baseUrl, model } = getDeepSeekConfig();
  const messages = buildFaqSemanticVerifierMessages({ message, candidates });
  const payload = buildDeepSeekRequestPayload({
    model,
    messages,
    temperature: 0,
    maxTokens: 120,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), verifierTimeoutMs);
  const startedAt = Date.now();
  let providerResult = null;

  try {
    reserveModelCall(executionContext, "faq_semantic_verifier");
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await response.text();
    providerResult = parseDeepSeekResponseBody({
      ok: response.ok,
      status: response.status,
      body,
    });
    const parsed = parseJsonObject(providerResult.answer);
    const normalized = normalizeFaqSemanticVerifierSelection(
      parsed?.selection,
      candidates
    );
    const latencyMs = Date.now() - startedAt;

    return {
      ...normalized,
      metadata: {
        provider: "deepseek",
        model,
        provider_status: providerResult.providerStatus,
        finish_reason: providerResult.finishReason,
        latency_ms: latencyMs,
        prompt_tokens: Number(providerResult.usage?.prompt_tokens || 0),
        completion_tokens: Number(providerResult.usage?.completion_tokens || 0),
        cache_hit_tokens: Number(providerResult.usage?.cache_hit_tokens || 0),
        semantic_verifier_selection: normalized.selection,
        semantic_verifier_result:
          normalized.accepted && normalized.selectedFaqItem
            ? "selected"
            : normalized.accepted
              ? "none"
              : "invalid_selection",
        semantic_verifier_candidate_ids: candidatePayload.map((item) => item.id),
        ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
      },
    };
  } catch (error) {
    if (!error?.failureStage) {
      error = createAiChatFailure(
        "provider_request_failed",
        "FAQ semantic verifier failed.",
        {
          providerErrorCode:
            error?.name === "AbortError"
              ? "faq_semantic_verifier_timeout"
              : "faq_semantic_verifier_failed",
        },
        error
      );
    }
    error.semanticVerifierMetadata = {
      provider: "deepseek",
      model,
      latency_ms: Date.now() - startedAt,
      fallback_reason: error.providerErrorCode || error.message,
      semantic_verifier_result: "error",
      ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
      ...(providerResult?.usage
        ? {
            prompt_tokens: Number(providerResult.usage.prompt_tokens || 0),
            completion_tokens: Number(providerResult.usage.completion_tokens || 0),
            cache_hit_tokens: Number(providerResult.usage.cache_hit_tokens || 0),
          }
        : {}),
    };
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
