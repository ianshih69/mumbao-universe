import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionStatusPatch,
  default as handler,
  getCoreStatusForSupportStatus,
  getSupportStatusFromAction,
  shouldAiReplyForStatus,
} from "./adminSession.js";

const admin = {
  adminProfileId: "admin-1",
  displayName: "Admin",
  email: "admin@example.test",
  roleCode: "admin",
};

const now = "2026-07-18T10:00:00.000Z";
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createJsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body || "";
    },
  };
}

async function patchSession({ action, sessionId, supportStatus }) {
  const res = createMockResponse();
  await handler(
    {
      method: "PATCH",
      headers: { authorization: "Bearer admin-token" },
      query: { action, sessionId },
      body: { support_status: supportStatus },
    },
    res
  );

  return {
    statusCode: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

afterEach(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }

  vi.unstubAllGlobals();
});

describe("admin chat support status mapping", () => {
  it("keeps needs_human as an AI-active support work item", () => {
    expect(getSupportStatusFromAction("mark-needs-human")).toBe("needs_human");
    expect(getSupportStatusFromAction("update-session-status")).toBe(
      "needs_human"
    );
    expect(getCoreStatusForSupportStatus("needs_human")).toBe("ai_active");

    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "needs_human",
        admin,
        now,
      })
    ).toMatchObject({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
      ai_paused_until: null,
    });
  });

  it("uses human_takeover as the only admin status that pauses AI", () => {
    expect(getSupportStatusFromAction("human-takeover")).toBe("human_takeover");
    expect(getCoreStatusForSupportStatus("human_takeover")).toBe(
      "human_takeover"
    );
    expect(shouldAiReplyForStatus("human_takeover")).toBe(false);

    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "human_takeover",
        admin,
        pauseDuration: "30m",
        now,
      })
    ).toMatchObject({
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: "2026-07-18T10:30:00.000Z",
      handled_by_admin_id: "admin-1",
    });
  });

  it("supports timed and manual AI pauses from safe durations", () => {
    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "human_takeover",
        pauseDuration: "1h",
        admin,
        now,
      })
    ).toMatchObject({
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: "2026-07-18T11:00:00.000Z",
    });

    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "human_takeover",
        pauseDuration: "manual",
        admin,
        now,
      })
    ).toMatchObject({
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: null,
    });
  });

  it("restores AI for restore/reopen actions", () => {
    for (const action of ["restore-ai", "reopen-session"]) {
      expect(getSupportStatusFromAction(action)).toBe("ai_replying");
      expect(
        buildSessionStatusPatch({
          requestedSupportStatus: "ai_replying",
          admin,
          now,
        })
      ).toMatchObject({
        status: "ai_active",
        support_status: "ai_replying",
        should_ai_reply: true,
        ai_paused_until: null,
        closed_at: null,
      });
    }
  });

  it("marks replied sessions without keeping AI paused", () => {
    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "replied",
        admin,
        now,
      })
    ).toMatchObject({
      status: "ai_active",
      support_status: "replied",
      should_ai_reply: true,
      ai_paused_until: null,
      handled_at: now,
      unread_count: 0,
    });
  });

  it("closes support work without using closed as an AI-off core status", () => {
    expect(
      buildSessionStatusPatch({
        requestedSupportStatus: "closed",
        admin,
        now,
      })
    ).toMatchObject({
      status: "ai_active",
      support_status: "closed",
      should_ai_reply: true,
      ai_paused_until: null,
      closed_at: now,
      closed_by_admin_id: "admin-1",
    });
  });

  it("updates only the selected session for A/B/C admin actions", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

    const sessions = new Map([
      [
        "session-a",
        {
          id: "session-a",
          status: "ai_active",
          support_status: "ai_replying",
          should_ai_reply: true,
        },
      ],
      [
        "session-b",
        {
          id: "session-b",
          status: "ai_active",
          support_status: "ai_replying",
          should_ai_reply: true,
        },
      ],
      [
        "session-c",
        {
          id: "session-c",
          status: "ai_active",
          support_status: "ai_replying",
          should_ai_reply: true,
        },
      ],
    ]);
    const originalB = { ...sessions.get("session-b") };
    const chatSessionPatchTargets = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        const requestUrl = String(url);

        if (requestUrl.includes("/auth/v1/user")) {
          return createJsonResponse({
            id: "auth-admin",
            email: "admin@example.test",
          });
        }

        if (requestUrl.includes("/rest/v1/admin_profiles?")) {
          return createJsonResponse([
            {
              id: "admin-1",
              auth_user_id: "auth-admin",
              email: "admin@example.test",
              display_name: "Admin",
              role_code: "admin",
              is_active: true,
            },
          ]);
        }

        if (requestUrl.includes("/rest/v1/chat_sessions?id=eq.")) {
          const targetId = decodeURIComponent(
            requestUrl.match(/chat_sessions\?id=eq\.([^&]+)/)?.[1] || ""
          );
          chatSessionPatchTargets.push(targetId);

          const current = sessions.get(targetId);
          if (!current) return createJsonResponse([]);

          const patch = JSON.parse(String(options.body || "{}"));
          const updated = { ...current, ...patch };
          sessions.set(targetId, updated);
          return createJsonResponse([updated]);
        }

        throw new Error(`Unexpected request: ${requestUrl}`);
      })
    );

    await expect(
      patchSession({
        action: "human-takeover",
        sessionId: "session-a",
        supportStatus: "human_takeover",
      })
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(sessions.get("session-a")).toMatchObject({
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
    });
    expect(sessions.get("session-b")).toEqual(originalB);
    expect(sessions.get("session-c")).toMatchObject({
      status: "ai_active",
      support_status: "ai_replying",
      should_ai_reply: true,
    });

    await expect(
      patchSession({
        action: "update-session-status",
        sessionId: "session-c",
        supportStatus: "needs_human",
      })
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(sessions.get("session-c")).toMatchObject({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
    });
    expect(sessions.get("session-b")).toEqual(originalB);

    await expect(
      patchSession({
        action: "restore-ai",
        sessionId: "session-a",
        supportStatus: "ai_replying",
      })
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(sessions.get("session-a")).toMatchObject({
      status: "ai_active",
      support_status: "ai_replying",
      should_ai_reply: true,
    });
    expect(sessions.get("session-b")).toEqual(originalB);
    expect(sessions.get("session-c")).toMatchObject({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
    });

    expect(chatSessionPatchTargets).toEqual([
      "session-a",
      "session-c",
      "session-a",
    ]);
  });
});
