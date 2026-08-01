#!/usr/bin/env node
import fs from "node:fs";

const knowledgeRouterModule = await import("../../server/aiChat/knowledgeRouter.js");
const routeKnowledge =
  knowledgeRouterModule.routeKnowledge ||
  knowledgeRouterModule.default?.routeKnowledge;

if (typeof routeKnowledge !== "function") {
  throw new Error("routeKnowledge export was not found");
}

const casesPath = "client/api/knowledge/faq-regression-cases.json";
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

const failures = [];
const results = [];

for (const [index, testCase] of cases.entries()) {
  const result = await routeKnowledge({
    message: testCase.input,
    contextText: testCase.contextText || testCase.input,
  });

  const expectedIds = testCase.expected_faq_ids || [];
  const unexpectedIds = testCase.unexpected_faq_ids || [];
  const expectedDeepSeek =
    typeof testCase.should_call_deepseek === "boolean"
      ? testCase.should_call_deepseek
      : testCase.expected_route === "deepseek_grounded";

  const checks = [
    {
      ok: result.route === testCase.expected_route,
      message: `route expected ${testCase.expected_route}, got ${result.route}`,
    },
    {
      ok: result.shouldCallDeepSeek === expectedDeepSeek,
      message: `shouldCallDeepSeek expected ${expectedDeepSeek}, got ${result.shouldCallDeepSeek}`,
    },
    {
      ok:
        !testCase.min_confidence ||
        confidenceRank(result.confidence) >= confidenceRank(testCase.min_confidence),
      message: `confidence expected at least ${testCase.min_confidence}, got ${result.confidence}`,
    },
    ...expectedIds.map((faqId) => ({
      ok: result.matchedFaqIds.includes(faqId),
      message: `expected faq id ${faqId}, got ${JSON.stringify(result.matchedFaqIds)}`,
    })),
    ...unexpectedIds.map((faqId) => ({
      ok: !result.matchedFaqIds.includes(faqId),
      message: `unexpected faq id ${faqId} was matched`,
    })),
  ];

  const failedChecks = checks.filter((check) => !check.ok);
  const summary = {
    index: index + 1,
    input: testCase.input,
    expected_route: testCase.expected_route,
    route: result.route,
    confidence: result.confidence,
    matchedFaqIds: result.matchedFaqIds,
    shouldCallDeepSeek: result.shouldCallDeepSeek,
    ok: failedChecks.length === 0,
  };
  results.push(summary);

  if (failedChecks.length > 0) {
    failures.push({
      ...summary,
      failures: failedChecks.map((check) => check.message),
    });
  }
}

console.log(
  JSON.stringify(
    {
      cases: cases.length,
      passed: cases.length - failures.length,
      failed: failures.length,
      failures,
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exit(1);
}

function confidenceRank(value) {
  return { none: 0, low: 1, medium: 2, high: 3 }[value] ?? 0;
}
