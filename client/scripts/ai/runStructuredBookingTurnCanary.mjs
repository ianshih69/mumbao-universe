import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lodgingPricingModule from "../../server/aiChat/lodgingPricing.js";
import structuredTurnModule from "../../server/aiChat/structuredBookingTurn.js";
import candidateModule from "../../server/aiChat/structuredBookingTurnCandidates.js";
import turnActionExecutorModule from "../../server/aiChat/turnActionExecutor.js";

const { buildOfficialPricingResolution } = lodgingPricingModule;
const {
  buildStructuredClarificationRoute,
  toTurnActionSemanticResult,
} = structuredTurnModule;
const {
  reduceBookingContextFromCandidates,
  resolveStructuredBookingTurnCandidatePipeline,
} = candidateModule;
const { executeTurnAction } = turnActionExecutorModule;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const manifestPath = path.join(
  repoRoot,
  "client/server/aiChat/structuredBookingTurn.canary.json",
);
const nowIso = "2026-09-06T00:00:00.000Z";
const dateInfo = { currentDate: "2026-09-06", timeZone: "Asia/Taipei" };

const baseContext = Object.freeze({
  active_intent: "pricing",
  current_topic: "booking_price",
  stay_type: "villa",
  check_in: "2026-11-01",
  check_out: "2026-11-02",
  stay_nights: 1,
  adult_count: 10,
  child_count: 0,
  infant_count: 0,
  pet_count: 0,
  pet_type: null,
  pet_weights_kg: [],
  dog_under_10kg_count: 0,
  dog_10_to_20kg_count: 0,
  dog_over_20kg_count: 0,
});

function canaryContext(name) {
  const variants = {
    empty: {},
    base: baseContext,
    "base-no-pet": { ...baseContext, pet_count: null, pet_type: "dog" },
    "one-dog": {
      ...baseContext,
      pet_count: 1,
      pet_type: "dog",
      pet_weights_kg: [8],
      dog_under_10kg_count: 1,
    },
    "two-dogs": {
      ...baseContext,
      pet_count: 2,
      pet_type: "dog",
      pet_weights_kg: [8, 15],
      dog_under_10kg_count: 1,
      dog_10_to_20kg_count: 1,
    },
    "pending-dog": {
      ...baseContext,
      pet_count: 1,
      pet_type: "dog",
      pending_interaction: {
        action: "collect_quote_fields",
        proposed_values: {},
        required_response_type: "fields",
        required_fields: ["dog_over_20kg_count"],
        resume_action: "request_quote",
      },
    },
    room: { ...baseContext, stay_type: "room" },
    "breakfast-one": { ...baseContext, breakfast_count: 1 },
  };
  return structuredClone(variants[name] || {});
}

function expectedClassification(item) {
  if (item.ambiguity) return "SAFE_CLARIFICATION";
  if ((item.intents || []).includes("policy_question") && !(item.entities || []).length) {
    return "CONTEXT_ACTION_ONLY";
  }
  return "DETERMINISTIC_EXPECTED";
}

function evaluateExpected(item, resolution) {
  const failures = [];
  const { result, reduction } = resolution;
  const expectedClass = expectedClassification(item);
  if (resolution.classification !== expectedClass) {
    failures.push(`wrong_classification:${resolution.classification}`);
  }
  if (item.ambiguity) {
    if (!result.ambiguities.some((entry) => entry.code === item.ambiguity)) {
      failures.push(`missing_ambiguity:${item.ambiguity}`);
    }
    if (reduction.changed || reduction.applied) failures.push("ambiguous_mutation");
    return failures;
  }
  if (result.ambiguities.length) failures.push("unexpected_ambiguity");
  if (item.entities) {
    const actual = [...new Set(result.operations.map((entry) => entry.entity))].sort();
    const expected = [...item.entities].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`wrong_entities:${actual.join(",") || "none"}`);
    }
  }
  for (const intent of item.intents || []) {
    if (!result.intents.includes(intent)) failures.push(`missing_intent:${intent}`);
  }
  for (const field of [
    "adult_count",
    "child_count",
    "infant_count",
    "pet_count",
    "breakfast_count",
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(item, field) &&
      reduction.context[field] !== item[field]
    ) {
      failures.push(`wrong_${field}:${String(reduction.context[field])}`);
    }
  }
  if (item.missing && !result.missing_fields.includes(item.missing)) {
    failures.push(`missing_field_not_reported:${item.missing}`);
  }
  return failures;
}

function candidateContainsRawValues(candidate) {
  return [
    "count",
    "pet_type",
    "weights_kg",
    "ages_years",
    "mode",
    "check_in",
    "check_out",
    "nights",
    "date_type",
  ].some((key) => Object.prototype.hasOwnProperty.call(candidate, key));
}

function provenanceFailures(resolution) {
  if (!resolution.turn_delta.candidates.length) return [];
  const byEntity = {
    stay: ["stay_type", "check_in", "check_out", "stay_nights", "pricing_day_type"],
    adult: ["adult_count"],
    child: ["child_count"],
    infant: ["infant_count"],
    pet: ["pet_count", "pet_weights_kg"],
    breakfast: ["breakfast_count"],
  };
  const failures = [];
  for (const candidate of resolution.turn_delta.candidates) {
    const candidateFields = new Set(candidate.bindings.map((binding) => binding.field));
    const relevantFields = (byEntity[candidate.entity] || []).filter((field) => {
      if (candidate.entity === "stay") {
        const map = {
          stay_type: "mode",
          check_in: "check_in",
          check_out: "check_out",
          stay_nights: "nights",
          pricing_day_type: "date_type",
        };
        return candidateFields.has(map[field]);
      }
      if (field === "pet_weights_kg") return candidateFields.has("weights_kg");
      return candidateFields.has("count");
    });
    for (const field of relevantFields) {
      const meta = resolution.context.slot_meta?.[field];
      if (
        meta?.source !== "structured_candidate" ||
        !meta?.source_turn_id ||
        !Array.isArray(meta?.evidence_span_ids) ||
        meta.evidence_span_ids.length === 0 ||
        !Object.prototype.hasOwnProperty.call(meta, "value")
      ) {
        failures.push(`${candidate.candidate_id}:${field}`);
      }
    }
  }
  return failures;
}

const ruleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "canary-pricing",
  effective_from: "2026-11-01",
  effective_to: "2027-02-01",
  deposit_rate: 0.3,
  is_active: true,
};

function createPricingReader() {
  return async (pathname) => {
    const url = new URL(`https://pricing.test${pathname}`);
    const table = url.pathname.slice(1);
    if (table === "booking_price_rule_sets") return [ruleSet];
    if (table === "booking_special_dates") return [];
    if (table === "booking_package_rates") {
      const guests = Number(
        String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""),
      );
      const dayType = String(url.searchParams.get("day_type") || "").replace(
        /^eq\./,
        "",
      );
      const prices = {
        weekday: { 10: 25000, 18: 35000 },
        friday: { 10: 32000, 18: 42000 },
        holiday: { 10: 39000, 18: 49000 },
      };
      const nightlyPrice = prices[dayType]?.[guests];
      return nightlyPrice == null
        ? []
        : [{
            id: `${guests}-${dayType}`,
            rule_set_id: ruleSet.id,
            guest_count: guests,
            day_type: dayType,
            nightly_price: nightlyPrice,
            is_active: true,
          }];
    }
    throw new Error(`unexpected_pricing_table:${table}`);
  };
}

async function verifyQuotes(resultsById) {
  let wrongQuoteAmount = 0;
  let completeInputFallback = 0;
  let actionRoutingFailures = 0;
  const expectations = new Map([
    ["quote-complete-50", "TWD 26,200"],
    ["quote-order-51", "TWD 26,200"],
    ["mixed-availability-49", "TWD 25,000"],
  ]);
  for (const [caseId, expectedAmount] of expectations) {
    const record = resultsById.get(caseId);
    const context = canaryContext(record.item.context);
    const action = await executeTurnAction({
      message: record.item.message,
      semanticResult: toTurnActionSemanticResult(record.resolution.result, context),
      routeResult: {
        route: "faq_selector_required",
        providerUsed: "faq_selector_required",
        shouldCallDeepSeek: true,
        matchedFaqItems: [],
        matchedFaqIds: [],
      },
      context: record.resolution.context,
      previousContext: context,
      recentMessages: [],
      pricingOptions: {
        supabaseRequest: createPricingReader(),
        referenceDate: "2026-09-06",
      },
    });
    if (!String(action.answer || "").includes(expectedAmount)) wrongQuoteAmount += 1;
    if (action.route !== "grounded_reply") completeInputFallback += 1;
    if (
      caseId === "mixed-availability-49" &&
      !String(action.answer || "").includes(
        "實際房況仍須以官網即時訂房系統為準",
      )
    ) {
      actionRoutingFailures += 1;
    }
  }
  const pricing = await buildOfficialPricingResolution(
    resultsById.get("quote-complete-50").resolution.context,
    {
      supabaseRequest: createPricingReader(),
      referenceDate: "2026-09-06",
    },
  );
  if (pricing.total_amount !== 26200) wrongQuoteAmount += 1;
  return { wrongQuoteAmount, completeInputFallback, actionRoutingFailures };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  if (manifest.length !== 52 || manifestById.size !== 52) {
    throw new Error("canary_manifest_must_contain_52_unique_cases");
  }

  let actualModelCalls = 0;
  const records = [];
  for (const item of manifest) {
    const context = canaryContext(item.context);
    let resolution;
    try {
      resolution = await resolveStructuredBookingTurnCandidatePipeline({
        mode: "active",
        message: item.message,
        previousContext: context,
        legacyContext: context,
        nowIso,
        sourceMessageId: `offline:${item.id}`,
        dateInfo,
        previousTopic: context.current_topic || "",
        resolveCandidates: async () => {
          actualModelCalls += 1;
          throw new Error("offline_canary_model_call_forbidden");
        },
      });
    } catch (error) {
      throw new Error(`${item.id}:${error.message}`);
    }
    const failures = evaluateExpected(item, resolution);
    records.push({ item, resolution, failures });
  }

  const resultsById = new Map(records.map((record) => [record.item.id, record]));
  const categoryCounts = Object.fromEntries([
    "DETERMINISTIC_EXPECTED",
    "LLM_CANDIDATE_SELECTION",
    "SAFE_CLARIFICATION",
    "CONTEXT_ACTION_ONLY",
  ].map((classification) => [
    classification,
    records.filter((record) => record.resolution.classification === classification).length,
  ]));
  const candidateCounts = records.map((record) => record.resolution.plan.candidates.length);
  const deterministicRecords = records.filter(
    (record) => record.resolution.classification === "DETERMINISTIC_EXPECTED",
  );
  const deterministicPass = deterministicRecords.filter(
    (record) => record.failures.length === 0,
  ).length;
  const safeClarifications = records.filter(
    (record) => record.resolution.classification === "SAFE_CLARIFICATION",
  );
  const ambiguousMutation = safeClarifications.filter(
    (record) => record.resolution.reduction.changed || record.resolution.reduction.applied,
  ).length;
  const modelRawValueCreation = records.reduce(
    (total, record) => total + record.resolution.plan.candidates.filter(
      candidateContainsRawValues,
    ).length,
    0,
  );
  const provenanceMissing = records.flatMap((record) =>
    provenanceFailures(record.resolution),
  );

  let unknownCandidateAccepted = 0;
  const knownPlan = resultsById.get("adult-add-15").resolution.plan;
  try {
    reduceBookingContextFromCandidates(baseContext, knownPlan, ["cand-999-adult-add"]);
    unknownCandidateAccepted = 1;
  } catch (error) {
    if (error.message !== "structured_candidate_unknown_candidate_id") throw error;
  }

  const single = resultsById.get("quote-complete-50").resolution.context;
  const ordered = resultsById.get("quote-order-51").resolution.context;
  const followUp = resultsById.get("pet-add-01").resolution.context;
  const equivalenceFields = [
    "stay_type",
    "check_in",
    "check_out",
    "stay_nights",
    "adult_count",
    "child_count",
    "infant_count",
    "pet_count",
    "pet_weights_kg",
    "dog_under_10kg_count",
    "dog_10_to_20kg_count",
    "dog_over_20kg_count",
  ];
  const equivalentValue = (context, field) =>
    ["child_count", "infant_count"].includes(field)
      ? context[field] ?? 0
      : context[field];
  const equivalent = (left, right) => equivalenceFields.every(
    (field) => JSON.stringify(equivalentValue(left, field)) ===
      JSON.stringify(equivalentValue(right, field)),
  );
  const equivalencePass = [ordered, followUp].filter((context) =>
    equivalent(context, single),
  ).length;

  const mixedAvailability = resultsById.get("mixed-availability-49").resolution;
  const contextualAvailability = await resolveStructuredBookingTurnCandidatePipeline({
    mode: "active",
    message: "那這天還有房嗎",
    previousContext: mixedAvailability.context,
    legacyContext: mixedAvailability.context,
    sourceMessageId: "offline:availability-followup",
  });
  const repeatedStayPatch = contextualAvailability.turn_delta.operations.some(
    (operation) => operation.entity === "stay",
  ) ? 1 : 0;

  const clarificationRoutes = safeClarifications.filter((record) => {
    const route = buildStructuredClarificationRoute(
      { route: "faq_selector_required", shouldCallDeepSeek: true },
      record.resolution.result,
    );
    return route.route === "faq_collect_info" &&
      route.shouldCallDeepSeek === false &&
      Boolean(route.answer);
  }).length;
  const quote = await verifyQuotes(resultsById);
  const wrongMutation = records.filter((record) => record.failures.some((failure) =>
    failure.startsWith("wrong_") || failure === "unexpected_ambiguity",
  )).length;
  const failedRecords = records.filter((record) => record.failures.length);
  const petWeights = resultsById.get("pet-weights-07");

  const summary = {
    gate: failedRecords.length === 0 &&
      actualModelCalls === 0 &&
      categoryCounts.LLM_CANDIDATE_SELECTION === 0 &&
      modelRawValueCreation === 0 &&
      unknownCandidateAccepted === 0 &&
      wrongMutation === 0 &&
      ambiguousMutation === 0 &&
      provenanceMissing.length === 0 &&
      equivalencePass === 2 &&
      quote.wrongQuoteAmount === 0 &&
      quote.completeInputFallback === 0 &&
      repeatedStayPatch === 0
      ? "PASS"
      : "FAIL",
    cases: manifest.length,
    categories: categoryCounts,
    model_needed_cases: categoryCounts.LLM_CANDIDATE_SELECTION,
    actual_model_calls: actualModelCalls,
    estimated_model_calls: categoryCounts.LLM_CANDIDATE_SELECTION,
    estimated_model_cost_usd: categoryCounts.LLM_CANDIDATE_SELECTION === 0 ? 0 : null,
    average_candidate_count: Number(
      (candidateCounts.reduce((sum, count) => sum + count, 0) / manifest.length).toFixed(3),
    ),
    max_candidate_count: Math.max(...candidateCounts),
    deterministic_pass: deterministicPass,
    deterministic_total: deterministicRecords.length,
    deterministic_pass_rate: deterministicRecords.length
      ? deterministicPass / deterministicRecords.length
      : 1,
    safe_clarification_pass: clarificationRoutes,
    safe_clarification_total: safeClarifications.length,
    pet_weights_07_pass: petWeights.failures.length === 0,
    pet_weights_07_model_calls: 0,
    mixed_availability_repeated_stay_patch: repeatedStayPatch,
    model_generated_raw_values: modelRawValueCreation,
    unknown_candidate_accepted: unknownCandidateAccepted,
    wrong_mutation: wrongMutation,
    ambiguous_mutation: ambiguousMutation,
    provenance_missing: provenanceMissing.length,
    equivalence_pass: equivalencePass,
    equivalence_total: 2,
    wrong_quote_amount: quote.wrongQuoteAmount,
    complete_input_fallback: quote.completeInputFallback,
    action_routing_failures: quote.actionRoutingFailures,
    failures: failedRecords.map((record) => ({
      case_id: record.item.id,
      reasons: record.failures,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.gate !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    gate: "FAIL",
    reason: String(error?.message || "canary_failed").slice(0, 160),
  }));
  process.exitCode = 1;
});
