import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchSemanticDialogueCapabilities } from "./dialogueCapabilities.js";
import {
  semanticTurnAstSchema,
  validateSemanticTurnAst,
} from "./semanticTurnResolver.js";
import { resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";
import { getConversationContextForStorage } from "./conversationContext.js";
import { buildOfficialPricingResolution } from "./lodgingPricing.js";
import { replayDialogueEvents } from "./dialogueStateEngine.js";

const dateInfo = { currentDate: "2026-09-08", timeZone: "Asia/Taipei" };
const nowIso = "2026-09-08T04:00:00.000Z";

async function resolve(
  message,
  context = {},
  turnId = `turn-${message}`,
  { previousTopic = "" } = {},
) {
  return resolveStructuredBookingTurnCandidatePipeline({
    mode: "active",
    message,
    previousContext: context,
    legacyContext: context,
    conversationId: "architecture-conversation",
    sourceMessageId: turnId,
    dateInfo,
    nowIso,
    previousTopic,
  });
}

function activeQuote(overrides = {}) {
  return {
    active_intent: "pricing",
    current_topic: "booking_price",
    stay_type: "villa",
    check_in: "2026-11-01",
    check_out: "2026-11-02",
    stay_nights: 1,
    adult_count: 10,
    child_count: 0,
    infant_count: 0,
    pet_count: 1,
    pet_type: "dog",
    pet_weights_kg: [22],
    dog_under_10kg_count: 0,
    dog_10_to_20kg_count: 0,
    dog_over_20kg_count: 1,
    breakfast_count: 0,
    quote_scenario: { scenario_id: "architecture", context_version: 1 },
    ...overrides,
  };
}

const policyFrames = Object.freeze([
  ["late_checkout_policy", ["退房", "離館"], ["想延後", "需要延遲", "能晚點", "可多待"]],
  ["visitor_policy", ["訪客", "來玩的朋友"], ["怎麼收費", "能待多久", "最晚幾點", "可以來嗎"]],
  ["general_deposit_policy", ["住宿押金", "包棟保證金"], ["是多少", "怎麼收", "何時付", "會退嗎"]],
  ["post_checkout_luggage_policy", ["退房後的行李", "離館後的行李"], ["能寄放", "可暫放", "能保管", "怎麼寄放"]],
  ["precheckin_luggage_policy", ["提早抵達的行李", "入住前到場的行李"], ["能寄放", "可暫放", "能保管", "怎麼寄放"]],
  ["room_count_policy", ["客房", "臥房"], ["總共有幾間", "數量多少間", "間數是多少", "一共有多少間"]],
  ["room_allocation_policy", ["客房", "床位"], ["如何分配", "怎麼安排", "由誰配置", "要怎麼住"]],
  ["quad_room_policy", ["四人房間", "4人客房"], ["有提供嗎", "能入住嗎", "共有幾間", "可以住嗎"]],
  ["vegetarian_breakfast_policy", ["早餐素食", "早點蔬食"], ["有提供嗎", "可以準備嗎", "能選嗎", "怎麼安排"]],
  ["pet_supplies_policy", ["狗狗用品", "毛孩用具"], ["提供什麼", "有準備嗎", "需要自備嗎", "有哪些"]],
  ["pet_shedding_policy", ["狗狗掉毛", "毛孩毛髮"], ["會收費嗎", "怎麼處理", "需要加價嗎", "有限制嗎"]],
  ["pet_bathing_policy", ["狗狗洗澡", "毛孩沐浴"], ["可以嗎", "能沖洗嗎", "有限制嗎", "怎麼處理"]],
  ["large_dog_policy", ["大型犬", "體型大的狗"], ["可以入住嗎", "能住宿嗎", "有接受嗎", "限制為何"]],
  ["pet_eligibility_policy", ["寵物", "貓咪"], ["可以帶嗎", "能入住嗎", "有開放嗎", "接受住宿嗎"]],
  ["breakfast_policy", ["早餐", "早點"], ["有提供嗎", "多少錢", "幾點送", "怎麼加購"]],
  ["checkout_policy", ["退房", "離館"], ["時間幾點", "流程如何", "要做什麼", "規定是什麼"]],
  ["checkin_policy", ["入住", "進房"], ["時間幾點", "流程如何", "要做什麼", "規定是什麼"]],
  ["kitchen_policy", ["廚房", "料理區"], ["可以煮飯嗎", "能開伙嗎", "如何使用", "有提供嗎"]],
  ["pool_policy", ["泳池", "戲水設施"], ["有提供嗎", "能游泳嗎", "可以使用嗎", "開放嗎"]],
  ["luggage_delivery_policy", ["行李", "一般包裹"], ["能宅配嗎", "可寄送嗎", "會代收嗎", "物流能送達嗎"]],
]);

function generatedPolicyCases() {
  const prefixes = ["想確認", "麻煩說明"];
  return policyFrames.flatMap(([capabilityId, subjects, actions], frameIndex) =>
    prefixes.flatMap((prefix, prefixIndex) =>
      subjects.flatMap((subject, subjectIndex) =>
        actions.map((action, actionIndex) => ({
          capabilityId,
          message: `${prefix}${subject}${action}${
            (frameIndex + prefixIndex + subjectIndex + actionIndex) % 2
              ? "呢"
              : "？"
          }`,
        })),
      ),
    ),
  );
}

function pendingContext(operation, weight = 20, index = 0) {
  return activeQuote({
    pending_interaction: {
      type: "slot_fill",
      action: "resolve_slot_fill",
      transaction_id: `slot-fill:matrix-${operation}-${index}`,
      partial_operation: {
        operation,
        entity: "pet",
        candidate_entities: ["pet"],
        candidate_operations: [operation],
        count: 1,
        pet_type: "dog",
        weights_kg: [],
        target_pet: operation === "replace" ? 0 : null,
        filled_slots:
          operation === "replace"
            ? ["operation", "entity", "count", "pet_type", "target_pet"]
            : ["operation", "entity", "count", "pet_type"],
        missing_slots: ["weights_kg"],
      },
      provenance: [],
      proposed_values: {},
      required_response_type: "slot_fill",
      required_fields: ["pet_weights_kg"],
      resume_action: "request_quote",
      scenario_id: "architecture",
      context_version: 1,
      asked_turn_id: `matrix-${operation}-${index}`,
      expires_after_turns: 1,
      created_at: nowIso,
      expires_at: "2026-09-08T04:30:00.000Z",
    },
    expected_weight: weight,
  });
}

const priceRuleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "architecture-test-rules",
  effective_from: "2026-11-01",
  effective_to: "2027-02-01",
  deposit_rate: 0.3,
  is_active: true,
};
const priceMatrix = Object.fromEntries(
  Array.from({ length: 9 }, (_, index) => {
    const adults = 10 + index;
    return [
      adults,
      {
        weekday: 25_000 + index * 1_250,
        friday: 32_000 + index * 1_250,
        holiday: 39_000 + index * 1_250,
      },
    ];
  }),
);

async function pricingReader(pathname) {
  const url = new URL(`https://pricing.test${pathname}`);
  const table = url.pathname.slice(1);
  if (table === "booking_price_rule_sets") return [priceRuleSet];
  if (table === "booking_special_dates") {
    const date = String(url.searchParams.get("date") || "").replace(/^eq\./, "");
    return date === "2026-11-01"
      ? [
          {
            id: "special-weekday",
            rule_set_id: priceRuleSet.id,
            date,
            day_type: "weekday",
            is_active: true,
          },
        ]
      : [];
  }
  if (table === "booking_package_rates") {
    const adults = Number(
      String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""),
    );
    const dayType = String(url.searchParams.get("day_type") || "").replace(
      /^eq\./,
      "",
    );
    const nightlyPrice = priceMatrix[adults]?.[dayType];
    return nightlyPrice
      ? [
          {
            id: `${adults}-${dayType}`,
            rule_set_id: priceRuleSet.id,
            guest_count: adults,
            day_type: dayType,
            nightly_price: nightlyPrice,
            is_active: true,
          },
        ]
      : [];
  }
  throw new Error(`unexpected pricing table: ${table}`);
}

describe("semantic dialogue architecture generalization", () => {
  it("executes the required scenario with one scenario timeline and official prices", async () => {
    const turns = [
      "2026/11/1，10人住一晚多少",
      "再加一隻22公斤狗",
      "那兩晚呢",
      "退房可以晚一小時嗎",
      "狗改20公斤",
      "再加一隻8公斤",
      "早餐兩份",
      "狗都不要了",
      "改11人",
    ];
    const expected = [
      [10, 1, [], 0, 25_000],
      [10, 1, [22], 0, 26_200],
      [10, 2, [22], 0, 51_090],
      [10, 2, [22], 0, 51_090],
      [10, 2, [20], 0, 50_310],
      [10, 2, [20, 8], 0, 51_285],
      [10, 2, [20, 8], 2, 51_785],
      [10, 2, [], 2, 49_250],
      [11, 2, [], 2, 51_688],
    ];
    let context = {};
    let scenarioId = "";
    for (const [index, message] of turns.entries()) {
      const beforePolicy = index === 3 ? JSON.stringify(context) : "";
      const resolution = await resolve(message, context, `required-a-${index}`);
      context = resolution.context;
      if (index === 0) scenarioId = context.quote_scenario.scenario_id;
      expect(context.quote_scenario.scenario_id).toBe(scenarioId);
      expect([
        context.adult_count,
        context.stay_nights,
        context.pet_weights_kg,
        context.breakfast_count,
      ]).toEqual(expected[index].slice(0, 4));
      const price = await buildOfficialPricingResolution(context, {
        supabaseRequest: pricingReader,
      });
      expect(price.total_amount, message).toBe(expected[index][4]);
      if (index === 3) expect(JSON.stringify(context)).toBe(beforePolicy);
    }

    const replayed = replayDialogueEvents(context.dialogue_events);
    expect(replayed).toMatchObject({
      check_in: "2026-11-01",
      stay_nights: 2,
      adult_count: 11,
      pet_count: 0,
      pet_weights_kg: [],
      breakfast_count: 2,
    });
    for (const event of context.dialogue_events) {
      expect(event).toMatchObject({
        event_id: expect.any(String),
        conversation_id: "architecture-conversation",
        scenario_id: expect.any(String),
        turn_id: expect.any(String),
        state_version: expect.any(Number),
        validated_value: expect.any(Object),
        source_span_ids: expect.any(Array),
        source_context_ids: expect.any(Array),
        timestamp: nowIso,
      });
      expect(event).toHaveProperty("operation");
      expect(event).toHaveProperty("entity");
    }

    const nextScenario = await resolve(
      "2026/11/8，12人住一晚多少",
      context,
      "required-b-1",
    );
    expect(nextScenario.context.quote_scenario.scenario_id).not.toBe(scenarioId);
    expect(nextScenario.context).toMatchObject({
      adult_count: 12,
      stay_nights: 1,
      pet_count: 0,
      pet_weights_kg: [],
      breakfast_count: 0,
      pending_interaction: null,
    });
  });

  it("routes 320 generated policy paraphrases by subject/action slots", async () => {
    const cases = generatedPolicyCases();
    expect(cases).toHaveLength(320);

    const faqItems = JSON.parse(
      readFileSync(
        new URL("../../api/knowledge/faq-items.json", import.meta.url),
        "utf8",
      ),
    );
    const publishedPhrases = new Set(
      faqItems.flatMap((item) => [item.question, ...(item.aliases || [])]),
    );
    const runtimeSource = [
      "dialogueCapabilities.js",
      "semanticTurnResolver.js",
      "structuredBookingTurn.js",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
    let unseen = 0;

    for (const [index, entry] of cases.entries()) {
      const match = matchSemanticDialogueCapabilities(entry.message);
      expect(match.primary?.capability_id, entry.message).toBe(entry.capabilityId);
      const resolution = await resolve(
        entry.message,
        activeQuote(),
        `policy-generalization-${index}`,
      );
      expect(resolution.plan.intent_ast.turn_kind, entry.message).toBe(
        "informational",
      );
      expect(resolution.turn_delta.operations, entry.message).toEqual([]);
      expect(resolution.changed, entry.message).toBe(false);
      if (!publishedPhrases.has(entry.message) && !runtimeSource.includes(entry.message)) {
        unseen += 1;
      }
    }
    expect(unseen).toBeGreaterThanOrEqual(160);
  });

  it("keeps semantic authorities free of benchmark-utterance shortcuts", () => {
    const authoritySource = [
      "dialogueCapabilities.js",
      "semanticTurnResolver.js",
      "dialogueStateEngine.js",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");

    for (const benchmarkUtterance of [
      "那兩晚呢",
      "可以晚退一小時",
      "幾間房",
      "20公斤狗",
      "再加一個",
      "那個改掉",
    ]) {
      expect(authoritySource).not.toContain(benchmarkUtterance);
    }
    expect(authoritySource).not.toMatch(/message\s*\.\s*includes\s*\(/u);
    expect(authoritySource).not.toMatch(/message\s*={2,3}\s*["'`]/u);
  });

  it("keeps 200 nine-turn quote conversations coherent and event-sourced", async () => {
    let contextLost = 0;
    let wrongInherited = 0;
    let wrongMutation = 0;
    let staleMutation = 0;
    let stalePending = 0;
    let duplicateMutation = 0;

    for (let index = 0; index < 200; index += 1) {
      const initialAdults = 10 + (index % 5);
      const finalAdults = 11 + (index % 6);
      const day = 1 + (index % 20);
      const prefix = `conversation-${index}`;
      let context = {};
      const first = await resolve(
        `2026年11月${day}日，${initialAdults}位成人住一晚總共多少？`,
        context,
        `${prefix}-1`,
      );
      context = first.context;
      const scenarioId = context.quote_scenario?.scenario_id;
      if (!scenarioId || context.adult_count !== initialAdults) contextLost += 1;

      context = (await resolve("另外增加一隻22公斤狗", context, `${prefix}-2`)).context;
      context = (await resolve("住宿晚數調整為兩晚", context, `${prefix}-3`)).context;
      const policyBefore = JSON.stringify(context);
      const policy = await resolve("離館時間能延後一小時嗎？", context, `${prefix}-4`);
      if (JSON.stringify(policy.context) !== policyBefore) wrongMutation += 1;
      context = policy.context;
      context = (await resolve("原本那隻狗改為20公斤", context, `${prefix}-5`)).context;
      context = (await resolve("追加一隻8公斤狗", context, `${prefix}-6`)).context;
      context = (await resolve("早餐設定為兩份", context, `${prefix}-7`)).context;
      context = (await resolve("所有狗狗都移除", context, `${prefix}-8`)).context;
      context = (await resolve(`成人改為${finalAdults}位`, context, `${prefix}-9`)).context;

      if (context.quote_scenario?.scenario_id !== scenarioId) contextLost += 1;
      if (context.stay_nights !== 2 || context.breakfast_count !== 2) {
        wrongInherited += 1;
      }
      if (
        context.adult_count !== finalAdults ||
        context.pet_count !== 0 ||
        context.pet_weights_kg.length
      ) {
        wrongMutation += 1;
      }
      if (context.pending_interaction) stalePending += 1;
      const eventIds = context.dialogue_events.map((event) => event.event_id);
      if (new Set(eventIds).size !== eventIds.length) duplicateMutation += 1;
      const expectedVersion = finalAdults === initialAdults ? 7 : 8;
      if (context.quote_scenario?.context_version !== expectedVersion) {
        staleMutation += 1;
      }
    }

    expect({
      contextLost,
      wrongInherited,
      wrongMutation,
      staleMutation,
      stalePending,
      duplicateMutation,
    }).toEqual({
      contextLost: 0,
      wrongInherited: 0,
      wrongMutation: 0,
      staleMutation: 0,
      stalePending: 0,
      duplicateMutation: 0,
    });
  }, 20_000);

  it("understands 100 contextual fragments without a generic route", async () => {
    const cases = Array.from({ length: 25 }, (_, index) => index + 1).flatMap(
      (value) => [
        `那${(value % 4) + 1}晚呢`,
        `改${10 + (value % 8)}人`,
        `早餐${(value % 5) + 1}份`,
        `再加一隻${8 + (value % 18)}公斤狗`,
      ],
    );
    expect(cases).toHaveLength(100);
    for (const [index, message] of cases.entries()) {
      const result = await resolve(message, activeQuote(), `fragment-${index}`);
      expect(result.plan.intent_ast.turn_kind, message).toBe("transactional");
      expect(result.plan.intent_ast.scenario_action, message).toBe("continue");
      expect(result.turn_delta.operations.length, message).toBeGreaterThan(0);
      expect(result.context.quote_scenario.scenario_id, message).toBe(
        "architecture",
      );
    }
  });

  it("resolves the required fragment protocol through slots and context", async () => {
    const transactionCases = [
      ["那兩晚呢", { stay_nights: 2 }],
      ["改11人", { adult_count: 11 }],
      ["不要狗了", { pet_count: 0, pet_weights_kg: [] }],
      ["早餐兩份", { breakfast_count: 2 }],
      ["那週五呢", { pricing_day_type: "friday" }],
      ["另一隻15公斤", { pet_count: 2, pet_weights_kg: [22, 15] }],
    ];
    for (const [index, [message, expectedContext]] of transactionCases.entries()) {
      const result = await resolve(
        message,
        activeQuote(),
        `required-fragment-transaction-${index}`,
      );
      expect(result.plan.intent_ast.turn_kind, message).toBe("transactional");
      expect(result.plan.intent_ast.scenario_action, message).toBe("continue");
      expect(result.context, message).toMatchObject(expectedContext);
      if (message.startsWith("另一隻")) {
        expect(result.plan.intent_ast.references).toEqual(
          expect.arrayContaining([
            "pets.count",
            "quote_scenario.context_version",
          ]),
        );
      }
    }

    const bareWeight = await resolve(
      "20公斤",
      activeQuote(),
      "required-fragment-bare-weight",
    );
    expect(bareWeight.plan.intent_ast.turn_kind).toBe("clarification");
    expect(bareWeight.turn_delta.operations).toEqual([]);

    const contextualTime = await resolve(
      "最晚呢",
      activeQuote(),
      "required-fragment-contextual-time",
      { previousTopic: "checkout_info" },
    );
    expect(contextualTime.plan.intent_ast).toMatchObject({
      turn_kind: "informational",
      goal_ids: ["checkout_info"],
      operations: [],
    });

    for (const [index, message] of [
      "如果換小孩呢",
      "改12歲",
      "原本那隻",
      "不要那個",
    ].entries()) {
      const result = await resolve(
        message,
        activeQuote(),
        `required-fragment-clarification-${index}`,
      );
      expect(result.plan.intent_ast.turn_kind, message).toBe("clarification");
      expect(result.turn_delta.operations, message).toEqual([]);
    }

    for (const [index, message] of ["其他一樣", "照剛才"].entries()) {
      const before = activeQuote();
      const result = await resolve(
        message,
        before,
        `required-fragment-resume-${index}`,
      );
      expect(result.plan.intent_ast, message).toMatchObject({
        turn_kind: "transactional",
        scenario_action: "continue",
        goal_ids: ["request_quote"],
        operations: [],
      });
      expect(result.context.quote_scenario, message).toMatchObject(
        before.quote_scenario,
      );
      expect(result.turn_delta.operations, message).toEqual([]);
    }
  });

  it("resolves 50 same-phrase context matrices by pending/scenario state", async () => {
    for (let index = 0; index < 50; index += 1) {
      const weight = 5 + index;
      const message = `${weight}公斤狗`;
      const fresh = await resolve(message, {}, `matrix-fresh-${index}`);
      const active = await resolve(message, activeQuote(), `matrix-active-${index}`);
      const unrelated = await resolve(
        message,
        { current_topic: "facility" },
        `matrix-unrelated-${index}`,
      );
      const add = await resolve(
        message,
        pendingContext("add", weight, index),
        `matrix-add-answer-${index}`,
      );
      const replace = await resolve(
        message,
        pendingContext("replace", weight, index),
        `matrix-replace-answer-${index}`,
      );

      for (const result of [fresh, active, unrelated]) {
        expect(result.plan.intent_ast.turn_kind, message).toBe("informational");
        expect(result.turn_delta.operations, message).toEqual([]);
      }
      expect(add.plan.slot_fill_transaction.status, message).toBe("completed");
      expect(add.context.pet_weights_kg, message).toEqual([22, weight]);
      expect(replace.plan.slot_fill_transaction.status, message).toBe("completed");
      expect(replace.context.pet_weights_kg, message).toEqual([weight]);
    }
  });

  it("keeps 50 new sessions isolated from private scenario state", async () => {
    for (let index = 0; index < 50; index += 1) {
      let sessionA = (
        await resolve(
          `2026年11月${1 + (index % 20)}日，10位成人住一晚多少？`,
          {},
          `session-a-${index}-1`,
        )
      ).context;
      sessionA = (
        await resolve("再加一隻22公斤狗", sessionA, `session-a-${index}-2`)
      ).context;
      sessionA = (
        await resolve("早餐兩份", sessionA, `session-a-${index}-3`)
      ).context;
      sessionA = (
        await resolve("再增加一個", sessionA, `session-a-${index}-4`)
      ).context;
      const sessionB = await resolve(
        "狗狗可以入住嗎？",
        {},
        `session-b-${index}-1`,
      );
      expect(sessionA.quote_scenario).not.toBeNull();
      expect(sessionA.breakfast_count).toBe(2);
      expect(sessionA.pending_interaction).not.toBeNull();
      expect(sessionB.context.quote_scenario).toBeNull();
      expect(sessionB.context.pet_count).toBeNull();
      expect(sessionB.context.pending_interaction).toBeNull();
      expect(sessionB.plan.intent_ast.turn_kind).toBe("informational");
    }
  });

  it("keeps 50 ambiguous mutations atomic until the entity is known", async () => {
    const ambiguousForms = [
      (value) => `再增加${value}個`,
      () => "那個改掉",
      () => "換另外一個",
      () => "少一個",
      () => "不要那個",
    ];
    for (let index = 0; index < 50; index += 1) {
      const before = activeQuote();
      const message = ambiguousForms[index % ambiguousForms.length](
        1 + (index % 9),
      );
      const result = await resolve(
        message,
        before,
        `ambiguity-${index}`,
      );
      expect(result.plan.intent_ast.turn_kind, message).toBe("clarification");
      expect(result.turn_delta.operations).toEqual([]);
      expect(result.context.adult_count).toBe(before.adult_count);
      expect(result.context.pet_count).toBe(before.pet_count);
      if (result.context.pending_interaction) {
        expect(result.context.pending_interaction).toMatchObject({
          type: "slot_fill",
          partial_operation: { entity: null },
        });
      }
    }
  });
});

describe("semantic AST and transition safety", () => {
  const validPlan = {
    spans: [
      {
        span_id: "span-001",
        text: "11人",
        start: 1,
        end: 4,
        normalized_type: "adult_count",
        normalized_value: 11,
        entity_hints: ["adult"],
      },
    ],
    context: activeQuote(),
  };
  const validAst = {
    turn_kind: "transactional",
    goal_ids: ["request_quote"],
    scenario_action: "continue",
    operations: [
      {
        operation: "replace",
        entity: "adult",
        span_bindings: ["span-001"],
        context_bindings: ["party.adults"],
      },
    ],
    references: ["party.adults"],
    missing_slots: [],
    clarification_code: null,
    confidence: 0.99,
  };

  it("uses a strict resolver schema without price or policy output fields", () => {
    expect(semanticTurnAstSchema.parse(validAst)).toEqual(validAst);
    for (const invalid of [
      "not-json",
      { ...validAst, price: 25_000 },
      {
        ...validAst,
        operations: [{ ...validAst.operations[0], check_in: "2026-11-01" }],
      },
      {
        ...validAst,
        operations: [{ ...validAst.operations[0], span_bindings: ["invented"] }],
      },
      {
        ...validAst,
        operations: [{ ...validAst.operations[0], entity: "payment" }],
      },
      {
        ...validAst,
        operations: [{ ...validAst.operations[0], operation: "increment" }],
      },
      {
        ...validAst,
        operations: [
          {
            ...validAst.operations[0],
            context_bindings: ["quote_scenario.context_version:999"],
          },
        ],
      },
      { ...validAst, confidence: 0.2 },
    ]) {
      expect(() => validateSemanticTurnAst(invalid, { plan: validPlan })).toThrow();
    }
  });

  it("is idempotent for a replayed mutation turn id", async () => {
    const first = await resolve(
      "再加一隻20公斤狗",
      activeQuote(),
      "idempotent-pet-add",
    );
    const replay = await resolve(
      "再加一隻20公斤狗",
      first.context,
      "idempotent-pet-add",
    );
    expect(first.context.pet_weights_kg).toEqual([22, 20]);
    expect(replay.context.pet_weights_kg).toEqual([22, 20]);
    expect(replay.reduction).toMatchObject({
      duplicate: true,
      changed: false,
      applied: false,
    });
  });

  it("enforces property invariants and a zero-call 1,000-turn cost sample", async () => {
    let zeroCallTurns = 0;
    let oneCallTurns = 0;
    let overBudgetTurns = 0;
    for (let index = 0; index < 1_000; index += 1) {
      const informational = index % 4 === 0;
      const result = await resolve(
        informational
          ? "請問離館時間能延後嗎？"
          : `成人改為${10 + (index % 9)}位`,
        activeQuote(),
        `cost-${index}`,
      );
      const calls = result.provider?.called ? 1 : 0;
      if (calls === 0) zeroCallTurns += 1;
      else if (calls === 1) oneCallTurns += 1;
      else overBudgetTurns += 1;
      if (informational) {
        expect(result.turn_delta.operations).toEqual([]);
        expect(result.changed).toBe(false);
      }
      expect(calls).toBeLessThanOrEqual(1);
    }
    expect({ zeroCallTurns, oneCallTurns, overBudgetTurns }).toEqual({
      zeroCallTurns: 1_000,
      oneCallTurns: 0,
      overBudgetTurns: 0,
    });
  }, 20_000);
});
