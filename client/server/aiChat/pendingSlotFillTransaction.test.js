import { describe, expect, it } from "vitest";
import { resolveStructuredBookingTurnCandidatePipeline } from "./structuredBookingTurnCandidates.js";

const nowIso = "2026-10-31T04:00:00.000Z";
const dateInfo = { currentDate: "2026-10-31", timeZone: "Asia/Taipei" };

function baseContext(overrides = {}) {
  return {
    active_intent: "pricing",
    current_topic: "booking_price",
    stay_type: "villa",
    check_in: "2026-11-01",
    check_out: "2026-11-02",
    stay_nights: 1,
    adult_count: 1,
    child_count: 0,
    infant_count: 0,
    pet_count: 1,
    pet_type: "dog",
    pet_weights_kg: [22],
    dog_under_10kg_count: 0,
    dog_10_to_20kg_count: 0,
    dog_over_20kg_count: 1,
    breakfast_count: 0,
    quote_scenario: {
      scenario_id: "scenario-slot-fill",
      context_version: 2,
    },
    ...overrides,
  };
}

async function runTurn(context, message, sourceMessageId, at = nowIso) {
  return resolveStructuredBookingTurnCandidatePipeline({
    mode: "active",
    message,
    previousContext: context,
    legacyContext: context,
    nowIso: at,
    sourceMessageId,
    dateInfo,
    previousTopic: "booking_price",
  });
}

async function createGenericPending(context, message, id) {
  const resolution = await runTurn(context, message, id);
  expect(resolution.context.pending_interaction).toMatchObject({
    type: "slot_fill",
    transaction_id: `slot-fill:${id}`,
    partial_operation: {
      entity: null,
      count: 1,
      missing_slots: ["entity"],
    },
    scenario_id: context.quote_scenario.scenario_id,
    context_version: context.quote_scenario.context_version,
    asked_turn_id: id,
    expires_after_turns: 1,
  });
  return resolution;
}

describe("pending slot-fill transactions", () => {
  it("persists the partial AST without applying it", async () => {
    const before = baseContext();
    const resolution = await createGenericPending(before, "再加一個", "add-pending");

    expect(resolution.context).toMatchObject({
      adult_count: 1,
      child_count: 0,
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: {
        resume_action: "request_quote",
        partial_operation: {
          operation: "add",
          candidate_entities: ["adult", "child", "pet"],
          filled_slots: ["operation", "count"],
        },
      },
    });
    expect(resolution.reduction.applied).toBe(false);
  });

  it.each([
    ["成人", { adult_count: 2, child_count: 0, pet_weights_kg: [22] }],
    ["一位小孩", { adult_count: 1, child_count: 1, pet_weights_kg: [22] }],
    ["20公斤狗", { adult_count: 1, child_count: 0, pet_count: 2, pet_weights_kg: [22, 20] }],
  ])("inherits add/count when the missing entity is answered by %s", async (
    answer,
    expected,
  ) => {
    const pending = await createGenericPending(
      baseContext(),
      "再加一個",
      `add-${answer}`,
    );
    const completed = await runTurn(
      pending.context,
      answer,
      `answer-${answer}`,
    );

    expect(completed.plan.slot_fill_transaction.status).toBe("completed");
    expect(completed.result.operations[0]).toMatchObject({ operation: "add" });
    expect(completed.context).toMatchObject({
      ...expected,
      pending_interaction: null,
      quote_scenario: {
        last_applied_transaction_id:
          pending.context.pending_interaction.transaction_id,
        last_applied_turn_id: `answer-${answer}`,
      },
    });
  });

  it("waits for a pet weight before atomically applying an add", async () => {
    const before = baseContext();
    const pending = await runTurn(before, "再加一隻狗", "add-dog");
    expect(pending.context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: {
        partial_operation: {
          operation: "add",
          entity: "pet",
          count: 1,
          missing_slots: ["weights_kg"],
        },
      },
    });

    const completed = await runTurn(pending.context, "20公斤", "dog-weight");
    expect(completed.context).toMatchObject({
      pet_count: 2,
      pet_weights_kg: [22, 20],
      pending_interaction: null,
    });
  });

  it.each([
    ["改一個", "replace", "成人", { adult_count: 1, pet_weights_kg: [22] }],
    ["不要一個", "remove", "狗狗", { adult_count: 3, pet_count: 0, pet_weights_kg: [] }],
  ])("preserves %s semantics across an entity follow-up", async (
    utterance,
    operation,
    answer,
    expected,
  ) => {
    const pending = await createGenericPending(
      baseContext({ adult_count: 3 }),
      utterance,
      `${operation}-pending`,
    );
    expect(pending.context.pending_interaction.partial_operation.operation).toBe(
      operation,
    );

    const completed = await runTurn(
      pending.context,
      answer,
      `${operation}-answer`,
    );
    expect(completed.result.operations[0].operation).toBe(operation);
    expect(completed.context).toMatchObject(expected);
  });

  it("cancels the pending transaction for a complete new snapshot", async () => {
    const pending = await createGenericPending(baseContext(), "再加一個", "old-add");
    const snapshot = await runTurn(
      pending.context,
      "2026年11月7日，12位成人包棟多少？",
      "new-snapshot",
    );

    expect(snapshot.plan.slot_fill_transaction.status).toBe(
      "cancelled_by_snapshot",
    );
    expect(snapshot.context).toMatchObject({
      check_in: "2026-11-07",
      check_out: "2026-11-08",
      adult_count: 12,
      pet_count: 0,
      pet_weights_kg: [],
      pending_interaction: null,
    });
  });

  it("does not consume a pending transaction for an unrelated policy question", async () => {
    const pending = await createGenericPending(baseContext(), "再加一個", "policy-add");
    const policy = await runTurn(pending.context, "可以帶狗嗎？", "policy-question");

    expect(policy.plan.slot_fill_transaction.status).toBe("ignored_policy");
    expect(policy.context.pending_interaction).toEqual(
      pending.context.pending_interaction,
    );
    expect(policy.context.pet_weights_kg).toEqual([22]);
  });

  it("expires after one unanswered non-policy turn", async () => {
    const pending = await createGenericPending(
      baseContext(),
      "再加一個",
      "unanswered-add",
    );
    const stale = await runTurn(pending.context, "謝謝", "unanswered-turn");

    expect(stale.plan.slot_fill_transaction.status).toBe("stale");
    expect(stale.reduction.applied).toBe(false);
    expect(stale.context).toMatchObject({
      adult_count: 1,
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: null,
    });
  });

  it("expires by timestamp without applying the late answer", async () => {
    const pending = await createGenericPending(
      baseContext(),
      "再加一個",
      "timed-add",
    );
    const stale = await runTurn(
      pending.context,
      "20公斤狗",
      "late-answer",
      "2026-10-31T04:31:00.000Z",
    );

    expect(stale.plan.slot_fill_transaction.status).toBe("stale");
    expect(stale.reduction.applied).toBe(false);
    expect(stale.context.pet_weights_kg).toEqual([22]);
  });

  it("clears a stale scenario-bound transaction without mutation", async () => {
    const pending = await createGenericPending(baseContext(), "再加一個", "stale-add");
    const staleContext = {
      ...pending.context,
      quote_scenario: {
        ...pending.context.quote_scenario,
        context_version: pending.context.quote_scenario.context_version + 1,
      },
    };
    const stale = await runTurn(staleContext, "20公斤狗", "stale-answer");

    expect(stale.plan.slot_fill_transaction.status).toBe("stale");
    expect(stale.reduction.applied).toBe(false);
    expect(stale.context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: null,
    });
  });

  it("blocks a transaction already marked as applied", async () => {
    const pending = await createGenericPending(baseContext(), "再加一個", "duplicate-add");
    const duplicateContext = {
      ...pending.context,
      quote_scenario: {
        ...pending.context.quote_scenario,
        last_applied_transaction_id:
          pending.context.pending_interaction.transaction_id,
      },
    };
    const duplicate = await runTurn(
      duplicateContext,
      "20公斤狗",
      "duplicate-answer",
    );

    expect(duplicate.plan.slot_fill_transaction.status).toBe("duplicate");
    expect(duplicate.reduction.applied).toBe(false);
    expect(duplicate.context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
      pending_interaction: null,
    });
  });

  it("asks which existing pet to replace when multiple pets exist", async () => {
    const context = baseContext({
      pet_count: 2,
      pet_weights_kg: [22, 10],
      dog_under_10kg_count: 1,
      dog_over_20kg_count: 1,
    });
    const resolution = await runTurn(context, "改成20公斤", "replace-weight");

    expect(resolution.plan.slot_fill_transaction.status).toBe("created");
    expect(resolution.context).toMatchObject({
      pet_count: 2,
      pet_weights_kg: [22, 10],
      pending_interaction: {
        partial_operation: {
          operation: "replace",
          entity: "pet",
          weights_kg: [20],
          missing_slots: ["target_pet"],
        },
      },
    });
  });

  it("replaces only the selected pet after the target slot is filled", async () => {
    const context = baseContext({
      pet_count: 2,
      pet_weights_kg: [22, 10],
      dog_under_10kg_count: 1,
      dog_over_20kg_count: 1,
    });
    const pending = await runTurn(context, "改成20公斤", "target-pending");
    const completed = await runTurn(
      pending.context,
      "第一隻",
      "target-answer",
    );

    expect(completed.plan.slot_fill_transaction.status).toBe("completed");
    expect(completed.result.operations[0]).toMatchObject({
      operation: "replace",
      entity: "pet",
      count: 1,
      weights_kg: [20],
      target_pet: 0,
    });
    expect(completed.context).toMatchObject({
      pet_count: 2,
      pet_weights_kg: [20, 10],
      dog_under_10kg_count: 1,
      dog_10_to_20kg_count: 1,
      dog_over_20kg_count: 0,
      pending_interaction: null,
    });
  });

  it("safely clarifies a pet weight phrase when no transaction is pending", async () => {
    const resolution = await runTurn(baseContext(), "20公斤狗", "no-pending");

    expect(resolution.plan.slot_fill_transaction.status).toBe("created");
    expect(resolution.result.operations).toEqual([]);
    expect(resolution.result.ambiguities[0].question).toBe(
      "請問是要新增一隻20公斤狗狗，還是修改原有狗狗的體重呢？",
    );
    expect(resolution.context).toMatchObject({
      pet_count: 1,
      pet_weights_kg: [22],
    });
  });

  it("preserves duplicate weights for distinct pets", async () => {
    const pending = await runTurn(baseContext(), "再加一隻狗", "same-weight-add");
    const completed = await runTurn(
      pending.context,
      "22公斤",
      "same-weight-answer",
    );

    expect(completed.context).toMatchObject({
      pet_count: 2,
      pet_weights_kg: [22, 22],
      dog_over_20kg_count: 2,
    });
  });
});
