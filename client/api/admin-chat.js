import sessionHandler from "../server/aiChat/adminSession.js";
import sessionsHandler from "../server/aiChat/adminSessions.js";
import messagesHandler from "../server/aiChat/adminMessages.js";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  const action = String(firstQueryValue(req.query?.action) || "").trim();

  if (action === "sessions") {
    return sessionsHandler(req, res);
  }

  if (action === "session") {
    return sessionHandler(req, res);
  }

  if (
    action === "update-session-status" ||
    action === "human-takeover" ||
    action === "restore-ai" ||
    action === "close-session" ||
    action === "reopen-session" ||
    action === "mark-replied"
  ) {
    return sessionHandler(req, res);
  }

  if (action === "messages") {
    return messagesHandler(req, res);
  }

  if (action === "send-human-message") {
    return messagesHandler(req, res);
  }

  return sendJson(res, 400, {
    error: "Unsupported admin-chat action.",
  });
}
