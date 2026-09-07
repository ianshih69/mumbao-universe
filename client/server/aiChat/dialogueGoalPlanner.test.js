import { describe, expect, it } from "vitest";
import {
  dialogueCapabilityRegistry,
  dialogueGoalTaxonomy,
  executeDialogueGoalPlan,
  selectDialogueResponseAuthority,
} from "./dialogueGoalPlanner.js";
import {
  compileBookingTurnCandidates,
  resolveStructuredBookingTurnCandidatePipeline,
} from "./structuredBookingTurnCandidates.js";
import { getConversationContextForStorage } from "./conversationContext.js";

const dateInfo = { currentDate: "2026-09-07", timeZone: "Asia/Taipei" };
const nowIso = "2026-09-07T04:00:00.000Z";

const fragmentCorpus = Object.freeze({
  pet: [
    "20公斤狗",
    "狗20公斤",
    "大狗22kg",
    "10公斤狗",
    "狗押金",
    "可以帶狗嗎",
    "大型犬",
    "毛孩費用",
    "兩隻狗，一隻8公斤一隻15公斤",
    "20kg的犬",
    "寵物怎麼收費",
    "狗住兩晚",
  ],
  guest_count: [
    "12人",
    "十人包棟",
    "成人12位",
    "8位大人",
    "兩位成人",
    "大人十位",
    "16個成人",
    "一人包棟",
    "18位成年旅客",
    "三位大人",
    "15人住宿",
    "11人包棟",
  ],
  child_age: [
    "4歲小孩",
    "兒童8歲",
    "3歲幼兒",
    "12歲兒童",
    "13歲小孩",
    "嬰兒2歲",
    "小朋友6歲",
    "兩位兒童",
    "一位嬰幼兒",
    "兒童怎麼計費",
    "幼兒免費嗎",
    "小孩住宿規定",
  ],
  breakfast: [
    "早餐",
    "早餐三份",
    "三份早餐",
    "早餐多少",
    "早餐幾點",
    "有早餐嗎",
    "早餐費用",
    "早餐代訂",
    "早餐兩個",
    "早餐十份",
    "早餐送達時間",
    "加購早餐",
  ],
  dates_nights: [
    "平日",
    "週五",
    "週六",
    "星期日",
    "一晚",
    "兩晚",
    "三夜",
    "明天",
    "後天入住",
    "2026年11月1日",
    "假日一晚",
    "週五兩晚",
  ],
  facilities: [
    "有泳池",
    "戲水設施",
    "廚房",
    "可以煮飯嗎",
    "停車",
    "停車位",
    "KTV",
    "可以唱歌嗎",
    "烤肉",
    "可以用炭火嗎",
    "麻將",
    "麻將桌",
  ],
  payment: [
    "刷卡",
    "信用卡付款",
    "現金",
    "現金付款",
    "行動支付",
    "可以轉帳嗎",
    "匯款",
    "付款方式",
    "尾款轉帳",
    "怎麼付款",
    "能刷卡嗎",
    "可用現金嗎",
  ],
  cancellation: [
    "取消",
    "退訂",
    "退款",
    "取消費",
    "退訂金",
    "取消規定",
    "退款比例",
    "入住前取消",
    "當天取消",
    "改期或取消",
    "取消能退款嗎",
    "訂金退款多少",
  ],
  transport: [
    "交通",
    "怎麼去",
    "怎麼到民宿",
    "火車",
    "火車站",
    "搭火車怎麼到",
    "有接駁嗎",
    "接駁服務",
    "車站到民宿",
    "交通方式",
    "從宜蘭車站出發",
    "可以安排接駁嗎",
  ],
});

function compile(message, context = {}) {
  return compileBookingTurnCandidates({
    message,
    context,
    dateInfo,
    sourceTurnId: `test-${message}`,
    nowIso,
  });
}

async function resolve(
  message,
  context = {},
  sourceMessageId = `test-${message}`
) {
  return resolveStructuredBookingTurnCandidatePipeline({
    mode: "active",
    message,
    previousContext: context,
    legacyContext: context,
    dateInfo,
    previousTopic: context.current_topic || "",
    sourceMessageId,
    nowIso,
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
    quote_scenario: { scenario_id: "goal-matrix", context_version: 1 },
    ...overrides,
  };
}

describe("unified dialogue goal planner", () => {
  it("defines a server capability for every goal in the taxonomy", () => {
    const goalIds = Object.values(dialogueGoalTaxonomy).flat();
    expect(new Set(goalIds).size).toBe(goalIds.length);
    for (const goalId of goalIds) {
      expect(dialogueCapabilityRegistry[goalId]).toMatchObject({
        goal_id: goalId,
        required_entities: expect.any(Array),
        required_slots: expect.any(Array),
        optional_slots: expect.any(Array),
        authoritative_source: expect.any(String),
        mutates_context: expect.any(Boolean),
        can_answer_partially: expect.any(Boolean),
        response_profile: expect.any(String),
        compatible_goal_ids: expect.any(Array),
      });
      expect(Object.hasOwn(dialogueCapabilityRegistry[goalId], "handler")).toBe(
        true
      );
    }
  });

  it("classifies and answers 108 oral fragments without a generic gap", async () => {
    const cases = Object.entries(fragmentCorpus).flatMap(
      ([category, messages]) => messages.map(message => ({ category, message }))
    );
    expect(cases).toHaveLength(108);

    for (const { category, message } of cases) {
      const plan = compile(message);
      expect(["informational", "partial"], `${category}: ${message}`).toContain(
        plan.dialogue_goal_plan.lane
      );
      expect(plan.classification, `${category}: ${message}`).toBe(
        "INFORMATIONAL"
      );
      expect(
        plan.deterministic_result.operations,
        `${category}: ${message}`
      ).toEqual([]);
      expect(
        plan.dialogue_goal_plan.mutates_context,
        `${category}: ${message}`
      ).toBe(false);

      const route = await executeDialogueGoalPlan(plan.dialogue_goal_plan);
      expect(route, `${category}: ${message}`).not.toBeNull();
      expect(route.knowledgeGap, `${category}: ${message}`).toBe(false);
      expect(route.answer, `${category}: ${message}`).not.toContain(
        "目前還沒有確認過的慢慢蒔光資料"
      );
      expect(
        (route.answer.match(/[。！？]/g) || []).length,
        `${category}: ${message}`
      ).toBeLessThanOrEqual(2);
    }
  });

  it("keeps partial answers ahead of full fallback", async () => {
    const plan = compile("10人一隻狗多少？").dialogue_goal_plan;
    const route = await executeDialogueGoalPlan(plan);

    expect(plan).toMatchObject({
      lane: "partial",
      primary_goal_id: "pet_fee_lookup",
      mutates_context: false,
    });
    expect(route.answer).toBe(
      "包棟價格還需要入住日期與晚數；狗狗費則依體重計算。請提供入住日期、晚數、狗狗體重。"
    );
    expect(route.knowledgeGap).toBe(false);
  });

  it("answers a pet-only fee question without turning it into a lodging quote", async () => {
    const plan = compile("20公斤狗多少？").dialogue_goal_plan;
    const route = await executeDialogueGoalPlan(plan);

    expect(plan.lane).toBe("informational");
    expect(route.answer).toContain("TWD 800");
    expect(route.answer).not.toContain("包棟價格還需要");
  });

  it("gets pet amounts from bookingPricing and keeps answers concise", async () => {
    const oneNight = await executeDialogueGoalPlan(
      compile("20公斤狗").dialogue_goal_plan
    );
    const twoNights = await executeDialogueGoalPlan(
      compile("20公斤狗住兩晚").dialogue_goal_plan
    );

    expect(oneNight.answer).toBe(
      "可以入住，20公斤狗狗每隻每晚 TWD 800；另收每棟可退寵物押金 TWD 3,000。"
    );
    expect(twoNights.answer).toContain("TWD 1,560");
    expect(twoNights.answer).toContain("TWD 3,000");
    expect(twoNights.answer.match(/。/g) || []).toHaveLength(2);
    expect(
      compile("20公斤狗").dialogue_goal_plan.capabilities.find(
        entry => entry.goal_id === "pet_fee_lookup"
      ).authoritative_source
    ).toBe("bookingPricing.calculateBookingPetFees");
  });

  it("does not let a FAQ NONE candidate override a structured answer", async () => {
    const plan = compile("20公斤狗").dialogue_goal_plan;
    const route = await executeDialogueGoalPlan(plan);
    const authority = selectDialogueResponseAuthority({
      goalPlan: plan,
      structuredResolution: {},
      routeResult: {
        route: "knowledge_gap",
        knowledgeGap: true,
      },
    });

    expect(route.knowledgeGap).toBe(false);
    expect(authority).toEqual({
      authority: "dialogue_goal_planner",
      execute_transaction: false,
      allow_context_mutation: false,
    });
  });

  it("keeps an unknown delivery policy as a true knowledge gap", async () => {
    const plan = compile("行李宅配").dialogue_goal_plan;
    expect(plan).toMatchObject({
      lane: "knowledge",
      goal_ids: ["true_knowledge_gap"],
      mutates_context: false,
    });
    expect(await executeDialogueGoalPlan(plan)).toBeNull();
  });
});

describe("dialogue context matrix", () => {
  it.each([
    ["fresh session", {}],
    ["active quote without pending", activeQuote()],
    [
      "multiple existing pets",
      activeQuote({
        pet_count: 2,
        pet_weights_kg: [22, 10],
        dog_under_10kg_count: 1,
        dog_over_20kg_count: 1,
      }),
    ],
    ["unrelated previous topic", { current_topic: "facility" }],
  ])("treats 20公斤狗 as informational for %s", async (_label, context) => {
    const before = getConversationContextForStorage(context);
    const result = await resolve("20公斤狗", context);

    expect(result.plan.dialogue_goal_plan.lane).toBe("informational");
    expect(result.result.operations).toEqual([]);
    expect(result.context).toEqual(before);
    expect(result.changed).toBe(false);
  });

  it("lets an active pending add consume the same fragment", async () => {
    const pending = await resolve("再加一隻狗", activeQuote(), "pending-add");
    const completed = await resolve(
      "20公斤狗",
      pending.context,
      "pending-add-answer"
    );

    expect(pending.plan.slot_fill_transaction.status).toBe("created");
    expect(completed.plan.slot_fill_transaction.status).toBe("completed");
    expect(completed.plan.dialogue_goal_plan.lane).toBe("transactional");
    expect(completed.context.pet_weights_kg).toEqual([22, 20]);
  });

  it("lets an active pending replace consume the same fragment", async () => {
    const context = activeQuote({
      pending_interaction: {
        type: "slot_fill",
        action: "resolve_slot_fill",
        transaction_id: "slot-fill:pending-replace",
        partial_operation: {
          operation: "replace",
          entity: "pet",
          candidate_entities: ["pet"],
          candidate_operations: ["replace"],
          count: 1,
          pet_type: "dog",
          weights_kg: [],
          target_pet: 0,
          missing_slots: ["weights_kg"],
          filled_slots: [
            "operation",
            "entity",
            "count",
            "pet_type",
            "target_pet",
          ],
        },
        provenance: [],
        proposed_values: {},
        required_response_type: "slot_fill",
        required_fields: ["pet_weights_kg"],
        resume_action: "request_quote",
        scenario_id: "goal-matrix",
        context_version: 1,
        asked_turn_id: "pending-replace",
        expires_after_turns: 1,
        created_at: nowIso,
        expires_at: "2026-09-07T04:30:00.000Z",
      },
    });
    const completed = await resolve(
      "20公斤狗",
      context,
      "pending-replace-answer"
    );

    expect(completed.plan.slot_fill_transaction.status).toBe("completed");
    expect(completed.result.operations[0].operation).toBe("replace");
    expect(completed.context.pet_weights_kg).toEqual([20]);
  });

  it.each([
    ["explicit add", "再加一隻20公斤狗", [22, 20]],
    ["explicit replace", "把原本狗狗改成20公斤", [20]],
  ])(
    "executes %s without confusing it with information",
    async (_label, message, weights) => {
      const result = await resolve(message, activeQuote());

      expect(result.plan.dialogue_goal_plan.lane).toBe("transactional");
      expect(result.result.operations).toHaveLength(1);
      expect(result.context.pet_weights_kg).toEqual(weights);
    }
  );
});
