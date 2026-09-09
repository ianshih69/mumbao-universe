import { waitUntil } from "@vercel/functions";
import { assertAiQualityServerOnly, hashAiQualityConversationKey, sanitizeAiQualityText } from "./privacy.js";
import { sanitizeAiQualityMetadata, sanitizeAiQualityContext } from "./metadata.js";
import { buildAiQualityTurnSnapshot } from "./snapshot.js";
import { deriveAiQualitySignals } from "./signals.js";
import { persistAiQualityTurn } from "./persistence.js";

assertAiQualityServerOnly();

export function isAiQualityObserverEnabled() {
  return process.env.AI_QUALITY_OBSERVER_ENABLED === "true";
}

const warningCategories = new Set([
  "snapshot", "preparation", "configuration", "permission", "missing_schema",
  "conflict", "database", "network", "timeout", "persistence", "lifecycle",
]);
function warn(category) {
  try {
    console.warn("[ai-quality] observation_failed category=" +
      (warningCategories.has(category) ? category : "persistence"));
  } catch { /* Diagnostics must never become customer failures. */ }
}

// Lazy projection: OFF never reads context, text or the HMAC secret.
export function captureAiQualityTurn(getInput) {
  if (!isAiQualityObserverEnabled()) return null;
  try { return buildAiQualityTurnSnapshot(getInput()); }
  catch { warn("snapshot"); return null; }
}

export function prepareAiQualityTurn(snapshot) {
  assertAiQualityServerOnly();
  const conversationHash = hashAiQualityConversationKey(snapshot.conversation_source_id);
  const turnSource = JSON.stringify(["turn-v1", snapshot.conversation_source_id, snapshot.turn_source_id]);
  if (typeof snapshot.turn_source_id !== "string" || !snapshot.turn_source_id) throw new Error("invalid_turn_id");
  const turnHash = hashAiQualityConversationKey(turnSource);
  const metadata = sanitizeAiQualityMetadata(snapshot.metadata);
  const context = sanitizeAiQualityContext(snapshot.context);
  return {
    conversation_key_hash: conversationHash,
    turn_key_hash: turnHash,
    user_text: sanitizeAiQualityText(snapshot.user_text),
    assistant_text: sanitizeAiQualityText(snapshot.assistant_text),
    metadata,
    context,
    events: deriveAiQualitySignals(snapshot).map(event => ({
      event_type: event.event_type,
      severity: event.severity,
      metadata: sanitizeAiQualityMetadata({ ...metadata, signal_code: event.signal_code }),
    })),
  };
}

/** Called after res.end. On Vercel, extend the request lifetime with waitUntil. */
export async function observeAiQualityTurn(snapshot) {
  if (!snapshot || !isAiQualityObserverEnabled()) return;
  let payload;
  try { payload = prepareAiQualityTurn(snapshot); }
  catch { warn("preparation"); return; }
  // Only sanitized, allowlisted data survives into background work.
  const work = Promise.resolve().then(() => persistAiQualityTurn(payload))
    .then(result => { if (result !== "saved") warn(result); })
    .catch(() => warn("persistence"));
  try {
    if (process.env.VERCEL === "1") waitUntil(work);
    else await work;
  } catch {
    warn("lifecycle");
    await work;
  }
}
