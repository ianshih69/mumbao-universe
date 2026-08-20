import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Save } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { getAdminToken, isAdminAuthError } from "@/lib/shop/adminAuth";
import {
  fetchBookingPricing,
  saveBookingPackageRates,
  saveBookingPriceRuleSet,
  saveBookingSpecialDate,
  type BookingPackageRate,
  type BookingPriceRuleSet,
  type BookingPricingDayType,
  type BookingSpecialDate,
} from "@/lib/bookings/adminBookingsApi";

type RuleSetForm = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string;
  deposit_rate: string;
  is_active: boolean;
  notes: string;
};

type SpecialDateForm = {
  id: string;
  rule_set_id: string;
  date: string;
  day_type: BookingPricingDayType;
  label: string;
  is_active: boolean;
};

const dayTypeLabels: Record<BookingPricingDayType, string> = {
  weekday: "平日（日～四）",
  friday: "週五",
  holiday: "假日／連假",
};
const dayTypeOrder: BookingPricingDayType[] = ["weekday", "friday", "holiday"];
const defaultGuestCounts = Array.from({ length: 9 }, (_, index) => index + 10);

const emptyRuleSetForm: RuleSetForm = {
  id: "",
  name: "",
  effective_from: "",
  effective_to: "",
  deposit_rate: "0.30",
  is_active: true,
  notes: "",
};

const emptySpecialDateForm: SpecialDateForm = {
  id: "",
  rule_set_id: "",
  date: "",
  day_type: "holiday",
  label: "",
  is_active: true,
};

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
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
    name: ruleSet.name || "",
    effective_from: ruleSet.effective_from || "",
    effective_to: ruleSet.effective_to || "",
    deposit_rate: String(ruleSet.deposit_rate ?? "0.30"),
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
  return `TWD ${amount.toLocaleString("zh-TW")}`;
}

export default function AdminBookingPricing() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState(() => getAdminToken());
  const [ruleSets, setRuleSets] = useState<BookingPriceRuleSet[]>([]);
  const [rates, setRates] = useState<BookingPackageRate[]>([]);
  const [specialDates, setSpecialDates] = useState<BookingSpecialDate[]>([]);
  const [activeRuleSetId, setActiveRuleSetId] = useState("");
  const [ruleSetForm, setRuleSetForm] = useState<RuleSetForm>(emptyRuleSetForm);
  const [matrixValues, setMatrixValues] = useState<Record<string, string>>({});
  const [specialDateForm, setSpecialDateForm] = useState<SpecialDateForm>(emptySpecialDateForm);
  const [guestCounts, setGuestCounts] = useState(defaultGuestCounts);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeRuleSet = useMemo(
    () => ruleSets.find((ruleSet) => ruleSet.id === activeRuleSetId) || null,
    [activeRuleSetId, ruleSets]
  );
  const visibleSpecialDates = useMemo(
    () => specialDates.filter((date) => date.rule_set_id === activeRuleSetId),
    [activeRuleSetId, specialDates]
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
      setGuestCounts(data.guestCounts.length ? data.guestCounts : defaultGuestCounts);
      const nextActiveId =
        activeRuleSetId && data.ruleSets.some((ruleSet) => ruleSet.id === activeRuleSetId)
          ? activeRuleSetId
          : data.ruleSets.find((ruleSet) => ruleSet.is_active)?.id || data.ruleSets[0]?.id || "";
      setActiveRuleSetId(nextActiveId);
      const selected = data.ruleSets.find((ruleSet) => ruleSet.id === nextActiveId) || null;
      setRuleSetForm(normalizeRuleSetForm(selected));
      setMatrixValues(buildMatrixValues(data.rates, nextActiveId));
      setSpecialDateForm((current) => ({
        ...emptySpecialDateForm,
        rule_set_id: nextActiveId || current.rule_set_id,
      }));
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
    setSpecialDateForm((current) => ({
      ...emptySpecialDateForm,
      rule_set_id: activeRuleSetId || current.rule_set_id,
    }));
  }, [activeRuleSet, activeRuleSetId, rates]);

  function updateRuleSetForm<K extends keyof RuleSetForm>(field: K, value: RuleSetForm[K]) {
    setRuleSetForm((form) => ({ ...form, [field]: value }));
    setMessage("");
    setError("");
  }

  function updateSpecialDateForm<K extends keyof SpecialDateForm>(field: K, value: SpecialDateForm[K]) {
    setSpecialDateForm((form) => ({ ...form, [field]: value }));
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
      const result = await saveBookingPriceRuleSet(token, {
        id: ruleSetForm.id || undefined,
        name: ruleSetForm.name.trim(),
        effective_from: ruleSetForm.effective_from,
        effective_to: ruleSetForm.effective_to,
        deposit_rate: Number(ruleSetForm.deposit_rate),
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
      const payload = guestCounts.flatMap((guestCount) =>
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
      setMessage("房價矩陣已儲存。");
      await loadPricing();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存房價矩陣失敗。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveSpecialDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !activeRuleSetId) return;
    setIsSaving(true);
    setMessage("");
    setError("");
    try {
      await saveBookingSpecialDate(token, {
        id: specialDateForm.id || undefined,
        rule_set_id: activeRuleSetId,
        date: specialDateForm.date,
        day_type: specialDateForm.day_type,
        label: specialDateForm.label.trim() || null,
        is_active: specialDateForm.is_active,
      });
      setMessage("特殊日期已儲存。");
      await loadPricing();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存特殊日期失敗。");
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
    <div className="grid gap-6">
      <section className="rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d73]">BOOKING PRICING</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-900">房價管理</h1>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              管理正式訂房報價使用的期間、包棟矩陣與特殊日期。
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadPricing()} disabled={isLoading || isSaving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新整理
          </Button>
        </div>
        {message && <p className="mt-4 rounded-[12px] bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-4 rounded-[12px] bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      </section>

      <section className="grid gap-4 rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-900">房價期間</h2>
          <select
            className={fieldClassName()}
            value={activeRuleSetId}
            onChange={(event) => setActiveRuleSetId(event.target.value)}
          >
            <option value="">新增房價期間</option>
            {ruleSets.map((ruleSet) => (
              <option key={ruleSet.id} value={ruleSet.id}>
                {ruleSet.name}｜{ruleSet.effective_from} - {ruleSet.effective_to}
              </option>
            ))}
          </select>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveRuleSet}>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            名稱
            <input className={fieldClassName()} value={ruleSetForm.name} onChange={(event) => updateRuleSetForm("name", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            訂金比例
            <input className={fieldClassName()} type="number" min="0" max="1" step="0.01" value={ruleSetForm.deposit_rate} onChange={(event) => updateRuleSetForm("deposit_rate", event.target.value)} required />
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
              儲存期間
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stone-900">包棟房價矩陣</h2>
            <p className="mt-1 text-sm text-stone-500">逐格輸入正式房價，不使用加人公式。</p>
          </div>
          <Button type="button" onClick={() => void handleSaveMatrix()} disabled={!activeRuleSetId || isSaving} className="bg-[#8b6f5b] hover:bg-[#765d4a]">
            <Save className="mr-2 h-4 w-4" />
            儲存矩陣
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#fbf7f1] text-left text-stone-600">
                <th className="border border-[#eadfce] px-3 py-2">人數</th>
                {dayTypeOrder.map((dayType) => (
                  <th key={dayType} className="border border-[#eadfce] px-3 py-2">{dayTypeLabels[dayType]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guestCounts.map((guestCount) => (
                <tr key={guestCount}>
                  <th className="border border-[#eadfce] bg-[#fffdf9] px-3 py-2 text-left font-semibold text-stone-800">{guestCount} 人</th>
                  {dayTypeOrder.map((dayType) => (
                    <td key={dayType} className="border border-[#eadfce] px-3 py-2">
                      <input
                        className={fieldClassName()}
                        inputMode="numeric"
                        value={matrixValues[rateKey(guestCount, dayType)] || ""}
                        placeholder="0"
                        onChange={(event) => updateMatrixValue(guestCount, dayType, event.target.value)}
                      />
                      <p className="mt-1 text-xs text-stone-400">{formatTwd(matrixValues[rateKey(guestCount, dayType)])}</p>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 rounded-[20px] border border-[#eadfce] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">特殊日期</h2>
          <p className="mt-1 text-sm text-stone-500">手動指定某一晚使用平日、週五或假日價。</p>
        </div>
        <form className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto]" onSubmit={handleSaveSpecialDate}>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            日期
            <input className={fieldClassName()} type="date" value={specialDateForm.date} onChange={(event) => updateSpecialDateForm("date", event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            分類
            <select className={fieldClassName()} value={specialDateForm.day_type} onChange={(event) => updateSpecialDateForm("day_type", event.target.value as BookingPricingDayType)}>
              {dayTypeOrder.map((dayType) => (
                <option key={dayType} value={dayType}>{dayTypeLabels[dayType]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            名稱
            <input className={fieldClassName()} value={specialDateForm.label} onChange={(event) => updateSpecialDateForm("label", event.target.value)} placeholder="例：元旦" />
          </label>
          <label className="flex items-end gap-2 pb-3 text-sm font-medium text-stone-700">
            <input type="checkbox" checked={specialDateForm.is_active} onChange={(event) => updateSpecialDateForm("is_active", event.target.checked)} />
            啟用
          </label>
          <Button type="submit" className="self-end bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={!activeRuleSetId || isSaving}>
            <CalendarDays className="mr-2 h-4 w-4" />
            儲存
          </Button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#fbf7f1] text-left text-stone-600">
                <th className="border border-[#eadfce] px-3 py-2">日期</th>
                <th className="border border-[#eadfce] px-3 py-2">分類</th>
                <th className="border border-[#eadfce] px-3 py-2">名稱</th>
                <th className="border border-[#eadfce] px-3 py-2">狀態</th>
                <th className="border border-[#eadfce] px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleSpecialDates.length === 0 && (
                <tr>
                  <td className="border border-[#eadfce] px-3 py-4 text-stone-500" colSpan={5}>目前沒有特殊日期。</td>
                </tr>
              )}
              {visibleSpecialDates.map((specialDate) => (
                <tr key={specialDate.id || specialDate.date}>
                  <td className="border border-[#eadfce] px-3 py-2 font-semibold text-stone-900">{specialDate.date}</td>
                  <td className="border border-[#eadfce] px-3 py-2">{dayTypeLabels[specialDate.day_type]}</td>
                  <td className="border border-[#eadfce] px-3 py-2">{specialDate.label || "—"}</td>
                  <td className="border border-[#eadfce] px-3 py-2">{specialDate.is_active ? "啟用" : "停用"}</td>
                  <td className="border border-[#eadfce] px-3 py-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-[#765d4a] underline-offset-4 hover:underline"
                      onClick={() =>
                        setSpecialDateForm({
                          id: specialDate.id || "",
                          rule_set_id: specialDate.rule_set_id,
                          date: specialDate.date,
                          day_type: specialDate.day_type,
                          label: specialDate.label || "",
                          is_active: specialDate.is_active,
                        })
                      }
                    >
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isLoading && (
        <div className="rounded-[20px] border border-[#eadfce] bg-white p-5 text-sm text-stone-500 shadow-sm">
          房價資料讀取中…
        </div>
      )}
    </div>
  );
}
