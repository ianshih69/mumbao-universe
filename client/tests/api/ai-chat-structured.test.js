import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aiChatHandler from "../../api/ai-chat.js";

const sessionId = "00000000-0000-4000-8000-000000000777";
const ruleSet = {
  id: "00000000-0000-4000-8000-000000000110",
  name: "production-handler-pricing",
  effective_from: "2026-11-01",
  effective_to: "2027-02-01",
  deposit_rate: 0.3,
  is_active: true,
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createHandlerHarness(initialContext = {}) {
  let sequence = 0;
  let session = {
    id: sessionId,
    visitor_id: "structured-handler-visitor",
    auth_user_id: null,
    status: "ai_active",
    support_status: "ai_replying",
    should_ai_reply: true,
    unread_count: 0,
    conversation_context: initialContext,
    created_at: "2026-09-06T00:00:00.000Z",
    updated_at: "2026-09-06T00:00:00.000Z",
  };
  const messages = [];
  let nonFixtureCalls = 0;

  const fetchMock = vi.fn(async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.origin !== "https://supabase.test") {
      nonFixtureCalls += 1;
      throw new Error(`unexpected_external_request:${url.origin}`);
    }

    const method = String(options.method || "GET").toUpperCase();
    const table = url.pathname.replace(/^\/rest\/v1\/?/, "");
    if (table === "chat_sessions") {
      if (method === "PATCH") {
        session = { ...session, ...JSON.parse(options.body || "{}") };
      }
      return jsonResponse([session]);
    }

    if (table === "chat_messages") {
      if (method === "GET") return jsonResponse([...messages].reverse());
      if (method === "POST") {
        sequence += 1;
        const row = {
          id: `message-${sequence}`,
          ...JSON.parse(options.body || "{}"),
          created_at: `2026-09-06T00:00:${String(sequence).padStart(2, "0")}.000Z`,
        };
        messages.push(row);
        return jsonResponse([row]);
      }
    }

    if (table === "booking_price_rule_sets") return jsonResponse([ruleSet]);
    if (table === "booking_special_dates") return jsonResponse([]);
    if (table === "booking_package_rates") {
      const guests = Number(
        String(url.searchParams.get("guest_count") || "").replace(/^eq\./, ""),
      );
      const dayType = String(
        url.searchParams.get("day_type") || "",
      ).replace(/^eq\./, "");
      const nightlyPrice = {
        weekday: {
          10: 25000,
          11: 26250,
          12: 27500,
          13: 28750,
          14: 30000,
          15: 31250,
          16: 32500,
          17: 33750,
          18: 35000,
        },
        friday: { 10: 32000, 12: 34500, 18: 42000 },
        holiday: { 10: 39000, 18: 49000 },
      }[dayType]?.[guests];
      return jsonResponse(nightlyPrice == null
        ? []
        : [{
            id: `${guests}-${dayType}`,
            rule_set_id: ruleSet.id,
            guest_count: guests,
            day_type: dayType,
            nightly_price: nightlyPrice,
            is_active: true,
          }]);
    }

    throw new Error(`unexpected_fixture_request:${method}:${table}`);
  });

  async function send(message, incomingMessageId = `incoming-${sequence + 1}`) {
    let payload = null;
    const req = {
      method: "POST",
      query: { action: "message" },
      headers: {},
      body: {
        visitor_id: session.visitor_id,
        session_id: session.id,
        incoming_message_id: incomingMessageId,
        message,
      },
    };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        payload = JSON.parse(body);
      },
    };

    await aiChatHandler(req, res);
    return { statusCode: res.statusCode, payload };
  }

  return {
    fetchMock,
    getMessages: () => messages,
    getNonFixtureCalls: () => nonFixtureCalls,
    getSession: () => session,
    send,
  };
}

const priorTenAdultContext = {
  active_intent: "pricing",
  current_topic: "booking_price",
  stay_type: "villa",
  guest_count: 10,
  adult_count: 10,
  child_count: 0,
  infant_count: 0,
  pet_count: 0,
  pet_type: null,
};
const completeRequest =
  "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚包棟多少？";

describe("production AI chat structured authority", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("AI_MODE", "cloud_only");
    vi.stubEnv("AI_SEMANTIC_ROUTER_MODE", "legacy");
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses structured active as the sole booking authority through the production handler", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness(priorTenAdultContext);
    vi.stubGlobal("fetch", harness.fetchMock);

    const { statusCode, payload } = await harness.send(completeRequest);

    expect(statusCode).toBe(200);
    expect(payload.answer).toContain("TWD 25,000");
    expect(payload.answer).toContain("TWD 1,200");
    expect(payload.answer).toContain("TWD 26,200");
    expect(payload.answer).toContain("押金 TWD 3,000");
    expect(payload.answer).not.toContain("新的入住人數");
    expect(payload.metadata).toMatchObject({
      structured_mode: "active",
      authority_path: "active",
      structured_reducer_applied: true,
      legacy_context_mutation_invoked: false,
      legacy_guest_adjustment_formatter_call_count: 0,
      action_type: "request_quote",
      structured_provider_call_count: 0,
      final_result_category: "grounded_reply",
    });
    expect(payload.metadata.structured_candidate_count).toBeGreaterThan(0);
    expect(harness.getSession().conversation_context).toMatchObject({
      adult_count: 10,
      pet_count: 1,
      pet_weights_kg: [22],
      dog_over_20kg_count: 1,
    });
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it("preserves the quote context across two production-handler turns", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    const first = await harness.send(
      "2026年11月1日，10位成人，住一晚包棟多少？",
      "incoming-first",
    );
    expect(first.payload.answer).toContain("TWD 25,000");

    const second = await harness.send(
      "再加一隻22公斤狗狗呢？",
      "incoming-second",
    );
    expect(second.payload.answer).toContain("TWD 26,200");
    expect(second.payload.answer).not.toContain("新的入住人數");
    expect(second.payload.metadata).toMatchObject({
      authority_path: "active",
      legacy_context_mutation_invoked: false,
      legacy_guest_adjustment_formatter_call_count: 0,
      structured_provider_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 10,
      pet_count: 1,
      pet_weights_kg: [22],
    });
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it("completes an ambiguous add as one pending slot-fill transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T16:00:00.000Z"));
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    const first = await harness.send(
      "明天1人包棟多少錢",
      "slot-fill-turn-1",
    );
    expect(first.payload.answer).toBe("1位成人包棟一晚 TWD 25,000。");

    const second = await harness.send(
      "再加一隻22公斤狗狗呢？",
      "slot-fill-turn-2",
    );
    expect(second.payload.answer).toBe(
      "包棟 TWD 25,000，加狗狗 TWD 1,200，合計 TWD 26,200；另收可退寵物押金 TWD 3,000。",
    );

    const beforePending = structuredClone(
      harness.getSession().conversation_context,
    );
    const third = await harness.send("再加一個", "slot-fill-turn-3");
    expect(third.payload.answer).toBe(
      "請問是增加一位成人、一位兒童，還是一隻狗狗呢？",
    );
    expect(harness.getSession().conversation_context).toMatchObject({
      adult_count: 1,
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: {
        type: "slot_fill",
        transaction_id: expect.any(String),
        partial_operation: {
          operation: "add",
          entity: null,
          candidate_entities: ["adult", "child", "pet"],
          count: 1,
          filled_slots: ["operation", "count"],
          missing_slots: ["entity"],
        },
        resume_action: "request_quote",
        scenario_id: beforePending.quote_scenario.scenario_id,
        context_version: beforePending.quote_scenario.context_version,
        asked_turn_id: "slot-fill-turn-3",
        expires_after_turns: 1,
      },
    });

    const pendingTransactionId =
      harness.getSession().conversation_context.pending_interaction.transaction_id;
    const fourth = await harness.send("20公斤狗", "slot-fill-turn-4");
    expect(fourth.payload.answer).toBe(
      "再加一隻20公斤狗後，兩隻狗狗住宿費共 TWD 2,000，合計 TWD 27,000；另收可退寵物押金 TWD 3,000。",
    );
    expect(fourth.payload.metadata).toMatchObject({
      pending_slot_fill_existed: true,
      pending_slot_fill_consumed: true,
      pending_transaction_id: pendingTransactionId,
      structured_provider_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      adult_count: 1,
      pet_count: 2,
      pet_weights_kg: [22, 20],
      dog_10_to_20kg_count: 1,
      dog_over_20kg_count: 1,
      pending_interaction: null,
      quote_scenario: {
        last_applied_transaction_id: pendingTransactionId,
        last_applied_turn_id: "slot-fill-turn-4",
      },
    });
    const completedContext = structuredClone(
      harness.getSession().conversation_context,
    );
    const replay = await harness.send("20公斤狗", "slot-fill-turn-4");
    expect(replay.payload.answer).toBe(fourth.payload.answer);
    expect(replay.payload.metadata).toMatchObject({
      deduped_incoming_message: true,
      model_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toEqual(completedContext);
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it("answers a contextless pet fragment without mutating booking state", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    const result = await harness.send("20公斤狗", "contextless-pet-20kg");

    expect(result.statusCode).toBe(200);
    expect(result.payload.answer).toBe(
      "可以入住，20公斤狗狗每隻每晚 TWD 800；另收每棟可退寵物押金 TWD 3,000。",
    );
    expect(result.payload.answer).not.toContain("沒有確認過的資料");
    expect(result.payload.answer).not.toContain("幫你記錄");
    expect(result.payload.answer).not.toContain("管家協助確認");
    expect(result.payload.metadata).toMatchObject({
      dialogue_lane: "informational",
      dialogue_primary_goal: "pet_fee_lookup",
      response_authority: "dialogue_goal_planner",
      structured_provider_call_count: 0,
      model_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toEqual({});
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it("keeps an active quote unchanged for an operation-free pet fragment", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const initialContext = {
      ...priorTenAdultContext,
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      pet_count: 1,
      pet_type: "dog",
      pet_weights_kg: [22],
      dog_under_10kg_count: 0,
      dog_10_to_20kg_count: 0,
      dog_over_20kg_count: 1,
    };
    const harness = createHandlerHarness(structuredClone(initialContext));
    vi.stubGlobal("fetch", harness.fetchMock);

    const result = await harness.send("20公斤狗", "active-context-pet-fragment");

    expect(result.statusCode).toBe(200);
    expect(result.payload.answer).toBe(
      "可以入住，20公斤狗狗每隻每晚 TWD 800；另收每棟可退寵物押金 TWD 3,000。",
    );
    expect(result.payload.metadata).toMatchObject({
      dialogue_lane: "informational",
      response_authority: "dialogue_goal_planner",
      action_type: "none",
      model_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toEqual(initialContext);
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it.each([
    ["22公斤狗", ["可以入住", "TWD 1,200", "押金 TWD 3,000"]],
    ["10公斤狗", ["可以入住", "TWD 500", "押金 TWD 3,000"]],
    ["早餐", ["TWD 250", "08:30"]],
    ["退房", ["11:00 前"]],
    ["有泳池", ["目前沒有提供泳池"]],
    ["12人週五", ["12位成人", "TWD 34,500"]],
    [
      "兩隻狗，一隻8公斤一隻15公斤",
      ["可以入住", "TWD 1,300", "押金 TWD 3,000"],
    ],
    ["20公斤狗住兩晚", ["TWD 1,560", "押金 TWD 3,000", "完整包棟價格"]],
  ])("answers contextless domain fragment %s without fallback or mutation", async (
    message,
    expectedParts,
  ) => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    const result = await harness.send(
      message,
      `contextless-${Buffer.from(message).toString("hex")}`,
    );

    expect(result.statusCode).toBe(200);
    for (const expected of expectedParts) {
      expect(result.payload.answer).toContain(expected);
    }
    expect(result.payload.answer).not.toContain("目前還沒有確認過的慢慢蒔光資料");
    expect(result.payload.answer).not.toContain("幫你記錄");
    expect(result.payload.answer).not.toContain("管家協助確認");
    expect(result.payload.metadata).toMatchObject({
      dialogue_lane: "informational",
      response_authority: "dialogue_goal_planner",
      structured_provider_call_count: 0,
      model_call_count: 0,
    });
    expect(harness.getSession().conversation_context).toEqual({});
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it("starts a new quote snapshot for the staged three-turn screenshot", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    const first = await harness.send(completeRequest, "incoming-snapshot-first");
    expect(first.payload.answer).toBe(
      "包棟 TWD 25,000，加狗狗 TWD 1,200，合計 TWD 26,200；另收可退寵物押金 TWD 3,000。",
    );

    const second = await harness.send(
      "2026年11月1日，10位成人，住一晚包棟多少？",
      "incoming-snapshot-second",
    );
    expect(second.payload.answer).toBe("10位成人包棟一晚 TWD 25,000。");
    expect(second.payload.answer).not.toContain("退房嗎");
    expect(second.payload.answer).not.toContain("要調整哪項");
    expect(second.payload.metadata).toMatchObject({
      turn_type: "quote_snapshot",
      quote_scope: "snapshot",
      derived_checkout_used: true,
      inherited_optional_addons_count: 0,
      final_response_kind: "quote_only",
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 10,
      child_count: 0,
      infant_count: 0,
      pet_count: 0,
      pet_weights_kg: [],
      breakfast_count: 0,
      pending_interaction: null,
    });

    const beforeConfirmation = harness.getSession().conversation_context;
    const third = await harness.send("對", "incoming-snapshot-third");
    expect(third.payload.answer).toBe(
      "目前沒有待確認的內容，請告訴我想確認哪一項。",
    );
    expect(third.payload.answer).not.toContain("要調整哪項訂房資料");
    expect(harness.getSession().conversation_context).toEqual(beforeConfirmation);
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it.each(["對", "是", "沒錯", "正確", "可以", "好", "嗯", "就這樣"])(
    "consumes a scenario-bound confirmation and resumes the quote for %s",
    async (confirmation) => {
      vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
      const harness = createHandlerHarness({
        active_intent: "pricing",
        current_topic: "booking_price",
        stay_type: "villa",
        adult_count: 10,
        child_count: 0,
        infant_count: 0,
        pet_count: 0,
        breakfast_count: 0,
        quote_scenario: {
          scenario_id: "scenario-confirm-date",
          context_version: 3,
        },
        pending_interaction: {
          action: "confirm_quote_dates",
          proposed_values: {
            check_in: "2026-11-01",
            check_out: "2026-11-02",
            stay_nights: 1,
          },
          required_response_type: "confirmation",
          resume_action: "request_quote",
          scenario_id: "scenario-confirm-date",
          context_version: 3,
          asked_turn_id: "assistant-confirm-date",
          expires_after_turns: 1,
          source_assistant_message_id: "assistant-confirm-date",
          created_at: "2026-09-06T00:00:00.000Z",
          expires_at: "2027-09-06T01:00:00.000Z",
        },
      });
      vi.stubGlobal("fetch", harness.fetchMock);

      const result = await harness.send(
        confirmation,
        `incoming-confirm-${confirmation}`,
      );

      expect(result.payload.answer).toBe("10位成人包棟一晚 TWD 25,000。");
      expect(result.payload.metadata).toMatchObject({
        turn_type: "confirmation",
        pending_confirmation_existed: true,
        pending_confirmation_consumed: true,
        final_response_kind: "quote_only",
      });
      expect(harness.getSession().conversation_context).toMatchObject({
        check_in: "2026-11-01",
        check_out: "2026-11-02",
        stay_nights: 1,
        pending_interaction: null,
      });
      expect(harness.getNonFixtureCalls()).toBe(0);
    },
  );

  it("enforces the complete snapshot and incremental patch matrix", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness();
    vi.stubGlobal("fetch", harness.fetchMock);

    await harness.send(completeRequest, "matrix-snapshot-dog-1");
    const firstScenario = structuredClone(
      harness.getSession().conversation_context.quote_scenario,
    );
    expect(harness.getSession().conversation_context).toMatchObject({
      adult_count: 10,
      pet_count: 1,
      pet_weights_kg: [22],
    });

    await harness.send(completeRequest, "matrix-snapshot-dog-repeat");
    const repeatedScenario = structuredClone(
      harness.getSession().conversation_context.quote_scenario,
    );
    expect(harness.getSession().conversation_context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
    });
    expect(repeatedScenario.scenario_id).not.toBe(firstScenario.scenario_id);
    expect(repeatedScenario.context_version).toBe(1);

    const addPet = await harness.send(
      "再加一隻22公斤狗狗呢？",
      "matrix-patch-add-dog",
    );
    expect(addPet.payload.answer).toContain("TWD 27,400");
    expect(addPet.payload.metadata).toMatchObject({
      turn_type: "quote_patch",
      quote_scope: "patch",
      quote_scenario_version: 2,
      inherited_optional_addons_count: 1,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      pet_count: 2,
      pet_weights_kg: [22, 22],
    });
    expect(
      harness.getSession().conversation_context.quote_scenario.scenario_id,
    ).toBe(repeatedScenario.scenario_id);

    const clearPets = await harness.send(
      "不要狗狗了",
      "matrix-patch-clear-dogs",
    );
    expect(clearPets.payload.metadata.turn_type).toBe("correction");
    expect(harness.getSession().conversation_context).toMatchObject({
      pet_count: 0,
      pet_type: null,
      pet_weights_kg: [],
    });

    await harness.send(completeRequest, "matrix-new-dog-snapshot");
    const addonScenarioId =
      harness.getSession().conversation_context.quote_scenario.scenario_id;
    const addBreakfast = await harness.send(
      "同樣條件再加早餐2份",
      "matrix-patch-breakfast",
    );
    expect(addBreakfast.payload.answer).toContain("TWD 26,700");
    expect(addBreakfast.payload.metadata).toMatchObject({
      turn_type: "quote_patch",
      quote_scope: "patch",
      inherited_optional_addons_count: 1,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
      breakfast_count: 2,
    });
    expect(
      harness.getSession().conversation_context.quote_scenario.scenario_id,
    ).toBe(addonScenarioId);

    const freshSnapshot = await harness.send(
      "2026/11/1，10成人，一晚包棟多少？",
      "matrix-fresh-snapshot",
    );
    expect(freshSnapshot.payload.answer).toBe("10位成人包棟一晚 TWD 25,000。");
    expect(freshSnapshot.payload.metadata).toMatchObject({
      turn_type: "quote_snapshot",
      quote_scope: "snapshot",
      quote_scenario_version: 1,
      inherited_optional_addons_count: 0,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      adult_count: 10,
      pet_count: 0,
      breakfast_count: 0,
    });

    const replaceAdults = await harness.send(
      "改成11位成人",
      "matrix-patch-replace-adults",
    );
    expect(replaceAdults.payload.answer).toBe("11位成人包棟一晚 TWD 26,250。");
    expect(replaceAdults.payload.metadata.turn_type).toBe("correction");
    expect(harness.getSession().conversation_context.adult_count).toBe(11);

    const addAdult = await harness.send(
      "再加一位成人",
      "matrix-patch-add-adult",
    );
    expect(addAdult.payload.answer).toBe("12位成人包棟一晚 TWD 27,500。");
    expect(addAdult.payload.metadata.turn_type).toBe("quote_patch");
    expect(harness.getSession().conversation_context.adult_count).toBe(12);
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it.each([
    ["12人多少？", ["入住日期", "晚數"], ["成人與4～12歲兒童各有幾位"]],
    ["11月1日，10人多少？", ["請問是幾年的11月1日"], ["住宿晚數"]],
    [
      "10人一隻狗包棟多少？",
      ["入住日期或日期類型", "住宿晚數", "每隻狗狗體重"],
      ["想包棟或訂單間", "成人與4～12歲兒童各有幾位"],
    ],
    ["再加一個", ["增加一位成人、一位兒童，還是一隻狗狗"], []],
  ])(
    "asks only necessary clarification fields for %s",
    async (message, included, excluded) => {
      vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
      const harness = createHandlerHarness();
      vi.stubGlobal("fetch", harness.fetchMock);

      const result = await harness.send(message, `clarification-${message}`);

      for (const text of included) expect(result.payload.answer).toContain(text);
      for (const text of excluded) expect(result.payload.answer).not.toContain(text);
      expect(result.payload.metadata.structured_provider_call_count).toBe(0);
      expect(harness.getNonFixtureCalls()).toBe(0);
    },
  );

  it.each(["不對", "不是這天"])(
    "rejects a current pending date proposal without applying it for %s",
    async (rejection) => {
      vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
      const harness = createHandlerHarness({
        active_intent: "pricing",
        current_topic: "booking_price",
        stay_type: "villa",
        adult_count: 10,
        quote_scenario: {
          scenario_id: "scenario-reject-date",
          context_version: 2,
        },
        pending_interaction: {
          action: "confirm_quote_dates",
          proposed_values: {
            check_in: "2026-11-01",
            check_out: "2026-11-02",
            stay_nights: 1,
          },
          required_response_type: "confirmation",
          resume_action: "request_quote",
          scenario_id: "scenario-reject-date",
          context_version: 2,
          asked_turn_id: "assistant-reject-date",
          expires_after_turns: 1,
          source_assistant_message_id: "assistant-reject-date",
          created_at: "2026-09-06T00:00:00.000Z",
          expires_at: "2027-09-06T01:00:00.000Z",
        },
      });
      vi.stubGlobal("fetch", harness.fetchMock);

      const result = await harness.send(rejection, `reject-${rejection}`);

      expect(result.payload.answer).toContain("入住");
      expect(result.payload.metadata.pending_confirmation_consumed).toBe(false);
      expect(harness.getSession().conversation_context).toMatchObject({
        check_in: null,
        check_out: null,
        pending_interaction: {
          action: "collect_quote_fields",
          proposed_values: {},
          required_response_type: "fields",
          scenario_id: "scenario-reject-date",
          context_version: 2,
        },
      });
      expect(harness.getNonFixtureCalls()).toBe(0);
    },
  );

  it("clears a stale scenario-bound confirmation without applying its proposal", async () => {
    vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
    const harness = createHandlerHarness({
      active_intent: "pricing",
      current_topic: "booking_price",
      stay_type: "villa",
      adult_count: 10,
      quote_scenario: {
        scenario_id: "scenario-current",
        context_version: 4,
      },
      pending_interaction: {
        action: "confirm_quote_dates",
        proposed_values: {
          check_in: "2026-11-01",
          check_out: "2026-11-02",
          stay_nights: 1,
        },
        required_response_type: "confirmation",
        resume_action: "request_quote",
        scenario_id: "scenario-current",
        context_version: 3,
        asked_turn_id: "assistant-stale-date",
        expires_after_turns: 1,
        source_assistant_message_id: "assistant-stale-date",
        created_at: "2026-09-06T00:00:00.000Z",
        expires_at: "2027-09-06T01:00:00.000Z",
      },
    });
    vi.stubGlobal("fetch", harness.fetchMock);

    const result = await harness.send("對", "confirm-stale-date");

    expect(result.payload.answer).toBe("剛才的確認已失效，請重新提供要確認的資料。");
    expect(result.payload.metadata).toMatchObject({
      pending_confirmation_existed: true,
      pending_confirmation_consumed: false,
    });
    expect(harness.getSession().conversation_context).toMatchObject({
      check_in: null,
      check_out: null,
      pending_interaction: null,
    });
    expect(harness.getNonFixtureCalls()).toBe(0);
  });

  it.each([
    ["legacy", "legacy", true, true],
    ["shadow", "shadow", true, true],
    ["active", "active", false, false],
    [undefined, "legacy", true, true],
    ["invalid", "legacy", true, true],
  ])(
    "enforces the %s authority mode at the production handler",
    async (configuredMode, expectedMode, legacyMutationInvoked, expectsLegacyReply) => {
      if (configuredMode === undefined) {
        vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "");
      } else {
        vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", configuredMode);
      }
      const harness = createHandlerHarness(priorTenAdultContext);
      vi.stubGlobal("fetch", harness.fetchMock);

      const { payload } = await harness.send(completeRequest);

      expect(payload.metadata.structured_mode).toBe(expectedMode);
      expect(payload.metadata.legacy_context_mutation_invoked).toBe(
        legacyMutationInvoked,
      );
      expect(payload.metadata.structured_provider_call_count).toBe(0);
      if (expectsLegacyReply) {
        expect(payload.answer).toContain("新的入住人數");
        expect(
          payload.metadata.legacy_guest_adjustment_formatter_call_count,
        ).toBe(1);
      } else {
        expect(payload.answer).toContain("TWD 26,200");
        expect(
          payload.metadata.legacy_guest_adjustment_formatter_call_count,
        ).toBe(0);
      }
      expect(harness.getNonFixtureCalls()).toBe(0);
    },
  );

  it.each(["legacy", "hybrid", undefined])(
    "keeps structured active independent from semantic router mode %s",
    async (semanticMode) => {
      vi.stubEnv("AI_STRUCTURED_TURN_INTERPRETER_MODE", "active");
      vi.stubEnv("AI_SEMANTIC_ROUTER_MODE", semanticMode || "");
      const harness = createHandlerHarness(priorTenAdultContext);
      vi.stubGlobal("fetch", harness.fetchMock);

      const { payload } = await harness.send(completeRequest);

      expect(payload.answer).toContain("TWD 26,200");
      expect(payload.metadata).toMatchObject({
        structured_mode: "active",
        authority_path: "active",
        legacy_context_mutation_invoked: false,
        legacy_guest_adjustment_formatter_call_count: 0,
        structured_provider_call_count: 0,
      });
      expect(harness.getNonFixtureCalls()).toBe(0);
    },
  );
});
