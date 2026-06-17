function getHeader(req, name) {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function createRequestId(req) {
  const existing =
    getHeader(req, "x-request-id") ||
    getHeader(req, "x-vercel-id") ||
    getHeader(req, "x-correlation-id");

  if (existing) return String(existing);

  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `admin-shop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorStatus(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  return status >= 400 && status <= 599 ? status : 500;
}

function getErrorMessage(error, status) {
  if (status === 401) return "Unauthorized.";
  if (status === 403) return "Permission denied.";
  if (status === 400 || status === 404 || status === 409) {
    return error?.message || "Admin shop request failed.";
  }
  return "Admin shop request failed.";
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function attachRequestIdToErrorJson(res, requestId) {
  if (res.__adminShopSafetyWrapped) return;
  res.__adminShopSafetyWrapped = true;
  res.__adminShopHeaders = res.__adminShopHeaders || {};

  const originalSetHeader = res.setHeader?.bind(res);
  if (originalSetHeader) {
    res.setHeader = function setHeaderWithTracking(name, value) {
      res.__adminShopHeaders[String(name).toLowerCase()] = value;
      return originalSetHeader(name, value);
    };
  }
  const originalEnd = res.end.bind(res);
  res.end = function endWithRequestId(body, ...args) {
    const contentType = String(
      res.getHeader?.("Content-Type") ||
        res.__adminShopHeaders["content-type"] ||
        ""
    ).toLowerCase();
    if (body && contentType.includes("application/json")) {
      const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
      try {
        const payload = JSON.parse(text);
        if (
          payload &&
          typeof payload === "object" &&
          payload.error &&
          !payload.requestId
        ) {
          return originalEnd(JSON.stringify({ ...payload, requestId }), ...args);
        }
      } catch {
        // Keep the original response body if it is not JSON.
      }
    }

    return originalEnd(body, ...args);
  };
}

export function withHandlerSafety(handler, options = {}) {
  const handlerName = options.name || handler.name || "admin-shop-handler";

  return async function safeAdminShopHandler(req, res) {
    const requestId = req.adminShopRequestId || createRequestId(req);
    req.adminShopRequestId = requestId;

    try {
      res.setHeader?.("X-Request-Id", requestId);
      attachRequestIdToErrorJson(res, requestId);
      return await handler(req, res, { requestId });
    } catch (error) {
      const status = getErrorStatus(error);
      console.error(`${handlerName} error:`, {
        requestId,
        status,
        message: error?.message || "Unknown error",
        stack: error?.stack,
      });
      return sendJson(res, status, {
        error: getErrorMessage(error, status),
        requestId,
      });
    }
  };
}
