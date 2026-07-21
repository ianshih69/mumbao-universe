import { describe, expect, it } from "vitest";
import {
  adminChatMessagePollMs,
  adminChatNearBottomThresholdPx,
  adminChatSessionPollMs,
  areAdminMessageListsEqual,
  getNewAdminMessageCount,
  getNewMessageNoticeLabel,
  getPrependedScrollTop,
  isNearBottom,
  mergeMessages,
  mergeMessagesPreservingReference,
  mergeSessions,
} from "./AdminChats";

function message(id: string, createdAt: string, content = "[TEST-ADMIN-SCROLL]") {
  return {
    id,
    session_id: "session-a",
    role: "user" as const,
    content,
    created_at: createdAt,
  };
}

function session(id: string, extra = {}) {
  return {
    id,
    status: "ai_active" as const,
    support_status: "ai_replying" as const,
    should_ai_reply: true,
    latest_message_at: "2026-07-21T10:00:00.000Z",
    updated_at: "2026-07-21T10:00:00.000Z",
    ...extra,
  };
}

describe("admin chat scroll helpers", () => {
  it("keeps the same message reference when polling returns no data changes", () => {
    const current = [
      message("message-1", "2026-07-21T10:00:00.000Z"),
      message("message-2", "2026-07-21T10:00:01.000Z"),
    ];

    expect(mergeMessagesPreservingReference(current, [])).toBe(current);
    expect(
      mergeMessagesPreservingReference(
        current,
        current.map((item) => ({ ...item }))
      )
    ).toBe(current);
  });

  it("dedupes messages by id and preserves chronological order", () => {
    const current = [
      message("message-2", "2026-07-21T10:00:02.000Z"),
      message("message-3", "2026-07-21T10:00:03.000Z"),
    ];
    const merged = mergeMessages(current, [
      message("message-1", "2026-07-21T10:00:01.000Z"),
      message("message-2", "2026-07-21T10:00:02.000Z"),
    ]);

    expect(merged.map((item) => item.id)).toEqual([
      "message-1",
      "message-2",
      "message-3",
    ]);
    expect(areAdminMessageListsEqual(current, merged)).toBe(false);
  });

  it("uses a 100px near-bottom threshold for auto-scroll decisions", () => {
    expect(adminChatMessagePollMs).toBe(5_000);
    expect(adminChatSessionPollMs).toBe(10_000);
    expect(adminChatNearBottomThresholdPx).toBe(100);
    expect(
      isNearBottom({ scrollHeight: 1000, scrollTop: 700, clientHeight: 200 })
    ).toBe(true);
    expect(
      isNearBottom({ scrollHeight: 1000, scrollTop: 699, clientHeight: 200 })
    ).toBe(false);
  });

  it("counts incoming messages for the floating notice while scroll is preserved", () => {
    const current = [message("message-1", "2026-07-21T10:00:00.000Z")];
    const next = [
      ...current,
      message("message-2", "2026-07-21T10:00:01.000Z"),
    ];

    expect(getNewAdminMessageCount(current, next)).toBe(1);
    expect(getNewMessageNoticeLabel(1)).toBe(
      "1 \u5247\u65b0\u8a0a\u606f \u2193"
    );
    expect(getNewMessageNoticeLabel(2)).toBe(
      "2 \u5247\u65b0\u8a0a\u606f \u2193"
    );
  });

  it("preserves the viewport anchor when older messages are prepended", () => {
    expect(
      getPrependedScrollTop({
        previousScrollHeight: 1000,
        previousScrollTop: 240,
        nextScrollHeight: 1420,
      })
    ).toBe(660);
  });

  it("keeps the same session list reference when silent polling has no changes", () => {
    const current = [session("session-a"), session("session-b")];

    expect(
      mergeSessions(
        current,
        current.map((item) => ({ ...item }))
      )
    ).toBe(current);
  });

  it("replaces the session list only when selected session data changes", () => {
    const current = [session("session-a"), session("session-b")];
    const merged = mergeSessions(current, [
      session("session-a", { unread_count: 1 }),
    ]);

    expect(merged).not.toBe(current);
    expect(merged.find((item) => item.id === "session-a")).toMatchObject({
      unread_count: 1,
    });
  });
});
