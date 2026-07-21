import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExpiredHumanTakeoverPatch,
  buildSessionModeBody,
  getAiPausedUntilForDuration,
  normalizeExpiredHumanTakeover,
} from "./sessionAiMode.js";

const now = new Date("2030-01-01T10:00:00.000Z");

describe("AI chat session pause mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates safe pause durations from server time", () => {
    expect(getAiPausedUntilForDuration("30m", now)).toBe(
      "2030-01-01T10:30:00.000Z"
    );
    expect(getAiPausedUntilForDuration("1h", now)).toBe(
      "2030-01-01T11:00:00.000Z"
    );
    expect(getAiPausedUntilForDuration("manual", now)).toBeNull();
  });

  it("keeps timed takeover paused before expiration", async () => {
    const supabaseRequest = vi.fn();
    const session = {
      id: "session-a",
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: "2030-01-01T10:30:00.000Z",
    };

    const result = await normalizeExpiredHumanTakeover(session, {
      supabaseRequest,
      now: new Date("2030-01-01T10:29:00.000Z"),
    });

    expect(result).toBe(session);
    expect(supabaseRequest).not.toHaveBeenCalled();
    expect(buildSessionModeBody(result)).toMatchObject({
      support_status: "human_takeover",
      ai_mode: "human_takeover",
      ai_paused_until: "2030-01-01T10:30:00.000Z",
    });
  });

  it("restores expired timed takeover to needs_human with a single-session patch", async () => {
    const restored = {
      id: "session-a",
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
      ai_paused_until: null,
    };
    const supabaseRequest = vi.fn(async () => [restored]);

    const result = await normalizeExpiredHumanTakeover(
      {
        id: "session-a",
        status: "human_takeover",
        support_status: "human_takeover",
        should_ai_reply: false,
        ai_paused_until: "2030-01-01T10:30:00.000Z",
      },
      {
        supabaseRequest,
        now: new Date("2030-01-01T10:31:00.000Z"),
      }
    );

    expect(result).toBe(restored);
    expect(supabaseRequest).toHaveBeenCalledTimes(1);
    expect(supabaseRequest.mock.calls[0][0]).toContain(
      "/chat_sessions?id=eq.session-a"
    );
    expect(JSON.parse(supabaseRequest.mock.calls[0][1].body)).toMatchObject({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
      ai_paused_until: null,
    });
  });

  it("keeps one-hour pauses active at 59 minutes and restores at 61 minutes", async () => {
    const session = {
      id: "session-hour",
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: "2030-01-01T11:00:00.000Z",
    };
    const beforeRequest = vi.fn();
    const afterRequest = vi.fn(async () => [
      {
        ...session,
        status: "ai_active",
        support_status: "needs_human",
        should_ai_reply: true,
        ai_paused_until: null,
      },
    ]);

    await expect(
      normalizeExpiredHumanTakeover(session, {
        supabaseRequest: beforeRequest,
        now: new Date("2030-01-01T10:59:00.000Z"),
      })
    ).resolves.toBe(session);
    expect(beforeRequest).not.toHaveBeenCalled();

    await expect(
      normalizeExpiredHumanTakeover(session, {
        supabaseRequest: afterRequest,
        now: new Date("2030-01-01T11:01:00.000Z"),
      })
    ).resolves.toMatchObject({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
      ai_paused_until: null,
    });
    expect(afterRequest).toHaveBeenCalledTimes(1);
  });

  it("does not auto-restore manual takeover", async () => {
    const supabaseRequest = vi.fn();
    const session = {
      id: "session-a",
      status: "human_takeover",
      support_status: "human_takeover",
      should_ai_reply: false,
      ai_paused_until: null,
    };

    const result = await normalizeExpiredHumanTakeover(session, {
      supabaseRequest,
      now: new Date("2030-01-02T10:00:00.000Z"),
    });

    expect(result).toBe(session);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("builds the expired patch without backfilling old messages", () => {
    expect(buildExpiredHumanTakeoverPatch(now)).toEqual({
      status: "ai_active",
      support_status: "needs_human",
      should_ai_reply: true,
      ai_paused_until: null,
      support_status_updated_at: "2030-01-01T10:00:00.000Z",
      updated_at: "2030-01-01T10:00:00.000Z",
    });
  });
});
