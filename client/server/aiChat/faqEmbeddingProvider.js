import { createAiChatFailure } from "./deepSeek.js";

const defaultTimeoutMs = 10000;

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider || provider === "disabled" || provider === "off") {
    return "disabled";
  }
  if (
    provider === "openai_compatible" ||
    provider === "openai-compatible" ||
    provider === "openai"
  ) {
    return "openai_compatible";
  }
  return provider;
}

export function getFaqEmbeddingConfig(env = process.env) {
  const provider = normalizeProvider(env.FAQ_EMBEDDING_PROVIDER);
  return {
    provider,
    apiKey: String(env.FAQ_EMBEDDING_API_KEY || "").trim(),
    baseUrl: String(env.FAQ_EMBEDDING_BASE_URL || "").trim(),
    model: String(env.FAQ_EMBEDDING_MODEL || "").trim(),
    timeoutMs:
      Number.parseInt(String(env.FAQ_EMBEDDING_TIMEOUT_MS || ""), 10) ||
      defaultTimeoutMs,
  };
}

export function isFaqEmbeddingConfigured(config = getFaqEmbeddingConfig()) {
  return Boolean(
    config &&
      config.provider === "openai_compatible" &&
      config.apiKey &&
      config.baseUrl &&
      config.model
  );
}

function normalizeEmbeddingVector(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  const vector = value.map((entry) => Number(entry));
  return vector.every((entry) => Number.isFinite(entry)) ? vector : [];
}

export async function createFaqEmbedding(
  text,
  { config = getFaqEmbeddingConfig(), fetchImpl = globalThis.fetch } = {}
) {
  if (!isFaqEmbeddingConfigured(config)) {
    throw createAiChatFailure(
      "provider_request_failed",
      "FAQ embedding provider is not configured.",
      { providerErrorCode: "faq_embedding_not_configured" }
    );
  }

  if (typeof fetchImpl !== "function") {
    throw createAiChatFailure(
      "provider_request_failed",
      "FAQ embedding fetch implementation is unavailable.",
      { providerErrorCode: "faq_embedding_fetch_unavailable" }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(1000, Number(config.timeoutMs) || defaultTimeoutMs)
  );

  try {
    const response = await fetchImpl(
      `${config.baseUrl.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: String(text || "").trim(),
        }),
      }
    );
    const bodyText = await response.text();
    let data = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch (error) {
      throw createAiChatFailure(
        "provider_invalid_json",
        "FAQ embedding provider returned invalid JSON.",
        {
          providerStatus: response.status,
          providerErrorCode: "faq_embedding_invalid_json",
        },
        error
      );
    }

    if (!response.ok) {
      throw createAiChatFailure(
        "provider_request_failed",
        `FAQ embedding request failed with HTTP ${response.status}.`,
        {
          providerStatus: response.status,
          providerErrorCode:
            data?.error?.code || data?.code || `http_${response.status}`,
        }
      );
    }

    const vector = normalizeEmbeddingVector(data?.data?.[0]?.embedding);
    if (!vector.length) {
      throw createAiChatFailure(
        "provider_empty_content",
        "FAQ embedding provider did not return a vector.",
        {
          providerStatus: response.status,
          providerErrorCode: "faq_embedding_empty_vector",
        }
      );
    }

    return vector;
  } catch (error) {
    if (error?.failureStage) {
      throw error;
    }
    throw createAiChatFailure(
      "provider_request_failed",
      "FAQ embedding request failed.",
      { providerErrorCode: error?.name === "AbortError" ? "timeout" : "request_failed" },
      error
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
