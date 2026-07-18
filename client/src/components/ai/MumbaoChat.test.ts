import { describe, expect, it } from "vitest";
import {
  isValidChatUuid,
  mergeMessages,
  parseStoredChatSession,
  type ChatMessage,
} from "./MumbaoChat";

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  createdAt: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id,
    role,
    message: text,
    created_at: createdAt,
    ...extra,
  };
}

describe("mergeMessages", () => {
  it("keeps current messages when history returns an empty array", () => {
    const current = [
      message("user-new", "user", "可以帶狗嗎？", "2026-07-16T10:00:00.000Z"),
      message("ai-new", "assistant", "可以攜帶寵物入住。", "2026-07-16T10:00:01.000Z"),
    ];

    expect(mergeMessages(current, []).map((item) => item.id)).toEqual([
      "user-new",
      "ai-new",
    ]);
  });

  it("adds older history without removing newer state", () => {
    const current = [
      message("user-new", "user", "可以帶狗嗎？", "2026-07-16T10:00:00.000Z"),
      message("ai-new", "assistant", "可以攜帶寵物入住。", "2026-07-16T10:00:01.000Z"),
    ];
    const history = [
      message("old", "user", "之前的問題", "2026-07-15T10:00:00.000Z"),
    ];

    expect(mergeMessages(current, history).map((item) => item.id)).toEqual([
      "old",
      "user-new",
      "ai-new",
    ]);
  });

  it("replaces the matching optimistic message with the server message", () => {
    const optimistic = message(
      "temp-user",
      "user",
      "可以帶狗嗎？",
      "2026-07-16T10:00:00.000Z",
      { isOptimistic: true, clientRequestId: "request-1" }
    );
    const server = message(
      "server-user",
      "user",
      "可以帶狗嗎？",
      "2026-07-16T10:00:00.500Z"
    );

    expect(mergeMessages([optimistic], [server])).toEqual([server]);
  });

  it("does not display soft-deleted messages", () => {
    const visible = message(
      "visible",
      "assistant",
      "保留的訊息",
      "2026-07-16T10:00:00.000Z"
    );
    const deleted = message(
      "deleted",
      "user",
      "已刪除訊息",
      "2026-07-16T10:00:01.000Z",
      { deleted_at: "2026-07-16T11:00:00.000Z" }
    );

    expect(mergeMessages([visible], [deleted])).toEqual([visible]);
  });
});

describe("Mumbao chat storage helpers", () => {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const sessionId = "22222222-2222-4222-8222-222222222222";

  it("recognizes valid UUID values", () => {
    expect(isValidChatUuid(visitorId)).toBe(true);
    expect(isValidChatUuid("visitor_legacy")).toBe(false);
  });

  it("migrates a legacy raw UUID session id", () => {
    expect(parseStoredChatSession(sessionId, visitorId)).toEqual({
      sessionId,
      shouldClear: false,
      shouldPersist: true,
    });
  });

  it("accepts the current JSON session shape", () => {
    expect(
      parseStoredChatSession(
        JSON.stringify({
          visitor_id: visitorId,
          session_id: sessionId,
        }),
        visitorId
      )
    ).toEqual({
      sessionId,
      shouldClear: false,
      shouldPersist: false,
    });
  });

  it("clears malformed and mismatched sessions", () => {
    expect(parseStoredChatSession("stale-session", visitorId)).toMatchObject({
      sessionId: "",
      shouldClear: true,
    });
    expect(
      parseStoredChatSession(
        JSON.stringify({
          visitor_id: "33333333-3333-4333-8333-333333333333",
          session_id: sessionId,
        }),
        visitorId
      )
    ).toMatchObject({
      sessionId: "",
      shouldClear: true,
    });
  });
});
