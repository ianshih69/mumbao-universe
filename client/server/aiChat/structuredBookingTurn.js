import { z } from "zod";
import {
  getConversationContextForStorage,
  normalizeConversationContext,
} from "./conversationContext.js";

export const structuredTurnOperations = Object.freeze([
  "set",
  "add",
  "remove",
  "replace",
  "clear",
]);

export const structuredTurnEntities = Object.freeze([
  "stay",
  "adult",
  "child",
  "infant",
  "pet",
  "breakfast",
]);

export const structuredTurnIntents = Object.freeze([
  "request_quote",
  "update_party",
  "update_pet",
  "update_dates",
  "update_breakfast",
  "availability_request",
  "policy_question",
]);

const structuredTurnPreviousTopics = new Set([
  "booking",
  "booking_price",
  "booking_update",
  "pricing",
  "availability",
  "checkin_info",
  "checkout_info",
]);

const structuredTurnPendingFields = new Set([
  "stay_type",
  "check_in",
  "check_out",
  "stay_nights",
  "pricing_day_type",
  "adult_count",
  "guest_count",
  "child_count",
  "child_ages_years",
  "infant_count",
  "pet_count",
  "pet_type",
  "pet_weights_kg",
  "dog_under_10kg_count",
  "dog_10_to_20kg_count",
  "dog_over_20kg_count",
  "breakfast_count",
]);

const operationSchema = z
  .object({
    operation: z.enum(structuredTurnOperations),
    entity: z.enum(structuredTurnEntities),
    count: z.number().int().min(0).max(99).optional(),
    pet_type: z.enum(["dog", "cat", "pet"]).optional(),
    weights_kg: z.array(z.number().positive().max(200)).max(20).optional(),
    target_pet: z.number().int().min(0).max(19).optional(),
    target_scope: z.enum(["all"]).optional(),
    ages_years: z.array(z.number().min(0).max(120)).max(30).optional(),
    mode: z.enum(["villa", "room"]).optional(),
    check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    nights: z.number().int().min(1).max(60).optional(),
    date_type: z.enum(["weekday", "friday", "holiday"]).optional(),
    evidence: z.string().trim().min(1).max(280),
  })
  .strict();

const ambiguitySchema = z
  .object({
    code: z.enum([
      "missing_entity",
      "missing_pet_context",
      "missing_party_count",
      "missing_exact_year",
      "ambiguous_stay_days",
      "missing_reference",
      "pending_slot_fill",
      "pending_slot_fill_stale",
      "pending_slot_fill_duplicate",
      "conflicting_operations",
      "unsupported_entity_value",
      "low_confidence",
    ]),
    evidence: z.string().trim().min(1).max(280),
    question: z.string().trim().min(1).max(280),
  })
  .strict();

export const structuredTurnResultSchema = z
  .object({
    intents: z.array(z.enum(structuredTurnIntents)).max(8),
    operations: z.array(operationSchema).max(20),
    missing_fields: z.array(z.string().trim().min(1).max(80)).max(20),
    ambiguities: z.array(ambiguitySchema).max(10),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const chineseDigits = new Map([
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

const numberTokenSource = String.raw`(?:\d+(?:\.\d+)?|[零〇一二兩两三四五六七八九十百]+)`;
const quoteCuePattern = /多少|價格|房價|費用|報價|總共|算一下|多少錢/;
const availabilityCuePattern = /有房|房況|空房|可訂|可以訂|能入住|可以入住/;
const policyCuePattern = /可以|能不能|是否|規定|政策|怎麼辦|有提供|接受/;
const hardPolicyPricingCuePattern = /押金|訂金|退款|取消費|違約|賠償/;
const addCuePattern = /再加|加上|增加|追加|再帶|另(?:外|一|二|兩|两|三|四|五|六|七|八|九|十|\d)|多(?:一|二|兩|两|三|四|五|六|七|八|九|十|\d)|還有|還會帶/;
const replaceCuePattern = new RegExp(
  String.raw`改成|改為|換成|變成|調整為|人數改|日期改|改到|改(?=${numberTokenSource})`,
);
const removeCuePattern = /減少|扣掉|移除|拿掉|少(?:一|二|兩|两|三|四|五|六|七|八|九|十|\d)|不帶|不要帶/;
const clauseBoundaryPattern = /[，,。；;！？!?＋+、]|(?:跟|和|以及)/g;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function parseNumberToken(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (chineseDigits.has(text)) return chineseDigits.get(text);

  const hundredIndex = text.indexOf("百");
  if (hundredIndex >= 0) {
    const left = text.slice(0, hundredIndex);
    const right = text.slice(hundredIndex + 1);
    const hundreds = left ? chineseDigits.get(left) : 1;
    const remainder = right ? parseNumberToken(right) : 0;
    return Number.isFinite(hundreds) && Number.isFinite(remainder)
      ? hundreds * 100 + remainder
      : null;
  }

  const tenIndex = text.indexOf("十");
  if (tenIndex >= 0) {
    const left = text.slice(0, tenIndex);
    const right = text.slice(tenIndex + 1);
    const tens = left ? chineseDigits.get(left) : 1;
    const ones = right ? chineseDigits.get(right) : 0;
    return Number.isFinite(tens) && Number.isFinite(ones)
      ? tens * 10 + ones
      : null;
  }

  return null;
}

function unique(values) {
  return [...new Set(values)];
}

function pushUnique(target, value) {
  if (value && !target.includes(value)) target.push(value);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function formatIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function addDays(dateText, days) {
  if (!isIsoDate(dateText) || !Number.isInteger(days)) return null;
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function dayDifference(checkIn, checkOut) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) return null;
  const difference =
    (Date.parse(`${checkOut}T00:00:00Z`) -
      Date.parse(`${checkIn}T00:00:00Z`)) /
    86_400_000;
  return Number.isInteger(difference) && difference > 0 ? difference : null;
}

function matchEntries(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => ({
    match,
    start: match.index || 0,
    end: (match.index || 0) + match[0].length,
    evidence: match[0],
  }));
}

function overlaps(entry, spans) {
  return spans.some(
    (span) => entry.start < span.end && entry.end > span.start,
  );
}

function localClause(text, start, end) {
  let clauseStart = 0;
  let clauseEnd = text.length;
  for (const boundary of text.matchAll(clauseBoundaryPattern)) {
    const index = boundary.index || 0;
    if (index < start) clauseStart = index + boundary[0].length;
    if (index >= end) {
      clauseEnd = index;
      break;
    }
  }
  return {
    full: text.slice(clauseStart, clauseEnd),
    throughMatch: text.slice(clauseStart, end),
  };
}

function inferOperation(text, start, end) {
  const clause = localClause(text, start, end).throughMatch;
  if (replaceCuePattern.test(clause)) return "replace";
  if (removeCuePattern.test(clause)) return "remove";
  if (
    addCuePattern.test(clause) ||
    new RegExp(String.raw`^加(?=${numberTokenSource})`).test(clause)
  ) {
    return "add";
  }
  return "set";
}

function normalizeCountOperation(operation, count) {
  if (!Number.isInteger(count) || count < 0) return null;
  if ((operation === "add" || operation === "remove") && count < 1) {
    return null;
  }
  return count;
}

function classifyAge(age) {
  if (!Number.isFinite(age) || age < 0) return null;
  if (age < 4) return "infant";
  if (age < 13) return "child";
  return "adult";
}

function collectAgeOperations(text) {
  const agePattern = new RegExp(
    String.raw`(?:(${numberTokenSource})(?:位|個))?(${numberTokenSource})歲`,
    "g",
  );
  const groups = new Map();
  const spans = [];

  for (const entry of matchEntries(text, agePattern)) {
    const nearby = text.slice(
      Math.max(0, entry.start - 8),
      Math.min(text.length, entry.end + 8),
    );
    const hasPersonUnit = Boolean(entry.match[1]);
    const hasAgeSubject = /小孩|兒童|孩童|幼兒|嬰兒|嬰幼兒|小朋友/.test(
      nearby,
    );
    if (!hasPersonUnit && !hasAgeSubject) continue;

    const count = entry.match[1]
      ? parseNumberToken(entry.match[1])
      : 1;
    const age = parseNumberToken(entry.match[2]);
    const entity = classifyAge(age);
    if (!Number.isInteger(count) || count < 1 || !entity) continue;
    const operation = inferOperation(text, entry.start, entry.end);
    const key = `${entity}:${operation}`;
    const current = groups.get(key) || {
      entity,
      operation,
      count: 0,
      ages_years: [],
      evidence: [],
    };
    current.count += count;
    current.ages_years.push(...Array.from({ length: count }, () => age));
    current.evidence.push(entry.evidence);
    groups.set(key, current);
    spans.push({ start: entry.start, end: entry.end });
  }

  return {
    operations: [...groups.values()].map((group) => ({
      operation: group.operation,
      entity: group.entity,
      count: group.count,
      ages_years: group.ages_years,
      evidence: group.evidence.join("、"),
    })),
    spans,
  };
}

function collectPartyOperations(text, occupiedSpans) {
  const definitions = [
    ["adult", String.raw`(${numberTokenSource})(?:位|個)?(?:大人|成人)`],
    ["child", String.raw`(${numberTokenSource})(?:位|個)?(?:小孩|兒童|孩童)`],
    ["infant", String.raw`(${numberTokenSource})(?:位|個)?(?:嬰兒|嬰幼兒|幼兒)`],
  ];
  const operations = [];
  const spans = [...occupiedSpans];

  for (const [entity, source] of definitions) {
    for (const entry of matchEntries(text, new RegExp(source, "g"))) {
      if (overlaps(entry, spans)) continue;
      const operation = inferOperation(text, entry.start, entry.end);
      const count = normalizeCountOperation(
        operation,
        parseNumberToken(entry.match[1]),
      );
      if (count === null) continue;
      operations.push({
        operation,
        entity,
        count,
        evidence: entry.evidence,
      });
      spans.push({ start: entry.start, end: entry.end });
    }
  }

  if (!operations.some((operation) => operation.entity === "adult")) {
    const genericPeoplePattern = new RegExp(
      String.raw`(${numberTokenSource})(?:位)?人(?!數|房)`,
      "g",
    );
    for (const entry of matchEntries(text, genericPeoplePattern)) {
      if (overlaps(entry, spans)) continue;
      const operation = inferOperation(text, entry.start, entry.end);
      const count = normalizeCountOperation(
        operation,
        parseNumberToken(entry.match[1]),
      );
      if (count === null) continue;
      operations.push({
        operation,
        entity: "adult",
        count,
        evidence: entry.evidence,
      });
      spans.push({ start: entry.start, end: entry.end });
    }
  }

  if (!operations.some((operation) => operation.entity === "adult")) {
    const reversePeoplePattern = new RegExp(
      String.raw`(?:大人|成人|人)(?:數)?(?:共|有|是|改成|改為|換成|變成|調整為)?(${numberTokenSource})(?:位|個)?`,
      "g",
    );
    for (const entry of matchEntries(text, reversePeoplePattern)) {
      if (overlaps(entry, spans)) continue;
      const operation = inferOperation(text, entry.start, entry.end);
      const count = normalizeCountOperation(
        operation,
        parseNumberToken(entry.match[1]),
      );
      if (count === null) continue;
      operations.push({
        operation,
        entity: "adult",
        count,
        evidence: entry.evidence,
      });
      spans.push({ start: entry.start, end: entry.end });
    }
  }

  return { operations, spans };
}

function collectPetOperations(text) {
  const weightedPatterns = [
    new RegExp(
      String.raw`(${numberTokenSource})(?:隻|只)(?:(?:大約|約)?(?:大型|中型|小型)?(?:狗狗|狗|犬|毛孩|寵物)?[，,]?)?(${numberTokenSource})(?:公斤|kg)(?:的)?(?:狗狗|狗|犬|毛孩|寵物)?`,
      "g",
    ),
    new RegExp(
      String.raw`(?:狗狗|狗|犬|毛孩|寵物)(?:大約|約)?(${numberTokenSource})(?:公斤|kg)`,
      "g",
    ),
    new RegExp(
      String.raw`(${numberTokenSource})(?:公斤|kg)(?:的)?(?:狗狗|狗|犬|毛孩|寵物)`,
      "g",
    ),
  ];
  const weighted = [];
  const spans = [];

  for (const [patternIndex, pattern] of weightedPatterns.entries()) {
    for (const entry of matchEntries(text, pattern)) {
      if (overlaps(entry, spans)) continue;
      const explicitCount = patternIndex === 0;
      const count = explicitCount
        ? parseNumberToken(entry.match[1])
        : null;
      const weight = parseNumberToken(
        explicitCount ? entry.match[2] : entry.match[1],
      );
      if (
        (explicitCount && (!Number.isInteger(count) || count < 1)) ||
        !Number.isFinite(weight) ||
        weight <= 0
      ) {
        continue;
      }
      weighted.push({
        ...entry,
        operation: inferOperation(text, entry.start, entry.end),
        count,
        weight,
      });
      spans.push({ start: entry.start, end: entry.end });
    }
  }

  const operations = [];
  if (weighted.length) {
    const operationKinds = unique(weighted.map((entry) => entry.operation));
    if (operationKinds.length === 1) {
      const explicitCounts = weighted
        .map((entry) => entry.count)
        .filter(Number.isInteger);
      operations.push({
        operation: operationKinds[0],
        entity: "pet",
        ...(explicitCounts.length
          ? { count: explicitCounts.reduce((sum, count) => sum + count, 0) }
          : {}),
        pet_type: "dog",
        weights_kg: weighted.flatMap((entry) =>
          Array.from({ length: entry.count || 1 }, () => entry.weight),
        ),
        evidence: weighted.map((entry) => entry.evidence).join("、"),
      });
    }
  }

  const countPattern = new RegExp(
    String.raw`(${numberTokenSource})(?:隻|只)(?:狗狗|狗|犬|毛孩|寵物)`,
    "g",
  );
  for (const entry of matchEntries(text, countPattern)) {
    if (overlaps(entry, spans)) continue;
    const operation = inferOperation(text, entry.start, entry.end);
    const count = normalizeCountOperation(
      operation,
      parseNumberToken(entry.match[1]),
    );
    if (count === null) continue;
    operations.push({
      operation,
      entity: "pet",
      count,
      pet_type: "dog",
      evidence: entry.evidence,
    });
    spans.push({ start: entry.start, end: entry.end });
  }

  const reverseCountPattern = new RegExp(
    String.raw`(?:狗狗|狗|犬|毛孩|寵物)(?:改成|改為|換成|變成|有|共)?(${numberTokenSource})(?:隻|只)`,
    "g",
  );
  for (const entry of matchEntries(text, reverseCountPattern)) {
    if (overlaps(entry, spans)) continue;
    const operation = inferOperation(text, entry.start, entry.end);
    const count = normalizeCountOperation(
      operation,
      parseNumberToken(entry.match[1]),
    );
    if (count === null) continue;
    operations.push({
      operation,
      entity: "pet",
      count,
      pet_type: "dog",
      evidence: entry.evidence,
    });
    spans.push({ start: entry.start, end: entry.end });
  }

  const clearMatch = text.match(
    /(?:不帶|不要(?:帶)?|取消攜帶|沒有|無|移除|拿掉)(?:全部|所有|都|通通)?(?:狗狗|狗|犬|毛孩|寵物)|(?:狗狗|狗|犬|毛孩|寵物)(?:全部|所有|都|通通)?(?:不帶|不要|不去|不來|取消|移除|拿掉)/,
  );
  if (clearMatch && !operations.length) {
    operations.push({
      operation: "clear",
      entity: "pet",
      evidence: clearMatch[0],
    });
  }

  return {
    operations,
    spans,
    conflicting: weighted.length > 0 && operations.length === 0,
  };
}

function collectBreakfastOperations(text) {
  const patterns = [
    new RegExp(
      String.raw`早餐(?:設定為|改成|改為|換成|變成|調整為)?(${numberTokenSource})(?:份)?`,
      "g",
    ),
    new RegExp(String.raw`(${numberTokenSource})份早餐`, "g"),
  ];
  const operations = [];
  const spans = [];
  for (const pattern of patterns) {
    for (const entry of matchEntries(text, pattern)) {
      if (overlaps(entry, spans)) continue;
      const operation = inferOperation(text, entry.start, entry.end);
      const count = normalizeCountOperation(
        operation,
        parseNumberToken(entry.match[1]),
      );
      if (count === null) continue;
      operations.push({
        operation,
        entity: "breakfast",
        count,
        evidence: entry.evidence,
      });
      spans.push({ start: entry.start, end: entry.end });
    }
  }
  const clearMatch = text.match(/不加早餐|不要早餐|取消早餐/);
  if (clearMatch && !operations.length) {
    operations.push({
      operation: "clear",
      entity: "breakfast",
      evidence: clearMatch[0],
    });
  }
  return operations;
}

function extractStayOperation(text, { baseDateText = "" } = {}) {
  const clearMatch = text.match(/清除日期|取消日期條件|先不看日期/);
  if (clearMatch) {
    return {
      operation: "clear",
      entity: "stay",
      evidence: clearMatch[0],
    };
  }
  let checkIn = null;
  let checkOut = null;
  let evidence = "";
  const rangePatterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})(?:日|號)?(?:到|至|~|-)(?:(\d{4})年)?(\d{1,2})月(\d{1,2})(?:日|號)?/,
    /(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:到|至|~|-)(?:(\d{4})[/.\-])?(\d{1,2})[/.\-](\d{1,2})/,
  ];
  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    checkIn = formatIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    checkOut = formatIsoDate(
      Number(match[4] || match[1]),
      Number(match[5]),
      Number(match[6]),
    );
    evidence = match[0];
    break;
  }

  if (!checkIn) {
    const match =
      text.match(/(\d{4})年(\d{1,2})月(\d{1,2})(?:日|號)?/) ||
      text.match(/(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
    if (match) {
      checkIn = formatIsoDate(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
      );
      evidence = match[0];
    }
  }

  if (!checkIn && isIsoDate(baseDateText)) {
    const relativeMatch = text.match(/大後天|後天|明天|今天/);
    if (relativeMatch) {
      const offset = {
        今天: 0,
        明天: 1,
        後天: 2,
        大後天: 3,
      }[relativeMatch[0]];
      checkIn = addDays(baseDateText, offset);
      evidence = relativeMatch[0];
    }
  }

  const nightsMatch = text.match(
    new RegExp(String.raw`(${numberTokenSource})(?:個)?(?:晚上?|夜)`),
  );
  const nights = nightsMatch ? parseNumberToken(nightsMatch[1]) : null;
  const modeEvidence = text.match(
    /包棟|整棟|全棟|villa|單間|一間房|(?:預訂|訂|改成|改為|換成)房間|房間(?:價格|房價)/,
  )?.[0] || "";
  const mode = /包棟|整棟|全棟|villa/.test(modeEvidence)
    ? "villa"
    : /單間|房間|一間房/.test(modeEvidence)
      ? "room"
      : null;
  const dateTypeEvidence = text.match(
    /週五|周五|星期五|禮拜五|週六|周六|星期六|禮拜六|連假|假日|平日/,
  )?.[0] || "";
  const dateType = /週五|周五|星期五|禮拜五/.test(dateTypeEvidence)
    ? "friday"
    : /週六|周六|星期六|禮拜六|連假|假日/.test(dateTypeEvidence)
      ? "holiday"
      : /平日/.test(dateTypeEvidence)
        ? "weekday"
        : null;

  if (!checkIn && !checkOut && !nights && !mode && !dateType) return null;
  const firstIndex = [
    evidence ? text.indexOf(evidence) : -1,
    nightsMatch?.index ?? -1,
  ].find((index) => index >= 0) || 0;
  const lastIndex = Math.max(
    evidence ? text.indexOf(evidence) + evidence.length : 0,
    nightsMatch ? (nightsMatch.index || 0) + nightsMatch[0].length : 0,
  );
  return {
    operation: inferOperation(text, firstIndex, lastIndex),
    entity: "stay",
    ...(mode ? { mode } : {}),
    ...(checkIn ? { check_in: checkIn } : {}),
    ...(checkOut ? { check_out: checkOut } : {}),
    ...(Number.isInteger(nights) && nights > 0 ? { nights } : {}),
    ...(dateType ? { date_type: dateType } : {}),
    evidence: [evidence, nightsMatch?.[0], modeEvidence, dateTypeEvidence]
      .filter(Boolean)
      .join("、"),
  };
}

function hasPendingDogWeightContext(context) {
  const state = normalizeConversationContext(context);
  const pendingFields = state.pending_interaction?.required_fields || [];
  const knownWeights = knownPetWeightCount(state);
  return (
    state.pet_type === "dog" &&
    Number.isInteger(state.pet_count) &&
    state.pet_count > knownWeights
  ) || pendingFields.some((field) =>
    [
      "pet_weights_kg",
      "dog_under_10kg_count",
      "dog_10_to_20kg_count",
      "dog_over_20kg_count",
    ].includes(field),
  );
}

function detectAmbiguities(text, context, operations, petResult) {
  const ambiguities = [];
  const hasEntityOperation = operations.some((operation) =>
    ["adult", "child", "infant", "pet", "breakfast"].includes(
      operation.entity,
    ),
  );
  const genericAdd = text.match(
    new RegExp(
      String.raw`(?:再加|增加|多)(${numberTokenSource})(?:個|位)?(?:$|[呢嗎吧？?。！!])`,
    ),
  );
  if (genericAdd && !hasEntityOperation) {
    ambiguities.push({
      code: "missing_entity",
      evidence: genericAdd[0],
      question: "請問是增加一位成人、一位兒童，還是一隻狗狗呢？",
    });
  }

  const explicitNightDuration = new RegExp(
    String.raw`${numberTokenSource}(?:個)?(?:晚上?|夜)`,
  ).test(text);
  const dayDuration = text.match(
    new RegExp(String.raw`(${numberTokenSource})天(?:[？?。！!]|$)`),
  );
  if (dayDuration && !explicitNightDuration) {
    const days = parseNumberToken(dayDuration[1]);
    if (Number.isInteger(days) && days > 0) {
      ambiguities.push({
        code: "ambiguous_stay_days",
        evidence: dayDuration[0].replace(/[？?。！!]$/, ""),
        question: `請問是要住${days}晚嗎？`,
      });
    }
  }

  if (/人數有變|人數要改|人數變了/.test(text) && !operations.some((entry) =>
    ["adult", "child", "infant"].includes(entry.entity)
  )) {
    ambiguities.push({
      code: "missing_party_count",
      evidence: text,
      question: "請問調整後有幾位成人、幾位兒童及幾位未滿 4 歲幼兒呢？",
    });
  }

  const standaloneWeight = text.match(
    new RegExp(String.raw`^(${numberTokenSource})(?:公斤|kg)[？?。！!]?$`),
  );
  if (standaloneWeight && !petResult.operations.length) {
    if (hasPendingDogWeightContext(context)) {
      operations.push({
        operation: "set",
        entity: "pet",
        pet_type: "dog",
        weights_kg: [parseNumberToken(standaloneWeight[1])],
        evidence: standaloneWeight[0].replace(/[？?。！!]$/, ""),
      });
    } else {
      ambiguities.push({
        code: "missing_pet_context",
        evidence: standaloneWeight[0],
        question: `請問${standaloneWeight[1]}公斤是狗狗的體重嗎？`,
      });
    }
  }

  if (petResult.conflicting) {
    ambiguities.push({
      code: "conflicting_operations",
      evidence: text,
      question: "狗狗的數量或體重描述有衝突，請問每隻狗狗各是幾公斤呢？",
    });
  }

  const entities = new Map();
  for (const operation of operations) {
    const prior = entities.get(operation.entity);
    if (prior && prior !== operation.operation) {
      ambiguities.push({
        code: "conflicting_operations",
        evidence: text,
        question: "這次同時有新增與替換的描述，請問最後要保留的數量是多少呢？",
      });
      break;
    }
    entities.set(operation.entity, operation.operation);
  }

  return ambiguities;
}

function extractEvidenceNumbers(value) {
  const pattern = new RegExp(numberTokenSource, "g");
  return (compactText(value).match(pattern) || [])
    .map(parseNumberToken)
    .filter(Number.isFinite);
}

function numberFrequency(values) {
  return values.reduce((frequency, value) => {
    frequency.set(value, (frequency.get(value) || 0) + 1);
    return frequency;
  }, new Map());
}

function containsNumberMultiset(haystack, needles) {
  const available = numberFrequency(haystack);
  for (const [value, count] of numberFrequency(needles).entries()) {
    if ((available.get(value) || 0) < count) return false;
  }
  return true;
}

function dateNumbers(value) {
  return isIsoDate(value) ? value.split("-").map(Number) : [];
}

function relativeDateFromEvidence(evidence, currentDate) {
  if (!isIsoDate(currentDate)) return null;
  const relativeMatch = compactText(evidence).match(/大後天|後天|明天|今天/);
  if (!relativeMatch) return null;
  const offset = {
    今天: 0,
    明天: 1,
    後天: 2,
    大後天: 3,
  }[relativeMatch[0]];
  return addDays(currentDate, offset);
}

function getOperationEvidenceFailure(operation, message, { currentDate = "" } = {}) {
  const compactMessage = compactText(message);
  const evidenceParts = String(operation.evidence || "")
    .split("、")
    .map(compactText)
    .filter(Boolean);
  if (
    !evidenceParts.length ||
    evidenceParts.some((part) => !compactMessage.includes(part))
  ) {
    return "evidence_not_in_message";
  }

  const evidenceNumbers = extractEvidenceNumbers(operation.evidence);
  const repeatedValues = [
    ...(operation.weights_kg || []),
    ...(operation.ages_years || []),
  ];
  const countIsExplicit =
    !Number.isInteger(operation.count) ||
    evidenceNumbers.includes(operation.count);
  const countIsSupportedByMembers =
    Number.isInteger(operation.count) &&
    repeatedValues.length === operation.count &&
    containsNumberMultiset(evidenceNumbers, repeatedValues);
  if (!countIsExplicit && !countIsSupportedByMembers) {
    return "count_not_supported";
  }

  const repeatedValuesSupported = containsNumberMultiset(
    evidenceNumbers,
    repeatedValues,
  );
  const sharedValueSupportedByExplicitCount =
    Number.isInteger(operation.count) &&
    evidenceNumbers.includes(operation.count) &&
    unique(repeatedValues).every((number) => evidenceNumbers.includes(number));
  if (
    repeatedValues.length &&
    !repeatedValuesSupported &&
    !sharedValueSupportedByExplicitCount
  ) {
    return "repeated_values_not_supported";
  }

  if (
    Number.isFinite(operation.nights) &&
    !evidenceNumbers.includes(operation.nights)
  ) {
    return "nights_not_supported";
  }
  const checkInSupportedByRelativeDate =
    operation.check_in &&
    relativeDateFromEvidence(operation.evidence, currentDate) === operation.check_in;
  if (
    !checkInSupportedByRelativeDate &&
    dateNumbers(operation.check_in).some(
      (number) => !evidenceNumbers.includes(number),
    )
  ) {
    return "check_in_not_supported";
  }
  if (
    dateNumbers(operation.check_out).some(
      (number) => !evidenceNumbers.includes(number),
    )
  ) {
    return "check_out_not_supported";
  }
  return null;
}

function validateOperationShape(operation) {
  if (operation.operation === "clear") return true;
  if (
    operation.target_pet !== undefined &&
    (operation.entity !== "pet" ||
      !["replace", "remove"].includes(operation.operation))
  ) {
    return false;
  }
  if (
    operation.target_scope !== undefined &&
    (operation.entity !== "pet" ||
      !["replace", "remove"].includes(operation.operation))
  ) {
    return false;
  }
  if (operation.entity === "stay") {
    return Boolean(
      operation.mode ||
        operation.check_in ||
        operation.check_out ||
        operation.nights ||
        operation.date_type,
    );
  }
  if (operation.entity === "pet") {
    if (
      operation.count === undefined &&
      !(operation.weights_kg || []).length
    ) {
      return false;
    }
    return !(
      Number.isInteger(operation.count) &&
      (operation.weights_kg || []).length > operation.count
    );
  }
  return Number.isInteger(operation.count);
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("structured_turn_invalid_json");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function validateStructuredTurnResult(
  rawValue,
  { message = "", currentDate = "" } = {},
) {
  let result;
  try {
    result = structuredTurnResultSchema.parse(parseJsonObject(rawValue));
  } catch (error) {
    const wrapped = new Error("structured_turn_invalid_schema");
    wrapped.cause = error;
    throw wrapped;
  }

  const invalidOperation = result.operations.find(
    (operation) => !validateOperationShape(operation),
  );
  if (invalidOperation) {
    throw new Error(
      `structured_turn_invalid_evidence:${invalidOperation.entity}:invalid_shape`,
    );
  }
  for (const operation of result.operations) {
    const failure = getOperationEvidenceFailure(operation, message, { currentDate });
    if (failure) {
      throw new Error(
        `structured_turn_invalid_evidence:${operation.entity}:${failure}`,
      );
    }
  }

  return {
    ...result,
    intents: unique(result.intents),
    missing_fields: unique(result.missing_fields),
  };
}

function dogTierCounts(weights) {
  return (weights || []).reduce(
    (counts, weight) => {
      if (weight <= 10) counts.dog_under_10kg_count += 1;
      else if (weight <= 20) counts.dog_10_to_20kg_count += 1;
      else counts.dog_over_20kg_count += 1;
      return counts;
    },
    {
      dog_under_10kg_count: 0,
      dog_10_to_20kg_count: 0,
      dog_over_20kg_count: 0,
    },
  );
}

function currentPetWeights(context) {
  if (Array.isArray(context.pet_weights_kg)) {
    return context.pet_weights_kg.filter(
      (weight) => Number.isFinite(weight) && weight > 0,
    );
  }
  return [];
}

function knownPetWeightCount(context) {
  return Math.max(
    currentPetWeights(context).length,
    (context.dog_under_10kg_count || 0) +
      (context.dog_10_to_20kg_count || 0) +
      (context.dog_over_20kg_count || 0),
  );
}

function applyCountOperation(current, operation) {
  const count = operation.count || 0;
  if (operation.operation === "clear") return null;
  if (operation.operation === "add") return (current || 0) + count;
  if (operation.operation === "remove") {
    return Math.max(0, (current || 0) - count);
  }
  return count;
}

function applyStayOperation(context, operation) {
  if (operation.operation === "clear") {
    return {
      ...context,
      stay_type: null,
      check_in: null,
      check_out: null,
      stay_nights: null,
      pricing_day_type: null,
      requires_exact_date: null,
    };
  }
  const replace = operation.operation === "replace";
  const next = {
    ...context,
    ...(replace && (operation.check_in || operation.check_out)
      ? { check_in: null, check_out: null }
      : {}),
    ...(operation.mode ? { stay_type: operation.mode } : {}),
    ...(operation.check_in ? { check_in: operation.check_in } : {}),
    ...(operation.check_out ? { check_out: operation.check_out } : {}),
    ...(operation.nights ? { stay_nights: operation.nights } : {}),
    ...(operation.date_type
      ? {
          pricing_day_type: operation.date_type,
          requires_exact_date: null,
        }
      : {}),
  };
  if (operation.check_in || operation.check_out) {
    next.pricing_day_type = null;
    next.requires_exact_date = null;
  }
  if (next.check_in && operation.nights && !operation.check_out) {
    next.check_out = addDays(next.check_in, operation.nights);
  }
  const resolvedNights = dayDifference(next.check_in, next.check_out);
  if (resolvedNights) next.stay_nights = resolvedNights;
  return next;
}

function applyPartyOperation(context, operation) {
  const field = `${operation.entity}_count`;
  const current =
    operation.entity === "adult"
      ? context.adult_count ?? context.guest_count
      : context[field];
  const next = {
    ...context,
    [field]: applyCountOperation(current, operation),
    guest_count: null,
  };
  if (operation.entity === "child" && operation.ages_years) {
    const existing = Array.isArray(context.child_ages_years)
      ? context.child_ages_years
      : [];
    next.child_ages_years =
      operation.operation === "add"
        ? [...existing, ...operation.ages_years]
        : [...operation.ages_years];
  }
  return next;
}

function applyPetOperation(context, operation) {
  if (operation.operation === "clear") {
    return {
      ...context,
      pet_count: 0,
      pet_type: null,
      pet_weights_kg: [],
      dog_under_10kg_count: 0,
      dog_10_to_20kg_count: 0,
      dog_over_20kg_count: 0,
    };
  }

  const existingWeights = currentPetWeights(context);
  let weights = existingWeights;
  if (
    operation.operation === "replace" &&
    operation.target_scope === "all" &&
    operation.weights_kg?.length === 1 &&
    existingWeights.length
  ) {
    weights = existingWeights.map(() => operation.weights_kg[0]);
  } else if (
    operation.operation === "remove" &&
    operation.target_scope === "all"
  ) {
    weights = [];
  } else if (
    operation.operation === "replace" &&
    Number.isInteger(operation.target_pet) &&
    operation.weights_kg?.length === 1 &&
    operation.target_pet < existingWeights.length
  ) {
    weights = [...existingWeights];
    weights[operation.target_pet] = operation.weights_kg[0];
  } else if (
    operation.operation === "remove" &&
    Number.isInteger(operation.target_pet) &&
    operation.target_pet < existingWeights.length
  ) {
    weights = existingWeights.filter(
      (_weight, index) => index !== operation.target_pet,
    );
  } else if (operation.weights_kg) {
    if (operation.operation === "add") {
      weights = [...existingWeights, ...operation.weights_kg];
    } else if (operation.operation === "remove") {
      weights = existingWeights.slice(
        0,
        Math.max(0, existingWeights.length - operation.weights_kg.length),
      );
    } else {
      weights = [...operation.weights_kg];
    }
  } else if (
    operation.operation === "remove" &&
    Number.isInteger(operation.count)
  ) {
    weights = existingWeights.slice(
      0,
      Math.max(0, existingWeights.length - operation.count),
    );
  }

  let petCount;
  if (
    operation.operation === "replace" &&
    operation.target_scope === "all"
  ) {
    petCount = context.pet_count ?? weights.length;
  } else if (
    operation.operation === "remove" &&
    operation.target_scope === "all"
  ) {
    petCount = 0;
  } else if (
    operation.operation === "replace" &&
    Number.isInteger(operation.target_pet)
  ) {
    petCount = context.pet_count ?? weights.length;
  } else if (
    operation.operation === "remove" &&
    Number.isInteger(operation.target_pet)
  ) {
    petCount = Math.max(0, (context.pet_count || 0) - 1);
  } else if (operation.count !== undefined) {
    petCount = applyCountOperation(context.pet_count, operation);
  } else if (operation.operation === "add") {
    petCount = (context.pet_count || 0) + (operation.weights_kg?.length || 0);
  } else if (operation.operation === "remove") {
    petCount = Math.max(
      0,
      (context.pet_count || 0) - (operation.weights_kg?.length || 0),
    );
  } else {
    petCount = context.pet_count ?? weights.length;
  }

  const existingTierCounts = {
    dog_under_10kg_count: context.dog_under_10kg_count || 0,
    dog_10_to_20kg_count: context.dog_10_to_20kg_count || 0,
    dog_over_20kg_count: context.dog_over_20kg_count || 0,
  };
  const nextTierCounts =
    operation.operation === "add" &&
    existingWeights.length === 0 &&
    knownPetWeightCount(context) > 0
      ? Object.fromEntries(
          Object.entries(dogTierCounts(operation.weights_kg || [])).map(
            ([field, count]) => [field, existingTierCounts[field] + count],
          ),
        )
      : dogTierCounts(weights);

  return {
    ...context,
    pet_count: petCount,
    pet_type: petCount === 0 ? null : operation.pet_type || context.pet_type || "dog",
    pet_weights_kg: weights,
    ...nextTierCounts,
  };
}

export function toTypedBookingContext(value, requests = {}) {
  const state = normalizeConversationContext(value);
  return {
    stay: {
      mode: state.stay_type,
      check_in: state.check_in,
      check_out: state.check_out,
      nights: state.stay_nights,
      date_type: state.pricing_day_type,
    },
    party: {
      adults: state.adult_count ?? state.guest_count,
      children: state.child_count,
      infants: state.infant_count,
      child_ages_years: Array.isArray(state.child_ages_years)
        ? [...state.child_ages_years]
        : [],
    },
    pets: {
      species: state.pet_type,
      count: state.pet_count,
      individual_weights_kg: currentPetWeights(state),
    },
    addons: {
      breakfast_quantity: state.breakfast_count,
    },
    requests: {
      quote: Boolean(requests.quote || state.active_intent === "pricing"),
      availability: Boolean(
        requests.availability || state.active_intent === "availability",
      ),
      policy_question: Boolean(requests.policy_question),
    },
  };
}

export function sanitizeStructuredTurnUtterance(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .slice(0, 2000)
    .replace(
      /(?:姓名|名字|聯絡人)\s*[:：]?\s*[\p{Script=Han}A-Za-z·]{2,40}/gu,
      (match) => `${match.startsWith("聯絡人") ? "聯絡人" : match.startsWith("姓名") ? "姓名" : "名字"}[REDACTED_NAME]`,
    )
    .replace(
      /(?:地址|住址)\s*[:：]?\s*[^，,。；;\n]{2,120}/gu,
      (match) => `${match.startsWith("住址") ? "住址" : "地址"}[REDACTED_ADDRESS]`,
    )
    .replace(
      /[\p{Script=Han}A-Za-z0-9-]{0,30}(?:縣|市)[\p{Script=Han}A-Za-z0-9-]{1,60}(?:路|街|大道|巷)[\p{Script=Han}A-Za-z0-9-]{0,40}號?/gu,
      "[REDACTED_ADDRESS]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
    .replace(/(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "[REDACTED_PHONE]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b\d{8,20}\b/g, "[REDACTED_ID]");
}

function sanitizeStructuredTurnPreviousTopic(value) {
  const topic = String(value || "").trim().toLowerCase();
  return structuredTurnPreviousTopics.has(topic) ? topic : "";
}

function getStructuredTurnPendingFields(value) {
  const state = normalizeConversationContext(value);
  const requiredFields = state.pending_interaction?.required_fields;
  return unique(
    (Array.isArray(requiredFields) ? requiredFields : [])
      .map((field) => String(field || "").trim())
      .filter((field) => structuredTurnPendingFields.has(field)),
  );
}

export function buildStructuredTurnOutboundInput({
  message,
  context,
  previousTopic = "",
  dateInfo = {},
} = {}) {
  const typed = toTypedBookingContext(context);
  const currentDate = /^\d{4}-\d{2}-\d{2}$/.test(
    String(dateInfo.currentDate || ""),
  )
    ? String(dateInfo.currentDate)
    : "";

  return {
    current_date: currentDate,
    timezone: "Asia/Taipei",
    current_booking_context: {
      stay: typed.stay,
      party: typed.party,
      pets: typed.pets,
      addons: typed.addons,
    },
    pending_missing_fields: getStructuredTurnPendingFields(context),
    previous_transaction_topic: sanitizeStructuredTurnPreviousTopic(
      previousTopic,
    ),
    latest_user_message: sanitizeStructuredTurnUtterance(message),
  };
}

export function reduceBookingContext(
  currentContext,
  rawResult,
  {
    message = "",
    nowIso = new Date().toISOString(),
    sourceMessageId = "",
    currentDate = "",
  } = {},
) {
  const result = validateStructuredTurnResult(rawResult, { message, currentDate });
  const original = normalizeConversationContext(currentContext);
  const before = toTypedBookingContext(original);
  if (result.ambiguities.length) {
    return {
      before,
      operations: result.operations,
      after: before,
      context: original,
      changed: false,
      applied: false,
      reason: "ambiguity_blocked",
    };
  }

  let context = { ...original };
  const touchedFields = new Set();
  for (const operation of result.operations) {
    if (operation.entity === "stay") {
      context = applyStayOperation(context, operation);
      [
        "stay_type",
        "check_in",
        "check_out",
        "stay_nights",
        "pricing_day_type",
      ].forEach((field) => touchedFields.add(field));
    } else if (["adult", "child", "infant"].includes(operation.entity)) {
      context = applyPartyOperation(context, operation);
      touchedFields.add(`${operation.entity}_count`);
      touchedFields.add("guest_count");
      if (operation.entity === "child") touchedFields.add("child_ages_years");
    } else if (operation.entity === "pet") {
      context = applyPetOperation(context, operation);
      [
        "pet_count",
        "pet_type",
        "pet_weights_kg",
        "dog_under_10kg_count",
        "dog_10_to_20kg_count",
        "dog_over_20kg_count",
      ].forEach((field) => touchedFields.add(field));
    } else if (operation.entity === "breakfast") {
      context.breakfast_count = applyCountOperation(
        context.breakfast_count,
        operation,
      );
      touchedFields.add("breakfast_count");
    }
  }

  if (result.intents.includes("request_quote")) {
    context.active_intent = "pricing";
    context.current_topic = "booking_price";
    if (!context.stay_type) context.stay_type = "villa";
    touchedFields.add("active_intent");
    touchedFields.add("current_topic");
    touchedFields.add("stay_type");
  } else if (result.intents.includes("availability_request")) {
    context.active_intent = "availability";
    context.current_topic = "availability";
    touchedFields.add("active_intent");
    touchedFields.add("current_topic");
  }

  const stored = getConversationContextForStorage(context);
  const changed =
    JSON.stringify(getConversationContextForStorage(original)) !==
    JSON.stringify(stored);
  if (changed) {
    stored.last_updated_at = nowIso;
    stored.slot_meta = { ...(stored.slot_meta || {}) };
    for (const field of touchedFields) {
      stored.slot_meta[field] = {
        source: "structured_turn",
        ...(sourceMessageId ? { source_message_id: sourceMessageId } : {}),
        updated_at: nowIso,
        confidence: result.confidence,
      };
    }
  }

  return {
    before,
    operations: result.operations,
    after: toTypedBookingContext(stored, {
      quote: result.intents.includes("request_quote"),
      availability: result.intents.includes("availability_request"),
      policy_question: result.intents.includes("policy_question"),
    }),
    context: stored,
    changed,
    applied: true,
    reason: changed ? "operations_applied" : "no_context_change",
  };
}

function getMissingFields(context, intents) {
  if (!intents.includes("request_quote")) return [];
  const state = normalizeConversationContext(context);
  const missing = [];
  if (
    !(state.check_in && state.check_out) &&
    !(state.pricing_day_type && state.stay_nights)
  ) {
    missing.push("stay");
  }
  if (
    !(Number.isInteger(state.adult_count) && state.adult_count > 0) &&
    !(Number.isInteger(state.guest_count) && state.guest_count > 0)
  ) {
    missing.push("adult_count");
  }
  const knownWeights = knownPetWeightCount(state);
  if (Number.isInteger(state.pet_count) && state.pet_count > knownWeights) {
    missing.push("pet_weights_kg");
  }
  return missing;
}

export function interpretBookingTurnDeterministically({
  message,
  context = null,
  dateInfo = {},
} = {}) {
  const text = compactText(message);
  const ageResult = collectAgeOperations(text);
  const partyResult = collectPartyOperations(text, ageResult.spans);
  const petResult = collectPetOperations(text);
  const stayOperation = extractStayOperation(text, {
    baseDateText: dateInfo.currentDate,
  });
  const operations = [
    ...ageResult.operations,
    ...partyResult.operations,
    ...petResult.operations,
    ...collectBreakfastOperations(text),
    ...(stayOperation ? [stayOperation] : []),
  ];
  const ambiguities = detectAmbiguities(
    text,
    context,
    operations,
    petResult,
  );
  const intents = [];
  if (operations.some((entry) => ["adult", "child", "infant"].includes(entry.entity))) {
    pushUnique(intents, "update_party");
  }
  if (operations.some((entry) => entry.entity === "pet")) {
    pushUnique(intents, "update_pet");
  }
  if (operations.some((entry) => entry.entity === "stay")) {
    pushUnique(intents, "update_dates");
  }
  if (operations.some((entry) => entry.entity === "breakfast")) {
    pushUnique(intents, "update_breakfast");
  }
  const prior = normalizeConversationContext(context);
  if (
    (quoteCuePattern.test(text) &&
      (!hardPolicyPricingCuePattern.test(text) || operations.length > 0)) ||
    (prior.active_intent === "pricing" && operations.length > 0)
  ) {
    pushUnique(intents, "request_quote");
  }
  if (availabilityCuePattern.test(text)) {
    pushUnique(intents, "availability_request");
  }
  if (
    (hardPolicyPricingCuePattern.test(text) ||
      (policyCuePattern.test(text) && !quoteCuePattern.test(text))) &&
    !availabilityCuePattern.test(text)
  ) {
    pushUnique(intents, "policy_question");
  }

  const initial = {
    intents,
    operations,
    missing_fields: [],
    ambiguities,
    confidence: ambiguities.length
      ? 1
      : operations.length || intents.length
        ? 0.98
        : 0.35,
  };
  const validated = validateStructuredTurnResult(initial, {
    message,
    currentDate: dateInfo.currentDate,
  });
  const preview = reduceBookingContext(context, validated, {
    message,
    currentDate: dateInfo.currentDate,
  });
  const result = {
    ...validated,
    missing_fields: getMissingFields(preview.context, intents),
  };
  const looksTransactional =
    /入住|退房|住宿|包棟|房價|費用|日期|人數|成人|小孩|兒童|幼兒|早餐|狗|犬|寵物|毛孩/.test(
      text,
    );

  return {
    result,
    source: "deterministic",
    requiresModel:
      looksTransactional &&
      result.operations.length === 0 &&
      result.ambiguities.length === 0 &&
      !result.intents.includes("policy_question"),
  };
}

export function getStructuredTurnInterpreterMode(
  value = process.env.AI_STRUCTURED_TURN_INTERPRETER_MODE,
) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["legacy", "shadow", "active"].includes(normalized)
    ? normalized
    : "legacy";
}

export function isStructuredTransactionalResult(result) {
  return Boolean(
    result?.operations?.length ||
      result?.ambiguities?.length ||
      result?.intents?.some((intent) =>
        [
          "request_quote",
          "update_party",
          "update_pet",
          "update_dates",
          "update_breakfast",
          "availability_request",
        ].includes(intent),
      ),
  );
}

function buildLegacyStructuredTurnMessages({
  message,
  context,
  previousTopic = "",
  dateInfo = {},
} = {}) {
  const sanitizedMessage = sanitizeStructuredTurnUtterance(message);
  const deterministicStay = extractStayOperation(compactText(sanitizedMessage), {
    baseDateText: dateInfo.currentDate,
  });
  const checkOutAllowed = Boolean(deterministicStay?.check_out);
  const typedContext = toTypedBookingContext(context);
  const pendingFields = getStructuredTurnPendingFields(context);
  const petContextAvailable = Boolean(
    typedContext.pets.species &&
      Number.isInteger(typedContext.pets.count) &&
      typedContext.pets.count > typedContext.pets.individual_weights_kg.length,
  ) || pendingFields.some((field) =>
    [
      "pet_weights_kg",
      "dog_under_10kg_count",
      "dog_10_to_20kg_count",
      "dog_over_20kg_count",
    ].includes(field),
  );
  const system = `你是住宿訂房的 structured turn interpreter。只輸出一個 JSON object，不可輸出 markdown、說明或客人回答。

你只做語意理解：辨識 intents，並把客人本輪明確表達的修改轉成 operations。不可計算價格、不可承諾房況、不可修改 context，也不可輸出 FAQ ID、FAQ answer 或任何客人回覆。

嚴格 schema：
{
  "intents": ["request_quote|update_party|update_pet|update_dates|update_breakfast|availability_request|policy_question"],
  "operations": ["下列封閉 operation variants 之一"],
  "missing_fields": [],
  "ambiguities": [{"code":"missing_entity|missing_pet_context|missing_party_count|missing_exact_year|ambiguous_stay_days|missing_reference|pending_slot_fill|pending_slot_fill_stale|pending_slot_fill_duplicate|conflicting_operations|unsupported_entity_value|low_confidence","evidence":"原句文字","question":"一個精準澄清問題"}],
  "confidence": 0.0
}

operation variants；每筆只能使用所屬 variant 列出的 keys：
1. party/breakfast count：{"operation":"set|add|remove|replace","entity":"adult|child|infant|breakfast","count":1,"ages_years":[4],"evidence":"原句片段"}。ages_years 只在原句明示年齡時使用。
2. pet：{"operation":"set|add|remove|replace","entity":"pet","count":1,"pet_type":"dog|cat|pet","weights_kg":[22],"evidence":"原句片段"}。pet_type、weights_kg 未明示且非待補資訊時省略。
3. stay：{"operation":"set|add|remove|replace","entity":"stay","mode":"villa|room","check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD","nights":1,"date_type":"weekday|friday|holiday","evidence":"原句片段"}。至少一個 stay value，其他未明示欄位省略。
4. clear：{"operation":"clear","entity":"stay|adult|child|infant|pet|breakfast","evidence":"原句片段"}。只能有這三個 keys，絕不可輸出 count=0 或 null。

規則：
- 每個數量都必須綁定 entity；不得用裸數字修改資料。
- add/remove 的 count 是增減量；set/replace 的 count 是修改後總數；clear 不帶 count。
- operation=clear 時合法 shape 只有 operation、entity、evidence；輸出 count=0 或其他 optional 欄位一律無效。例如清除早餐只能輸出 {"operation":"clear","entity":"breakfast","evidence":"原句片段"}。
- 每個 operation 只輸出該 entity 所需欄位；沒有使用的 optional 欄位必須省略，不可填 null。
- evidence 必須逐字取自 latest_user_message 的連續片段，且要包含 operation 使用的所有數字；需要兩段 evidence 時以「、」連接兩段原文。
- 不得輸出由日曆或算術推導的欄位：只明示入住日與晚數時，stay operation 僅輸出 check_in + nights，不可自行補 check_out；只有原句明示日期範圍時才輸出 check_out。精確日期已提供時也不可自行補 date_type。例如「2026年12月3日住兩晚」只能輸出 check_in=2026-12-03、nights=2，不能輸出推算的退房日或星期分類。
- 只提到「再加一個」時不得猜實體。若 current_booking_context.pets 已有 species 與 count，且 individual_weights_kg 數量不足，或 pending_missing_fields 是 pet_weights_kg／任一 dog weight tier，裸體重就是該既有寵物的體重更新，不得回 missing_pet_context；完全沒有上述寵物 context 時才回 missing_pet_context。
- 年齡未滿 4 歲歸 infant，4 歲至未滿 13 歲歸 child，滿 13 歲歸 adult；ages_years 必須保留原句明示年齡。
- date_type 僅在原句明示時使用：平日為 weekday、週五為 friday、週六日或國定假日為 holiday。
- 新增狗狗但未提供每隻體重時，將 pet_weights_kg 放入 missing_fields，不可猜體重。
- 未提及的既有值不輸出 operation；不可把 context 中的數字當成本輪 evidence。
- operations 與 intents 必須一致：adult/child/infant operation 必須含 update_party；pet 必須含 update_pet；stay 必須含 update_dates；breakfast 必須含 update_breakfast。
- 客人要求調整訂房或住宿條件，卻沒有說明任何可驗證的 entity、field 或 value 時，不可回空白成功結果；operations 必須為空並回 low_confidence ambiguity 與精準澄清問題。
- 核心動作不同不可因共享名詞而合併。語意仍不明確時，operations 必須是空陣列並輸出一個精準 ambiguity。
- confidence 不能取代 schema、evidence 或 ambiguity 驗證。

本輪 schema field guard：check_out_allowed=${checkOutAllowed ? "true" : "false"}；standalone_pet_weight_allowed=${petContextAvailable ? "true" : "false"}。check_out_allowed=false 時任何 operation 都不可包含 check_out；standalone_pet_weight_allowed=false 時，只有重量但沒有寵物實體的訊息必須回 missing_pet_context ambiguity，operations 必須為空。`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify(buildStructuredTurnOutboundInput({
        message,
        context,
        previousTopic,
        dateInfo,
      })),
    },
  ];
}

export function toTurnActionSemanticResult(
  result,
  previousContext = null,
  dialogueState = null,
) {
  const prior = normalizeConversationContext(previousContext);
  const hasUpdates = result.operations.length > 0;
  const turnAction = result.intents.includes("request_quote")
    ? dialogueState?.quote_scope === "snapshot"
      ? "request_quote"
      : prior.active_intent === "pricing" && hasUpdates
      ? "update_quote"
      : "request_quote"
    : result.intents.includes("availability_request")
      ? "ask_information"
      : hasUpdates && prior.active_intent === "pricing"
        ? "update_quote"
        : "ask_information";
  const fieldMap = {
    stay: ["stay_type", "check_in", "check_out", "stay_nights", "pricing_day_type"],
    adult: ["adult_count", "guest_count"],
    child: ["child_count"],
    infant: ["infant_count"],
    pet: [
      "pet_count",
      "pet_type",
      "dog_under_10kg_count",
      "dog_10_to_20kg_count",
      "dog_over_20kg_count",
    ],
    breakfast: ["breakfast_count"],
  };
  return {
    turn_action: turnAction,
    intent: result.intents.includes("request_quote") ? "pricing" : "booking",
    topic: result.intents.includes("request_quote") ? "booking_price" : "booking_update",
    is_follow_up:
      dialogueState?.quote_scope === "snapshot"
        ? false
        : prior.active_intent === "pricing",
    pending_resolution_action: "none",
    context_patch: {},
    clear_fields: [],
    mentioned_fields: unique(
      result.operations.flatMap((operation) => fieldMap[operation.entity] || []),
    ),
    uncertain_fields: [],
    uses_relative_date: false,
    selected_faq_ids: [],
    missing_fields: result.missing_fields,
    route: result.missing_fields.length ? "collect_info" : "grounded_reply",
    needs_human: false,
    reply_draft: "",
    confidence: result.confidence,
  };
}

export function buildStructuredClarificationRoute(routeResult, result) {
  const question =
    result?.ambiguities?.[0]?.question ||
    "請再告訴我這次要調整的是成人、兒童、日期，還是狗狗資訊呢？";
  return {
    ...routeResult,
    route: "faq_collect_info",
    providerUsed: "structured_turn_clarification",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: true,
    answerMode: "collect_info",
    answer: question,
    notice: question,
    reason: "structured_turn_ambiguity",
    semanticMetadata: {
      ...(routeResult?.semanticMetadata || {}),
      structured_turn_ambiguities: result?.ambiguities || [],
      structured_turn_mutation_applied: false,
    },
  };
}

export function compareStructuredAndLegacyContext(
  legacyContext,
  reducedContext,
) {
  const legacy = toTypedBookingContext(legacyContext);
  const structured = toTypedBookingContext(reducedContext);
  return {
    agrees: JSON.stringify(legacy) === JSON.stringify(structured),
    legacy,
    structured,
  };
}

function buildLowConfidenceResult(message, result) {
  const evidence = sanitizeStructuredTurnUtterance(message).slice(0, 280) ||
    "本輪訊息";
  return {
    ...result,
    operations: [],
    ambiguities: [
      {
        code: "low_confidence",
        evidence,
        question: "我還不確定這次要調整哪項訂房資料，可以再說明一次嗎？",
      },
    ],
    confidence: 0,
  };
}

export function hasMeaningfulBookingContext(value) {
  const state = normalizeConversationContext(value);
  return Object.entries(state).some(([field, entry]) => {
    if (["last_updated_at", "slot_meta"].includes(field)) return false;
    if (Array.isArray(entry)) return entry.length > 0;
    return entry !== null && entry !== undefined;
  });
}

export function resolveStructuredBookingTurn({
  mode,
  message,
  previousContext,
  legacyContext,
  nowIso = new Date().toISOString(),
  sourceMessageId = "",
} = {}) {
  const normalizedMode = getStructuredTurnInterpreterMode(mode);
  const deterministic = interpretBookingTurnDeterministically({
    message,
    context: previousContext,
  });
  let result = deterministic.result;
  let source = deterministic.source;

  if (deterministic.requiresModel) {
    result = buildLowConfidenceResult(message, result);
    source = "deterministic_safe_fallback";
  }

  const reduction = reduceBookingContext(previousContext, result, {
    message,
    nowIso,
    sourceMessageId,
  });
  const transactional = isStructuredTransactionalResult(result);
  const authoritative = normalizedMode === "active" && transactional;
  const selectedContext = authoritative
    ? reduction.context
    : normalizedMode === "active"
      ? normalizeConversationContext(previousContext)
      : normalizeConversationContext(legacyContext);
  const comparison = compareStructuredAndLegacyContext(
    legacyContext,
    reduction.context,
  );

  return {
    mode: normalizedMode,
    source,
    requiresModel: deterministic.requiresModel,
    result,
    reduction,
    comparison,
    transactional,
    authoritative,
    blockedByAmbiguity: authoritative && result.ambiguities.length > 0,
    context: selectedContext,
    changed: authoritative
      ? reduction.changed
      : JSON.stringify(getConversationContextForStorage(previousContext)) !==
        JSON.stringify(getConversationContextForStorage(selectedContext)),
    hasContext: hasMeaningfulBookingContext(selectedContext),
  };
}

export async function resolveStructuredBookingTurnHybrid({
  ...options
} = {}) {
  return resolveStructuredBookingTurn(options);
}

export function buildStructuredTurnMetadata(resolution) {
  if (!resolution) return {};
  return {
    structured_turn_mode: resolution.mode,
    structured_turn_source: resolution.source,
    structured_turn_transactional: resolution.transactional,
    structured_turn_authoritative: resolution.authoritative,
    structured_turn_requires_model: resolution.requiresModel,
    structured_turn_mutation_applied: resolution.reduction.applied,
    structured_turn_context_changed: resolution.reduction.changed,
    structured_turn_legacy_agrees: resolution.comparison.agrees,
    structured_turn_intents: resolution.result.intents,
    structured_turn_operation_entities: resolution.result.operations.map(
      (operation) => operation.entity,
    ),
    structured_turn_ambiguity_codes: resolution.result.ambiguities.map(
      (ambiguity) => ambiguity.code,
    ),
    semantic_turn_kind:
      resolution.plan?.intent_ast?.turn_kind || "unrelated",
    semantic_scenario_action:
      resolution.plan?.intent_ast?.scenario_action || "none",
    semantic_goal_ids: resolution.plan?.intent_ast?.goal_ids || [],
    semantic_previous_transaction_topic:
      resolution.plan?.previous_transaction_topic || "none",
    semantic_event_count: resolution.reduction?.events?.length || 0,
    semantic_duplicate_turn: Boolean(resolution.reduction?.duplicate),
    semantic_stale_reference_blocked: Boolean(resolution.reduction?.stale),
    deterministic_fast_path_used: Boolean(
      resolution.plan?.deterministic_fast_path_used,
    ),
    turn_type: resolution.plan?.turn_type || "unrelated",
    quote_scope: resolution.plan?.quote_scope || null,
    quote_scenario_version:
      resolution.context?.quote_scenario?.context_version || 0,
    pending_confirmation_existed: Boolean(
      resolution.plan?.dialogue_state?.pending_confirmation_existed,
    ),
    derived_checkout_used: Boolean(resolution.plan?.derived_checkout_used),
    inherited_optional_addons_count:
      resolution.plan?.inherited_optional_addons_count || 0,
    ...(resolution.provider
      ? {
          structured_turn_provider_called: Boolean(resolution.provider.called),
          structured_turn_provider_status:
            resolution.provider.provider_status ?? null,
          structured_turn_provider_latency_ms: Number(
            resolution.provider.latency_ms || 0,
          ),
          structured_turn_provider_validation:
            resolution.provider.validation_outcome || "",
          structured_turn_provider_failure:
            resolution.provider.failure_code || null,
        }
      : {}),
  };
}
