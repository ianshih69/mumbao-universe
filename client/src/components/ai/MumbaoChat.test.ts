import { describe, expect, it } from "vitest";
import {
  createHumanTakeoverNoticeMessage,
  getHumanUnreadState,
  getLatestHumanMessage,
  hasUnreadHumanMessage,
  humanSeenStorageKey,
  humanUnreadPollingIntervalMs,
  isHumanMessage,
  isRealChatMessage,
  isValidChatUuid,
  markHumanMessageSeen,
  mergeMessages,
  parseStoredChatSession,
  readHumanSeenMap,
  type ChatMessage,
} from "./MumbaoChat";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

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

  it("keeps human takeover system notices out of real chat merges", () => {
    const userMessage = message(
      "user-1",
      "user",
      "可以帶狗嗎？",
      "2026-07-18T10:00:00.000Z"
    );
    const notice = createHumanTakeoverNoticeMessage();

    expect(isRealChatMessage(notice)).toBe(false);
    expect(mergeMessages([userMessage], [notice])).toEqual([userMessage]);
  });

  it("merges human messages without duplicating them", () => {
    const humanReply = message(
      "human-1",
      "human",
      "管家回覆測試",
      "2026-07-18T10:00:00.000Z",
      { provider_used: "admin" }
    );

    expect(mergeMessages([humanReply], [humanReply])).toEqual([humanReply]);
    expect(getLatestHumanMessage([humanReply])).toEqual(humanReply);
  });
});

describe("human support unread helpers", () => {
  it("recognizes current and production-compatible human message shapes", () => {
    expect(isHumanMessage({ role: "human" })).toBe(true);
    expect(isHumanMessage({ sender: "human" })).toBe(true);
    expect(isHumanMessage({ sender_type: "human" })).toBe(true);
    expect(isHumanMessage({ provider_used: "admin" })).toBe(true);
    expect(isHumanMessage({ role: "assistant", provider_used: "deepseek" })).toBe(
      false
    );
    expect(isHumanMessage({ role: "user", provider_used: "admin" })).toBe(false);
  });

  it("does not treat AI messages as human unread replies", () => {
    const seenMap = {};
    const aiMessage = message(
      "ai-1",
      "assistant",
      "可以帶狗入住。",
      "2026-07-18T10:00:00.000Z",
      { provider_used: "deepseek" }
    );

    expect(getLatestHumanMessage([aiMessage])).toBeNull();
    expect(
      getHumanUnreadState(
        [{ sessionId: "session-a", message: getLatestHumanMessage([aiMessage]) }],
        seenMap
      )
    ).toMatchObject({ hasUnread: false, sessionId: "" });
  });

  it("tracks seen human replies per session", () => {
    const seenMap = {
      "session-a": {
        message_id: "human-a",
        created_at: "2026-07-18T10:00:00.000Z",
      },
    };
    const latestA = message(
      "human-a",
      "human",
      "A 已看過",
      "2026-07-18T10:00:00.000Z"
    );
    const latestB = message(
      "human-b",
      "human",
      "B 未讀",
      "2026-07-18T10:01:00.000Z"
    );

    expect(hasUnreadHumanMessage("session-a", latestA, seenMap)).toBe(false);
    expect(hasUnreadHumanMessage("session-b", latestB, seenMap)).toBe(true);
  });

  it("rebuilds a damaged seen map without crashing", () => {
    const storage = new MemoryStorage();
    storage.setItem(humanSeenStorageKey, "{not-json");

    expect(readHumanSeenMap(storage)).toEqual({});
    expect(storage.getItem(humanSeenStorageKey)).toBe("{}");
  });

  it("marks human replies seen without touching unrelated storage", () => {
    const storage = new MemoryStorage();
    storage.setItem("mumbao_customer_auth", "KEEP_AUTH");
    storage.setItem("mumbao-shop-cart", "KEEP_CART");
    storage.setItem("adminShopToken", "KEEP_ADMIN");

    markHumanMessageSeen(
      "session-a",
      message(
        "human-a",
        "human",
        "管家回覆",
        "2026-07-18T10:00:00.000Z"
      ),
      storage
    );

    expect(readHumanSeenMap(storage)).toEqual({
      "session-a": {
        message_id: "human-a",
        created_at: "2026-07-18T10:00:00.000Z",
      },
    });
    expect(storage.getItem("mumbao_customer_auth")).toBe("KEEP_AUTH");
    expect(storage.getItem("mumbao-shop-cart")).toBe("KEEP_CART");
    expect(storage.getItem("adminShopToken")).toBe("KEEP_ADMIN");
  });

  it("uses the first-version low-frequency polling interval", () => {
    expect(humanUnreadPollingIntervalMs).toBe(25_000);
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
