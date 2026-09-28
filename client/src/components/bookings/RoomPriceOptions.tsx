import { useEffect, useState } from "react";
import { fetchRoomPriceAvailability, isRoomOptionEligible, type RoomPriceAvailability } from "@/lib/bookings/bookingApi";
import { bookingRoomName } from "@/lib/bookings/bookingRoomDisplay";

export function useRoomPriceAvailability(checkIn: string, checkOut: string, guestCount: number, enabled = true, revision = 0) {
  const key = JSON.stringify([checkIn, checkOut, guestCount, enabled, revision]);
  const [state, setState] = useState<{ key: string; result: RoomPriceAvailability | null; error: string }>({ key: "", result: null, error: "" });
  const valid = enabled && Boolean(checkIn && checkOut && checkOut > checkIn);
  useEffect(() => {
    let cancelled = false;
    if (!valid) return;
    setState({ key, result: null, error: "" });
    fetchRoomPriceAvailability(checkIn, checkOut, guestCount)
      .then(result => { if (!cancelled) setState({ key, result, error: "" }); })
      .catch(() => { if (!cancelled) setState({ key, result: null, error: "暫時無法讀取單間房況，請重試。" }); });
    return () => { cancelled = true; };
  }, [key, valid, checkIn, checkOut, guestCount]);
  const current = valid && state.key === key;
  return { result: current ? state.result : null, error: current ? state.error : "", loading: valid && (!current || !state.result && !state.error) };
}

type Props = {
  result: RoomPriceAvailability | null;
  guestCount: number;
  checkoutEnabled?: boolean;
  selectedRoomId?: string;
  onSelect?: (roomId: string) => void;
};

export function RoomPriceOptions({ result, guestCount, checkoutEnabled = false, selectedRoomId, onSelect }: Props) {
  if (!result?.roomBookingEnabled) return null;
  const rooms = result.availableRoomOptions.filter(room => room.pricingStatus === "configured" &&
    typeof room.price === "number" && Number.isFinite(room.price) && room.price >= 0 && room.pricingBreakdown);
  if (!rooms.length) return <p role="status" className="mt-4 text-sm text-stone-500">此期間暫無可訂單間。</p>;
  const canCheckout = checkoutEnabled && result.roomCheckoutEnabled === true;
  return <section aria-label="單間房價" className="mt-6 border-t border-[#eadfce] pt-5">
    <h3 className="text-lg font-semibold text-[#765d4a]">單間房價</h3>
    {!canCheckout && <p className="mt-1 text-sm text-stone-500">單間訂房尚未開放</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map(room => {
        const eligible = isRoomOptionEligible(room, guestCount);
        const selected = selectedRoomId === room.roomId;
        return <article key={room.roomId} className="min-w-0 rounded-md border border-[#eadfce] p-4">
          <h4 className="break-words font-semibold">{bookingRoomName(room)}</h4>
          <p className="mt-1 text-sm">{room.capacity == null ? "容量待確認" : `最多 ${room.capacity} 位`}</p>
          <p className="mt-2 text-sm">{room.nights} 晚 · NT${room.price!.toLocaleString("zh-TW")}</p>
          <details className="mt-3 text-sm text-stone-600">
            <summary className="cursor-pointer">查看每晚價格</summary>
            {room.pricingBreakdown!.breakdown.map(night => <div key={night.date} className="mt-2 border-t border-[#eadfce] pt-2">
              <p>{night.date} · NT${night.finalNightPrice.toLocaleString("zh-TW")}</p>
              {night.basePrice != null && <p>Base NT${night.basePrice.toLocaleString("zh-TW")}</p>}
              {night.calendarDiscountRate != null && <p>日曆優惠 {Number((night.calendarDiscountRate * 100).toFixed(2))}%</p>}
              {night.stayDiscountRate != null && night.stayDiscountRate < 1 && <p>續住優惠 {Number((night.stayDiscountRate * 100).toFixed(2))}%</p>}
            </div>)}
          </details>
          {canCheckout && <button type="button" aria-pressed={selected} aria-label={`選擇 ${bookingRoomName(room)}`}
            disabled={!eligible || !onSelect} onClick={() => { if (eligible) onSelect?.(room.roomId); }}
            className="mt-4 min-h-11 w-full rounded-md border border-[#8b6f5b] px-3 text-sm text-[#765d4a] disabled:cursor-not-allowed disabled:opacity-40">
            {!eligible ? "不符合入住人數" : selected ? "已選擇" : "選擇"}
          </button>}
        </article>;
      })}
    </div>
  </section>;
}
