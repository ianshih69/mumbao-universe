import {
  getConversationContextForStorage,
  normalizeConversationContext,
} from "./conversationContext.js";

export const pricingFreshnessFields = [
  "stay_type",
  "check_in",
  "check_out",
  "guest_count",
  "adult_count",
  "child_count",
  "room_count",
  "pet_count",
  "pet_type",
];

const freshnessFields = new Set([
  "active_intent",
  "current_topic",
  ...pricingFreshnessFields,
]);

const dateFieldSet = new Set(["check_in", "check_out"]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeFieldList(value) {
  if (!Array.isArray(value)) return [];
  const fields = [];
  for (const field of value.map((entry) => String(entry || "").trim())) {
    if (freshnessFields.has(field) && !fields.includes(field)) fields.push(field);
  }
  return fields;
}

function toDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function addDays(dateText, days) {
  const base = toDateOnly(dateText);
  if (!base) return "";
  const date = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseSmallNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  const values = new Map([
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
    ["十", 10],
  ]);
  return values.get(text) ?? null;
}

function inferCurrentDate({ dateInfo, nowIso } = {}) {
  return (
    toDateOnly(dateInfo?.currentDate) ||
    toDateOnly(nowIso) ||
    toDateOnly(new Date().toISOString())
  );
}

function detectFallbackFieldSignals(currentMessage) {
  const compact = normalizeText(currentMessage);
  const mentioned = new Set();
  const uncertain = new Set();
  let usesRelativeDate = false;

  const hasAbsoluteDateCue =
    /\d{1,4}[\/.-]\d{1,2}/.test(compact) ||
    /\d{1,2}月\d{1,2}(?:日|號)?/.test(compact);
  const hasRelativeDateCue =
    /(今天|明天|後天|大後天|下週|下周|下個月底|下月底|往後.+天|星期[一二三四五六日天]|週[一二三四五六日天]|周[一二三四五六日天])/.test(
      compact
    );
  const hasDateChangeCue = /(日期|入住|退房|改到|換到|改成|改為)/.test(compact);

  if (hasAbsoluteDateCue || hasRelativeDateCue || (hasDateChangeCue && /改/.test(compact))) {
    mentioned.add("check_in");
    if (
      /[-~～到至]/.test(compact) ||
      /(退房|兩晚|2晚|三晚|3晚|一晚|1晚)/.test(compact)
    ) {
      mentioned.add("check_out");
    } else if (hasRelativeDateCue || /日期/.test(compact)) {
      uncertain.add("check_out");
    }
    usesRelativeDate = hasRelativeDateCue;
  }

  if (/(包棟|整棟|villa|單間|房間)/i.test(compact)) {
    mentioned.add("stay_type");
  }

  if (/(人數|幾人|幾位|入住人|住客|大人|小孩|成人|孩童|\d+人|\d+位|[一二兩两三四五六七八九十]+人|十幾個)/.test(compact)) {
    mentioned.add("guest_count");
    if (!/(\d+|[一二兩两三四五六七八九十]+)(?:個)?(?:人|位|大人|小孩|成人|孩童)/.test(compact)) {
      uncertain.add("guest_count");
    }
  }

  if (/(寵物|狗|狗狗|毛孩|貓|貓咪)/.test(compact)) {
    mentioned.add("pet_count");
    if (/(狗|狗狗|毛孩|貓|貓咪)/.test(compact)) mentioned.add("pet_type");
    if (
      !/(不帶|沒有|無|不去|不來)/.test(compact) &&
      !/(\d+|[一二兩两三四五六七八九十]+)(?:隻|只|個)?(?:狗|狗狗|貓|貓咪|寵物|毛孩)/.test(compact)
    ) {
      uncertain.add("pet_count");
    }
  }

  if (/(房數|幾間房|幾間)/.test(compact)) {
    mentioned.add("room_count");
    if (!/(\d+|[一二兩两三四五六七八九十]+)(?:間房|間)/.test(compact)) {
      uncertain.add("room_count");
    }
  }

  return {
    mentioned_fields: [...mentioned],
    uncertain_fields: [...uncertain],
    uses_relative_date: usesRelativeDate,
  };
}

function resolveRelativeDatePatch(currentMessage, { dateInfo, nowIso } = {}) {
  const compact = normalizeText(currentMessage);
  const currentDate = inferCurrentDate({ dateInfo, nowIso });
  let offset = null;

  if (compact.includes("大後天")) offset = 3;
  else if (compact.includes("後天")) offset = 2;
  else if (compact.includes("明天")) offset = 1;
  else if (compact.includes("今天")) offset = 0;

  if (offset === null) return { patch: {}, uncertain_fields: [] };

  const checkIn = addDays(currentDate, offset);
  if (!checkIn) return { patch: {}, uncertain_fields: ["check_in", "check_out"] };

  const patch = {
    check_in: checkIn,
  };
  const uncertainFields = [];
  const nightsMatch = compact.match(/(\d+|[一二兩两三四五六七八九十]+)(?:晚|夜)/);
  const nights = nightsMatch ? parseSmallNumber(nightsMatch[1]) : null;
  if (Number.isInteger(nights) && nights > 0) {
    patch.check_out = addDays(checkIn, nights);
  } else {
    uncertainFields.push("check_out");
  }

  return {
    patch,
    uncertain_fields: uncertainFields,
  };
}

function writeSlotMeta(context, fields, { source, sourceMessageId, updatedAt, confidence }) {
  const slotMeta = {
    ...(context.slot_meta || {}),
  };

  for (const field of fields) {
    if (!freshnessFields.has(field)) continue;
    slotMeta[field] = {
      source,
      ...(sourceMessageId ? { source_message_id: sourceMessageId } : {}),
      updated_at: updatedAt,
      ...(Number.isFinite(confidence) ? { confidence } : {}),
    };
  }

  return {
    ...context,
    slot_meta: slotMeta,
  };
}

function fieldHasFreshValue({ field, oldContext, currentContext, semanticResult, serverPatch }) {
  if (Object.prototype.hasOwnProperty.call(serverPatch, field)) return true;
  if (Object.prototype.hasOwnProperty.call(semanticResult?.context_patch || {}, field)) {
    return currentContext[field] !== null && currentContext[field] !== undefined;
  }
  return oldContext[field] !== currentContext[field];
}

export function applyContextFreshnessGuard({
  oldContext,
  context,
  semanticResult = null,
  currentMessage,
  dateInfo = {},
  nowIso = new Date().toISOString(),
  sourceMessageId = "",
} = {}) {
  const previous = normalizeConversationContext(oldContext);
  let guarded = normalizeConversationContext(context);
  const fallbackSignals = detectFallbackFieldSignals(currentMessage);
  const semanticMentioned = normalizeFieldList(semanticResult?.mentioned_fields);
  const semanticUncertain = normalizeFieldList(semanticResult?.uncertain_fields);
  const mentionedFields = [
    ...new Set([...semanticMentioned, ...fallbackSignals.mentioned_fields]),
  ];
  const uncertainFields = new Set([
    ...semanticUncertain,
    ...fallbackSignals.uncertain_fields,
  ]);
  const usesRelativeDate =
    Boolean(semanticResult?.uses_relative_date) || fallbackSignals.uses_relative_date;
  const relativePatch = usesRelativeDate
    ? resolveRelativeDatePatch(currentMessage, { dateInfo, nowIso })
    : { patch: {}, uncertain_fields: [] };
  for (const field of relativePatch.uncertain_fields) uncertainFields.add(field);

  const staleFieldsBlocked = new Set();
  const metaTouchedFields = new Set();

  if (
    semanticResult?.turn_action === "request_quote" &&
    semanticResult?.is_follow_up === false
  ) {
    for (const field of pricingFreshnessFields) {
      if (mentionedFields.includes(field)) continue;
      if (Object.prototype.hasOwnProperty.call(semanticResult?.context_patch || {}, field)) {
        continue;
      }
      if (field === "pet_type" && guarded.pet_count === 0) {
        continue;
      }
      if (guarded[field] !== null && guarded[field] !== undefined) {
        staleFieldsBlocked.add(field);
        guarded[field] = null;
        metaTouchedFields.add(field);
      }
    }
  }

  for (const [field, value] of Object.entries(relativePatch.patch)) {
    if (!dateFieldSet.has(field)) continue;
    if (previous[field] !== value) staleFieldsBlocked.add(field);
    guarded[field] = value;
    metaTouchedFields.add(field);
  }

  for (const field of mentionedFields) {
    if (!freshnessFields.has(field)) continue;

    if (field === "pet_count" && guarded.pet_count === 0) {
      if (guarded.pet_type !== null) staleFieldsBlocked.add("pet_type");
      guarded.pet_type = null;
      metaTouchedFields.add("pet_count");
      metaTouchedFields.add("pet_type");
      continue;
    }

    const hasFreshValue = fieldHasFreshValue({
      field,
      oldContext: previous,
      currentContext: guarded,
      semanticResult,
      serverPatch: relativePatch.patch,
    });

    if (uncertainFields.has(field) || !hasFreshValue) {
      if (previous[field] !== null && previous[field] !== undefined) {
        staleFieldsBlocked.add(field);
      }
      guarded[field] = null;
      uncertainFields.add(field);
      metaTouchedFields.add(field);
    }
  }

  if (
    (mentionedFields.includes("check_in") ||
      Object.prototype.hasOwnProperty.call(relativePatch.patch, "check_in")) &&
    !Object.prototype.hasOwnProperty.call(relativePatch.patch, "check_out") &&
    !Object.prototype.hasOwnProperty.call(semanticResult?.context_patch || {}, "check_out") &&
    guarded.check_out === previous.check_out
  ) {
    if (previous.check_out) staleFieldsBlocked.add("check_out");
    guarded.check_out = null;
    uncertainFields.add("check_out");
    metaTouchedFields.add("check_out");
  }

  guarded = getConversationContextForStorage(guarded);
  if (metaTouchedFields.size) {
    guarded = writeSlotMeta(guarded, [...metaTouchedFields], {
      source: "freshness_guard",
      sourceMessageId,
      updatedAt: nowIso,
      confidence: semanticResult?.confidence,
    });
    guarded.last_updated_at = nowIso;
  }

  const finalMentionedFields = mentionedFields.filter((field) => freshnessFields.has(field));
  const finalUncertainFields = [...uncertainFields].filter((field) =>
    freshnessFields.has(field)
  );
  const finalStaleFieldsBlocked = [...staleFieldsBlocked].filter((field) =>
    freshnessFields.has(field)
  );

  return {
    context: guarded,
    changed:
      JSON.stringify(getConversationContextForStorage(context)) !==
      JSON.stringify(guarded),
    mentioned_fields: finalMentionedFields,
    uncertain_fields: finalUncertainFields,
    uses_relative_date: usesRelativeDate,
    stale_fields_blocked: finalStaleFieldsBlocked,
    freshness_guard_result: finalStaleFieldsBlocked.length
      ? "blocked_stale_fields"
      : "passed",
  };
}
