import { describe, expect, it } from "vitest";
import {
  buildSessionErrorBody,
  createInvalidSessionIdError,
  createSessionOwnershipMismatchError,
  isValidSessionUuid,
} from "./sessionValidation.js";

describe("AI chat session validation", () => {
  it("accepts UUID session ids and rejects malformed legacy strings", () => {
    expect(isValidSessionUuid("11111111-1111-4111-8111-111111111111")).toBe(
      true
    );
    expect(isValidSessionUuid("stale-session")).toBe(false);
    expect(isValidSessionUuid("")).toBe(false);
  });

  it("builds a typed invalid session response", () => {
    const error = createInvalidSessionIdError();

    expect(error).toMatchObject({
      status: 400,
      errorCode: "invalid_session_id",
      failureStage: "session_validation",
    });
    expect(buildSessionErrorBody(error, "request-1")).toMatchObject({
      error: "Invalid session.",
      errorCode: "invalid_session_id",
      failureStage: "session_validation",
      metadata: {
        requestId: "request-1",
        failureStage: "session_validation",
      },
    });
  });

  it("builds a typed ownership mismatch response", () => {
    const error = createSessionOwnershipMismatchError();

    expect(error).toMatchObject({
      status: 403,
      errorCode: "session_ownership_mismatch",
      failureStage: "session_identity",
    });
  });
});
