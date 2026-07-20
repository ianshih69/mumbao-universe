import { describe, expect, it } from "vitest";
import { buildHumanReplySessionPatch } from "./adminMessages.js";

const admin = {
  adminProfileId: "admin-1",
  displayName: "Admin",
  email: "admin@example.test",
  roleCode: "admin",
};

const now = "2026-07-20T10:00:00.000Z";
const messageCreatedAt = "2026-07-20T09:59:00.000Z";

describe("admin human chat messages", () => {
  it.each([
    ["30 minutes", "2026-07-20T10:30:00.000Z"],
    ["1 hour", "2026-07-20T11:00:00.000Z"],
    ["manual", null],
  ])("keeps AI paused when replying during %s takeover", (_label, pausedUntil) => {
    expect(
      buildHumanReplySessionPatch({
        session: {
          status: "human_takeover",
          support_status: "human_takeover",
          should_ai_reply: false,
          ai_paused_until: pausedUntil,
        },
        admin,
        content: "[TEST-HUMAN-UNREAD] reply",
        messageCreatedAt,
        now,
      })
    ).toMatchObject({
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: pausedUntil,
      last_message: "[TEST-HUMAN-UNREAD] reply",
      latest_message_at: messageCreatedAt,
      handled_by_admin_id: "admin-1",
      unread_count: 0,
    });
  });

  it("marks ordinary support replies as replied with AI active", () => {
    expect(
      buildHumanReplySessionPatch({
        session: {
          status: "ai_active",
          support_status: "needs_human",
        },
        admin,
        content: "reply",
        messageCreatedAt,
        now,
      })
    ).toMatchObject({
      status: "ai_active",
      support_status: "replied",
      should_ai_reply: true,
      ai_paused_until: null,
      last_message: "reply",
      latest_message_at: messageCreatedAt,
    });
  });
});
