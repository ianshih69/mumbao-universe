import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  clearAdminToken,
  setAdminSession,
  type AdminIdentity,
} from "./adminAuth";
import { adminRouteCanRender, validateAdminRouteAuth } from "./adminRouteAuth";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

function identity(overrides: Partial<AdminIdentity> = {}): AdminIdentity {
  return {
    authMode: "account",
    display_name: "Admin",
    email: "admin@example.com",
    role_code: "admin",
    role_name: "Admin",
    permissions: ["users.view"],
    is_active: true,
    ...overrides,
  };
}

function sessionResponse(user = identity()) {
  return {
    authMode: "account" as const,
    user,
    permissions: user.permissions,
  };
}

describe("Admin route session validation", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an authenticated Admin route only after the current session is verified", async () => {
    const ensureSession = vi.fn(async () => "fresh-token");
    const fetchSession = vi.fn(async () => sessionResponse());

    const result = await validateAdminRouteAuth({
      token: "stored-token",
      ensureSession,
      fetchSession,
    });

    expect(result.status).toBe("authenticated");
    expect(ensureSession).toHaveBeenCalledWith("stored-token");
    expect(fetchSession).toHaveBeenCalledWith("fresh-token", "", "");
    expect(
      result.status === "authenticated" &&
        adminRouteCanRender("/admin/bookings", result.identity),
    ).toBe(true);
  });

  it("validates with refreshed Supabase session metadata when the access token rotates", async () => {
    setAdminSession({
      accessToken: "old-token",
      refreshToken: "old-refresh",
      expiresAt: "2026-01-01T00:00:00.000Z",
      user: identity(),
    });
    const fetchSession = vi.fn(async () => sessionResponse());

    await validateAdminRouteAuth({
      ensureSession: async () => {
        setAdminSession({
          accessToken: "new-token",
          refreshToken: "new-refresh",
          expiresAt: "2027-01-01T00:00:00.000Z",
          user: identity(),
        });
        return "new-token";
      },
      fetchSession,
    });

    expect(fetchSession).toHaveBeenCalledWith(
      "new-token",
      "2027-01-01T00:00:00.000Z",
      "new-refresh",
    );
  });

  it("sends an unauthenticated deep Admin route to login without loading a session", async () => {
    const ensureSession = vi.fn(async () => "unused");
    const fetchSession = vi.fn(async () => sessionResponse());

    const result = await validateAdminRouteAuth({
      token: "",
      ensureSession,
      fetchSession,
    });

    expect(result).toEqual({ status: "unauthenticated", reason: "missing" });
    expect(ensureSession).not.toHaveBeenCalled();
    expect(fetchSession).not.toHaveBeenCalled();
  });

  it("treats an expired session on refresh as unauthenticated", async () => {
    const result = await validateAdminRouteAuth({
      token: "expired-token",
      ensureSession: async (token) => token,
      fetchSession: async () => {
        throw new AdminApiError("expired", 401, "unauthorized");
      },
    });

    expect(result).toEqual({ status: "unauthenticated", reason: "expired" });
  });

  it("keeps an authenticated 403 route in the permission-denied flow", async () => {
    const limitedIdentity = identity({ permissions: [] });
    const result = await validateAdminRouteAuth({
      token: "valid-token",
      ensureSession: async (token) => token,
      fetchSession: async () => sessionResponse(limitedIdentity),
    });

    expect(result.status).toBe("authenticated");
    expect(
      result.status === "authenticated" &&
        adminRouteCanRender("/admin/shop/users", result.identity),
    ).toBe(false);
  });

  it("does not convert a session-check 5xx into an auth redirect", async () => {
    const failure = new AdminApiError("Session service failed.", 500, "server_error");
    const result = await validateAdminRouteAuth({
      token: "valid-token",
      ensureSession: async (token) => token,
      fetchSession: async () => {
        throw failure;
      },
    });

    expect(result).toEqual({ status: "error", error: failure });
  });

  it("restores Admin access after a successful login writes a new session", async () => {
    const loggedInIdentity = identity({ role_code: "super_admin", permissions: ["*"] });
    setAdminSession({ accessToken: "new-token", user: loggedInIdentity });

    const result = await validateAdminRouteAuth({
      ensureSession: async (token) => token,
      fetchSession: async () => sessionResponse(loggedInIdentity),
    });

    expect(result.status).toBe("authenticated");
    expect(
      result.status === "authenticated" &&
        adminRouteCanRender("/admin/bookings/orders", result.identity),
    ).toBe(true);
  });

  it("does not restore an Admin route after logout clears the stored session", async () => {
    setAdminSession({ accessToken: "valid-token", user: identity() });
    clearAdminToken();
    const ensureSession = vi.fn(async () => "unused");
    const fetchSession = vi.fn(async () => sessionResponse());

    const result = await validateAdminRouteAuth({ ensureSession, fetchSession });

    expect(result).toEqual({ status: "unauthenticated", reason: "missing" });
    expect(ensureSession).not.toHaveBeenCalled();
    expect(fetchSession).not.toHaveBeenCalled();
  });
});
