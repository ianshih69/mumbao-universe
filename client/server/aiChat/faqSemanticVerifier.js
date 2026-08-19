import {
  buildDeepSeekRequestPayload,
  createAiChatFailure,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import { createHash } from "node:crypto";
import {
  buildModelExecutionMetadata,
  reserveModelCall,
} from "./modelExecutionContext.js";
import { isApprovedActiveFaqItem, normalizeAnswerMode } from "./faqRetrieval.js";

const verifierTimeoutMs = 12000;
const selectorTimeoutMs = 12000;
const maxSelectorFaqIds = 3;
const forbiddenSelectorKeys = new Set([
  "answer",
  "reply",
  "reply_draft",
  "policy",
  "explanation",
]);

const selectorSystemRules = [
  "You are the Mumbao guesthouse FAQ selector.",
  "Your only job is to classify the current user query to approved FAQ ids from the catalog.",
  "Return JSON only.",
  "Allowed outputs are {\"action\":\"answer\",\"faq_ids\":[\"faq-000\"]} or {\"action\":\"none\",\"faq_ids\":[]}.",
  "Select at most 3 FAQ ids.",
  "Select multiple ids only for genuinely separate user intents.",
  "Do not select multiple FAQs for the same policy.",
  "If no approved FAQ clearly answers the query, return action none.",
  "Do not write, summarize, infer, rewrite, or create lodging policy content.",
  "Do not include answer, reply, reply_draft, policy, or explanation fields.",
].join("\n");

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

export function getFaqSelectorModelName(env = process.env) {
  return (
    String(env.FAQ_SELECTOR_MODEL || "").trim() ||
    String(env.DEEPSEEK_MODEL || "").trim() ||
    "deepseek-v4-flash"
  );
}

function getFaqSelectorConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is missing");
    error.reason = "missing deepseek api key";
    throw error;
  }

  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: getFaqSelectorModelName(env),
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

function normalizeText(value) {
  return String(value || "").trim();
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

export function buildApprovedFaqSelectorCatalog(items = []) {
  return buildCandidatePayload(items)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      category: normalizeText(item.category),
      question: normalizeText(item.question),
      aliases: item.aliases.map(normalizeText).filter(Boolean),
      keywords: item.keywords.map(normalizeText).filter(Boolean),
    }));
}

export function hashFaqSelectorCatalog(catalog = []) {
  return createHash("sha256")
    .update(JSON.stringify(catalog), "utf8")
    .digest("hex");
}

export function buildFaqSelectorCatalogText(catalog = []) {
  return [
    "APPROVED FAQ CATALOG",
    ...(Array.isArray(catalog) ? catalog : []).map((item) =>
      [
        item.id,
        `category: ${item.category}`,
        `question: ${item.question}`,
        `aliases: ${item.aliases.join(" | ")}`,
        `keywords: ${item.keywords.join(" | ")}`,
      ].join("\n")
    ),
  ].join("\n---\n");
}

export function buildFaqFullCatalogSelectorMessages({
  message,
  faqItems,
  previousUserQuery = "",
}) {
  const catalog = buildApprovedFaqSelectorCatalog(faqItems);
  const userPayload = {
    current_user_query: normalizeText(message),
    ...(normalizeText(previousUserQuery)
      ? { previous_user_query: normalizeText(previousUserQuery) }
      : {}),
  };

  return [
    {
      role: "system",
      content: selectorSystemRules,
    },
    {
      role: "system",
      content: buildFaqSelectorCatalogText(catalog),
    },
    {
      role: "user",
      content: JSON.stringify(userPayload, null, 2),
    },
  ];
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

export function normalizeFaqSelectorResult(value, faqItems = []) {
  const catalog = buildApprovedFaqSelectorCatalog(faqItems);
  const approvedById = new Map(catalog.map((item) => [item.id, item]));
  const selectedSourceById = new Map(
    (Array.isArray(faqItems) ? faqItems : [])
      .filter(isApprovedActiveFaqItem)
      .map((item) => [String(item.id || ""), item])
  );
  const payload = value && typeof value === "object" ? value : {};
  const extraForbiddenKeys = Object.keys(payload).filter((key) =>
    forbiddenSelectorKeys.has(key)
  );

  if (extraForbiddenKeys.length) {
    return {
      action: "none",
      faqIds: [],
      selectedFaqItems: [],
      accepted: false,
      reason: "forbidden_selector_output_field",
    };
  }

  const action = normalizeText(payload.action).toLowerCase();
  const rawFaqIds = Array.isArray(payload.faq_ids)
    ? payload.faq_ids.map((id) => normalizeText(id)).filter(Boolean)
    : [];
  const uniqueFaqIds = [...new Set(rawFaqIds)];

  if (action === "none") {
    return rawFaqIds.length === 0
      ? {
          action: "none",
          faqIds: [],
          selectedFaqItems: [],
          accepted: true,
          reason: "none",
        }
      : {
          action: "none",
          faqIds: [],
          selectedFaqItems: [],
          accepted: false,
          reason: "none_with_faq_ids",
        };
  }

  if (action !== "answer") {
    return {
      action: "none",
      faqIds: [],
      selectedFaqItems: [],
      accepted: false,
      reason: "invalid_action",
    };
  }

  if (
    rawFaqIds.length === 0 ||
    rawFaqIds.length > maxSelectorFaqIds ||
    rawFaqIds.length !== uniqueFaqIds.length
  ) {
    return {
      action: "none",
      faqIds: [],
      selectedFaqItems: [],
      accepted: false,
      reason:
        rawFaqIds.length > maxSelectorFaqIds
          ? "too_many_faq_ids"
          : rawFaqIds.length !== uniqueFaqIds.length
            ? "duplicate_faq_id"
            : "answer_without_faq_ids",
    };
  }

  const invalidIds = uniqueFaqIds.filter((id) => !approvedById.has(id));
  if (invalidIds.length) {
    return {
      action: "none",
      faqIds: [],
      selectedFaqItems: [],
      accepted: false,
      reason: "invalid_faq_id",
      invalidFaqIds: invalidIds,
    };
  }

  return {
    action: "answer",
    faqIds: uniqueFaqIds,
    selectedFaqItems: uniqueFaqIds.map((id) => selectedSourceById.get(id)),
    accepted: true,
    reason: "selected",
  };
}

export async function callFaqFullCatalogSelector({
  message,
  faqItems,
  previousUserQuery = "",
  requestId = "",
  executionContext = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const catalog = buildApprovedFaqSelectorCatalog(faqItems);
  if (!catalog.length) {
    return {
      action: "none",
      faqIds: [],
      selectedFaqItems: [],
      metadata: {
        faq_selector_action: "none",
        faq_selector_result: "no_catalog",
        faq_selector_catalog_count: 0,
      },
    };
  }

  if (typeof fetchImpl !== "function") {
    throw createAiChatFailure(
      "provider_request_failed",
      "FAQ selector fetch implementation is unavailable.",
      { providerErrorCode: "faq_selector_fetch_unavailable" }
    );
  }

  const { apiKey, baseUrl, model } = getFaqSelectorConfig();
  const messages = buildFaqFullCatalogSelectorMessages({
    message,
    faqItems,
    previousUserQuery,
  });
  const payload = buildDeepSeekRequestPayload({
    model,
    messages,
    temperature: 0,
    maxTokens: 160,
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), selectorTimeoutMs);
  const startedAt = Date.now();
  let providerResult = null;
  const catalogHash = hashFaqSelectorCatalog(catalog);

  try {
    reserveModelCall(executionContext, "faq_full_catalog_selector");
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
    const normalized = normalizeFaqSelectorResult(parsed, faqItems);
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
        cache_miss_tokens: Number(providerResult.usage?.cache_miss_tokens || 0),
        faq_selector_action: normalized.action,
        faq_selector_result:
          normalized.accepted && normalized.selectedFaqItems.length
            ? "selected"
            : normalized.accepted
              ? "none"
              : normalized.reason || "invalid",
        faq_selector_selected_ids: normalized.faqIds,
        faq_selector_catalog_count: catalog.length,
        faq_selector_catalog_hash: catalogHash,
        requestId,
        ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
      },
    };
  } catch (error) {
    if (!error?.failureStage) {
      error = createAiChatFailure(
        "provider_request_failed",
        "FAQ selector failed.",
        {
          providerErrorCode:
            error?.name === "AbortError"
              ? "faq_selector_timeout"
              : "faq_selector_failed",
        },
        error
      );
    }
    error.faqSelectorMetadata = {
      provider: "deepseek",
      model,
      latency_ms: Date.now() - startedAt,
      fallback_reason: error.providerErrorCode || error.message,
      faq_selector_result: "error",
      faq_selector_catalog_count: catalog.length,
      faq_selector_catalog_hash: catalogHash,
      ...(executionContext ? buildModelExecutionMetadata(executionContext) : {}),
      ...(providerResult?.usage
        ? {
            prompt_tokens: Number(providerResult.usage.prompt_tokens || 0),
            completion_tokens: Number(providerResult.usage.completion_tokens || 0),
            cache_hit_tokens: Number(providerResult.usage.cache_hit_tokens || 0),
            cache_miss_tokens: Number(providerResult.usage.cache_miss_tokens || 0),
          }
        : {}),
    };
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
