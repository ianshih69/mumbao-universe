import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bookingHandler from "../../api/booking.js";

describe("booking infant limit validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T00:00:00Z"));
    vi.stubEnv("SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-key");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it.each(["quote", "request"])("rejects >2 infants before pricing or writes on %s", async (action) => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      expect(new URL(url).origin).toBe("https://supabase.test");
      expect(new URL(url).pathname).toBe("/rest/v1/booking_settings");
      expect(options.method || "GET").toBe("GET");
      return new Response(JSON.stringify([{ booking_window_months: 12, allow_villa_booking: true, allow_pets: true, total_room_count: 6 }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const input = { check_in: "2026-11-01", check_out: "2026-11-02", adults: 8, children: 0, infants: 3, stay_type: "villa" };
    const response = { statusCode: 200, body: null, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await bookingHandler({ method: action === "quote" ? "GET" : "POST", headers: {}, query: { action, ...input }, body: input }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: "infant_count_requires_confirmation" });
    expect(response.body.message).toContain("超過2位");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
