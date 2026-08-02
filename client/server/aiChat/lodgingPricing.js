import { buildContextualKnowledgeGapReply, normalizeConversationContext } from "./conversationContext.js";
import { loadGuesthouseKnowledge } from "./guesthouseKnowledge.js";

const officialPricingSource = "client/api/knowledge/guesthouse-rules.md";
const supportedDirectPricingRoute = "existing_official_pricing";
const maxStayNights = 30;

const dateTypeLabels = {
  weekday: "平日（日～四）",
  friday: "週五",
  holiday: "假日／連續假日",
  summer_weekday: "暑假平日（日～四）",
  summer_friday: "暑假週五",
  summer_saturday: "暑假週六",
};

function parseAmount(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseMarkdownTableRow(line) {
  const cells = String(line || "")
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

  if (cells.length < 3 || cells[0] === "---" || cells[0] === "日期類型") {
    return null;
  }

  return {
    label: cells[0],
    amount: parseAmount(cells[1]),
    perPerson: parseAmount(cells[2]),
    approximatePerPerson: cells[2].includes("約"),
  };
}

export function parseVillaPricingRules(markdown) {
  const rules = {};
  let section = "";

  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (/^###\s*10\s*人包棟房價/.test(line)) {
      section = "ten";
      continue;
    }
    if (/^###\s*18\s*人包棟房價/.test(line)) {
      section = "eighteen";
      continue;
    }
    if (/^###\s*/.test(line)) {
      section = "";
      continue;
    }
    if (!section || !line.trim().startsWith("|")) continue;

    const row = parseMarkdownTableRow(line);
    if (!row || !row.label || !Number.isInteger(row.amount) || !Number.isInteger(row.perPerson)) {
      continue;
    }

    rules[row.label] = {
      ...(rules[row.label] || {}),
      ...(section === "ten"
        ? {
            tenPersonAmount: row.amount,
            tenPersonUnitAmount: row.perPerson,
          }
        : {
            eighteenPersonAmount: row.amount,
            eighteenPersonUnitAmount: row.perPerson,
            eighteenPersonUnitIsApproximate: row.approximatePerPerson,
          }),
    };
  }

  return rules;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(checkIn, checkOut) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
      dayMs
  );
}

export function classifyVillaDateType(dateText) {
  if (!isIsoDate(dateText)) return null;

  const [year, month, day] = dateText.split("-").map((part) => Number(part));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isSummer = month === 7 || month === 8;

  if (isSummer && weekday === 5) {
    return {
      key: "summer_friday",
      label: dateTypeLabels.summer_friday,
      basis: "summer_month_and_weekday",
    };
  }

  if (isSummer && weekday === 6) {
    return {
      key: "summer_saturday",
      label: dateTypeLabels.summer_saturday,
      basis: "summer_month_and_weekday",
    };
  }

  if (isSummer) {
    return {
      key: "summer_weekday",
      label: dateTypeLabels.summer_weekday,
      basis: "summer_month_and_weekday",
    };
  }

  if (weekday === 5) {
    return {
      key: "friday",
      label: dateTypeLabels.friday,
      basis: "weekday",
    };
  }

  if (weekday === 6) {
    return {
      key: "holiday",
      label: dateTypeLabels.holiday,
      basis: "weekday",
    };
  }

  return {
    key: "weekday",
    label: dateTypeLabels.weekday,
    basis: "weekday",
  };
}

function calculateNightAmountForGuestCount(rule, guestCount) {
  if (!rule) return null;

  if (guestCount <= 10) {
    return {
      amount: rule.tenPersonAmount,
      approximate: false,
      formula: "ten_person_minimum",
    };
  }

  if (guestCount < 18) {
    return {
      amount:
        rule.tenPersonAmount + (guestCount - 10) * rule.tenPersonUnitAmount,
      approximate: false,
      formula: "ten_person_base_plus_extra_guests",
    };
  }

  if (guestCount === 18) {
    return {
      amount: rule.eighteenPersonAmount,
      approximate: false,
      formula: "eighteen_person_package",
    };
  }

  return {
    amount: Math.round(
      rule.eighteenPersonAmount +
        (guestCount - 18) * rule.eighteenPersonUnitAmount
    ),
    approximate: Boolean(rule.eighteenPersonUnitIsApproximate),
    formula: "eighteen_person_base_plus_extra_guests",
  };
}

function unresolvedLodgingPrice(reason, details = {}) {
  return {
    status: "unresolved",
    amount: null,
    source: supportedDirectPricingRoute,
    source_file: officialPricingSource,
    reason,
    ...details,
  };
}

function getEffectiveGuestCount(state) {
  if (Number.isInteger(state.guest_count) && state.guest_count > 0) {
    return state.guest_count;
  }

  const adults = Number.isInteger(state.adult_count) ? state.adult_count : 0;
  const children = Number.isInteger(state.child_count) ? state.child_count : 0;
  const total = adults + children;
  return total > 0 ? total : null;
}

export function calculateVillaLodgingPriceFromKnowledge(context, markdown) {
  const state = normalizeConversationContext(context);

  if (state.stay_type !== "villa") {
    return unresolvedLodgingPrice("unsupported_stay_type");
  }
  if (!isIsoDate(state.check_in) || !isIsoDate(state.check_out)) {
    return unresolvedLodgingPrice("missing_or_invalid_dates");
  }

  const nights = daysBetween(state.check_in, state.check_out);
  if (!Number.isInteger(nights) || nights < 1) {
    return unresolvedLodgingPrice("invalid_date_range");
  }
  if (nights > maxStayNights) {
    return unresolvedLodgingPrice("date_range_too_long");
  }

  const guestCount = getEffectiveGuestCount(state);
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    return unresolvedLodgingPrice("missing_or_invalid_guest_count");
  }

  const rules = parseVillaPricingRules(markdown);
  const nightly = [];
  let amount = 0;
  let approximate = false;

  for (let date = state.check_in; date < state.check_out; date = addDays(date, 1)) {
    const dateType = classifyVillaDateType(date);
    const rule = dateType ? rules[dateType.label] : null;
    const nightPrice = calculateNightAmountForGuestCount(rule, guestCount);

    if (!dateType || !rule || !nightPrice) {
      return unresolvedLodgingPrice("missing_date_type_price", {
        date,
        date_type: dateType?.label || null,
      });
    }

    amount += nightPrice.amount;
    approximate = approximate || nightPrice.approximate;
    nightly.push({
      date,
      date_type: dateType.label,
      date_type_basis: dateType.basis,
      amount: nightPrice.amount,
      formula: nightPrice.formula,
      approximate: nightPrice.approximate,
    });
  }

  return {
    status: "resolved",
    amount,
    source: supportedDirectPricingRoute,
    source_file: officialPricingSource,
    stay_type: "villa",
    guest_count: guestCount,
    check_in: state.check_in,
    check_out: state.check_out,
    nights,
    nightly,
    approximate,
  };
}

export async function calculateVillaLodgingPrice(context) {
  const knowledge = await loadGuesthouseKnowledge();
  return calculateVillaLodgingPriceFromKnowledge(context, knowledge);
}

function resolvePetFee(context) {
  const state = normalizeConversationContext(context);

  if (state.pet_count === null) {
    return {
      status: "unknown",
      amount: null,
      reason: "missing_pet_count",
    };
  }

  if (state.pet_count === 0) {
    return {
      status: "not_applicable",
      amount: null,
      reason: "no_pets",
    };
  }

  return {
    status: "unresolved",
    amount: null,
    reason: "no_approved_pet_fee_rule",
  };
}

export async function buildOfficialPricingResolution(context) {
  const lodgingPrice = await calculateVillaLodgingPrice(context);
  const petFee = resolvePetFee(context);
  const unresolvedItems = [];

  if (lodgingPrice.status !== "resolved") unresolvedItems.push("lodging_price");
  if (petFee.status === "unresolved") unresolvedItems.push("pet_fee");

  return {
    lodging_price: lodgingPrice,
    pet_fee: petFee,
    unresolved_price_items: unresolvedItems,
    price_calculation_route:
      lodgingPrice.status === "resolved"
        ? supportedDirectPricingRoute
        : "pricing_unresolved",
  };
}

function formatDisplayDate(value) {
  if (!isIsoDate(value)) return "";
  const [year, month, day] = value.split("-");
  return `${Number(year)} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function formatMoney(amount) {
  return `NT$${Number(amount || 0).toLocaleString("zh-TW")}`;
}

function formatPetSummary(context) {
  const state = normalizeConversationContext(context);
  if (!state.pet_count) return "";
  const petLabel =
    state.pet_type === "dog" ? "狗" : state.pet_type === "cat" ? "貓" : "寵物";
  return `${state.pet_count} 隻${petLabel}`;
}

export function buildOfficialPricingReply(context, pricingResolution) {
  const state = normalizeConversationContext(context);
  const lodgingPrice = pricingResolution?.lodging_price;
  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  const dateSummary = `${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(
    state.check_out
  )}退房`;
  const guestCount = getEffectiveGuestCount(state);
  const lodgingSummary = `${guestCount} 位包棟`;
  const lodgingAmount = formatMoney(lodgingPrice.amount);
  const petSummary = formatPetSummary(state);

  if (pricingResolution.pet_fee?.status === "unresolved" && petSummary) {
    return `收到，目前是 ${dateSummary}，${lodgingSummary}，住宿房價為 ${lodgingAmount}。另會攜帶 ${petSummary}，目前房價尚未包含寵物相關費用，寵物費與安排需再由管家確認。`;
  }

  if (pricingResolution.pet_fee?.status === "not_applicable") {
    return `收到，目前是 ${dateSummary}，${lodgingSummary}，住宿房價為 ${lodgingAmount}。這是不含寵物費的住宿小計。`;
  }

  return `收到，目前是 ${dateSummary}，${lodgingSummary}，住宿房價為 ${lodgingAmount}。`;
}

export function buildOfficialPricingMetadata(pricingResolution) {
  const lodgingPrice = pricingResolution?.lodging_price || {};
  const petFee = pricingResolution?.pet_fee || {};

  return {
    lodging_price_status: lodgingPrice.status || "unresolved",
    lodging_price_amount:
      lodgingPrice.status === "resolved" ? lodgingPrice.amount : null,
    lodging_price_source: lodgingPrice.source || supportedDirectPricingRoute,
    pet_fee_status: petFee.status || "unknown",
    unresolved_price_items: pricingResolution?.unresolved_price_items || [],
    price_calculation_route:
      pricingResolution?.price_calculation_route || "pricing_unresolved",
  };
}

function hasCompletePricingContext(context) {
  const state = normalizeConversationContext(context);
  return Boolean(
    (state.active_intent === "pricing" ||
      state.current_topic === "booking_price") &&
      state.stay_type === "villa" &&
      state.check_in &&
      state.check_out &&
      getEffectiveGuestCount(state) !== null &&
      state.pet_count !== null
  );
}

export async function buildOfficialPricingRouteOverride(context, routeResult) {
  if (!hasCompletePricingContext(context)) return null;

  const pricingResolution = await buildOfficialPricingResolution(context);
  if (pricingResolution.lodging_price.status !== "resolved") {
    return null;
  }

  const hasUnresolvedItems = pricingResolution.unresolved_price_items.length > 0;
  const answer = buildOfficialPricingReply(context, pricingResolution);
  const metadata = {
    ...buildOfficialPricingMetadata(pricingResolution),
    needs_human: hasUnresolvedItems,
  };

  return {
    ...routeResult,
    route: hasUnresolvedItems
      ? "partial_grounded_reply"
      : "grounded_reply",
    providerUsed: "official_pricing",
    answer,
    notice: answer,
    answerMode: "direct",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: hasUnresolvedItems,
    knowledgeGap: false,
    aiSkipped: true,
    reason: hasUnresolvedItems
      ? "official_lodging_price_resolved_with_unresolved_items"
      : "official_lodging_price_resolved",
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      ...metadata,
    },
  };
}
