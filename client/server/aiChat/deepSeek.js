const safeFailureStages = new Set([
  "provider_request_failed",
  "provider_invalid_json",
  "provider_empty_choices",
  "provider_empty_content",
  "assistant_insert_failed",
  "user_insert_failed",
  "usage_event_failed",
]);

function toSafeString(value, fallback = null) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 120) : fallback;
}

export function createAiChatFailure(
  failureStage,
  message,
  details = {},
  cause
) {
  const normalizedStage = safeFailureStages.has(failureStage)
    ? failureStage
    : "provider_request_failed";
  const error = new Error(message, cause ? { cause } : undefined);

  error.failureStage = normalizedStage;
  error.providerStatus = Number.isInteger(details.providerStatus)
    ? details.providerStatus
    : null;
  error.providerErrorCode = toSafeString(details.providerErrorCode);
  error.finishReason = toSafeString(details.finishReason);

  return error;
}

export async function runWithFailureStage(
  failureStage,
  operation,
  details = {}
) {
  try {
    return await operation();
  } catch (error) {
    if (error?.failureStage) {
      throw error;
    }

    throw createAiChatFailure(
      failureStage,
      `${failureStage.replaceAll("_", " ")}.`,
      details,
      error
    );
  }
}

export function buildDeepSeekRequestPayload({ model, messages }) {
  return {
    model,
    messages,
    stream: false,
    temperature: 0.7,
    max_tokens: 500,
    thinking: {
      type: "disabled",
    },
  };
}

function getProviderErrorCode(data, status) {
  return toSafeString(
    data?.error?.code || data?.code,
    Number.isInteger(status) ? `http_${status}` : "provider_error"
  );
}

export function parseDeepSeekResponseBody({ ok, status, body }) {
  let data = null;

  if (!body) {
    if (!ok) {
      throw createAiChatFailure(
        "provider_request_failed",
        `DeepSeek request failed with HTTP ${status}.`,
        {
          providerStatus: status,
          providerErrorCode: `http_${status}`,
        }
      );
    }

    throw createAiChatFailure(
      "provider_invalid_json",
      "DeepSeek returned an empty response body.",
      {
        providerStatus: status,
        providerErrorCode: "empty_response_body",
      }
    );
  }

  try {
    data = JSON.parse(body);
  } catch (error) {
    if (!ok) {
      throw createAiChatFailure(
        "provider_request_failed",
        `DeepSeek request failed with HTTP ${status}.`,
        {
          providerStatus: status,
          providerErrorCode: `http_${status}`,
        },
        error
      );
    }

    throw createAiChatFailure(
      "provider_invalid_json",
      "DeepSeek returned invalid JSON.",
      {
        providerStatus: status,
        providerErrorCode: "invalid_json",
      },
      error
    );
  }

  if (!ok) {
    throw createAiChatFailure(
      "provider_request_failed",
      `DeepSeek request failed with HTTP ${status}.`,
      {
        providerStatus: status,
        providerErrorCode: getProviderErrorCode(data, status),
      }
    );
  }

  const choices = data?.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !choices[0]?.message) {
    throw createAiChatFailure(
      "provider_empty_choices",
      "DeepSeek response did not include a message choice.",
      {
        providerStatus: status,
        providerErrorCode: "empty_choices",
      }
    );
  }

  const finishReason = toSafeString(choices[0].finish_reason);
  const content = choices[0].message.content;
  const answer = typeof content === "string" ? content.trim() : "";

  if (!answer) {
    throw createAiChatFailure(
      "provider_empty_content",
      "DeepSeek response did not include final content.",
      {
        providerStatus: status,
        providerErrorCode: "empty_content",
        finishReason,
      }
    );
  }

  return {
    answer,
    finishReason,
    providerStatus: status,
  };
}
