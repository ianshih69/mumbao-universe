import historyHandler from "../server/aiChat/history.js";
import messageHandler from "../server/aiChat/message.js";

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

  if (action === "history") {
    return historyHandler(req, res);
  }

  if (action === "message") {
    return messageHandler(req, res);
  }

  return sendJson(res, 400, {
    error: "Unsupported ai-chat action.",
  });
}
