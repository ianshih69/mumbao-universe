import { describe, expect, it, vi } from "vitest";
import {
  compileBookingTurnCandidates,
  extractBookingTurnSpans,
  reduceBookingContextFromCandidates,
  resolveStructuredBookingTurnCandidatePipeline,
} from "./structuredBookingTurnCandidates.js";

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

async function resolve(message, context = {}) {
  return resolveStructuredBookingTurnCandidatePipeline({
    mode: "active",
    message,
    previousContext: context,
    legacyContext: context,
    nowIso: "2026-09-06T00:00:00.000Z",
    sourceMessageId: "turn-test-001",
    dateInfo: { currentDate: "2026-09-06" },
  });
}

describe("deterministic booking span extraction", () => {
  it("extracts normalized values with exact source offsets", () => {
    const message = "２０２６／１１／１，十位成人，１隻２２ＫＧ狗，住兩晚";
    const spans = extractBookingTurnSpans(message);
    expect(spans.length).toBeGreaterThan(5);
    for (const span of spans) {
      expect(message.slice(span.start, span.end)).toBe(span.text);
    }
    expect(spans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_type: "date",
        normalized_value: "2026-11-01",
      }),
      expect.objectContaining({
        normalized_type: "adult_count",
        normalized_value: 10,
      }),
      expect.objectContaining({
        normalized_type: "pet_count",
        normalized_value: 1,
      }),
      expect.objectContaining({
        normalized_type: "pet_weight",
        normalized_value: 22,
      }),
      expect.objectContaining({
        normalized_type: "nights",
        normalized_value: 2,
      }),
    ]));
  });

  it.each([
    ["一隻22公斤狗", 1, [22]],
    ["一隻8公斤、一隻15公斤", 2, [8, 15]],
    ["兩隻狗，分別8公斤跟15公斤", 2, [8, 15]],
    ["22kg的大型犬一隻", 1, [22]],
  ])("recognizes contextless pet form %s without a model or mutation", async (message, count, weights) => {
    const resolution = await resolve(message);
    expect(resolution.classification).toBe("INFORMATIONAL");
    expect(resolution.requiresModel).toBe(false);
    expect(resolution.plan.dialogue_goal_plan).toMatchObject({
      lane: "informational",
      mutates_context: false,
      slots: {
        pet_count: count,
        pet_weights_kg: weights,
      },
    });
    expect(resolution.result.operations).toEqual([]);
    expect(resolution.context.pet_count).toBeNull();
    expect(resolution.context.pet_weights_kg).toEqual([]);
  });

  it.each([
    ["總共十位成人", "set"],
    ["再加一位成人", "add"],
    ["少一位成人", "remove"],
    ["成人改成十位", "replace"],
    ["清除日期", "clear"],
  ])("classifies generic operation cue in %s", (message, operation) => {
    expect(extractBookingTurnSpans(message)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        normalized_type: "operation_cue",
        normalized_value: operation,
      }),
    ]));
  });

  it("keeps mixed adult and pet understanding separate from transaction", async () => {
    const resolution = await resolve("十位成人和一隻22公斤狗");
    expect(resolution.plan.candidates).toEqual([]);
    expect(resolution.plan.dialogue_goal_plan).toMatchObject({
      lane: "informational",
      mutates_context: false,
      slots: {
        adult_count: 10,
        pet_count: 1,
        pet_weights_kg: [22],
      },
    });
    expect(resolution.context.adult_count).toBeNull();
    expect(resolution.context.pet_count).toBeNull();
  });
});

describe("booking candidate compiler and reducer", () => {
  it("keeps clear self-contained turns on the deterministic zero-call path", async () => {
    const cases = [
      ["2026年11月1日，10位成人住一晚多少", {}],
      ["再加一隻22公斤狗", baseContext],
      ["早餐三份", baseContext],
    ];
    for (const [message, context] of cases) {
      const resolveCandidates = vi.fn();
      const resolution = await resolveStructuredBookingTurnCandidatePipeline({
        mode: "active",
        message,
        previousContext: context,
        legacyContext: context,
        contextResolverEnabled: true,
        resolveCandidates,
        sourceMessageId: `fast-path-${message.length}`,
        dateInfo: { currentDate: "2026-09-06" },
      });
      expect(resolution.requiresModel, message).toBe(false);
      expect(resolveCandidates, message).not.toHaveBeenCalled();
    }
  });

  it("fails closed without mutating when a contextual resolver rejects", async () => {
    const resolveCandidates = vi.fn(async () => {
      throw new Error("synthetic_resolver_rejection");
    });
    const resolution = await resolveStructuredBookingTurnCandidatePipeline({
      mode: "active",
      message: "那改兩晚",
      previousContext: baseContext,
      legacyContext: baseContext,
      contextResolverEnabled: true,
      resolveCandidates,
      sourceMessageId: "rejected-contextual-turn",
      dateInfo: { currentDate: "2026-09-06" },
    });
    expect(resolveCandidates).toHaveBeenCalledTimes(1);
    expect(resolution.source).toBe("semantic_model_rejected");
    expect(resolution.reduction.applied).toBe(false);
    expect(resolution.context).toMatchObject({
      check_in: "2026-11-01",
      check_out: "2026-11-02",
      stay_nights: 1,
      adult_count: 10,
    });
  });

  it("stores no operation values directly in candidate AST", () => {
    const plan = compileBookingTurnCandidates({
      message: "再加一隻22公斤狗",
      context: {
        active_intent: "pricing",
        current_topic: "booking_price",
        quote_scenario: { scenario_id: "candidate-test", context_version: 1 },
      },
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toEqual({
      candidate_id: "cand-001-pet-add",
      selection_group: "group-001",
      operation: "add",
      entity: "pet",
      bindings: expect.any(Array),
      evidence_span_ids: expect.any(Array),
      context_refs: expect.any(Array),
    });
    for (const key of [
      "count",
      "pet_type",
      "weights_kg",
      "ages_years",
      "mode",
      "check_in",
      "check_out",
      "nights",
      "date_type",
    ]) {
      expect(plan.candidates[0]).not.toHaveProperty(key);
    }
  });

  it("derives pet-weights-07 from current-message spans with zero model calls", async () => {
    const resolveCandidates = vi.fn();
    const resolution = await resolveStructuredBookingTurnCandidatePipeline({
      mode: "active",
      message: "再加2隻狗，8公斤跟15公斤",
      previousContext: { ...baseContext, pet_count: null, pet_type: "dog" },
      legacyContext: baseContext,
      sourceMessageId: "pet-weights-07",
      resolveCandidates,
    });
    expect(resolveCandidates).not.toHaveBeenCalled();
    expect(resolution.context.pet_count).toBe(2);
    expect(resolution.context.pet_weights_kg).toEqual([8, 15]);
    expect(resolution.result.operations).toEqual([
      expect.objectContaining({ entity: "pet", count: 2, weights_kg: [8, 15] }),
    ]);
  });

  it("rejects unknown candidate IDs before mutation", () => {
    const plan = compileBookingTurnCandidates({
      message: "再加一位成人",
      context: baseContext,
    });
    expect(() => reduceBookingContextFromCandidates(
      baseContext,
      plan,
      ["cand-999-adult-add"],
    )).toThrow("structured_candidate_unknown_candidate_id");
  });

  it("records value and span/context provenance for every touched booking slot", async () => {
    const resolution = await resolve("再加一隻22公斤狗", baseContext);
    const meta = resolution.context.slot_meta;
    expect(meta.pet_count).toMatchObject({
      source: "structured_candidate",
      source_turn_id: "turn-test-001",
      value: 1,
      context_refs: ["pets.count"],
    });
    expect(meta.pet_count.evidence_span_ids.length).toBeGreaterThan(0);
    expect(meta.pet_weights_kg).toMatchObject({
      source_turn_id: "turn-test-001",
      value: [22],
    });
    expect(meta.pet_weights_kg.evidence_span_ids.length).toBeGreaterThan(0);
  });

  it("materializes the same quote state across equivalent single and multi turns", async () => {
    const single = await resolve(
      "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚多少",
      {},
    );
    const followUp = await resolve("加1隻22公斤狗狗", baseContext);
    for (const field of [
      "check_in",
      "check_out",
      "stay_nights",
      "adult_count",
      "pet_count",
      "pet_weights_kg",
      "dog_over_20kg_count",
    ]) {
      expect(followUp.context[field]).toEqual(single.context[field]);
    }
  });
});

describe("ambiguity and action/state separation", () => {
  it.each(["再加一個", "多兩個"])(
    "compiles finite candidates but safely clarifies ambiguous input %s",
    async (message) => {
      const resolveCandidates = vi.fn();
      const resolution = await resolveStructuredBookingTurnCandidatePipeline({
        mode: "active",
        message,
        previousContext: baseContext,
        legacyContext: baseContext,
        resolveCandidates,
      });
      expect(resolution.classification).toBe("SAFE_CLARIFICATION");
      expect(resolution.plan.candidates.map((candidate) => candidate.entity)).toEqual([
        "adult",
        "child",
        "pet",
      ]);
      expect(resolveCandidates).not.toHaveBeenCalled();
      expect(resolution.turn_delta.operations).toEqual([]);
      expect(resolution.reduction.changed).toBe(true);
      expect(resolution.reduction.applied).toBe(false);
      expect(resolution.context.pending_interaction).toMatchObject({
        type: "slot_fill",
        partial_operation: {
          operation: "add",
          entity: null,
          missing_slots: ["entity"],
        },
      });
    },
  );

  it("keeps a contextual availability request out of turn_delta", async () => {
    const resolution = await resolve("那這天還有房嗎", baseContext);
    expect(resolution.classification).toBe("CONTEXT_ACTION_ONLY");
    expect(resolution.requested_actions).toEqual(["request_availability"]);
    expect(resolution.turn_delta).toEqual({
      selected_candidate_ids: [],
      candidates: [],
      operations: [],
    });
    expect(resolution.result.operations).toEqual([]);
    expect(resolution.context.check_in).toBe("2026-11-01");
    expect(resolution.context.check_out).toBe("2026-11-02");
  });

  it("keeps mixed availability as an action instead of a repeated stay patch", async () => {
    const first = await resolve("2026年11月1日10位成人住一晚多少", {});
    const followUp = await resolve("那這天還有房嗎", first.context);
    expect(followUp.turn_delta.operations).toEqual([]);
    expect(followUp.requested_actions).toEqual(["request_availability"]);
    expect(followUp.context.check_in).toBe(first.context.check_in);
    expect(followUp.context.check_out).toBe(first.context.check_out);
  });
});
