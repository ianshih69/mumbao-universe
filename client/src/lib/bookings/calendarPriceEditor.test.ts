import { describe, expect, it } from "vitest";
import { calendarEditPayload, discountLabel, readCalendarInputs, type CalendarEdit } from "./calendarPriceEditor";

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
