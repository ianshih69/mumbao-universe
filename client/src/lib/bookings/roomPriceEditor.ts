import { isValidBasePriceOverride } from "./guestBasePricing.js";

export function roomPriceInput(text: string): number | null {
  if (!text.trim()) return null;
  if (!isValidBasePriceOverride(text)) throw new Error("原價須為 1～10,000,000 元的整數。");
  return Number(text);
}
export function roomDiscountInput(text: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) < 1 || Number(text) > 100) throw new Error("折扣須為 1～100%，最多兩位小數。");
  return Number((Number(text) / 100).toFixed(4));
}
export type RoomDayDraft = {
  date: string; values: Record<string, string>; initial: Record<string, string>; defaults: Record<string, string>;
  percent: string; initialPercent: string; defaultPercent: string;
  salesMode: string; initialSalesMode: string; restoring: boolean;
};
export function roomDayPayload(draft: RoomDayDraft) {
  const bases: Array<{ room_id: string; base_price_override: number | null }> = [];
  for (const [id, text] of Object.entries(draft.values)) {
    const value = roomPriceInput(text);
    if (draft.restoring) bases.push({ room_id: id, base_price_override: value === roomPriceInput(draft.defaults[id]) ? null : value });
    else if (value !== roomPriceInput(draft.initial[id])) bases.push({ room_id: id, base_price_override: value });
  }
  const result: { mode: "day"; date: string; bases: typeof bases; discount?: number | null; salesMode?: boolean | null } = { mode: "day", date: draft.date, bases };
  if (draft.restoring) result.discount = draft.percent === draft.defaultPercent ? null : roomDiscountInput(draft.percent);
  else if (draft.percent !== draft.initialPercent) result.discount = roomDiscountInput(draft.percent);
  if (draft.salesMode !== draft.initialSalesMode) result.salesMode = draft.salesMode === "default" ? null : draft.salesMode === "true";
  return result;
}
