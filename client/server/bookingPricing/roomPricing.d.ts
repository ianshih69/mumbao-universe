export type RoomNight = {
  date: string; ruleSetId: string; basePrice: number | null; defaultBase: number | null; baseOverride: number | null;
  calendarDiscountRate: number | null; defaultDiscount: number | null; discountOverride: number | null;
  stayDiscountRate: number; priceAfterCalendarDiscount: number | null; finalNightPrice: number | null;
  pricingStatus: "configured" | "not_configured";
};
export function roomNight(data: unknown, roomId: string, date: string, nightIndex?: number): RoomNight | null;
export function roundMoney(amount: number): number;
