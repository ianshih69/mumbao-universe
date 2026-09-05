import { isDeterministicPricingRequest } from "./pricingIntent.js";

const contextFields = [
  "active_intent",
  "stay_type",
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "infant_count",
  "stay_nights",
  "pricing_day_type",
  "requires_exact_date",
  "pet_count",
  "pet_type",
  "dog_under_10kg_count",
  "dog_10_to_20kg_count",
  "dog_over_20kg_count",
  "breakfast_count",
  "room_count",
  "current_topic",
  "last_updated_at",
];

const nullContext = Object.freeze({
  active_intent: null,
  stay_type: null,
  check_in: null,
  check_out: null,
  guest_count: null,
  adult_count: null,
  child_count: null,
  infant_count: null,
  stay_nights: null,
  pricing_day_type: null,
  requires_exact_date: null,
  pet_count: null,
  pet_type: null,
  dog_under_10kg_count: null,
  dog_10_to_20kg_count: null,
  dog_over_20kg_count: null,
  breakfast_count: null,
  room_count: null,
  current_topic: null,
  last_updated_at: null,
  slot_meta: {},
  pending_interaction: null,
});

const chineseNumberValues = new Map([
  ["零", 0],
  ["〇", 0],
  ["一", 1],
  ["二", 2],
  ["兩", 2],
  ["两", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

const dateRangeSeparators = String.raw`(?:-|~|～|到|至)`;
const numericTokenPattern = String.raw`(?:\d+|[零〇一二兩两三四五六七八九十]+)`;

function cloneNullContext() {
  return { ...nullContext, slot_meta: {}, pending_interaction: null };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCompactText(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const integer = Math.floor(number);
  return integer >= 0 ? integer : null;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function normalizeIsoDate(value) {
  return isIsoDate(value) ? String(value) : null;
}

function toDateOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

function parseDateOnly(value) {
  const text = toDateOnly(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function makeUtcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function compareDateOnly(a, b) {
  const aTime = parseDateOnly(a)?.getTime();
  const bTime = parseDateOnly(b)?.getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
  return aTime - bTime;
}

function addDays(dateText, days) {
  const date = parseDateOnly(dateText);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function daysBetween(checkIn, checkOut) {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return nights > 0 ? nights : null;
}

function inferYear(month, day, baseDateText) {
  const baseDate = parseDateOnly(baseDateText) || new Date();
  let year = baseDate.getUTCFullYear();
  let candidate = makeUtcDate(year, month, day);
  if (!candidate) return null;

  const baseDay = makeUtcDate(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth() + 1,
    baseDate.getUTCDate(),
  );

  if (baseDay && candidate.getTime() < baseDay.getTime()) {
    year += 1;
    candidate = makeUtcDate(year, month, day);
  }

  return candidate ? year : null;
}

function resolveDateRange({ startYear, startMonth, startDay, endYear, endMonth, endDay, baseDateText }) {
  const inferredStartYear = startYear || inferYear(startMonth, startDay, baseDateText);
  if (!inferredStartYear) return null;

  let resolvedEndMonth = endMonth || startMonth;
  let resolvedEndYear = endYear || inferredStartYear;

  if (!endYear) {
    if (!endMonth && Number(endDay) <= Number(startDay)) {
      resolvedEndMonth += 1;
    }
    if (resolvedEndMonth > 12) {
      resolvedEndMonth -= 12;
      resolvedEndYear += 1;
    }
  }

  const checkInDate = makeUtcDate(inferredStartYear, Number(startMonth), Number(startDay));
  let checkOutDate = makeUtcDate(resolvedEndYear, Number(resolvedEndMonth), Number(endDay));

  if (!checkInDate || !checkOutDate) return null;
  if (checkOutDate.getTime() <= checkInDate.getTime()) {
    checkOutDate = makeUtcDate(resolvedEndYear + 1, Number(resolvedEndMonth), Number(endDay));
  }
  if (!checkOutDate) return null;

  return {
    check_in: formatDate(
      checkInDate.getUTCFullYear(),
      checkInDate.getUTCMonth() + 1,
      checkInDate.getUTCDate(),
    ),
    check_out: formatDate(
      checkOutDate.getUTCFullYear(),
      checkOutDate.getUTCMonth() + 1,
      checkOutDate.getUTCDate(),
    ),
  };
}

function parseDateRange(message, baseDateText) {
  const text = normalizeText(message).replace(/[－—–]/g, "-");

  let match = text.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})(?:日|號)?(?:入住)?\s*[，,]?\s*(?:至|到|-)?\s*(\d{4})年(\d{1,2})月(\d{1,2})(?:日|號)?(?:退房)?/,
  );
  if (match) {
    return resolveDateRange({
      startYear: Number(match[1]),
      startMonth: Number(match[2]),
      startDay: Number(match[3]),
      endYear: Number(match[4]),
      endMonth: Number(match[5]),
      endDay: Number(match[6]),
      baseDateText,
    });
  }

  match = text.match(
    /(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:入住)?\s*[，,]?\s*(?:至|到|-)?\s*(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?:退房)?/,
  );
  if (match) {
    return resolveDateRange({
      startYear: Number(match[1]),
      startMonth: Number(match[2]),
      startDay: Number(match[3]),
      endYear: Number(match[4]),
      endMonth: Number(match[5]),
      endDay: Number(match[6]),
      baseDateText,
    });
  }

  match = text.match(
    new RegExp(
      String.raw`(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\s*${dateRangeSeparators}\s*(\d{1,2})(?!\d)`,
    ),
  );
  if (match) {
    return resolveDateRange({
      startYear: Number(match[1]),
      startMonth: Number(match[2]),
      startDay: Number(match[3]),
      endDay: Number(match[4]),
      baseDateText,
    });
  }

  match = text.match(
    new RegExp(
      String.raw`(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\s*${dateRangeSeparators}\s*(?:(\d{4})[\/.-])?(\d{1,2})[\/.-](\d{1,2})`,
    ),
  );
  if (match) {
    return resolveDateRange({
      startYear: Number(match[1]),
      startMonth: Number(match[2]),
      startDay: Number(match[3]),
      endYear: match[4] ? Number(match[4]) : null,
      endMonth: Number(match[5]),
      endDay: Number(match[6]),
      baseDateText,
    });
  }

  match = text.match(
    new RegExp(String.raw`(\d{1,2})[\/.-](\d{1,2})\s*${dateRangeSeparators}\s*(\d{1,2})[\/.-](\d{1,2})`),
  );
  if (match) {
    return resolveDateRange({
      startMonth: Number(match[1]),
      startDay: Number(match[2]),
      endMonth: Number(match[3]),
      endDay: Number(match[4]),
      baseDateText,
    });
  }

  match = text.match(
    new RegExp(String.raw`(\d{1,2})[\/.-](\d{1,2})\s*${dateRangeSeparators}\s*(\d{1,2})(?!\d)`),
  );
  if (match) {
    return resolveDateRange({
      startMonth: Number(match[1]),
      startDay: Number(match[2]),
      endDay: Number(match[3]),
      baseDateText,
    });
  }

  match = text.match(
    new RegExp(String.raw`(\d{1,2})月(\d{1,2})(?:日|號)?\s*${dateRangeSeparators}\s*(?:(\d{1,2})月)?(\d{1,2})(?:日|號)?`),
  );
  if (match) {
    return resolveDateRange({
      startMonth: Number(match[1]),
      startDay: Number(match[2]),
      endMonth: match[3] ? Number(match[3]) : null,
      endDay: Number(match[4]),
      baseDateText,
    });
  }

  return null;
}

function parseSingleDate(message) {
  const text = normalizeText(message).replace(/[－—–]/g, "-");
  let match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})(?:日|號)?/);
  if (!match) {
    match = text.match(/(?:^|\D)(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/);
  }
  if (!match) return null;

  const date = makeUtcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return date
    ? formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    : null;
}

function parseChineseNumber(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  if (chineseNumberValues.has(text)) return chineseNumberValues.get(text);

  const tenIndex = text.indexOf("十");
  if (tenIndex >= 0) {
    const left = text.slice(0, tenIndex);
    const right = text.slice(tenIndex + 1);
    const tens = left ? chineseNumberValues.get(left) : 1;
    const ones = right ? chineseNumberValues.get(right) : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) {
      return tens * 10 + ones;
    }
  }

  return null;
}

function firstNumber(pattern, text) {
  const match = text.match(pattern);
  if (!match) return null;
  return parseChineseNumber(match[1]);
}

export function classifyGuestAgeForPricing({ years, months = 0 } = {}) {
  const wholeYears = Number(years);
  const extraMonths = Number(months);
  if (!Number.isInteger(wholeYears) || wholeYears < 0) return null;
  if (!Number.isInteger(extraMonths) || extraMonths < 0 || extraMonths > 11) return null;

  const ageInMonths = wholeYears * 12 + extraMonths;
  if (ageInMonths < 4 * 12) return "infant";
  if (ageInMonths < 13 * 12) return "child";
  return "adult";
}

function extractDogWeightCounts(message) {
  const compact = normalizeCompactText(message);
  const result = {
    dog_under_10kg_count: 0,
    dog_10_to_20kg_count: 0,
    dog_over_20kg_count: 0,
  };
  const weightPattern = new RegExp(
    `(?:(${numericTokenPattern})(?:隻|只))?(?:(?:狗狗|狗|犬|毛孩|寵物))?(?:剛好|約|大約)?(${numericTokenPattern}(?:\\.\\d+)?)公斤`,
    "g"
  );
  let match;
  let matched = false;
  while ((match = weightPattern.exec(compact))) {
    const count = match[1] ? parseChineseNumber(match[1]) : 1;
    const weight = /^\d+(?:\.\d+)?$/.test(match[2])
      ? Number(match[2])
      : parseChineseNumber(match[2]);
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(weight)) continue;
    matched = true;
    if (weight <= 10) result.dog_under_10kg_count += count;
    else if (weight <= 20) result.dog_10_to_20kg_count += count;
    else result.dog_over_20kg_count += count;
  }

  return matched ? result : null;
}

function extractPricingDayType(message) {
  const compact = normalizeCompactText(message);
  if (/連假|連續假日|週六|周六|星期六|禮拜六|假日/.test(compact)) return "holiday";
  if (/週五|周五|星期五|禮拜五/.test(compact)) return "friday";
  if (/平日/.test(compact)) return "weekday";
  return null;
}

function extractCounts(message) {
  const text = normalizeText(message);
  const compact = normalizeCompactText(message);
  const extracted = {};

  const adultCount = firstNumber(new RegExp(`(${numericTokenPattern})(?:位|個)?(?:大人|成人)`), compact);
  const childCount = firstNumber(
    new RegExp(
      `(${numericTokenPattern})(?:位|個)?(?:(?:滿?4(?:歲)?(?:到|至|~|～|-)12歲)|(?:4(?:到|至|~|～|-)12歲))?(?:不佔床)?(?:小孩|兒童|孩童)`
    ),
    compact
  );
  const infantCount = firstNumber(
    new RegExp(`(${numericTokenPattern})(?:位|個)?(?:未滿4歲)?(?:嬰兒|嬰幼兒|幼兒)`),
    compact
  );
  const guestCount = firstNumber(new RegExp(`(${numericTokenPattern})(?:位|個)?(?:人|位|入住|住客)`), compact);
  const roomCount = firstNumber(new RegExp(`(${numericTokenPattern})(?:間房|間|房)`), compact);
  const nights = firstNumber(new RegExp(`(${numericTokenPattern})(?:晚|夜)`), compact);
  const breakfastCount =
    firstNumber(new RegExp(`早餐(${numericTokenPattern})(?:份)?`), compact) ??
    firstNumber(new RegExp(`(${numericTokenPattern})份早餐`), compact);

  if (adultCount !== null) extracted.adult_count = adultCount;
  if (childCount !== null) extracted.child_count = childCount;
  if (infantCount !== null) extracted.infant_count = infantCount;
  if (guestCount !== null) extracted.guest_count = guestCount;
  if (roomCount !== null) extracted.room_count = roomCount;
  if (nights !== null) extracted.stay_nights = nights;
  if (breakfastCount !== null) extracted.breakfast_count = breakfastCount;

  const pricingDayType = extractPricingDayType(message);
  if (pricingDayType) extracted.pricing_day_type = pricingDayType;
  if (/暑假|過年|春節|特殊日期/.test(compact)) {
    extracted.requires_exact_date = /暑假/.test(compact) ? "summer" : "special_date";
    extracted.pricing_day_type = null;
  }

  const dogWeightCounts = extractDogWeightCounts(message);
  if (dogWeightCounts) {
    Object.assign(extracted, dogWeightCounts);
    extracted.pet_count =
      dogWeightCounts.dog_under_10kg_count +
      dogWeightCounts.dog_10_to_20kg_count +
      dogWeightCounts.dog_over_20kg_count;
    extracted.pet_type = "dog";
  }

  if (
    /(不帶|沒有|無)(狗|狗狗|犬|貓|貓咪|寵物|毛孩)/.test(compact) ||
    /(狗|狗狗|犬|貓|貓咪|寵物|毛孩)(不去|不來|不帶|沒去|沒有去)/.test(compact)
  ) {
    extracted.pet_count = 0;
    extracted.pet_type = null;
    return extracted;
  }

  const petMatch = text
    .replace(/\s+/g, "")
    .match(new RegExp(`(${numericTokenPattern})(?:隻|只|個)?(狗狗|狗|犬|貓咪|貓|寵物|毛孩)`));
  if (petMatch && !dogWeightCounts) {
    const petCount = parseChineseNumber(petMatch[1]);
    if (petCount !== null) extracted.pet_count = petCount;
    if (/狗|犬/.test(petMatch[2])) extracted.pet_type = "dog";
    else if (/貓/.test(petMatch[2])) extracted.pet_type = "cat";
    else extracted.pet_type = "pet";
  }

  return extracted;
}

function extractIntentAndTopic(message, previousContext) {
  const compact = normalizeCompactText(message);
  const extracted = {};
  const hasPricingCue = isDeterministicPricingRequest(message, {
    previousContext,
  });
  const hasFacilityCue = /(烤肉|bbq|設施|ktv|廚房|泳池|停車|早餐)/i.test(compact);

  if (hasPricingCue) {
    extracted.active_intent = "pricing";
    extracted.current_topic = "booking_price";
  } else if (hasFacilityCue) {
    extracted.active_intent = "facilities";
    extracted.current_topic = /烤肉|bbq/i.test(compact) ? "barbecue" : "facilities";
  }

  if (/(包棟|整棟|villa|全棟)/i.test(compact)) {
    extracted.stay_type = "villa";
  } else if (/(單間|一間房|房間|改訂單間|改成單間)/.test(compact)) {
    extracted.stay_type = "room";
  }

  if (hasPricingCue && !extracted.stay_type) {
    extracted.stay_type = "villa";
  }

  if (!extracted.active_intent && previousContext?.active_intent && hasFollowUpCue(compact)) {
    extracted.active_intent = previousContext.active_intent;
    extracted.current_topic = previousContext.current_topic;
  }

  return extracted;
}

function hasFollowUpCue(compactMessage) {
  return /^(那|這樣|所以|請問|再問|改成|日期改|不帶|有|可以|能|多少|總共)/.test(compactMessage);
}

function hasDateChangeCue(message) {
  const compact = normalizeCompactText(message);
  return /日期改|改日期|改到|換日期|改入住|改退房/.test(compact);
}

function shouldResetConversationContext(message) {
  const compact = normalizeCompactText(message);
  return (
    compact.includes("重新開始") ||
    compact.includes("換一個問題") ||
    compact.includes("不是問住宿") ||
    compact.includes("先不要問住宿")
  );
}

function normalizeContextPatch(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== undefined),
  );
}

function normalizeSlotMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = {};
  for (const [field, rawMeta] of Object.entries(value)) {
    if (!contextFields.includes(field)) continue;
    if (!rawMeta || typeof rawMeta !== "object" || Array.isArray(rawMeta)) continue;

    const meta = {};
    const source = normalizeNullableText(rawMeta.source);
    const sourceMessageId = normalizeNullableText(rawMeta.source_message_id);
    const updatedAt = normalizeNullableText(rawMeta.updated_at);
    const confidence = Number(rawMeta.confidence);

    if (source) meta.source = source.slice(0, 40);
    if (sourceMessageId) meta.source_message_id = sourceMessageId.slice(0, 80);
    if (updatedAt) meta.updated_at = updatedAt;
    if (Number.isFinite(confidence)) {
      meta.confidence = Math.max(0, Math.min(confidence, 1));
    }

    if (Object.keys(meta).length) normalized[field] = meta;
  }

  return normalized;
}

function normalizePendingProposedValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const normalized = normalizeConversationContext(value);
  const proposed = {};
  for (const field of contextFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    if (field === "last_updated_at") continue;
    proposed[field] = normalized[field];
  }

  return proposed;
}

export function normalizePendingInteraction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const action = normalizeNullableText(value.action);
  const requiredResponseType = normalizeNullableText(value.required_response_type);
  const resumeAction = normalizeNullableText(value.resume_action);
  if (!action || !requiredResponseType || !resumeAction) return null;

  const requiredFields = Array.isArray(value.required_fields)
    ? value.required_fields
        .map((field) => String(field || "").trim())
        .filter((field, index, fields) => contextFields.includes(field) && fields.indexOf(field) === index)
    : [];

  return {
    action: action.slice(0, 80),
    proposed_values: normalizePendingProposedValues(value.proposed_values),
    required_response_type: requiredResponseType.slice(0, 80),
    resume_action: resumeAction.slice(0, 80),
    ...(requiredFields.length ? { required_fields: requiredFields } : {}),
    source_assistant_message_id:
      normalizeNullableText(value.source_assistant_message_id)?.slice(0, 80) || null,
    created_at: normalizeNullableText(value.created_at),
    expires_at: normalizeNullableText(value.expires_at),
  };
}

function hasMeaningfulContext(context) {
  return (
    contextFields.some((field) => field !== "last_updated_at" && context?.[field] !== null && context?.[field] !== undefined) ||
    Boolean(normalizePendingInteraction(context?.pending_interaction))
  );
}

function contextsEqual(a, b) {
  return (
    contextFields.every((field) => a?.[field] === b?.[field]) &&
    JSON.stringify(normalizePendingInteraction(a?.pending_interaction)) ===
      JSON.stringify(normalizePendingInteraction(b?.pending_interaction))
  );
}

function writeSlotMeta(context, fields, { source, sourceMessageId, updatedAt, confidence } = {}) {
  const next = {
    ...context,
    slot_meta: {
      ...(context?.slot_meta || {}),
    },
  };

  for (const field of fields || []) {
    if (!contextFields.includes(field)) continue;
    next.slot_meta[field] = {
      source: source || "deterministic",
      ...(sourceMessageId ? { source_message_id: sourceMessageId } : {}),
      updated_at: updatedAt || new Date().toISOString(),
      ...(Number.isFinite(confidence) ? { confidence } : {}),
    };
  }

  return next;
}

function mergeSingleMessage(previousContext, message, { baseDateText, nowIso } = {}) {
  let base = normalizeConversationContext(previousContext);
  const originalBase = { ...base };

  if (shouldResetConversationContext(message)) {
    base = cloneNullContext();
  }

  const extracted = {
    ...extractIntentAndTopic(message, base),
    ...extractCounts(message),
  };
  const dateRange = parseDateRange(message, baseDateText);
  if (dateRange) {
    extracted.check_in = dateRange.check_in;
    extracted.check_out = dateRange.check_out;
    extracted.stay_nights = daysBetween(dateRange.check_in, dateRange.check_out);
    extracted.pricing_day_type = null;
    extracted.requires_exact_date = null;
  } else if (parseSingleDate(message)) {
    extracted.check_in = parseSingleDate(message);
    extracted.check_out = extracted.stay_nights
      ? addDays(extracted.check_in, extracted.stay_nights)
      : null;
    extracted.pricing_day_type = null;
    extracted.requires_exact_date = null;
  } else if (hasDateChangeCue(message)) {
    extracted.check_in = null;
    extracted.check_out = null;
  } else if (extracted.stay_nights && base.check_in) {
    extracted.check_out = addDays(base.check_in, extracted.stay_nights);
  }

  const normalizedPatch = normalizeContextPatch(extracted);
  const context = {
    ...base,
    ...normalizedPatch,
  };

  if (Object.keys(normalizedPatch).length || shouldResetConversationContext(message)) {
    context.last_updated_at = nowIso || new Date().toISOString();
  }

  const contextWithMeta = Object.keys(normalizedPatch).length
    ? writeSlotMeta(context, Object.keys(normalizedPatch), {
        source: "deterministic",
        updatedAt: context.last_updated_at,
        confidence: 0.7,
      })
    : context;

  return {
    context: contextWithMeta,
    extracted: normalizedPatch,
    reset: shouldResetConversationContext(message),
    changed: !contextsEqual(originalBase, contextWithMeta),
  };
}

function deriveContextFromRecentMessages(recentMessages, { baseDateText, nowIso } = {}) {
  let context = cloneNullContext();
  const messages = Array.isArray(recentMessages) ? recentMessages : [];

  for (const item of messages) {
    const sender = String(item?.sender || item?.role || "").toLowerCase();
    if (sender !== "user") continue;
    const message = String(item?.message || "").trim();
    if (!message) continue;
    context = mergeSingleMessage(context, message, {
      baseDateText,
      nowIso: item?.created_at || nowIso,
    }).context;
  }

  return context;
}

export function normalizeConversationContext(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const context = cloneNullContext();

  context.active_intent = normalizeNullableText(source.active_intent);
  context.stay_type = normalizeNullableText(source.stay_type);
  context.check_in = normalizeIsoDate(source.check_in);
  context.check_out = normalizeIsoDate(source.check_out);
  context.guest_count = normalizeInteger(source.guest_count);
  context.adult_count = normalizeInteger(source.adult_count);
  context.child_count = normalizeInteger(source.child_count);
  context.infant_count = normalizeInteger(source.infant_count);
  context.stay_nights = normalizeInteger(source.stay_nights);
  context.pricing_day_type = ["weekday", "friday", "holiday"].includes(
    String(source.pricing_day_type || "")
  )
    ? String(source.pricing_day_type)
    : null;
  context.requires_exact_date = normalizeNullableText(source.requires_exact_date);
  context.pet_count = normalizeInteger(source.pet_count);
  context.pet_type = normalizeNullableText(source.pet_type);
  context.dog_under_10kg_count = normalizeInteger(source.dog_under_10kg_count);
  context.dog_10_to_20kg_count = normalizeInteger(source.dog_10_to_20kg_count);
  context.dog_over_20kg_count = normalizeInteger(source.dog_over_20kg_count);
  context.breakfast_count = normalizeInteger(source.breakfast_count);
  context.room_count = normalizeInteger(source.room_count);
  context.current_topic = normalizeNullableText(source.current_topic);
  context.last_updated_at = normalizeNullableText(source.last_updated_at);
  context.slot_meta = normalizeSlotMeta(source.slot_meta);
  context.pending_interaction = normalizePendingInteraction(source.pending_interaction);

  return context;
}

export function buildConversationContextUpdate({
  previousContext,
  recentMessages = [],
  message,
  dateInfo = {},
  nowIso,
} = {}) {
  const baseDateText = dateInfo.currentDate || toDateOnly(nowIso) || toDateOnly(new Date().toISOString());
  const normalizedPrevious = normalizeConversationContext(previousContext);
  const baseContext = hasMeaningfulContext(normalizedPrevious)
    ? normalizedPrevious
    : deriveContextFromRecentMessages(recentMessages, { baseDateText, nowIso });
  const merged = mergeSingleMessage(baseContext, message, {
    baseDateText,
    nowIso: nowIso || new Date().toISOString(),
  });

  return {
    ...merged,
    previousContext: baseContext,
    retrievalText: buildConversationRetrievalText(message, merged.context),
    promptContext: buildConversationPromptContext(merged.context),
    hasContext: hasMeaningfulContext(merged.context),
  };
}

export function buildConversationRetrievalText(message, context) {
  const state = normalizeConversationContext(context);
  const segments = [];

  if (state.active_intent === "pricing") segments.push("查詢住宿價格");
  if (state.active_intent === "facilities") segments.push("查詢住宿設施");
  if (state.stay_type === "villa") segments.push("包棟");
  if (state.stay_type === "room") segments.push("單間");
  if (state.check_in) segments.push(`${state.check_in}入住`);
  if (state.check_out) segments.push(`${state.check_out}退房`);
  if (state.pricing_day_type === "weekday") segments.push("平日");
  if (state.pricing_day_type === "friday") segments.push("週五");
  if (state.pricing_day_type === "holiday") segments.push("週六或連續假日");
  if (state.requires_exact_date === "summer") segments.push("暑假需確切日期");
  if (state.stay_nights !== null) segments.push(`${state.stay_nights}晚`);
  if (state.guest_count !== null) segments.push(`${state.guest_count}人`);
  if (state.adult_count !== null) segments.push(`${state.adult_count}位大人`);
  if (state.child_count !== null) segments.push(`${state.child_count}位小孩`);
  if (state.infant_count !== null) segments.push(`${state.infant_count}位未滿4歲幼兒`);
  if (state.room_count !== null) segments.push(`${state.room_count}間房`);
  if (state.pet_count !== null) {
    if (state.pet_count === 0) {
      segments.push("不帶寵物");
    } else {
      const petLabel = state.pet_type === "dog" ? "狗" : state.pet_type === "cat" ? "貓" : "寵物";
      segments.push(`${state.pet_count}隻${petLabel}`);
    }
  }
  if (state.dog_under_10kg_count) segments.push(`10公斤以下狗狗${state.dog_under_10kg_count}隻`);
  if (state.dog_10_to_20kg_count) segments.push(`超過10至20公斤狗狗${state.dog_10_to_20kg_count}隻`);
  if (state.dog_over_20kg_count) segments.push(`超過20公斤狗狗${state.dog_over_20kg_count}隻`);
  if (state.breakfast_count !== null) segments.push(`早餐${state.breakfast_count}份`);
  if (state.current_topic === "barbecue") segments.push("烤肉");

  const userMessage = normalizeText(message);
  if (userMessage) segments.push(`客人原句：${userMessage}`);

  return segments.length ? segments.join("；") : userMessage;
}

export function buildConversationPromptContext(context) {
  const state = normalizeConversationContext(context);
  if (!hasMeaningfulContext(state)) return "";

  const lines = [
    "<customer_request_context>",
    "以下是同一聊天 session 內由客人提供或修正的短期需求條件。這不是民宿事實，只能用來理解客人需求；價格、規則與可否提供服務仍必須依 approved knowledge 回答。",
  ];

  for (const field of contextFields) {
    lines.push(`${field}: ${state[field] === null ? "null" : state[field]}`);
  }
  lines.push(`pending_interaction: ${state.pending_interaction ? JSON.stringify(state.pending_interaction) : "null"}`);

  lines.push("</customer_request_context>");
  return lines.join("\n");
}

function formatDisplayDate(value) {
  if (!isIsoDate(value)) return "";
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function buildStaySummary(context) {
  const state = normalizeConversationContext(context);
  const parts = [];

  if (state.check_in && state.check_out) {
    parts.push(`${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(state.check_out)}退房`);
  } else if (state.check_in) {
    parts.push(`${formatDisplayDate(state.check_in)}入住`);
  } else if (state.pricing_day_type) {
    const label = {
      weekday: "平日",
      friday: "週五",
      holiday: "週六／連續假日",
    }[state.pricing_day_type];
    parts.push(`${label}${state.stay_nights ? `住${state.stay_nights}晚` : ""}`);
  }

  if (state.stay_type === "villa") parts.push("包棟");
  if (state.stay_type === "room") parts.push("單間");
  if (state.guest_count !== null) parts.push(`${state.guest_count}位入住`);
  if (state.adult_count !== null) parts.push(`${state.adult_count}位成人`);
  if (state.child_count !== null) parts.push(`${state.child_count}位4～12歲不佔床兒童`);
  if (state.infant_count !== null) parts.push(`${state.infant_count}位未滿4歲幼兒`);
  if (state.pet_count !== null) {
    if (state.pet_count === 0) {
      parts.push("不攜帶寵物");
    } else {
      const petLabel = state.pet_type === "dog" ? "狗" : state.pet_type === "cat" ? "貓" : "寵物";
      parts.push(`攜帶${state.pet_count}隻${petLabel}`);
    }
  }

  return parts.join("，");
}

export function buildContextualKnowledgeGapReply(context) {
  const state = normalizeConversationContext(context);
  if (state.active_intent !== "pricing" && state.current_topic !== "booking_price") {
    return "";
  }

  const missing = [];
  if (state.requires_exact_date && !state.check_in) {
    missing.push("確切入住日期與年份");
  } else if (!state.check_in && !state.pricing_day_type) {
    missing.push("入住日期或日期類型");
  }
  if (
    (!state.check_out && !state.stay_nights) ||
    (state.pricing_day_type && !state.stay_nights)
  ) {
    missing.push("住宿晚數");
  }
  if (state.guest_count === null && state.adult_count === null) {
    missing.push("成人與4～12歲兒童人數");
  }
  const dogWeightCount =
    (state.dog_under_10kg_count || 0) +
    (state.dog_10_to_20kg_count || 0) +
    (state.dog_over_20kg_count || 0);
  if (state.pet_count > dogWeightCount) missing.push("每隻狗狗體重");

  const summary = buildStaySummary(state);
  if (missing.length) {
    if (state.check_in && state.check_out) {
      return `收到，我先以${formatDisplayDate(state.check_in)}入住、${formatDisplayDate(
        state.check_out,
      )}退房的${state.stay_type === "villa" ? "包棟" : "住宿"}需求確認。請問${missing.join("、")}？`;
    }

    return `請提供${missing.join("、")}。`;
  }

  return `收到，目前需求是 ${summary}。實際房價及寵物安排仍需由管家確認，我已將完整需求整理好。`;
}

function hasPricingContext(context) {
  const state = normalizeConversationContext(context);
  return state.active_intent === "pricing" || state.current_topic === "booking_price";
}

export function getMissingBookingContextFields(context) {
  const state = normalizeConversationContext(context);
  const missing = [];

  if (!state.stay_type) missing.push("stay_type");
  if (state.requires_exact_date && !state.check_in) {
    missing.push("exact_date");
  } else if (!state.check_in && !state.pricing_day_type) {
    missing.push("stay_period");
  } else if ((!state.check_out && !state.stay_nights) || (state.pricing_day_type && !state.stay_nights)) {
    missing.push("stay_nights");
  }
  if (state.guest_count === null && state.adult_count === null) {
    missing.push("guest_count");
  }
  const dogWeightCount =
    (state.dog_under_10kg_count || 0) +
    (state.dog_10_to_20kg_count || 0) +
    (state.dog_over_20kg_count || 0);
  if (state.pet_count > dogWeightCount) missing.push("dog_weights");

  return missing;
}

function missingFieldsToQuestion(missing) {
  const labels = [];
  if (missing.includes("stay_type")) labels.push("想包棟或訂單間");
  if (missing.includes("stay_period")) labels.push("入住日期或日期類型與晚數");
  if (missing.includes("exact_date")) labels.push("確切入住日期與年份");
  if (missing.includes("stay_nights")) labels.push("住宿晚數");
  if (missing.includes("guest_count")) labels.push("成人與4～12歲兒童各有幾位");
  if (missing.includes("dog_weights")) labels.push("每隻狗狗的體重");
  return labels;
}

function hasGenericCollectInfoCue(routeResult) {
  const text = [
    routeResult?.answer,
    routeResult?.notice,
    ...(routeResult?.matchedFaqItems || []).flatMap((item) => [
      item?.question,
      item?.answer,
      ...(Array.isArray(item?.keywords) ? item.keywords : []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  return /請.{0,8}提供|入住日期|日期|人數|幾位|寵物|包棟|單間|房價|價格|費用/.test(text);
}

function buildContextualMissingFieldsReply(context, missingFieldsOverride = null) {
  const state = normalizeConversationContext(context);
  const missing = Array.isArray(missingFieldsOverride)
    ? missingFieldsOverride
    : getMissingBookingContextFields(state);
  if (!missing.length) return "";

  const summary = buildStaySummary(state);
  const questions = missingFieldsToQuestion(missing);
  if (!questions.length) return "";

  if (summary) {
    return `收到，目前是 ${summary}。請問${questions.join("、")}呢？`;
  }

  return `收到，請問${questions.join("、")}呢？`;
}

export function buildContextualKnowledgeRouteOverride(
  context,
  routeResult,
  options = {}
) {
  if (!hasPricingContext(context)) return null;

  const eligibleRoute = [
    "faq_direct",
    "faq_collect_info",
    "ask_human",
    "knowledge_gap",
  ].includes(routeResult?.route);
  if (!eligibleRoute) return null;

  const missingReply = buildContextualMissingFieldsReply(
    context,
    options.missingFields
  );
  if (missingReply) {
    return {
      route: "faq_collect_info",
      providerUsed: "faq_collect_info",
      answer: missingReply,
      notice: "",
      answerMode: "collect_info",
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: false,
      knowledgeGap: false,
      aiSkipped: true,
      reason: "conversation_context_missing_fields",
    };
  }

  if (routeResult?.knowledgeGap || routeResult?.answerMode === "collect_info" || hasGenericCollectInfoCue(routeResult)) {
    const summaryReply = buildContextualKnowledgeGapReply(context);
    if (!summaryReply) return null;

    return {
      route: "knowledge_gap",
      providerUsed: "knowledge_gap",
      answer: summaryReply,
      notice: summaryReply,
      answerMode: null,
      shouldCallDeepSeek: false,
      shouldMarkNeedsHuman: true,
      knowledgeGap: true,
      aiSkipped: true,
      reason: "conversation_context_complete_needs_human",
    };
  }

  return null;
}

export function getConversationContextForStorage(context) {
  return normalizeConversationContext(context);
}
