import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Save } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import AdminPricingCalendar from "@/components/bookings/AdminPricingCalendar";
import AdminRoomPricing from "@/components/bookings/AdminRoomPricing";
import { getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";
import { calculateGuestBasePrice, isValidGuestFee } from "@/lib/bookings/guestBasePricing.js";
import { bookingGuestRules } from "@/lib/bookings/bookingGuestRules.js";
import { pricingMonths, selectPricingMonth } from "@/lib/bookings/calendarPriceEditor";
import {
  fetchBookingPricing,
  saveBookingPackageRates,
  saveBookingPriceRuleSet,
  type BookingPackageRate,
  type BookingPriceRuleSet,
  type BookingPricingDayType,
  type BookingSpecialDate,
} from "@/lib/bookings/adminBookingsApi";

type RuleSetForm = {
  discounts: Record<DiscountField, string>;
  id: string;
  name: string;
  effective_from: string;
  effective_to: string;
  deposit_rate: string;
  guest_11_18_fee: string;
  is_active: boolean;
  notes: string;
};

const dayTypeLabels: Record<BookingPricingDayType, string> = {
  weekday: "平日（日～四）",
  friday: "週五",
  holiday: "週六",
};
const dayTypeOrder: BookingPricingDayType[] = ["weekday", "friday", "holiday"];
const guestCounts = Array.from({ length: 11 }, (_, index) => index + 10);
const discountLabels = {
  weekday_discount_rate: "平日（日～四）",
  friday_discount_rate: "週五、週六",
} as const;
type DiscountField = keyof typeof discountLabels;
const discountFields = Object.keys(discountLabels) as DiscountField[];
function percentText(rate: number | null | undefined) {
  return rate == null ? "" : String(Number((Number(rate) * 100).toFixed(2)));
}
function percentRate(text: string) {
  if (text.trim() === "") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) < 1 || Number(text) > 100) throw new Error("折扣百分比須介於 1～100，最多兩位小數。");
  return Number((Number(text) / 100).toFixed(4));
}

const emptyRuleSetForm: RuleSetForm = {
  discounts: { weekday_discount_rate: "", friday_discount_rate: "" },
  id: "",
  name: "",
  effective_from: "",
  effective_to: "",
  deposit_rate: "0.30",
  guest_11_18_fee: "",
  is_active: true,
  notes: "",
};

function fieldClassName() {
  return "h-11 min-w-0 max-w-full rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-24 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function rateKey(guestCount: number, dayType: BookingPricingDayType) {
  return `${guestCount}:${dayType}`;
}

function normalizeRuleSetForm(ruleSet: BookingPriceRuleSet | null): RuleSetForm {
  if (!ruleSet) return emptyRuleSetForm;
  return {
    id: ruleSet.id,
    discounts: Object.fromEntries(discountFields.map(field => [field, percentText(ruleSet[field])])) as Record<DiscountField, string>,
    name: ruleSet.name || "",
    effective_from: ruleSet.effective_from || "",
    effective_to: ruleSet.effective_to || "",
    deposit_rate: String(ruleSet.deposit_rate ?? "0.30"),
    guest_11_18_fee: ruleSet.guest_11_18_fee == null ? "" : String(ruleSet.guest_11_18_fee),
    is_active: Boolean(ruleSet.is_active),
    notes: ruleSet.notes || "",
  };
}

function buildMatrixValues(rates: BookingPackageRate[], ruleSetId: string) {
  const values: Record<string, string> = {};
  for (const rate of rates) {
    if (rate.rule_set_id !== ruleSetId) continue;
    values[rateKey(rate.guest_count, rate.day_type)] = String(rate.nightly_price ?? "");
  }
  return values;
}

function formatTwd(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `NT$${amount.toLocaleString("zh-TW")}`;
}

function VillaPricing() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState(() => getAdminToken());
  const [ruleSets, setRuleSets] = useState<BookingPriceRuleSet[]>([]);
  const [rates, setRates] = useState<BookingPackageRate[]>([]);
  const [specialDates, setSpecialDates] = useState<BookingSpecialDate[]>([]);
  const [activeRuleSetId, setActiveRuleSetId] = useState("");
  const [ruleSetForm, setRuleSetForm] = useState<RuleSetForm>(emptyRuleSetForm);
  const [matrixValues, setMatrixValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedMonths, setSelectedMonths] = useState<Record<string, string>>({});
  const defaultsSection = useRef<HTMLDetailsElement>(null);
  const periodSection = useRef<HTMLDetailsElement>(null);

  const activeRuleSet = useMemo(
    () => ruleSets.find((ruleSet) => ruleSet.id === activeRuleSetId) || null,
    [activeRuleSetId, ruleSets]
  );

  const loadPricing = useCallback(async () => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    if (!nextToken) {
      setLocation("/admin/shop/login?redirect=/admin/bookings/pricing");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const data = await fetchBookingPricing(nextToken);
      setRuleSets(data.ruleSets);
      setRates(data.rates);
      setSpecialDates(data.specialDates);
      const nextActiveId =
        activeRuleSetId && data.ruleSets.some((ruleSet) => ruleSet.id === activeRuleSetId)
          ? activeRuleSetId
          : data.ruleSets.find((ruleSet) => ruleSet.is_active)?.id || data.ruleSets[0]?.id || "";
      setActiveRuleSetId(nextActiveId);
      const selected = data.ruleSets.find((ruleSet) => ruleSet.id === nextActiveId) || null;
      setRuleSetForm(normalizeRuleSetForm(selected));
      setMatrixValues(buildMatrixValues(data.rates, nextActiveId));

    } catch (loadError) {
      if (isAdminAuthError(loadError)) {
        setLocation("/admin/shop/login?redirect=/admin/bookings/pricing");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "讀取房價資料失敗。");
    } finally {
      setIsLoading(false);
    }
  }, [activeRuleSetId, setLocation]);

  useEffect(() => {
    void loadPricing();
  }, [loadPricing]);

  useEffect(() => {
    setRuleSetForm(normalizeRuleSetForm(activeRuleSet));
    setMatrixValues(buildMatrixValues(rates, activeRuleSetId));

  }, [activeRuleSet, activeRuleSetId, rates]);

  const hasUnsavedDefaults = JSON.stringify(ruleSetForm) !== JSON.stringify(normalizeRuleSetForm(activeRuleSet))
    || JSON.stringify(matrixValues) !== JSON.stringify(buildMatrixValues(rates, activeRuleSetId));
  const month = activeRuleSet ? selectPricingMonth(pricingMonths(activeRuleSet.effective_from, activeRuleSet.effective_to), selectedMonths[activeRuleSetId]) : "";

  function reviewDefaults() {
    if (defaultsSection.current) defaultsSection.current.open = true;
    if (periodSection.current) periodSection.current.open = true;
    defaultsSection.current?.scrollIntoView({ block: "start" });
  }

  function cancelDefaultEdits() {
    setRuleSetForm(normalizeRuleSetForm(activeRuleSet));
    setMatrixValues(buildMatrixValues(rates, activeRuleSetId));
    setError("");
    setMessage("");
  }

  function updateRuleSetForm<K extends keyof RuleSetForm>(field: K, value: RuleSetForm[K]) {
    setRuleSetForm((form) => ({ ...form, [field]: value }));
    setMessage("");
    setError("");
  }

  function updateMatrixValue(guestCount: number, dayType: BookingPricingDayType, value: string) {
    if (!/^\d*$/.test(value)) return;
    setMatrixValues((current) => ({
      ...current,
      [rateKey(guestCount, dayType)]: value,
    }));
    setMessage("");
    setError("");
  }

  async function handleSaveRuleSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      if (!isValidGuestFee(ruleSetForm.guest_11_18_fee)) throw new Error("請輸入第 11～18 人每人每晚加價。");
      const result = await saveBookingPriceRuleSet(token, {
        id: ruleSetForm.id || undefined,
        name: ruleSetForm.name.trim(),
        effective_from: ruleSetForm.effective_from,
        effective_to: ruleSetForm.effective_to,
        deposit_rate: Number(ruleSetForm.deposit_rate),
        guest_11_18_fee: Number(ruleSetForm.guest_11_18_fee),
        ...Object.fromEntries(discountFields.map(field => [field, percentRate(ruleSetForm.discounts[field])])),
        saturday_discount_rate: percentRate(ruleSetForm.discounts.friday_discount_rate) ?? undefined,
        is_active: ruleSetForm.is_active,
        notes: ruleSetForm.notes.trim() || null,
      });
      setMessage("房價規則期間已儲存。");
      setActiveRuleSetId(result.ruleSet.id);
      await loadPricing();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存房價規則期間失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveMatrix() {
    if (!token || !activeRuleSetId) return;
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      if (dayTypeOrder.some(dayType => !isValidGuestFee(matrixValues[rateKey(10, dayType)]))) {
        throw new Error("請填寫各日期類型的 10 人原價，空白不會視為零元。");
      }
      const payload = [10].flatMap((guestCount) =>
        dayTypeOrder.map((dayType) => ({
          rule_set_id: activeRuleSetId,
          guest_count: guestCount,
          day_type: dayType,
          nightly_price: Number(matrixValues[rateKey(guestCount, dayType)] || 0),
          is_active: true,
        }))
      );
      if (payload.some((row) => !Number.isInteger(row.nightly_price) || row.nightly_price < 0)) {
        throw new Error("請確認所有房價都是 0 以上整數。");
      }
      await saveBookingPackageRates(token, {
        rule_set_id: activeRuleSetId,
        rates: payload,
      });
      setMessage("三種 10 人原價已儲存。");
      await loadPricing();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存房價矩陣失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-[20px] border border-[#eadfce] bg-white p-6 text-sm text-stone-600 shadow-sm">
        請先登入管理後台。
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 [&>section]:min-w-0">
      <section className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">房價管理</h1>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadPricing()} disabled={isLoading || isSaving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新整理
          </Button>
        </div>
        <label className="mt-3 grid max-w-xl gap-1.5 text-sm font-medium text-stone-700">目前房價期間
          <select className={`${fieldClassName()} w-full`} value={activeRuleSetId} disabled={isLoading || isSaving || hasUnsavedDefaults}
            onChange={event => { setActiveRuleSetId(event.target.value); if (!event.target.value && periodSection.current) periodSection.current.open = true; }}>
            <option value="">新增房價期間</option>
            {ruleSets.map(ruleSet => <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}｜{ruleSet.effective_from} - {ruleSet.effective_to}</option>)}
          </select>
        </label>
        {hasUnsavedDefaults && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 border-l-2 border-[#8b6f5b] bg-[#fbf7f1] p-3 text-sm text-stone-800">
          <span>預設設定有未儲存的變更。</span>
          <Button type="button" variant="outline" onClick={reviewDefaults}>查看未儲存設定</Button>
          <Button type="button" variant="outline" disabled={isSaving} onClick={cancelDefaultEdits}>取消未儲存變更</Button>
        </div>}
        {message && <p className="mt-4 rounded-[12px] bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-[12px] bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </section>

      {activeRuleSet && !isLoading && <AdminPricingCalendar key={activeRuleSet.id} token={token}
        ruleSet={activeRuleSet} rates={rates} specialDates={specialDates}
        month={month} onMonthChange={value => setSelectedMonths(current => ({ ...current, [activeRuleSetId]: value }))}
        hasUnsavedDefaults={hasUnsavedDefaults || isSaving}
        onSaved={data => { setRuleSets(data.ruleSets); setRates(data.rates); setSpecialDates(data.specialDates); }} />}

      {isLoading && <p role="status" className="py-8 text-sm text-stone-500">房價資料讀取中…</p>}

      <details ref={defaultsSection} className="group/defaults min-w-0 border-t border-[#d9cbb9]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-4 text-lg font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
          預設原價與折扣<ChevronDown className="size-5 shrink-0 transition group-open/defaults:rotate-180" />
        </summary>
        <div className="grid gap-6 pb-4">
          <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void handleSaveMatrix(); }}>
            <div className="grid gap-4 md:grid-cols-3">
              {dayTypeOrder.map(dayType => <label key={dayType} className="grid min-w-0 gap-1.5 text-sm font-medium text-stone-700">
                {dayTypeLabels[dayType]} 10 人原價／晚（NT$）
                <input className={fieldClassName()} inputMode="numeric" value={matrixValues[rateKey(10, dayType)] || ""}
                  onChange={event => updateMatrixValue(10, dayType, event.target.value)} />
                <span className="text-xs font-normal text-stone-500">{matrixValues[rateKey(10, dayType)] ? formatTwd(matrixValues[rateKey(10, dayType)]) : "未設定"}</span>
              </label>)}
            </div>
            <Button type="submit" disabled={!activeRuleSetId || isSaving} className="justify-self-start bg-[#8b6f5b] hover:bg-[#765d4a]">
              <Save className="mr-2 size-4" />儲存三種原價
            </Button>
          </form>
          <fieldset className="grid gap-4 border-t border-[#eadfce] pt-4 md:grid-cols-2">
            <legend className="pr-3 text-base font-semibold">預設日曆折扣</legend>
            {discountFields.map(field => <label key={field} className="grid gap-1.5 text-sm font-medium text-stone-700">
              {discountLabels[field]}（%）
              <input form="pricing-rule-set" className={fieldClassName()} type="number" min="1" max="100" step="0.01" required value={ruleSetForm.discounts[field]} onInvalid={reviewDefaults}
                onChange={event => updateRuleSetForm("discounts", { ...ruleSetForm.discounts, [field]: event.target.value })} />
            </label>)}
            <Button form="pricing-rule-set" type="submit" className="justify-self-start bg-[#8b6f5b] hover:bg-[#765d4a] md:col-span-2" disabled={isSaving}>
              <Save className="mr-2 size-4" />儲存折扣、期間與加人費
            </Button>
          </fieldset>
          <details className="group/matrix min-w-0 border-t border-[#eadfce]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              查看各人數原價<ChevronDown className="size-4 group-open/matrix:rotate-180" />
            </summary>
            <p className="mb-3 text-xs text-stone-500">每晚原價・日曆與連住折扣前</p>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-sm">
                <thead><tr className="bg-[#fbf7f1] text-left text-stone-600">
                  <th className="border border-[#eadfce] px-3 py-2">人數</th>
                  {dayTypeOrder.map(dayType => <th key={dayType} className="border border-[#eadfce] px-3 py-2">{dayTypeLabels[dayType]}</th>)}
                </tr></thead>
                <tbody>{guestCounts.map(guestCount => <tr key={guestCount}>
                  <th className="border border-[#eadfce] px-3 py-2 text-left font-medium">{guestCount} 人</th>
                  {dayTypeOrder.map(dayType => <td key={dayType} className="border border-[#eadfce] px-3 py-2 tabular-nums">
                    {isValidGuestFee(matrixValues[rateKey(10, dayType)]) && isValidGuestFee(ruleSetForm.guest_11_18_fee)
                      ? formatTwd(calculateGuestBasePrice(guestCount, Number(matrixValues[rateKey(10, dayType)]), Number(ruleSetForm.guest_11_18_fee))) : "—"}
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </div>
      </details>

      <details ref={periodSection} className="group/period min-w-0 border-t border-[#d9cbb9]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-4 text-lg font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
          房價期間與加人費<ChevronDown className="size-5 shrink-0 group-open/period:rotate-180" />
        </summary>
        <form id="pricing-rule-set" className="grid gap-4 pb-4 md:grid-cols-2" onSubmit={handleSaveRuleSet} onInvalidCapture={reviewDefaults}>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            名稱
            <input className={fieldClassName()} value={ruleSetForm.name} onChange={(event) => updateRuleSetForm("name", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            訂金比例
            <input className={fieldClassName()} type="number" min="0" max="1" step="0.01" value={ruleSetForm.deposit_rate} onChange={(event) => updateRuleSetForm("deposit_rate", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            第 11～18 人每人每晚加價（NT$）
            <input className={fieldClassName()} type="number" min="0" max="10000000" step="1" value={ruleSetForm.guest_11_18_fee} onChange={event => updateRuleSetForm("guest_11_18_fee", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            第 19～20 人每人每晚加價（NT$）
            <input className={fieldClassName()} value={formatTwd(bookingGuestRules.extraAdultUnitPrice)} readOnly />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            適用開始日
            <input className={fieldClassName()} type="date" value={ruleSetForm.effective_from} onChange={(event) => updateRuleSetForm("effective_from", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            適用結束日
            <input className={fieldClassName()} type="date" value={ruleSetForm.effective_to} onChange={(event) => updateRuleSetForm("effective_to", event.target.value)} required />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700 md:col-span-2">
            <input type="checkbox" checked={ruleSetForm.is_active} onChange={(event) => updateRuleSetForm("is_active", event.target.checked)} />
            啟用此房價期間
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700 md:col-span-2">
            備註
            <textarea className={textareaClassName()} value={ruleSetForm.notes} onChange={(event) => updateRuleSetForm("notes", event.target.value)} />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              儲存期間、加人費與折扣
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}

export default function AdminBookingPricing() {
  const [tab, setTab] = useState("villa");
  const [visited, setVisited] = useState(false);
  return <div className="grid min-w-0 gap-5">
    <div role="tablist" aria-label="價格管理" className="flex border-b border-stone-200">
      {[['villa', '包棟價格'], ['room', '單間價格']].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); if (value === 'room') setVisited(true); }} className={`min-h-11 border-b-2 px-5 text-sm ${tab === value ? 'border-[#8b6f5b] font-semibold text-[#765d4a]' : 'border-transparent text-stone-500'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" aria-label="包棟價格" hidden={tab !== 'villa'}><VillaPricing /></div>
    <div role="tabpanel" aria-label="單間價格" hidden={tab !== 'room'}>{visited && <AdminRoomPricing />}</div>
  </div>;
}
