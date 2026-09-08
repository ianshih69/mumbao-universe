import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildConversationContextUpdate,
  buildConversationPromptContext,
  buildConversationRetrievalText,
} from "./conversationContext.js";
import { applyContextFreshnessGuard } from "./contextFreshnessGuard.js";
import {
  buildStructuredClarificationRoute,
  toTurnActionSemanticResult,
} from "./structuredBookingTurn.js";
import { executeTurnAction } from "./turnActionExecutor.js";
import {
  resolveMessageConversationAuthority,
  resolveStructuredMessageRuntime,
} from "./message.js";
import { summarizeBookingTurnCandidate } from "./structuredBookingTurnCandidates.js";

const nowIso = "2026-09-06T00:00:00.000Z";
const dateInfo = {
  currentDate: "2026-09-06",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};
const baseContext = {
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
};
const ruleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "runtime-rc-pricing",
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
      const nightlyPrice = {
        weekday: { 10: 25000, 18: 35000 },
        friday: { 10: 32000, 18: 42000 },
        holiday: { 10: 39000, 18: 49000 },
      }[dayType]?.[guests];
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

function resolvedCandidate(plan) {
  const candidate = summarizeBookingTurnCandidate(plan.candidates[0]);
  return {
    result: {
      goal_id: plan.allowed_intent_ids[0] || "none",
      scenario_action: "continue",
      operation: candidate.operation,
      entity: candidate.entity,
      field: candidate.field,
      span_ids: candidate.span_ids,
      context_reference_ids: candidate.context_reference_ids,
      clarification_code: null,
      confidence: 0.99,
      selected_candidate_ids: [candidate.candidate_id],
      intent_ids: plan.allowed_intent_ids,
      semantic_ast: {
        turn_kind: "transactional",
        goal_ids: plan.allowed_intent_ids,
        scenario_action: "continue",
        operations: [{
          operation: candidate.operation,
          entity: candidate.entity,
          span_bindings: candidate.span_ids,
          context_bindings: candidate.context_reference_ids,
        }],
        references: candidate.context_reference_ids,
        missing_slots: [],
        clarification_code: null,
        confidence: 0.99,
      },
    },
    metadata: { called: true, validation_outcome: "accepted" },
  };
}

async function runMessageTurn(message, previousContext = {}, mode = "active") {
  const authority = await resolveMessageConversationAuthority({
    mode,
    previousContext,
    recentMessages: [],
    message,
    dateInfo,
    nowIso,
    sourceMessageId: `runtime-rc:${message.length}`,
  });
  const { conversationContextUpdate, structuredTurnResolution: resolution } = authority;
  if (!resolution) {
    return {
      conversationContextUpdate,
      resolution: null,
      context: conversationContextUpdate.context,
      finalRoute: null,
    };
  }
  const initialContext = authority.effectiveConversationContextUpdate.context;
  if (resolution.blockedByAmbiguity) {
    return {
      conversationContextUpdate,
      resolution,
      context: initialContext,
      finalRoute: buildStructuredClarificationRoute({
        route: "faq_selector_required",
        shouldCallDeepSeek: true,
      }, resolution.result),
    };
  }
  const semanticResult = resolution.authoritative
    ? toTurnActionSemanticResult(resolution.result, previousContext)
    : null;
  const freshnessGuard = applyContextFreshnessGuard({
    oldContext: conversationContextUpdate.previousContext,
    context: initialContext,
    semanticResult,
    currentMessage: message,
    dateInfo,
    nowIso,
    sourceMessageId: `runtime-rc:${message.length}`,
    structuredAuthority: Boolean(
      resolution.authoritative && !resolution.blockedByAmbiguity,
    ),
  });
  const context = freshnessGuard.context;
  const finalRoute = await executeTurnAction({
    message,
    semanticResult,
    trustedDeterministicSemantic: Boolean(
      resolution.authoritative && !resolution.blockedByAmbiguity,
    ),
    routeResult: {
      route: "faq_selector_required",
      providerUsed: "faq_selector_required",
      shouldCallDeepSeek: true,
      matchedFaqItems: [],
      matchedFaqIds: [],
    },
    context,
    previousContext,
    recentMessages: [],
    freshnessGuard,
    pricingOptions: {
      supabaseRequest: createPricingReader(),
      referenceDate: "2026-09-06",
    },
  });
  const { conversationContextPatch, ...routeWithoutPatch } = finalRoute || {};
  const finalContext = conversationContextPatch &&
    typeof conversationContextPatch === "object"
    ? {
        ...context,
        ...conversationContextPatch,
        last_updated_at: nowIso,
      }
    : context;
  return {
    conversationContextUpdate: {
      ...conversationContextUpdate,
      context: finalContext,
      retrievalText: buildConversationRetrievalText(message, finalContext),
      promptContext: buildConversationPromptContext(finalContext),
    },
    resolution,
    context: finalContext,
    finalRoute: routeWithoutPatch,
  };
}

describe("bounded structured message runtime", () => {
  it("keeps the context resolver behind an explicit feature gate", () => {
    const source = readFileSync(new URL("./message.js", import.meta.url), "utf8");
    expect(source).toContain("structuredBookingTurnProvider");
    expect(source).toContain("isContextSemanticResolverEnabled");
    expect(source).toContain("createStructuredTurnResolverCallPlan");
    expect(source).not.toContain("structured_turn_provider_retry");
  });

  it("uses one resolver call for a context-dependent stay replacement only when enabled", async () => {
    const resolveCandidates = vi.fn(async ({ plan }) => resolvedCandidate(plan));
    const disabled = await resolveMessageConversationAuthority({
      mode: "active",
      previousContext: baseContext,
      message: "那改兩晚",
      dateInfo,
      nowIso,
      contextResolverEnabled: false,
      resolveCandidates,
    });
    expect(disabled.structuredTurnResolution.classification).toBe(
      "DETERMINISTIC_EXPECTED",
    );
    expect(resolveCandidates).not.toHaveBeenCalled();

    const enabled = await resolveMessageConversationAuthority({
      mode: "active",
      previousContext: baseContext,
      message: "那改兩晚",
      dateInfo,
      nowIso,
      contextResolverEnabled: true,
      resolveCandidates,
    });
    expect(resolveCandidates).toHaveBeenCalledTimes(1);
    expect(enabled.structuredTurnResolution).toMatchObject({
      classification: "LLM_CANDIDATE_SELECTION",
      source: "semantic_model_binding_selection",
      context: {
        stay_nights: 2,
        check_out: "2026-11-03",
        adult_count: 10,
      },
    });
  });

  it("does not invoke the legacy current-message mutator in active mode", async () => {
    const legacyBuilder = vi.fn(buildConversationContextUpdate);
    const active = await resolveMessageConversationAuthority({
      mode: "active",
      previousContext: baseContext,
      recentMessages: [],
      message: "再加一隻22公斤狗狗",
      dateInfo,
      nowIso,
      buildLegacyContextUpdate: legacyBuilder,
    });
    expect(active.legacyMutationInvoked).toBe(false);
    expect(legacyBuilder).not.toHaveBeenCalled();

    const shadow = await resolveMessageConversationAuthority({
      mode: "shadow",
      previousContext: baseContext,
      recentMessages: [],
      message: "再加一隻22公斤狗狗",
      dateInfo,
      nowIso,
      buildLegacyContextUpdate: legacyBuilder,
    });
    expect(shadow.legacyMutationInvoked).toBe(true);
    expect(legacyBuilder).toHaveBeenCalledTimes(1);
  });

  it("keeps active state writes behind one scenario transition authority", () => {
    const messageSource = readFileSync(
      new URL("./message.js", import.meta.url),
      "utf8",
    );
    const candidateSource = readFileSync(
      new URL("./structuredBookingTurnCandidates.js", import.meta.url),
      "utf8",
    );
    const transitionSource = readFileSync(
      new URL("./dialogueStateEngine.js", import.meta.url),
      "utf8",
    );
    const plannerSource = readFileSync(
      new URL("./dialogueGoalPlanner.js", import.meta.url),
      "utf8",
    );
    expect(messageSource).toContain('conversationAuthority.mode !== "active" &&');
    expect(messageSource).toContain("applyContextFreshnessGuard({");
    expect(messageSource).toContain("conversationContextPatch &&");
    expect(candidateSource.match(/applyScenarioTransition\(/gu)).toHaveLength(1);
    expect(candidateSource).not.toContain("applyDialogueStateTransition");
    expect(transitionSource.match(/export function applyScenarioTransition/gu))
      .toHaveLength(1);
    expect(plannerSource.match(/export function selectDialogueResponseAuthority/gu))
      .toHaveLength(1);
  });

  it("returns the complete one-turn quote without a structured provider", async () => {
    const flow = await runMessageTurn(
      "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚包棟多少？",
    );
    expect(flow.context).toMatchObject({
      adult_count: 10,
      pet_count: 1,
      pet_weights_kg: [22],
      dog_over_20kg_count: 1,
    });
    expect(flow.finalRoute.route).toBe("grounded_reply");
    expect(flow.finalRoute.answer).toContain("TWD 25,000");
    expect(flow.finalRoute.answer).toContain("TWD 1,200");
    expect(flow.finalRoute.answer).toContain("TWD 26,200");
    expect(flow.finalRoute.answer).toContain("押金 TWD 3,000");
  });

  it("keeps date and adults across the original two-turn failure", async () => {
    const first = await runMessageTurn(
      "2026年11月1日，10位成人住一晚包棟多少？",
    );
    expect(first.finalRoute.answer).toContain("TWD 25,000");

    const second = await runMessageTurn(
      "再加一隻22公斤狗狗呢？",
      first.context,
    );
    expect(second.context).toMatchObject({
      adult_count: 10,
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      pet_count: 1,
      pet_weights_kg: [22],
    });
    expect(second.finalRoute.answer).toContain("TWD 26,200");
    expect(second.finalRoute.answer).not.toContain("成人有幾位");
  });

  it.each([
    "加1隻22公斤狗狗",
    "再帶一隻22公斤的狗",
    "另外有一隻22kg毛孩",
    "人數不變，多一隻22公斤狗",
    "還會帶一隻大型犬，大約22公斤",
  ])("normalizes pet paraphrase through spans and candidates: %s", async (message) => {
    const flow = await runMessageTurn(message, baseContext);
    expect(flow.resolution.classification).toBe("DETERMINISTIC_EXPECTED");
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(1);
    expect(flow.context.pet_weights_kg).toEqual([22]);
    expect(flow.context.dog_over_20kg_count).toBe(1);
  });

  it.each([
    "十個大人跟一隻22公斤狗",
    "一隻22公斤狗和十位成人",
    "狗狗一隻，重量二十二公斤",
  ])("keeps operation-free pet fragment informational: %s", async (message) => {
    const flow = await runMessageTurn(message, baseContext);
    expect(flow.resolution.classification).toBe("INFORMATIONAL");
    expect(flow.resolution.plan.dialogue_goal_plan.mutates_context).toBe(false);
    expect(flow.resolution.result.operations).toEqual([]);
    expect(flow.context).toMatchObject({
      adult_count: 10,
      pet_count: 0,
      pet_weights_kg: [],
    });
  });

  it.each([
    ["再加一位成人", { adult_count: 11, pet_count: 0 }],
    ["人數改成11位成人", { adult_count: 11, pet_count: 0 }],
    ["再加一隻狗", { adult_count: 10, pet_count: 0 }],
    ["10位成人加2位兒童", { adult_count: null, child_count: null, pet_count: null }],
    ["明天1位成人帶1隻22公斤狗包棟多少", { adult_count: 1, pet_count: 1 }],
  ])("keeps party and pet entities isolated for %s", async (message, expected) => {
    const context = message.startsWith("10位") || message.startsWith("1位")
      ? {}
      : baseContext;
    const flow = await runMessageTurn(message, context);
    expect(flow.context).toMatchObject(expected);
    if (message === "10位成人加2位兒童") {
      expect(flow.resolution.plan.dialogue_goal_plan.slots).toMatchObject({
        adult_count: 10,
        child_count: 2,
      });
      expect(flow.resolution.result.operations).toEqual([]);
    }
    if (message === "再加一隻狗") {
      expect(flow.resolution.result.missing_fields).toContain("pet_weights_kg");
      expect(flow.resolution.reduction.applied).toBe(false);
      expect(flow.context.pending_interaction).toMatchObject({
        type: "slot_fill",
        partial_operation: {
          operation: "add",
          entity: "pet",
          count: 1,
          missing_slots: ["weights_kg"],
        },
      });
      expect(flow.finalRoute).toMatchObject({
        route: "faq_collect_info",
      });
      expect(flow.finalRoute.answer).toBe("請問狗狗大約幾公斤？");
      expect(flow.finalRoute.answer).not.toContain("狗狗住宿費為");
    }
  });

  it.each([
    ["再加一個", "pending_slot_fill", true],
    ["多兩個", "pending_slot_fill", true],
    ["人數有變", "missing_party_count", false],
  ])("clarifies once without booking mutation for %s", async (
    message,
    code,
    persistsPending,
  ) => {
    const flow = await runMessageTurn(message, baseContext);
    expect(flow.resolution.result.ambiguities).toHaveLength(1);
    expect(flow.resolution.result.ambiguities[0].code).toBe(code);
    expect(flow.resolution.reduction.changed).toBe(persistsPending);
    expect(flow.resolution.reduction.applied).toBe(false);
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(0);
    expect(flow.finalRoute.route).toBe("faq_collect_info");
    expect(flow.finalRoute.answer).toBe(flow.resolution.result.ambiguities[0].question);
  });

  it("asks a specific question for a weight-only fragment without mutation", async () => {
    const flow = await runMessageTurn("22公斤", baseContext);
    expect(flow.resolution.classification).toBe("SAFE_CLARIFICATION");
    expect(flow.resolution.result.operations).toEqual([]);
    expect(flow.resolution.result.ambiguities[0]).toMatchObject({
      code: "missing_pet_context",
      question: "請問22公斤是狗狗的體重嗎？",
    });
    expect(flow.resolution.reduction.changed).toBe(false);
    expect(flow.context).toMatchObject({ adult_count: 10, pet_count: 0 });
    expect(flow.finalRoute.answer).toBe("請問22公斤是狗狗的體重嗎？");
  });

  it("keeps contextual availability action-only", async () => {
    const flow = await runMessageTurn("那這天還有房嗎？", baseContext);
    expect(flow.resolution.requested_actions).toEqual(["request_availability"]);
    expect(flow.resolution.turn_delta.operations).toEqual([]);
    expect(flow.context).toMatchObject({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 10,
    });
  });
});

describe("structured interpreter runtime modes", () => {
  it("defaults an unset mode to legacy", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "");
    const update = buildConversationContextUpdate({
      previousContext: baseContext,
      recentMessages: [],
      message: "再加一位成人",
      dateInfo,
      nowIso,
    });
    expect(await resolveStructuredMessageRuntime({
      message: "再加一位成人",
      conversationContextUpdate: update,
      dateInfo,
    })).toBeNull();
    vi.unstubAllEnvs();
  });

  it("keeps legacy and invalid modes outside structured mutation", async () => {
    for (const mode of ["legacy", "invalid"]) {
      const flow = await runMessageTurn("再加一位成人", baseContext, mode);
      expect(flow.resolution).toBeNull();
    }
  });

  it("keeps shadow observational and active authoritative", async () => {
    const message = "再加一隻22公斤狗";
    const legacyUpdate = buildConversationContextUpdate({
      previousContext: baseContext,
      recentMessages: [],
      message,
      dateInfo,
      nowIso,
    });
    const shadow = await runMessageTurn(message, baseContext, "shadow");
    expect(shadow.resolution.authoritative).toBe(false);
    expect(shadow.resolution.provider).toBeNull();
    expect(shadow.context.pet_weights_kg).toEqual(
      legacyUpdate.context.pet_weights_kg,
    );
    expect(shadow.context).not.toEqual(shadow.resolution.reduction.context);
    expect(shadow.resolution.reduction.context.pet_count).toBe(1);
    expect(shadow.finalRoute.route).not.toBe("grounded_reply");

    const active = await runMessageTurn(message, baseContext, "active");
    expect(active.resolution.authoritative).toBe(true);
    expect(active.resolution.provider).toBeNull();
    expect(active.context.pet_count).toBe(1);
    expect(active.context.pet_weights_kg).toEqual([22]);
  });

  it("keeps active ambiguity non-mutating", async () => {
    const flow = await runMessageTurn("再加一個", baseContext, "active");
    expect(flow.resolution.blockedByAmbiguity).toBe(true);
    expect(flow.resolution.reduction.changed).toBe(true);
    expect(flow.resolution.reduction.applied).toBe(false);
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(0);
    expect(flow.context.pending_interaction?.type).toBe("slot_fill");
  });
});
