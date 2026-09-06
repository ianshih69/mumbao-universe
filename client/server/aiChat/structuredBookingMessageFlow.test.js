import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildConversationContextUpdate,
  buildConversationPromptContext,
  buildConversationRetrievalText,
} from "./conversationContext.js";
import {
  buildStructuredClarificationRoute,
  toTurnActionSemanticResult,
} from "./structuredBookingTurn.js";
import { executeTurnAction } from "./turnActionExecutor.js";
import { resolveStructuredMessageRuntime } from "./message.js";

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

async function runMessageTurn(message, previousContext = {}, mode = "active") {
  const conversationContextUpdate = buildConversationContextUpdate({
    previousContext,
    recentMessages: [],
    message,
    dateInfo,
    nowIso,
  });
  const resolution = await resolveStructuredMessageRuntime({
    mode,
    message,
    conversationContextUpdate,
    dateInfo,
    nowIso,
    sourceMessageId: `runtime-rc:${message.length}`,
  });
  if (!resolution) {
    return {
      conversationContextUpdate,
      resolution: null,
      context: conversationContextUpdate.context,
      finalRoute: null,
    };
  }
  const context = resolution.context;
  if (resolution.blockedByAmbiguity) {
    return {
      conversationContextUpdate,
      resolution,
      context,
      finalRoute: buildStructuredClarificationRoute({
        route: "faq_selector_required",
        shouldCallDeepSeek: true,
      }, resolution.result),
    };
  }
  const semanticResult = resolution.authoritative
    ? toTurnActionSemanticResult(resolution.result, previousContext)
    : null;
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

describe("deterministic-only structured message runtime", () => {
  it("has no structured provider import, callback, warmup, or retry path", () => {
    const source = readFileSync(new URL("./message.js", import.meta.url), "utf8");
    expect(source).not.toContain("structuredBookingTurnProvider");
    expect(source).not.toContain("callStructuredBookingTurnInterpreter");
    expect(source).not.toContain("resolveCandidates:");
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
    "十個大人跟一隻22公斤狗",
    "一隻22公斤狗和十位成人",
    "還會帶一隻大型犬，大約22公斤",
    "狗狗一隻，重量二十二公斤",
  ])("normalizes pet paraphrase through spans and candidates: %s", async (message) => {
    const flow = await runMessageTurn(message, baseContext);
    expect(flow.resolution.classification).toBe("DETERMINISTIC_EXPECTED");
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(1);
    expect(flow.context.pet_weights_kg).toEqual([22]);
    expect(flow.context.dog_over_20kg_count).toBe(1);
  });

  it.each([
    ["再加一位成人", { adult_count: 11, pet_count: 0 }],
    ["人數改成11位成人", { adult_count: 11, pet_count: 0 }],
    ["再加一隻狗", { adult_count: 10, pet_count: 1 }],
    ["10位成人加2位兒童", { adult_count: 10, child_count: 2, pet_count: null }],
    ["1位成人帶1隻22公斤狗", { adult_count: 1, pet_count: 1 }],
  ])("keeps party and pet entities isolated for %s", async (message, expected) => {
    const context = message.startsWith("10位") || message.startsWith("1位")
      ? {}
      : baseContext;
    const flow = await runMessageTurn(message, context);
    expect(flow.context).toMatchObject(expected);
    if (message === "再加一隻狗") {
      expect(flow.resolution.result.missing_fields).toContain("pet_weights_kg");
      expect(flow.finalRoute).toMatchObject({
        route: "reprice_after_context_change",
        semanticMetadata: {
          pet_fee_status: "unresolved",
          unresolved_price_items: ["pet_fee"],
        },
      });
      expect(flow.finalRoute.answer).toContain("請提供每隻體重");
      expect(flow.finalRoute.answer).not.toContain("狗狗住宿費為");
    }
  });

  it.each([
    ["再加一個", "missing_entity"],
    ["多兩個", "missing_entity"],
    ["人數有變", "missing_party_count"],
    ["22公斤", "missing_pet_context"],
  ])("clarifies once without mutation for %s", async (message, code) => {
    const flow = await runMessageTurn(message, baseContext);
    expect(flow.resolution.result.ambiguities).toHaveLength(1);
    expect(flow.resolution.result.ambiguities[0].code).toBe(code);
    expect(flow.resolution.reduction.changed).toBe(false);
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(0);
    expect(flow.finalRoute.route).toBe("faq_collect_info");
    expect(flow.finalRoute.answer).toBe(flow.resolution.result.ambiguities[0].question);
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
    expect(shadow.context).toEqual(legacyUpdate.context);
    expect(shadow.resolution.reduction.context.pet_count).toBe(1);
    expect(shadow.finalRoute.route).toBe("faq_selector_required");

    const active = await runMessageTurn(message, baseContext, "active");
    expect(active.resolution.authoritative).toBe(true);
    expect(active.resolution.provider).toBeNull();
    expect(active.context.pet_count).toBe(1);
    expect(active.context.pet_weights_kg).toEqual([22]);
  });

  it("keeps active ambiguity non-mutating", async () => {
    const flow = await runMessageTurn("再加一個", baseContext, "active");
    expect(flow.resolution.blockedByAmbiguity).toBe(true);
    expect(flow.resolution.reduction.changed).toBe(false);
    expect(flow.context.adult_count).toBe(10);
    expect(flow.context.pet_count).toBe(0);
  });
});
