import { z } from "zod";
import {
  buildDeepSeekRequestPayload,
  createAiChatFailure,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import { reserveModelCall } from "./modelExecutionContext.js";
import { bookingRequestedActions } from "./structuredBookingTurnCandidates.js";

const structuredTurnTimeoutMs = 20000;
const structuredTurnModelPurpose = "structured_turn_candidate_resolver";
const clarificationCodes = Object.freeze([
  "none",
  "missing_entity",
  "missing_pet_context",
  "missing_party_count",
  "conflicting_operations",
  "unsupported_entity_value",
  "low_confidence",
]);

export const structuredTurnCandidateResolverSchema = z
  .object({
    selected_candidate_ids: z.array(z.string().regex(/^cand-\d{3}-[a-z0-9-]+$/)).max(20),
    intent_ids: z.array(z.enum(bookingRequestedActions)).max(3),
    clarification_code: z.enum(clarificationCodes),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const outboundInputKeys = new Set([
  "current_date",
  "timezone",
  "current_booking_context",
  "pending_missing_fields",
  "previous_transaction_topic",
  "latest_user_message",
  "allowed_candidate_ids",
  "allowed_intent_ids",
]);
const bookingContextKeys = new Set(["stay", "party", "pets", "addons"]);
const nestedContextKeys = Object.freeze({
  stay: new Set(["mode", "check_in", "check_out", "nights", "date_type"]),
  party: new Set(["adults", "children", "infants", "child_ages_years"]),
  pets: new Set(["species", "count", "individual_weights_kg"]),
  addons: new Set(["breakfast_quantity"]),
});
const forbiddenKeyPattern = /(?:answer|reply|internal_note|faq|rule|policy_text|customer|email|phone|address|booking_(?:reference|uuid)|payment|recovery|management|session_token|supabase|vercel|database|secret|api_key|chat_history|operations|raw_value|normalized_value|evidence_spans|bindings)/i;
const forbiddenValuePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/,
  /\b[A-Za-z0-9_-]{32,}\b/,
  /\b\d{8,20}\b/,
];

function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`structured_turn_outbound_invalid_${label}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) || forbiddenKeyPattern.test(key)) {
      throw new Error("structured_turn_forbidden_outbound_field");
    }
  }
}

function inspectKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(inspectKeys);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) {
      throw new Error("structured_turn_forbidden_outbound_field");
    }
    inspectKeys(entry);
  }
}

function resolverInputFromPlan(plan) {
  const state = plan.current_state;
  return {
    current_date: plan.current_date,
    timezone: plan.timezone,
    current_booking_context: {
      stay: state.stay,
      party: state.party,
      pets: state.pets,
      addons: state.addons,
    },
    pending_missing_fields: plan.pending_missing_fields,
    previous_transaction_topic: plan.previous_transaction_topic,
    latest_user_message: plan.sanitized_message,
    allowed_candidate_ids: plan.candidates.map((candidate) => candidate.candidate_id),
    allowed_intent_ids: plan.allowed_intent_ids,
  };
}

export function buildStructuredTurnCandidateMessages(plan) {
  const system = `你是住宿訂房 candidate-ID resolver。你只能選擇輸入 allowlist 中的 ID，不能建立、改寫或推導任何欄位值。

只輸出一個 JSON object，不可輸出 markdown、說明、完整訂房 state、operation、日期、數量、體重、價格、房況、FAQ 或客人回答。

嚴格輸出 schema：
{
  "selected_candidate_ids": ["allowed candidate ID"],
  "intent_ids": ["allowed intent ID"],
  "clarification_code": "none|missing_entity|missing_pet_context|missing_party_count|conflicting_operations|unsupported_entity_value|low_confidence",
  "confidence": 0.0
}

每個 candidate ID 的尾段只描述有限候選的 entity 與 operation。只共享名詞不足以選擇；必須同時符合核心對象、核心動作與必要的時間、位置或限制條件。若訊息不足以區分候選，selected_candidate_ids 必須為空並回 clarification_code。不得選擇 allowlist 外的 ID，不得把 current_booking_context 的既有值重送成本輪修改。`;
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(resolverInputFromPlan(plan)) },
  ];
}

export function assertStructuredTurnOutboundPayload(
  payload,
  { forbiddenValues = [] } = {},
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("structured_turn_outbound_invalid_payload");
  }
  const messages = payload.messages;
  if (
    !Array.isArray(messages) ||
    messages.length !== 2 ||
    messages[0]?.role !== "system" ||
    messages[1]?.role !== "user" ||
    typeof messages[0]?.content !== "string" ||
    typeof messages[1]?.content !== "string"
  ) {
    throw new Error("structured_turn_outbound_invalid_messages");
  }

  let input;
  try {
    input = JSON.parse(messages[1].content);
  } catch (cause) {
    const error = new Error("structured_turn_outbound_invalid_json");
    error.cause = cause;
    throw error;
  }
  assertExactKeys(input, outboundInputKeys, "input");
  assertExactKeys(
    input.current_booking_context,
    bookingContextKeys,
    "booking_context",
  );
  for (const [section, allowed] of Object.entries(nestedContextKeys)) {
    assertExactKeys(
      input.current_booking_context[section],
      allowed,
      `booking_context_${section}`,
    );
  }
  if (
    !Array.isArray(input.allowed_candidate_ids) ||
    !Array.isArray(input.allowed_intent_ids)
  ) {
    throw new Error("structured_turn_outbound_invalid_allowlist");
  }
  inspectKeys(input);

  const serialized = JSON.stringify(payload);
  if (forbiddenValuePatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("structured_turn_forbidden_outbound_value");
  }
  for (const value of forbiddenValues) {
    const secret = String(value || "");
    if (secret && serialized.includes(secret)) {
      throw new Error("structured_turn_secret_in_outbound_payload");
    }
  }
  return { ok: true, input };
}

export function buildStructuredTurnProviderPayload({
  plan,
  model = "deepseek-v4-flash",
  forbiddenValues = [],
} = {}) {
  if (!plan?.requires_model || plan?.classification !== "LLM_CANDIDATE_SELECTION") {
    throw new Error("structured_turn_provider_not_required");
  }
  const messages = buildStructuredTurnCandidateMessages(plan);
  const payload = buildDeepSeekRequestPayload({
    model,
    messages,
    temperature: 0,
    maxTokens: 300,
  });
  const privacy = assertStructuredTurnOutboundPayload(payload, {
    forbiddenValues,
  });
  return { messages, payload, privacy };
}

function getStructuredTurnProviderConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is missing");
    error.structuredTurnFailureCode = "missing_deepseek_api_key";
    throw error;
  }
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  };
}

function parseStrictJson(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    const error = new Error("structured_turn_invalid_json");
    error.structuredTurnFailureCode = "malformed_model_json";
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    const error = new Error("structured_turn_invalid_json");
    error.structuredTurnFailureCode = "malformed_model_json";
    error.cause = cause;
    throw error;
  }
}

export function validateStructuredTurnCandidateResolverResult(rawValue, plan) {
  let result;
  try {
    result = structuredTurnCandidateResolverSchema.parse(
      typeof rawValue === "string" ? parseStrictJson(rawValue) : rawValue,
    );
  } catch (error) {
    const wrapped = new Error("structured_turn_candidate_invalid_schema");
    wrapped.structuredTurnFailureCode = "structured_turn_candidate_invalid_schema";
    wrapped.cause = error;
    throw wrapped;
  }
  const candidateById = new Map(plan.candidates.map((candidate) => [
    candidate.candidate_id,
    candidate,
  ]));
  const selectedGroups = new Set();
  for (const candidateId of result.selected_candidate_ids) {
    const candidate = candidateById.get(candidateId);
    if (!candidate) {
      const error = new Error("structured_turn_candidate_unknown_candidate_id");
      error.structuredTurnFailureCode = error.message;
      throw error;
    }
    if (selectedGroups.has(candidate.selection_group)) {
      const error = new Error("structured_turn_candidate_conflicting_selection_group");
      error.structuredTurnFailureCode = error.message;
      throw error;
    }
    selectedGroups.add(candidate.selection_group);
  }
  if (result.intent_ids.some((intentId) => !plan.allowed_intent_ids.includes(intentId))) {
    const error = new Error("structured_turn_candidate_unknown_intent_id");
    error.structuredTurnFailureCode = error.message;
    throw error;
  }
  if (result.clarification_code !== "none" && result.selected_candidate_ids.length) {
    const error = new Error("structured_turn_candidate_ambiguous_mutation");
    error.structuredTurnFailureCode = error.message;
    throw error;
  }
  return {
    ...result,
    selected_candidate_ids: [...new Set(result.selected_candidate_ids)],
    intent_ids: [...new Set(result.intent_ids)],
  };
}

function safeLog(logger, event, metadata) {
  if (typeof logger === "function") logger(event, metadata);
}

export async function callStructuredBookingTurnInterpreter({
  plan,
  requestId = "",
  executionContext = null,
  fetchImpl = globalThis.fetch,
  env = process.env,
  logger = null,
} = {}) {
  const startedAt = Date.now();
  let providerStatus = null;
  let config;
  try {
    config = getStructuredTurnProviderConfig(env);
  } catch (error) {
    error.structuredTurnLatencyMs = Date.now() - startedAt;
    throw error;
  }
  if (typeof fetchImpl !== "function") {
    throw createAiChatFailure(
      "provider_request_failed",
      "Structured turn provider fetch is unavailable.",
      { providerErrorCode: "structured_turn_fetch_unavailable" },
    );
  }

  const { payload } = buildStructuredTurnProviderPayload({
    plan,
    model: config.model,
    forbiddenValues: [config.apiKey],
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), structuredTurnTimeoutMs);

  try {
    reserveModelCall(executionContext, structuredTurnModelPurpose);
    safeLog(logger, "structured_turn_provider_start", {
      mode: "candidate_id_resolver",
      path: "llm_candidate_selection",
    });
    const response = await fetchImpl(
      `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    providerStatus = response.status;
    const body = await response.text();
    const providerResult = parseDeepSeekResponseBody({
      ok: response.ok,
      status: response.status,
      body,
    });
    const result = validateStructuredTurnCandidateResolverResult(
      parseStrictJson(providerResult.answer),
      plan,
    );
    const latencyMs = Date.now() - startedAt;
    const metadata = {
      called: true,
      provider: "deepseek",
      model: config.model,
      provider_status: providerResult.providerStatus,
      finish_reason: providerResult.finishReason,
      latency_ms: latencyMs,
      validation_outcome: "accepted",
      failure_code: null,
      selected_candidate_count: result.selected_candidate_ids.length,
      intent_ids: result.intent_ids,
      clarification_code: result.clarification_code,
    };
    safeLog(logger, "structured_turn_provider_finish", {
      mode: "candidate_id_resolver",
      path: "llm_candidate_selection",
      provider_status: metadata.provider_status,
      latency_ms: latencyMs,
      validation_outcome: "accepted",
      ambiguity_codes: metadata.clarification_code === "none"
        ? []
        : [metadata.clarification_code],
    });
    return { result, metadata };
  } catch (caught) {
    const error = caught?.failureStage || caught?.structuredTurnFailureCode
      ? caught
      : createAiChatFailure(
          "provider_request_failed",
          caught?.name === "AbortError"
            ? "Structured turn provider timed out."
            : "Structured turn provider request failed.",
          {
            providerStatus,
            providerErrorCode: caught?.name === "AbortError"
              ? "structured_turn_timeout"
              : "structured_turn_request_failed",
          },
          caught,
        );
    error.structuredTurnLatencyMs = Date.now() - startedAt;
    safeLog(logger, "structured_turn_provider_rejected", {
      mode: "candidate_id_resolver",
      path: "llm_candidate_selection",
      provider_status: error.providerStatus ?? providerStatus,
      latency_ms: error.structuredTurnLatencyMs,
      validation_outcome: "rejected",
      failure_code: String(
        error.structuredTurnFailureCode ||
        error.providerErrorCode ||
        error.message ||
        "structured_turn_provider_failed",
      ).slice(0, 120),
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const callStructuredBookingTurnCandidateResolver =
  callStructuredBookingTurnInterpreter;
