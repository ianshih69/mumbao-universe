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
        weekday: { 10: 25000, 18: 35000 },
        friday: { 10: 32000, 18: 42000 },
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
      action_type: "update_quote",
      structured_provider_call_count: 0,
      final_result_category: "reprice_after_context_change",
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
