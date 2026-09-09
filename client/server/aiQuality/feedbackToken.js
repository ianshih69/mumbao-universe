import { createHmac, timingSafeEqual } from "node:crypto";
import { assertAiQualityServerOnly } from "./privacy.js";
import { isAiQualityObserverEnabled, prepareAiQualityTurn } from "./observer.js";

assertAiQualityServerOnly();
export const feedbackLifetimeSeconds = 7 * 24 * 60 * 60;
export const isAiQualityFeedbackEnabled = () => process.env.AI_QUALITY_FEEDBACK_ENABLED === "true";
export const isAiQualityAdminEnabled = () => process.env.AI_QUALITY_ADMIN_ENABLED === "true";

function signingKey() {
  const secret = process.env.AI_QUALITY_HMAC_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("unavailable");
  return createHmac("sha256", secret).update("ai-quality-feedback-v1\0signing-key").digest();
}
const sign = body => createHmac("sha256", signingKey()).update(body).digest();

export function createAiQualityFeedbackToken(snapshot, now = Date.now()) {
  if (!snapshot || !isAiQualityObserverEnabled() || !isAiQualityFeedbackEnabled()) return null;
  try {
    const turn = prepareAiQualityTurn(snapshot);
    const iat = Math.floor(now / 1000);
    const body = Buffer.from(JSON.stringify({ v: 1, c: turn.conversation_key_hash,
      t: turn.turn_key_hash, iat, exp: iat + feedbackLifetimeSeconds })).toString("base64url");
    return body + "." + sign(body).toString("base64url");
  } catch { return null; }
}

export function verifyAiQualityFeedbackToken(token, now = Date.now()) {
  try {
    if (typeof token !== "string" || token.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
    const [body, signature] = token.split(".");
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.toString("base64url") !== signature || !timingSafeEqual(sign(body), supplied)) return null;
    const decoded = Buffer.from(body, "base64url");
    if (decoded.toString("base64url") !== body) return null;
    const p = JSON.parse(decoded.toString("utf8"));
    const seconds = Math.floor(now / 1000);
    if (!p || Object.keys(p).sort().join() !== "c,exp,iat,t,v" || p.v !== 1 ||
      typeof p.c !== "string" || typeof p.t !== "string" ||
      !/^[a-f0-9]{64}$/.test(p.c) || !/^[a-f0-9]{64}$/.test(p.t) ||
      !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.exp) ||
      p.exp - p.iat !== feedbackLifetimeSeconds || p.iat > seconds || p.exp <= seconds) return null;
    return { conversation_key_hash: p.c, turn_key_hash: p.t };
  } catch { return null; }
}
