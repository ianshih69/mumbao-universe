import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPricingCalendar from "./AdminPricingCalendar";
import type { BookingPriceRuleSet } from "@/lib/bookings/adminBookingsApi";

// Run the component's handlers and effect lifecycle without replacing its month logic.
const hooks = vi.hoisted(() => ({ values: [] as any[], cursor: 0, deps: undefined as unknown[] | undefined,
  effect: undefined as (() => void | (() => void)) | undefined, cleanup: undefined as (() => void) | undefined }));
const api = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    return hooks.values[index] ?? (hooks.values[index] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (!hooks.deps || deps.some((value, index) => value !== hooks.deps![index])) {
      hooks.deps = deps;
      hooks.effect = effect;
    }
  },
}));
vi.mock("@/lib/bookings/adminBookingsApi", () => ({ previewBookingPricingCalendar: api.preview }));

const ruleSet = { id: "test", effective_from: "2026-11-01", effective_to: "2027-02-01" } as BookingPriceRuleSet;
const rates: never[] = [];
const specialDates: never[] = [];
let month: string;
let tree: React.ReactElement;
let complete: (value: unknown) => void;
const changed = vi.fn((next: string) => { month = next; });
function render() {
  hooks.cursor = 0;
  tree = AdminPricingCalendar({ token: "synthetic", ruleSet, rates, specialDates, hasUnsavedDefaults: false,
    month, onMonthChange: changed, onSaved: vi.fn() });
  if (hooks.effect) {
    hooks.cleanup?.();
    const effect = hooks.effect;
    hooks.effect = undefined;
    hooks.cleanup = effect() || undefined;
  }
}
function find(label: string): any {
  function visit(node: any): any {
    if (Array.isArray(node)) return node.map(visit).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    if (node.props?.["aria-label"] === label) return node;
    return visit(node.props?.children);
  }
  const found = visit(tree);
  if (!found) throw new Error(`Missing control: ${label}`);
  return found.props;
}
async function loaded() {
  complete({ month, startWeekday: 0, days: [] });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  render();
  expect(hooks.values[2]).toBe(false);
}
function select(label: string, value: string) { find(label).onChange({ target: { value } }); render(); }

beforeEach(() => {
  vi.stubGlobal("React", React);
  hooks.cleanup?.(); hooks.values = []; hooks.deps = undefined; hooks.effect = undefined; hooks.cleanup = undefined;
  month = "2027-01"; changed.mockClear(); api.preview.mockReset();
  api.preview.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
});
afterEach(() => vi.unstubAllGlobals());

describe("calendar same-month transitions", () => {
  it("keeps the loaded calendar and never reloads when January is reselected", async () => {
    render(); await loaded(); const calendar = hooks.values[1];
    select("月份", "2027-01"); select("月份", "2027-01");
    expect(hooks.values[1]).toBe(calendar);
    expect(hooks.values[2]).toBe(false);
    expect(changed).not.toHaveBeenCalled(); expect(api.preview).toHaveBeenCalledTimes(1);
  });
  it("clamps a year change before applying the same-month guard", async () => {
    month = "2026-11"; render(); await loaded();
    select("年份", "2027");
    expect(month).toBe("2027-01"); expect(hooks.values[1]).toBeNull(); expect(hooks.values[2]).toBe(true);
    expect(api.preview).toHaveBeenCalledTimes(2);
    await loaded(); const calendar = hooks.values[1];
    select("年份", "2027"); select("月份", "2027-01");
    expect(hooks.values[1]).toBe(calendar); expect(hooks.values[2]).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1); expect(api.preview).toHaveBeenCalledTimes(2);
  });
  it("still clears and loads exactly once for different months and both arrows", async () => {
    render(); await loaded();
    select("月份", "2027-02");
    expect(hooks.values[1]).toBeNull(); expect(hooks.values[2]).toBe(true);
    await loaded(); expect(find("下個月").disabled).toBe(true);
    find("上個月").onClick(); render(); expect(month).toBe("2027-01");
    expect(hooks.values[1]).toBeNull(); await loaded();
    find("下個月").onClick(); render(); expect(month).toBe("2027-02");
    await loaded(); expect(api.preview).toHaveBeenCalledTimes(4);
  });
});
