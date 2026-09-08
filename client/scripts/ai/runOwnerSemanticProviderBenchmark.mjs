// Owner-run only. No env-file loaders, artifacts, retries, or Production clients.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_CALLS = 40;
const NOW = "2026-09-08T04:00:00.000Z";
const DATE_INFO = { currentDate: "2026-09-08", timeZone: "Asia/Taipei" };
const CONVERSATION = "owner-synthetic-conversation";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);
const exportsOf = (value) => value.default || value;
const fail = (code) => { throw new Error(code); };
const usageNumber = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

function baseContext(weights = [22]) {
  return {
    active_intent: "pricing", current_topic: "booking_price", stay_type: "villa",
    check_in: "2026-11-01", check_out: "2026-11-02", stay_nights: 1,
    adult_count: 10, child_count: 0, infant_count: 0, child_ages_years: [],
    pet_count: weights.length, pet_type: weights.length ? "dog" : null,
    pet_weights_kg: [...weights],
    dog_under_10kg_count: weights.filter((n) => n < 10).length,
    dog_10_to_20kg_count: weights.filter((n) => n >= 10 && n <= 20).length,
    dog_over_20kg_count: weights.filter((n) => n > 20).length,
    breakfast_count: 0,
    quote_scenario: { scenario_id: "owner-synthetic-scenario", context_version: 1 },
  };
}

// Independent semantic/state expectations, never inferred from a model response.
export function definitions() {
  const nights = { kind: "mutation", goal: "request_quote", entity: "stay",
    operations: ["set", "replace"], fields: ["stay.nights", "stay"],
    patch: { nights: 2, check_out: "2026-11-03" } };
  const pet = { kind: "mutation", goal: "request_quote", entity: "pet",
    operations: ["set", "replace"], fields: ["pets.individual_weights_kg", "pets"],
    patch: { weights: [20], pet_count: 1 } };
  const resume = { kind: "resume", goal: "request_quote", entity: "none",
    operations: ["none"], fields: ["none"], patch: {} };
  const clarify = { kind: "clarification", goal: "none", entity: "none",
    operations: ["none"], fields: ["none"], patch: {} };
  const removePet = { ...pet, operations: ["remove", "clear"], fields: ["pets.count", "pets"],
    patch: { weights: [], pet_count: 0, pet_type: null } };
  return [
    ["stay-01", "那改兩晚", "base", nights],
    ["stay-02", "那就住兩晚", "base", nights],
    ["stay-03", "如果改成兩個晚上呢", "base", nights],
    ["stay-04", "跟剛才一樣但住兩晚", "base", nights],
    ["day-05", "那週五呢", "day-type", { ...nights,
      fields: ["stay.date_type", "stay"], patch: { date_type: "friday" } }],
    ["pet-06", "狗改20公斤", "base", pet],
    ["pet-07", "原本那隻改20公斤", "base", pet],
    ["pet-08", "原本那隻不要", "base", removePet],
    ["reference-09", "另外一隻呢", "pet-target", clarify],
    ["resume-10", "其他一樣", "base", resume],
    ["pending-11", "都不要了", "pet-remove", removePet],
    ["pending-12", "都是", "pet-target", { ...pet, patch: { weights: [20, 20], pet_count: 2 } }],
    ["pending-13", "對", "stay-confirmation", nights],
    ["pending-14", "不是", "stay-confirmation", { ...clarify, kind: "reject" }],
    ["pending-15", "不是那個", "pet-target", clarify],
    ["party-16", "換成小朋友呢", "base", clarify],
    ["party-17", "少一個", "base", clarify],
    ["resume-18", "其餘不變", "base", resume],
    ["resume-19", "跟上一個一樣", "base", resume],
    ["resume-20", "那就照剛才的", "base", resume],
  ].map(([id, phrase, fixture, expected]) => ({ id, phrase, fixture, expected }));
}

export function providerDefinitions() {
  const original = definitions();
  const get = (id) => clone(original.find((entry) => entry.id === id));
  const resume = get("resume-10").expected;
  const clarify = get("party-17").expected;
  return [
    ...["stay-01", "stay-02", "stay-03", "stay-04", "day-05", "pet-06",
      "resume-10", "resume-18", "resume-19", "resume-20", "reference-09",
      "pending-15", "party-16", "party-17"].map(get),
    { id: "provider-21", phrase: "其他都一樣", fixture: "base", expected: resume },
    { id: "provider-22", phrase: "原本那個", fixture: "base", expected: clarify },
    { id: "provider-23", phrase: "另外那隻", fixture: "pet-target", expected: clarify },
    { id: "provider-24", phrase: "如果換成小朋友", fixture: "base", expected: clarify },
    { id: "provider-25", phrase: "其他照舊", fixture: "base", expected: resume },
    { id: "provider-26", phrase: "跟剛才的一樣", fixture: "base", expected: resume },
  ];
}

export function stateView(c) {
  return {
    check_in: c.check_in ?? null, check_out: c.check_out ?? null,
    nights: c.stay_nights ?? null, date_type: c.pricing_day_type ?? null,
    stay_type: c.stay_type ?? null,
    adults: c.adult_count ?? null, children: c.child_count ?? null, infants: c.infant_count ?? null,
    child_ages: c.child_ages_years || [], weights: c.pet_weights_kg || [],
    pet_count: c.pet_count ?? null, pet_type: c.pet_count === 0 ? null : c.pet_type ?? null,
    breakfast: c.breakfast_count ?? null,
  };
}

function pendingView(c) {
  const p = c.pending_interaction;
  return p ? { type: p.type, operation: p.operation, entity: p.entity,
    missing_slots: p.missing_slots || p.partial_operation?.missing_slots || [],
    candidate_targets: p.entity === "pet" && p.missing_slots?.includes("target_pet")
      ? (c.entity_references?.pets || []).map((pet) => pet.id) : p.candidate_references || [] } : null;
}

function safeAction(result) {
  // Only formally validated AST fields may reach this output projection.
  return { goal_id: result.goal_id, scenario_action: result.scenario_action,
    operation: result.operation, entity: result.entity, field: result.field,
    span_ids: result.span_ids, context_reference_ids: result.context_reference_ids,
    clarification_code: result.clarification_code, confidence: result.confidence };
}

function safeError(error, observation) {
  if (observation.error) return observation.error;
  const codes = new Map([
    ["malformed_model_json", "MALFORMED_MODEL_JSON"],
    ["structured_turn_candidate_invalid_schema", "INVALID_SCHEMA"],
    ["structured_turn_candidate_unknown_goal_id", "WRONG_GOAL"],
    ["structured_turn_candidate_invalid_scenario_action", "WRONG_SCENARIO_ACTION"],
    ["structured_turn_candidate_no_exact_provenance_match", "PROVENANCE_REJECTED"],
    ["structured_turn_pending_reference_contract_violation", "REFERENCE_CONTRACT_REJECTED"],
    ["structured_turn_candidate_low_confidence_mutation", "LOW_CONFIDENCE_MUTATION"],
    ["structured_turn_candidate_ambiguous_mutation", "AMBIGUOUS_MUTATION"],
    ["structured_turn_candidate_invalid_empty_operation", "INVALID_OPERATION"],
    ["structured_turn_candidate_empty_resolution", "EMPTY_RESOLUTION"],
    ["semantic_turn_unknown_span_id", "PROVENANCE_REJECTED"],
    ["semantic_turn_invalid_context_binding", "PROVENANCE_REJECTED"],
    ["semantic_turn_operation_without_provenance", "PROVENANCE_REJECTED"],
    ["semantic_turn_missing_scenario", "WRONG_REFERENCE"],
  ]);
  if (codes.has(error?.structuredTurnFailureCode)) return codes.get(error.structuredTurnFailureCode);
  if (codes.has(error?.message)) return codes.get(error.message);
  if (error?.providerErrorCode === "structured_turn_timeout") return "TIMEOUT";
  if (error?.failureStage === "provider_invalid_json") return "MALFORMED_RESPONSE";
  if (error?.failureStage === "provider_empty_choices") return "EMPTY_CHOICES";
  if (error?.failureStage === "provider_empty_content") return "EMPTY_CONTENT";
  return "PROVIDER_OR_VALIDATION_ERROR";
}

export async function loadRuntime() {
  const candidates = exportsOf(await import("../../server/aiChat/structuredBookingTurnCandidates.js"));
  const provider = exportsOf(await import("../../server/aiChat/structuredBookingTurnProvider.js"));
  const execution = exportsOf(await import("../../server/aiChat/modelExecutionContext.js"));
  const semantics = exportsOf(await import("../../server/aiChat/semanticTurnResolver.js"));
  const context = exportsOf(await import("../../server/aiChat/conversationContext.js"));
  const state = exportsOf(await import("../../server/aiChat/dialogueStateEngine.js"));
  return { ...candidates, ...provider, ...execution, ...semantics, ...context, ...state };
}

function options(context, message, turnId) {
  return { mode: "active", message, previousContext: clone(context), legacyContext: clone(context),
    conversationId: CONVERSATION, sourceMessageId: turnId, nowIso: NOW,
    dateInfo: DATE_INFO, previousTopic: "booking_price", contextResolverEnabled: true };
}

export async function fixtureContext(name, runtime) {
  let context = baseContext(name.startsWith("pet-") ? [22, 8] : [22]);
  if (name === "day-type") {
    context = { ...context, check_in: null, check_out: null, pricing_day_type: "weekday" };
  }
  context = runtime.getConversationContextForStorage(context);
  const message = {
    "pet-target": "狗改20公斤", "pet-remove": "移除一隻狗", "stay-confirmation": "住兩天",
  }[name];
  if (!message) return context;
  let attempted = false;
  const resolution = await runtime.resolveStructuredBookingTurnCandidatePipeline({
    ...options(context, message, `fixture-${name}`),
    resolveCandidates: async () => { attempted = true; fail("FIXTURE_PROVIDER_FORBIDDEN"); },
  });
  const pending = resolution.context.pending_interaction;
  if (attempted || !pending || !same(stateView(context), stateView(resolution.context))) fail("FIXTURE_SETUP_FAILED");
  if (pending.scenario_id !== context.quote_scenario.scenario_id ||
      pending.context_version !== context.quote_scenario.context_version ||
      !(Date.parse(pending.expires_at) > Date.parse(NOW))) fail("FIXTURE_SETUP_FAILED");
  if (name === "stay-confirmation" &&
      (pending.type !== "confirmation" || pending.proposed_values?.stay_nights !== 2)) fail("FIXTURE_SETUP_FAILED");
  if (name.startsWith("pet-") &&
      (pending.type !== "slot_fill" || !pending.partial_operation?.missing_slots.includes("target_pet"))) fail("FIXTURE_SETUP_FAILED");
  return resolution.context;
}

export async function deterministicControls(runtime) {
  const punctuation = ["", "？", "?", "。", "！", " ", "  ", "\n", "\t", "！ "];
  const cases = [];
  for (let index = 0; index < 10; index += 1) {
    cases.push([`pet-${index}`, `${11 + index}公斤狗`, {}]);
    cases.push([`breakfast-${index}`, `早餐${index + 1}份`, baseContext()]);
    cases.push([`checkout-${index}`, `退房時間${punctuation[index]}`, {}]);
    cases.push([`pool-${index}`, `有泳池嗎${punctuation[index]}`, {}]);
    cases.push([`friday-${index}`, `${index + 10}人週五`, {}]);
    cases.push([`quote-${index}`, `2026/11/1 ${index + 10}人住一晚多少`, {}]);
  }
  const rows = [];
  for (const [id, phrase, context] of cases) {
    let attempted = 0;
    let ok = false;
    let resolution = null;
    let exceptionType = null;
    const failedAssertions = [];
    try {
      const r = await runtime.resolveStructuredBookingTurnCandidatePipeline({
        ...options(context, phrase, `control-${id}`),
        resolveCandidates: async () => { attempted += 1; fail("CONTROL_PROVIDER_FORBIDDEN"); },
      });
      resolution = r;
      ok = attempted === 0 && !r.requiresModel && !r.provider?.called;
      if (r.requiresModel) failedAssertions.push("REQUIRES_MODEL_MUST_BE_FALSE");
      if (r.provider?.called) failedAssertions.push("PROVIDER_CALLED_MUST_BE_FALSE");
    } catch (error) {
      // Only fixed local codes, never exception text, stack, or provider data.
      const known = new Map([
        ["structured_turn_invalid_schema", "STRUCTURED_TURN_INVALID_SCHEMA"],
        ["CONTROL_PROVIDER_FORBIDDEN", "CONTROL_PROVIDER_FORBIDDEN"],
        ["UNEXPECTED_NETWORK_FORBIDDEN", "UNEXPECTED_NETWORK_FORBIDDEN"],
      ]);
      exceptionType = known.get(error?.message) || "LOCAL_VALIDATION_OR_RUNTIME_ERROR";
      failedAssertions.push("PIPELINE_MUST_COMPLETE_WITHOUT_EXCEPTION");
    }
    if (attempted !== 0) failedAssertions.push("PROVIDER_ATTEMPTS_MUST_BE_ZERO");
    rows.push({ case_id: `control-${id}`, input_phrase: phrase, pass: ok, attempts: attempted,
      requires_model: resolution ? Boolean(resolution.requiresModel) : null,
      provider_called: resolution ? Boolean(resolution.provider?.called) : null,
      scenario: resolution ? stateView(resolution.context) : null,
      exception_type: exceptionType, failed_assertions: failedAssertions });
  }
  return rows;
}

async function controlsOnly() {
  const nativeFetch = globalThis.fetch;
  let networkAttempts = 0;
  try {
    globalThis.fetch = async () => { networkAttempts += 1; fail("UNEXPECTED_NETWORK_FORBIDDEN"); };
    const controls = await deterministicControls(await loadRuntime());
    const passed = controls.filter((row) => row.pass).length;
    const attempts = controls.reduce((sum, row) => sum + row.attempts, 0);
    const gate = controls.length === 60 && passed === 60 && attempts === 0 && networkAttempts === 0;
    console.log("DETERMINISTIC CONTROL REPORT");
    console.log(`deterministic_controls: ${controls.length}`);
    console.log(`deterministic_pass: ${passed}`);
    console.log(`deterministic_fails: ${controls.length - passed}`);
    console.log("total_real_calls: 0");
    console.log(`forbidden_provider_attempts: ${attempts}`);
    console.log(`forbidden_network_attempts: ${networkAttempts}`);
    console.log(`gate: ${gate ? "PASS" : "FAIL"}`);
    for (const row of controls) console.log(JSON.stringify(row));
    if (!gate) process.exitCode = 1;
  } catch {
    console.log("DETERMINISTIC_CONTROL_SAFE_STOP");
    process.exitCode = 1;
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

// Capture numeric usage before model validation, including rejected model outputs.
async function guardedFetch(url, request, observation, budget, runtime, nativeFetch, key) {
  if (url !== ENDPOINT || request?.method !== "POST") {
    budget.fatal = true; observation.error = "DESTINATION_REJECTED"; fail(observation.error);
  }
  if (budget.calls >= MAX_CALLS || observation.calls >= 1) {
    budget.fatal = true; observation.error = "CALL_BUDGET_REJECTED"; fail(observation.error);
  }
  try {
    const payload = JSON.parse(request.body);
    runtime.assertStructuredTurnOutboundPayload(payload, { forbiddenValues: [key] });
    if (payload.model !== MODEL || payload.stream !== false ||
        payload.messages.length !== 2 || payload.max_tokens !== 300) fail("PAYLOAD_REJECTED");
  } catch {
    budget.fatal = true; observation.error = "OUTBOUND_REJECTED"; fail(observation.error);
  }
  budget.calls += 1;
  observation.calls += 1;
  let response;
  try { response = await nativeFetch(ENDPOINT, { ...request, redirect: "error" }); }
  catch (error) {
    observation.error = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
    fail(observation.error);
  }
  if (!response.ok) observation.error = "HTTP_ERROR";
  return {
    ok: response.ok, status: response.status,
    text: async () => {
      let body;
      try { body = await response.text(); }
      catch (error) {
        observation.error = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
        fail(observation.error);
      }
      try {
        const envelope = JSON.parse(body);
        observation.input_tokens = usageNumber(envelope?.usage?.prompt_tokens);
        observation.output_tokens = usageNumber(envelope?.usage?.completion_tokens);
        if (response.ok) {
          const raw = JSON.parse(envelope?.choices?.[0]?.message?.content);
          observation.schema_valid = runtime.structuredTurnCandidateResolverSchema.safeParse(raw).success;
          const allowed = new Set(["goal_id", "scenario_action", "operation", "entity", "field",
            "span_ids", "context_reference_ids", "clarification_code", "confidence"]);
          observation.extra_model_fields = raw && typeof raw === "object" &&
            Object.keys(raw).some((key) => !allowed.has(key));
        }
      } catch { if (response.ok) observation.schema_valid = false; }
      return body;
    },
  };
}

export function evaluateRuntime(entry, before, resolution) {
  const expected = entry.expected;
  const actualState = stateView(resolution.context);
  const matches = same(actualState, { ...stateView(before), ...expected.patch });
  const unchanged = same(actualState, stateView(before));
  const identity = resolution.context.quote_scenario?.scenario_id === before.quote_scenario?.scenario_id;
  const version = resolution.context.quote_scenario?.context_version;
  const oldVersion = before.quote_scenario?.context_version;
  const mutations = resolution.turn_delta?.operations || [];
  const reasons = [];
  if (!identity || resolution.reduction.stale) reasons.push("WRONG_REFERENCE");
  if (!matches) reasons.push(unchanged ? "EXPECTED_TRANSITION_MISSING" : "WRONG_MUTATION");
  if (version !== oldVersion + (expected.kind === "mutation" && matches ? 1 : 0)) reasons.push("WRONG_VERSION");
  const lane = resolution.plan.dialogue_goal_plan.lane;
  const confirmation = resolution.plan.dialogue_state;
  const confirming = confirmation?.confirmation === "confirm" && confirmation.pending_confirmation_current;
  if (["clarification", "reject"].includes(expected.kind)) {
    if (!unchanged || mutations.length) reasons.push("WRONG_MUTATION");
    if (!resolution.context.pending_interaction && !resolution.result.ambiguities.length) reasons.push("MISSING_CLARIFICATION");
    if (lane !== "dialogue") reasons.push("WRONG_ROUTE");
  } else {
    if (lane !== "transactional" && !confirming) reasons.push("WRONG_ROUTE");
    if (resolution.result.ambiguities.length || resolution.context.pending_interaction) reasons.push("UNEXPECTED_CLARIFICATION");
    if (expected.kind === "resume" && mutations.length) reasons.push("WRONG_MUTATION");
  }
  return [...new Set(reasons)];
}

export function evaluateProvider(entry, observation) {
  const reasons = [];
  const ast = observation.validated;
  if (observation.calls !== 1) reasons.push("PROVIDER_CALL_COUNT_INVALID");
  if (observation.error) reasons.push(observation.error);
  if (observation.schema_valid !== true) reasons.push("SCHEMA_NOT_VALIDATED");
  if (observation.provenance_valid !== true) reasons.push("PROVENANCE_NOT_VALIDATED");
  if (!ast) return [...new Set([...reasons, "NO_VALIDATED_AST"])];
  const expected = entry.expected;
  if (["clarification", "reject"].includes(expected.kind)) {
    if (observation.reference_contract && ast.clarification_code !== "missing_target_reference") reasons.push("WRONG_REFERENCE");
    if (!ast.clarification_code || ast.operation !== "none" || ast.entity !== "none" ||
        ast.field !== "none" || ast.span_ids.length || ast.context_reference_ids.length) reasons.push("WRONG_OPERATION");
    if (ast.goal_id !== "none") reasons.push("WRONG_GOAL");
  } else {
    if (ast.goal_id !== expected.goal) reasons.push("WRONG_GOAL");
    if (ast.clarification_code || !expected.operations.includes(ast.operation) || ast.entity !== expected.entity ||
        !expected.fields.includes(ast.field) || ast.scenario_action !== "continue") reasons.push("WRONG_OPERATION");
  }
  return [...new Set(reasons)];
}

export function classifyTurn({ realCalls, runtimeReasons, providerReasons, schemaValid, expectedKind }) {
  if (!realCalls) {
    if (runtimeReasons.length) return "LOCAL_RUNTIME_BUG";
    return ["clarification", "reject"].includes(expectedKind) ? "SAFE_REJECT_CORRECT" : "LOCAL_CORRECT";
  }
  if (schemaValid === false) return "PROVIDER_SCHEMA_BUG";
  if (providerReasons.length || runtimeReasons.length) return "PROVIDER_SEMANTIC_BUG";
  return "PROVIDER_CORRECT";
}

// Certification only: bypass routing on a detached plan, never change runtime routing.
export function certificationPlan(runtime, entry, before, turnId) {
  const input = options(before, entry.phrase, turnId);
  const plan = runtime.compileBookingTurnCandidates({
    message: input.message, context: before, conversationId: input.conversationId,
    sourceTurnId: turnId, nowIso: NOW, dateInfo: DATE_INFO,
    previousTopic: input.previousTopic, contextResolverEnabled: true,
  });
  if (entry.expected.kind === "mutation" && !plan.candidates.length) fail("CERTIFICATION_CANDIDATE_UNAVAILABLE");
  return { ...plan, requires_model: true, classification: "LLM_CANDIDATE_SELECTION" };
}

function applyCertifiedResult(runtime, before, plan, response, turnId) {
  const ast = response.result.semantic_ast;
  const selected = response.result.selected_candidate_ids;
  const operations = selected.map((id) => {
    const candidate = plan.candidates.find((item) => item.candidate_id === id);
    if (!candidate) fail("CERTIFICATION_UNKNOWN_CANDIDATE");
    return runtime.materializeBookingTurnCandidate(candidate, plan);
  });
  const result = { intents: response.result.intent_ids, operations,
    missing_fields: plan.deterministic_result.missing_fields,
    ambiguities: response.result.clarification_code ? [{ code: response.result.clarification_code,
      evidence: plan.sanitized_message, question: "請提供要調整的對象與條件。" }] : [],
    confidence: response.result.confidence };
  const reduction = runtime.applyScenarioTransition({ context: before, ast, operations,
    result, plan: { ...plan, resolved_intent_ast: ast }, nowIso: NOW, sourceTurnId: turnId });
  return { context: reduction.context, reduction, result: reduction.result || result,
    plan, turn_delta: reduction.turn_delta };
}

export async function runCase(entry, repetition, runtime, env, budget, nativeFetch, gate = "runtime") {
  const started = Date.now();
  const o = { calls: 0, schema_valid: null, provenance_valid: null, extra_model_fields: false,
    input_tokens: null, output_tokens: null, error: null, validated: null, schema_diagnostics: [] };
  let before;
  let resolution;
  let reasons = [];
  let providerReasons = [];
  try {
    before = await fixtureContext(entry.fixture, runtime);
    const turnId = `${entry.id}-run-${repetition}`;
    const execution = runtime.createAiModelExecutionContext({ requestId: turnId, modelCallBudget: 1 });
    runtime.setModelCallPlan(execution, runtime.createStructuredTurnResolverCallPlan());
    const resolveCandidates = async ({ plan }) => {
        o.reference_contract = Boolean(plan.reference_contract);
        try {
          const response = await runtime.callStructuredBookingTurnInterpreter({
            plan, executionContext: execution, env, logger: null,
            fetchImpl: (url, request) => guardedFetch(
              url, request, o, budget, runtime, nativeFetch, env.DEEPSEEK_API_KEY,
            ),
          });
          // Provider validation enforces strict schema and an exact candidate/provenance tuple.
          // Validate the formal AST/context contract before the pipeline materializes any values.
          runtime.validateSemanticTurnAst(response.result.semantic_ast, {
            plan: { spans: plan.spans, context: before },
          });
          o.provenance_valid = true;
          o.validated = safeAction(response.result);
          return response;
        } catch (error) {
          o.error = safeError(error, o);
          o.schema_diagnostics = runtime.sanitizedStructuredTurnSchemaDiagnostics(error);
          if (o.error === "PROVENANCE_REJECTED") o.provenance_valid = false;
          throw error;
        }
    };
    if (gate === "provider") {
      const plan = certificationPlan(runtime, entry, before, turnId);
      const response = await resolveCandidates({ plan });
      resolution = applyCertifiedResult(runtime, before, plan, response, turnId);
    } else {
      resolution = await runtime.resolveStructuredBookingTurnCandidatePipeline({
        ...options(before, entry.phrase, turnId), resolveCandidates,
      });
    }
    reasons = evaluateRuntime(entry, before, resolution);
    if (!o.validated && o.calls && !same(stateView(before), stateView(resolution.context))) reasons.push("INVALID_OUTPUT_MUTATION");
    if (o.extra_model_fields && o.validated) reasons.push("INVENTED_VALUE_ACCEPTED");
    if (execution.model_call_count > 1 || o.calls > 1) reasons.push("DOUBLE_CALL");
  } catch { reasons.push(before ? "SCENARIO_VALIDATION_REJECTED" : "FIXTURE_SETUP_FAILED"); }
  if (o.calls || gate === "provider") providerReasons = evaluateProvider(entry, o);
  const passed = gate === "provider" ? reasons.length === 0 && providerReasons.length === 0 : reasons.length === 0;
  return {
    case_id: `${entry.id}.${repetition}`, input_phrase: entry.phrase,
    scenario: before ? stateView(before) : null, pending: before ? pendingView(before) : null,
    expected_semantic_action: entry.expected,
    actual_semantic_action: o.validated || (o.calls ? "SAFE_REJECT" : resolution?.plan.resolved_intent_ast || "LOCAL_REJECT"),
    actual_scenario: resolution ? stateView(resolution.context) : null,
    pass: passed, reasons: [...new Set(reasons)],
    runtime_pass: reasons.length === 0,
    provider_pass: o.calls ? providerReasons.length === 0 && reasons.length === 0 : null,
    provider_reasons: providerReasons,
    classification: classifyTurn({ realCalls: o.calls, runtimeReasons: reasons,
      providerReasons, schemaValid: o.schema_valid, expectedKind: entry.expected.kind }),
    schema_valid: o.schema_valid, provenance_valid: o.provenance_valid,
    provider_error_type: o.error, real_calls: o.calls,
    schema_diagnostics: o.schema_diagnostics,
    input_tokens: o.input_tokens, output_tokens: o.output_tokens, latency_ms: Date.now() - started,
  };
}

export function summarizeBenchmark(rows, controls, budget, gate = "runtime") {
  const count = (predicate) => rows.filter(predicate).length;
  const reason = (code) => count((row) => row.reasons.includes(code));
  const pass = count((row) => row.pass);
  const providerRows = rows.filter((row) => row.real_calls > 0);
  const providerCorrect = providerRows.filter((row) => row.provider_pass === true).length;
  const percent = (part, total) => total ? 100 * part / total : null;
  const providerReason = (code) => providerRows.filter((row) => row.provider_reasons.includes(code)).length;
  const input = rows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0);
  const output = rows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0);
  const usageComplete = budget.calls > 0 && rows.filter((r) => r.real_calls).every(
    (r) => r.input_tokens !== null && r.output_tokens !== null,
  );
  const summary = {
    gate_type: gate === "provider" ? "PROVIDER_CERTIFICATION" : "RUNTIME_ROUTING_STATE",
    planned_cases: 20, planned_turns: 40, completed_turns: rows.length,
    total_real_calls: budget.calls, pass, fail: rows.length - pass,
    schema_valid: count((r) => r.schema_valid === true),
    schema_invalid: count((r) => r.schema_valid === false),
    provenance_rejected: count((r) => r.provenance_valid === false),
    correct_behavior: count((row) => row.runtime_pass),
    wrong_route: reason("WRONG_ROUTE"),
    missing_clarification: reason("MISSING_CLARIFICATION"),
    unexpected_clarification: reason("UNEXPECTED_CLARIFICATION"),
    context_lost: reason("WRONG_REFERENCE"),
    wrong_amount: null,
    wrong_goal: providerReason("WRONG_GOAL"), wrong_operation: providerReason("WRONG_OPERATION"),
    wrong_reference: count((r) => [...r.reasons, ...r.provider_reasons].some((code) =>
      ["WRONG_REFERENCE", "PROVENANCE_REJECTED"].includes(code))),
    wrong_mutation: count((row) => row.reasons.some((code) => ["WRONG_MUTATION", "EXPECTED_TRANSITION_MISSING"].includes(code))),
    invented_value_accepted: reason("INVENTED_VALUE_ACCEPTED"),
    state_mutation_from_invalid_output: reason("INVALID_OUTPUT_MUTATION"),
    safe_clarification: count((r) => Boolean(r.actual_semantic_action?.clarification_code)),
    provider_errors: count((r) => ["HTTP_ERROR", "NETWORK_ERROR"].includes(r.provider_error_type)),
    timeouts: count((r) => r.provider_error_type === "TIMEOUT"),
    same_turn_double_call: reason("DOUBLE_CALL"),
    deterministic_controls: controls.length, deterministic_pass: controls.filter((r) => r.pass).length,
    deterministic_provider_calls: 0,
    deterministic_forbidden_attempts: controls.reduce((sum, r) => sum + r.attempts, 0),
    input_tokens_total: usageComplete ? input : null, output_tokens_total: usageComplete ? output : null,
    observed_input_tokens: input, observed_output_tokens: output, usage_complete: usageComplete,
    total_tokens: usageComplete ? input + output : null,
    avg_input_tokens: usageComplete ? input / budget.calls : null,
    avg_output_tokens: usageComplete ? output / budget.calls : null,
    average_calls_per_turn: rows.length ? budget.calls / rows.length : 0,
    max_calls_per_turn: Math.max(0, ...rows.map((r) => r.real_calls)),
    zero_call_percent: percent(count((row) => row.real_calls === 0), rows.length),
    one_call_percent: percent(count((row) => row.real_calls === 1), rows.length),
    over_one_call_percent: percent(count((row) => row.real_calls > 1), rows.length),
    provider_evaluated_turns: providerRows.length,
    provider_schema_valid_percent: percent(providerRows.filter((row) => row.schema_valid === true).length, providerRows.length),
    provider_semantic_correct_percent: percent(providerCorrect, providerRows.length),
    runtime_behavior_correct_percent: percent(count((row) => row.runtime_pass), rows.length),
    price_verification: "SEPARATE_ACTUAL_HANDLER_TEST_GATE_REQUIRED",
    gate: !budget.fatal && rows.length === 40 && pass === 40 &&
      (gate !== "provider" || (budget.calls === 40 && providerCorrect === 40)) &&
      controls.length === 60 && controls.every((r) => r.pass) && !reason("WRONG_MUTATION") &&
      !reason("INVALID_OUTPUT_MUTATION") && !reason("INVENTED_VALUE_ACCEPTED") &&
      !reason("DOUBLE_CALL") ? "PASS" : "FAIL",
  };
  return summary;
}

function report(rows, controls, budget, write, gate) {
  const summary = summarizeBenchmark(rows, controls, budget, gate);
  write(gate === "provider" ? "GATE B: PROVIDER CERTIFICATION" : "GATE A COMPONENT: RUNTIME ROUTING/STATE (actual-handler tests also required)");
  for (const [key, value] of Object.entries(summary)) write(`${key}: ${value ?? "N/A"}`);
  write("CASE RESULTS (synthetic data only)");
  for (const row of rows) write(JSON.stringify({ ...row, result: row.pass ? "PASS" : "FAIL" }));
  write("FAIL CASES");
  for (const row of rows.filter((r) => !r.pass)) write(`${row.case_id} | ${row.input_phrase} | ${[...row.reasons, ...row.provider_reasons].join(",")}`);
  for (const row of controls.filter((r) => !r.pass)) write(JSON.stringify({ ...row, result: "DETERMINISTIC_CONTROL_FAIL" }));
  return summary.gate;
}

async function main() {
  // This local-only path never reads credentials and blocks all network requests.
  if (process.argv.length === 3 && process.argv[2] === "--controls-only") {
    await controlsOnly();
    return;
  }
  const gate = process.argv[2] === "--provider-only" ? "provider" : "runtime";
  // Check before imports or diagnostics. No command-line or alternate secret source.
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log("DEEPSEEK_API_KEY_NOT_SET");
    process.exitCode = 1;
    return;
  }
  const env = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: "https://api.deepseek.com", DEEPSEEK_MODEL: MODEL };
  delete process.env.DEEPSEEK_API_KEY;
  const nativeFetch = globalThis.fetch;
  const write = (line) => {
    // Last boundary: even a reflected key is never printed.
    if (String(line).includes(env.DEEPSEEK_API_KEY)) fail("REPORT_REJECTED");
    console.log(line);
  };
  const forget = () => { delete process.env.DEEPSEEK_API_KEY; env.DEEPSEEK_API_KEY = ""; };
  const interrupt = () => { forget(); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const budget = { calls: 0, fatal: false };
  const rows = [];
  try {
    if ((process.argv.length !== 2 && !(process.argv.length === 3 &&
      ["--runtime", "--provider-only"].includes(process.argv[2]))) ||
      typeof nativeFetch !== "function") fail("INVALID_INVOCATION");
    globalThis.fetch = async () => { budget.fatal = true; fail("UNEXPECTED_NETWORK_FORBIDDEN"); };
    const runtime = await loadRuntime();
    const controls = await deterministicControls(runtime);
    if (controls.some((r) => !r.pass) || budget.fatal) {
      report(rows, controls, budget, write, gate);
      process.exitCode = 1;
      return;
    }
    for (const entry of gate === "provider" ? providerDefinitions() : definitions()) {
      for (let repetition = 1; repetition <= 2; repetition += 1) {
        rows.push(await runCase(entry, repetition, runtime, env, budget, nativeFetch, gate));
        if (budget.fatal) break;
      }
      if (budget.fatal) break;
    }
    if (report(rows, controls, budget, write, gate) !== "PASS") process.exitCode = 1;
  } catch {
    // Never stringify exceptions: upstream errors can contain arbitrary provider data.
    console.log("REAL SEMANTIC PROVIDER REPORT");
    console.log("gate: FAIL");
    console.log("provider_error_type: LOCAL_RUNNER_SAFE_STOP");
    console.log(`total_real_calls: ${budget.calls}`);
    process.exitCode = 1;
  } finally {
    forget();
    globalThis.fetch = nativeFetch;
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
