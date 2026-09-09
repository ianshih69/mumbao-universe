import { assertAiQualityServerOnly, sanitizeAiQualityText } from "./privacy.js";
import { sanitizeAiQualityMetadata } from "./metadata.js";

assertAiQualityServerOnly();
export const feedbackCategories = Object.freeze([
  "incorrect_answer", "misunderstood_question", "repeated_question", "too_verbose", "other",
]);
export const qualityError = (status, code) => Object.assign(new Error(code), { status, code });
export function sendQualityJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
export async function readQualityBody(req) {
  const max = 2048;
  if (Number(req.headers?.["content-length"]) > max) throw qualityError(413, "invalid_request");
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > max) throw qualityError(413, "invalid_request");
      chunks.push(bytes);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  try {
    if (Buffer.byteLength(typeof raw === "string" ? raw : JSON.stringify(raw)) > max) throw new Error();
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!body || Object.getPrototypeOf(body) !== Object.prototype) throw new Error();
    return body;
  } catch { throw qualityError(400, "invalid_request"); }
}
export function exactKeys(body, keys) {
  if (!body || Object.keys(body).some(key => !keys.includes(key))) throw qualityError(400, "invalid_request");
}

const rpcNames = new Set(["submit_ai_quality_feedback", "read_ai_quality_overview", "list_ai_quality_events",
  "read_ai_quality_detail", "review_ai_quality_event", "get_ai_quality_storage_metrics"]);
// Dedicated bounded read transport; observer's no-body transport remains unchanged.
export async function qualityRpc(name, args) {
  if (!rpcNames.has(name)) throw qualityError(503, "unavailable");
  const base = process.env.SUPABASE_URL;
  const credential = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !credential) throw qualityError(503, "unavailable");
  const controller = new AbortController();
  let timer;
  try {
    const work = (async () => {
      const response = await fetch(base.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: credential, Authorization: "Bearer " + credential },
        body: JSON.stringify(args), signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw qualityError(503, response.status === 404 ? "not_initialized" : "unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw qualityError(503, "unavailable");
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 262144) throw qualityError(503, "unavailable");
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    })();
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(qualityError(503, "unavailable")); }, 4000);
    })]);
  } catch (error) {
    throw qualityError(503, error?.code === "not_initialized" ? "not_initialized" : "unavailable");
  } finally { clearTimeout(timer); controller.abort(); }
}

const eventTypes = new Set(["positive_feedback","negative_feedback","generic_fallback","possible_misunderstanding",
  "repeated_question","unnecessary_clarification","context_lost_signal","wrong_mutation_signal","provider_schema_reject",
  "provider_error","manual_escalation","owner_correction","knowledge_gap_candidate","tool_gap_candidate"]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function qualityEventId(value) {
  if (typeof value !== "string" || !uuid.test(value)) throw qualityError(400, "invalid_request");
  return value;
}
export const safeQualityDate = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const safeText = value => typeof value === "string" ? sanitizeAiQualityText(value) : "";
export function publicQualityEvent(row) {
  return {
    id: qualityEventId(row.id), event_type: eventTypes.has(row.event_type) ? row.event_type : "unknown",
    severity: ["info","low","medium","high","critical"].includes(row.severity) ? row.severity : "info",
    capability_id: sanitizeAiQualityMetadata({ capability_id: row.capability_id }).capability_id || null,
    created_at: safeQualityDate(row.created_at), reviewed_at: safeQualityDate(row.reviewed_at),
    feedback_category: feedbackCategories.includes(row.feedback_category) ? row.feedback_category : null,
    signal_code: sanitizeAiQualityMetadata({ signal_code: row.signal_code }).signal_code || null,
    question: safeText(row.question), answer: safeText(row.answer),
  };
}
export function publicQualityDetail(row) {
  return { ...publicQualityEvent(row), metadata: sanitizeAiQualityMetadata(row.metadata),
    execution: sanitizeAiQualityMetadata(row.execution),
    context: (Array.isArray(row.context) ? row.context : []).slice(0,8)
      .filter(turn => ["before","current","after"].includes(turn.relative) && ["user","assistant"].includes(turn.role))
      .map(turn => ({ relative: turn.relative, role: turn.role, text: safeText(turn.text), created_at: safeQualityDate(turn.created_at) })),
  };
}
export const safeCount = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0 ? Number(n) : 0;
export function publicQualityOverview(row) {
  return {
    ...Object.fromEntries(["conversations","positive","negative","high_risk","problem_turns"].map(key => [key,safeCount(row[key])])),
    categories: Object.fromEntries(feedbackCategories.map(key => [key,safeCount(row.categories?.[key])])),
    limited: row.limited === true, sample_limit: 5000,
  };
}
export function publicQualityHealth(row) {
  return { ...Object.fromEntries(["conversation_rows","message_rows","event_rows","review_rows","eval_rows","cleanup_due_count"]
    .map(key => [key,safeCount(row[key])])), oldest_message_at: safeQualityDate(row.oldest_message_at),
    message_retention_days: 30, event_retention_days: 90 };
}
