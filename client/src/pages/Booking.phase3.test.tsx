import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Booking from "./Booking";
import { RoomPriceOptions } from "@/components/bookings/RoomPriceOptions";
import { BookingDatePicker } from "@/components/bookings/BookingDatePicker";
import { BookingApiError } from "@/lib/bookings/bookingApi";

const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, pending: [] as Array<() => void> }));
const api = vi.hoisted(() => ({ calendar: vi.fn(), quote: vi.fn(), submit: vi.fn(), roomAvailability: vi.fn(), roomResult: null as any, roomLoading: false }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[i], (value: any) => { hooks.values[i] = typeof value === "function" ? value(hooks.values[i]) : value; }];
  },
  useRef: (initial: any) => { const i = hooks.cursor++; return hooks.values[i] ?? (hooks.values[i] = { current: initial }); },
  useMemo: (compute: () => any, deps: any[]) => {
    const i = hooks.cursor++;
    if (!hooks.values[i] || deps.some((value, n) => value !== hooks.values[i].deps[n])) hooks.values[i] = { deps, value: compute() };
    return hooks.values[i].value;
  },
  useEffect: (effect: () => any, deps: any[]) => {
    const i = hooks.cursor++, old = hooks.values[i];
    if (!old || deps.some((value, n) => value !== old.deps[n])) {
      hooks.values[i] = { deps, cleanup: old?.cleanup };
      hooks.pending.push(() => { old?.cleanup?.(); hooks.values[i].cleanup = effect(); });
    }
  },
}));
vi.mock("@/contexts/CustomerAuthContext", () => ({ useCustomerAuth: () => ({ session: null }) }));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/lib/site/siteContentApi", () => ({ fetchSitePageContent: async () => ({ sections: {} }), asArray: () => [], asString: (_: any, fallback: any) => fallback }));
vi.mock("@/lib/bookings/bookingApi", async original => ({ ...await original<typeof import("@/lib/bookings/bookingApi")>(), fetchBookingCalendar: api.calendar, fetchBookingQuote: api.quote, submitBookingRequest: api.submit }));
vi.mock("@/components/bookings/RoomPriceOptions", () => ({ RoomPriceOptions: () => null,
  useRoomPriceAvailability: (...args: any[]) => { api.roomAvailability(...args); return { result: api.roomResult, loading: api.roomLoading, error: "" }; } }));

let tree: any;
let storage: Map<string, string>;
const room = { roomId: "11111111-1111-4111-8111-111111111521", code: "S521", publicName: "晴光", capacity: 2 };
function render() { hooks.cursor = 0; tree = Booking(); hooks.pending.splice(0).forEach(effect => effect()); }
async function settle() { for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); } }
function all(predicate: (node: any) => boolean) {
  const found: any[] = [];
  function visit(node: any) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    visit(node.props?.children);
  }
  visit(tree); return found;
}
function text(node: any = tree): string {
  if (Array.isArray(node)) return node.map(child => text(child ?? null)).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? text(node.props.children ?? null) : "";
}
function button(label: string) {
  const node = all(node => node.props?.onClick && text(node).trim() === label)[0];
  expect(node, `Missing button ${label}`).toBeTruthy(); return node.props;
}
function selectRoomMode() {
  const mode = all(node => node.type === "input" && node.props.value === "room")[0];
  expect(mode.props.disabled).toBe(false); mode.props.onChange(); render();
  all(node => node.type === RoomPriceOptions)[0].props.onSelect(room.roomId); render();
}
async function contactStep() {
  selectRoomMode(); await settle(); expect(button("下一步").disabled).toBe(false);
  button("下一步").onClick(); render();
  expect(text()).toContain("住宿確認"); expect(text()).not.toContain("成人早餐");
  button("下一步").onClick(); render();
  all(node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); render();
}
function submit() { return all(node => node.type === "form" && node.props.id === "booking-details-form")[0].props.onSubmit({ preventDefault() {} }); }

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.pending = []; api.roomLoading = false;
  api.calendar.mockReset(); api.quote.mockReset(); api.submit.mockReset(); api.roomAvailability.mockReset();
  vi.stubGlobal("React", React); vi.stubGlobal("crypto", { randomUUID: () => "22222222-2222-4222-8222-222222222222" });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  storage = new Map([["mumbao_booking_test_unlocked_v1", "true"], ["mumbao_booking_draft_v1", JSON.stringify({
    check_in: "2026-11-02", check_out: "2026-11-04", stay_type: "villa", adults: 2, children: 0, infants: 0,
    guest_name: "Test Guest", email: "test@example.invalid", phone: "0900000000",
  })]]);
  vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    requestAnimationFrame: (fn: () => void) => fn(), setInterval: vi.fn(), clearInterval: vi.fn() });
  api.calendar.mockResolvedValue({ unavailableDates: ["2026-11-02", "2026-11-03"], maxDate: "2027-02-01",
    days: ["2026-11-02", "2026-11-03"].map(date => ({ date, roomBookingEnabled: true, roomBookable: true, villaBookable: true, roomFirstNightFrom: 3440 })),
    settings: { bookingWindowMonths: 6, bookingWindowLabel: "6 個月", allowVillaBooking: true, allowRoomBooking: true, roomCheckoutEnabled: true, roomPricingPreviewEnabled: true, allowPets: true, totalRoomCount: 5 } });
  api.roomResult = { roomBookingEnabled: true, roomCheckoutEnabled: true, availableRoomOptions: [{ ...room, guestCapacityEligible: true, nights: 2, pricingStatus: "configured", price: 11351, pricingBreakdown: { breakdown: [] } }] };
  api.quote.mockImplementation(async (input: any) => ({ ...input, status: "resolved", packageType: input.stayType === "room" ? null : "villa_10", nights: 2,
    pricing: { status: "resolved", room: input.stayType === "room" ? room : undefined, total: 11351, lodgingSubtotal: 11351, depositRate: 0.3, depositAmount: 3405, balanceAmount: 7946, breakdown: [] } }));
});
afterEach(() => { hooks.values.forEach(value => value?.cleanup?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Booking Phase 3 public flow", () => {
  it.each([false, true])("checkout OFF ignores preview=%s and stale room data in public UI", async preview => {
    const calendar = await api.calendar();
    calendar.settings = { ...calendar.settings, allowRoomBooking: false, roomCheckoutEnabled: false, roomPricingPreviewEnabled: preview };
    api.calendar.mockResolvedValue(calendar);
    render(); await settle();
    expect(api.roomAvailability.mock.calls.every(call => call[3] === false)).toBe(true);
    expect(all(node => node.type === RoomPriceOptions)).toHaveLength(0);
    expect(all(node => node.type === "input" && node.props.value === "room")).toHaveLength(0);
    expect(text()).not.toContain("S521"); expect(text()).not.toContain("S520");
    expect(text()).not.toContain("單間房況"); expect(text()).not.toContain("單間住宿");
    const dateField = all(node => node.type === "button" && node.props.onClick && text(node).includes("入住") && text(node).includes("2026"))[0];
    expect(dateField).toBeTruthy(); dateField.props.onClick(); render();
    const picker = all(node => node.type === BookingDatePicker)[0].props;
    expect(picker.allowModeSelection).toBe(false);
    expect(picker.getDay("2026-11-02")).toMatchObject({villaBookable:true,roomBookable:false,roomFirstNightFrom:null});
    expect(api.quote.mock.calls.every(([input]) => input.stayType === "villa")).toBe(true);
  });
  it.each(["雲心", "雲心 S521"])("formats %s once in selected and submitted room summaries", async publicName => {
    api.roomResult.availableRoomOptions[0].publicName = publicName;
    render(); await settle(); selectRoomMode(); await settle();
    const expectRoomSummary = () => {
      expect(text()).toContain("雲心 S521｜最多 2 位");
      expect(text()).not.toContain("S521 S521");
    };
    expectRoomSummary();
    button("下一步").onClick(); render(); expectRoomSummary();
    button("下一步").onClick(); render(); expectRoomSummary();
    all(node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); render();
    api.submit.mockResolvedValue({ ok: true, requestId: "fixture", request: { id: "fixture", status: "payment_hold", check_in: "2026-11-02", check_out: "2026-11-04" },
      summary: { stayType: "room", room: { ...room, publicName }, adultCount: 2, childCount: 0, infantCount: 0 },
      pricing: { quotedTotal: 11351, depositAmount: 3405, balanceAmount: 7946, depositRate: 0.3, pricingBreakdown: { total: 11351, room } } });
    await submit(); render(); expectRoomSummary();
    expect(text()).toContain("訂房申請已送出");
  });
  it("keeps a 409 visible and never silently converts a room order to villa when the flag closes", async () => {
    render(); await settle(); await contactStep();
    api.calendar.mockResolvedValue({ unavailableDates: [], maxDate: "2027-02-01",
      days: ["2026-11-02", "2026-11-03"].map(date => ({ date, roomBookingEnabled: true, roomBookable: true, villaBookable: true, roomFirstNightFrom: 3440 })),
      settings: { bookingWindowMonths: 6, allowVillaBooking: true, allowRoomBooking: false, roomCheckoutEnabled: false, allowPets: true, totalRoomCount: 5 } });
    api.submit.mockRejectedValue(new BookingApiError({ status: 409, code: "room_unavailable", message: "Room is no longer available" }));
    await submit(); render(); await settle();
    expect(text()).toContain("Room is no longer available");
    expect(text()).toContain("單間住宿"); expect(text()).not.toContain("包棟住宿");
    await submit(); expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it("uses roomId quotes, hides villa add-ons and sends stable UUID retries with no client price", async () => {
    render(); await settle(); await contactStep();
    expect(api.quote).toHaveBeenLastCalledWith(expect.objectContaining({ stayType: "room", roomId: room.roomId, roomCount: 1 }));
    expect(text()).toContain("晴光 S521"); expect(text()).not.toContain("一般住宿押金");
    api.submit.mockRejectedValue(new Error("Temporary network failure"));
    await submit(); render(); await submit(); render();
    expect(api.submit).toHaveBeenCalledTimes(2);
    const first = api.submit.mock.calls[0][0], retry = api.submit.mock.calls[1][0];
    expect(retry).toEqual(first);
    expect(first).toMatchObject({ stay_type: "room", room_id: room.roomId, room_count: 1, guest_count: 2,
      client_request_id: "22222222-2222-4222-8222-222222222222", has_pets: false, breakfast_addons: [] });
    expect(first).not.toHaveProperty("price"); expect(first).not.toHaveProperty("total");
  });
  it("fails closed when availability is loading or its checkout flag changes", async () => {
    render(); await settle(); selectRoomMode(); await settle(); expect(button("下一步").disabled).toBe(false);
    api.roomResult = null; api.roomLoading = true; render(); expect(button("下一步").disabled).toBe(true);
    await settle(); expect(api.submit).not.toHaveBeenCalled();
  });
  it("does not allow a stale quote or an API-ineligible selected room", async () => {
    render(); await settle(); selectRoomMode(); await settle();
    api.roomResult.availableRoomOptions[0].guestCapacityEligible = false; render();
    expect(button("下一步").disabled).toBe(true);
  });
  it("renders immutable submitted room and money rather than the editable form", async () => {
    render(); await settle(); await contactStep();
    api.submit.mockResolvedValue({ ok: true, requestId: "fixture", request: { id: "fixture", status: "payment_hold", check_in: "2026-11-02", check_out: "2026-11-04", hold_expires_at: "2026-09-28T12:15:00Z" },
      summary: { stayType: "room", room: { ...room, publicName: "Snapshot Room" }, adultCount: 2, childCount: 0, infantCount: 0 },
      pricing: { quotedTotal: 11351, depositAmount: 3405, balanceAmount: 7946, depositRate: 0.3, pricingBreakdown: { total: 11351, room } } });
    await submit(); render();
    expect(text()).toContain("訂房申請已送出"); expect(text()).toContain("Snapshot Room S521");
    expect(text()).toContain("11,351"); expect(text()).toContain("3,405"); expect(text()).toContain("7,946");
    expect(text()).not.toContain("一般住宿押金"); expect(text()).not.toContain("包棟住宿");
  });
});
