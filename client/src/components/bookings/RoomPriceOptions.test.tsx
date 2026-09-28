import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomPriceOptions } from "./RoomPriceOptions";
import type { RoomPriceAvailability, PricedRoomOption } from "@/lib/bookings/bookingApi";

const option = (code: string, capacity = 2): PricedRoomOption => ({ roomId: code, code, publicName: code, capacity, guestCapacityEligible: true, nights: 2, price: 5460, pricingStatus: "configured", pricingBreakdown: { breakdown: [{ date: "2026-11-02", finalNightPrice: 2800 }, { date: "2026-11-03", finalNightPrice: 2660 }] } });
let result: RoomPriceAvailability;
function html(checkoutEnabled = false, guestCount = 2) {
  return renderToStaticMarkup(<RoomPriceOptions result={result} guestCount={guestCount} checkoutEnabled={checkoutEnabled} onSelect={() => {}} />);
}
beforeEach(() => { vi.stubGlobal("React", React); result = { roomBookingEnabled: true, roomCheckoutEnabled: false, availableRoomOptions: ["S360", "S521", "S530", "S666", "S888"].map(code => option(code)) }; });

describe("API room cards", () => {
  it.each(["畫雲", "畫雲 S360", "S360 畫雲", "S360"])("does not duplicate the room code in headings or selection labels for %s", publicName => {
    result.roomCheckoutEnabled = true;
    result.availableRoomOptions = [{ ...option("S360", 4), publicName }];
    const output = html(true);
    const expected = publicName === "畫雲" ? "畫雲 S360" : publicName;
    expect(output).toContain(`>${expected}</h4>`);
    expect(output).toContain(`aria-label="選擇 ${expected}"`);
    expect(output).not.toContain("S360 S360");
  });
  it("preserves read-only preview and collapsed nightly prices when either flag is off", () => {
    const output = html(true); expect(output).toContain("NT$5,460"); expect(output).toContain("NT$2,660");
    expect(output).not.toContain("S520"); expect(output).not.toContain("<button"); expect(output).toContain("單間訂房尚未開放");
    expect(output).not.toContain("<details open");
    result.roomCheckoutEnabled = true; expect(html(false)).not.toContain("<button");
  });
  it("renders S520 only when the backend returns it", () => {
    result.availableRoomOptions = [option("S520")]; expect(html()).toContain("S520"); expect(html()).not.toContain("S360");
  });
  it("never substitutes missing room prices", () => {
    result.availableRoomOptions[0].pricingStatus = "not_configured"; result.availableRoomOptions[0].price = null;
    expect(html()).not.toContain("S360"); expect(html()).not.toContain("NT$0");
  });
  it("sales OFF renders no rooms; empty range has a non-selectable empty state", () => {
    result.roomBookingEnabled = false; expect(html()).toBe(""); result.roomBookingEnabled = true;
    result.availableRoomOptions = []; expect(html()).toContain("此期間暫無可訂單間"); expect(html()).not.toContain("<button");
  });
  it("shows capacity and disables over-capacity options, even when server eligibility is incorrectly true", () => {
    result.roomCheckoutEnabled = true; result.availableRoomOptions = [option("S521", 2)];
    expect(html(true, 4)).toContain("最多 2 位"); expect(html(true, 4)).toContain("disabled=\"\"");
    expect(html(true, 4)).toContain("不符合入住人數"); expect(html(true, 2)).not.toContain("disabled=\"\"");
  });
  it("fails closed for missing eligibility or capacity", () => {
    result.roomCheckoutEnabled = true; result.availableRoomOptions = [option("S521")];
    result.availableRoomOptions[0].guestCapacityEligible = undefined; expect(html(true)).toContain("disabled=\"\"");
    result.availableRoomOptions[0].guestCapacityEligible = true; result.availableRoomOptions[0].capacity = undefined;
    expect(html(true)).toContain("disabled=\"\"");
  });
  it("renders the selected state and responsive single-column room cards", () => {
    result.roomCheckoutEnabled = true;
    const output = renderToStaticMarkup(<RoomPriceOptions result={result} guestCount={2} checkoutEnabled selectedRoomId="S521" onSelect={() => {}} />);
    expect(output).toContain('aria-pressed="true"'); expect(output).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });
});
