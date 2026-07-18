const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionUuid(value) {
  return uuidPattern.test(String(value || "").trim());
}

export function createSessionError({
  message,
  status,
  reason,
  errorCode,
  failureStage,
}) {
  const error = new Error(message);
  error.status = status;
  error.reason = reason;
  error.errorCode = errorCode;
  error.failureStage = failureStage;
  return error;
}

export function createInvalidSessionIdError() {
  return createSessionError({
    message: "Invalid session.",
    status: 400,
    reason: "invalid session id",
    errorCode: "invalid_session_id",
    failureStage: "session_validation",
  });
}

export function createSessionOwnershipMismatchError() {
  return createSessionError({
    message: "Session does not belong to visitor.",
    status: 403,
    reason: "session visitor mismatch",
    errorCode: "session_ownership_mismatch",
    failureStage: "session_identity",
  });
}

export function buildSessionErrorBody(error, requestId = "") {
  return {
    error: error.message,
    errorCode: error.errorCode,
    failureStage: error.failureStage,
    reason: error.reason,
    ...(requestId
      ? {
          metadata: {
            requestId,
            failureStage: error.failureStage,
          },
        }
      : {}),
  };
}
