import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBookingStayLabel, bookingRoomLabel } from "@/lib/bookings/bookingRoomDisplay";
import AdminBookingOrders from "./AdminBookingOrders";
import AdminBookings from "./AdminBookings";
import BookingManage from "./BookingManage";

const state = vi.hoisted(() => ({ cursor: 0, overrides: new Map<number, unknown>() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = state.cursor++;
    const value = state.overrides.has(index) ? state.overrides.get(index) : typeof initial === "function" ? initial() : initial;
    return [value, () => {}];
  },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/", () => {}],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/shop/AdminShopHeaderLinks", () => ({ default: () => null }));
vi.mock("@/lib/shop/adminAuth", () => ({ getAdminToken: () => "test-token", isAdminAuthError: () => false }));

const room = { roomId: "room-360", code: "S360", publicName: "畫雲", capacity: 4 };
const option = { id: "villa-five", roomCount: 5, doubleBedCount: 8, sleepCapacity: 16, quadRoomCount: 3, doubleRoomCount: 2 };
const order = {
  id: "booking-room", booking_reference: "5827319406", stay_type: "room" as const,
  status: "payment_hold", check_in: "2026-11-03", check_out: "2026-11-05",
  adults: 4, children: 0, room_count: 1, guest_name: "Test Guest", has_pets: false,
  quoted_total: 11351, deposit_amount: 3406, balance_amount: 7945,
  payment_status: "none", cancellation_status: "none", created_at: "2026-09-28T00:00:00Z",
  pricing_breakdown: { room, selectedRoomOption: option },
  submitted_snapshot: { summary: { room } },
};
const managed = {
  booking: {
    bookingReference: order.booking_reference, statusLabel: "待付款", stayType: "room",
    checkIn: order.check_in, checkOut: order.check_out, nights: 2,
    adults: 4, children: 0, infants: 0, roomCount: 1, room, selectedRoomOption: option,
    breakfastEntries: [], hasPets: false, dogCount: 0,
    contact: { email: "gu***@example.invalid", phone: "09******78" },
    quotedTotal: 11351, depositAmount: 3406, balanceAmount: 7945,
  },
  payment: { label: "待付款" }, cancellation: { statusLabel: "無取消申請" }, actions: {},
};

function render(page: React.ReactElement, overrides: Array<[number, unknown]>) {
  state.cursor = 0;
  state.overrides = new Map(overrides);
  return renderToStaticMarkup(page);
}

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("booking room display thin adapters", () => {
  it.each([
    ["S521", "雲心 S521", "S521 雲心｜最多 2 位"],
    ["S360", "畫雲 S360", "S360 畫雲｜最多 2 位"],
    ["S521", "S521 雲心", "S521 雲心｜最多 2 位"],
    ["S521", "S521", "S521｜最多 2 位"],
    ["S521", "Generic Room", "S521 Generic Room｜最多 2 位"],
    ["S521", "Generic  Room", "S521 Generic  Room｜最多 2 位"],
    ["S521", "Room S5210", "S521 Room S5210｜最多 2 位"],
  ])("deduplicates actual master room identity without altering generic names: %s / %s", (code, publicName, expected) => {
    expect(bookingRoomLabel({ code, publicName, capacity: 2 })).toBe(expected);
  });

  it("renders the customer master publicName with exactly one room code", () => {
    const html = render(<BookingManage />, [[0, { ...managed, booking: { ...managed.booking,
      room: { ...room, code: "S521", publicName: "雲心 S521", capacity: 2 },
    } }], [1, false]]);
    expect(html).toContain("S521 雲心｜最多 2 位");
    expect(html).not.toContain("S521 雲心 S521");
  });
  it("renders room identity in both admin order list and detail", () => {
    const html = render(<AdminBookingOrders />, [[2, [order]], [3, { order, cancellation_audits: [], payment_audits: [] }], [4, false]]);
    expect(html.match(/單間｜S360 畫雲｜最多 4 位/g)).toHaveLength(2);
    for (const amount of ["11,351", "3,406", "7,945"]) expect(html).toContain(amount);
    expect(html).not.toContain("房間 1");
  });

  it("renders the pending admin request identity without villa room-plan details", () => {
    const html = render(<AdminBookings />, [[4, [order]], [12, false]]);
    expect(html).toContain("單間｜S360 畫雲｜最多 4 位");
    expect(html).not.toContain("共 5 間房");
  });

  it("renders the customer room identity, dates, guests, amounts and payment status", () => {
    const html = render(<BookingManage />, [[0, managed], [1, false]]);
    for (const text of ["單間住宿", "S360 畫雲｜最多 4 位", "2026/11/03", "2026/11/05", "成人 4", "11,351", "3,406", "7,945", "待付款"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("5 間房");
  });

  it("preserves villa configuration in customer and admin views", () => {
    const customer = render(<BookingManage />, [[0, { ...managed, booking: { ...managed.booking, stayType: "villa", roomCount: 5 } }], [1, false]]);
    expect(customer).toContain("5 間房｜雙人床 8 張｜可睡 16 人");
    expect(customer).not.toContain("S360");
    expect(customer).not.toContain("單間住宿");
    const admin = render(<AdminBookings />, [[4, [{ ...order, stay_type: "villa", room_count: 5 }]], [12, false]]);
    expect(admin).toContain("包棟 villa");
    expect(admin).toContain("共 5 間房");
  });

  it("uses the stored snapshot, supports S520 and never infers a missing room", () => {
    expect(adminBookingStayLabel({ ...order, pricing_breakdown: { room: { ...room, publicName: "Changed" } } })).toContain("S360 畫雲");
    expect(adminBookingStayLabel({ stay_type: "room", pricing_breakdown: { room: { ...room, code: "S520", publicName: "Test Room", capacity: 2 } } })).toBe("單間｜S520 Test Room｜最多 2 位");
    expect(adminBookingStayLabel({ stay_type: "room" })).toBe("單間｜房間資料未提供");
    expect(bookingRoomLabel({ code: "S360", capacity: null })).toBe("S360");
    expect(bookingRoomLabel(null)).toBe("房間資料未提供");
  });
});
