import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const CHAT_TEST_COOKIE = "__Host-mumbao-chat-test";
const attemptCookie = "__Host-mumbao-chat-attempt";
const ttlSeconds = 2 * 60 * 60;
const attemptWindowMs = 15 * 60 * 1000;
const maxAttempts = 5;
const attempts = new Map();

function config() {
  if (process.env.AI_CHAT_TEST_MODE === "false") return { enabled: false };
  const hash = String(process.env.AI_CHAT_TEST_PASSWORD_HASH || "");
  const secret = String(process.env.AI_CHAT_TEST_SIGNING_SECRET || "");
  const valid = /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash) && secret.length >= 32;
  return { enabled: true, valid, hash, secret };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie");
  res.end(JSON.stringify(body));
}

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function same(a, b) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function host(req) {
  return String(req.headers?.host || "").toLowerCase();
}

function sign(data, cfg) {
  const value = Buffer.from(JSON.stringify(data)).toString("base64url");
  return value + "." + signature(value, cfg.secret);
}

function readCookie(req, name, cfg) {
  const values = String(req.headers?.cookie || "").split(";").map(s => s.trim())
    .filter(s => s.startsWith(name + "="));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  if (token.length > 2048) return null;
  const [value, mac, extra] = token.split(".");
  if (!value || !/^[a-f0-9]{64}$/.test(mac || "") || extra ||
      !same(mac, signature(value, cfg.secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    return data.aud === host(req) ? data : null;
  } catch { return null; }
}

function cookie(name, value, age) {
  return name + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + age;
}

function crossOrigin(req) {
  if (req.headers?.["sec-fetch-site"] === "cross-site") return true;
  const origin = req.headers?.origin;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() !== host(req) ||
      (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1");
  } catch { return true; }
}

function grant(req, cfg) {
  const data = readCookie(req, CHAT_TEST_COOKIE, cfg);
  const now = Date.now();
  return data?.purpose === "chat-test" && Number.isInteger(data.iat) && Number.isInteger(data.exp) &&
    data.iat <= now && data.exp > now && data.exp - data.iat === ttlSeconds * 1000 &&
    data.version === signature(cfg.hash, cfg.secret) ? data : null;
}

export function requireChatTestAccess(req, res) {
  const cfg = config();
  if (!cfg.enabled) return true;
  if (cfg.valid && !crossOrigin(req) && grant(req, cfg)) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "Cookie");
    return true;
  }
  json(res, cfg.valid ? 403 : 503, {
    errorCode: "chat_test_access_required",
    error: cfg.valid ? "請先輸入測試密碼。" : "客服測試暫時無法使用，請稍後再試。",
  });
  return false;
}

async function readPassword(req) {
  const type = String(req.headers?.["content-type"] || "").split(";")[0];
  if (type !== "application/json") throw Error("invalid body");
  let body = req.body;
  if (body == null) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 512) throw Error("invalid body");
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (typeof body === "string") {
    if (body.length > 512) throw Error("invalid body");
    body = JSON.parse(body);
  }
  if (!body || Object.keys(body).length !== 1 || typeof body.password !== "string" ||
      body.password.length > 128 || !body.password.length) throw Error("invalid body");
  return body.password;
}

// Bounded per-instance IP throttle plus a signed browser attempt window.
// This temporary gate is not a distributed quota or an identity boundary.
function takeAttempt(req, res, cfg) {
  const now = Date.now();
  for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
  const ip = process.env.VERCEL === "1"
    ? String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
    : req.socket?.remoteAddress || "local";
  const key = createHash("sha256").update(ip).digest("hex");
  const saved = readCookie(req, attemptCookie, cfg);
  const browser = saved?.purpose === "attempt" && Number.isInteger(saved.count) &&
    saved.count >= 0 && saved.until > now && saved.until <= now + attemptWindowMs ? saved : null;
  if (!attempts.has(key) && attempts.size >= 10000) return false;
  const prior = attempts.get(key);
  const count = Math.max(prior?.count || 0, browser?.count || 0);
  const until = Math.max(prior?.until || 0, browser?.until || 0) || now + attemptWindowMs;
  if (count >= maxAttempts) {
    res.setHeader("Retry-After", String(Math.ceil((until - now) / 1000)));
    return false;
  }
  const next = { purpose: "attempt", aud: host(req), count: count + 1, until };
  attempts.set(key, next);
  res.setHeader("Set-Cookie", cookie(attemptCookie, sign(next, cfg), Math.ceil((until - now) / 1000)));
  return true;
}

export async function chatTestAccessHandler(req, res) {
  const cfg = config();
  if (!["GET", "POST"].includes(req.method)) return json(res, 405, { authorized: false });
  if (crossOrigin(req)) return json(res, 403, { authorized: false, error: "請由本站開啟測試。" });
  if (!cfg.enabled) return json(res, 200, { authorized: true, enabled: false });
  if (!cfg.valid) return json(res, 503, { authorized: false, error: "客服測試暫時無法使用，請稍後再試。" });
  if (req.method === "GET") {
    const access = grant(req, cfg);
    return json(res, 200, { authorized: Boolean(access), enabled: true,
      expiresIn: access ? Math.max(0, access.exp - Date.now()) : 0 });
  }
  if (!takeAttempt(req, res, cfg)) {
    return json(res, 429, { authorized: false, error: "嘗試次數過多，請 15 分鐘後再試。" });
  }
  let password;
  try {
    password = await readPassword(req);
    const [salt, expected] = cfg.hash.split(":");
    const actual = scryptSync(password, salt, 32).toString("hex");
    if (!same(actual, expected)) return json(res, 403, { authorized: false, error: "測試密碼錯誤" });
  } catch {
    return json(res, 400, { authorized: false, error: "請輸入有效的測試密碼。" });
  } finally { password = undefined; }
  const now = Date.now();
  const access = sign({ purpose: "chat-test", aud: host(req), iat: now,
    exp: now + ttlSeconds * 1000, version: signature(cfg.hash, cfg.secret) }, cfg);
  res.setHeader("Set-Cookie", [
    cookie(CHAT_TEST_COOKIE, access, ttlSeconds),
    cookie(attemptCookie, "", 0),
  ]);
  return json(res, 200, { authorized: true, enabled: true, expiresIn: ttlSeconds * 1000 });
}
