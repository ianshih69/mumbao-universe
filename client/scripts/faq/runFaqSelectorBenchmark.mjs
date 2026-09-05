#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFaqItems } from "../../server/aiChat/faqRetrieval.js";
import { routeKnowledge } from "../../server/aiChat/knowledgeRouter.js";
import {
  buildApprovedFaqSelectorCatalog,
  callFaqFullCatalogSelector,
  getFaqSelectorModelName,
} from "../../server/aiChat/faqSemanticVerifier.js";
import {
  createAiModelExecutionContext,
  createModelCallPlan,
  setModelCallPlan,
} from "../../server/aiChat/modelExecutionContext.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../../..");
const defaultDatasetPath = path.join(
  repoRoot,
  "client/api/knowledge/faq-selector-benchmark-cases.json"
);
const defaultEnvPath = path.join(repoRoot, "client/.env.local");
const defaultOutputDir = path.join(repoRoot, "tmp");

const usage = `
Usage:
  npm run faq:selector:benchmark -- [options]

Options:
  --smoke                     Run a deterministic 30-case mixed smoke sample.
  --limit <n>                 Run at most n cases after filtering.
  --suite <name>              Filter by suite: positive, negative, multi_intent.
  --type <name>               Filter by type; may be repeated or comma-separated.
  --dataset <path>            Dataset path. Defaults to client/api/knowledge/faq-selector-benchmark-cases.json.
  --env-file <path>           Local env path. Defaults to client/.env.local.
  --concurrency <n>           Selector concurrency, default 2, max 5.
  --retries <n>               Retry API failures, default 1.
  --output <path>             Report JSON path. Defaults to tmp/faq-selector-benchmark-<timestamp>.json.
  --resume <path>             Reuse successful case results from an earlier report.
  --help                      Show this message.
`;

function parseArgs(argv) {
  const args = {
    smoke: false,
    limit: 0,
    suites: new Set(),
    types: new Set(),
    datasetPath: defaultDatasetPath,
    envPath: defaultEnvPath,
    concurrency: 2,
    retries: 1,
    outputPath: "",
    resumePath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--help" || arg === "-h") {
      console.log(usage.trim());
      process.exit(0);
    } else if (arg === "--smoke") {
      args.smoke = true;
    } else if (arg === "--limit") {
      args.limit = Math.max(0, Number(next() || 0));
    } else if (arg === "--suite") {
      for (const value of next().split(",")) {
        if (value.trim()) args.suites.add(value.trim());
      }
    } else if (arg === "--type") {
      for (const value of next().split(",")) {
        if (value.trim()) args.types.add(value.trim());
      }
    } else if (arg === "--dataset") {
      args.datasetPath = path.resolve(repoRoot, next());
    } else if (arg === "--env-file") {
      args.envPath = path.resolve(repoRoot, next());
    } else if (arg === "--concurrency") {
      args.concurrency = Math.min(5, Math.max(1, Number(next() || 2)));
    } else if (arg === "--retries") {
      args.retries = Math.max(0, Number(next() || 0));
    } else if (arg === "--output") {
      args.outputPath = path.resolve(repoRoot, next());
    } else if (arg === "--resume") {
      args.resumePath = path.resolve(repoRoot, next());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.outputPath) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    args.outputPath = path.join(
      defaultOutputDir,
      `faq-selector-benchmark-${stamp}.json`
    );
  }

  return args;
}

function parseEnvValue(rawValue) {
  let value = String(rawValue || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return { file: envPath, exists: false, loadedNames: [] };
  }

  const text = fs.readFileSync(envPath, "utf8");
  const loadedNames = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!process.env[name]) {
      process.env[name] = parseEnvValue(rawValue);
      loadedNames.push(name);
    }
  }

  return { file: envPath, exists: true, loadedNames };
}

function readDataset(datasetPath) {
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const cases = [
    ...(dataset.positive || []),
    ...(dataset.negative || []),
    ...(dataset.safety_controls || []),
    ...(dataset.multi_intent || []),
  ];
  return { dataset, cases };
}

function pickSmokeCases(cases) {
  const picked = [];
  for (const type of [
    "canonical",
    "polite",
    "short",
    "paraphrase",
    "contextual_paraphrase",
  ]) {
    picked.push(...cases.filter((item) => item.type === type).slice(0, 4));
  }
  picked.push(...cases.filter((item) => item.suite === "negative").slice(0, 5));
  picked.push(
    ...cases.filter((item) => item.suite === "multi_intent").slice(0, 5)
  );
  return picked;
}

function filterCases(cases, args) {
  let selected = args.smoke ? pickSmokeCases(cases) : cases;
  if (args.suites.size) {
    selected = selected.filter((item) => args.suites.has(item.suite));
  }
  if (args.types.size) {
    selected = selected.filter((item) => args.types.has(item.type));
  }
  if (args.limit > 0) {
    selected = selected.slice(0, args.limit);
  }
  return selected;
}

function normalizeIdSet(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    .sort();
}

function setsEqual(left = [], right = []) {
  const a = normalizeIdSet(left);
  const b = normalizeIdSet(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function intersection(left = [], right = []) {
  const rightSet = new Set(normalizeIdSet(right));
  return normalizeIdSet(left).filter((value) => rightSet.has(value));
}

function loadResumeResults(resumePath) {
  if (!resumePath || !fs.existsSync(resumePath)) return new Map();
  const report = JSON.parse(fs.readFileSync(resumePath, "utf8"));
  const results = Array.isArray(report.results) ? report.results : [];
  return new Map(
    results
      .filter((result) => result.case_id && !result.api_error)
      .map((result) => [result.case_id, { ...result, resumed: true }])
  );
}

function validateDatasetAgainstCatalog({ dataset, cases, approvedById }) {
  const errors = [];
  const positiveCount = (dataset.positive || []).length;
  const expectedPositiveCount = approvedById.size * 5;

  if (positiveCount !== expectedPositiveCount) {
    errors.push(
      `positive count expected ${expectedPositiveCount}, got ${positiveCount}`
    );
  }

  for (const item of cases) {
    const expectedIds = normalizeIdSet(item.expected_faq_ids || []);
    if (item.suite === "negative") {
      if (expectedIds.length) {
        errors.push(`${item.case_id} negative case must not expect FAQ ids`);
      }
      continue;
    }
    if (!expectedIds.length) {
      errors.push(`${item.case_id} missing expected_faq_ids`);
    }
    for (const faqId of expectedIds) {
      if (!approvedById.has(faqId)) {
        errors.push(`${item.case_id} references non-approved FAQ id ${faqId}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Benchmark dataset validation failed:\n${errors.join("\n")}`);
  }
}

async function runSelectorWithRetry({ item, routeResult, retries }) {
  let lastError = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const executionContext = createAiModelExecutionContext({
      requestId: `faq-selector-benchmark-${item.case_id}-${attempt + 1}`,
      incomingMessageId: item.case_id,
      modelCallBudget: 1,
    });
    setModelCallPlan(
      executionContext,
      createModelCallPlan({ routeResult })
    );

    try {
      const selectorResult = await callFaqFullCatalogSelector({
        message: item.query,
        faqItems: routeResult.candidateFaqItems,
        previousUserQuery: item.previous_user_query || "",
        requestId: executionContext.requestId,
        executionContext,
      });
      return {
        selectorResult,
        executionContext,
        retryCount,
        apiError: null,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        retryCount += 1;
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * Math.max(1, attempt + 1))
        );
      }
    }
  }

  return {
    selectorResult: null,
    executionContext: null,
    retryCount,
    apiError: {
      code:
        lastError?.providerErrorCode ||
        lastError?.reason ||
        lastError?.name ||
        "unknown_api_error",
      message: lastError?.message || "FAQ selector API failed.",
      metadata: lastError?.faqSelectorMetadata || {},
    },
  };
}

async function evaluateCase({ item, retries }) {
  const routeResult = await routeKnowledge({
    message: item.query,
    contextText: item.contextText || item.query,
  });
  const expectedFaqIds = normalizeIdSet(item.expected_faq_ids || []);
  const baseResult = {
    case_id: item.case_id,
    suite: item.suite,
    type: item.type,
    query: item.query,
    expected_faq_ids: expectedFaqIds,
    route: routeResult.route,
    lexical_route: routeResult.route,
    lexical_confidence: routeResult.confidence,
    lexical_reason: routeResult.reason,
    selector_action: "",
    actual_faq_ids: [],
    exact_match: false,
    partial_match: false,
    correct: false,
    api_error: null,
    retry_count: 0,
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
    },
    model_call_count: 0,
    model_call_purposes: [],
  };

  if (!routeResult.shouldCallDeepSeek) {
    const actualFaqIds = normalizeIdSet(routeResult.matchedFaqIds || []);
    return {
      ...baseResult,
      route_kind: actualFaqIds.length ? "lexical_direct" : routeResult.route,
      actual_faq_ids: actualFaqIds,
      exact_match: setsEqual(actualFaqIds, expectedFaqIds),
      partial_match: intersection(actualFaqIds, expectedFaqIds).length > 0,
      correct:
        item.suite === "negative"
          ? actualFaqIds.length === 0
          : setsEqual(actualFaqIds, expectedFaqIds),
    };
  }

  if (routeResult.route !== "faq_selector_required") {
    return {
      ...baseResult,
      route_kind: routeResult.route,
      correct: item.suite === "negative",
    };
  }

  const selectorRun = await runSelectorWithRetry({
    item,
    routeResult,
    retries,
  });

  if (selectorRun.apiError) {
    return {
      ...baseResult,
      route_kind: "selector",
      selector_action: "error",
      api_error: {
        code: selectorRun.apiError.code,
        message: selectorRun.apiError.message,
      },
      retry_count: selectorRun.retryCount,
      usage: extractUsage(selectorRun.apiError.metadata),
    };
  }

  const selectorResult = selectorRun.selectorResult || {};
  const actualFaqIds = normalizeIdSet(selectorResult.faqIds || []);
  const usage = extractUsage(selectorResult.metadata || {});
  const exactMatch = setsEqual(actualFaqIds, expectedFaqIds);
  const partialMatch = intersection(actualFaqIds, expectedFaqIds).length > 0;

  return {
    ...baseResult,
    route_kind: "selector",
    selector_action: selectorResult.action || "none",
    selector_result: selectorResult.metadata?.faq_selector_result || "",
    actual_faq_ids: actualFaqIds,
    exact_match: exactMatch,
    partial_match: partialMatch,
    correct:
      item.suite === "negative"
        ? actualFaqIds.length === 0
        : exactMatch,
    retry_count: selectorRun.retryCount,
    usage,
    model_call_count: selectorRun.executionContext?.model_call_count || 0,
    model_call_purposes:
      selectorRun.executionContext?.model_call_purposes || [],
  };
}

function extractUsage(metadata = {}) {
  return {
    prompt_tokens: Number(metadata.prompt_tokens || 0),
    completion_tokens: Number(metadata.completion_tokens || 0),
    cache_hit_tokens: Number(metadata.cache_hit_tokens || 0),
    cache_miss_tokens: Number(metadata.cache_miss_tokens || 0),
  };
}

function computeSummary({ dataset, cases, results, catalog, envInfo, args }) {
  const apiErrors = results.filter((result) => result.api_error);
  const evaluated = results.filter((result) => !result.api_error);
  const selected = evaluated.filter((result) => result.actual_faq_ids.length > 0);
  const correctSelected = selected.filter((result) => result.correct);
  const wrongSelected = selected.filter((result) => !result.correct);
  const positive = evaluated.filter((result) => result.suite === "positive");
  const negative = evaluated.filter((result) => result.suite === "negative");
  const multi = evaluated.filter((result) => result.suite === "multi_intent");
  const selector = evaluated.filter((result) => result.route_kind === "selector");
  const lexical = evaluated.filter(
    (result) => result.route_kind === "lexical_direct"
  );
  const usage = results.reduce(
    (sum, result) => ({
      prompt_tokens: sum.prompt_tokens + Number(result.usage?.prompt_tokens || 0),
      completion_tokens:
        sum.completion_tokens + Number(result.usage?.completion_tokens || 0),
      cache_hit_tokens:
        sum.cache_hit_tokens + Number(result.usage?.cache_hit_tokens || 0),
      cache_miss_tokens:
        sum.cache_miss_tokens + Number(result.usage?.cache_miss_tokens || 0),
    }),
    {
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
    }
  );
  const selectorCalls = results.reduce(
    (sum, result) => sum + Number(result.model_call_count || 0),
    0
  );
  const totalCache = usage.cache_hit_tokens + usage.cache_miss_tokens;
  const byType = {};
  for (const result of positive) {
    byType[result.type] ||= { total: 0, correct: 0, accuracy: 0 };
    byType[result.type].total += 1;
    if (result.correct) byType[result.type].correct += 1;
  }
  for (const value of Object.values(byType)) {
    value.accuracy = ratio(value.correct, value.total);
  }

  return {
    ok: apiErrors.length === 0,
    mode: args.smoke ? "smoke" : "full",
    dataset_version: dataset.version || "",
    dataset_source: dataset.source || {},
    cases_requested: cases.length,
    cases_completed: results.length,
    env: {
      env_file: envInfo.file,
      env_file_exists: envInfo.exists,
      loaded_env_names: envInfo.loadedNames.filter((name) =>
        /^DEEPSEEK_|^FAQ_SELECTOR_MODEL$|^AI_MODE$/.test(name)
      ),
      has_deepseek_api_key: Boolean(process.env.DEEPSEEK_API_KEY),
      has_deepseek_base_url: Boolean(process.env.DEEPSEEK_BASE_URL),
      has_deepseek_model: Boolean(process.env.DEEPSEEK_MODEL),
      has_faq_selector_model: Boolean(process.env.FAQ_SELECTOR_MODEL),
    },
    selector_model: getFaqSelectorModelName(),
    catalog: {
      approved_active_count: catalog.length,
      includes_answer: catalog.some((item) => "answer" in item),
      includes_internal_note: catalog.some((item) => "internal_note" in item),
      includes_priority: catalog.some((item) => "priority" in item),
    },
    metrics: {
      evaluated: evaluated.length,
      api_errors: apiErrors.length,
      retries: results.reduce((sum, result) => sum + result.retry_count, 0),
      precision: ratio(correctSelected.length, selected.length),
      coverage: ratio(
        positive.filter((result) => result.correct).length,
        positive.length
      ),
      wrong_direct_answer_rate: ratio(wrongSelected.length, evaluated.length),
      none_rate: ratio(
        evaluated.filter((result) => result.actual_faq_ids.length === 0).length,
        evaluated.length
      ),
      positive: {
        total: positive.length,
        correct: positive.filter((result) => result.correct).length,
        by_type: byType,
      },
      negative: {
        total: negative.length,
        none_correct: negative.filter((result) => result.correct).length,
        false_faq_match_count: negative.filter(
          (result) => result.actual_faq_ids.length > 0
        ).length,
      },
      multi_intent: {
        total: multi.length,
        exact_set_correct: multi.filter((result) => result.exact_match).length,
        exact_set_accuracy: ratio(
          multi.filter((result) => result.exact_match).length,
          multi.length
        ),
        partial_set_correct: multi.filter((result) => result.partial_match).length,
        partial_set_accuracy: ratio(
          multi.filter((result) => result.partial_match).length,
          multi.length
        ),
      },
      routes: {
        lexical_direct_count: lexical.length,
        lexical_direct_correct: lexical.filter((result) => result.correct).length,
        selector_count: selector.length,
        selector_correct: selector.filter((result) => result.correct).length,
        selector_wrong: selector.filter(
          (result) => !result.correct && result.actual_faq_ids.length > 0
        ).length,
        selector_none: selector.filter(
          (result) => result.actual_faq_ids.length === 0
        ).length,
      },
      usage: {
        selector_calls: selectorCalls,
        average_prompt_tokens: ratio(usage.prompt_tokens, selectorCalls),
        average_completion_tokens: ratio(usage.completion_tokens, selectorCalls),
        ...usage,
        cache_hit_ratio: ratio(usage.cache_hit_tokens, totalCache),
      },
    },
  };
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envInfo = loadLocalEnv(args.envPath);
  const { dataset, cases: allCases } = readDataset(args.datasetPath);
  const selectedCases = filterCases(allCases, args);
  const faqItems = await loadFaqItems();
  const catalog = buildApprovedFaqSelectorCatalog(faqItems);
  const approvedById = new Map(catalog.map((item) => [item.id, item]));

  validateDatasetAgainstCatalog({
    dataset,
    cases: allCases,
    approvedById,
  });

  if (!process.env.DEEPSEEK_API_KEY) {
    const summary = {
      ok: false,
      reason: "missing_deepseek_api_key",
      env: {
        env_file: envInfo.file,
        env_file_exists: envInfo.exists,
        loaded_env_names: envInfo.loadedNames.filter((name) =>
          /^DEEPSEEK_|^FAQ_SELECTOR_MODEL$|^AI_MODE$/.test(name)
        ),
        has_deepseek_api_key: false,
      },
      selector_model: getFaqSelectorModelName(),
      cases_requested: selectedCases.length,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(2);
  }

  const resumed = loadResumeResults(args.resumePath);
  const freshCases = selectedCases.filter((item) => !resumed.has(item.case_id));
  const freshResults = await runPool(
    freshCases,
    args.concurrency,
    async (item) => evaluateCase({ item, retries: args.retries })
  );
  const results = selectedCases.map(
    (item) => resumed.get(item.case_id) || freshResults.shift()
  );
  const summary = computeSummary({
    dataset,
    cases: selectedCases,
    results,
    catalog,
    envInfo,
    args,
  });
  const failures = results.filter(
    (result) => result.api_error || !result.correct
  );
  const report = {
    summary,
    failures,
    results,
  };

  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ...summary,
        report_path: args.outputPath,
        failures: failures.length,
      },
      null,
      2
    )
  );

  if (summary.metrics.api_errors > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reason: "benchmark_failed",
        message: error?.message || String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
