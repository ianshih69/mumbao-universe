import { buildContextualKnowledgeGapReply, normalizeConversationContext } from "./conversationContext.js";
import {
  breakfastAddonUnitPrice,
  calculateBookingQuote,
  calculateBookingQuoteForDayTypes,
} from "../bookingPricing/index.js";
import { resolveBookingPetPlan } from "../../src/lib/bookings/bookingGuestRules.js";
import { supabaseRequest as defaultSupabaseRequest } from "../shopShared.js";
import {
  isDeterministicPricingRequest,
  isStrongExplicitLodgingQuoteRequest,
} from "./pricingIntent.js";

const supportedDirectPricingRoute = "booking_pricing_core";
const officialPricingSource = "client/server/bookingPricing/index.js";
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
  "stay_nights",
  "pricing_day_type",
  "requires_exact_date",
  "guest_count",
  "adult_count",
  "child_count",
  "infant_count",
  "stay_type",
  "room_count",
  "pet_count",
  "pet_type",
  "dog_under_10kg_count",
  "dog_10_to_20kg_count",
  "dog_over_20kg_count",
  "breakfast_count",
];
const dayTypeLabels = {
  weekday: "平日（日～四）",
  friday: "週五",
  holiday: "週六／連續假日",
};

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function nonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function formatDisplayDate(value) {
  if (!isIsoDate(value)) return "";
  const [year, month, day] = value.split("-");
  return `${Number(year)} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function formatMoney(amount) {
  return `TWD ${Number(amount || 0).toLocaleString("zh-TW")}`;
}

function getAdultCount(state) {
  if (Number.isInteger(state.adult_count) && state.adult_count > 0) return state.adult_count;
  if (Number.isInteger(state.guest_count) && state.guest_count > 0) return state.guest_count;
  return null;
}

function getDogTierCounts(state) {
  return {
    dogUnder10kgCount: nonNegativeInteger(state.dog_under_10kg_count),
    dog10To20kgCount: nonNegativeInteger(state.dog_10_to_20kg_count),
    dogOver20kgCount: nonNegativeInteger(state.dog_over_20kg_count),
  };
}

function getKnownDogCount(state) {
  const counts = getDogTierCounts(state);
  return counts.dogUnder10kgCount + counts.dog10To20kgCount + counts.dogOver20kgCount;
}

function buildRequestedDayTypes(state) {
  const nights = nonNegativeInteger(state.stay_nights);
  if (!state.pricing_day_type || nights < 1) return [];
  if (state.pricing_day_type === "friday") {
    return Array.from({ length: nights }, (_, index) =>
      index === 0 ? "friday" : index === 1 ? "holiday" : "weekday"
    );
  }
  if (state.pricing_day_type === "holiday") {
    return Array.from({ length: nights }, (_, index) =>
      index === 0 ? "holiday" : "weekday"
    );
  }
  return Array.from({ length: nights }, () => "weekday");
}

function buildBookingQuoteInput(state) {
  const adults = getAdultCount(state);
  const breakfastQuantity = nonNegativeInteger(state.breakfast_count);
  return {
    checkIn: state.check_in,
    checkOut: state.check_out,
    stayType: "villa",
    packageType: adults >= 18 ? "villa_18" : "villa_10",
    adults,
    children: nonNegativeInteger(state.child_count),
    infants: nonNegativeInteger(state.infant_count),
    ...getDogTierCounts(state),
    breakfastAddons:
      breakfastQuantity > 0 && state.check_out
        ? [{ date: state.check_out, quantity: breakfastQuantity }]
        : [],
    breakfastQuantity,
  };
}

function unresolvedPricing(reason, details = {}) {
  return {
    lodging_price: {
      status: "unresolved",
      amount: null,
      source: supportedDirectPricingRoute,
      source_file: officialPricingSource,
      reason,
    },
    child_fee: { status: "unresolved", amount: null },
    infant_fee: { status: "unresolved", amount: null },
    pet_fee: { status: "unknown", amount: null },
    breakfast_fee: { status: "unknown", amount: null },
    total_amount: null,
    unresolved_price_items: ["lodging_price"],
    price_calculation_route: "pricing_unresolved",
    ...details,
  };
}

function sumBreakdown(quote, field) {
  return (quote?.pricing?.breakdown || []).reduce(
    (total, night) => total + Number(night?.[field] || 0),
    0
  );
}

function mapBookingQuoteToResolution(state, quote, periodType, requestedDayTypes) {
  if (quote?.status !== "resolved" || quote?.pricing?.status !== "resolved") {
    return unresolvedPricing(quote?.pricing?.reason || "booking_pricing_unresolved", {
      booking_quote: quote || null,
    });
  }

  const adultLodgingAmount = sumBreakdown(quote, "adultLodgingAmount");
  const childFeeAmount = Number(quote.pricing.childFeeTotal || 0);
  const knownDogCount = getKnownDogCount(state);
  const requestedDogCount = nonNegativeInteger(state.pet_count, knownDogCount);
  const petWeightsComplete = requestedDogCount <= knownDogCount;
  const unresolvedItems = petWeightsComplete ? [] : ["pet_fee"];

  return {
    lodging_price: {
      status: "resolved",
      amount: adultLodgingAmount,
      source: supportedDirectPricingRoute,
      source_file: officialPricingSource,
      adults: quote.adults,
      check_in: periodType === "dates" ? quote.checkIn : null,
      check_out: periodType === "dates" ? quote.checkOut : null,
      nights: quote.nights,
      nightly: quote.pricing.breakdown,
    },
    child_fee: {
      status: "resolved",
      amount: childFeeAmount,
      child_count: nonNegativeInteger(state.child_count),
      chargeable_child_count: Number(quote.pricing.chargeableChildCount || 0),
      unit_price: Number(quote.pricing.childFeeUnitPrice || 0),
    },
    infant_fee: {
      status: "resolved",
      amount: 0,
      infant_count: nonNegativeInteger(state.infant_count),
      free_count_limit: null,
    },
    pet_fee: petWeightsComplete
      ? {
          status: knownDogCount > 0 ? "resolved" : "not_applicable",
          amount: Number(quote.pricing.petFeeTotal || 0),
          dog_count: knownDogCount,
          breakdown: quote.pricing.petFeeBreakdown || [],
          deposit_amount: Number(quote.pricing.petDepositAmount || 0),
        }
      : {
          status: "unresolved",
          amount: null,
          dog_count: requestedDogCount,
          known_weight_count: knownDogCount,
          reason: "missing_dog_weights",
        },
    breakfast_fee: {
      status: "resolved",
      amount: Number(quote.pricing.breakfastAddonTotal || 0),
      quantity: Number(quote.pricing.breakfastAddonQuantity || 0),
      unit_price: Number(quote.pricing.breakfastUnitPrice || breakfastAddonUnitPrice),
    },
    total_amount: Number(quote.pricing.total || 0),
    lodging_and_child_amount: adultLodgingAmount + childFeeAmount,
    unresolved_price_items: unresolvedItems,
    price_calculation_route: supportedDirectPricingRoute,
    period_type: periodType,
    requested_day_types: requestedDayTypes,
    booking_quote: quote,
  };
}

export async function buildOfficialPricingResolution(context, options = {}) {
  const state = normalizeConversationContext(context);
  const adults = getAdultCount(state);
  if (state.stay_type !== "villa") return unresolvedPricing("unsupported_stay_type");
  if (!Number.isInteger(adults) || adults < 1) {
    return unresolvedPricing("missing_or_invalid_adult_count");
  }

  const supabaseRequest = options.supabaseRequest || defaultSupabaseRequest;
  const quoteInput = buildBookingQuoteInput(state);
  const hasExactDates = isIsoDate(state.check_in) && isIsoDate(state.check_out);
  const requestedDayTypes = buildRequestedDayTypes(state);
  let quote;
  if (hasExactDates) {
    quote = await (options.calculateBookingQuote || calculateBookingQuote)(quoteInput, {
      supabaseRequest,
    });
  } else if (requestedDayTypes.length) {
    quote = await (
      options.calculateBookingQuoteForDayTypes || calculateBookingQuoteForDayTypes
    )(
      { ...quoteInput, dayTypes: requestedDayTypes },
      { supabaseRequest, referenceDate: options.referenceDate }
    );
  } else {
    return unresolvedPricing("missing_or_invalid_stay_period");
  }

  return mapBookingQuoteToResolution(
    state,
    quote,
    hasExactDates ? "dates" : "day_types",
    requestedDayTypes
  );
}

function formatPeriod(state, pricingResolution) {
  if (pricingResolution.period_type === "dates") {
    return `${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(state.check_out)}退房`;
  }
  const labels = (pricingResolution.requested_day_types || []).map(
    (dayType) => dayTypeLabels[dayType] || dayType
  );
  return labels.length === 1
    ? `${labels[0]}住 1 晚`
    : `${labels.join("、")}，共 ${labels.length} 晚`;
}

function formatGuestSummary(state) {
  const parts = [`${getAdultCount(state)} 位成人`];
  if (state.child_count) parts.push(`${state.child_count} 位滿 4 歲至未滿 13 歲不佔床兒童`);
  if (state.infant_count) parts.push(`${state.infant_count} 位未滿 4 歲不佔床幼兒`);
  return parts.join("、");
}

function buildChildExplanation(pricingResolution) {
  const child = pricingResolution.child_fee;
  if (!child?.child_count) return "";
  if (child.chargeable_child_count === 0) {
    return `基本 10 位計價名額已涵蓋這 ${child.child_count} 位兒童，因此沒有另外加收兒童費。`;
  }
  return `其中 ${child.chargeable_child_count} 位兒童超出基本 10 位計價名額，兒童費為 ${formatMoney(
    child.amount
  )}。`;
}

function buildInfantExplanation(pricingResolution) {
  const count = pricingResolution.infant_fee?.infant_count || 0;
  return count
    ? `${count} 位未滿 4 歲幼兒不佔床免費，免費名額不設上限；仍須如實填寫並受整體安全容量限制。`
    : "";
}

function buildPetExplanation(pricingResolution) {
  const pet = pricingResolution.pet_fee;
  if (pet?.status === "unresolved") {
    return `另有 ${pet.dog_count} 隻狗狗，請提供每隻體重後才能計算狗狗住宿費。`;
  }
  if (pet?.status !== "resolved") return "";
  return `狗狗住宿費為 ${formatMoney(pet.amount)}；另收每棟寵物押金 ${formatMoney(
    pet.deposit_amount
  )}，押金不計入住宿總額。`;
}

function buildBreakfastExplanation(pricingResolution) {
  const breakfast = pricingResolution.breakfast_fee;
  return breakfast?.quantity
    ? `早餐 ${breakfast.quantity} 份，每份 ${formatMoney(
        breakfast.unit_price
      )}，共 ${formatMoney(breakfast.amount)}。`
    : "";
}

function buildAvailabilityExplanation(message) {
  return /有房|空房|房況|還有房|可以訂/.test(String(message || ""))
    ? "價格可依目前規則試算；實際房況仍須以官網即時訂房系統為準。"
    : "";
}

function buildPricingAnswer(context, pricingResolution, { message = "", prefix = "" } = {}) {
  const state = normalizeConversationContext(context);
  if (pricingResolution?.lodging_price?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }
  return [
    `${prefix}${formatPeriod(state, pricingResolution)}，${formatGuestSummary(state)}。`,
    `成人住宿費為 ${formatMoney(pricingResolution.lodging_price.amount)}。`,
    buildChildExplanation(pricingResolution),
    buildInfantExplanation(pricingResolution),
    buildPetExplanation(pricingResolution),
    buildBreakfastExplanation(pricingResolution),
    `本次試算總額為 ${formatMoney(pricingResolution.total_amount)}。`,
    buildAvailabilityExplanation(message),
  ]
    .filter(Boolean)
    .join("");
}

export function buildOfficialPricingReply(context, pricingResolution, options = {}) {
  return buildPricingAnswer(context, pricingResolution, options);
}

export function buildOfficialPricingConfirmationReply(context, pricingResolution, options = {}) {
  return buildPricingAnswer(context, pricingResolution, { ...options, prefix: "是的，" });
}

export function buildOfficialPricingBreakdownReply(context, pricingResolution, options = {}) {
  const state = normalizeConversationContext(context);
  const lodgingPrice = pricingResolution?.lodging_price;
  if (lodgingPrice?.status !== "resolved") return buildContextualKnowledgeGapReply(state);
  const nightly = (lodgingPrice.nightly || []).map((night, index) => {
    const dateLabel =
      pricingResolution.period_type === "dates"
        ? formatDisplayDate(night.date)
        : `第 ${index + 1} 晚`;
    const discount = night.discountType ? "，第 2 晚起 95 折" : "";
    return `${dateLabel}（${night.dayTypeLabel}）：成人住宿 ${formatMoney(
      night.adultLodgingAmount
    )}、兒童 ${formatMoney(night.childFeeAmount)}、狗狗 ${formatMoney(
      night.petFeeAmount
    )}${discount}，小計 ${formatMoney(night.price)}`;
  });
  return `依 Booking 正式價格核心試算：${nightly.join("；")}。${buildBreakfastExplanation(
    pricingResolution
  )}總額 ${formatMoney(pricingResolution.total_amount)}。${buildAvailabilityExplanation(
    options.message
  )}`;
}

export function buildOfficialLodgingOnlyReply(context, pricingResolution) {
  const state = normalizeConversationContext(context);
  if (pricingResolution?.lodging_price?.status !== "resolved") {
    return buildContextualKnowledgeGapReply(state);
  }
  return `${formatPeriod(state, pricingResolution)}，${formatGuestSummary(
    state
  )}，不含狗狗住宿費與早餐的住宿小計為 ${formatMoney(
    pricingResolution.lodging_and_child_amount
  )}。`;
}

export function buildOfficialRepriceReply(context, pricingResolution, options = {}) {
  return buildPricingAnswer(context, pricingResolution, { ...options, prefix: "好的，已改為 " });
}

export function buildOfficialPricingMetadata(pricingResolution) {
  const lodging = pricingResolution?.lodging_price || {};
  const pet = pricingResolution?.pet_fee || {};
  return {
    lodging_price_status: lodging.status || "unresolved",
    lodging_price_amount: lodging.status === "resolved" ? lodging.amount : null,
    child_fee_amount: pricingResolution?.child_fee?.amount ?? null,
    infant_fee_amount: pricingResolution?.infant_fee?.amount ?? null,
    pet_fee_status: pet.status || "unknown",
    pet_fee_amount: pet.status === "resolved" ? pet.amount : null,
    breakfast_fee_amount: pricingResolution?.breakfast_fee?.amount ?? null,
    total_price_amount: pricingResolution?.total_amount ?? null,
    unresolved_price_items: pricingResolution?.unresolved_price_items || [],
    price_calculation_route:
      pricingResolution?.price_calculation_route || "pricing_unresolved",
  };
}

function buildAddonRoute(routeResult, { answer, reason, metadata = {}, answerMode = "direct" }) {
  return {
    ...routeResult,
    route: answerMode === "collect_info" ? "faq_collect_info" : "grounded_reply",
    providerUsed: "official_pricing",
    answer,
    notice: answer,
    answerMode,
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: true,
    reason,
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      pricing_override_applied: true,
      pricing_called: answerMode !== "collect_info",
      price_calculation_route: supportedDirectPricingRoute,
      ...metadata,
    },
  };
}

function buildAddonPricingRoute(context, routeResult, message) {
  const state = normalizeConversationContext(context);
  const text = String(message || "").normalize("NFKC").replace(/\s+/g, "");

  if (/寵物押金|狗狗?押金/.test(text)) {
    const plan = resolveBookingPetPlan({ dogUnder10kgCount: 1, nights: 1 });
    return buildAddonRoute(routeResult, {
      answer: `寵物押金為每棟 ${formatMoney(
        plan.petDepositAmount
      )}，這是退房檢查後依約退還的押金，不是狗狗住宿費，也不計入住宿總價、訂金或尾款。`,
      reason: "official_pet_deposit",
      metadata: { pricing_subject: "pet_deposit", pet_deposit_amount: plan.petDepositAmount },
    });
  }

  if (/早餐/.test(text) && /多少|費用|價格|幾多/.test(text)) {
    const quantity = nonNegativeInteger(state.breakfast_count);
    if (!quantity) {
      return buildAddonRoute(routeResult, {
        answer: "早餐每份 TWD 250。請問需要幾份早餐呢？",
        reason: "breakfast_quantity_missing",
        answerMode: "collect_info",
        metadata: { pricing_subject: "breakfast" },
      });
    }
    const amount = quantity * breakfastAddonUnitPrice;
    return buildAddonRoute(routeResult, {
      answer: `早餐 ${quantity} 份，每份 ${formatMoney(
        breakfastAddonUnitPrice
      )}，共 ${formatMoney(amount)}；早餐不套用住宿第 2 晚起 95 折。`,
      reason: "official_breakfast_price",
      metadata: { pricing_subject: "breakfast", breakfast_fee_amount: amount },
    });
  }

  if (/兩天一夜|三天兩夜|算幾晚/.test(text) && !hasCompletePricingDetails(state)) {
    const nights = nonNegativeInteger(state.stay_nights);
    if (nights) {
      const label = text.includes("兩天一夜")
        ? "兩天一夜"
        : text.includes("三天兩夜")
          ? "三天兩夜"
          : "這段住宿";
      return buildAddonRoute(routeResult, {
        answer: `${label}是 ${nights} 晚；退房當天不計住宿夜。`,
        reason: "official_stay_night_count",
        metadata: { pricing_subject: "stay_nights", stay_nights: nights },
      });
    }
  }

  if (/(狗|狗狗|犬|毛孩)/.test(text) && /多少|費用|價格|幾多|怎算/.test(text)) {
    const knownDogCount = getKnownDogCount(state);
    const requestedDogCount = nonNegativeInteger(state.pet_count, knownDogCount);
    const missing = [];
    if (!knownDogCount || requestedDogCount > knownDogCount) missing.push("每隻狗狗體重");
    if (!nonNegativeInteger(state.stay_nights)) missing.push("住宿晚數");
    if (missing.length) {
      return buildAddonRoute(routeResult, {
        answer: `請提供${missing.join("與")}，我就能依各體重級距試算狗狗住宿費。`,
        reason: "pet_pricing_fields_missing",
        answerMode: "collect_info",
        metadata: { pricing_subject: "pet_fee" },
      });
    }
    const plan = resolveBookingPetPlan({ ...getDogTierCounts(state), nights: state.stay_nights });
    const lines = plan.petFeeBreakdown
      .filter((item) => item.count > 0)
      .map((item) => `${item.label} ${item.count} 隻，每隻每晚 ${formatMoney(item.unitPrice)}`);
    return buildAddonRoute(routeResult, {
      answer: `${lines.join("；")}。狗狗住宿費共 ${formatMoney(
        plan.petFeeTotal
      )}，第 2 晚起享 95 折。另收每棟寵物押金 ${formatMoney(
        plan.petDepositAmount
      )}，押金不計入住宿總價。`,
      reason: "official_pet_fee",
      metadata: {
        pricing_subject: "pet_fee",
        pet_fee_amount: plan.petFeeTotal,
        pet_deposit_amount: plan.petDepositAmount,
      },
    });
  }
  return null;
}

function hasCompletePricingDetails(context) {
  const state = normalizeConversationContext(context);
  const hasPeriod =
    (isIsoDate(state.check_in) && isIsoDate(state.check_out)) ||
    (state.pricing_day_type && nonNegativeInteger(state.stay_nights) > 0);
  return state.stay_type === "villa" && hasPeriod && getAdultCount(state) !== null;
}

function hasPricingSessionContext(context, recentMessages = []) {
  const state = normalizeConversationContext(context);
  if (state.active_intent === "pricing" || state.current_topic === "booking_price") return true;
  return recentMessages.some(
    (message) => message?.sender === "ai" && message?.metadata?.pricing_override_applied === true
  );
}

function getLatestAssistantMessage(recentMessages = []) {
  return [...recentMessages].reverse().find((message) => message?.sender === "ai");
}

function hasPreviousPricingReply(recentMessages = []) {
  const metadata = getLatestAssistantMessage(recentMessages)?.metadata;
  return Boolean(
    metadata?.lodging_price_status === "resolved" ||
      metadata?.price_calculation_route === supportedDirectPricingRoute ||
      metadata?.pricing_override_applied === true
  );
}

function normalizeCompactText(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
}

function isNewQuestionAcknowledgement(message) {
  return /^(重新問|換一題|換個問題|問別的|重新開始問)/.test(normalizeCompactText(message));
}

function isCasualAcknowledgement(message) {
  return /^(謝謝|感謝|好|好的|了解|知道了|ok|okay)[!！。.]?$/.test(normalizeCompactText(message));
}

function isQuoteConfirmation(message) {
  return /^(確定嗎|真的嗎|這價格對嗎|價格對嗎|對嗎|沒錯嗎|是這樣嗎|確定\?|真的\?)$/.test(
    normalizeCompactText(message)
  );
}

function isQuoteBreakdown(message) {
  return /怎麼算|如何算|怎麼計算|為什麼是|列明細|明細|計算方式|算式/.test(
    normalizeCompactText(message)
  );
}

function isLodgingOnlyQuote(message) {
  return /不含.*(狗|寵物)|光住宿|住宿小計|不含狗狗|不含狗|不含寵物/.test(
    normalizeCompactText(message)
  );
}

export function classifyPricingReplyIntent({
  message,
  recentMessages = [],
  previousContext = null,
  context = null,
  turnAction = "",
} = {}) {
  if (turnActionToPricingReplyMode.has(turnAction)) return turnActionToPricingReplyMode.get(turnAction);
  if (isNewQuestionAcknowledgement(message)) return "new_question_acknowledgement";
  if (isCasualAcknowledgement(message)) return "casual_acknowledgement";
  if (isLodgingOnlyQuote(message)) return "lodging_only_quote";
  if (isQuoteBreakdown(message)) return "quote_breakdown";
  if (isQuoteConfirmation(message)) {
    return hasPreviousPricingReply(recentMessages)
      ? "quote_confirmation"
      : "quote_confirmation_missing_context";
  }
  if (isDeterministicPricingRequest(message, { context, previousContext, recentMessages })) {
    return "initial_quote";
  }
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

function selectPricingReply({ intent, context, pricingResolution, message }) {
  const options = { message };
  if (intent === "quote_confirmation") {
    return buildOfficialPricingConfirmationReply(context, pricingResolution, options);
  }
  if (intent === "quote_breakdown") {
    return buildOfficialPricingBreakdownReply(context, pricingResolution, options);
  }
  if (intent === "lodging_only_quote") return buildOfficialLodgingOnlyReply(context, pricingResolution);
  if (intent === "reprice_after_context_change") {
    return buildOfficialRepriceReply(context, pricingResolution, options);
  }
  return buildOfficialPricingReply(context, pricingResolution, options);
}

export function getPricingRelevantChangedFields(previousContext, context) {
  const before = normalizeConversationContext(previousContext);
  const after = normalizeConversationContext(context);
  return pricingRelevantContextFields.filter((field) => before[field] !== after[field]);
}

export async function buildOfficialPricingRouteOverride(context, routeResult, options = {}) {
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
      contextPatch: { active_intent: null, current_topic: null },
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

  const addonRoute =
    currentTurnIntent === "initial_quote"
      ? buildAddonPricingRoute(context, routeResult, options.message)
      : null;
  if (addonRoute) return addonRoute;
  if (!hasCompletePricingDetails(context)) return null;

  const pricingResolution = await buildOfficialPricingResolution(context, options);
  if (pricingResolution.lodging_price.status !== "resolved") return null;
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
    message: options.message,
  });
  const metadata = {
    ...buildOfficialPricingMetadata(pricingResolution),
    pricing_reply_mode: currentTurnIntent,
    pricing_override_applied: true,
    pricing_override_reason: `official_pricing_${currentTurnIntent}`,
    pricing_subject: "lodging_quote",
    current_turn_intent: currentTurnIntent,
    final_route: finalRoute,
    needs_human: false,
  };
  return {
    ...routeResult,
    route: finalRoute,
    providerUsed: "official_pricing",
    answer,
    notice: answer,
    answerMode: "direct",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: true,
    reason: hasUnresolvedItems
      ? "official_price_resolved_with_missing_addon_details"
      : "official_price_resolved",
    semanticMetadata: { ...(routeResult?.semanticMetadata || {}), ...metadata },
  };
}

export function isExplicitLodgingQuoteRequest(message, options = {}) {
  return isStrongExplicitLodgingQuoteRequest(message, options);
}
