import {
  bookingGuestRules,
  resolveAdultPricingGuestCount,
  resolveBookingGuestPlan,
  resolveBookingPetPlan,
  resolveRoomOptionSelection,
} from "../../src/lib/bookings/bookingGuestRules.js";

export { resolveBookingGuestPlan };

export const bookingDayTypes = ["weekday", "friday", "holiday"];
export const bookingPackageTypes = ["villa_10", "villa_18"];
export const maxBookingPricingGuests = bookingGuestRules.maxAdultCount;
export const maxBookingAdultGuests = bookingGuestRules.maxAdultCount;
export const maxBookingChildGuests = bookingGuestRules.maxChildCount;
export const childFeeUnitPrice = bookingGuestRules.childFeeUnitPrice;
export const extraAdultUnitPrice = bookingGuestRules.extraAdultUnitPrice;
export const breakfastAddonUnitPrice = 250;
export const consecutiveStayDiscountType = "consecutive_stay_95";
export const consecutiveStayDiscountRate = 0.95;

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
  infants = 0,
  guestCount = 0,
  pricingGuestCount = null,
  packageType = "villa_10",
  nights = 0,
  guestPlan = null,
  petPlan = null,
  details = {},
}) {
  const planDetails = guestPlan ? guestPlanPricingDetails(guestPlan) : {};
  const petDetails = petPlan ? petPlanPricingDetails(petPlan) : {};
  return {
    status: "unavailable",
    checkIn,
    checkOut,
    stayType,
    adults,
    children,
    infants,
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
      breakfastUnitPrice: breakfastAddonUnitPrice,
      breakfastAddonEntries: [],
      breakfastAddonQuantity: 0,
      breakfastAddonTotal: 0,
      ...planDetails,
      ...petDetails,
      ...details,
    },
  };
}

function guestPlanPricingDetails(guestPlan) {
  return {
    adultCount: guestPlan.adultCount,
    childCount: guestPlan.childCount,
    infantCount: guestPlan.infantCount,
    actualGuestCount: guestPlan.actualGuestCount,
    chargeableChildCount: guestPlan.chargeableChildCount,
    childFeeUnitPrice: guestPlan.childFeeUnitPrice,
    childFeeTotal: guestPlan.childFeeTotal,
    regularExtraAdultCount: guestPlan.regularExtraAdultCount,
    extraAdultCount: guestPlan.extraAdultCount,
    extraAdultUnitPrice: guestPlan.extraAdultUnitPrice,
    extraAdultFeeTotal: guestPlan.extraAdultFeeTotal,
    extraBedAdultCount: guestPlan.extraAdultCount,
    extraBedAdultUnitPrice: guestPlan.extraAdultUnitPrice,
    extraBedAdultFeeTotal: guestPlan.extraAdultFeeTotal,
    roomPlanHeadcount: guestPlan.roomPlanHeadcount,
    doubleBedCount: guestPlan.doubleBedCount,
    singleBedCount: guestPlan.singleBedCount,
    sleepCapacity: guestPlan.sleepCapacity,
    roomCountMin: guestPlan.roomCountMin,
    roomCountMax: guestPlan.roomCountMax,
    roomOptions: guestPlan.roomOptions,
    defaultRoomOptionId: guestPlan.defaultRoomOptionId,
    defaultRoomOption: guestPlan.defaultRoomOption,
  };
}

function petPlanPricingDetails(petPlan) {
  return {
    dogUnder10kgCount: petPlan.dogUnder10kgCount,
    dog10To20kgCount: petPlan.dog10To20kgCount,
    dogOver20kgCount: petPlan.dogOver20kgCount,
    dogCount: petPlan.dogCount,
    petFeeBreakdown: petPlan.petFeeBreakdown,
    nightlyPetFeeAmount: petPlan.nightlyPetFeeAmount,
    nightlyPetFeeOriginalAmount: petPlan.nightlyPetFeeOriginalAmount,
    discountedNightlyPetFeeAmount: petPlan.discountedNightlyPetFeeAmount,
    discountedPetNightCount: petPlan.discountedPetNightCount,
    petFeeDiscountRate: petPlan.petFeeDiscountRate,
    petFeeOriginalTotal: petPlan.petFeeOriginalTotal,
    petFeeDiscountTotal: petPlan.petFeeDiscountTotal,
    petFeeTotal: petPlan.petFeeTotal,
    petDepositAmount: petPlan.petDepositAmount,
  };
}

function selectedRoomOptionPricingDetails(selectedRoomOption) {
  return selectedRoomOption
    ? {
        selectedRoomOptionId: selectedRoomOption.id,
        selectedRoomOption,
      }
    : {};
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

function parseBreakfastAddons(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeBreakfastAddonEntries(value, { checkIn, checkOut } = {}) {
  const rawEntries = parseBreakfastAddons(value);
  if (!rawEntries) {
    return {
      ok: false,
      reason: "invalid_breakfast_addons",
      entries: [],
      quantity: 0,
      total: 0,
    };
  }

  const quantitiesByDate = new Map();
  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      return {
        ok: false,
        reason: "invalid_breakfast_addon_entry",
        entries: [],
        quantity: 0,
        total: 0,
      };
    }

    const date = normalizeIsoDate(rawEntry.date);
    if (!date || date <= checkIn || date > checkOut) {
      return {
        ok: false,
        reason: "invalid_breakfast_addon_date",
        entries: [],
        quantity: 0,
        total: 0,
      };
    }

    const quantity = Number(rawEntry.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return {
        ok: false,
        reason: "invalid_breakfast_addon_quantity",
        entries: [],
        quantity: 0,
        total: 0,
      };
    }

    if (quantity > 0) {
      quantitiesByDate.set(date, (quantitiesByDate.get(date) || 0) + quantity);
    }
  }

  const entries = Array.from(quantitiesByDate.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, quantity]) => ({
      date,
      quantity,
      unitPrice: breakfastAddonUnitPrice,
      subtotal: quantity * breakfastAddonUnitPrice,
    }));
  const quantity = entries.reduce((total, entry) => total + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.subtotal, 0);

  return {
    ok: true,
    reason: null,
    entries,
    quantity,
    total,
  };
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

function shouldApplyConsecutiveStayDiscount({ nightIndex }) {
  return nightIndex > 0;
}

export function normalizeGuestCount({ guestCount, adults, children, infants }) {
  const explicit = Number.parseInt(String(guestCount ?? ""), 10);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const adultCount = Number.parseInt(String(adults ?? ""), 10);
  const childCount = Number.parseInt(String(children ?? ""), 10);
  const infantCount = Number.parseInt(String(infants ?? ""), 10);
  const safeAdults = Number.isInteger(adultCount) ? adultCount : 0;
  const safeChildren = Number.isInteger(childCount) ? childCount : 0;
  const safeInfants = Number.isInteger(infantCount) ? infantCount : 0;
  return safeAdults + safeChildren + safeInfants;
}

export function resolvePricingGuestCount(guestCount, packageType = "villa_10") {
  if (!Number.isInteger(guestCount) || guestCount <= 0) {
    return { ok: false, reason: "invalid_guest_count", pricingGuestCount: null };
  }
  const resolved = resolveAdultPricingGuestCount({ adults: guestCount, children: 0, infants: 0 }, packageType);
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, pricingGuestCount: null, plan: resolved.plan };
  }
  return {
    ok: true,
    pricingGuestCount: resolved.pricingGuestCount,
    rateGuestCount:
      resolved.plan.extraAdultCount > 0 ? bookingGuestRules.fullVillaAdultCount : resolved.pricingGuestCount,
    regularExtraAdultCount: resolved.plan.regularExtraAdultCount,
    extraAdultCount: resolved.plan.extraAdultCount,
    extraAdultUnitPrice: bookingGuestRules.extraAdultUnitPrice,
    extraAdultFeeTotal: 0,
    extraBedAdultCount: resolved.plan.extraAdultCount,
    extraBedAdultUnitPrice: bookingGuestRules.extraAdultUnitPrice,
    extraBedAdultFeeTotal: 0,
    extraBedCount: 0,
    extraBedAmount: 0,
    plan: resolved.plan,
    ...guestPlanPricingDetails(resolved.plan),
  };
}

export function normalizePackageType(value, adultCount = 0) {
  if (bookingPackageTypes.includes(value)) return value;
  return adultCount >= bookingGuestRules.fullVillaAdultCount ? "villa_18" : "villa_10";
}

function normalizePricingGuest({ adults, children, infants, nights, packageType }) {
  const resolved = resolveAdultPricingGuestCount({ adults, children, infants, nights }, packageType);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      pricingGuestCount: null,
      plan: resolved.plan,
    };
  }
  return {
    ok: true,
    reason: "",
    pricingGuestCount: resolved.pricingGuestCount,
    plan: resolved.plan,
  };
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
  const infants = Math.max(0, Number.parseInt(String(input?.infants ?? "0"), 10) || 0);
  const dogUnder10kgCount = Math.max(
    0,
    Number.parseInt(String(input?.dogUnder10kgCount ?? input?.dog_under_10kg_count ?? "0"), 10) || 0
  );
  const dog10To20kgCount = Math.max(
    0,
    Number.parseInt(String(input?.dog10To20kgCount ?? input?.dog_10_to_20kg_count ?? "0"), 10) || 0
  );
  const dogOver20kgCount = Math.max(
    0,
    Number.parseInt(String(input?.dogOver20kgCount ?? input?.dog_over_20kg_count ?? "0"), 10) || 0
  );
  const selectedRoomOptionId = input?.selectedRoomOptionId || input?.selected_room_option_id || "";
  const guestCount = normalizeGuestCount({
    guestCount: input?.guestCount || input?.guest_count,
    adults,
    children,
    infants,
  });
  const packageType = normalizePackageType(
    input?.packageType || input?.package_type || input?.selectedPackageType || input?.selected_package_type,
    adults
  );

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return unavailableQuote({
      reason: "invalid_date_range",
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      infants,
      guestCount,
      packageType,
    });
  }

  const nights = daysBetween(checkIn, checkOut);
  const guestPlan = resolveBookingGuestPlan({ adults, children, infants, nights });
  const petPlan = resolveBookingPetPlan({
    dogUnder10kgCount,
    dog10To20kgCount,
    dogOver20kgCount,
    nights,
  });
  const breakfastPlan = normalizeBreakfastAddonEntries(input?.breakfastAddons ?? input?.breakfast_addons, {
    checkIn,
    checkOut,
  });
  if (!breakfastPlan.ok) {
    return unavailableQuote({
      reason: breakfastPlan.reason,
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      infants,
      guestCount,
      packageType,
      nights,
      guestPlan,
      petPlan,
    });
  }
  if (stayType !== "villa") {
    return unavailableQuote({
      reason: "unsupported_stay_type",
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      infants,
      guestCount,
      packageType,
      nights,
      guestPlan,
      petPlan,
    });
  }
  const pricingGuest = normalizePricingGuest({ adults, children, infants, nights, packageType });
  if (!pricingGuest.ok) {
    return unavailableQuote({
      reason: pricingGuest.reason,
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      infants,
      guestCount,
      packageType,
      nights,
      guestPlan: pricingGuest.plan,
      petPlan,
    });
  }

  const roomOptionSelection = resolveRoomOptionSelection(pricingGuest.plan, selectedRoomOptionId);
  if (!roomOptionSelection.ok) {
    return unavailableQuote({
      reason: roomOptionSelection.reason,
      checkIn,
      checkOut,
      stayType,
      adults,
      children,
      infants,
      guestCount,
      pricingGuestCount: pricingGuest.pricingGuestCount,
      packageType,
      nights,
      guestPlan: pricingGuest.plan,
      petPlan,
      details: { selectedRoomOptionId: selectedRoomOptionId || null },
    });
  }

  const breakdown = [];
  const ruleSetMap = new Map();
  const rateCache = new Map();
  async function fetchCachedNightlyRate(ruleSetId, guestCount, dayType) {
    const rateKey = `${ruleSetId}|${guestCount}|${dayType}`;
    if (!rateCache.has(rateKey)) {
      const nextRate = await fetchNightlyRate(ruleSetId, guestCount, dayType, supabaseRequest);
      rateCache.set(rateKey, nextRate || null);
    }
    return rateCache.get(rateKey);
  }

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
        infants,
        guestCount,
        pricingGuestCount: pricingGuest.pricingGuestCount,
        packageType,
        nights,
        guestPlan,
        petPlan,
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
    const rateGuestCount =
      pricingGuest.plan.extraAdultCount > 0 ? bookingGuestRules.fullVillaAdultCount : pricingGuest.pricingGuestCount;
    const rate = await fetchCachedNightlyRate(ruleSet.id, rateGuestCount, dayType);

    if (!rate?.nightly_price && rate?.nightly_price !== 0) {
      return unavailableQuote({
        reason: "missing_nightly_rate",
        checkIn,
        checkOut,
        stayType,
        adults,
        children,
        infants,
        guestCount,
        pricingGuestCount: pricingGuest.pricingGuestCount,
        packageType,
        nights,
        guestPlan,
        petPlan,
        details: {
          missingDate: date,
          missingDayType: dayType,
          missingGuestCount: rateGuestCount,
          requestedPricingGuestCount: pricingGuest.pricingGuestCount,
          missingRuleSetId: ruleSet.id,
        },
      });
    }

    const basePrice = Number(rate.nightly_price);
    const base10Rate = await fetchCachedNightlyRate(ruleSet.id, bookingGuestRules.basePackageGuestCount, dayType);
    const adult18Rate = await fetchCachedNightlyRate(ruleSet.id, bookingGuestRules.fullVillaAdultCount, dayType);
    const base10GuestRate =
      base10Rate?.nightly_price || base10Rate?.nightly_price === 0 ? Number(base10Rate.nightly_price) : null;
    const adult18GuestRate =
      adult18Rate?.nightly_price || adult18Rate?.nightly_price === 0 ? Number(adult18Rate.nightly_price) : null;
    const regularExtraAdultCount = pricingGuest.plan.regularExtraAdultCount;
    const extraBedAdultCount = pricingGuest.plan.extraAdultCount;
    const extraBedAdultRate = bookingGuestRules.extraAdultUnitPrice;
    const extraBedAdultFeeAmount = extraBedAdultCount * extraBedAdultRate;
    const canBuildRegularAdultBreakdown = Number.isFinite(base10GuestRate) && Number.isFinite(adult18GuestRate);
    const adultIncrementRate = canBuildRegularAdultBreakdown
      ? (adult18GuestRate - base10GuestRate) /
        (bookingGuestRules.fullVillaAdultCount - bookingGuestRules.basePackageGuestCount)
      : null;
    const regularExtraAdultFeeAmount = adultIncrementRate == null ? 0 : regularExtraAdultCount * adultIncrementRate;
    const adultBreakdownTargetPrice = extraBedAdultCount > 0 ? adult18GuestRate : basePrice;
    const regularAdultBreakdownMatches =
      canBuildRegularAdultBreakdown &&
      Number.isFinite(adultBreakdownTargetPrice) &&
      Math.abs(base10GuestRate + regularExtraAdultFeeAmount - adultBreakdownTargetPrice) < 0.0001;
    const nightlyExtraAdultFeeAmount = pricingGuest.plan.extraAdultCount * bookingGuestRules.extraAdultUnitPrice;
    const nightlyChildFeeOriginalAmount = pricingGuest.plan.chargeableChildCount * bookingGuestRules.childFeeUnitPrice;
    const adultLodgingPreDiscountAmount = basePrice + nightlyExtraAdultFeeAmount;
    const hasConsecutiveStayDiscount = shouldApplyConsecutiveStayDiscount({ nightIndex: index });
    const discountRate = hasConsecutiveStayDiscount ? consecutiveStayDiscountRate : 1;
    const adultLodgingAmount = hasConsecutiveStayDiscount
      ? roundMoney(adultLodgingPreDiscountAmount * discountRate)
      : adultLodgingPreDiscountAmount;
    const nightlyChildFeeAmount = hasConsecutiveStayDiscount
      ? roundMoney(nightlyChildFeeOriginalAmount * discountRate)
      : nightlyChildFeeOriginalAmount;
    const nightlyPetOriginalAmount = petPlan.nightlyPetFeeOriginalAmount ?? petPlan.nightlyPetFeeAmount;
    const nightlyPetFeeAmount = hasConsecutiveStayDiscount
      ? roundMoney(nightlyPetOriginalAmount * discountRate)
      : nightlyPetOriginalAmount;
    const nightTotal = adultLodgingAmount + nightlyChildFeeAmount + nightlyPetFeeAmount;
    const preDiscountPrice = adultLodgingPreDiscountAmount + nightlyChildFeeOriginalAmount + nightlyPetOriginalAmount;
    const discountAmount = adultLodgingPreDiscountAmount - adultLodgingAmount;
    const childFeeDiscountAmount = nightlyChildFeeOriginalAmount - nightlyChildFeeAmount;
    const petFeeDiscountAmount = nightlyPetOriginalAmount - nightlyPetFeeAmount;

    breakdown.push({
      date,
      dayType,
      dayTypeLabel: dayTypeLabels[dayType] || dayType,
      price: nightTotal,
      preDiscountPrice,
      discountType: hasConsecutiveStayDiscount ? consecutiveStayDiscountType : null,
      discountRate,
      discountAmount,
      adultLodgingPreDiscountAmount,
      adultLodgingAmount,
      adultRateBreakdownStatus: regularAdultBreakdownMatches ? "resolved" : "fallback",
      adultRateBreakdownMatches: regularAdultBreakdownMatches,
      base10GuestRate: regularAdultBreakdownMatches ? base10GuestRate : null,
      adult18GuestRate: regularAdultBreakdownMatches ? adult18GuestRate : null,
      adultIncrementRate: regularAdultBreakdownMatches ? adultIncrementRate : null,
      formalAdultGuestCount: pricingGuest.pricingGuestCount,
      formalAdultPrice: basePrice,
      baseGuestCount: rateGuestCount,
      basePrice,
      regularExtraAdultCount: regularAdultBreakdownMatches ? regularExtraAdultCount : 0,
      regularExtraAdultRate: regularAdultBreakdownMatches ? adultIncrementRate : null,
      regularExtraAdultFeeAmount: regularAdultBreakdownMatches ? regularExtraAdultFeeAmount : 0,
      extraAdultCount: pricingGuest.plan.extraAdultCount,
      extraAdultUnitPrice: bookingGuestRules.extraAdultUnitPrice,
      extraAdultFeeAmount: nightlyExtraAdultFeeAmount,
      extraBedAdultCount,
      extraBedAdultRate,
      extraBedAdultFeeAmount,
      extraBedCount: 0,
      extraBedAmount: 0,
      chargeableChildCount: pricingGuest.plan.chargeableChildCount,
      childFeeUnitPrice: bookingGuestRules.childFeeUnitPrice,
      childFeeOriginalAmount: nightlyChildFeeOriginalAmount,
      childFeeAmount: nightlyChildFeeAmount,
      childFeeDiscountRate: discountRate,
      childFeeDiscountType: hasConsecutiveStayDiscount ? consecutiveStayDiscountType : null,
      childFeeDiscountAmount,
      petFeeOriginalAmount: nightlyPetOriginalAmount,
      petFeeAmount: nightlyPetFeeAmount,
      petFeeDiscountRate: discountRate,
      petFeeDiscountType: hasConsecutiveStayDiscount ? consecutiveStayDiscountType : null,
      petFeeDiscountAmount,
      petFeeBreakdown: petPlan.petFeeBreakdown.map((item) => {
        const itemFinalAmount = hasConsecutiveStayDiscount ? roundMoney(item.nightlyAmount * discountRate) : item.nightlyAmount;
        return {
          ...item,
          originalAmount: item.nightlyAmount,
          discountType: hasConsecutiveStayDiscount ? consecutiveStayDiscountType : null,
          discountRate,
          discountAmount: item.nightlyAmount - itemFinalAmount,
          total: itemFinalAmount,
        };
      }),
      dogUnder10kgCount: petPlan.dogUnder10kgCount,
      dog10To20kgCount: petPlan.dog10To20kgCount,
      dogOver20kgCount: petPlan.dogOver20kgCount,
      dogCount: petPlan.dogCount,
      petDepositAmount: petPlan.petDepositAmount,
      specialDateLabel: specialDate?.label || null,
      ruleSetId: ruleSet.id,
      ruleSetName: ruleSet.name,
      actualGuestCount: guestCount,
      pricingGuestCount: pricingGuest.pricingGuestCount,
      packageType,
      packageLabel: packageLabels[packageType] || packageType,
      roomPlanHeadcount: pricingGuest.plan.roomPlanHeadcount,
      doubleBedCount: pricingGuest.plan.doubleBedCount,
      singleBedCount: pricingGuest.plan.singleBedCount,
      sleepCapacity: pricingGuest.plan.sleepCapacity,
      roomCountMin: pricingGuest.plan.roomCountMin,
      roomCountMax: pricingGuest.plan.roomCountMax,
      selectedRoomOptionId: roomOptionSelection.selectedRoomOption.id,
      selectedRoomOption: roomOptionSelection.selectedRoomOption,
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
      infants,
      guestCount,
      pricingGuestCount: pricingGuest.pricingGuestCount,
      packageType,
      nights,
      guestPlan,
      petPlan,
      details: { ruleSets },
    });
  }

  const lodgingSubtotal = breakdown.reduce((total, night) => total + night.price, 0);
  const subtotal = lodgingSubtotal + breakfastPlan.total;
  const regularExtraAdultFeeTotal = breakdown.reduce((total, night) => total + (night.regularExtraAdultFeeAmount || 0), 0);
  const extraBedAdultFeeTotal = breakdown.reduce((total, night) => total + (night.extraBedAdultFeeAmount || 0), 0);
  const childFeeTotal = breakdown.reduce((total, night) => total + (night.childFeeAmount || 0), 0);
  const childFeeOriginalTotal = breakdown.reduce((total, night) => total + (night.childFeeOriginalAmount || 0), 0);
  const childFeeDiscountTotal = childFeeOriginalTotal - childFeeTotal;
  const nightlyChildFeeOriginalAmount = pricingGuest.plan.chargeableChildCount * bookingGuestRules.childFeeUnitPrice;
  const discountedNightlyChildFeeAmount = roundMoney(nightlyChildFeeOriginalAmount * consecutiveStayDiscountRate);
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
    infants,
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
      lodgingSubtotal,
      ...guestPlanPricingDetails(pricingGuest.plan),
      nightlyChildFeeOriginalAmount,
      discountedNightlyChildFeeAmount,
      childFeeDiscountRate: consecutiveStayDiscountRate,
      childFeeOriginalTotal,
      childFeeDiscountTotal,
      childFeeTotal,
      ...petPlanPricingDetails(petPlan),
      breakfastUnitPrice: breakfastAddonUnitPrice,
      breakfastAddonEntries: breakfastPlan.entries,
      breakfastAddonQuantity: breakfastPlan.quantity,
      breakfastAddonTotal: breakfastPlan.total,
      ...selectedRoomOptionPricingDetails(roomOptionSelection.selectedRoomOption),
      regularExtraAdultFeeTotal,
      extraAdultFeeTotal: extraBedAdultFeeTotal,
      extraBedAdultFeeTotal,
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
