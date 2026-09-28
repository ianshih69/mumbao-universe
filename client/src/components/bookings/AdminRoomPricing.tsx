import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getAdminToken } from "@/lib/shop/adminAuth";
import { fetchRoomPricing, saveRoomPriceSettings, type RoomPricingData, type RoomRate } from "@/lib/bookings/adminBookingsApi";
import { pricingMonths, selectPricingMonth, discountLabel } from "@/lib/bookings/calendarPriceEditor";
import { roomDayPayload, roomPriceInput, roomDiscountInput, type RoomDayDraft } from "@/lib/bookings/roomPriceEditor";
import { roomNight, roundMoney } from "../../../server/bookingPricing/roomPricing.js";

const fields = ["weekday_base_price", "friday_base_price", "saturday_base_price"] as const;
const labels = ["平日（日～四）", "週五", "週六"];
const inputClass = "h-11 w-full min-w-0 rounded-md border border-stone-300 bg-white px-2 text-sm";
const money = (n: number | null | undefined) => n == null ? "未設定" : `NT$${n.toLocaleString("zh-TW")}`;
const percent = (n: number | null | undefined) => n == null ? "" : String(Number((n * 100).toFixed(2)));

export default function AdminRoomPricing() {
  const [data, setData] = useState<RoomPricingData | null>(null);
  const [periodId, setPeriodId] = useState("");
  const [month, setMonth] = useState(() => selectPricingMonth(pricingMonths("2020-01-01", "2100-12-31")));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [rateText, setRateText] = useState<Record<string, string>>({});
  const [week, setWeek] = useState("80");
  const [weekend, setWeekend] = useState("90");
  const [edit, setEdit] = useState<RoomDayDraft | null>(null);
  const period = data?.periods.find(p => p.id === periodId);
  const months = period ? pricingMonths(period.effective_from, period.effective_to) : [];
  const year = Number(month.slice(0, 4)), mm = Number(month.slice(5));
  const end = `${month}-${new Date(Date.UTC(year, mm, 0)).getUTCDate()}`;
  function defaults(next: RoomPricingData, id: string) {
    setRateText(Object.fromEntries(next.rooms.flatMap(room => fields.map(field => [room.id + field, String(next.rates.find(r => r.rule_set_id === id && r.room_id === room.id)?.[field] ?? "")]))));
    const setting = next.settings.find(s => s.rule_set_id === id);
    setWeek(percent(setting?.room_weekday_discount_rate ?? 0.8));
    setWeekend(percent(setting?.room_weekend_discount_rate ?? 0.9)); setDirty(false);
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetchRoomPricing(getAdminToken(), `${month}-01`, end).then(next => {
      if (cancelled) return;
      setData(next);
      if (!next.enabled) return;
      const p = next.periods.find(p => p.id === periodId) || next.periods.find(p => p.is_active);
      if (!p) throw new Error("尚無有效房價期間。");
      const selected = selectPricingMonth(pricingMonths(p.effective_from, p.effective_to), month);
      setPeriodId(p.id); setMonth(selected); defaults(next, p.id);
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, end, periodId]);
  function changeMonth(next: string) {
    if (!months.length || busy || edit || dirty) return;
    const target = next < months[0] ? months[0] : next > months.at(-1)! ? months.at(-1)! : next;
    if (target === month) return;
    setLoading(true); setMonth(target);
  }
  function open(date: string) {
    if (!data || !period || dirty || busy || loading) return;
    const nights = data.rooms.map(r => [r.id, roomNight(data, r.id, date)] as const);
    const first = nights[0]?.[1];
    const mode = data.sales.find(s => s.date === date)?.room_booking_enabled_override;
    const values = Object.fromEntries(nights.map(([id, n]) => [id, String(n?.basePrice ?? "")]));
    setNotice(""); setError("");
    setEdit({ date, values, initial: { ...values }, defaults: Object.fromEntries(nights.map(([id, n]) => [id, String(n?.defaultBase ?? "")])),
      percent: percent(first?.calendarDiscountRate), initialPercent: percent(first?.calendarDiscountRate), defaultPercent: percent(first?.defaultDiscount),
      salesMode: mode == null ? "default" : String(mode), initialSalesMode: mode == null ? "default" : String(mode), restoring: false });
  }
  async function save(daily: boolean) {
    if (!data || saving.current) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const payload = daily && edit ? roomDayPayload(edit) : { mode: "defaults", ruleSetId: periodId,
        weekdayDiscount: roomDiscountInput(week), weekendDiscount: roomDiscountInput(weekend),
        rates: data.rooms.map(room => ({ room_id: room.id, ...Object.fromEntries(fields.map(field => [field, roomPriceInput(rateText[room.id + field] || "")])) })) as RoomRate[] };
      await saveRoomPriceSettings(getAdminToken(), payload);
      const fresh = await fetchRoomPricing(getAdminToken(), `${month}-01`, end);
      if (!fresh.enabled) throw new Error("無法確認儲存結果。");
      setData(fresh); defaults(fresh, periodId); setEdit(null); setNotice("單間價格已儲存");
    } catch (e) { setError(e instanceof Error ? e.message : "儲存失敗，請重試。"); }
    finally { saving.current = false; setBusy(false); }
  }
  const dates = Array.from({ length: Number(end.slice(-2)) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  return <div className="grid min-w-0 gap-5">
    <h1 className="text-2xl font-semibold">單間價格</h1>
    <label className="grid gap-2 text-sm">目前房價期間<select aria-label="單間房價期間" className={inputClass} value={periodId} disabled={loading || busy || dirty || !!edit} onChange={e => setPeriodId(e.target.value)}>
      {data?.periods.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}｜{p.effective_from} - {p.effective_to}</option>)}
    </select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {dirty && <div role="status" className="flex flex-wrap items-center gap-3 border-l-2 border-amber-700 p-3 text-sm"><span>單間預設價格尚未儲存。請先儲存或取消，再編輯日期。</span><Button variant="outline" disabled={busy} onClick={() => data && defaults(data, periodId)}>取消預設變更</Button></div>}
    {data && !data.enabled && <p>此環境尚未啟用單間價格管理。</p>}
    <section aria-label="單間價格日曆" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-1">
        <Button variant="outline" aria-label="單間上個月" title={month === months[0] ? "已到房價期間起點" : "上個月"} disabled={loading || busy || dirty || !!edit || months.indexOf(month) <= 0} onClick={() => changeMonth(months[months.indexOf(month) - 1])}><ChevronLeft className="size-5" /></Button>
        <div className="flex min-w-0 gap-1"><select aria-label="單間年份" className={inputClass} value={year} disabled={loading || busy || dirty || !!edit} onChange={e => changeMonth(`${e.target.value}-${month.slice(5)}`)}>{Array.from(new Set(months.map(m => m.slice(0, 4)))).map(y => <option key={y} value={y}>{y} 年</option>)}</select>
          <select aria-label="單間月份" className={inputClass} value={month} disabled={loading || busy || dirty || !!edit} onChange={e => changeMonth(e.target.value)}>{months.filter(m => m.startsWith(String(year))).map(m => <option key={m} value={m}>{Number(m.slice(5))} 月</option>)}</select></div>
        <Button variant="outline" aria-label="單間下個月" title={month === months.at(-1) ? "已到房價期間終點" : "下個月"} disabled={loading || busy || dirty || !!edit || months.indexOf(month) >= months.length - 1} onClick={() => changeMonth(months[months.indexOf(month) + 1])}><ChevronRight className="size-5" /></Button>
      </div>
      {loading ? <p role="status" className="py-12">單間價格讀取中…</p> : data?.enabled && <div className="grid grid-cols-7 border-l border-t border-stone-200">
        {["日", "一", "二", "三", "四", "五", "六"].map(d => <div key={d} className="py-2 text-center text-xs">{d}</div>)}
        {Array.from({ length: new Date(`${month}-01T00:00:00Z`).getUTCDay() }, (_, i) => <div key={`blank${i}`} />)}
        {dates.map(date => {
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
          const enabled = data.sales.find(s => s.date === date)?.room_booking_enabled_override ?? ![5, 6].includes(weekday);
          const custom = data.overrides.some(o => o.stay_date === date && o.base_price_override != null) || data.discounts.some(o => o.stay_date === date && o.room_discount_rate_override != null);
          return <button key={date} aria-label={`${date} 單間價格`} disabled={!period || date < period.effective_from || date > period.effective_to || dirty || busy} onClick={() => open(date)} className="min-h-20 min-w-0 border-b border-r border-stone-200 p-1 text-center hover:bg-[#f4ede3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8b6f5b] disabled:opacity-40 sm:min-h-24">
            <span className="block text-base font-semibold">{Number(date.slice(-2))}</span><span className="block text-[10px] sm:text-sm">{enabled ? "單間 ON" : "僅包棟"}</span>{custom && <span className="block text-[10px] text-amber-800">已自訂</span>}
          </button>;
        })}
      </div>}
    </section>
    {data?.enabled && <details className="border-t border-stone-200"><summary className="cursor-pointer py-4 font-semibold">單間預設房價與折扣{dirty ? "（尚未儲存）" : ""}</summary>
      <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(false); }}>
        {data.rooms.map(room => <fieldset key={room.id} disabled={busy} className="grid min-w-0 grid-cols-3 gap-2 border-b border-stone-100 pb-3"><legend className="mb-2 text-sm font-semibold">{room.public_name} {room.is_fallback ? "候補" : ""}</legend>{fields.map((field, i) => <label key={field} className="grid min-w-0 gap-1 text-xs">{labels[i]}（NT$）<input aria-label={`${room.code} ${labels[i]}原價`} className={inputClass} type="number" min="1" max="10000000" step="1" value={rateText[room.id + field] || ""} onChange={e => { setRateText(v => ({ ...v, [room.id + field]: e.target.value })); setDirty(true); }} /></label>)}</fieldset>)}
        <div className="grid gap-3 sm:grid-cols-2">{[["平日（日～四）", week, setWeek], ["週五、週六", weekend, setWeekend]].map(([label, value, setter]) => <label key={String(label)} className="grid gap-1 text-sm">{String(label)}折扣（%）<input className={inputClass} required type="number" min="1" max="100" step="0.01" value={String(value)} disabled={busy} onChange={e => { (setter as (value: string) => void)(e.target.value); setDirty(true); }} /></label>)}</div>
        <Button type="submit" disabled={busy || !dirty} className="justify-self-end bg-[#8b6f5b]"><Save className="mr-2 size-4" />儲存單間預設價格</Button>
      </form>
    </details>}
    <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy) setEdit(null); }}><DialogContent className="max-h-[88vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-md" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>編輯單間價格｜{edit?.date}</DialogTitle><DialogDescription>NT$／房／晚</DialogDescription></DialogHeader>
      {edit && data && <div className="grid gap-4">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <label className="grid gap-1 text-sm">單間訂房<select aria-label="單間訂房" className={inputClass} disabled={busy} value={edit.salesMode} onChange={e => setEdit({ ...edit, salesMode: e.target.value })}><option value="default">使用預設</option><option value="true">ON</option><option value="false">OFF</option></select></label>
        <label className="grid gap-1 text-sm">當日折扣（%）<input aria-label="當日單間折扣" className={inputClass} type="number" min="1" max="100" step="0.01" disabled={busy} value={edit.percent} onChange={e => setEdit({ ...edit, percent: e.target.value })} />{Number(edit.percent) >= 1 && Number(edit.percent) <= 100 ? discountLabel(Number(edit.percent) / 100) : "未設定"}</label>
        {data.rooms.map(room => {
          const n = Number(edit.values[room.id]), rate = Number(edit.percent) / 100;
          return <label key={room.id} className="grid min-w-0 grid-cols-[1fr_1fr] items-center gap-2 border-b border-stone-100 pb-2 text-sm"><span>{room.public_name} {room.is_fallback ? "候補" : ""}<span className="block text-xs text-stone-500">{n > 0 && rate >= .01 && rate <= 1 ? money(roundMoney(n * rate)) : "未設定"}</span></span><input aria-label={`${room.code} 當日原價`} className={inputClass} type="number" min="1" max="10000000" step="1" value={edit.values[room.id]} disabled={busy} onChange={e => setEdit({ ...edit, values: { ...edit.values, [room.id]: e.target.value } })} /></label>;
        })}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setEdit({ ...edit, restoring: true, values: { ...edit.defaults }, percent: edit.defaultPercent })}>恢復價格預設</Button><Button variant="outline" disabled={busy} onClick={() => setEdit(null)}>取消</Button><Button disabled={busy} className="bg-[#8b6f5b]" onClick={() => void save(true)}>{busy ? "儲存中…" : "儲存"}</Button></div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
