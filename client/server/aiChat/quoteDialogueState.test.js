import { describe, expect, it } from "vitest";
import {
  buildQuoteScopeBaseContext,
  classifyConfirmationProtocol,
  classifyQuoteDialogueTurn,
  finalizeQuoteScenarioContext,
  getYearlessDateClarification,
  isPendingInteractionCurrent,
  normalizeQuoteSnapshotOperations,
} from "./quoteDialogueState.js";

function result({ intents = [], operations = [] } = {}) {
  return { intents, operations };
}

const completeQuoteResult = result({
  intents: ["request_quote", "update_party", "update_pet", "update_dates"],
  operations: [
    { operation: "set", entity: "adult", count: 10 },
    { operation: "add", entity: "pet", count: 1, weights_kg: [22] },
    {
      operation: "set",
      entity: "stay",
      check_in: "2026-11-01",
      nights: 1,
      mode: "villa",
    },
  ],
});

describe("quote dialogue state", () => {
  it("classifies a self-contained quote as a snapshot even when an addon clause says add", () => {
    expect(
      classifyQuoteDialogueTurn({
        message: "2026年11月1日，10位成人，加1隻22公斤狗狗，住一晚包棟多少？",
        context: { active_intent: "pricing", pet_count: 1 },
        result: completeQuoteResult,
      }),
    ).toMatchObject({
      turn_type: "quote_snapshot",
      quote_scope: "snapshot",
    });
    expect(normalizeQuoteSnapshotOperations(completeQuoteResult.operations)).toEqual(
      completeQuoteResult.operations.map((operation) => ({
        ...operation,
        operation: "set",
      })),
    );
  });

  it("classifies additive, replacement, and clear follow-ups against the active scenario", () => {
    const context = {
      active_intent: "pricing",
      quote_scenario: { scenario_id: "scenario-a", context_version: 1 },
    };
    expect(
      classifyQuoteDialogueTurn({
        message: "再加一隻狗",
        context,
        result: result({
          operations: [{ operation: "add", entity: "pet", count: 1 }],
        }),
      }).turn_type,
    ).toBe("quote_patch");
    for (const operation of ["replace", "clear"]) {
      expect(
        classifyQuoteDialogueTurn({
          message: operation === "replace" ? "改成11位成人" : "不要狗狗了",
          context,
          result: result({
            operations: [{ operation, entity: "adult", count: 11 }],
          }),
        }).turn_type,
      ).toBe("correction");
    }
  });

  it("recognizes the complete confirmation protocol without treating arbitrary text as confirmation", () => {
    for (const message of [
      "對",
      "是",
      "沒錯",
      "正確",
      "可以",
      "好",
      "嗯",
      "就這樣",
    ]) {
      expect(classifyConfirmationProtocol(message)).toBe("confirm");
    }
    for (const message of ["不對", "不是", "不是這天"]) {
      expect(classifyConfirmationProtocol(message)).toBe("reject");
    }
    expect(classifyConfirmationProtocol("對房價有疑問")).toBe("none");
  });

  it("starts a clean scenario for a snapshot and clears optional addons", () => {
    const scoped = buildQuoteScopeBaseContext(
      {
        adult_count: 10,
        child_count: 2,
        infant_count: 1,
        pet_count: 1,
        pet_weights_kg: [22],
        breakfast_count: 2,
        pending_interaction: {
          action: "confirm_quote_dates",
          required_response_type: "confirmation",
          resume_action: "request_quote",
        },
        quote_scenario: { scenario_id: "old", context_version: 4 },
      },
      { quote_scope: "snapshot" },
      "turn-new-snapshot",
    );

    expect(scoped).toMatchObject({
      child_count: 0,
      infant_count: 0,
      pet_count: 0,
      pet_weights_kg: [],
      breakfast_count: 0,
      pending_interaction: null,
      quote_scenario: {
        scenario_id: "turn-new-snapshot",
        context_version: 0,
      },
    });
  });

  it("keeps a patch in the same scenario and increments its version", () => {
    const previous = {
      active_intent: "pricing",
      adult_count: 10,
      pet_count: 1,
      quote_scenario: { scenario_id: "scenario-a", context_version: 2 },
    };
    const finalized = finalizeQuoteScenarioContext({
      previousContext: previous,
      context: { ...previous, breakfast_count: 2 },
      dialogueState: { quote_scope: "patch" },
      sourceTurnId: "turn-breakfast",
      changed: true,
    });
    expect(finalized).toMatchObject({
      pet_count: 1,
      breakfast_count: 2,
      quote_scenario: { scenario_id: "scenario-a", context_version: 3 },
    });
  });

  it("binds confirmation validity to both scenario id and context version", () => {
    const pending = {
      action: "confirm_quote_dates",
      proposed_values: {},
      required_response_type: "confirmation",
      resume_action: "request_quote",
      scenario_id: "scenario-a",
      context_version: 3,
      asked_turn_id: "turn-3",
    };
    const current = {
      quote_scenario: { scenario_id: "scenario-a", context_version: 3 },
      pending_interaction: pending,
    };
    expect(isPendingInteractionCurrent(current, pending)).toBe(true);
    expect(
      isPendingInteractionCurrent(
        {
          ...current,
          quote_scenario: { scenario_id: "scenario-a", context_version: 4 },
        },
        pending,
      ),
    ).toBe(false);
  });

  it("asks only for the year for a valid yearless calendar date", () => {
    expect(getYearlessDateClarification("11月1日，10人住一晚多少？")).toEqual({
      evidence: "11月1日",
      question: "請問是幾年的11月1日？",
    });
    expect(getYearlessDateClarification("2026年11月1日住一晚")).toBeNull();
    expect(getYearlessDateClarification("2月30日住一晚")).toBeNull();
  });
});
