import { isAiQualityFeedbackEnabled, verifyAiQualityFeedbackToken } from "../server/aiQuality/feedbackToken.js";
import { isAiQualityObserverEnabled } from "../server/aiQuality/observer.js";
import { exactKeys, feedbackCategories, qualityError, qualityRpc, readQualityBody, sendQualityJson } from "../server/aiQuality/http.js";

export default async function handler(req, res) {
  try {
    if (!isAiQualityFeedbackEnabled() || !isAiQualityObserverEnabled()) return sendQualityJson(res,404,{ ok:false,code:"unavailable" });
    if (req.method !== "POST") return sendQualityJson(res,405,{ ok:false,code:"invalid_request" });
    const body = await readQualityBody(req);
    exactKeys(body, ["token","polarity","category"]);
    if (!["positive","negative"].includes(body.polarity) ||
      (body.polarity === "positive" && body.category != null) ||
      (body.polarity === "negative" && !feedbackCategories.includes(body.category))) throw qualityError(400,"invalid_request");
    const ref = verifyAiQualityFeedbackToken(body.token);
    if (!ref) throw qualityError(400,"invalid_request");
    const result = await qualityRpc("submit_ai_quality_feedback", {
      p_conversation: ref.conversation_key_hash, p_turn: ref.turn_key_hash,
      p_polarity: body.polarity, p_category: body.category ?? null,
    });
    if (result?.result === "limited") throw qualityError(429,"temporarily_unavailable");
    if (result?.result !== "saved") throw qualityError(400,"invalid_request");
    return sendQualityJson(res,200,{ ok:true });
  } catch (error) {
    const status = [400,413,429].includes(error?.status) ? error.status : 503;
    return sendQualityJson(res,status,{ ok:false,code:status === 400 || status === 413 ? "invalid_request" : "temporarily_unavailable" });
  }
}
