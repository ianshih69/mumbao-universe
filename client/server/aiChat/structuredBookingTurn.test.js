import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOfficialPricingResolution } from "./lodgingPricing.js";
import { executeTurnAction } from "./turnActionExecutor.js";
import {
  buildStructuredClarificationRoute,
  buildStructuredTurnOutboundInput,
  compareStructuredAndLegacyContext,
  getStructuredTurnInterpreterMode,
  hasMeaningfulBookingContext,
  interpretBookingTurnDeterministically,
  isStructuredTransactionalResult,
  reduceBookingContext,
  resolveStructuredBookingTurn,
  resolveStructuredBookingTurnHybrid,
  sanitizeStructuredTurnUtterance,
  toTurnActionSemanticResult,
  toTypedBookingContext,
  validateStructuredTurnResult,
} from "./structuredBookingTurn.js";

const nowIso = "2026-09-06T00:00:00.000Z";
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

const canaryCases = JSON.parse(
  readFileSync(
    new URL("./structuredBookingTurn.canary.json", import.meta.url),
    "utf8",
  ),
);

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
  return variants[name] || {};
}

function interpret(message, context = baseContext) {
  const interpreted = interpretBookingTurnDeterministically({
    message,
    context,
  });
  const reduced = reduceBookingContext(context, interpreted.result, {
    message,
    nowIso,
    sourceMessageId: "test-message",
  });
  return { ...interpreted, reduced };
}

function expectSingleLargeDog(result, { adults = 10 } = {}) {
  expect(result.result.ambiguities).toEqual([]);
  expect(result.reduced.context).toMatchObject({
    adult_count: adults,
    pet_count: 1,
    pet_type: "dog",
    dog_under_10kg_count: 0,
    dog_10_to_20kg_count: 0,
    dog_over_20kg_count: 1,
  });
  expect(result.reduced.after.pets.individual_weights_kg).toEqual([22]);
}

describe("structured booking turn deterministic interpreter", () => {
  it.each([
    ["2026/11/1 10人住一晚多少", "2026-11-01", 10, 1],
    ["2026/11/1 1人住一晚多少", "2026-11-01", 1, 1],
    ["2027-02-08\t12人住兩晚", "2027-02-08", 12, 2],
    ["2026/12/7\n19成人住一晚", "2026-12-07", 19, 1],
    ["２０２６／１１／１　１０人住一晚", "2026-11-01", 10, 1],
    ["2026/11/1 十人住一晚", "2026-11-01", 10, 1],
  ])("keeps distinct numeric lexemes separated: %s", (message, date, adults, nights) => {
    const result = interpret(message, {});
    expect(result.result.ambiguities).toEqual([]);
    expect(result.result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: "adult", count: adults }),
      expect.objectContaining({ entity: "stay", check_in: date, nights }),
    ]));
    expect(result.reduced.context).toMatchObject({
      check_in: date, adult_count: adults, stay_nights: nights,
    });
  });

  it.each([
    "加1隻22公斤狗狗",
    "再帶一隻22公斤的狗",
    "另外有一隻大約22kg的毛孩",
    "人不變，多一隻22公斤狗",
    "還會帶一隻大型犬，22公斤",
  ])("binds pet count and weight without changing guests: %s", (message) => {
    const result = interpret(message);
    expectSingleLargeDog(result);
    expect(result.result.operations).toEqual([
      expect.objectContaining({
        operation: "add",
        entity: "pet",
        count: 1,
        weights_kg: [22],
      }),
    ]);
  });

  it("binds adults and pets independently in one sentence", () => {
    const result = interpret("十個大人跟一隻22公斤的狗", {});
    expectSingleLargeDog(result);
    expect(result.reduced.context.adult_count).toBe(10);
    expect(result.result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "set", entity: "adult", count: 10 }),
        expect.objectContaining({ operation: "set", entity: "pet", count: 1, weights_kg: [22] }),
      ]),
    );
  });

  it.each([
    ["再加一位成人", "add", 11],
    ["多一個大人", "add", 11],
    ["還有兩位成人", "add", 12],
    ["人數改成11位成人", "replace", 11],
  ])("distinguishes adult add and replace: %s", (message, operation, adults) => {
    const result = interpret(message);
    expect(result.result.operations).toContainEqual(
      expect.objectContaining({ entity: "adult", operation }),
    );
    expect(result.reduced.context.adult_count).toBe(adults);
    expect(result.reduced.context.pet_count).toBe(0);
  });

  it.each([
    ["一隻8公斤狗", "set"],
    ["再加一隻8公斤狗", "add"],
    ["少一隻狗", "remove"],
    ["狗狗改成兩隻", "replace"],
    ["不帶狗了", "clear"],
  ])("emits the typed pet operation %s -> %s", (message, operation) => {
    const context = operation === "remove" || operation === "replace" || operation === "clear"
      ? {
          ...baseContext,
          pet_count: 2,
          pet_type: "dog",
          pet_weights_kg: [8, 15],
          dog_under_10kg_count: 1,
          dog_10_to_20kg_count: 1,
        }
      : baseContext;
    const result = interpret(message, context);
    expect(result.result.operations).toContainEqual(
      expect.objectContaining({ entity: "pet", operation }),
    );
  });

  it.each([
    ["加兩個小孩", { child_count: 2, infant_count: 0, adult_count: 10 }],
    ["一位4歲、一位12歲", { child_count: 2, infant_count: 0, adult_count: 10 }],
    ["一個3歲幼兒", { child_count: 0, infant_count: 1, adult_count: 10 }],
    ["小朋友剛滿13歲", { child_count: 0, infant_count: 0, adult_count: 1 }],
  ])("classifies child and infant ages by pricing boundary: %s", (message, expected) => {
    const result = interpret(message);
    expect(result.result.ambiguities).toEqual([]);
    expect(result.reduced.context).toMatchObject(expected);
  });

  it.each(["22公斤", "二十二公斤", "22kg", "22 KG"])(
    "fills a pending dog weight without changing other slots: %s",
    (message) => {
      const context = {
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
      };
      const result = interpret(message, context);
      expectSingleLargeDog(result);
      expect(result.reduced.context.check_in).toBe("2026-11-01");
    },
  );

  it("binds two weights to two pets", () => {
    const result = interpret("一隻8公斤一隻15公斤", {
      ...baseContext,
      pet_count: null,
      pet_type: "dog",
    });
    expect(result.reduced.context).toMatchObject({
      adult_count: 10,
      pet_count: 2,
      dog_under_10kg_count: 1,
      dog_10_to_20kg_count: 1,
      dog_over_20kg_count: 0,
    });
    expect(result.reduced.context.pet_weights_kg).toEqual([8, 15]);
  });

  it.each([
    "10成人＋一隻22kg狗",
    "一隻22kg狗＋10成人",
    "11月1日住一晚，狗22公斤，人10位",
  ])("keeps entity binding stable across word order: %s", (message) => {
    const context = message.includes("11月1日")
      ? { ...baseContext, adult_count: null, pet_count: null }
      : {};
    const result = interpret(message, context);
    expectSingleLargeDog(result);
    expect(result.reduced.context.adult_count).toBe(10);
  });

  it.each([
    ["再加一個", "missing_entity"],
    ["多兩個", "missing_entity"],
    ["22公斤", "missing_pet_context"],
    ["人數有變", "missing_party_count"],
  ])("blocks ambiguous mutation: %s", (message, code) => {
    const result = interpret(message, baseContext);
    expect(result.result.ambiguities[0].code).toBe(code);
    expect(result.reduced.applied).toBe(false);
    expect(result.reduced.context).toEqual(expect.objectContaining(baseContext));
  });

  it.each([
    "加1隻22公斤狗狗",
    " 加 1 隻 22 公斤 狗狗 ",
    "加1隻22公斤狗狗。",
    "加１隻２２公斤狗狗",
  ])("keeps whitespace and punctuation metamorphically equivalent: %s", (message) => {
    expectSingleLargeDog(interpret(message));
  });
});

describe("structured booking context reducer invariants", () => {
  it("adding a pet cannot change adults, children, infants, or dates", () => {
    const { reduced } = interpret("再加一隻22公斤狗");
    expect(reduced.before.party).toEqual(reduced.after.party);
    expect(reduced.before.stay).toEqual(reduced.after.stay);
  });

  it("adding an adult cannot change pets or dates", () => {
    const { reduced } = interpret("再加一位成人", {
      ...baseContext,
      pet_count: 1,
      pet_type: "dog",
      pet_weights_kg: [8],
      dog_under_10kg_count: 1,
    });
    expect(reduced.before.pets).toEqual(reduced.after.pets);
    expect(reduced.before.stay).toEqual(reduced.after.stay);
  });

  it("rejects model-shaped values without message evidence", () => {
    expect(() =>
      validateStructuredTurnResult(
        {
          intents: ["update_pet"],
          operations: [
            {
              operation: "add",
              entity: "pet",
              count: 2,
              pet_type: "dog",
              weights_kg: [22, 22],
              evidence: "1隻22公斤狗狗",
            },
          ],
          missing_fields: [],
          ambiguities: [],
          confidence: 0.99,
        },
        { message: "加1隻22公斤狗狗" },
      ),
    ).toThrow("structured_turn_invalid_evidence");
  });

  it("rejects unknown schema keys instead of applying them", () => {
    expect(() =>
      validateStructuredTurnResult(
        {
          intents: [],
          operations: [],
          missing_fields: [],
          ambiguities: [],
          confidence: 1,
          direct_context_patch: { adult_count: 99 },
        },
        { message: "您好" },
      ),
    ).toThrow("structured_turn_invalid_schema");
  });

  it("returns inspectable before, operations, and after snapshots", () => {
    const { reduced } = interpret("再加一隻22公斤狗");
    expect(reduced).toMatchObject({
      before: { party: { adults: 10 }, pets: { count: 0 } },
      operations: [expect.objectContaining({ entity: "pet", operation: "add" })],
      after: { party: { adults: 10 }, pets: { count: 1 } },
      applied: true,
    });
  });
});

describe("structured booking turn routing contract", () => {
  it("defaults the rollout mode to legacy", () => {
    expect(getStructuredTurnInterpreterMode(undefined)).toBe("legacy");
    expect(getStructuredTurnInterpreterMode("shadow")).toBe("shadow");
    expect(getStructuredTurnInterpreterMode("active")).toBe("active");
    expect(getStructuredTurnInterpreterMode("unknown")).toBe("legacy");
  });

  it("keeps the sanitized typed input free of FAQ catalog and answers", () => {
    const userPayload = buildStructuredTurnOutboundInput({
      message: "再加一隻狗",
      context: baseContext,
      previousTopic: "booking_price",
      dateInfo: { currentDate: "2026-09-06", timeZone: "Asia/Taipei" },
    });
    expect(userPayload).toEqual({
      current_date: "2026-09-06",
      timezone: "Asia/Taipei",
      current_booking_context: expect.any(Object),
      pending_missing_fields: [],
      previous_transaction_topic: "booking_price",
      latest_user_message: "再加一隻狗",
    });
    expect(userPayload).not.toHaveProperty("faq_candidates");
    expect(userPayload).not.toHaveProperty("answer");
  });

  it("applies standalone pet-weight context guards deterministically", () => {
    const noPetContext = interpretBookingTurnDeterministically({
      message: "22公斤",
      context: baseContext,
    });
    expect(noPetContext.result.ambiguities[0].code).toBe("missing_pet_context");
    const pendingPetContext = interpretBookingTurnDeterministically({
      message: "22公斤",
      context: canaryContext("pending-dog"),
    });
    expect(pendingPetContext.result.operations).toEqual([
      expect.objectContaining({ entity: "pet", weights_kg: [22] }),
    ]);
  });

  it("routes transactional intents independently of FAQ selection", () => {
    const { result } = interpret("2026年11月1日，10位成人，住一晚多少？", {});
    expect(isStructuredTransactionalResult(result)).toBe(true);
    const semantic = toTurnActionSemanticResult(result, {});
    expect(semantic).toMatchObject({
      turn_action: "request_quote",
      intent: "pricing",
      selected_faq_ids: [],
      reply_draft: "",
    });
  });

  it("keeps fixed policy questions outside transactional mutation", () => {
    const { result, reduced } = interpretBookingTurnDeterministically({
      message: "可以帶狗嗎？",
      context: baseContext,
    });
    expect(result.intents).toContain("policy_question");
    expect(result.operations).toEqual([]);
    expect(isStructuredTransactionalResult(result)).toBe(false);
    expect(reduceBookingContext(baseContext, result, {
      message: "可以帶狗嗎？",
    }).changed).toBe(false);
  });

  it("builds one precise clarification and never asks a model to guess", () => {
    const { result } = interpret("再加一個");
    const route = buildStructuredClarificationRoute(
      { route: "faq_selector_required", shouldCallDeepSeek: true },
      result,
    );
    expect(route).toMatchObject({
      route: "faq_collect_info",
      providerUsed: "structured_turn_clarification",
      shouldCallDeepSeek: false,
      answer: "請問是增加一位成人、一位兒童，還是一隻狗狗呢？",
    });
  });

  it("exposes shadow disagreements without changing either context", () => {
    const structured = interpret("加1隻22公斤狗狗").reduced.context;
    const legacyWrong = { ...baseContext, adult_count: 11 };
    const comparison = compareStructuredAndLegacyContext(legacyWrong, structured);
    expect(comparison.agrees).toBe(false);
    expect(comparison.legacy.party.adults).toBe(11);
    expect(comparison.structured.party.adults).toBe(10);
  });

  it("keeps legacy authoritative and makes shadow observation-only", () => {
    const legacyWrong = { ...baseContext, adult_count: 11 };
    for (const mode of ["legacy", "shadow"]) {
      const resolution = resolveStructuredBookingTurn({
        mode,
        message: "加1隻22公斤狗狗",
        previousContext: baseContext,
        legacyContext: legacyWrong,
        nowIso,
      });
      expect(resolution.context.adult_count).toBe(11);
      expect(resolution.authoritative).toBe(false);
    }
  });

  it("makes the validated reducer authoritative only in active mode", () => {
    const resolution = resolveStructuredBookingTurn({
      mode: "active",
      message: "加1隻22公斤狗狗",
      previousContext: baseContext,
      legacyContext: { ...baseContext, adult_count: 11 },
      nowIso,
    });
    expect(resolution.authoritative).toBe(true);
    expect(resolution.context).toMatchObject({
      adult_count: 10,
      pet_count: 1,
      dog_over_20kg_count: 1,
    });
  });

  it("does not accept injected free-operation model results", () => {
    const message = "住宿條件幫我調整一下，最後會是兩位成年的旅客";
    const modelResult = {
      intents: ["update_party"],
      operations: [{
        operation: "replace",
        entity: "adult",
        count: 2,
        evidence: "兩位成年的旅客",
      }],
      missing_fields: [],
      ambiguities: [],
      confidence: 0.97,
    };
    const resolution = resolveStructuredBookingTurn({
      mode: "active",
      message,
      previousContext: baseContext,
      legacyContext: baseContext,
      modelResult,
      nowIso,
    });
    expect(resolution.source).toBe("deterministic_safe_fallback");
    expect(resolution.blockedByAmbiguity).toBe(true);
    expect(resolution.context.adult_count).toBe(10);
  });

  it("keeps the deprecated hybrid wrapper model-free", async () => {
    const message = "住宿條件幫我調整一下，最後會是兩位成年的旅客";
    let calls = 0;
    const resolution = await resolveStructuredBookingTurnHybrid({
      mode: "active",
      message,
      previousContext: baseContext,
      legacyContext: baseContext,
      nowIso,
      dateInfo: { currentDate: "2026-09-06", timeZone: "Asia/Taipei" },
      previousTopic: "booking_price",
      interpretModel: async () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(resolution.source).toBe("deterministic_safe_fallback");
    expect(resolution.context.adult_count).toBe(10);
  });

  it("does not invoke the model seam for deterministic entity-bound input", async () => {
    let calls = 0;
    const resolution = await resolveStructuredBookingTurnHybrid({
      mode: "active",
      message: "再加一隻22公斤狗狗",
      previousContext: baseContext,
      legacyContext: baseContext,
      nowIso,
      interpretModel: async () => {
        calls += 1;
        throw new Error("should_not_run");
      },
    });
    expect(calls).toBe(0);
    expect(resolution.context).toMatchObject({
      adult_count: 10,
      pet_count: 1,
      dog_over_20kg_count: 1,
    });
  });

  it("never invokes the model seam in legacy mode", async () => {
    let calls = 0;
    const resolution = await resolveStructuredBookingTurnHybrid({
      mode: "legacy",
      message: "住宿條件幫我調整一下，最後會是兩位成年的旅客",
      previousContext: baseContext,
      legacyContext: { ...baseContext, adult_count: 11 },
      interpretModel: async () => {
        calls += 1;
      },
    });
    expect(calls).toBe(0);
    expect(resolution.context.adult_count).toBe(11);
  });

  it("keeps shadow observation-only and ignores free-operation model results", async () => {
    const resolution = await resolveStructuredBookingTurnHybrid({
      mode: "shadow",
      message: "住宿條件幫我調整一下，最後會是兩位成年的旅客",
      previousContext: baseContext,
      legacyContext: { ...baseContext, adult_count: 11 },
      interpretModel: async () => ({
        intents: ["update_party"],
        operations: [{
          operation: "replace",
          entity: "adult",
          count: 2,
          evidence: "兩位成年的旅客",
        }],
        missing_fields: [],
        ambiguities: [],
        confidence: 0.97,
      }),
    });
    expect(resolution.source).toBe("deterministic_safe_fallback");
    expect(resolution.authoritative).toBe(false);
    expect(resolution.context.adult_count).toBe(11);
    expect(resolution.reduction.context.adult_count).toBe(10);
  });

  it("fails closed without invoking a free-operation provider", async () => {
    let calls = 0;
    const resolution = await resolveStructuredBookingTurnHybrid({
      mode: "active",
      message: "住宿條件幫我調整一下，最後會是兩位成年的旅客",
      previousContext: baseContext,
      legacyContext: { ...baseContext, adult_count: 99 },
      interpretModel: async () => {
        calls += 1;
        const error = new Error("provider down");
        error.providerErrorCode = "provider_timeout";
        throw error;
      },
    });
    expect(resolution.blockedByAmbiguity).toBe(true);
    expect(resolution.context.adult_count).toBe(10);
    expect(resolution.result.operations).toEqual([]);
    expect(calls).toBe(0);
    expect(resolution.provider).toBeUndefined();
  });

  it("minimizes and redacts the outbound interpreter input", () => {
    const rawMessage =
      "姓名王小明，Email user@example.com，電話0912-345-678，地址宜蘭縣羅東鎮中山路1號，最後會是兩位成年旅客";
    const payload = buildStructuredTurnOutboundInput({
      message: rawMessage,
      context: {
        ...baseContext,
        customer_name: "王小明",
        email: "user@example.com",
        phone: "0912345678",
        booking_reference: "8752989685",
        pending_interaction: {
          action: "collect_quote_fields",
          proposed_values: {},
          required_response_type: "fields",
          required_fields: ["pet_weights_kg", "customer_email"],
          resume_action: "request_quote",
        },
      },
      previousTopic: "booking_price",
      dateInfo: { currentDate: "2026-09-06" },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("王小明");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("0912-345-678");
    expect(serialized).not.toContain("宜蘭縣羅東鎮中山路1號");
    expect(serialized).not.toContain("8752989685");
    expect(payload.pending_missing_fields).toEqual(["pet_weights_kg"]);
    expect(Object.keys(payload.current_booking_context)).toEqual([
      "stay",
      "party",
      "pets",
      "addons",
    ]);
    expect(sanitizeStructuredTurnUtterance(rawMessage)).toContain(
      "[REDACTED_NAME]",
    );
  });

  it("falls back to clarification when semantic interpretation would be required", () => {
    const resolution = resolveStructuredBookingTurn({
      mode: "active",
      message: "住宿條件幫我調整一下",
      previousContext: baseContext,
      legacyContext: { ...baseContext, adult_count: 99 },
      nowIso,
    });
    expect(resolution.requiresModel).toBe(true);
    expect(resolution.blockedByAmbiguity).toBe(true);
    expect(resolution.context.adult_count).toBe(10);
    expect(resolution.result.ambiguities[0].code).toBe("low_confidence");
  });

  it("recognizes persisted nested-array context as meaningful", () => {
    expect(hasMeaningfulBookingContext({ pet_weights_kg: [22] })).toBe(true);
    expect(hasMeaningfulBookingContext({ child_ages_years: [4, 12] })).toBe(true);
  });
});

const ruleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "試營運包棟房價",
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
      const guestCount = Number(
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
      const price = prices[dayType]?.[guestCount];
      return price == null
        ? []
        : [{
            id: `${guestCount}-${dayType}`,
            rule_set_id: ruleSet.id,
            guest_count: guestCount,
            day_type: dayType,
            nightly_price: price,
            is_active: true,
          }];
    }
    throw new Error(`Unexpected pricing table: ${table}`);
  };
}

describe("structured single and multi-turn pricing equivalence", () => {
  it("produces identical context and official quote for one turn and two turns", async () => {
    const single = interpret(
      "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚多少？",
      {},
    ).reduced.context;

    const first = interpret(
      "2026年11月1日，10位成人住一晚多少？",
      {},
    ).reduced.context;
    const multi = interpret("再加一隻22公斤狗狗呢？", first).reduced.context;

    expect(toTypedBookingContext(multi)).toEqual(toTypedBookingContext(single));

    const pricingOptions = {
      supabaseRequest: createPricingReader(),
      referenceDate: "2026-09-06",
    };
    const [singleQuote, multiQuote] = await Promise.all([
      buildOfficialPricingResolution(single, pricingOptions),
      buildOfficialPricingResolution(multi, pricingOptions),
    ]);
    for (const quote of [singleQuote, multiQuote]) {
      expect(quote.lodging_price.amount).toBe(25000);
      expect(quote.pet_fee.amount).toBe(1200);
      expect(quote.pet_fee.deposit_amount).toBe(3000);
      expect(quote.total_amount).toBe(26200);
      expect(quote.price_calculation_route).toBe("booking_pricing_core");
    }
  });

  it("routes complete structured input to shared pricing without fallback", async () => {
    const message =
      "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚多少？";
    const interpreted = interpret(message, {});
    const result = await executeTurnAction({
      message,
      semanticResult: toTurnActionSemanticResult(interpreted.result, {}),
      routeResult: {
        route: "faq_selector_required",
        providerUsed: "faq_selector_required",
        shouldCallDeepSeek: true,
        matchedFaqItems: [],
        matchedFaqIds: [],
      },
      context: interpreted.reduced.context,
      previousContext: {},
      recentMessages: [],
      pricingOptions: {
        supabaseRequest: createPricingReader(),
        referenceDate: "2026-09-06",
      },
    });

    expect(result.route).toBe("grounded_reply");
    expect(result.answer).toContain("TWD 26,200");
    expect(result.answer).toContain("押金 TWD 3,000");
    expect(result.semanticMetadata).toMatchObject({
      pricing_called: true,
      action_executor_result: "request_quote_pricing_resolved",
      price_calculation_route: "booking_pricing_core",
    });
  });

  it("answers price but never promises availability for mixed intent", async () => {
    const message = "2026年11月1日10位成人住一晚多少，還有房嗎？";
    const interpreted = interpret(message, {});
    const result = await executeTurnAction({
      message,
      semanticResult: toTurnActionSemanticResult(interpreted.result, {}),
      routeResult: {
        route: "faq_selector_required",
        providerUsed: "faq_selector_required",
        shouldCallDeepSeek: true,
        matchedFaqItems: [],
        matchedFaqIds: [],
      },
      context: interpreted.reduced.context,
      previousContext: {},
      recentMessages: [],
      pricingOptions: {
        supabaseRequest: createPricingReader(),
        referenceDate: "2026-09-06",
      },
    });

    expect(result.answer).toContain("TWD 25,000");
    expect(result.answer).toContain("實際房況仍須以官網即時訂房系統為準");
    expect(result.answer).not.toMatch(/保證有房|確定有房/);
  });
});

describe("structured interpreter local canary manifest", () => {
  it("contains at least 50 benchmark-only cases", () => {
    expect(canaryCases.length).toBeGreaterThanOrEqual(50);
    expect(new Set(canaryCases.map((entry) => entry.id)).size).toBe(
      canaryCases.length,
    );
  });

  it.each(canaryCases)("passes $id", (canary) => {
    const context = canaryContext(canary.context);
    const interpreted = canary.resolve
      ? resolveStructuredBookingTurn({
          mode: "active",
          message: canary.message,
          previousContext: context,
          legacyContext: context,
          nowIso,
        })
      : {
          ...interpretBookingTurnDeterministically({
            message: canary.message,
            context,
          }),
        };
    const result = interpreted.result;
    const reduced = interpreted.reduction || reduceBookingContext(context, result, {
      message: canary.message,
      nowIso,
    });

    if (canary.ambiguity) {
      expect(
        result.ambiguities.map((entry) => entry.code),
        canary.id,
      ).toContain(canary.ambiguity);
      expect(reduced.changed, canary.id).toBe(false);
      return;
    }

    expect(result.ambiguities, canary.id).toEqual([]);
    if (canary.entities) {
      expect(
        [...new Set(result.operations.map((entry) => entry.entity))].sort(),
        canary.id,
      ).toEqual([...canary.entities].sort());
    }
    for (const intent of canary.intents || []) {
      expect(result.intents, canary.id).toContain(intent);
    }
    for (const field of [
      "adult_count",
      "child_count",
      "infant_count",
      "pet_count",
      "breakfast_count",
    ]) {
      if (Object.prototype.hasOwnProperty.call(canary, field)) {
        expect(reduced.context[field], `${canary.id}:${field}`).toBe(
          canary[field],
        );
      }
    }
    if (canary.missing) {
      expect(result.missing_fields, canary.id).toContain(canary.missing);
    }
  });
});
