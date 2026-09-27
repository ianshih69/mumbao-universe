import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calendarEditPayload, discountLabel, pricingMonths, readCalendarInputs, type CalendarEdit } from "@/lib/bookings/calendarPriceEditor";
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
  month: string;
  onMonthChange: (month: string) => void;
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

export default function AdminPricingCalendar({ token, ruleSet, rates, specialDates, hasUnsavedDefaults, month, onMonthChange, onSaved }: Props) {
  const months = pricingMonths(ruleSet.effective_from, ruleSet.effective_to);
  const monthIndex = months.indexOf(month);
  const year = month.slice(0, 4);
  const monthLabel = `${year} 年 ${Number(month.slice(5))} 月`;
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
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

  function changeMonth(next: string) {
    if (!months.includes(next) || saving || busy.current || edit) return;
    if (next === month) return;
    setCalendar(null);
    setError("");
    setNotice("");
    onMonthChange(next);
  }

  useEffect(() => {
    if (!month) return;
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
    if (hasUnsavedDefaults) { setError("預設設定尚未儲存。請先展開設定並儲存，或按頁首「取消未儲存變更」。"); return; }
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
      if (hasUnsavedDefaults) throw new Error("請先儲存或取消尚未儲存的預設設定。");
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

  return <section className="grid min-w-0 gap-4 rounded-lg border border-[#eadfce] bg-white p-2 sm:p-5" aria-label="價格日曆">
    <div className="px-1">
      <h2 className="text-xl font-semibold text-stone-900">價格日曆</h2>
      <p className="mt-1 text-sm text-stone-600">金額皆為 NT$，10 人／晚</p>
      <p className="mt-1 text-xs text-stone-500">點選日期可修改原價與折扣</p>
    </div>
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-[#fbf7f1] p-2" aria-label="月份導覽">
      <span title={monthIndex <= 0 ? "已到房價期間第一個月" : "上個月"}>
        <Button type="button" variant="outline" className="h-11 min-w-11 px-2 sm:px-3" aria-label="上個月"
          aria-describedby={monthIndex <= 0 ? "pricing-month-range" : undefined}
          disabled={monthIndex <= 0 || saving || Boolean(edit)} onClick={() => changeMonth(months[monthIndex - 1])}>
          <ChevronLeft className="size-4" /><span className="hidden sm:inline">上個月</span>
        </Button>
      </span>
      <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" className="h-11 min-w-0 px-1 text-base font-semibold text-stone-900 sm:text-lg"
            disabled={!month || saving || Boolean(edit)} aria-label={`選擇月份：${monthLabel}`}>
            <span aria-live="polite">{monthLabel}</span><ChevronDown className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 bg-white" align="center">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-sm">年份
              <select aria-label="年份" className={inputClass} value={year} onChange={event => {
                const sameMonth = `${event.target.value}-${month.slice(5)}`;
                changeMonth(months.includes(sameMonth) ? sameMonth : months.find(value => value.startsWith(`${event.target.value}-`))!);
              }}>
                {Array.from(new Set(months.map(value => value.slice(0, 4)))).map(value => <option key={value} value={value}>{value} 年</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm">月份
              <select aria-label="月份" className={inputClass} value={month} onChange={event => { changeMonth(event.target.value); setMonthPickerOpen(false); }}>
                {months.filter(value => value.startsWith(`${year}-`)).map(value => <option key={value} value={value}>{Number(value.slice(5))} 月</option>)}
              </select>
            </label>
          </div>
        </PopoverContent>
      </Popover>
      <span title={monthIndex >= months.length - 1 ? "已到房價期間最後一個月" : "下個月"}>
        <Button type="button" variant="outline" className="h-11 min-w-11 px-2 sm:px-3" aria-label="下個月"
          aria-describedby={monthIndex >= months.length - 1 ? "pricing-month-range" : undefined}
          disabled={monthIndex < 0 || monthIndex >= months.length - 1 || saving || Boolean(edit)} onClick={() => changeMonth(months[monthIndex + 1])}>
          <span className="hidden sm:inline">下個月</span><ChevronRight className="size-4" />
        </Button>
      </span>
    </div>
    <p id="pricing-month-range" className="text-xs text-stone-500">可查看 {ruleSet.effective_from} 至 {ruleSet.effective_to}；期間外不可切換。</p>
    {(loading || !calendar || calendar.month !== month) && !error && <p role="status" className="py-10 text-center text-sm text-stone-500">{monthLabel} 價格讀取中…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {calendar?.month === month && <div className="min-w-0">
      <div className="grid min-w-0 grid-cols-7" role="grid" aria-label={`${monthLabel} 每日價格`} aria-busy={loading}>
        {["日", "一", "二", "三", "四", "五", "六"].map(day => <div key={day} role="columnheader" className="border-b border-[#eadfce] py-2 text-center text-sm text-stone-500">{day}</div>)}
        {Array.from({ length: calendar.startWeekday }, (_, index) => <div key={`blank-${index}`} role="gridcell" />)}
        {calendar.days.map((day, index) => {
          const custom = specialDates.some(row => row.rule_set_id === ruleSet.id && row.date === day.date && row.is_active
            && (row.base_price_override != null || row.calendar_discount_rate_override != null));
          const weekend = (calendar.startWeekday + index) % 7 >= 5;
          return <button key={day.date} type="button" role="gridcell" aria-label={`${day.date} 編輯價格`} aria-selected={edit?.row.date === day.date}
            disabled={!day.night || loading || saving} onClick={() => void openDay(day)}
            className={`min-h-28 min-w-0 border-b border-r border-[#eadfce] px-0.5 py-2 text-center text-[10px] leading-5 text-stone-600 transition sm:min-h-36 sm:p-3 sm:text-left sm:text-xs enabled:cursor-pointer enabled:hover:bg-[#eee3d5] focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#765d4a] aria-selected:bg-[#eadfce] disabled:text-stone-400 ${weekend ? "bg-[#fbf4e9]" : "bg-white"}`}>
            <span className="block text-sm font-medium sm:text-base">{Number(day.date.slice(-2))}</span>
            {day.night ? <><strong className={`mt-1 block font-semibold tabular-nums text-stone-950 ${day.night.price >= 1000000 ? "text-[8px]" : "text-[11px]"} sm:text-base lg:text-xl`}>
              <span className="sr-only">售價 NT$</span>{amount(day.night.price)}</strong>
              <span className="mt-1 hidden text-stone-500 sm:block">原價 {amount(day.night.base10GuestRate!)}</span>
              <span className="block">{discountLabel(day.night.calendarDiscountRate!)}</span>
              {custom && <span className="block text-[10px] font-medium text-[#765d4a] sm:text-xs">已自訂</span>}</> : <span className="block text-[10px] sm:text-xs">不適用</span>}
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
