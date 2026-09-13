import { sendQualityJson } from "../server/aiQuality/http.js";

// Vercel rewrites select this function while preserving the original request path.
// Query/body discriminators are never routing authority or authorization.
const routes = new Map([
  ["/api/admin-ai-quality", () => import("../server/aiQuality/adminHandler.js")],
  ["/api/ai-quality-feedback", () => import("../server/aiQuality/feedbackHandler.js")],
]);

export default async function handler(req, res) {
  try {
    const pathname = typeof req.url === "string" ? req.url.split("?", 1)[0] : "";
    const loadHandler = routes.get(pathname);
    if (!loadHandler) return sendQualityJson(res, 404, { ok: false, code: "not_found" });

    // Only load and invoke the selected branch; never fall through to another handler.
    const imported = await loadHandler();
    // The Node builder compiles ESM exports to CommonJS; dynamic import wraps them once more.
    const selected = typeof imported.default === "function" ? imported.default : imported.default?.default;
    return await selected(req, res);
  } catch {
    if (!res.headersSent && !res.writableEnded) {
      return sendQualityJson(res, 503, { ok: false, code: "unavailable" });
    }
    if (!res.writableEnded) res.end();
  }
}
