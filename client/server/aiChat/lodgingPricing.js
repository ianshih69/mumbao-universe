import { buildContextualKnowledgeGapReply, normalizeConversationContext } from "./conversationContext.js";
import { loadGuesthouseKnowledge } from "./guesthouseKnowledge.js";

const officialPricingSource = "client/api/knowledge/guesthouse-rules.md";
const supportedDirectPricingRoute = "existing_official_pricing";
const maxStayNights = 30;
const pricingReplyModes = new Set([
  "initial_quote",
  "quote_confirmation",
  "quote_breakdown",
  "lodging_only_quote",
  "reprice_after_context_change",
]);
const turnActionToPricingReplyMode = new Map([
  ["request_quote", "initial_quote"],
  ["update_quote", "reprice_after_context_change"],
  ["confirm_quote", "quote_confirmation"],
  ["explain_quote", "quote_breakdown"],
  ["lodging_only_quote", "lodging_only_quote"],
]);
const pricingRelevantContextFields = [
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "stay_type",
  "room_count",
  "pet_count",
  "pet_type",
];

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
      base_guest_count: 10,
      base_amount: rule.tenPersonAmount,
      extra_guest_count: 0,
      extra_guest_unit_amount: rule.tenPersonUnitAmount,
      approximate: false,
      formula: "ten_person_minimum",
    };
  }

  if (guestCount < 18) {
    return {
      amount:
        rule.tenPersonAmount + (guestCount - 10) * rule.tenPersonUnitAmount,
      base_guest_count: 10,
      base_amount: rule.tenPersonAmount,
      extra_guest_count: guestCount - 10,
      extra_guest_unit_amount: rule.tenPersonUnitAmount,
      approximate: false,
      formula: "ten_person_base_plus_extra_guests",
    };
  }

  if (guestCount === 18) {
    return {
      amount: rule.eighteenPersonAmount,
      base_guest_count: 18,
      base_amount: rule.eighteenPersonAmount,
      extra_guest_count: 0,
      extra_guest_unit_amount: rule.eighteenPersonUnitAmount,
      approximate: false,
      formula: "eighteen_person_package",
    };
  }

  return {
    amount: Math.round(
      rule.eighteenPersonAmount +
        (guestCount - 18) * rule.eighteenPersonUnitAmount
    ),
    base_guest_count: 18,
    base_amount: rule.eighteenPersonAmount,
    extra_guest_count: guestCount - 18,
    extra_guest_unit_amount: rule.eighteenPersonUnitAmount,
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
      base_guest_count: nightPrice.base_guest_count,
      base_amount: nightPrice.base_amount,
      extra_guest_count: nightPrice.extra_guest_count,
      extra_guest_unit_amount: nightPrice.extra_guest_unit_amount,
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

function buildPricingSummary(context, pricingResolution) {
  const state = normalizeConversationContext(context);
  const lodgingPrice = pricingResolution?.lodging_price;
  const dateSummary = `${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(
    state.check_out
  )}退房`;
  const guestCount = getEffectiveGuestCount(state);

  return {
    state,
    lodgingPrice,
    dateSummary,
    guestCount,
    lodgingSummary: `${guestCount} 位包棟`,
    lodgingAmount: formatMoney(lodgingPrice?.amount),
    petSummary: formatPetSummary(state),
    firstNight: lodgingPrice?.nightly?.[0] || null,
  };
}

export function buildOfficialPricingReply(context, pricingResolution) {
  const { state, lodgingPrice, dateSummary, lodgingSummary, lodgingAmount, petSummary } =
    buildPricingSummary(context, pricingResolution);
  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  if (pricingResolution.pet_fee?.status === "unresolved" && petSummary) {
    return `收到，目前是 ${dateSummary}，${lodgingSummary}，住宿房價為 ${lodgingAmount}。另會攜帶 ${petSummary}，目前房價尚未包含寵物相關費用，寵物費與安排需再由管家確認。`;
  }

  if (pricingResolution.pet_fee?.status === "not_applicable") {
    return `收到，目前是 ${dateSummary}，${lodgingSummary}，不攜帶寵物，住宿房價為 ${lodgingAmount}。`;
  }

  return `收到，目前是 ${dateSummary}，${lodgingSummary}，住宿房價為 ${lodgingAmount}。`;
}

export function buildOfficialPricingConfirmationReply(context, pricingResolution) {
  const {
    state,
    lodgingPrice,
    dateSummary,
    guestCount,
    lodgingAmount,
    petSummary,
    firstNight,
  } = buildPricingSummary(context, pricingResolution);

  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  const basePart =
    firstNight?.base_guest_count && firstNight?.base_amount
      ? `${firstNight.base_guest_count} 人包棟為 ${formatMoney(firstNight.base_amount)}`
      : "依目前價目表試算";
  const extraPart =
    firstNight?.extra_guest_count > 0 && firstNight?.extra_guest_unit_amount
      ? `；增加 ${firstNight.extra_guest_count} 人，每人 ${formatMoney(
          firstNight.extra_guest_unit_amount
        )}`
      : "";
  const dateTypePart = firstNight?.date_type
    ? `${formatDisplayDate(firstNight.date)}屬於${firstNight.date_type}`
    : dateSummary;
  const petPart =
    pricingResolution.pet_fee?.status === "unresolved" && petSummary
      ? `。此金額尚未包含 ${petSummary}的寵物費用，寵物部分仍需由管家確認`
      : "";

  return `是的，依目前價目表試算，${dateTypePart}，${basePart}${extraPart}，因此 ${guestCount} 人住宿費為 ${lodgingAmount}${petPart}。`;
}

export function buildOfficialPricingBreakdownReply(context, pricingResolution) {
  const { state, lodgingPrice, guestCount, lodgingAmount, petSummary } =
    buildPricingSummary(context, pricingResolution);

  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  const lines = lodgingPrice.nightly.map((night) => {
    const basePart =
      night.base_guest_count && night.base_amount
        ? `${night.base_guest_count} 人包棟 ${formatMoney(night.base_amount)}`
        : formatMoney(night.amount);
    const extraPart =
      night.extra_guest_count > 0 && night.extra_guest_unit_amount
        ? `，加 ${night.extra_guest_count} 人 × ${formatMoney(
            night.extra_guest_unit_amount
          )}`
        : "";
    return `${formatDisplayDate(night.date)}（${night.date_type}）：${basePart}${extraPart}，小計 ${formatMoney(night.amount)}`;
  });
  const petPart =
    pricingResolution.pet_fee?.status === "unresolved" && petSummary
      ? `目前會攜帶 ${petSummary}，上述住宿費尚未包含寵物費，寵物費與安排需再由管家確認。`
      : "";

  return `這筆住宿費是依正式價目表試算：${lines.join("；")}。因此 ${guestCount} 人住宿費合計 ${lodgingAmount}。${petPart}`.trim();
}

export function buildOfficialLodgingOnlyReply(context, pricingResolution) {
  const { state, lodgingPrice, dateSummary, lodgingSummary, lodgingAmount, petSummary } =
    buildPricingSummary(context, pricingResolution);

  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  const petPart = petSummary
    ? `這是不含 ${petSummary}寵物費的住宿小計。`
    : "這是不含寵物費的住宿小計。";

  return `${dateSummary}，${lodgingSummary}的住宿小計是 ${lodgingAmount}。${petPart}`;
}

export function buildOfficialRepriceReply(context, pricingResolution) {
  const { state, lodgingPrice, dateSummary, lodgingSummary, lodgingAmount, petSummary } =
    buildPricingSummary(context, pricingResolution);

  if (lodgingPrice?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }

  const petPart =
    state.pet_count === 0
      ? "不攜帶寵物"
      : petSummary
        ? `會攜帶 ${petSummary}`
        : "寵物需求未確認";
  const unresolvedPetPart =
    pricingResolution.pet_fee?.status === "unresolved" && petSummary
      ? `目前房價尚未包含寵物相關費用，寵物費與安排需再由管家確認。`
      : "";

  return `好的，已改為 ${dateSummary}，${lodgingSummary}、${petPart}。依目前價目表試算，住宿房價為 ${lodgingAmount}。${unresolvedPetPart}`.trim();
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

function hasCompletePricingDetails(context) {
  const state = normalizeConversationContext(context);
  return Boolean(
    state.stay_type === "villa" &&
      state.check_in &&
      state.check_out &&
      getEffectiveGuestCount(state) !== null &&
      state.pet_count !== null
  );
}

function hasPricingSessionContext(context, recentMessages = []) {
  const state = normalizeConversationContext(context);
  return Boolean(
    state.active_intent === "pricing" ||
      state.current_topic === "booking_price" ||
      hasPreviousPricingReply(recentMessages)
  );
}

function isPricingTurnAction(turnAction) {
  return turnActionToPricingReplyMode.has(turnAction);
}

export function getPricingRelevantChangedFields(previousContext, context) {
  const before = normalizeConversationContext(previousContext);
  const after = normalizeConversationContext(context);

  return pricingRelevantContextFields.filter((field) => before[field] !== after[field]);
}

function normalizeCompactText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isNewQuestionAcknowledgement(message) {
  const text = normalizeCompactText(message);
  if (!text) return false;
  if (/重新開始|全部重來|清除剛才|清掉剛才/.test(text)) return false;
  return /重新問|重問|問別的|想問別的|換個問題|換一題/.test(text);
}

function isCasualAcknowledgement(message) {
  const text = normalizeCompactText(message);
  return /^(好|好的|好喔|好哦|了解|知道了|收到|謝謝|謝啦|感謝|thanks|thankyou|ok|okay|嗯|恩)$/.test(
    text
  );
}

function isQuoteConfirmation(message) {
  const text = normalizeCompactText(message);
  return /^(確定嗎|真的嗎|這價格對嗎|價格對嗎|對嗎|沒錯嗎|是這樣嗎|確定\?|真的\?)$/.test(
    text
  );
}

function isQuoteBreakdown(message) {
  return /怎麼算|如何算|怎麼計算|為什麼是|列明細|明細|計算方式|算式/.test(
    normalizeCompactText(message)
  );
}

function isLodgingOnlyQuote(message) {
  const text = normalizeCompactText(message);
  return /不含.*(狗|寵物)|光住宿|住宿小計|不含狗狗|不含狗|不含寵物/.test(text);
}

function isInitialQuoteRequest(message) {
  const text = normalizeCompactText(message);
  if (!text) return false;
  if (/烤肉|麻將|入住時間|退房|早餐|停車|附近|地址|設施|有提供|可以帶/.test(text)) {
    return false;
  }
  return /房價|價格|總價|總共|多少錢|費用|報價|多少/.test(text);
}

function getLatestAssistantMessage(recentMessages = []) {
  return [...recentMessages].reverse().find((message) => message?.sender === "ai");
}

function hasPreviousPricingReply(recentMessages = []) {
  const latestAssistant = getLatestAssistantMessage(recentMessages);
  const metadata = latestAssistant?.metadata;
  if (!metadata || typeof metadata !== "object") return false;

  return (
    metadata.lodging_price_status === "resolved" ||
    metadata.price_calculation_route === supportedDirectPricingRoute ||
    metadata.pricing_override_applied === true
  );
}

export function classifyPricingReplyIntent({
  message,
  recentMessages = [],
  previousContext = null,
  context = null,
  turnAction = "",
} = {}) {
  if (turnActionToPricingReplyMode.has(turnAction)) {
    return turnActionToPricingReplyMode.get(turnAction);
  }
  if (isNewQuestionAcknowledgement(message)) return "new_question_acknowledgement";
  if (isCasualAcknowledgement(message)) return "casual_acknowledgement";
  if (isLodgingOnlyQuote(message)) return "lodging_only_quote";
  if (isQuoteBreakdown(message)) return "quote_breakdown";
  if (isQuoteConfirmation(message)) {
    return hasPreviousPricingReply(recentMessages)
      ? "quote_confirmation"
      : "quote_confirmation_missing_context";
  }
  if (isInitialQuoteRequest(message)) return "initial_quote";
  if (
    previousContext &&
    context &&
    hasPricingSessionContext(context, recentMessages) &&
    getPricingRelevantChangedFields(previousContext, context).length > 0
  ) {
    return "reprice_after_context_change";
  }
  return "unrelated_or_new_topic";
}

function buildControlRoute(routeResult, { answer, intent, reason, contextPatch = null }) {
  return {
    ...routeResult,
    route: intent,
    providerUsed: "local_intent",
    answer,
    notice: answer,
    answerMode: "direct",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: true,
    reason,
    conversationContextPatch: contextPatch,
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      pricing_reply_mode: intent,
      pricing_override_applied: false,
      pricing_override_reason: reason,
      current_turn_intent: intent,
      final_route: intent,
      needs_human: false,
    },
  };
}

function selectPricingReply({ intent, context, pricingResolution }) {
  if (intent === "quote_confirmation") {
    return buildOfficialPricingConfirmationReply(context, pricingResolution);
  }
  if (intent === "quote_breakdown") {
    return buildOfficialPricingBreakdownReply(context, pricingResolution);
  }
  if (intent === "lodging_only_quote") {
    return buildOfficialLodgingOnlyReply(context, pricingResolution);
  }
  if (intent === "reprice_after_context_change") {
    return buildOfficialRepriceReply(context, pricingResolution);
  }
  return buildOfficialPricingReply(context, pricingResolution);
}

export async function buildOfficialPricingRouteOverride(
  context,
  routeResult,
  options = {}
) {
  const currentTurnIntent = classifyPricingReplyIntent({
    message: options.message,
    recentMessages: options.recentMessages,
    previousContext: options.previousContext,
    context,
    turnAction: options.turnAction,
  });

  if (currentTurnIntent === "new_question_acknowledgement") {
    return buildControlRoute(routeResult, {
      answer: "好的，請問你想重新了解哪個問題呢？",
      intent: currentTurnIntent,
      reason: "current_turn_new_question_acknowledgement",
      contextPatch: {
        active_intent: null,
        current_topic: null,
      },
    });
  }

  if (currentTurnIntent === "casual_acknowledgement") {
    return buildControlRoute(routeResult, {
      answer: "好的，需要再確認住宿、寵物或設施資訊時，都可以再問我喔。",
      intent: currentTurnIntent,
      reason: "current_turn_casual_acknowledgement",
    });
  }

  if (currentTurnIntent === "quote_confirmation_missing_context") {
    return buildControlRoute(routeResult, {
      answer: "想確認哪一項資訊呢？你可以把問題再告訴我，我再幫你確認。",
      intent: currentTurnIntent,
      reason: "quote_confirmation_without_previous_pricing_reply",
    });
  }

  if (!pricingReplyModes.has(currentTurnIntent)) return null;
  if (isPricingTurnAction(options.turnAction)) {
    if (!hasCompletePricingDetails(context)) return null;
  } else if (currentTurnIntent === "reprice_after_context_change") {
    if (
      !hasPricingSessionContext(context, options.recentMessages) ||
      !hasCompletePricingDetails(context)
    ) {
      return null;
    }
  } else if (!hasCompletePricingContext(context)) {
    return null;
  }

  const pricingResolution = await buildOfficialPricingResolution(context);
  if (pricingResolution.lodging_price.status !== "resolved") {
    return null;
  }

  const hasUnresolvedItems = pricingResolution.unresolved_price_items.length > 0;
  const finalRoute =
    currentTurnIntent === "initial_quote"
      ? hasUnresolvedItems
        ? "partial_grounded_reply"
        : "grounded_reply"
      : currentTurnIntent;
  const answer = selectPricingReply({
    intent: currentTurnIntent,
    context,
    pricingResolution,
  });
  const shouldMarkNeedsHuman =
    currentTurnIntent === "lodging_only_quote" ? false : hasUnresolvedItems;
  const metadata = {
    ...buildOfficialPricingMetadata(pricingResolution),
    pricing_reply_mode: currentTurnIntent,
    pricing_override_applied: true,
    pricing_override_reason: `official_pricing_${currentTurnIntent}`,
    current_turn_intent: currentTurnIntent,
    final_route: finalRoute,
    needs_human: shouldMarkNeedsHuman,
  };

  return {
    ...routeResult,
    route: finalRoute,
    providerUsed: "official_pricing",
    answer,
    notice: answer,
    answerMode: "direct",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman,
    knowledgeGap: false,
    aiSkipped: true,
    reason:
      currentTurnIntent === "initial_quote"
        ? hasUnresolvedItems
          ? "official_lodging_price_resolved_with_unresolved_items"
          : "official_lodging_price_resolved"
        : `official_pricing_${currentTurnIntent}`,
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      ...metadata,
    },
  };
}
