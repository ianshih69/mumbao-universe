import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/admin-shop.js";

const uid = "11111111-1111-4111-8111-111111111111";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function backend({ status = 200, profile = true, active = true, permissions = ["booking.manage"] } = {}) {
  const mock = vi.fn(async (url, options) => {
    expect(options?.method || "GET").toBe("GET");
    if (String(url).endsWith("/auth/v1/user")) {
      expect(options.headers.Authorization).toBe("Bearer existing-customer-session");
      return json({ id: uid, email: "customer@example.test", user_metadata: { role: "super_admin" } }, status);
    }
    if (String(url).includes("/admin_profiles?")) {
      expect(String(url)).toContain(`auth_user_id=eq.${uid}`);
      return json(profile ? [{ id: "admin-profile", auth_user_id: uid, role_code: "phase15_test_admin", is_active: active }] : []);
    }
    if (String(url).includes("/admin_role_permissions?")) return json(permissions.map(permission_code => ({ permission_code })));
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
async function invoke(token = "existing-customer-session") {
  const req = { method: "GET", query: { action: "admin-session", requiredPermission: "booking.manage", role: "super_admin", email: "admin@example.test" },
    headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("server-verified Admin SSO identity", () => {
  it("accepts the existing Customer bearer only after Auth, active profile and booking.manage pass", async () => {
    const mock = backend();
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.body.permissions).toContain("booking.manage");
    expect(result.body.user.role_code).toBe("phase15_test_admin");
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["missing Admin", { profile: false }],
    ["disabled Admin", { active: false }],
    ["missing booking.manage", { permissions: ["users.view"] }],
  ])("rejects %s, ignoring email/query/user_metadata role", async (_name, options) => {
    backend(options);
    expect((await invoke()).status).toBe(403);
  });
  it("rejects expired or forged Supabase bearer before profile queries", async () => {
    const mock = backend({ status: 401 });
    expect((await invoke()).status).toBe(401);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("rejects no-session requests", async () => {
    const mock = backend();
    expect((await invoke("")).status).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
});
