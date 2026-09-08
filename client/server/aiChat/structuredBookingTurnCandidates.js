import { z } from "zod";
import {
  getConversationContextForStorage,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  compareStructuredAndLegacyContext,
  getStructuredTurnInterpreterMode,
  hasMeaningfulBookingContext,
  interpretBookingTurnDeterministically,
  isStructuredTransactionalResult,
  reduceBookingContext,
  sanitizeStructuredTurnUtterance,
  structuredTurnEntities,
  structuredTurnOperations,
  toTypedBookingContext,
  validateStructuredTurnResult,
} from "./structuredBookingTurn.js";
import {
  buildQuoteScopeBaseContext,
  classifyQuoteDialogueTurn,
  countInheritedOptionalAddons,
  finalizeQuoteScenarioContext,
  getYearlessDateClarification,
  normalizeQuoteSnapshotOperations,
} from "./quoteDialogueState.js";
import { planPendingSlotFillTransaction } from "./pendingSlotFillTransaction.js";
import { planDialogueGoals } from "./dialogueGoalPlanner.js";
import { resolveSemanticTurn } from "./semanticTurnResolver.js";
import { applyScenarioTransition } from "./dialogueStateEngine.js";

export const bookingSpanTypes = Object.freeze([
  "date",
  "nights",
  "duration_days",
  "adult_count",
  "child_count",
  "infant_count",
  "pet_count",
  "pet_weight",
  "pet_type",
  "age",
  "breakfast_count",
  "operation_cue",
  "action_cue",
  "stay_mode",
  "date_type",
  "generic_quantity",
]);

export const bookingRequestedActions = Object.freeze([
  "request_quote",
  "request_availability",
  "ask_policy",
]);

export const bookingTurnClassifications = Object.freeze([
  "DETERMINISTIC_EXPECTED",
  "LLM_CANDIDATE_SELECTION",
  "SAFE_CLARIFICATION",
  "CONTEXT_ACTION_ONLY",
  "INFORMATIONAL",
]);

const spanValueSchema = z.union([z.string(), z.number()]);
export const bookingSpanSchema = z
  .object({
    span_id: z.string().regex(/^span-\d{3}$/),
    text: z.string().min(1).max(280),
    start: z.number().int().min(0),
    end: z.number().int().positive(),
    normalized_type: z.enum(bookingSpanTypes),
    normalized_value: spanValueSchema,
    classifier: z.string().min(1).max(20).optional(),
    unit: z.string().min(1).max(20).optional(),
    entity_hints: z.array(z.enum(structuredTurnEntities)).max(6),
  })
  .strict();

const candidateBindingSchema = z
  .object({
    field: z.enum([
      "count",
      "pet_type",
      "weights_kg",
      "ages_years",
      "mode",
      "check_in",
      "check_out",
      "nights",
      "date_type",
    ]),
    source_kind: z.enum(["span", "context"]),
    span_ids: z.array(z.string().regex(/^span-\d{3}$/)).max(30).optional(),
    context_ref: z.string().regex(/^(?:stay|party|pets|addons)\.[a-z_]+$/).optional(),
    projection: z.enum(["value", "values", "sum", "cardinality"]),
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.source_kind === "span" && !binding.span_ids?.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "span_ids_required" });
    }
    if (binding.source_kind === "context" && !binding.context_ref) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "context_ref_required" });
    }
  });

export const bookingTurnCandidateSchema = z
  .object({
    candidate_id: z.string().regex(/^cand-\d{3}-[a-z0-9-]+$/),
    selection_group: z.string().regex(/^group-\d{3}$/),
    operation: z.enum(structuredTurnOperations),
    entity: z.enum(structuredTurnEntities),
    bindings: z.array(candidateBindingSchema).max(12),
    evidence_span_ids: z.array(z.string().regex(/^span-\d{3}$/)).min(1).max(30),
    context_refs: z.array(z.string().regex(/^(?:stay|party|pets|addons)\.[a-z_]+$/)).max(12),
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
const numberToken = String.raw`(?:\d+(?:\.\d+)?|[零〇一二兩两三四五六七八九十百]+)`;
const pendingFieldAllowlist = new Set([
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

function parseNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (chineseDigits.has(text)) return chineseDigits.get(text);
  const hundredIndex = text.indexOf("百");
  if (hundredIndex >= 0) {
    const left = text.slice(0, hundredIndex);
    const right = text.slice(hundredIndex + 1);
    const hundreds = left ? chineseDigits.get(left) : 1;
    const remainder = right ? parseNumber(right) : 0;
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

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return [year, month, day]
    .map((part, index) => String(Number(part)).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function addIsoDays(dateText, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))) return null;
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function buildNormalizedView(source) {
  let text = "";
  const offsets = [];
  let sourceOffset = 0;
  for (const character of String(source || "")) {
    const normalized = character.normalize("NFKC").toLowerCase();
    text += normalized;
    for (let index = 0; index < normalized.length; index += 1) {
      offsets.push(sourceOffset);
    }
    sourceOffset += character.length;
  }
  offsets.push(sourceOffset);
  return { text, offsets };
}

function entityForLabel(value) {
  const text = String(value || "");
  if (/成人|大人|成年|^人$/.test(text)) return "adult";
  if (/兒童|小孩|小朋友/.test(text)) return "child";
  if (/嬰幼兒|幼兒|嬰兒/.test(text)) return "infant";
  if (/狗|犬|毛孩|寵物/.test(text)) return "pet";
  return null;
}

function countTypeForEntity(entity) {
  return `${entity}_count`;
}

function ageEntity(age) {
  if (age < 4) return "infant";
  if (age < 13) return "child";
  return "adult";
}

export function extractBookingTurnSpans(message, { currentDate = "" } = {}) {
  const source = String(message || "");
  const view = buildNormalizedView(source);
  const found = [];

  function addMatch(match, descriptor, captureIndex = 0) {
    if (!descriptor || descriptor.normalized_value == null) return;
    const captured = String(match[captureIndex] ?? match[0]);
    const relative = captureIndex === 0 ? 0 : match[0].indexOf(captured);
    const normalizedStart = match.index + Math.max(0, relative);
    const normalizedEnd = normalizedStart + captured.length;
    const start = view.offsets[normalizedStart] ?? normalizedStart;
    const end = view.offsets[normalizedEnd] ?? source.length;
    if (end <= start) return;
    found.push({
      text: source.slice(start, end),
      start,
      end,
      normalized_type: descriptor.normalized_type,
      normalized_value: descriptor.normalized_value,
      ...(descriptor.classifier ? { classifier: descriptor.classifier } : {}),
      ...(descriptor.unit ? { unit: descriptor.unit } : {}),
      entity_hints: descriptor.entity_hints || [],
    });
  }

  function scan(pattern, build, captureIndex = 0) {
    for (const match of view.text.matchAll(pattern)) {
      addMatch(match, build(match), captureIndex);
    }
  }

  scan(/\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}日?/gu, (match) => {
    const parts = match[0].match(/\d+/g) || [];
    return {
      normalized_type: "date",
      normalized_value: isoDate(parts[0], parts[1], parts[2]),
      unit: "date",
      entity_hints: ["stay"],
    };
  });
  scan(/大後天|後天|明天|今天/gu, (match) => {
    const offset = {
      今天: 0,
      明天: 1,
      後天: 2,
      大後天: 3,
    }[match[0]];
    return {
      normalized_type: "date",
      normalized_value: addIsoDays(currentDate, offset),
      unit: "date",
      entity_hints: ["stay"],
    };
  });

  scan(new RegExp(`(${numberToken})(?:個)?(晚上?|夜)`, "gu"), (match) => ({
    normalized_type: "nights",
    normalized_value: parseNumber(match[1]),
    classifier: match[2],
    unit: "night",
    entity_hints: ["stay"],
  }));
  scan(new RegExp(`(${numberToken})天`, "gu"), (match) => ({
    normalized_type: "duration_days",
    normalized_value: parseNumber(match[1]),
    classifier: "天",
    unit: "day",
    entity_hints: ["stay"],
  }));

  const entityLabels = "(?:成人|大人|成年(?:旅客)?|兒童|小孩|小朋友|嬰幼兒|幼兒|嬰兒|狗狗|狗|大型犬|犬|毛孩|寵物)";
  scan(new RegExp(`(${numberToken})人(?!數|房)`, "gu"), (match) => ({
    normalized_type: "adult_count",
    normalized_value: parseNumber(match[1]),
    classifier: "人",
    unit: "person",
    entity_hints: ["adult"],
  }));
  scan(
    new RegExp(`(${numberToken})(個|位|人|隻|只)?\\s*(${entityLabels})`, "gu"),
    (match) => {
      const entity = entityForLabel(match[3]);
      return {
        normalized_type: countTypeForEntity(entity),
        normalized_value: parseNumber(match[1]),
        classifier: match[2] || (entity === "pet" ? "隻" : "位"),
        unit: entity === "pet" ? "pet" : "person",
        entity_hints: [entity],
      };
    },
  );
  scan(
    new RegExp(`(成人|大人|兒童|小孩|小朋友|嬰幼兒|幼兒|嬰兒|人|狗狗|狗|大型犬|犬|毛孩|寵物)(?:數)?(?:共|有|是|改成|改為|換成|變成|調整為)?\\s*(${numberToken})(個|位|人|隻|只)?`, "gu"),
    (match) => {
      const entity = entityForLabel(match[1]);
      if (entity !== "pet" && /隻|只/.test(match[3] || "")) return null;
      return {
        normalized_type: countTypeForEntity(entity),
        normalized_value: parseNumber(match[2]),
        classifier: match[3] || (entity === "pet" ? "隻" : "位"),
        unit: entity === "pet" ? "pet" : "person",
        entity_hints: [entity],
      };
    },
  );
  scan(new RegExp(`(${numberToken})(隻|只)`, "gu"), (match) => ({
    normalized_type: "pet_count",
    normalized_value: parseNumber(match[1]),
    classifier: match[2],
    unit: "pet",
    entity_hints: ["pet"],
  }));

  scan(new RegExp(`(${numberToken})(?:公斤|kg)`, "gu"), (match) => ({
    normalized_type: "pet_weight",
    normalized_value: parseNumber(match[1]),
    unit: "kg",
    entity_hints: ["pet"],
  }));
  scan(new RegExp(`(${numberToken})歲`, "gu"), (match) => {
    const age = parseNumber(match[1]);
    return {
      normalized_type: "age",
      normalized_value: age,
      unit: "year",
      entity_hints: Number.isFinite(age) ? [ageEntity(age)] : [],
    };
  });

  scan(new RegExp(`早餐(?:設定為|改成|改為|換成|變成|調整為)?\\s*(${numberToken})(份|個|位)?`, "gu"), (match) => ({
    normalized_type: "breakfast_count",
    normalized_value: parseNumber(match[1]),
    classifier: match[2] || "份",
    unit: "serving",
    entity_hints: ["breakfast"],
  }));
  scan(new RegExp(`(${numberToken})(份|個)早餐`, "gu"), (match) => ({
    normalized_type: "breakfast_count",
    normalized_value: parseNumber(match[1]),
    classifier: match[2],
    unit: "serving",
    entity_hints: ["breakfast"],
  }));

  scan(/狗狗|大型犬|狗|犬|毛孩|寵物/gu, (match) => ({
    normalized_type: "pet_type",
    normalized_value: /狗|犬/.test(match[0]) ? "dog" : "pet",
    entity_hints: ["pet"],
  }));
  scan(/包棟|整棟|單間|一間房|(?:預訂|訂|改成|改為|換成)房間|房間(?:價格|房價)/gu, (match) => ({
    normalized_type: "stay_mode",
    normalized_value: /包棟|整棟/.test(match[0]) ? "villa" : "room",
    entity_hints: ["stay"],
  }));
  scan(/平日|週五|星期五|週六|星期六|週日|星期日|假日|國定假日/gu, (match) => ({
    normalized_type: "date_type",
    normalized_value: /週五|星期五/.test(match[0])
      ? "friday"
      : /平日/.test(match[0])
        ? "weekday"
        : "holiday",
    entity_hints: ["stay"],
  }));

  const operationPatterns = [
    [/(?:總共|共有|目前是|設定為)/gu, "set"],
    [new RegExp(`(?:再加|加上|增加|追加|再帶|另(?:外|[一二兩两三四五六七八九十\\d])|多(?!少)|還有|還會帶|加(?=\\s*${numberToken}))`, "gu"), "add"],
    [/(?:減少|扣掉|移除|拿掉|(?<!多)少|不帶|不要帶|不要(?=\s*[零〇一二兩两三四五六七八九十百\d]))/gu, "remove"],
    [/(?:改成|改為|換成|變成|調整為|人數改|日期改|改到|改(?=\s*[零〇一二兩两三四五六七八九十百\d]))/gu, "replace"],
    [/(?:清除|取消早餐)/gu, "clear"],
  ];
  for (const [pattern, value] of operationPatterns) {
    scan(pattern, () => ({
      normalized_type: "operation_cue",
      normalized_value: value,
      entity_hints: [],
    }));
  }
  const actionPatterns = [
    [/(?:多少|價格|房價|費用|報價|總共|算一下|多少錢)/gu, "request_quote"],
    [/(?:有房|房況|空房|可訂|可以訂|能入住|可以入住)/gu, "request_availability"],
    [/(?:可以|能不能|是否|規定|政策|怎麼辦|有提供|接受|押金|退款|取消費|違約|賠償)/gu, "ask_policy"],
  ];
  for (const [pattern, value] of actionPatterns) {
    scan(pattern, () => ({
      normalized_type: "action_cue",
      normalized_value: value,
      entity_hints: [],
    }));
  }

  scan(new RegExp(`(?:再加|增加|多|改成?|換成?|不要|移除|減少)\\s*(${numberToken})(個|位|隻|只)?`, "gu"), (match) => ({
    normalized_type: "generic_quantity",
    normalized_value: parseNumber(match[1]),
    classifier: match[2] || "個",
    unit: match[2] && /隻|只/.test(match[2]) ? "pet" : "count",
    entity_hints: match[2] && /隻|只/.test(match[2]) ? ["pet"] : [],
  }));

  const deduped = [...new Map(
    found
      .filter((span) => bookingSpanTypes.includes(span.normalized_type))
      .map((span) => [
        [span.start, span.end, span.normalized_type, span.normalized_value].join(":"),
        span,
      ]),
  ).values()].filter((span, _index, entries) => !entries.some((other) =>
    other !== span &&
    other.start <= span.start &&
    other.end >= span.end &&
    (other.start < span.start || other.end > span.end) &&
    other.normalized_type === span.normalized_type &&
    other.normalized_value === span.normalized_value,
  )).sort((left, right) =>
    left.start - right.start || left.end - right.end ||
    left.normalized_type.localeCompare(right.normalized_type),
  );

  return deduped.map((span, index) => bookingSpanSchema.parse({
    span_id: `span-${String(index + 1).padStart(3, "0")}`,
    ...span,
  }));
}

function actionIdsFromIntents(intents) {
  const actions = [];
  if (intents.includes("request_quote")) actions.push("request_quote");
  if (intents.includes("availability_request")) actions.push("request_availability");
  if (intents.includes("policy_question")) actions.push("ask_policy");
  return actions;
}

function operationCue(operation, spans) {
  const cues = spans.filter((span) => span.normalized_type === "operation_cue");
  return cues.filter((span) => span.normalized_value === operation);
}

function spansOfType(spans, type, value) {
  return spans.filter((span) =>
    span.normalized_type === type &&
    (value === undefined || span.normalized_value === value),
  );
}

function contextRefForField(entity, field) {
  const refs = {
    adult: { count: "party.adults" },
    child: { count: "party.children", ages_years: "party.child_ages_years" },
    infant: { count: "party.infants" },
    pet: {
      count: "pets.count",
      pet_type: "pets.species",
      weights_kg: "pets.individual_weights_kg",
    },
    breakfast: { count: "addons.breakfast_quantity" },
    stay: {
      mode: "stay.mode",
      check_in: "stay.check_in",
      check_out: "stay.check_out",
      nights: "stay.nights",
      date_type: "stay.date_type",
    },
  };
  return refs[entity]?.[field] || null;
}

function selectValueSpans(spans, type, rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const remaining = [...spansOfType(spans, type)];
  const selected = [];
  for (const value of values) {
    const index = remaining.findIndex((span) => span.normalized_value === value);
    if (index < 0) return [];
    selected.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return selected;
}

function bindingForOperationField(operation, field, spans, currentState) {
  const typeMap = {
    count: countTypeForEntity(operation.entity),
    pet_type: "pet_type",
    weights_kg: "pet_weight",
    ages_years: "age",
    mode: "stay_mode",
    check_in: "date",
    check_out: "date",
    nights: "nights",
    date_type: "date_type",
  };
  const rawValue = operation[field];
  if (rawValue === undefined) return null;
  let matches = selectValueSpans(spans, typeMap[field], rawValue);
  let projection = Array.isArray(rawValue) ? "values" : "value";

  if (field === "check_out") {
    const dateMatches = spansOfType(spans, "date", rawValue);
    matches = dateMatches.length ? [dateMatches.at(-1)] : [];
  }
  if (field === "pet_type" && !matches.length) {
    const petTypeSpans = spansOfType(spans, "pet_type");
    if (petTypeSpans.length === 1) matches = petTypeSpans;
  }
  if (field === "count" && !matches.length) {
    const countSpans = spansOfType(spans, typeMap[field]);
    const sum = countSpans.reduce(
      (total, span) => total + Number(span.normalized_value || 0),
      0,
    );
    if (countSpans.length > 1 && sum === rawValue) {
      matches = countSpans;
      projection = "sum";
    } else {
      const ageSpans = spans.filter((span) =>
        span.normalized_type === "age" &&
        span.entity_hints.includes(operation.entity),
      );
      if (ageSpans.length === rawValue) {
        matches = ageSpans;
        projection = "cardinality";
      } else if (operation.entity === "pet") {
        const weightSpans = spansOfType(spans, "pet_weight");
        if (weightSpans.length === rawValue) {
          matches = weightSpans;
          projection = "cardinality";
        }
      }
    }
  }
  if (matches.length) {
    return {
      field,
      source_kind: "span",
      span_ids: matches.map((span) => span.span_id),
      projection,
    };
  }

  const contextRef = contextRefForField(operation.entity, field);
  const contextValue = readContextRef(currentState, contextRef);
  if (
    contextRef &&
    (contextValue === rawValue || JSON.stringify(contextValue) === JSON.stringify(rawValue))
  ) {
    return {
      field,
      source_kind: "context",
      context_ref: contextRef,
      projection,
    };
  }
  return null;
}

function candidateSlug(operation) {
  return `${operation.entity}-${operation.operation}`;
}

function compileOperationCandidate(operation, index, spans, currentState) {
  const valueFields = [
    "count",
    "pet_type",
    "weights_kg",
    "ages_years",
    "mode",
    "check_in",
    "check_out",
    "nights",
    "date_type",
  ].filter((field) => operation[field] !== undefined);
  const bindings = valueFields.map((field) =>
    bindingForOperationField(operation, field, spans, currentState),
  );
  if (bindings.some((binding) => !binding)) return null;

  const cueSpans = operationCue(operation.operation, spans);
  const evidenceSpanIds = [...new Set([
    ...bindings.flatMap((binding) => binding.span_ids || []),
    ...cueSpans.map((span) => span.span_id),
  ])];
  if (!evidenceSpanIds.length) {
    const entitySpans = spans.filter((span) => span.entity_hints.includes(operation.entity));
    evidenceSpanIds.push(...entitySpans.map((span) => span.span_id));
  }
  if (!evidenceSpanIds.length) return null;

  return bookingTurnCandidateSchema.parse({
    candidate_id: `cand-${String(index + 1).padStart(3, "0")}-${candidateSlug(operation)}`,
    selection_group: `group-${String(index + 1).padStart(3, "0")}`,
    operation: operation.operation,
    entity: operation.entity,
    bindings,
    evidence_span_ids: evidenceSpanIds,
    context_refs: [...new Set([
      ...bindings.map((binding) => binding.context_ref).filter(Boolean),
      ...(operation.operation === "add" || operation.operation === "remove"
        ? [contextRefForField(operation.entity, "count")].filter(Boolean)
        : []),
    ])],
  });
}

function compileMissingEntityCandidates(spans, startIndex) {
  const quantity = spans.find((span) => span.normalized_type === "generic_quantity");
  if (!quantity) return [];
  const cueIds = operationCue("add", spans).map((span) => span.span_id);
  return ["adult", "child", "pet"].map((entity, offset) =>
    bookingTurnCandidateSchema.parse({
      candidate_id: `cand-${String(startIndex + offset + 1).padStart(3, "0")}-${entity}-add`,
      selection_group: `group-${String(startIndex + 1).padStart(3, "0")}`,
      operation: "add",
      entity,
      bindings: [{
        field: "count",
        source_kind: "span",
        span_ids: [quantity.span_id],
        projection: "value",
      }],
      evidence_span_ids: [...new Set([quantity.span_id, ...cueIds])],
      context_refs: [contextRefForField(entity, "count")],
    }),
  );
}

function getPendingFields(context) {
  const fields = normalizeConversationContext(context)?.pending_interaction?.required_fields;
  return [...new Set((Array.isArray(fields) ? fields : []).filter((field) =>
    pendingFieldAllowlist.has(field),
  ))];
}

function operationFromCue(spans, fallback = "set") {
  const cues = spans.filter((span) => span.normalized_type === "operation_cue");
  const values = [...new Set(cues.map((span) => span.normalized_value))];
  return values.length === 1 ? values[0] : fallback;
}

function enrichPetOperationFromSpans(operations, spans, context) {
  const petCounts = spansOfType(spans, "pet_count");
  const weights = spansOfType(spans, "pet_weight");
  const petTypes = spansOfType(spans, "pet_type");
  const existingIndex = operations.findIndex((operation) => operation.entity === "pet");
  const existing = existingIndex >= 0 ? operations[existingIndex] : null;
  const explicitPetMention = petTypes.length > 0 || petCounts.length > 0;
  if (!existing && (!explicitPetMention || (!petCounts.length && !weights.length))) {
    return operations;
  }
  if (existing?.operation === "clear") return operations;

  const explicitCount = petCounts.length
    ? petCounts.reduce((total, span) => total + Number(span.normalized_value || 0), 0)
    : null;
  const pendingPet = normalizeConversationContext(context);
  const inferredCount = Number.isInteger(explicitCount) && explicitCount > 0
    ? explicitCount
    : explicitPetMention && weights.length > 0
      ? weights.length
      : undefined;
  const operation = {
    ...(existing || {
      operation: operationFromCue(spans),
      entity: "pet",
      evidence: petTypes[0]?.text || petCounts[0]?.text || "",
    }),
    ...(inferredCount !== undefined ? { count: inferredCount } : {}),
    ...(petTypes.length
      ? { pet_type: petTypes.some((span) => span.normalized_value === "dog") ? "dog" : "pet" }
      : pendingPet.pet_type
        ? { pet_type: pendingPet.pet_type }
        : {}),
    ...(weights.length ? { weights_kg: weights.map((span) => span.normalized_value) } : {}),
    evidence: [
      existing?.evidence || petTypes[0]?.text || petCounts[0]?.text,
      ...weights.map((span) => span.text),
    ]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join("、"),
  };
  if (!petTypes.length && !pendingPet.pet_type) delete operation.pet_type;
  if (existingIndex >= 0) {
    return operations.map((entry, index) => index === existingIndex ? operation : entry);
  }
  return [...operations, operation];
}

export function compileBookingTurnCandidates({
  message,
  context = null,
  conversationId = "",
  previousTopic = "",
  dateInfo = {},
  sourceTurnId = "",
  nowIso = new Date().toISOString(),
} = {}) {
  const sanitizedMessage = sanitizeStructuredTurnUtterance(message);
  const spans = extractBookingTurnSpans(sanitizedMessage, {
    currentDate: dateInfo.currentDate,
  });
  const currentState = toTypedBookingContext(context);
  const deterministic = interpretBookingTurnDeterministically({
    message: sanitizedMessage,
    context,
    dateInfo,
  });
  const enrichedOperations = enrichPetOperationFromSpans(
    deterministic.result.operations,
    spans,
    context,
  );
  let preliminaryResult = {
    ...deterministic.result,
    operations: enrichedOperations,
    intents: enrichedOperations.some((operation) => operation.entity === "pet") &&
      !deterministic.result.intents.includes("update_pet")
      ? [...deterministic.result.intents, "update_pet"]
      : deterministic.result.intents,
    missing_fields: enrichedOperations.some((operation) =>
      operation.entity === "pet" &&
      Array.isArray(operation.weights_kg) &&
      (!Number.isInteger(operation.count) || operation.weights_kg.length >= operation.count),
    )
      ? deterministic.result.missing_fields.filter((field) => field !== "pet_weights_kg")
      : deterministic.result.missing_fields,
  };
  const yearlessDate = getYearlessDateClarification(sanitizedMessage);
  if (
    yearlessDate &&
    preliminaryResult.intents.includes("request_quote") &&
    !preliminaryResult.ambiguities.length
  ) {
    preliminaryResult = {
      ...preliminaryResult,
      ambiguities: [
        {
          code: "missing_exact_year",
          evidence: yearlessDate.evidence,
          question: yearlessDate.question,
        },
      ],
      confidence: 1,
    };
  }
  let semanticTurn = resolveSemanticTurn({
    message: sanitizedMessage,
    context,
    spans,
    deterministicResult: preliminaryResult,
    previousTopic,
  });
  if (
    semanticTurn.ast.turn_kind === "clarification" &&
    !preliminaryResult.ambiguities.length
  ) {
    const semanticClarifications = {
      missing_entity: "請問要調整目前情境中的哪一項資料？",
      missing_reference: "請問你指的是哪些項目呢？",
    };
    const code = Object.hasOwn(
      semanticClarifications,
      semanticTurn.ast.clarification_code,
    )
      ? semanticTurn.ast.clarification_code
      : "low_confidence";
    preliminaryResult = {
      ...preliminaryResult,
      intents: [],
      operations: [],
      ambiguities: [{
        code,
        evidence: sanitizedMessage.slice(0, 280) || "本輪訊息",
        question: semanticClarifications[code] ||
          "目前沒有可安全延續的報價情境，請提供完整條件或說明要調整的項目。",
      }],
      confidence: 0,
    };
  }
  if (
    semanticTurn.ast.turn_kind === "transactional" &&
    semanticTurn.ast.goal_ids.includes("request_quote") &&
    !preliminaryResult.intents.includes("request_quote")
  ) {
    preliminaryResult = {
      ...preliminaryResult,
      intents: [...preliminaryResult.intents, "request_quote"],
    };
  }
  preliminaryResult = validateStructuredTurnResult(
    {
      ...preliminaryResult,
      operations: semanticTurn.operations,
    },
    {
      message: sanitizedMessage,
      currentDate: dateInfo.currentDate,
    },
  );
  let dialogueState = classifyQuoteDialogueTurn({
    message: sanitizedMessage,
    context,
    result: preliminaryResult,
  });
  const currentScenario = normalizeConversationContext(context).quote_scenario;
  const pendingScenario = currentScenario || {
    scenario_id: String(sourceTurnId || "pending-quote").slice(0, 120),
    context_version: 0,
  };
  const slotFillTransaction = planPendingSlotFillTransaction({
    message: sanitizedMessage,
    spans,
    result: preliminaryResult,
    context,
    dialogueState,
    sourceTurnId,
    nowIso,
    scenario: pendingScenario,
  });
  if (["created", "updated", "stale", "duplicate"].includes(slotFillTransaction.status)) {
    preliminaryResult = {
      ...preliminaryResult,
      operations: [],
      ambiguities: [slotFillTransaction.ambiguity],
      confidence: 1,
    };
    dialogueState = {
      ...dialogueState,
      turn_type: slotFillTransaction.status === "created"
        ? "quote_patch"
        : "clarification_answer",
      quote_scope: "patch",
    };
  } else if (["completed", "direct_operation"].includes(slotFillTransaction.status)) {
    preliminaryResult = validateStructuredTurnResult(slotFillTransaction.result, {
      message: slotFillTransaction.evidence_message,
    });
    dialogueState = {
      ...dialogueState,
      turn_type: slotFillTransaction.status === "completed"
        ? "clarification_answer"
        : "correction",
      quote_scope: "patch",
    };
  }
  semanticTurn = resolveSemanticTurn({
    message: sanitizedMessage,
    context,
    spans,
    deterministicResult: preliminaryResult,
    previousTopic,
  });
  if (["completed", "direct_operation"].includes(slotFillTransaction.status)) {
    semanticTurn = {
      ...semanticTurn,
      ast: {
        ...semanticTurn.ast,
        turn_kind: "transactional",
        scenario_action: currentScenario ? "continue" : "new",
        clarification_code: null,
        confidence: 1,
      },
      operations: preliminaryResult.operations,
    };
  }
  const dialogueGoalPlan = planDialogueGoals({
    message: sanitizedMessage,
    spans,
    structuredResult: preliminaryResult,
    structuredPlan: dialogueState,
    semanticAst: semanticTurn.ast,
    context,
    slotFillTransaction,
  });
  if (["informational", "partial"].includes(dialogueGoalPlan.lane)) {
    preliminaryResult = validateStructuredTurnResult({
      ...preliminaryResult,
      intents: [],
      operations: [],
      missing_fields: [],
      ambiguities: [],
      confidence: 1,
    }, {
      message: sanitizedMessage,
      currentDate: dateInfo.currentDate,
    });
    dialogueState = {
      ...dialogueState,
      turn_type: "informational",
      quote_scope: null,
    };
  }
  const deterministicResult = dialogueState.quote_scope === "snapshot"
    ? {
        ...preliminaryResult,
        operations: normalizeQuoteSnapshotOperations(preliminaryResult.operations),
      }
    : preliminaryResult;
  const bypassCandidateCompilation = ["completed", "direct_operation"].includes(
    slotFillTransaction.status,
  ) || ["informational", "partial"].includes(dialogueGoalPlan.lane);
  const candidates = (bypassCandidateCompilation ? [] : deterministicResult.operations)
    .map((operation, index) =>
      compileOperationCandidate(operation, index, spans, currentState),
    )
    .filter(Boolean);
  const compilerFailures = bypassCandidateCompilation
    ? 0
    : deterministicResult.operations.length - candidates.length;
  const missingEntity =
    deterministicResult.ambiguities.some(
      (ambiguity) => ambiguity.code === "missing_entity",
    ) ||
    (
      ["created", "updated"].includes(slotFillTransaction.status) &&
      slotFillTransaction.pending?.partial_operation?.missing_slots?.includes(
        "entity",
      )
    );
  if (missingEntity && candidates.length === 0) {
    candidates.push(...compileMissingEntityCandidates(spans, candidates.length));
  }

  const groups = new Map();
  for (const candidate of candidates) {
    const entries = groups.get(candidate.selection_group) || [];
    entries.push(candidate);
    groups.set(candidate.selection_group, entries);
  }
  const hasAmbiguity = deterministicResult.ambiguities.length > 0;
  const hasMultipleCandidateGroup = [...groups.values()].some((entries) => entries.length > 1);
  const requestedActions = actionIdsFromIntents(deterministicResult.intents);
  let classification;
  if (["informational", "partial"].includes(dialogueGoalPlan.lane)) {
    classification = "INFORMATIONAL";
  } else if (hasAmbiguity || compilerFailures > 0) {
    classification = "SAFE_CLARIFICATION";
  } else if (candidates.length && hasMultipleCandidateGroup) {
    classification = "LLM_CANDIDATE_SELECTION";
  } else if (candidates.length) {
    classification = "DETERMINISTIC_EXPECTED";
  } else if (requestedActions.length || deterministicResult.intents.includes("policy_question")) {
    classification = "CONTEXT_ACTION_ONLY";
  } else {
    classification = "SAFE_CLARIFICATION";
  }

  if (missingEntity) classification = "SAFE_CLARIFICATION";
  if (
    dialogueState.turn_type === "confirmation" &&
    dialogueState.pending_confirmation_existed
  ) {
    classification = "CONTEXT_ACTION_ONLY";
  }
  if (["completed", "direct_operation"].includes(slotFillTransaction.status)) {
    classification = "DETERMINISTIC_EXPECTED";
  }

  return {
    conversation_id: String(conversationId || "").slice(0, 120),
    source_turn_id: String(sourceTurnId || "").slice(0, 120),
    sanitized_message: sanitizedMessage,
    current_date: /^\d{4}-\d{2}-\d{2}$/.test(String(dateInfo.currentDate || ""))
      ? String(dateInfo.currentDate)
      : "",
    timezone: "Asia/Taipei",
    previous_transaction_topic: [
      "booking",
      "booking_price",
      "booking_update",
      "pricing",
      "availability",
      "checkin_info",
      "checkout_info",
    ].includes(String(previousTopic || "").trim().toLowerCase())
      ? String(previousTopic).trim().toLowerCase()
      : "",
    current_state: currentState,
    pending_missing_fields: getPendingFields(context),
    spans,
    candidates,
    requested_actions: requestedActions,
    allowed_intent_ids: requestedActions,
    classification,
    deterministic_result: deterministicResult,
    dialogue_state: dialogueState,
    pending_scenario: pendingScenario,
    slot_fill_transaction: slotFillTransaction,
    dialogue_goal_plan: dialogueGoalPlan,
    intent_ast: semanticTurn.ast,
    semantic_capabilities: semanticTurn.capabilities.matches.map((entry) => ({
      capability_id: entry.capability_id,
      goal_id: entry.goal_id,
      canonical_faq_ids: entry.canonical_faq_ids,
      authoritative_source: entry.canonical_faq_ids.length
        ? "approved_faq"
        : entry.unknown_policy
          ? "none"
          : "deterministic_capability",
    })),
    deterministic_fast_path_used: semanticTurn.deterministic_fast_path_used,
    turn_type: dialogueState.turn_type,
    quote_scope: dialogueState.quote_scope,
    derived_checkout_used: deterministicResult.operations.some(
      (operation) =>
        operation.entity === "stay" &&
        Boolean(operation.check_in && operation.nights && !operation.check_out),
    ) || (
      dialogueState.quote_scope === "snapshot" &&
      deterministicResult.intents.includes("request_quote") &&
      deterministicResult.operations.some(
        (operation) =>
          operation.entity === "stay" &&
          Boolean(operation.check_in && !operation.check_out && !operation.nights),
      ) &&
      spans.filter((span) => span.normalized_type === "date").length === 1
    ),
    single_date_one_night_default_used:
      dialogueState.quote_scope === "snapshot" &&
      deterministicResult.intents.includes("request_quote") &&
      deterministicResult.operations.some(
        (operation) =>
          operation.entity === "stay" &&
          Boolean(operation.check_in && !operation.check_out && !operation.nights),
      ) &&
      spans.filter((span) => span.normalized_type === "date").length === 1,
    inherited_optional_addons_count: countInheritedOptionalAddons(
      context,
      dialogueState,
    ),
    compiler_failures: compilerFailures,
    requires_model: classification === "LLM_CANDIDATE_SELECTION",
  };
}

function readContextRef(currentState, ref) {
  if (!ref) return undefined;
  return ref.split(".").reduce((value, key) => value?.[key], currentState);
}

function valueFromBinding(binding, spansById, currentState) {
  let values;
  if (binding.source_kind === "context") {
    values = [readContextRef(currentState, binding.context_ref)];
  } else {
    values = binding.span_ids.map((spanId) => {
      const span = spansById.get(spanId);
      if (!span) throw new Error("structured_candidate_unknown_span_id");
      return span.normalized_value;
    });
  }
  if (binding.projection === "values") return values;
  if (binding.projection === "sum") {
    return values.reduce((total, value) => total + Number(value || 0), 0);
  }
  if (binding.projection === "cardinality") return values.length;
  return values[0];
}

export function materializeBookingTurnCandidate(candidate, plan) {
  const parsed = bookingTurnCandidateSchema.parse(candidate);
  const spansById = new Map(plan.spans.map((span) => [span.span_id, span]));
  const operation = {
    operation: parsed.operation,
    entity: parsed.entity,
  };
  for (const binding of parsed.bindings) {
    operation[binding.field] = valueFromBinding(
      binding,
      spansById,
      plan.current_state,
    );
  }
  operation.evidence = parsed.evidence_span_ids
    .map((spanId) => spansById.get(spanId)?.text)
    .filter(Boolean)
    .join("、")
    .slice(0, 280);
  return operation;
}

function legacyIntentsFor(plan, selectedCandidates, intentIds) {
  const intents = [];
  const add = (value) => {
    if (!intents.includes(value)) intents.push(value);
  };
  if (selectedCandidates.some((candidate) => ["adult", "child", "infant"].includes(candidate.entity))) {
    add("update_party");
  }
  if (selectedCandidates.some((candidate) => candidate.entity === "pet")) add("update_pet");
  if (selectedCandidates.some((candidate) => candidate.entity === "stay")) add("update_dates");
  if (selectedCandidates.some((candidate) => candidate.entity === "breakfast")) add("update_breakfast");
  if (intentIds.includes("request_quote")) add("request_quote");
  if (intentIds.includes("request_availability")) add("availability_request");
  if (intentIds.includes("ask_policy")) add("policy_question");
  return intents;
}

function candidateTouchedFields(candidate) {
  const fields = {
    stay: ["stay_type", "check_in", "check_out", "stay_nights", "pricing_day_type"],
    adult: ["adult_count", "guest_count"],
    child: ["child_count", "child_ages_years", "guest_count"],
    infant: ["infant_count", "guest_count"],
    pet: [
      "pet_count",
      "pet_type",
      "pet_weights_kg",
      "dog_under_10kg_count",
      "dog_10_to_20kg_count",
      "dog_over_20kg_count",
    ],
    breakfast: ["breakfast_count"],
  };
  return fields[candidate.entity] || [];
}

function storedSlotValue(context, field) {
  const value = context?.[field];
  if (Array.isArray(value)) return value.slice(0, 30);
  return value ?? null;
}

export function reduceBookingContextFromCandidates(
  currentContext,
  plan,
  selectedCandidateIds,
  {
    intentIds = plan.requested_actions,
    confidence = 1,
    nowIso = new Date().toISOString(),
    sourceTurnId = plan.source_turn_id,
  } = {},
) {
  const candidateById = new Map(plan.candidates.map((candidate) => [
    candidate.candidate_id,
    candidate,
  ]));
  const uniqueIds = [...new Set(selectedCandidateIds || [])];
  const selectedCandidates = uniqueIds.map((candidateId) => {
    const candidate = candidateById.get(candidateId);
    if (!candidate) throw new Error("structured_candidate_unknown_candidate_id");
    return bookingTurnCandidateSchema.parse(candidate);
  });
  const selectedGroups = new Set();
  for (const candidate of selectedCandidates) {
    if (selectedGroups.has(candidate.selection_group)) {
      throw new Error("structured_candidate_conflicting_selection_group");
    }
    selectedGroups.add(candidate.selection_group);
  }
  const operations = selectedCandidates.map((candidate) =>
    materializeBookingTurnCandidate(candidate, plan),
  );
  const result = validateStructuredTurnResult({
    intents: legacyIntentsFor(plan, selectedCandidates, intentIds),
    operations,
    missing_fields: plan.deterministic_result.missing_fields,
    ambiguities: [],
    confidence,
  }, {
    message: plan.sanitized_message,
    currentDate: plan.current_date,
  });
  const scopeBaseContext = buildQuoteScopeBaseContext(
    currentContext,
    plan.dialogue_state,
    sourceTurnId,
  );
  const reduction = reduceBookingContext(scopeBaseContext, result, {
    message: plan.sanitized_message,
    nowIso,
    sourceMessageId: sourceTurnId,
    currentDate: plan.current_date,
  });
  const reducedContext =
    plan.single_date_one_night_default_used &&
    reduction.context.check_in &&
    !reduction.context.check_out &&
    !reduction.context.stay_nights
      ? normalizeConversationContext({
          ...reduction.context,
          check_out: addIsoDays(reduction.context.check_in, 1),
          stay_nights: 1,
        })
      : reduction.context;
  const context = finalizeQuoteScenarioContext({
    previousContext: currentContext,
    context: reducedContext,
    dialogueState: plan.dialogue_state,
    sourceTurnId,
    changed: reduction.changed,
  });
  context.slot_meta = { ...(context.slot_meta || {}) };
  for (const candidate of selectedCandidates) {
    for (const field of candidateTouchedFields(candidate)) {
      context.slot_meta[field] = {
        source: "structured_candidate",
        ...(sourceTurnId
          ? {
              source_message_id: sourceTurnId,
              source_turn_id: sourceTurnId,
            }
          : {}),
        updated_at: nowIso,
        confidence,
        value: storedSlotValue(context, field),
        evidence_span_ids: [...candidate.evidence_span_ids],
        context_refs: [...candidate.context_refs],
      };
    }
  }
  const stored = getConversationContextForStorage(context);
  const changed =
    JSON.stringify(getConversationContextForStorage(currentContext)) !==
    JSON.stringify(stored);
  return {
    ...reduction,
    context: stored,
    changed,
    applied: true,
    reason: changed ? "operations_applied" : "no_context_change",
    after: toTypedBookingContext(stored, {
      quote: intentIds.includes("request_quote"),
      availability: intentIds.includes("request_availability"),
      policy_question: intentIds.includes("ask_policy"),
    }),
    turn_delta: {
      selected_candidate_ids: uniqueIds,
      candidates: selectedCandidates,
      operations,
    },
  };
}

function clarificationForPlan(plan, code = "") {
  const existing = plan.deterministic_result.ambiguities[0];
  const ambiguityCode = existing?.code || code || "low_confidence";
  const questions = {
    missing_entity: "請問是增加成人、兒童，還是狗狗呢？",
    missing_pet_context: "請問這個重量是狗狗的體重嗎？",
    missing_party_count: "請問調整後有幾位成人、兒童及幼兒呢？",
    missing_exact_year: "請問入住日期是哪一年？",
    ambiguous_stay_days: existing?.question || "請問要住幾晚呢？",
    missing_reference: "請問你指的是哪些項目呢？",
    conflicting_operations: "這次的調整有衝突，請告訴我最後要保留的數量。",
    unsupported_entity_value: "這項資料無法安全套用，請換一種方式說明。",
    low_confidence: "我還不確定這次要調整哪項訂房資料，可以再說明一次嗎？",
  };
  const question =
    plan.turn_type === "confirmation" &&
    !plan.dialogue_state?.pending_confirmation_existed
      ? "請問你指的是哪些項目呢？"
      : existing?.question || questions[ambiguityCode] || questions.low_confidence;
  return {
    code: ambiguityCode,
    evidence: existing?.evidence || plan.sanitized_message.slice(0, 280) || "本輪訊息",
    question,
  };
}

function blockedResult(plan, clarificationCode = "") {
  return validateStructuredTurnResult({
    intents: legacyIntentsFor(plan, [], plan.requested_actions),
    operations: [],
    missing_fields: plan.deterministic_result.missing_fields,
    ambiguities: [clarificationForPlan(plan, clarificationCode)],
    confidence: 0,
  }, { message: plan.sanitized_message });
}

function actionOnlyResult(plan) {
  return validateStructuredTurnResult({
    intents: legacyIntentsFor(plan, [], plan.requested_actions),
    operations: [],
    missing_fields: plan.deterministic_result.missing_fields,
    ambiguities: [],
    confidence: plan.deterministic_result.confidence,
  }, { message: plan.sanitized_message });
}

function unchangedReduction(context, result, reason) {
  const stored = getConversationContextForStorage(
    normalizeConversationContext(context),
  );
  const typed = toTypedBookingContext(stored);
  return {
    before: typed,
    operations: [],
    after: typed,
    context: stored,
    changed: false,
    applied: false,
    reason,
    turn_delta: {
      selected_candidate_ids: [],
      candidates: [],
      operations: [],
    },
  };
}

function pendingSlotFillReduction(context, result, plan) {
  const beforeContext = normalizeConversationContext(context);
  const transaction = plan.slot_fill_transaction;
  const keepsPending = ["created", "updated"].includes(transaction.status);
  const nextContext = getConversationContextForStorage({
    ...beforeContext,
    ...(keepsPending && !beforeContext.quote_scenario
      ? { quote_scenario: plan.pending_scenario }
      : {}),
    pending_interaction: keepsPending ? transaction.pending : null,
  });
  const changed =
    JSON.stringify(getConversationContextForStorage(beforeContext)) !==
    JSON.stringify(nextContext);
  return {
    before: toTypedBookingContext(beforeContext),
    operations: [],
    after: toTypedBookingContext(nextContext),
    context: nextContext,
    changed,
    applied: false,
    reason: `pending_slot_fill_${transaction.status}`,
    turn_delta: {
      selected_candidate_ids: [],
      candidates: [],
      operations: [],
    },
  };
}

function completedSlotFillReduction({
  context,
  result,
  plan,
  nowIso,
  sourceMessageId,
}) {
  const transaction = plan.slot_fill_transaction;
  const reduced = reduceBookingContext(context, result, {
    message: transaction.evidence_message,
    nowIso,
    sourceMessageId,
  });
  let nextContext = finalizeQuoteScenarioContext({
    previousContext: context,
    context: {
      ...reduced.context,
      pending_interaction: null,
    },
    dialogueState: { quote_scope: "patch" },
    sourceTurnId: sourceMessageId,
    changed: reduced.changed,
  });
  if (transaction.status === "completed" && nextContext.quote_scenario) {
    nextContext = normalizeConversationContext({
      ...nextContext,
      quote_scenario: {
        ...nextContext.quote_scenario,
        last_applied_transaction_id: transaction.transaction_id,
        last_applied_turn_id: sourceMessageId,
      },
    });
  }
  const stored = getConversationContextForStorage(nextContext);
  const changed =
    JSON.stringify(getConversationContextForStorage(context)) !==
    JSON.stringify(stored);
  return {
    ...reduced,
    context: stored,
    changed,
    applied: true,
    reason: `pending_slot_fill_${transaction.status}`,
    after: toTypedBookingContext(stored, { quote: true }),
    turn_delta: {
      selected_candidate_ids: [],
      candidates: [],
      operations: result.operations,
    },
  };
}

async function resolveActiveDialoguePlan({
  plan,
  previousContext,
  legacyContext,
  resolveCandidates,
  nowIso,
  sourceMessageId,
}) {
  let source = "semantic_intent_ast";
  let provider = null;
  let result;
  let selectedCandidateIds = [];
  let selectedCandidates = [];
  let operations = [];

  if (plan.classification === "INFORMATIONAL") {
    result = plan.deterministic_result;
    source = "semantic_informational";
  } else if (plan.classification === "SAFE_CLARIFICATION") {
    result = blockedResult(plan);
    source = ["created", "updated"].includes(plan.slot_fill_transaction.status)
      ? "semantic_pending_slot_fill"
      : "semantic_safe_clarification";
  } else if (
    ["completed", "direct_operation"].includes(
      plan.slot_fill_transaction.status,
    )
  ) {
    result = plan.deterministic_result;
    operations = result.operations;
    source =
      plan.slot_fill_transaction.status === "completed"
        ? "semantic_pending_resolved"
        : "semantic_direct_operation";
  } else if (plan.classification === "CONTEXT_ACTION_ONLY") {
    result = actionOnlyResult(plan);
    source = "semantic_context_action";
  } else {
    let intentIds = plan.requested_actions;
    let confidence = 1;
    if (plan.classification === "DETERMINISTIC_EXPECTED") {
      selectedCandidateIds = plan.candidates.map(
        (candidate) => candidate.candidate_id,
      );
      source = "semantic_deterministic_bindings";
    } else if (typeof resolveCandidates === "function") {
      try {
        const response = await resolveCandidates({ plan });
        selectedCandidateIds = response?.result?.selected_candidate_ids || [];
        intentIds = response?.result?.intent_ids || [];
        confidence = response?.result?.confidence ?? 0;
        provider = response?.metadata || null;
        if (response?.result?.clarification_code !== "none") {
          throw new Error(
            `structured_candidate_clarification:${response.result.clarification_code}`,
          );
        }
        source = "semantic_model_binding_selection";
      } catch (error) {
        result = blockedResult(plan, "low_confidence");
        provider = {
          called: true,
          validation_outcome: "rejected",
          failure_code: String(
            error?.structuredTurnFailureCode ||
              error?.providerErrorCode ||
              error?.message ||
              "structured_candidate_resolver_failed",
          ).slice(0, 120),
          provider_status: Number.isInteger(error?.providerStatus)
            ? error.providerStatus
            : null,
          latency_ms: Number(error?.structuredTurnLatencyMs || 0),
        };
        source = "semantic_model_rejected";
      }
    } else {
      result = blockedResult(plan, "low_confidence");
      source = "semantic_resolver_unavailable";
    }

    if (!result) {
      const candidateById = new Map(
        plan.candidates.map((candidate) => [candidate.candidate_id, candidate]),
      );
      const selectedGroups = new Set();
      selectedCandidates = [...new Set(selectedCandidateIds)].map((candidateId) => {
        const candidate = candidateById.get(candidateId);
        if (!candidate) {
          throw new Error("structured_candidate_unknown_candidate_id");
        }
        const parsed = bookingTurnCandidateSchema.parse(candidate);
        if (selectedGroups.has(parsed.selection_group)) {
          throw new Error("structured_candidate_conflicting_selection_group");
        }
        selectedGroups.add(parsed.selection_group);
        return parsed;
      });
      operations = selectedCandidates.map((candidate) =>
        materializeBookingTurnCandidate(candidate, plan),
      );
      result = validateStructuredTurnResult(
        {
          intents: legacyIntentsFor(plan, selectedCandidates, intentIds),
          operations,
          missing_fields: plan.deterministic_result.missing_fields,
          ambiguities: [],
          confidence,
        },
        {
          message: plan.sanitized_message,
          currentDate: plan.current_date,
        },
      );
    }
  }

  if (!operations.length) operations = result.operations;
  const reduction = applyScenarioTransition({
    context: previousContext,
    ast: plan.intent_ast,
    operations,
    result,
    plan,
    nowIso,
    sourceTurnId: sourceMessageId,
  });
  result = reduction.result || result;
  reduction.turn_delta = {
    selected_candidate_ids: selectedCandidateIds,
    candidates: selectedCandidates,
    operations: reduction.turn_delta.operations,
  };
  const transactional = isStructuredTransactionalResult(result);
  const comparison = compareStructuredAndLegacyContext(
    legacyContext,
    reduction.context,
  );

  return {
    mode: "active",
    source,
    requiresModel: plan.requires_model,
    classification: plan.classification,
    plan,
    current_state: plan.current_state,
    turn_delta: reduction.turn_delta,
    requested_actions: plan.requested_actions,
    result,
    reduction,
    comparison,
    provider,
    transactional,
    authoritative: transactional,
    blockedByAmbiguity: transactional && result.ambiguities.length > 0,
    context: reduction.context,
    changed: reduction.changed,
    hasContext: hasMeaningfulBookingContext(reduction.context),
  };
}

export async function resolveStructuredBookingTurnCandidatePipeline({
  mode,
  message,
  previousContext,
  legacyContext,
  conversationId = "",
  resolveCandidates = null,
  nowIso = new Date().toISOString(),
  sourceMessageId = "",
  dateInfo = {},
  previousTopic = "",
} = {}) {
  const normalizedMode = getStructuredTurnInterpreterMode(mode);
  const plan = compileBookingTurnCandidates({
    message,
    context: previousContext,
    conversationId,
    previousTopic,
    dateInfo,
    sourceTurnId: sourceMessageId,
    nowIso,
  });
  if (normalizedMode === "active") {
    return resolveActiveDialoguePlan({
      plan,
      previousContext,
      legacyContext,
      resolveCandidates,
      nowIso,
      sourceMessageId,
    });
  }
  let source = "candidate_compiler";
  let provider = null;
  let result;
  let reduction;

  if (normalizedMode === "legacy") {
    result = actionOnlyResult(plan);
    reduction = unchangedReduction(previousContext, result, "legacy_mode");
    source = "legacy";
  } else if (plan.classification === "INFORMATIONAL") {
    result = plan.deterministic_result;
    reduction = unchangedReduction(
      previousContext,
      result,
      "informational_goal",
    );
    source = "candidate_informational";
  } else if (plan.classification === "SAFE_CLARIFICATION") {
    result = blockedResult(plan);
    reduction = ["created", "updated", "stale", "duplicate"].includes(
      plan.slot_fill_transaction.status,
    )
      ? pendingSlotFillReduction(previousContext, result, plan)
      : unchangedReduction(previousContext, result, "ambiguity_blocked");
    source = ["created", "updated"].includes(plan.slot_fill_transaction.status)
      ? "candidate_pending_slot_fill"
      : "candidate_safe_clarification";
  } else if (["completed", "direct_operation"].includes(
    plan.slot_fill_transaction.status,
  )) {
    result = plan.deterministic_result;
    reduction = completedSlotFillReduction({
      context: previousContext,
      result,
      plan,
      nowIso,
      sourceMessageId,
    });
    source = plan.slot_fill_transaction.status === "completed"
      ? "candidate_pending_slot_fill_completed"
      : "candidate_direct_operation";
  } else if (plan.classification === "CONTEXT_ACTION_ONLY") {
    result = actionOnlyResult(plan);
    reduction = reduceBookingContext(previousContext, result, {
      message: plan.sanitized_message,
      nowIso,
      sourceMessageId,
    });
    reduction.turn_delta = {
      selected_candidate_ids: [],
      candidates: [],
      operations: [],
    };
    source = "candidate_action_only";
  } else {
    let selectedCandidateIds;
    let intentIds = plan.requested_actions;
    let confidence = 1;
    if (plan.classification === "DETERMINISTIC_EXPECTED") {
      selectedCandidateIds = plan.candidates.map((candidate) => candidate.candidate_id);
      source = "candidate_deterministic";
    } else if (typeof resolveCandidates === "function") {
      try {
        const response = await resolveCandidates({ plan });
        selectedCandidateIds = response?.result?.selected_candidate_ids || [];
        intentIds = response?.result?.intent_ids || [];
        confidence = response?.result?.confidence ?? 0;
        provider = response?.metadata || null;
        if (response?.result?.clarification_code !== "none") {
          throw new Error(`structured_candidate_clarification:${response.result.clarification_code}`);
        }
        source = "candidate_model_selection";
      } catch (error) {
        result = blockedResult(plan, "low_confidence");
        reduction = unchangedReduction(previousContext, result, "resolver_rejected");
        provider = {
          called: true,
          validation_outcome: "rejected",
          failure_code: String(
            error?.structuredTurnFailureCode ||
            error?.providerErrorCode ||
            error?.message ||
            "structured_candidate_resolver_failed",
          ).slice(0, 120),
          provider_status: Number.isInteger(error?.providerStatus)
            ? error.providerStatus
            : null,
          latency_ms: Number(error?.structuredTurnLatencyMs || 0),
        };
      }
    } else {
      result = blockedResult(plan, "low_confidence");
      reduction = unchangedReduction(previousContext, result, "resolver_unavailable");
      source = "candidate_safe_clarification";
    }

    if (!result) {
      reduction = reduceBookingContextFromCandidates(
        previousContext,
        plan,
        selectedCandidateIds,
        { intentIds, confidence, nowIso, sourceTurnId: sourceMessageId },
      );
      result = validateStructuredTurnResult({
        intents: legacyIntentsFor(
          plan,
          reduction.turn_delta.candidates,
          intentIds,
        ),
        operations: reduction.turn_delta.operations,
        missing_fields: plan.deterministic_result.missing_fields,
        ambiguities: [],
        confidence,
      }, {
        message: plan.sanitized_message,
        currentDate: plan.current_date,
      });
    }
  }

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
    requiresModel: plan.requires_model,
    classification: plan.classification,
    plan,
    current_state: plan.current_state,
    turn_delta: reduction.turn_delta,
    requested_actions: plan.requested_actions,
    result,
    reduction,
    comparison,
    provider,
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
