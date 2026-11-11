import { scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatTestAccessHandler, requireChatTestAccess, CHAT_TEST_COOKIE } from "./testAccess.js";
import gateway from "../../api/ai-chat.js";

let sequence = 0;
const response = () => ({ statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } });
const request = (extra = {}) => ({ method: "GET", headers: { host: "preview.example" }, socket: { remoteAddress: "fixture-" + (++sequence) }, ...extra });
const unlock = async (password) => {
  const res = response();
  await chatTestAccessHandler(request({ method: "POST", headers: { host: "preview.example", "content-type": "application/json" }, body: { password } }), res);
  return res;
};
beforeEach(() => {
  const salt = "a".repeat(32);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AI_CHAT_TEST_MODE", "true");
  vi.stubEnv("AI_CHAT_TEST_PASSWORD_HASH", salt + ":" + scryptSync("123", salt, 32).toString("hex"));
  vi.stubEnv("AI_CHAT_TEST_SIGNING_SECRET", "fixture-only-".repeat(5));
  vi.stubEnv("VERCEL", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Network forbidden"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("shared AI entry gate", () => {
  it.each(["", " ", "wrong", "1234"])("rejects invalid password %j in production", async password => {
    const res = await unlock(password);
    expect(res.body.authorized).toBe(false);
    expect([400, 403]).toContain(res.statusCode);
    expect(String(res.headers["Set-Cookie"])).not.toContain(CHAT_TEST_COOKIE + "=");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts 123 and rechecks its signed HttpOnly cookie", async () => {
    const res = await unlock("123");
    expect(res.statusCode).toBe(200);
    expect(res.headers["Set-Cookie"][0]).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=7200");
    const req = request({ headers: { host: "preview.example", cookie: res.headers["Set-Cookie"][0].split(";")[0] } });
    expect(requireChatTestAccess(req, response())).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["history", "message", "delete-session"])("blocks %s without a grant even with member authorization", async action => {
    const res = response();
    await gateway(request({ method: "POST", query: { action }, headers: { host: "preview.example", authorization: "Bearer SYNTHETIC_MEMBER" }, body: {} }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.errorCode).toBe("chat_test_access_required");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed with missing configuration and defaults to enabled", () => {
    vi.stubEnv("AI_CHAT_TEST_MODE", "");
    expect(requireChatTestAccess(request(), response())).toBe(false);
    vi.stubEnv("AI_CHAT_TEST_PASSWORD_HASH", "");
    const res = response();
    expect(requireChatTestAccess(request(), res)).toBe(false);
    expect(res.statusCode).toBe(503);
  });
  it("rejects a cookie from another host and a modified cookie", async () => {
    const res = await unlock("123");
    const cookie = res.headers["Set-Cookie"][0].split(";")[0];
    expect(requireChatTestAccess(request({ headers: { host: "other.example", cookie } }), response())).toBe(false);
    expect(requireChatTestAccess(request({ headers: { host: "preview.example", cookie: cookie + "x" } }), response())).toBe(false);
  });
});
