import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDatePicker } from "./BookingDatePicker";

const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, pending: [] as Array<() => void> }));
const api = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("@/lib/bookings/bookingApi", () => ({ fetchBookingQuote: api.quote }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: any) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[i], (value: any) => { hooks.values[i] = typeof value === "function" ? value(hooks.values[i]) : value; }];
  },
  useRef: (initial: any) => {
    const i = hooks.cursor++;
    return hooks.values[i] ?? (hooks.values[i] = { current: initial });
  },
  useMemo: (compute: () => any, deps: any[]) => {
    const i = hooks.cursor++;
    if (!hooks.values[i] || deps.some((value, n) => value !== hooks.values[i].deps[n])) hooks.values[i] = { deps, value: compute() };
    return hooks.values[i].value;
  },
  useEffect: (effect: () => any, deps: any[]) => {
    const i = hooks.cursor++;
    const old = hooks.values[i];
    if (!old || deps.some((value, n) => value !== old.deps[n])) {
      hooks.values[i] = { deps, cleanup: old?.cleanup };
      hooks.pending.push(() => { old?.cleanup?.(); hooks.values[i].cleanup = effect(); });
    }
  },
}));

let tree: any;
let desktop: boolean;
let mediaChange: () => void;
const cancel = vi.fn();
const apply = vi.fn();
const getDay = (date: string) => ({ date, saleMode: "whole_house" as const, isAvailable: date !== "2026-11-10", remainingRooms: null, unavailableReason: null });
let props: Parameters<typeof BookingDatePicker>[0];
function render() {
  hooks.cursor = 0;
  tree = BookingDatePicker(props);
  const effects = hooks.pending.splice(0);
  effects.forEach(effect => effect());
}
function all(predicate: (node: any) => boolean) {
  const found: any[] = [];
  function visit(node: any) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return found;
}
function control(label: string) {
  const found = all(node => node.props?.["aria-label"] === label || node.type === "button" && node.props.children === label)[0];
  if (!found) throw new Error(`Missing ${label}`);
  return found.props;
}
function day(date: string) { return all(node => node.props?.["data-booking-date"] === date)[0].props; }
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); render(); } }
function clickDate(date: string) { const button = day(date); expect(button.disabled).toBe(false); button.onClick(); render(); }
const monthNames = () => all(node => node.props?.["data-booking-month"]).map(node => node.props["data-booking-month"]);

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.pending = [];
  desktop = true;
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { matchMedia: () => ({ get matches() { return desktop; }, addEventListener: (_: string, cb: () => void) => { mediaChange = cb; }, removeEventListener: vi.fn() }) });
  cancel.mockReset(); apply.mockReset(); api.quote.mockReset();
  api.quote.mockImplementation(async () => ({ pricing: { status: "resolved", total: 48750, breakdown: [] } }));
  props = { initial: { checkIn: "2026-11-02", checkOut: "2026-11-04", stayType: "villa" }, mode: "checkIn", today: "2026-09-27", minDate: "2026-11-01", maxDate: "2027-02-01", getDay,
    party: { adults: 15, children: 0, infants: 0, dogUnder10kgCount: 0, dog10To20kgCount: 0, dogOver20kgCount: 0, packageType: "villa_18", selectedRoomOptionId: "", roomCount: 6 }, onCancel: cancel, onComplete: apply };
});
afterEach(() => { hooks.values.forEach(value => value?.cleanup?.()); vi.unstubAllGlobals(); });

describe("BookingDatePicker component controls", () => {
  it("shows two desktop months, one mobile month and crosses December/January with arrows", async () => {
    render(); await settle(); expect(monthNames()).toEqual(["2026-11", "2026-12"]);
    expect(control("上一月").disabled).toBe(true);
    control("下一月").onClick(); render(); await settle(); expect(monthNames()).toEqual(["2026-12", "2027-01"]);
    control("上一月").onClick(); render(); await settle(); expect(monthNames()[0]).toBe("2026-11");
    desktop = false; mediaChange(); render(); await settle(); expect(monthNames()).toEqual(["2026-11"]);
  });
  it("keeps date edits local until complete and cancel never applies them", async () => {
    render(); await settle(); clickDate("2026-11-05"); expect(control("完成").disabled).toBe(true);
    clickDate("2026-11-07"); await settle(); expect(apply).not.toHaveBeenCalled();
    control("取消").onClick(); expect(cancel).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
    expect(props.initial.checkIn).toBe("2026-11-02");
    control("完成").onClick(); expect(apply).toHaveBeenCalledWith({ checkIn: "2026-11-05", checkOut: "2026-11-07", stayType: "villa" });
  });
  it("disables an unavailable range and restarts for earlier dates", async () => {
    render(); await settle(); clickDate("2026-11-09");
    expect(day("2026-11-11").disabled).toBe(true); expect(day("2026-11-10").disabled).toBe(false);
    clickDate("2026-11-08"); clickDate("2026-11-09"); await settle(); control("完成").onClick();
    expect(apply).toHaveBeenCalledWith({ checkIn: "2026-11-08", checkOut: "2026-11-09", stayType: "villa" });
  });
  it("fetches changed party prices instead of reusing a previous guest-count quote", async () => {
    render(); await settle(); const before = api.quote.mock.calls.length;
    props = { ...props, party: { ...props.party, adults: 18 } }; render(); await settle();
    expect(api.quote.mock.calls.length).toBeGreaterThan(before);
    expect(api.quote.mock.calls.slice(before).every(([input]) => input.adults === 18)).toBe(true);
  });
  it("ignores late quotes after fast month switches and preserves draft dates", async () => {
    const pending: Array<{ input: any; resolve: (value: any) => void }> = [];
    api.quote.mockImplementation(input => new Promise(resolve => pending.push({ input, resolve })));
    render(); render(); control("下一月").onClick(); render(); control("下一月").onClick(); render();
    expect(monthNames()).toEqual(["2027-01", "2027-02"]);
    for (const item of pending) item.resolve({ pricing: { status: "resolved", total: 1, breakdown: [{ date: item.input.checkIn, price: 1, priceAfterCalendarDiscount: 1, childFeeOriginalAmount: 0, petFeeOriginalAmount: 0 }] } });
    await settle(); expect(monthNames()).toEqual(["2027-01", "2027-02"]);
    expect(all(node => node.props?.["data-booking-date"] === "2026-11-02")).toHaveLength(0);
    expect(props.initial.checkIn).toBe("2026-11-02");
  });
});
