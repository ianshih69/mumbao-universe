import { describe, expect, it } from "vitest";
import { applyContextFreshnessGuard } from "./contextFreshnessGuard.js";

const dateInfo = {
  currentDate: "2026-08-02",
  currentYear: 2026,
  nextYear: 2027,
  timeZone: "Asia/Taipei",
};

const oldPricingContext = {
  active_intent: "pricing",
  current_topic: "booking_price",
  stay_type: "villa",
  check_in: "2026-10-01",
  check_out: "2026-10-02",
  guest_count: 15,
  pet_count: 0,
  pet_type: null,
};

function semantic(overrides = {}) {
  return {
    turn_action: "request_quote",
    intent: "pricing",
    topic: "booking_price",
    is_follow_up: false,
    mentioned_fields: [],
    context_patch: {},
    clear_fields: [],
    uncertain_fields: [],
    uses_relative_date: false,
    selected_faq_ids: [],
    missing_fields: [],
    route: "collect_info",
    needs_human: false,
    reply_draft: "",
    confidence: 0.95,
    ...overrides,
  };
}

describe("context freshness guard", () => {
  it("uses server-side relative date resolution and blocks stale checkout", () => {
    const result = applyContextFreshnessGuard({
      oldContext: oldPricingContext,
      context: {
        ...oldPricingContext,
        active_intent: "pricing",
        stay_type: "villa",
      },
      semanticResult: semantic({
        mentioned_fields: ["check_in", "stay_type"],
        context_patch: {
          active_intent: "pricing",
          stay_type: "villa",
        },
        uncertain_fields: ["check_out"],
        uses_relative_date: true,
      }),
      currentMessage: "後天包棟多少錢",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
      sourceMessageId: "request-1",
    });

    expect(result.context.check_in).toBe("2026-08-04");
    expect(result.context.check_out).toBeNull();
    expect(result.uses_relative_date).toBe(true);
    expect(result.mentioned_fields).toContain("check_in");
    expect(result.uncertain_fields).toContain("check_out");
    expect(result.stale_fields_blocked).toEqual(
      expect.arrayContaining(["check_in", "check_out"])
    );
    expect(result.context.slot_meta.check_in).toMatchObject({
      source: "freshness_guard",
      source_message_id: "request-1",
    });
  });

  it("blocks old guest count when the customer mentions a count change without a value", () => {
    const result = applyContextFreshnessGuard({
      oldContext: oldPricingContext,
      context: oldPricingContext,
      semanticResult: semantic({
        turn_action: "update_quote",
        mentioned_fields: ["guest_count"],
        uncertain_fields: ["guest_count"],
        context_patch: {},
      }),
      currentMessage: "人數要改",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    expect(result.context.guest_count).toBeNull();
    expect(result.uncertain_fields).toContain("guest_count");
    expect(result.stale_fields_blocked).toContain("guest_count");
  });

  it("clears pet type when pet count is explicitly zero", () => {
    const result = applyContextFreshnessGuard({
      oldContext: {
        ...oldPricingContext,
        pet_count: 3,
        pet_type: "dog",
      },
      context: {
        ...oldPricingContext,
        pet_count: 0,
        pet_type: "dog",
      },
      semanticResult: semantic({
        turn_action: "update_quote",
        mentioned_fields: ["pet_count", "pet_type"],
        context_patch: { pet_count: 0 },
        clear_fields: ["pet_type"],
      }),
      currentMessage: "不帶狗",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    expect(result.context.pet_count).toBe(0);
    expect(result.context.pet_type).toBeNull();
    expect(result.uncertain_fields).not.toContain("pet_count");
  });

  it("preserves old fields that were not mentioned in the current turn", () => {
    const result = applyContextFreshnessGuard({
      oldContext: oldPricingContext,
      context: oldPricingContext,
      semanticResult: semantic({
        turn_action: "ask_information",
        mentioned_fields: [],
        context_patch: {},
      }),
      currentMessage: "可以烤肉嗎",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    expect(result.context.check_in).toBe("2026-10-01");
    expect(result.context.guest_count).toBe(15);
    expect(result.stale_fields_blocked).toEqual([]);
  });

  it("still blocks stale dates when semantic planning fails", () => {
    const result = applyContextFreshnessGuard({
      oldContext: oldPricingContext,
      context: oldPricingContext,
      semanticResult: null,
      currentMessage: "後天包棟多少錢",
      dateInfo,
      nowIso: "2026-08-02T08:00:00.000Z",
    });

    expect(result.context.check_in).toBe("2026-08-04");
    expect(result.context.check_out).toBeNull();
    expect(result.uncertain_fields).toContain("check_out");
    expect(result.stale_fields_blocked).toEqual(
      expect.arrayContaining(["check_in", "check_out"])
    );
  });
});
