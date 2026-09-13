import { beforeEach, describe, expect, it, vi } from "vitest";

const branches = vi.hoisted(() => ({ admin: vi.fn(), feedback: vi.fn(), commonjs: false }));
vi.mock("../../server/aiQuality/adminHandler.js", () => ({ get default() { return branches.commonjs ? { default: branches.admin } : branches.admin; } }));
vi.mock("../../server/aiQuality/feedbackHandler.js", () => ({ get default() { return branches.commonjs ? { default: branches.feedback } : branches.feedback; } }));
import gateway from "../../api/ai-quality.js";

const response = () => ({ statusCode: 0, headers: {}, headersSent: false, writableEnded: false,
  setHeader(name, value) { this.headers[name] = value; },
  end: vi.fn(function(body) { this.body = body; this.headersSent = true; this.writableEnded = true; }),
});
beforeEach(() => {
  branches.commonjs = false;
  for (const branch of [branches.admin, branches.feedback]) branch.mockReset().mockImplementation(async (_req, res) => {
    res.statusCode = 200;
    res.end('{"ok":true}');
  });
});

describe("Quality gateway outer error boundary", () => {
  it.each(["/api/admin-ai-quality", "/api/ai-quality-feedback"])("loads the Node builder CommonJS export for %s", async url => {
    branches.commonjs = true;
    const res = response();
    await gateway({ url }, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(branches.admin.mock.calls.length + branches.feedback.mock.calls.length).toBe(1);
  });
  it.each(["admin", "feedback"])("%s unhandled error cannot invoke or poison the other branch", async name => {
    const other = name === "admin" ? "feedback" : "admin";
    const url = branch => branch === "admin" ? "/api/admin-ai-quality" : "/api/ai-quality-feedback";
    branches[name].mockRejectedValueOnce(new Error("synthetic private failure must not escape"));
    const failed = response();
    await gateway({ url: url(name) }, failed);
    expect(failed.statusCode).toBe(503);
    expect(JSON.parse(failed.body)).toEqual({ ok: false, code: "unavailable" });
    expect(failed.end).toHaveBeenCalledTimes(1);
    expect(branches[name]).toHaveBeenCalledTimes(1);
    expect(branches[other]).not.toHaveBeenCalled();
    const healthy = response();
    await gateway({ url: url(other) }, healthy);
    expect(healthy.statusCode).toBe(200);
    expect(branches[other]).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("does not overwrite a started response (ended=%s)", async ended => {
    branches.admin.mockImplementationOnce(async (_req, res) => {
      res.headersSent = true;
      res.writableEnded = ended;
      throw new Error("synthetic failure after headers");
    });
    const res = response();
    await gateway({ url: "/api/admin-ai-quality" }, res);
    expect(res.headers).toEqual({});
    expect(res.end).toHaveBeenCalledTimes(ended ? 0 : 1);
    expect(res.body).toBeUndefined();
    expect(branches.feedback).not.toHaveBeenCalled();
  });

  it("unknown routes do not read body/query or load a handler", async () => {
    const req = { url: "/api/ai-quality?route=admin",
      get body() { throw new Error("must not inspect body for routing"); },
      get query() { throw new Error("must not inspect query for routing"); },
    };
    const res = response();
    await gateway(req, res);
    expect(res.statusCode).toBe(404);
    expect(branches.admin).not.toHaveBeenCalled();
    expect(branches.feedback).not.toHaveBeenCalled();
  });
});
