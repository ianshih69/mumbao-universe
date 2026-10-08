import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/customer.js";

const userId = "11111111-1111-4111-8111-111111111111";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
async function invoke(authorization = "Bearer test-member-token") {
  const req = { method: "GET", query: { action: "admin-links", email: "admin@example.test", role: "super_admin" }, headers: { authorization } };
  const res = { statusCode: 0, body: "", setHeader() {}, end(body) { this.body = body; } };
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("existing customer Admin access verification", () => {
  it("derives role from active profile for the server-verified UID, not email or request metadata", async () => {
    const fetchMock = vi.fn(async url => {
      if (String(url).endsWith("/auth/v1/user")) return json({ id: userId, email: "member@example.test" });
      expect(String(url)).toContain(`/admin_profiles?auth_user_id=eq.${userId}`);
      expect(String(url)).toContain("is_active=eq.true");
      expect(String(url)).not.toContain("email=");
      return json([{ role_code: "phase15_test_admin" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ isStaff: true, role: "phase15_test_admin" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) expect(options?.method || "GET").toBe("GET");
  });
  it("returns no Admin access for a member without an active Admin profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async url => String(url).endsWith("/auth/v1/user")
      ? json({ id: userId, email: "admin@example.test", user_metadata: { role: "super_admin" } })
      : json([])));
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ isStaff: false, role: null, adminLinks: [] });
  });
  it("rejects expired member tokens before querying Admin profiles", async () => {
    const fetchMock = vi.fn(async () => json({ message: "expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const result = await invoke();
    expect(result.status).toBe(401);
    expect(result.body.isStaff).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("requires an authenticated bearer token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await invoke("")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
