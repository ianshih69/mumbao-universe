import { describe, expect, it } from "vitest";
import {
  buildSessionModeBody,
  getAutoReplySupportStatus,
  selectRetrievalMessageForRouting,
  shouldSkipAiReply,
} from "./message.js";

describe("AI chat human takeover mode", () => {
  it("does not skip AI for support work items that remain AI-active", () => {
    expect(
      shouldSkipAiReply({
        status: "ai_active",
        support_status: "needs_human",
        should_ai_reply: true,
      })
    ).toBe(false);
  });

  it("only skips AI when the core session status is human_takeover", () => {
    expect(
      shouldSkipAiReply({
        status: "human_takeover",
        support_status: "human_takeover",
        should_ai_reply: false,
      })
    ).toBe(true);

    expect(
      shouldSkipAiReply({
        status: "ai_active",
        support_status: "human_takeover",
        should_ai_reply: false,
      })
    ).toBe(false);
  });

  it("serializes explicit AI mode separately from support status", () => {
    expect(
      buildSessionModeBody({
        status: "ai_active",
        support_status: "needs_human",
      })
    ).toEqual({
      support_status: "needs_human",
      ai_mode: "ai_active",
      ai_paused_until: null,
    });

    expect(
      buildSessionModeBody({
        status: "human_takeover",
        support_status: "human_takeover",
      })
    ).toEqual({
      support_status: "human_takeover",
      ai_mode: "human_takeover",
      ai_paused_until: null,
    });
  });

  it("keeps support work items pending while AI continues to answer", () => {
    expect(
      getAutoReplySupportStatus({
        status: "ai_active",
        support_status: "needs_human",
      })
    ).toBe("needs_human");
  });

  it("returns closed or replied sessions to normal AI replying on new messages", () => {
    for (const support_status of ["closed", "replied", "ai_replying"]) {
      expect(
        getAutoReplySupportStatus({
          status: "ai_active",
          support_status,
        })
      ).toBe("ai_replying");
    }
  });

  it("uses the raw message for FAQ retrieval when no conversation context exists", () => {
    expect(
      selectRetrievalMessageForRouting(
        {
          hasContext: false,
          retrievalText: "客人原句：幾點退房？",
        },
        "幾點退房？"
      )
    ).toBe("幾點退房？");

    expect(
      selectRetrievalMessageForRouting(
        {
          hasContext: true,
          retrievalText: "查詢住宿價格；包棟；2027-07-26入住；客人原句：3隻狗",
        },
        "3隻狗"
      )
    ).toContain("查詢住宿價格");
  });
});
