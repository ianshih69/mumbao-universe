import { describe, expect, it } from "vitest";
import { calendarEditPayload, discountLabel, pricingMonths, readCalendarInputs, selectPricingMonth, type CalendarEdit } from "./calendarPriceEditor";

describe("pricing calendar month navigation", () => {
  const months = pricingMonths("2026-11-01", "2027-02-01");
  it("covers exactly the rule set months, including its last valid date", () => {
    expect(months).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(pricingMonths("2026-11-30", "2026-11-30")).toEqual(["2026-11"]);
  });
  it("moves across December and January without day-of-month arithmetic", () => {
    expect(months[months.indexOf("2026-12") + 1]).toBe("2027-01");
    expect(months[months.indexOf("2027-01") - 1]).toBe("2026-12");
    expect(pricingMonths("2028-01-31", "2028-03-31")).toEqual(["2028-01", "2028-02", "2028-03"]);
  });
  it("prefers an existing valid selection after reloading saved data", () => {
    expect(selectPricingMonth(months, "2027-01", new Date("2026-11-15T00:00:00Z"))).toBe("2027-01");
  });
  it("defaults to the current Taipei month when covered", () => {
    expect(selectPricingMonth(months, undefined, new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
    expect(selectPricingMonth(months, undefined, new Date("2026-12-31T16:00:00Z"))).toBe("2027-01");
  });
  it("falls back to the first period month when today or selection is outside", () => {
    expect(selectPricingMonth(months, "2026-10", new Date("2026-09-25T00:00:00Z"))).toBe("2026-11");
    expect(selectPricingMonth(months, undefined, new Date("2027-03-01T00:00:00Z"))).toBe("2026-11");
  });
  it("fails closed for empty or reversed ranges", () => {
    expect(pricingMonths("", "")).toEqual([]);
    expect(pricingMonths("2027-02-01", "2026-11-01")).toEqual([]);
    expect(selectPricingMonth([])).toBe("");
  });
});

const edit = (overrides: Partial<CalendarEdit> = {}): CalendarEdit => ({
  row: { id: "existing", rule_set_id: "rule", date: "2026-11-07", day_type: "holiday", label: "Existing holiday", is_active: true,
    base_price_override: null, calendar_discount_rate_override: null },
  initialBase: 39000, initialRate: 0.9, defaultBase: 39000, defaultRate: 0.9,
  base: "39000", percent: "90", restoring: false, ...overrides,
});
describe("daily calendar editor inheritance", () => {
  it("keeps both inherited values null when merely displaying effective prices", () => {
    expect(calendarEditPayload(edit())).toMatchObject({ base_price_override: null, calendar_discount_rate_override: null });
  });
  it("changes only base", () => {
    expect(calendarEditPayload(edit({ base: "40000" }))).toMatchObject({ base_price_override: 40000, calendar_discount_rate_override: null });
  });
  it("changes only discount", () => {
    expect(calendarEditPayload(edit({ percent: "80" }))).toMatchObject({ base_price_override: null, calendar_discount_rate_override: 0.8 });
  });
  it("changes both without changing existing non-price metadata", () => {
    expect(calendarEditPayload(edit({ base: "40000", percent: "80" }))).toEqual({ ...edit().row, base_price_override: 40000, calendar_discount_rate_override: 0.8 });
  });
  it("preserves an untouched explicit override even if equal to today's default", () => {
    const state=edit();state.row.calendar_discount_rate_override=0.9;state.base="40000";
    expect(calendarEditPayload(state).calendar_discount_rate_override).toBe(0.9);
  });
  it("restores only price columns, never deletes or mutates holiday metadata", () => {
    const state=edit({ restoring:true });state.row.base_price_override=40000;state.row.calendar_discount_rate_override=0.8;
    expect(calendarEditPayload(state)).toEqual({...edit().row,base_price_override:null,calendar_discount_rate_override:null});
    state.base="42000";
    expect(calendarEditPayload(state)).toMatchObject({base_price_override:42000,calendar_discount_rate_override:null});
  });
  it.each(["", "0", "-1", "1.5", "10000001"])("rejects invalid base %s", base => expect(()=>readCalendarInputs(base,"90")).toThrow());
  it.each(["", "0", "-1", "101", "80.001"])("rejects invalid discount %s", value => expect(()=>readCalendarInputs("25000",value)).toThrow());
  it("displays 80 percent as 8折, not 80 percent off", () => {
    expect(discountLabel(0.8)).toBe("8 折");expect(discountLabel(1)).toBe("不打折");
    expect(readCalendarInputs("25000","100")).toEqual({base:25000,rate:1});
  });
});
