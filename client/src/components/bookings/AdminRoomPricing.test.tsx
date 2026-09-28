import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminRoomPricing from "./AdminRoomPricing";
const h = vi.hoisted(() => ({ values: [] as any[], cursor: 0, deps: undefined as any, effect: undefined as any, cleanup: undefined as any }));
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: any) => { const i = h.cursor++; if (!(i in h.values)) h.values[i] = typeof initial === "function" ? initial() : initial; return [h.values[i], (v: any) => { h.values[i] = typeof v === "function" ? v(h.values[i]) : v; }]; },
  useRef: (initial: any) => { const i = h.cursor++; return h.values[i] ?? (h.values[i] = { current: initial }); },
  useEffect: (effect: any, deps: any[]) => { if (!h.deps || deps.some((v, i) => v !== h.deps[i])) { h.deps = deps; h.effect = effect; } },
}));
vi.mock("@/lib/shop/adminAuth", () => ({ getAdminToken: () => "synthetic" }));
vi.mock("@/lib/bookings/adminBookingsApi", () => ({ fetchRoomPricing: api.read, saveRoomPriceSettings: api.save }));
let tree: any, data: any;
function render() { h.cursor = 0; tree = AdminRoomPricing(); if (h.effect) { h.cleanup?.(); const effect = h.effect; h.effect = undefined; h.cleanup = effect(); } }
async function flush() { for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); } }
function nodes(node: any = tree): any[] { if (Array.isArray(node)) return node.flatMap(n => nodes(n ?? null)); return node && typeof node === "object" ? [node, ...nodes(node.props?.children ?? null)] : []; }
const aria = (name: string) => nodes().find(n => n.props?.["aria-label"] === name).props;
const button = (name: string) => nodes().find(n => n.props?.onClick && n.props.children === name).props;
function change(name: string, value: string) { aria(name).onChange({ target: { value } }); render(); }
beforeEach(() => {
  h.cleanup?.(); h.values = []; h.cursor = 0; h.deps = h.effect = h.cleanup = undefined; vi.clearAllMocks(); vi.stubGlobal("React", React);
  data = { enabled: true, periods: [{ id: "period", name: "TEST", is_active: true, effective_from: "2026-11-01", effective_to: "2027-01-31" }],
    rooms: ["S360", "S521", "S530", "S666", "S888", "S520"].map(code => ({ id: code, code, public_name: code, is_fallback: code === "S520" })),
    settings: [{ rule_set_id: "period", room_weekday_discount_rate: .8, room_weekend_discount_rate: .9 }], rates: [], overrides: [], discounts: [], sales: [] };
  data.rates = data.rooms.map((r: any) => ({ rule_set_id: "period", room_id: r.id, weekday_base_price: 3500, friday_base_price: 4500, saturday_base_price: 5500 }));
  api.read.mockImplementation(async () => structuredClone(data)); api.save.mockResolvedValue({ ok: true });
});
afterEach(() => { h.cleanup?.(); vi.unstubAllGlobals(); });
describe("room calendar UI", () => {
  it("starts with calendar and collapsed defaults, same month is a no-op after year clamp", async () => {
    render(); await flush(); expect(nodes().find(n => n.type === "details").props.open).toBeUndefined();
    change("單間年份", "2027"); await flush(); expect(aria("單間月份").value).toBe("2027-01");
    const requests = api.read.mock.calls.length; change("單間月份", "2027-01"); await flush();
    expect(api.read).toHaveBeenCalledTimes(requests); expect(aria("2027-01-01 單間價格").disabled).toBe(false);
    aria("單間上個月").onClick(); await flush(); expect(aria("單間月份").value).toBe("2026-12");
    aria("單間下個月").onClick(); await flush(); expect(aria("單間月份").value).toBe("2027-01"); expect(aria("單間下個月").disabled).toBe(true);
  });
  it("cancel does not save, changed room alone produces one delta", async () => {
    render(); await flush(); aria("2026-11-02 單間價格").onClick(); render();
    expect(aria("S360 當日原價").value).toBe("3500"); change("S360 當日原價", "4000");
    expect(nodes().some(n => n.props?.children === "NT$3,200")).toBe(true);
    button("取消").onClick(); render(); expect(api.save).not.toHaveBeenCalled();
    aria("2026-11-02 單間價格").onClick(); render(); expect(aria("S360 當日原價").value).toBe("3500");
    change("S360 當日原價", "4000"); button("儲存").onClick(); await flush();
    expect(api.save.mock.calls[0][1]).toEqual({ mode: "day", date: "2026-11-02", bases: [{ room_id: "S360", base_price_override: 4000 }] });
  });
  it("restore waits for save and preserves sales mode; failure keeps draft", async () => {
    data.sales = [{ date: "2026-11-02", room_booking_enabled_override: true }]; render(); await flush();
    aria("2026-11-02 單間價格").onClick(); render(); button("恢復價格預設").onClick(); render();
    expect(aria("單間訂房").value).toBe("true"); expect(api.save).not.toHaveBeenCalled();
    api.save.mockRejectedValue(new Error("Synthetic save failure")); button("儲存").onClick(); await flush();
    expect(api.save.mock.calls[0][1]).not.toHaveProperty("salesMode"); expect(api.save.mock.calls[0][1].discount).toBe(null);
    expect(aria("單間訂房").value).toBe("true"); expect(nodes().some(n => n.props?.role === "alert")).toBe(true);
  });
  it("dirty defaults remain visible and block date edits and month changes", async () => {
    render(); await flush(); change("S360 平日（日～四）原價", "4000");
    expect(aria("2026-11-02 單間價格").disabled).toBe(true); expect(aria("單間下個月").disabled).toBe(true);
    expect(nodes().some(n => n.props?.children === "單間預設價格尚未儲存。請先儲存或取消，再編輯日期。")).toBe(true);
    expect(api.save).not.toHaveBeenCalled(); button("取消預設變更").onClick(); render(); expect(aria("單間下個月").disabled).toBe(false);
  });
});
