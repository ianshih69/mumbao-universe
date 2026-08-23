export const bookingDayTypes = ["weekday", "friday", "holiday"];
export const bookingPackageTypes = ["villa_10", "villa_18"];
export const maxBookingPricingGuests = 23;
export const extraBedBaseGuestCount = 18;
export const extraBedUnitPrice = 800;
export const weekdaySecondNightDiscountType = "weekday_second_night_95";
export const weekdaySecondNightDiscountRate = 0.95;

const msPerDay = 24 * 60 * 60 * 1000;
const dayTypeLabels = {
  weekday: "平日",
  friday: "週五",
  holiday: "假日",
};
const packageLabels = {
  villa_10: "10 人包棟",
  villa_18: "18 人包棟",
};

function unavailableQuote({
  reason,
  checkIn = "",
  checkOut = "",
  stayType = "villa",
  adults = 0,
  children = 0,
  guestCount = 0,
  pricingGuestCount = null,
  packageType = "villa_10",
  nights = 0,
  details = {},
}) {
  return {
    status: "unavailable",
    checkIn,
    checkOut,
    stayType,
    adults,
    children,
    guestCount,
    pricingGuestCount,
    packageType,
    packageLabel: packageLabels[packageType] || packageType,
    nights,
    pricing: {
      status: "unavailable",
      reason,
      ruleSetId: null,
      ruleSetName: null,
      ruleSets: [],
      breakdown: [],
      subtotal: null,
      total: null,
      depositRate: null,
      depositAmount: null,
      balanceAmount: null,
      ...details,
    },
  };
}

export function normalizeIsoDate(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10) === raw ? raw : "";
}

export function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(checkIn, checkOut) {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.round((end - start) / msPerDay);
}

export function classifyFallbackDayType(dateText) {
  const day = new Date(`${dateText}T00:00:00Z`).getUTCDay();
  if (day === 5) return "friday";
  if (day === 6) return "holiday";
  return "weekday";
}

export function roundMoney(amount) {
  return Math.round(Number(amount));
}

function isMondayThroughThursday(dateText) {
  const day = new Date(`${dateText}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 4;
}

function shouldApplyWeekdaySecondNightDiscount({ nightIndex, firstNight, date, dayType }) {
  if (nightIndex !== 1) return false;
  if (!firstNight || firstNight.dayType !== "weekday" || dayType !== "weekday") return false;
  return isMondayThroughThursday(firstNight.date) && isMondayThroughThursday(date);
}

export function normalizeGuestCount({ guestCount, adults, children }) {
  const explicit = Number.parseInt(String(guestCount ?? ""), 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const adultCount = Number.parseInt(String(adults ?? ""), 10);
  const childCount = Number.parseInt(String(children ?? ""), 10);
  const safeAdults = Number.isInteger(adultCount) ? adultCount : 0;
  const safeChildren = Number.isInteger(childCount) ? childCount : 0;
  return safeAdults + safeChildren;
}

export function resolvePricingGuestCount(guestCount, packageType = "villa_10", dateRange = {}) {
  if (!Number.isInteger(guestCount) || guestCount <= 0) {
    return { ok: false, reason: "invalid_guest_count", pricingGuestCount: null };
  }
  if (guestCount > maxBookingPricingGuests) {
    return { ok: false, reason: "unsupported_guest_count", pricingGuestCount: null };
  }
  if (packageType === "villa_10") {
    if (guestCount >= extraBedBaseGuestCount) {
      return { ok: false, reason: "guest_count_requires_full_villa", pricingGuestCount: null };
    }
    if (guestCount <= 10) {
      return { ok: true, pricingGuestCount: 10, extraBedCount: 0, extraBedUnitPrice, extraBedAmount: 0 };
    }
    return { ok: true, pricingGuestCount: guestCount, extraBedCount: 0, extraBedUnitPrice, extraBedAmount: 0 };
  }
  if (packageType !== "villa_18") {
    return { ok: false, reason: "unsupported_package_type", pricingGuestCount: null };
  }
  if (guestCount < extraBedBaseGuestCount) {
    return { ok: false, reason: "full_villa_requires_18_guests", pricingGuestCount: null };
  }
  if (guestCount <= extraBedBaseGuestCount) {
    return { ok: true, pricingGuestCount: extraBedBaseGuestCount, extraBedCount: 0, extraBedUnitPrice, extraBedAmount: 0 };
  }
  if (guestCount <= maxBookingPricingGuests) {
    const extraBedCount = guestCount - extraBedBaseGuestCount;
    const extraBedAmount = extraBedCount * extraBedUnitPrice;
    return {
      ok: true,
      pricingGuestCount: extraBedBaseGuestCount,
      extraBedCount,
      extraBedUnitPrice,
      extraBedAmount,
    };
  }
  return { ok: false, reason: "unsupported_guest_count", pricingGuestCount: null };
}

export function normalizePackageType(value, guestCount = 0) {
  if (bookingPackageTypes.includes(value)) return value;
  return guestCount >= 18 ? "villa_18" : "villa_10";
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value));
}

async function fetchActiveRuleSetForNight(nightDate, supabaseRequest) {
  const rows = await supabaseRequest(
    `/booking_price_rule_sets?is_active=eq.true&effective_from=lte.${encodeFilterValue(
      nightDate
    )}&effective_to=gte.${encodeFilterValue(
      nightDate
    )}&select=id,name,effective_from,effective_to,deposit_rate,is_active&order=effective_from.desc&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchSpecialDate(ruleSetId, nightDate, supabaseRequest) {
  const rows = await supabaseRequest(
    `/booking_special_dates?rule_set_id=eq.${encodeFilterValue(
      ruleSetId
    )}&date=eq.${encodeFilterValue(
      nightDate
    )}&is_active=eq.true&select=id,rule_set_id,date,day_type,label,is_active&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchNightlyRate(ruleSetId, guestCount, dayType, supabaseRequest) {
  const rows = await supabaseRequest(
    `/booking_package_rates?rule_set_id=eq.${encodeFilterValue(
      ruleSetId
    )}&guest_count=eq.${guestCount}&day_type=eq.${encodeFilterValue(
      dayType
    )}&is_active=eq.true&select=id,rule_set_id,guest_count,day_type,nightly_price,is_active&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function calculateBookingQuote(input, options = {}) {
  const supabaseRequest = options.supabaseRequest;
  if (typeof supabaseRequest !== "function") {
    throw new Error("calculateBookingQuote requires a supabaseRequest function.");
  }

  const checkIn = normalizeIsoDate(input?.checkIn || input?.check_in);
  const checkOut = normalizeIsoDate(input?.checkOut || input?.check_out);
  const stayType = input?.stayType || input?.stay_type || "villa";
  const adults = Math.max(0, Number.parseInt(String(input?.adults ?? "0"), 10) || 0);
  const children = Math.max(0, Number.parseInt(String(input?.children ?? "0"), 10) || 0);
  const guestCount = normalizeGuestCount({
    guestCount: input?.guestCount || input?.guest_count,
    adults,
    children,
  });
  const packageType = normalizePackageType(
    input?.packageType || input?.package_type || input?.selectedPackageType || input?.selected_package_type,
    guestCount
  );

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return unavailableQuote({
      reason: "invalid_date_range",
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      guestCount,
      packageType,
    });
  }

  const nights = daysBetween(checkIn, checkOut);
  if (stayType !== "villa") {
    return unavailableQuote({
      reason: "unsupported_stay_type",
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      guestCount,
      packageType,
      nights,
    });
  }

  const pricingGuest = resolvePricingGuestCount(guestCount, packageType, { checkIn, checkOut });
  if (!pricingGuest.ok) {
    return unavailableQuote({
      reason: pricingGuest.reason,
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      guestCount,
      packageType,
      nights,
    });
  }

  const breakdown = [];
  const ruleSetMap = new Map();
  const rateCache = new Map();

  for (let index = 0; index < nights; index += 1) {
    const date = addDays(checkIn, index);
    const ruleSet = await fetchActiveRuleSetForNight(date, supabaseRequest);
    if (!ruleSet?.id) {
      return unavailableQuote({
        reason: "missing_rule_set",
        checkIn,
        checkOut,
        stayType,
        adults,
        children,
        guestCount,
        pricingGuestCount: pricingGuest.pricingGuestCount,
        packageType,
        nights,
        details: { missingDate: date },
      });
    }

    ruleSetMap.set(ruleSet.id, {
      id: ruleSet.id,
      name: ruleSet.name,
      effectiveFrom: ruleSet.effective_from,
      effectiveTo: ruleSet.effective_to,
      depositRate: Number(ruleSet.deposit_rate),
    });

    const specialDate = await fetchSpecialDate(ruleSet.id, date, supabaseRequest);
    const dayType = specialDate?.day_type || classifyFallbackDayType(date);
    const rateKey = `${ruleSet.id}|${pricingGuest.pricingGuestCount}|${dayType}`;
    let rate = rateCache.get(rateKey);
    if (!rateCache.has(rateKey)) {
      rate = await fetchNightlyRate(ruleSet.id, pricingGuest.pricingGuestCount, dayType, supabaseRequest);
      rateCache.set(rateKey, rate || null);
    }

    if (!rate?.nightly_price && rate?.nightly_price !== 0) {
      return unavailableQuote({
        reason: "missing_nightly_rate",
        checkIn,
        checkOut,
        stayType,
        adults,
        children,
        guestCount,
        pricingGuestCount: pricingGuest.pricingGuestCount,
        packageType,
        nights,
        details: {
          missingDate: date,
          missingDayType: dayType,
          missingGuestCount: pricingGuest.pricingGuestCount,
          missingRuleSetId: ruleSet.id,
        },
      });
    }

    const basePrice = Number(rate.nightly_price);
    const extraBedCount = pricingGuest.extraBedCount || 0;
    const nightlyExtraBedAmount = extraBedCount * extraBedUnitPrice;
    const preDiscountPrice = basePrice + nightlyExtraBedAmount;
    const hasWeekdaySecondNightDiscount = shouldApplyWeekdaySecondNightDiscount({
      nightIndex: index,
      firstNight: breakdown[0],
      date,
      dayType,
    });
    const discountRate = hasWeekdaySecondNightDiscount ? weekdaySecondNightDiscountRate : 1;
    const nightTotal = hasWeekdaySecondNightDiscount ? roundMoney(preDiscountPrice * discountRate) : preDiscountPrice;
    const discountAmount = preDiscountPrice - nightTotal;

    breakdown.push({
      date,
      dayType,
      dayTypeLabel: dayTypeLabels[dayType] || dayType,
      price: nightTotal,
      preDiscountPrice,
      discountType: hasWeekdaySecondNightDiscount ? weekdaySecondNightDiscountType : null,
      discountRate,
      discountAmount,
      baseGuestCount: pricingGuest.pricingGuestCount,
      basePrice,
      extraBedCount,
      extraBedUnitPrice,
      extraBedAmount: nightlyExtraBedAmount,
      specialDateLabel: specialDate?.label || null,
      ruleSetId: ruleSet.id,
      ruleSetName: ruleSet.name,
      actualGuestCount: guestCount,
      pricingGuestCount: pricingGuest.pricingGuestCount,
      packageType,
      packageLabel: packageLabels[packageType] || packageType,
    });
  }

  const ruleSets = Array.from(ruleSetMap.values());
  const depositRates = Array.from(new Set(ruleSets.map((ruleSet) => ruleSet.depositRate)));
  if (depositRates.length !== 1) {
    return unavailableQuote({
      reason: "mixed_deposit_rates_unsupported",
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      guestCount,
      pricingGuestCount: pricingGuest.pricingGuestCount,
      packageType,
      nights,
      details: { ruleSets },
    });
  }

  const subtotal = breakdown.reduce((total, night) => total + night.price, 0);
  const depositRate = depositRates[0];
  const depositAmount = roundMoney(subtotal * depositRate);
  const balanceAmount = subtotal - depositAmount;
  const singleRuleSet = ruleSets.length === 1 ? ruleSets[0] : null;

  return {
    status: "resolved",
    checkIn,
    checkOut,
    stayType,
    adults,
    children,
    guestCount,
    pricingGuestCount: pricingGuest.pricingGuestCount,
    packageType,
    packageLabel: packageLabels[packageType] || packageType,
    nights,
    pricing: {
      status: "resolved",
      ruleSetId: singleRuleSet?.id || null,
      ruleSetName: singleRuleSet?.name || null,
      ruleSets,
      breakdown,
      subtotal,
      total: subtotal,
      depositRate,
      depositAmount,
      balanceAmount,
    },
  };
}

export function buildBookingPricingSnapshot(quote) {
  if (quote?.pricing?.status !== "resolved") return null;
  return {
    selected_package_type: quote.packageType,
    pricing_rule_set_id: quote.pricing.ruleSetId,
    quoted_total: quote.pricing.total,
    deposit_rate: quote.pricing.depositRate,
    deposit_amount: quote.pricing.depositAmount,
    balance_amount: quote.pricing.balanceAmount,
    pricing_breakdown: quote.pricing,
    quoted_at: new Date().toISOString(),
  };
}
