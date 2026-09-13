import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { permission } = vi.hoisted(() => ({ permission: vi.fn() }));
vi.mock("../../server/adminShop/core.js", () => ({ requirePermission: permission }));
import gateway from "../../api/ai-quality.js";
import adminHandler from "../../server/aiQuality/adminHandler.js";
import feedbackHandler from "../../server/aiQuality/feedbackHandler.js";
import { createAiQualityFeedbackToken } from "../../server/aiQuality/feedbackToken.js";
import { buildAiQualityTurnSnapshot } from "../../server/aiQuality/snapshot.js";

const adminUrl = "/api/admin-ai-quality";
const feedbackUrl = "/api/ai-quality-feedback";
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const eventId = "11111111-1111-4111-8111-111111111111";
let token, transport;

function response() {
  return { statusCode: 0, headers: {}, headersSent: false, writableEnded: false,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; this.headersSent = true; this.writableEnded = true; } };
}
async function request(url, extra = {}, handler = gateway) {
  const res = response();
  await handler({ url, method: "GET", headers: { authorization: "Bearer synthetic" }, query: {}, ...extra }, res);
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body) };
}
const vote = () => ({ method: "POST", body: { token, polarity: "positive" } });

beforeEach(() => {
  permission.mockReset().mockImplementation(async req => {
    if (!req.headers?.authorization) throw Object.assign(new Error("synthetic auth failure"), { status: 401 });
  });
  vi.stubEnv("AI_QUALITY_ADMIN_ENABLED", "true");
  vi.stubEnv("AI_QUALITY_FEEDBACK_ENABLED", "true");
  vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED", "true");
  vi.stubEnv("AI_QUALITY_HMAC_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SUPABASE_URL", "https://quality.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
  token = createAiQualityFeedbackToken(buildAiQualityTurnSnapshot({
    conversationId: "synthetic-conversation", turnId: "synthetic-turn",
    userText: "synthetic question", assistantText: "synthetic answer", beforeContext: {}, afterContext: {}, route: {}, metadata: {},
  }));
  transport = vi.fn(async url => {
    expect(url).toMatch(/^https:\/\/quality\.test\/rest\/v1\/rpc\//);
    const data = url.endsWith("submit_ai_quality_feedback") ? { result: "saved" }
      : url.endsWith("review_ai_quality_event") ? { reviewed: true }
      : url.endsWith("read_ai_quality_detail") ? { id: eventId, event_type: "negative_feedback" }
      : url.endsWith("list_ai_quality_events") ? { events: [], has_more: false } : {};
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal("fetch", transport);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Quality gateway routing and compatibility", () => {
  it("preserves both public URLs with exactly one Quality entrypoint", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(config.rewrites.slice(0, 2)).toEqual([
      { source: adminUrl, destination: "/api/ai-quality" },
      { source: feedbackUrl, destination: "/api/ai-quality" },
    ]);
    for (const old of ["admin-ai-quality.js", "ai-quality-feedback.js"]) {
      expect(existsSync(new URL("../../api/" + old, import.meta.url))).toBe(false);
    }
    expect(existsSync(new URL("../../api/ai-quality.js", import.meta.url))).toBe(true);
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    "independent flags: admin=%s feedback=%s", async (admin, feedback) => {
      vi.stubEnv("AI_QUALITY_ADMIN_ENABLED", String(admin));
      vi.stubEnv("AI_QUALITY_FEEDBACK_ENABLED", String(feedback));
      const a = await request(adminUrl), f = await request(feedbackUrl, vote());
      expect(a.status).toBe(200);
      expect(a.body).toEqual(admin ? { enabled: true, data: { events: [], has_more: false } } : { enabled: false });
      expect(f.status).toBe(feedback ? 200 : 404);
      expect(f.body).toEqual(feedback ? { ok: true } : { ok: false, code: "unavailable" });
      expect(permission).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(Number(admin) + Number(feedback));
    });

  it("does not bypass Observer OFF or tie Admin to Observer", async () => {
    vi.stubEnv("AI_QUALITY_OBSERVER_ENABLED", "false");
    expect((await request(feedbackUrl, vote())).status).toBe(404);
    expect((await request(adminUrl)).status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toContain("list_ai_quality_events");
  });

  it.each(["list", "overview", "detail", "health", "review"].flatMap(action => methods.map(method => [action, method])))(
    "Admin %s/%s preserves status, JSON and headers", async (action, method) => {
      const extra = { method, query: { action, event_id: eventId }, body: { event_id: eventId } };
      const direct = await request(adminUrl, extra, adminHandler);
      const routed = await request(adminUrl + "?action=" + action, extra);
      expect(routed).toEqual(direct);
      expect(routed.status).toBe(method === (action === "review" ? "POST" : "GET") ? 200 : 405);
      expect(routed.headers).toEqual({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    });

  it.each(methods)("Feedback %s preserves status, JSON and headers", async method => {
    const extra = { ...vote(), method };
    expect(await request(feedbackUrl, extra)).toEqual(await request(feedbackUrl, extra, feedbackHandler));
    expect((await request(feedbackUrl, extra)).status).toBe(method === "POST" ? 200 : 405);
    expect(permission).not.toHaveBeenCalled();
  });

  it.each(["/api/ai-quality", "/api/ai-quality?route=admin", "/api/ai-quality?__qualityRoute=admin",
    "/api/ai-quality.js?route=admin", "/api/ai-quality/", "/api/unknown", "/api/owner-decision", "/api/eval",
    "/api/admin-ai-quality/extra", "/api/%61dmin-ai-quality", "/api/../api/admin-ai-quality", undefined, null])(
    "direct, forged or unknown endpoint fails closed: %s", async url => {
      const result = await request(url, { ...vote(), headers: { "x-original-url": adminUrl }, query: { route: "admin", __qualityRoute: "admin" }, body: { route: "admin" } });
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ ok: false, code: "not_found" });
      expect(permission).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    });

  it("query/body spoofing cannot turn an unauthenticated Admin request into public feedback", async () => {
    const result = await request(adminUrl + "?route=feedback", { method: "POST", headers: {}, query: { route: "feedback" }, body: { route: "feedback" } });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, code: "unauthorized" });
    expect(permission).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
  });

  it("feedback query spoof stays feedback and body spoof is schema-rejected", async () => {
    expect((await request(feedbackUrl + "?route=admin", { ...vote(), query: { route: "admin", action: "review" } })).status).toBe(200);
    expect((await request(feedbackUrl, { ...vote(), body: { ...vote().body, route: "admin" } })).status).toBe(400);
    expect(permission).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toContain("submit_ai_quality_feedback");
  });

  it("feedback limiting neither consumes nor creates an Admin bucket", async () => {
    transport.mockImplementation(async url => new Response(JSON.stringify(url.endsWith("submit_ai_quality_feedback") ? { result: "limited" } : { events: [], has_more: false })));
    expect((await request(feedbackUrl, vote())).status).toBe(429);
    expect((await request(adminUrl)).status).toBe(200);
    expect((await request(feedbackUrl, vote())).status).toBe(429);
    expect(permission).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls.map(([url]) => url.split("/").at(-1))).toEqual([
      "submit_ai_quality_feedback", "list_ai_quality_events", "submit_ai_quality_feedback",
    ]);
  });

  it("Admin failure never dispatches feedback and does not poison the next request", async () => {
    permission.mockRejectedValueOnce(Object.assign(new Error("private auth details"), { status: 403 }));
    expect((await request(adminUrl)).body).toEqual({ ok: false, code: "forbidden" });
    expect(transport).not.toHaveBeenCalled();
    expect((await request(feedbackUrl, vote())).status).toBe(200);
    expect(permission).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("malformed feedback never dispatches Admin and does not poison the next request", async () => {
    expect((await request(feedbackUrl, { method: "POST", body: "{" })).status).toBe(400);
    expect(permission).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect((await request(adminUrl)).status).toBe(200);
    expect(permission).toHaveBeenCalledTimes(1);
  });
});
