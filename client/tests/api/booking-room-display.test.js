import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), rpc: vi.fn() }));
vi.mock("../../server/shopShared.js", () => ({
  supabaseRequest: mocks.request,
  supabaseRpc: mocks.rpc,
  getServerEnv: () => "",
}));

import {
  buildPublicBookingManageResponse,
  fetchAdminBookingOrderDetail,
  fetchAdminBookingOrders,
  handleBookingLookup,
  handleBookingManage,
} from "../../server/bookingManagement.js";

const room = { roomId: "room-360", code: "S360", publicName: "畫雲", capacity: 4 };
const booking = {
  id: "booking-room", booking_reference: "5827319406", status: "confirmed",
  stay_type: "room", room_id: room.roomId, room_count: 1,
  check_in: "2026-11-03", check_out: "2026-11-05", adults: 4, children: 0,
  guest_email: "guest@example.invalid", guest_phone: "0912345678",
  quoted_total: 11351, deposit_amount: 3406, balance_amount: 7945,
  pricing_breakdown: { room }, submitted_snapshot: { summary: { room } },
};

beforeEach(() => {
  mocks.request.mockReset();
  mocks.rpc.mockReset();
});

describe("room booking display serialization", () => {
  it.each(["summary", "pricing"])("uses the stored %s room snapshot without changing amounts", (source) => {
    const stored = { ...booking, submitted_snapshot: source === "summary" ? booking.submitted_snapshot : null };
    const result = buildPublicBookingManageResponse({ booking: stored });
    expect(result.booking).toMatchObject({
      stayType: "room", roomId: room.roomId, room,
      checkIn: booking.check_in, checkOut: booking.check_out, adults: 4,
      quotedTotal: 11351, depositAmount: 3406, balanceAmount: 7945,
    });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("prefers the submitted identity and only exposes public room fields", () => {
    const result = buildPublicBookingManageResponse({ booking: {
      ...booking,
      pricing_breakdown: { room: { ...room, publicName: "Changed name", capacity: 2 } },
      submitted_snapshot: { summary: { room: { ...room, internalNote: "private" } } },
    } });
    expect(result.booking.room).toEqual(room);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("does not guess a room from room_count or trust raw payload room data", () => {
    const result = buildPublicBookingManageResponse({ booking: {
      ...booking, submitted_snapshot: null, pricing_breakdown: null,
      raw_payload: { room: { ...room, code: "S520" } },
    } });
    expect(result.booking.room).toBeNull();
    expect(result.booking.roomId).toBe(room.roomId);
  });

  it("leaves villa room configuration and amount serialization unchanged", () => {
    const option = { id: "villa", roomCount: 5, doubleBedCount: 8, sleepCapacity: 16 };
    const result = buildPublicBookingManageResponse({ booking: {
      ...booking, stay_type: "villa", room_count: 5,
      submitted_snapshot: { summary: { selectedRoomOption: option, room } },
    } });
    expect(result.booking).toMatchObject({ stayType: "villa", roomCount: 5, selectedRoomOption: option, quotedTotal: 11351 });
    expect(result.booking).not.toHaveProperty("room");
    expect(result.booking).not.toHaveProperty("roomId");
  });

  it("selects snapshot, stay type and room ID for the admin list and preserves detail", async () => {
    mocks.request.mockImplementation(async (path) => {
      if (!path.startsWith("/booking_requests?")) return [];
      const select = new URL(path, "https://example.invalid").searchParams.get("select");
      if (select === "*") return [booking];
      const columns = select.split(",");
      expect(columns).toEqual(expect.arrayContaining(["stay_type", "room_id", "pricing_breakdown", "submitted_snapshot"]));
      return [Object.fromEntries(Object.entries(booking).filter(([key]) => columns.includes(key)))];
    });
    const list = await fetchAdminBookingOrders({ query: {} });
    const detail = await fetchAdminBookingOrderDetail({ id: booking.id });
    for (const order of [list.orders[0], detail.order]) {
      expect(order).toMatchObject(booking);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it.each(["lookup", "manage"])("keeps snapshot and stay type in the %s response", async (action) => {
    mocks.request.mockImplementation(async (path) => {
      if (!path.startsWith("/booking_requests?")) return [];
      expect(new URL(path, "https://example.invalid").searchParams.get("select")).toBe("*");
      return [booking];
    });
    mocks.rpc.mockResolvedValue({ ok: true, allowed: true, session: { booking_request_id: booking.id } });
    const req = { headers: { host: "localhost", cookie: "mumbao_booking_manage=test-token" } };
    const result = action === "lookup"
      ? await handleBookingLookup({ req, res: { setHeader: vi.fn() }, body: { bookingReference: booking.booking_reference, contact: booking.guest_email } })
      : await handleBookingManage({ req });
    expect(result.booking).toMatchObject({ stayType: "room", room, quotedTotal: 11351, depositAmount: 3406, balanceAmount: 7945 });
  });
});
