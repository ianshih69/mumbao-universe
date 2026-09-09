import { requirePermission } from "../server/adminShop/core.js";
import { isAiQualityAdminEnabled } from "../server/aiQuality/feedbackToken.js";
import { exactKeys, qualityError, qualityEventId, qualityRpc, readQualityBody, sendQualityJson,
  publicQualityEvent, publicQualityDetail, publicQualityOverview, publicQualityHealth, safeQualityDate } from "../server/aiQuality/http.js";

export default async function handler(req, res) {
  try {
    const action = req.query?.action || "list";
    await requirePermission(req, action === "review" ? "ai_quality.review" : "ai_quality.view");
    if (!isAiQualityAdminEnabled()) return sendQualityJson(res,200,{ enabled:false });
    if (!["list","overview","detail","review","health"].includes(action)) throw qualityError(400,"invalid_request");
    if (req.method !== (action === "review" ? "POST" : "GET")) throw qualityError(405,"invalid_request");
    let data;
    if (action === "review") {
      const body = await readQualityBody(req);
      exactKeys(body,["event_id"]);
      const result = await qualityRpc("review_ai_quality_event",{ p_event:qualityEventId(body.event_id) });
      if (!result?.reviewed) throw qualityError(404,"not_found");
      data = { reviewed:true };
    } else if (action === "detail") {
      const result = await qualityRpc("read_ai_quality_detail",{ p_event:qualityEventId(req.query?.event_id) });
      if (!result) throw qualityError(404,"not_found");
      data = publicQualityDetail(result);
    } else if (action === "health") {
      data = publicQualityHealth(await qualityRpc("get_ai_quality_storage_metrics",{}));
    } else {
      const days = String(req.query?.days ?? "7");
      if (!["7","30"].includes(days)) throw qualityError(400,"invalid_request");
      if (action === "overview") data = publicQualityOverview(await qualityRpc("read_ai_quality_overview",{p_days:Number(days)}));
      else {
        const type = req.query?.type ?? "all", severity = req.query?.severity ?? "all", reviewed = req.query?.reviewed ?? "pending";
        if (!["all","negative","fallback","context","mutation","provider","clarification","pending","budget"].includes(type)
          || !["all","high","other"].includes(severity) || !["all","pending","reviewed"].includes(reviewed)) throw qualityError(400,"invalid_request");
        const beforeAt = req.query?.before_at, beforeId = req.query?.before_id;
        if (Boolean(beforeAt) !== Boolean(beforeId) || (beforeAt && !safeQualityDate(beforeAt))) throw qualityError(400,"invalid_request");
        const result = await qualityRpc("list_ai_quality_events",{p_days:Number(days),p_type:type,p_severity:severity,
          p_reviewed:reviewed,p_before_at:beforeAt ? safeQualityDate(beforeAt) : null,p_before_id:beforeId ? qualityEventId(beforeId) : null});
        data = { events:(Array.isArray(result?.events) ? result.events : []).slice(0,25).map(publicQualityEvent),has_more:result?.has_more === true };
      }
    }
    return sendQualityJson(res,200,{ enabled:true,data });
  } catch (error) {
    const status = [400,401,403,404,405,413].includes(error?.status) ? error.status : 503;
    const code = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found"
      : error?.code === "not_initialized" ? "not_initialized" : status === 503 ? "unavailable" : "invalid_request";
    return sendQualityJson(res,status,{ ok:false,code });
  }
}
