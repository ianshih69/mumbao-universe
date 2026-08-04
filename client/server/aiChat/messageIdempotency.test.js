import { describe, expect, it } from "vitest";
import {
  buildIncomingMessageContentHash,
  findExistingReplyForIncomingMessage,
  normalizeIncomingMessageId,
} from "./message.js";

describe("AI chat incoming message idempotency helpers", () => {
  it("finds an existing assistant reply for a retried incoming message id", () => {
    const incomingMessageId = normalizeIncomingMessageId(" incoming-1 ");
    const contentHash = buildIncomingMessageContentHash("quote request");
    const existingReply = findExistingReplyForIncomingMessage(
      [
        {
          sender: "user",
          message: "quote request",
          metadata: {
            incoming_message_id: incomingMessageId,
            incoming_message_content_hash: contentHash,
          },
          created_at: "2026-08-04T01:00:00.000Z",
        },
        {
          sender: "ai",
          message: "lodging price is NT$25,000",
          provider_used: "deepseek",
          metadata: { model_call_count: 1 },
          created_at: "2026-08-04T01:00:01.000Z",
        },
      ],
      incomingMessageId,
      contentHash
    );

    expect(existingReply.aiMessage.message).toContain("NT$25,000");
  });

  it("does not dedupe when the user message has no saved assistant reply", () => {
    const existingReply = findExistingReplyForIncomingMessage(
      [
        {
          sender: "user",
          message: "quote request",
          metadata: { incoming_message_id: "incoming-2" },
        },
      ],
      "incoming-2"
    );

    expect(existingReply).toBeNull();
  });

  it("reports conflict when the same incoming message id is reused with different content", () => {
    const existingReply = findExistingReplyForIncomingMessage(
      [
        {
          sender: "user",
          message: "quote request",
          metadata: {
            incoming_message_id: "incoming-3",
            incoming_message_content_hash:
              buildIncomingMessageContentHash("quote request"),
          },
        },
      ],
      "incoming-3",
      buildIncomingMessageContentHash("different request")
    );

    expect(existingReply).toMatchObject({
      conflict: true,
      savedIncomingMessageContentHash:
        buildIncomingMessageContentHash("quote request"),
      incomingMessageContentHash:
        buildIncomingMessageContentHash("different request"),
    });
  });
});
