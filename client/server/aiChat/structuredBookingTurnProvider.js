import { z } from "zod";
import {
  buildDeepSeekRequestPayload,
  createAiChatFailure,
  parseDeepSeekResponseBody,
} from "./deepSeek.js";
import { reserveModelCall } from "./modelExecutionContext.js";
import {
  bookingRequestedActions,
  summarizeBookingTurnCandidate,
} from "./structuredBookingTurnCandidates.js";

const structuredTurnTimeoutMs = 20000;
const structuredTurnModelPurpose = "structured_turn_candidate_resolver";
const clarificationCodes = Object.freeze([
  "missing_entity",
  "missing_target_reference",
  "missing_pet_context",
  "missing_party_count",
  "conflicting_operations",
  "unsupported_entity_value",
  "low_confidence",
]);
const resolverOperations = Object.freeze([
  "set",
  "add",
  "replace",
  "remove",
  "clear",
  "none",
]);
const resolverEntities = Object.freeze([
  "stay",
  "adult",
  "child",
  "infant",
  "pet",
  "breakfast",
  "none",
]);
const resolverFields = Object.freeze([
  "stay",
  "stay.mode",
  "stay.check_in",
  "stay.check_out",
  "stay.nights",
  "stay.date_type",
  "party.adults",
  "party.children",
  "party.infants",
  "pets",
  "pets.count",
  "pets.species",
  "pets.individual_weights_kg",
  "addons.breakfast_quantity",
  "none",
]);

export const structuredTurnCandidateResolverSchema = z
  .object({
    goal_id: z.enum([...bookingRequestedActions, "none"]),
    scenario_action: z.enum(["continue", "new", "read_only"]),
    operation: z.enum(resolverOperations),
    entity: z.enum(resolverEntities),
    field: z.enum(resolverFields),
    span_ids: z.array(z.string().regex(/^span-\d{3}$/)).max(30),
    context_reference_ids: z.array(z.string().trim().min(1).max(120)).max(20),
    clarification_code: z.enum(clarificationCodes).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export function sanitizedStructuredTurnSchemaDiagnostics(error) {
  const fields = new Set(Object.keys(structuredTurnCandidateResolverSchema.shape));
  const codes = new Set(["invalid_type", "invalid_value", "unrecognized_keys",
    "too_big", "too_small", "invalid_format", "custom"]);
  const issues = error?.issues || error?.cause?.issues || [];
  return issues.slice(0, 20).map((issue) => ({
    field: fields.has(issue.path?.[0]) ? issue.path[0] : "$object",
    code: codes.has(issue.code) ? issue.code : "validation_error",
  }));
}

const outboundInputKeys = new Set([
  "current_date",
  "timezone",
  "scenario_version",
  "current_booking_context",
  "pending_summary",
  "previous_transaction_topic",
  "latest_user_message",
  "deterministic_spans",
  "goal_candidates",
  "operation_candidates",
  "allowed_scenario_actions",
  "reference_context",
  "reference_contract",
]);
const bookingContextKeys = new Set(["stay", "party", "pets", "addons"]);
const nestedContextKeys = Object.freeze({
  stay: new Set(["mode", "check_in", "check_out", "nights", "date_type"]),
  party: new Set(["adults", "children", "infants", "child_ages_years"]),
  pets: new Set(["species", "count", "individual_weights_kg"]),
  addons: new Set(["breakfast_quantity"]),
});
const pendingSummaryKeys = new Set([
  "type",
  "operation",
  "entity",
  "filled_slots",
  "missing_slots",
  "candidate_targets",
  "pending_version",
  "scenario_version",
]);
const deterministicSpanKeys = new Set([
  "span_id",
  "text",
  "normalized_type",
  "entity_hints",
]);
const goalCandidateKeys = new Set(["goal_id"]);
const operationCandidateKeys = new Set([
  "candidate_id",
  "operation",
  "entity",
  "field",
  "span_ids",
  "context_reference_ids",
]);
const forbiddenKeyPattern = /(?:answer|reply|internal_note|faq|rule|policy_text|customer|email|phone|address|booking_(?:reference|uuid)|payment|recovery|management|session_token|supabase|vercel|database|secret|api_key|chat_history|operations|raw_value|normalized_value|evidence_spans|bindings)/i;
const forbiddenValuePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/,
  /\b[A-Za-z0-9_-]{32,}\b/,
  /\b\d{8,20}\b/,
];

const referenceEntitySchema = z.object({ id: z.string().regex(/^pet_[1-9]\d{0,8}$/),
  type: z.literal("pet"), weight_kg: z.number().positive().max(200).nullable() }).strict();
const referenceContextSchema = z.object({ entities: z.array(referenceEntitySchema).max(20),
  discourse_anchor: z.object({ last_referenced_entity_id: referenceEntitySchema.shape.id,
    last_referenced_entity_type: z.literal("pet"), last_reference_turn: z.literal("previous") }).strict().nullable(),
}).strict();
const referenceChoiceSchema = structuredTurnCandidateResolverSchema.omit({ confidence: true })
  .extend({ candidate_id: z.string().regex(/^(?:cand-\d{3}-pet-(?:replace|remove)-target|clarify_target_pet)$/) }).strict();
const referenceContractSchema = z.object({ operation: z.enum(["replace", "remove"]), entity: z.literal("pet"),
  missing_slots: z.array(z.literal("target_pet")).length(1),
  resolution: z.enum(["unique", "all", "ambiguous", "absent"]),
  candidates: z.array(referenceChoiceSchema).min(1).max(2),
}).strict();

export function isContextSemanticResolverEnabled(env = process.env) {
  return String(env.AI_CONTEXT_SEMANTIC_RESOLVER_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
}

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
  const pending = plan.reference_pending || plan.slot_fill_transaction?.pending || null;
  const scenarioAction = plan.intent_ast?.scenario_action === "new"
    ? "new"
    : plan.intent_ast?.scenario_action === "continue"
      ? "continue"
      : "read_only";
  return {
    current_date: plan.current_date,
    timezone: plan.timezone,
    scenario_version: plan.pending_scenario?.context_version ?? null,
    current_booking_context: {
      stay: state.stay,
      party: state.party,
      pets: state.pets,
      addons: state.addons,
    },
    pending_summary: pending
      ? {
          type: pending.type,
          operation: pending.operation,
          entity: pending.entity,
          filled_slots: pending.filled_slots || [],
          missing_slots: pending.missing_slots || [],
          candidate_targets: pending.entity === "pet" && pending.missing_slots?.includes("target_pet")
            ? plan.reference_context.entities.map((item) => item.id) : pending.candidate_references || [],
          pending_version: pending.pending_version || 1,
          scenario_version:
            pending.scenario_version ?? pending.context_version ?? null,
        }
      : null,
    previous_transaction_topic: plan.previous_transaction_topic,
    latest_user_message: plan.sanitized_message,
    deterministic_spans: plan.spans.map((span) => ({
      span_id: span.span_id,
      text: span.text,
      normalized_type: span.normalized_type,
      entity_hints: span.entity_hints,
    })),
    goal_candidates: plan.allowed_intent_ids.map((goalId) => ({
      goal_id: goalId,
    })),
    operation_candidates: plan.candidates.map(summarizeBookingTurnCandidate),
    allowed_scenario_actions: plan.reference_contract
      ? [...new Set(plan.reference_contract.candidates.map((item) => item.scenario_action))] : [scenarioAction],
    reference_context: plan.reference_context,
    reference_contract: plan.reference_contract,
  };
}

export function buildStructuredTurnCandidateMessages(plan) {
  const system = `你是住宿訂房 context-dependent semantic resolver。Server 已提供有限 goal/operation candidates 與 provenance IDs；你只能選擇，不能建立或改寫任何值。

只輸出一個 JSON object，不可輸出 markdown、說明、日期、數量、體重、價格、房況、完整 state、FAQ、政策、answer 或客人回答。

嚴格輸出 schema：
{
  "goal_id": "allowed goal ID 或 none",
  "scenario_action": "continue|new|read_only",
  "operation": "set|add|replace|remove|clear|none",
  "entity": "stay|adult|child|infant|pet|breakfast|none",
  "field": "operation candidate 的 field 或 none",
  "span_ids": ["operation candidate 的 span ID"],
  "context_reference_ids": ["operation candidate 的 context reference ID"],
  "clarification_code": null,
  "confidence": 0.0
}

clarification_code 只能是 null 或以下其中一個字串：${clarificationCodes.join(", ")}。不得使用字串 "none"、自由文字或新增 code。
reference_context 使用 scenario 內穩定 entity ID；體重不是 identity。reference_contract 非 null 時，它是本輪唯一 authority：只能完整複製其中一個 candidate 的語意欄位（不輸出 candidate_id），另填 confidence。pending 的 operation/entity 不得改寫成無關的報價或資訊查詢。沒有 anchor 的 alternate/complement reference 不可猜測；即使有 anchor，也必須有唯一補集才可操作。無法唯一引用時選 clarify_target_pet，operation=none、goal_id=none、clarification_code=missing_target_reference。不得繞過 contract 使用一般 read/resume 規則。
讀取／延續既有報價但沒有 mutation 是合法操作：若 allowed goal 包含 request_quote 且 allowed scenario action 包含 continue，可輸出 goal_id=request_quote、scenario_action=continue、operation/entity/field=none、兩個 ID arrays=[]、clarification_code=null。這不代表資訊不足，不需要建立 operation candidate 或重送既有值。

若選擇 mutation，operation/entity/field/span_ids/context_reference_ids 必須完整複製同一個 operation candidate，不能混合 candidates，不能自行產生值。goal_id 與 scenario_action 也只能從各自 allowlist 選擇。若訊息不足以安全選擇，operation/entity/field 使用 none、兩個 ID arrays 使用空陣列，並設定一個 clarification_code。只共享名詞不足以視為同一意圖；必須同時符合核心對象、核心動作與時間、位置或限制。不得把 current_booking_context 的既有值重送成本輪修改。`;
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
  referenceContextSchema.parse(input.reference_context);
  if (input.reference_contract !== null) referenceContractSchema.parse(input.reference_contract);
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
  if (input.pending_summary !== null) {
    assertExactKeys(input.pending_summary, pendingSummaryKeys, "pending_summary");
  }
  if (
    !Array.isArray(input.deterministic_spans) ||
    !Array.isArray(input.goal_candidates) ||
    !Array.isArray(input.operation_candidates) ||
    !Array.isArray(input.allowed_scenario_actions)
  ) {
    throw new Error("structured_turn_outbound_invalid_allowlist");
  }
  input.deterministic_spans.forEach((span) =>
    assertExactKeys(span, deterministicSpanKeys, "deterministic_span"),
  );
  input.goal_candidates.forEach((goal) =>
    assertExactKeys(goal, goalCandidateKeys, "goal_candidate"),
  );
  input.operation_candidates.forEach((candidate) =>
    assertExactKeys(candidate, operationCandidateKeys, "operation_candidate"),
  );
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
    wrapped.sanitizedValidationIssues = sanitizedStructuredTurnSchemaDiagnostics(error);
    throw wrapped;
  }
  const reject = (code) => {
    const error = new Error(code);
    error.structuredTurnFailureCode = code;
    throw error;
  };
  const expectedScenarioAction = plan.intent_ast?.scenario_action === "new"
    ? "new"
    : plan.intent_ast?.scenario_action === "continue"
      ? "continue"
      : "read_only";
  const referenceChoices = plan.reference_contract?.candidates;
  if (referenceChoices) {
    const fields = ["goal_id", "scenario_action", "operation", "entity", "field", "clarification_code"];
    const sameIds = (a, b) => a.length === new Set(a).size &&
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!referenceChoices.some((choice) => fields.every((field) => choice[field] === result[field]) &&
        sameIds(result.span_ids, choice.span_ids) && sameIds(result.context_reference_ids, choice.context_reference_ids))) {
      reject("structured_turn_pending_reference_contract_violation");
    }
  }
  if (!referenceChoices && result.scenario_action !== expectedScenarioAction) {
    reject("structured_turn_candidate_invalid_scenario_action");
  }
  if (
    result.goal_id !== "none" &&
    !plan.allowed_intent_ids.includes(result.goal_id) && !referenceChoices?.some((choice) => choice.goal_id === result.goal_id)
  ) {
    reject("structured_turn_candidate_unknown_goal_id");
  }

  const noMutation = result.operation === "none";
  if (noMutation) {
    if (
      result.entity !== "none" ||
      result.field !== "none" ||
      result.span_ids.length ||
      result.context_reference_ids.length
    ) {
      reject("structured_turn_candidate_invalid_empty_operation");
    }
  } else if (result.clarification_code) {
    reject("structured_turn_candidate_ambiguous_mutation");
  }

  const sameIds = (left, right) => {
    const a = [...new Set(left || [])].sort();
    const b = [...new Set(right || [])].sort();
    return a.length === (left || []).length &&
      b.length === (right || []).length &&
      JSON.stringify(a) === JSON.stringify(b);
  };
  const summaries = plan.candidates.map(summarizeBookingTurnCandidate);
  const selected = noMutation
    ? null
    : summaries.find((candidate) =>
        candidate.operation === result.operation &&
        candidate.entity === result.entity &&
        candidate.field === result.field &&
        sameIds(candidate.span_ids, result.span_ids) &&
        sameIds(
          candidate.context_reference_ids,
          result.context_reference_ids,
        ),
      );
  if (!noMutation && !selected) {
    reject("structured_turn_candidate_no_exact_provenance_match");
  }
  if (!noMutation && result.confidence < 0.7) {
    reject("structured_turn_candidate_low_confidence_mutation");
  }
  if (!result.clarification_code && result.goal_id === "none" && noMutation) {
    reject("structured_turn_candidate_empty_resolution");
  }

  const scenarioAction = result.scenario_action === "read_only"
    ? "none"
    : result.scenario_action;
  const semanticAst = {
    turn_kind: result.clarification_code
      ? "clarification"
      : result.scenario_action === "read_only"
        ? "informational"
        : "transactional",
    goal_ids: result.goal_id === "none" ? [] : [result.goal_id],
    scenario_action: scenarioAction,
    operations: selected
      ? [{
          operation: selected.operation,
          entity: selected.entity,
          span_bindings: [...selected.span_ids],
          context_bindings: [...selected.context_reference_ids],
        }]
      : [],
    references: selected ? [...selected.context_reference_ids] : [],
    missing_slots: [...(plan.deterministic_result?.missing_fields || [])],
    clarification_code: result.clarification_code,
    confidence: result.confidence,
  };
  return {
    ...result,
    selected_candidate_ids: selected ? [selected.candidate_id] : [],
    intent_ids: result.goal_id === "none" ? [] : [result.goal_id],
    semantic_ast: semanticAst,
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
  let providerCalled = false;
  let config;
  try {
    config = getStructuredTurnProviderConfig(env);
  } catch (error) {
    error.structuredTurnLatencyMs = Date.now() - startedAt;
    error.structuredTurnProviderCalled = false;
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
    providerCalled = true;
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
    if (executionContext) {
      executionContext.semantic_input_token_estimate += Number(
        providerResult.usage?.prompt_tokens || 0,
      );
      executionContext.semantic_output_token_estimate += Number(
        providerResult.usage?.completion_tokens || 0,
      );
    }
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
      prompt_tokens: Number(providerResult.usage?.prompt_tokens || 0),
      completion_tokens: Number(providerResult.usage?.completion_tokens || 0),
      estimated_cost_usd: null,
    };
    safeLog(logger, "structured_turn_provider_finish", {
      mode: "candidate_id_resolver",
      path: "llm_candidate_selection",
      provider_status: metadata.provider_status,
      latency_ms: latencyMs,
      validation_outcome: "accepted",
      ambiguity_codes: metadata.clarification_code
        ? [metadata.clarification_code]
        : [],
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
    error.structuredTurnProviderCalled = providerCalled;
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
