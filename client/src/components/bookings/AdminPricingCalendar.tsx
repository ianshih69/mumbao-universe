import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calendarEditPayload, discountLabel, readCalendarInputs, type CalendarEdit } from "@/lib/bookings/calendarPriceEditor";
import {
  fetchBookingPricing, previewBookingPricingCalendar, saveBookingSpecialDate,
  type BookingPackageRate, type BookingPriceRuleSet, type BookingSpecialDate, type BookingPricingCalendarPreview,
} from "@/lib/bookings/adminBookingsApi";

type PricingData = Awaited<ReturnType<typeof fetchBookingPricing>>;
type Props = {
  token: string;
  ruleSet: BookingPriceRuleSet;
  rates: BookingPackageRate[];
  specialDates: BookingSpecialDate[];
  hasUnsavedDefaults: boolean;
  onSaved: (data: PricingData) => void;
};
const amount = (value: number) => value.toLocaleString("zh-TW");
const percent = (rate: number) => String(Number((rate * 100).toFixed(2)));
const inputClass = "h-11 w-full min-w-0 rounded-lg border border-[#eadfce] bg-white px-3 text-base text-stone-900 focus:ring-2 focus:ring-[#eadfce]";

function previewPayload(month: string, ruleSet: BookingPriceRuleSet, rates: BookingPackageRate[], specialDates: BookingSpecialDate[]) {
  return { month, ruleSet, rates: rates.filter(row => row.rule_set_id === ruleSet.id && row.guest_count === 10),
    specialDates: specialDates.filter(row => row.rule_set_id === ruleSet.id && row.date.startsWith(month)) };
}

function dayRevision(date: string, ruleSet: BookingPriceRuleSet, rates: BookingPackageRate[], specialDates: BookingSpecialDate[]) {
  return JSON.stringify({ ruleSet, rates: rates.filter(row => row.rule_set_id === ruleSet.id).sort((a, b) => a.day_type.localeCompare(b.day_type)),
    rows: specialDates.filter(row => row.rule_set_id === ruleSet.id && row.date === date) });
}

export default function AdminPricingCalendar({ token, ruleSet, rates, specialDates, hasUnsavedDefaults, onSaved }: Props) {
  const [month, setMonth] = useState(ruleSet.effective_from.slice(0, 7));
  const [calendar, setCalendar] = useState<BookingPricingCalendarPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<CalendarEdit | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [writeCompleted, setWriteCompleted] = useState(false);
  const busy = useRef(false);
  const revision = useRef("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCalendar(null);
    setError("");
    previewBookingPricingCalendar(token, previewPayload(month, ruleSet, rates, specialDates))
      .then(result => { if (!cancelled) setCalendar(result); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "無法讀取價格日曆。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, month, ruleSet, rates, specialDates]);

  async function openDay(day: BookingPricingCalendarPreview["days"][number]) {
    if (!day.night || busy.current) return;
    setNotice("");
    if (hasUnsavedDefaults) { setError("請先儲存上方尚未儲存的設定，或按「取消未儲存變更」。"); return; }
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const existing = specialDates.find(row => row.rule_set_id === ruleSet.id && row.date === day.date && row.is_active);
      const row: BookingSpecialDate = existing ? { ...existing } : {
        rule_set_id: ruleSet.id, date: day.date, day_type: day.night.dayType, label: null, is_active: true,
        base_price_override: null, calendar_discount_rate_override: null,
      };
      const defaults = await previewBookingPricingCalendar(token, previewPayload(month, ruleSet, rates,
        [...specialDates.filter(item => item !== existing), { ...row, base_price_override: null, calendar_discount_rate_override: null }]));
      const night = defaults.days.find(item => item.date === day.date)?.night;
      if (!night || day.night.base10GuestRate == null || day.night.calendarDiscountRate == null || night.base10GuestRate == null || night.calendarDiscountRate == null) {
        throw new Error("此日期尚無可編輯的價格。");
      }
      revision.current = dayRevision(day.date, ruleSet, rates, specialDates);
      setEditError("");
      setWriteCompleted(false);
      setEdit({ row, initialBase: day.night.base10GuestRate, initialRate: day.night.calendarDiscountRate,
        defaultBase: night.base10GuestRate, defaultRate: night.calendarDiscountRate,
        base: String(day.night.base10GuestRate), percent: percent(day.night.calendarDiscountRate), restoring: false });
    } catch (e) { setError(e instanceof Error ? e.message : "無法開啟當日價格。"); }
    finally { busy.current = false; setLoading(false); }
  }

  async function saveDay() {
    if (!edit || busy.current || writeCompleted) return;
    busy.current = true;
    setSaving(true);
    setEditError("");
    let sent = false;
    try {
      if (hasUnsavedDefaults) throw new Error("請先儲存或取消上方尚未儲存的設定。");
      const payload = calendarEditPayload(edit);
      if (payload.base_price_override === (edit.row.base_price_override ?? null)
        && payload.calendar_discount_rate_override === (edit.row.calendar_discount_rate_override ?? null)) { setEdit(null); return; }
      const fresh = await fetchBookingPricing(token);
      const freshRule = fresh.ruleSets.find(row => row.id === ruleSet.id);
      if (!freshRule || dayRevision(edit.row.date, freshRule, fresh.rates, fresh.specialDates) !== revision.current) {
        throw new Error("價格資料已變更，請取消視窗並重新整理後再編輯。");
      }
      await saveBookingSpecialDate(token, payload);
      sent = true;
      setWriteCompleted(true);
      const saved = await fetchBookingPricing(token);
      const savedRow = saved.specialDates.find(row => row.rule_set_id === ruleSet.id && row.date === payload.date && row.is_active);
      if (!savedRow || (savedRow.base_price_override == null ? null : Number(savedRow.base_price_override)) !== payload.base_price_override
        || (savedRow.calendar_discount_rate_override == null ? null : Number(savedRow.calendar_discount_rate_override)) !== payload.calendar_discount_rate_override) {
        throw new Error("重新讀取的價格與本次儲存不一致。");
      }
      onSaved(saved);
      setEdit(null);
      setNotice(`${payload.date} 已儲存。`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "儲存失敗，請稍後再試。";
      setEditError(sent ? `${detail} 價格已送出，請取消視窗後重新整理，勿重複儲存。` : detail);
    } finally { busy.current = false; setSaving(false); }
  }

  let preview: { base: number; rate: number } | null = null;
  let validation = "";
  if (edit) {
    try { preview = readCalendarInputs(edit.base, edit.percent); }
    catch (e) { validation = (e as Error).message; }
  }

  return <section className="grid min-w-0 gap-4 rounded-[20px] border border-[#eadfce] bg-white p-3 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-stone-900">價格日曆 <span className="text-sm font-normal text-stone-500">10 人／1 晚</span></h2>
      <input aria-label="價格日曆月份" className={`${inputClass} max-w-48`} type="month" value={month} disabled={saving || loading} onChange={event => setMonth(event.target.value)} />
    </div>
    {loading && <p role="status" className="text-sm text-stone-500">價格讀取中…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {calendar && <div className="max-w-full overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7" role="grid" aria-label="每日價格">
        {["日", "一", "二", "三", "四", "五", "六"].map(day => <div key={day} role="columnheader" className="border-b border-[#eadfce] py-2 text-center text-sm text-stone-500">{day}</div>)}
        {Array.from({ length: calendar.startWeekday }, (_, index) => <div key={`blank-${index}`} role="gridcell" />)}
        {calendar.days.map(day => {
          const custom = specialDates.some(row => row.rule_set_id === ruleSet.id && row.date === day.date && row.is_active
            && (row.base_price_override != null || row.calendar_discount_rate_override != null));
          return <button key={day.date} type="button" role="gridcell" aria-label={`${day.date} 編輯價格`}
            disabled={!day.night || loading || saving} onClick={() => void openDay(day)}
            className="min-h-36 border-b border-r border-[#eadfce] p-2 text-left text-xs leading-5 text-stone-600 transition enabled:cursor-pointer enabled:hover:bg-[#fbf7f1] focus-visible:outline-2 focus-visible:outline-[#8b6f5b] disabled:text-stone-400">
            <span className="block text-base font-semibold text-stone-900">{Number(day.date.slice(-2))}</span>
            {day.night ? <><span className="block">10 人原價 {amount(day.night.base10GuestRate!)}</span>
              <span className="block">{discountLabel(day.night.calendarDiscountRate!)}</span>
              <strong className="block text-sm text-stone-900">售價 NT${amount(day.night.price)}</strong>
              {custom && <span className="text-xs text-[#8b6f5b]">已自訂</span>}</> : <span>不在適用期間</span>}
          </button>;
        })}
      </div>
    </div>}
    <Dialog open={Boolean(edit)} onOpenChange={open => { if (!open && !saving) setEdit(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white" showCloseButton={!saving}>
        <DialogHeader><DialogTitle className="pr-4 text-lg">編輯價格｜{edit?.row.date}</DialogTitle>
          <DialogDescription className="sr-only">10 人單晚價格</DialogDescription></DialogHeader>
        {edit && <form className="grid gap-5" onSubmit={event => { event.preventDefault(); void saveDay(); }}>
          <label className="grid gap-2 text-sm font-medium">10 人原價／晚（元）
            <input className={inputClass} type="number" inputMode="numeric" min="1" max="10000000" step="1" required disabled={saving || writeCompleted}
              value={edit.base} onChange={event => { setEdit({ ...edit, base: event.target.value }); setEditError(""); }} />
          </label>
          <label className="grid gap-2 text-sm font-medium">折扣
            <span className="flex items-center gap-3"><input className={`${inputClass} max-w-32`} type="number" inputMode="decimal" min="1" max="100" step="0.01" required disabled={saving || writeCompleted}
              value={edit.percent} onChange={event => { setEdit({ ...edit, percent: event.target.value }); setEditError(""); }} />
              <span>%</span><span>{preview && discountLabel(preview.rate)}</span></span>
          </label>
          <p aria-live="polite" className="border-y border-[#eadfce] py-4 text-sm text-stone-700">10 人折扣後售價：
            <strong className="ml-2 text-lg text-stone-900">{preview ? `NT$${amount(Math.round(preview.base * preview.rate))}` : "—"}</strong></p>
          {(editError || validation) && <p role="alert" className="text-sm text-red-700">{editError || validation}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" className="mr-auto" disabled={saving || writeCompleted} onClick={() => {
              setEdit({ ...edit, restoring: true, base: String(edit.defaultBase), percent: percent(edit.defaultRate) }); setEditError("");
            }}>恢復預設</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEdit(null)}>取消</Button>
            <Button type="submit" disabled={saving || writeCompleted || Boolean(validation)} className="bg-[#8b6f5b] hover:bg-[#765d4a]">{saving ? "儲存中…" : "儲存"}</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </section>;
}
