import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchBookingQuote, type BookingPriceQuoteResult } from "@/lib/bookings/bookingApi";
import { bookingMonthDates, calendarQuoteRanges, canSelectBookingDate, firstNightDisplayPrice, formatCalendarPrice, selectBookingDate, shiftBookingMonth, type CalendarBounds, type DateSelection } from "@/lib/bookings/bookingDatePicker";
import { cn } from "@/lib/utils";
import { getBookingRangeIssue, stayTypeToSaleMode } from "@/lib/bookings/bookingCalendarView";

type QuoteInput = Parameters<typeof fetchBookingQuote>[0];
export type PickerParty = Omit<QuoteInput, "checkIn" | "checkOut" | "stayType" | "breakfastAddons">;
type Props = CalendarBounds & {
  initial: DateSelection;
  mode: "checkIn" | "checkOut";
  party: PickerParty;
  today: string;
  onCancel: () => void;
  onComplete: (selection: DateSelection) => void;
};

function monthLabel(month: string) {
  return `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;
}
const money = (value: number) => `NT$${value.toLocaleString("zh-TW")}`;
const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-sm text-[#765d4a] hover:bg-[#f3eadf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8b6f5b] disabled:cursor-not-allowed disabled:opacity-30";

export function BookingDatePicker({ initial, mode, party, today, minDate, maxDate, getDay, allowModeSelection = false, onCancel, onComplete }: Props) {
  const [selection, setSelection] = useState(initial);
  const [selectingCheckout, setSelectingCheckout] = useState(mode === "checkOut" && Boolean(initial.checkIn));
  const [month, setMonth] = useState(() => {
    const preferred = (mode === "checkOut" ? initial.checkOut || initial.checkIn : initial.checkIn).slice(0, 7);
    return preferred >= minDate.slice(0, 7) && preferred <= maxDate.slice(0, 7) ? preferred : minDate.slice(0, 7);
  });
  const [desktop, setDesktop] = useState(false);
  const [hoverDate, setHoverDate] = useState("");
  const [prices, setPrices] = useState<{ key: string; values: Record<string, number | null> }>({ key: "", values: {} });
  const [quoteState, setQuoteState] = useState<{ key: string; quote: BookingPriceQuoteResult | null; error: string }>({ key: "", quote: null, error: "" });
  const cache = useRef(new Map<string, Promise<BookingPriceQuoteResult>>());
  const partyKey = JSON.stringify(party);
  const stableParty = useMemo(() => JSON.parse(partyKey) as PickerParty, [partyKey]);
  const bounds = useMemo(() => ({ minDate, maxDate, getDay, allowModeSelection }), [minDate, maxDate, getDay, allowModeSelection]);
  const months = useMemo(() => desktop ? [month, shiftBookingMonth(month, 1)] : [month], [month, desktop]);
  const priceKey = `${partyKey}|${months.join(",")}`;
  const quoteKey = JSON.stringify([stableParty, selection]);
  const activeQuote = quoteState.key === quoteKey ? quoteState.quote : null;
  const complete = Boolean(selection.checkIn && selection.checkOut) && getBookingRangeIssue({ ...bounds, ...selection, saleMode: allowModeSelection ? "all" : stayTypeToSaleMode(selection.stayType) }) === "ok";
  const roomRange = allowModeSelection && complete && getBookingRangeIssue({ ...bounds, ...selection, saleMode: "room" }) === "ok";
  const roomDisplay = roomRange && selection.stayType === "room";
  const resolved = !roomDisplay && activeQuote?.pricing.status === "resolved";
  const nights = complete ? Math.round((Date.parse(selection.checkOut) - Date.parse(selection.checkIn)) / 86_400_000) : 0;
  const displayedPrices = prices.key === priceKey ? prices.values : {};

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ranges = months.flatMap((value) => calendarQuoteRanges(value, bounds));
    const values: Record<string, number | null> = {};
    setPrices({ key: priceKey, values });
    // Reuse month-range quotes; cap concurrent requests even when availability splits a month.
    let cursor = 0;
    async function worker() {
      while (!cancelled && cursor < ranges.length) {
        const range = ranges[cursor++];
        const input = { ...stableParty, ...range };
        const key = JSON.stringify(input);
        let request = cache.current.get(key);
        if (!request) {
          request = fetchBookingQuote(input);
          cache.current.set(key, request);
        }
        try {
          const quote = await request;
          if (cancelled) return;
          if (quote.pricing.status === "resolved") {
            for (const night of quote.pricing.breakdown) values[night.date] = firstNightDisplayPrice(night);
          } else {
            for (const date of months.flatMap(bookingMonthDates)) if (date && date >= range.checkIn && date < range.checkOut) values[date] = null;
          }
        } catch {
          if (cancelled) return;
          for (const date of months.flatMap(bookingMonthDates)) if (date && date >= range.checkIn && date < range.checkOut) values[date] = null;
        }
        if (!cancelled) setPrices({ key: priceKey, values: { ...values } });
      }
    }
    void worker();
    void worker();
    return () => { cancelled = true; };
  }, [months, bounds, stableParty, priceKey]);

  useEffect(() => {
    if (!complete || roomDisplay) return;
    let cancelled = false;
    setQuoteState({ key: quoteKey, quote: null, error: "" });
    fetchBookingQuote({ ...stableParty, ...selection })
      .then((quote) => {
        if (!cancelled) setQuoteState({ key: quoteKey, quote, error: quote.pricing.status === "resolved" ? "" : "此期間暫無可用房價，請選擇其他日期。" });
      })
      .catch(() => {
        if (!cancelled) setQuoteState({ key: quoteKey, quote: null, error: "房價讀取失敗，請稍後重新開啟日曆。" });
      });
    return () => { cancelled = true; };
  }, [complete, quoteKey, stableParty, selection, roomDisplay]);

  function moveMonth(offset: number) {
    setHoverDate("");
    setMonth((current) => {
      const next = shiftBookingMonth(current, offset);
      return next < minDate.slice(0, 7) || next > maxDate.slice(0, 7) ? current : next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent aria-describedby={undefined} className="z-[100] flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-[900px] flex-col gap-0 overflow-hidden rounded-lg border-[#eadfce] bg-[#fffdf9] p-0 text-stone-800 shadow-lg sm:max-w-[900px]">
        <div className="shrink-0 border-b border-[#eadfce] px-4 pb-3 pt-5 md:px-6">
          <DialogTitle className="pr-8 font-serif text-xl font-medium">選擇住宿日期</DialogTitle>
          <p className="mt-1 text-sm text-stone-500">{selection.checkIn ? `${selection.checkIn.replaceAll("-", "/")}${selection.checkOut ? ` — ${selection.checkOut.replaceAll("-", "/")}` : " 入住"}` : "請選擇入住日期"}</p>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" className={buttonClass} aria-label="上一月" disabled={month <= minDate.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={18} />上一月</button>
            <span className="text-xs text-stone-500">NT$／首晚</span>
            <button type="button" className={buttonClass} aria-label="下一月" disabled={month >= maxDate.slice(0, 7)} onClick={() => moveMonth(1)}>下一月<ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-2 py-4 md:px-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
            {months.map((value) => (
              <section key={value} aria-label={monthLabel(value)} data-booking-month={value} className="min-w-0">
                <h3 className="mb-4 text-center font-serif text-lg font-medium">{monthLabel(value)}</h3>
                <div className="grid grid-cols-7 text-center text-xs text-stone-500">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="mt-2 grid grid-cols-7 gap-y-1" onMouseLeave={() => setHoverDate("")}>
                  {bookingMonthDates(value).map((date, index) => {
                    if (!date) return <div key={`blank-${index}`} className="h-[60px]" />;
                    const enabled = canSelectBookingDate(date, selection, selectingCheckout, bounds);
                    const isIn = date === selection.checkIn;
                    const isOut = date === selection.checkOut;
                    const end = selectingCheckout && hoverDate > selection.checkIn ? hoverDate : selection.checkOut;
                    const inRange = Boolean(selection.checkIn && end && date >= selection.checkIn && date <= end);
                    const bookable = canSelectBookingDate(date, { ...selection, checkIn: "", checkOut: "" }, false, bounds);
                    const day = getDay(date);
                    const showRoomPrice = allowModeSelection && (selection.stayType === "room" || day.villaBookable === false);
                    const amount = showRoomPrice ? day.roomFirstNightFrom : displayedPrices[date];
                    const label = showRoomPrice ? amount == null ? "--" : `${formatCalendarPrice(amount)} 起` : amount == null ? (amount === null ? "待確認" : "…") : formatCalendarPrice(amount);
                    return (
                      <button type="button" key={date} disabled={!enabled} data-booking-date={date}
                        aria-label={`${date}${isIn ? " 入住" : isOut ? " 退房" : ""}${bookable ? `，首晚 ${amount == null ? label : money(amount)}` : enabled ? "，可退房" : "，不可入住"}`}
                        aria-pressed={isIn || isOut}
                        onMouseEnter={() => { if (enabled && selectingCheckout) setHoverDate(date); }}
                        onClick={() => {
                          const next = selectBookingDate(date, selection, selectingCheckout, bounds);
                          setSelection(next);
                          setSelectingCheckout(!next.checkOut);
                          setHoverDate("");
                        }}
                        className={cn("flex h-[60px] min-w-0 flex-col items-center justify-center gap-1 text-sm tabular-nums transition focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8b6f5b] disabled:cursor-not-allowed disabled:text-stone-300",
                          !inRange && index % 7 >= 5 && "bg-[#faf6ef]",
                          inRange && "bg-[#eee3d6]",
                          enabled && "hover:bg-[#e9dccb]",
                          isIn && "rounded-l-lg", isOut && "rounded-r-lg") }>
                        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", date === today && "ring-1 ring-[#d7c5b2]", isIn && "bg-[#80614c] font-semibold text-white", isOut && "border border-[#80614c] bg-[#fffdf9] font-semibold text-[#765d4a]")}>{Number(date.slice(8))}</span>
                        <span className={cn("text-[11px] leading-4 sm:text-xs", enabled ? "text-[#765d4a]" : "text-stone-300")}>{bookable ? label : enabled ? "退房" : showRoomPrice ? "--" : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {resolved && activeQuote && <details className="mt-4 border-t border-[#eadfce] pt-3 text-sm"><summary className="cursor-pointer py-2 text-[#765d4a]">價格明細</summary><div className="space-y-2 py-2">{activeQuote.pricing.breakdown.map((night) => <div key={night.date} className="flex justify-between"><span>{night.date}</span><span>{money(night.price)}</span></div>)}</div></details>}
        </div>
        <div className="shrink-0 border-t border-[#eadfce] bg-[#fffdf9] px-4 py-4 md:px-6" aria-live="polite">
          {!roomRange && quoteState.key === quoteKey && quoteState.error && <p role="alert" className="mb-2 text-sm text-red-700">{quoteState.error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-stone-600">{complete ? `${nights} 晚 · ${party.adults + party.children + party.infants} 位入住` : selection.checkIn ? "請選擇退房日期" : "請選擇入住日期"}</p>
              {complete && !roomDisplay && <p className="mt-1 text-lg font-semibold text-[#765d4a]">{resolved && activeQuote?.pricing.total != null ? money(activeQuote.pricing.total) : roomRange ? "請選擇住宿方式" : quoteState.error ? "房價待確認" : "房價讀取中…"}</p>}
            </div>
            <div className="flex gap-2"><button type="button" className={buttonClass} onClick={onCancel}>取消</button><button type="button" disabled={(!resolved && !roomRange) || !complete} onClick={() => onComplete(selection)} className="min-h-11 rounded-md bg-[#80614c] px-6 text-sm font-medium text-white hover:bg-[#694d3b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#80614c] disabled:opacity-40">完成</button></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
