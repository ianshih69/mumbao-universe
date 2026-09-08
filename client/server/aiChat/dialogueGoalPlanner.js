import {
  baseBookingGuestCount,
  breakfastAddonUnitPrice,
  calculateBookingBreakfastFees,
  calculateBookingPetFees,
  childFeeUnitPrice,
} from "../bookingPricing/index.js";
import { normalizeConversationContext } from "./conversationContext.js";
import { loadFaqItems } from "./faqRetrieval.js";
import { buildOfficialPricingResolution } from "./lodgingPricing.js";
import { matchSemanticDialogueCapabilities } from "./dialogueCapabilities.js";

export const dialogueGoalTaxonomy = Object.freeze({
  informational: Object.freeze([
    "pet_eligibility_lookup",
    "pet_fee_lookup",
    "pet_deposit_lookup",
    "child_policy_lookup",
    "breakfast_info_lookup",
    "checkin_info",
    "checkout_info",
    "facility_policy_lookup",
    "payment_policy_lookup",
    "cancellation_policy_lookup",
    "transport_policy_lookup",
    "general_policy_lookup",
    "lodging_fee_lookup",
    "guest_count_lookup",
    "stay_duration_lookup",
  ]),
  transactional: Object.freeze([
    "quote_snapshot",
    "quote_patch_add",
    "quote_patch_replace",
    "quote_patch_remove",
    "request_quote",
    "request_availability",
  ]),
  dialogue: Object.freeze([
    "pending_slot_fill",
    "confirmation",
    "correction",
    "clarification",
    "unrelated",
    "true_knowledge_gap",
  ]),
});

const contextualFaqIds = Object.freeze({
  checkin_info: ["faq-076"],
  checkout_info: ["faq-077"],
});

function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function formatMoney(value) {
  return `TWD ${Number(value || 0).toLocaleString("en-US")}`;
}

function formatChineseCount(value, classifier) {
  const labels = [
    "零",
    "一",
    "兩",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
  ];
  const count = Number(value || 0);
  return `${labels[count] || count}${classifier}`;
}

function valuesForSpanType(spans, type) {
  return (spans || [])
    .filter(span => span.normalized_type === type)
    .map(span => span.normalized_value);
}

function firstInteger(values) {
  return values.find(value => Number.isInteger(value) && value >= 0) ?? null;
}

function extractGoalSlots(spans) {
  const weights = valuesForSpanType(spans, "pet_weight")
    .map(Number)
    .filter(weight => Number.isFinite(weight) && weight > 0);
  const petCounts = valuesForSpanType(spans, "pet_count")
    .map(Number)
    .filter(count => Number.isInteger(count) && count >= 0);
  return {
    pet_species: valuesForSpanType(spans, "pet_type")[0] || null,
    pet_weights_kg: weights,
    pet_count:
      petCounts.length || weights.length
        ? Math.max(weights.length, ...petCounts)
        : null,
    adult_count: firstInteger(valuesForSpanType(spans, "adult_count")),
    child_count: firstInteger(valuesForSpanType(spans, "child_count")),
    child_ages_years: valuesForSpanType(spans, "age").map(Number),
    breakfast_count: firstInteger(valuesForSpanType(spans, "breakfast_count")),
    nights: firstInteger(valuesForSpanType(spans, "nights")),
    dates: valuesForSpanType(spans, "date"),
    date_type: valuesForSpanType(spans, "date_type")[0] || null,
    operation_cues: valuesForSpanType(spans, "operation_cue"),
    action_cues: valuesForSpanType(spans, "action_cue"),
  };
}

function hasKnownPetEntity(text, slots) {
  return Boolean(
    slots.pet_species ||
    slots.pet_weights_kg.length ||
    slots.pet_count !== null ||
    /狗|犬|寵物|毛孩/.test(text)
  );
}

function facilityFaqIds(text) {
  const mappings = [
    [/泳池|戲水/, "faq-363"],
    [/廚房|煮飯|料理|烹煮/, "faq-178"],
    [/停車/, "faq-104"],
    [/ktv|唱歌/, "faq-326"],
    [/烤肉|炭火/, "faq-311"],
    [/麻將/, "faq-331"],
  ];
  return unique(
    mappings.filter(([pattern]) => pattern.test(text)).map(([, faqId]) => faqId)
  );
}

function paymentFaqIds(text) {
  if (/刷卡|信用卡/.test(text)) return ["faq-035"];
  if (/現金/.test(text)) return ["faq-037"];
  if (/行動支付/.test(text)) return ["faq-038"];
  if (/匯款|轉帳|付款/.test(text)) return ["faq-036"];
  return [];
}

function transportFaqIds(text) {
  if (/接駁/.test(text)) return ["faq-113"];
  if (/火車|車站|交通|怎麼去|怎麼到/.test(text)) return ["faq-110"];
  return [];
}

function detectInformationalGoals(message, slots) {
  const text = compact(message);
  const goals = [];
  const faqIds = [];
  const hasPet = hasKnownPetEntity(text, slots);
  const semanticCapabilities = matchSemanticDialogueCapabilities(message);

  if (semanticCapabilities.unknown_policy) {
    return {
      goal_ids: ["true_knowledge_gap"],
      canonical_faq_ids: [],
      unknown_policy: true,
      capability_ids: semanticCapabilities.matches.map(
        (entry) => entry.capability_id,
      ),
    };
  }

  const bareWeightedPet = Boolean(
    slots.pet_weights_kg.length &&
      semanticCapabilities.primary?.capability_id === "pet_eligibility_policy",
  );
  if (semanticCapabilities.primary && !bareWeightedPet) {
    return {
      goal_ids: semanticCapabilities.goal_ids,
      canonical_faq_ids: semanticCapabilities.canonical_faq_ids,
      unknown_policy: false,
      capability_ids: semanticCapabilities.matches.map(
        (entry) => entry.capability_id,
      ),
    };
  }

  if (/行李/.test(text) && /宅配|寄送|代收|先送/.test(text)) {
    return {
      goal_ids: ["true_knowledge_gap"],
      canonical_faq_ids: [],
      unknown_policy: true,
    };
  }

  if (hasPet) {
    goals.push("pet_eligibility_lookup");
    if (slots.pet_weights_kg.length || /費用|多少|價格|公斤|kg/.test(text)) {
      goals.push("pet_fee_lookup");
    }
    if (/押金/.test(text) || slots.pet_weights_kg.length) {
      goals.push("pet_deposit_lookup");
    }
  }
  if (/早餐/.test(text)) {
    goals.push("breakfast_info_lookup");
    faqIds.push("faq-204");
  }
  if (/退房|checkout|check-out/.test(text)) {
    goals.push("checkout_info");
    faqIds.push("faq-077");
  } else if (/入住|checkin|check-in/.test(text)) {
    goals.push("checkin_info");
    faqIds.push("faq-076");
  }
  if (
    slots.child_count !== null ||
    slots.child_ages_years.length ||
    /兒童|小孩|幼兒|嬰兒/.test(text)
  ) {
    goals.push("child_policy_lookup");
    faqIds.push("faq-030");
  }

  const facilities = facilityFaqIds(text);
  if (facilities.length) {
    goals.push("facility_policy_lookup");
    faqIds.push(...facilities);
  }
  const payments = paymentFaqIds(text);
  if (payments.length) {
    goals.push("payment_policy_lookup");
    faqIds.push(...payments);
  }
  if (/取消|退款|退訂/.test(text)) {
    goals.push("cancellation_policy_lookup");
    faqIds.push("faq-051");
  }
  const transport = transportFaqIds(text);
  if (transport.length) {
    goals.push("transport_policy_lookup");
    faqIds.push(...transport);
  }
  if (slots.adult_count !== null) goals.push("guest_count_lookup");
  if (slots.nights !== null || slots.date_type || slots.dates.length) {
    goals.push("stay_duration_lookup");
  }

  return {
    goal_ids: unique(goals),
    canonical_faq_ids: unique(faqIds),
    unknown_policy: false,
  };
}

function goalCapability(goalId) {
  return dialogueCapabilityRegistry[goalId] || null;
}

function capabilitiesForGoals(goalIds) {
  return unique(goalIds.map(goalId => goalCapability(goalId)?.goal_id))
    .map(goalCapability)
    .filter(Boolean);
}

function primaryGoal(goalIds) {
  const priority = [
    "pet_fee_lookup",
    "lodging_fee_lookup",
    "breakfast_info_lookup",
    "checkout_info",
    "checkin_info",
    "facility_policy_lookup",
    "child_policy_lookup",
    "payment_policy_lookup",
    "cancellation_policy_lookup",
    "transport_policy_lookup",
    "pet_deposit_lookup",
    "pet_eligibility_lookup",
    "request_quote",
    "request_availability",
  ];
  return (
    priority.find(goalId => goalIds.includes(goalId)) ||
    goalIds[0] ||
    "unrelated"
  );
}

export function planDialogueGoals({
  message,
  spans = [],
  structuredResult = null,
  structuredPlan = null,
  semanticAst = null,
  context = null,
  slotFillTransaction = null,
} = {}) {
  const state = normalizeConversationContext(context);
  const slots = extractGoalSlots(spans);
  const informational = detectInformationalGoals(message, slots);
  const explicitOperations = unique(slots.operation_cues).filter(operation =>
    ["set", "add", "remove", "replace", "clear"].includes(operation)
  );
  const transactionStatus = slotFillTransaction?.status || "none";
  const hasActivePending = state.pending_interaction?.type === "slot_fill";
  const intents = structuredResult?.intents || [];
  const requestQuote = intents.includes("request_quote");
  const currentRequestQuote = slots.action_cues.includes("request_quote");
  const currentRequestAvailability = slots.action_cues.includes(
    "request_availability"
  );
  const completeSnapshot =
    structuredPlan?.turn_type === "quote_snapshot" &&
    structuredResult?.operations?.some(
      operation => operation.entity === "stay" && operation.check_in
    ) &&
    structuredResult?.operations?.some(
      operation => operation.entity === "adult"
    );

  if (completeSnapshot) {
    return buildGoalPlan({
      lane: "transactional",
      goalIds: ["quote_snapshot", "request_quote"],
      responseKind: "transactional_quote",
      mutatesContext: true,
      reason: "complete_quote_snapshot",
      slots,
    });
  }
  if (structuredPlan?.turn_type === "confirmation") {
    return buildGoalPlan({
      lane: "dialogue",
      goalIds: ["confirmation"],
      responseKind: "confirmation",
      mutatesContext: true,
      reason: structuredPlan.pending_confirmation_current
        ? "active_confirmation_protocol"
        : "confirmation_without_active_proposal",
      slots,
    });
  }
  if (
    semanticAst?.turn_kind === "informational" &&
    semanticAst.goal_ids.length > 0 &&
    (
      !currentRequestQuote ||
      semanticAst.goal_ids.some((goalId) =>
        [
          "general_policy_lookup",
          "true_knowledge_gap",
          "checkin_info",
          "checkout_info",
        ].includes(goalId),
      )
    )
  ) {
    const goalIds = informational.unknown_policy
      ? ["true_knowledge_gap"]
      : informational.goal_ids.length
        ? informational.goal_ids
        : semanticAst.goal_ids;
    return buildGoalPlan({
      lane: informational.unknown_policy ? "knowledge" : "informational",
      goalIds,
      responseKind: informational.unknown_policy
        ? "knowledge_gap"
        : "informational_answer",
      mutatesContext: false,
      reason: informational.unknown_policy
        ? "no_approved_policy_capability"
        : "validated_semantic_information_intent",
      slots,
      canonicalFaqIds: informational.canonical_faq_ids.length
        ? informational.canonical_faq_ids
        : unique(
            semanticAst.goal_ids.flatMap(
              (goalId) => contextualFaqIds[goalId] || [],
            ),
          ),
      canAnswerPartially: !informational.unknown_policy,
    });
  }
  if (["completed", "direct_operation"].includes(transactionStatus)) {
    const operation = slotFillTransaction?.partial_operation?.operation;
    return buildGoalPlan({
      lane: "transactional",
      goalIds: [
        operation === "add"
          ? "quote_patch_add"
          : operation === "remove"
            ? "quote_patch_remove"
            : "quote_patch_replace",
        "request_quote",
      ],
      responseKind: "transactional_quote",
      mutatesContext: true,
      reason: "pending_transaction_completed",
      slots,
    });
  }
  if (
    hasActivePending ||
    ["created", "updated", "stale", "duplicate"].includes(transactionStatus)
  ) {
    return buildGoalPlan({
      lane: "dialogue",
      goalIds: ["pending_slot_fill"],
      responseKind: "clarification",
      mutatesContext: ["created", "updated"].includes(transactionStatus),
      reason: `pending_slot_fill_${transactionStatus}`,
      slots,
    });
  }
  if ((structuredResult?.ambiguities || []).length) {
    return buildGoalPlan({
      lane: "dialogue",
      goalIds: ["clarification"],
      responseKind: "clarification",
      mutatesContext: false,
      reason: "structured_ambiguity",
      slots,
    });
  }
  if (
    semanticAst?.turn_kind === "transactional" &&
    (structuredResult?.operations || []).length
  ) {
    const operations = structuredResult.operations;
    const mutation = operations.find((operation) =>
      ["add", "remove", "replace", "clear"].includes(operation.operation),
    );
    const goalId =
      semanticAst.scenario_action === "new"
        ? "quote_snapshot"
        : mutation?.operation === "add"
          ? "quote_patch_add"
          : mutation && ["remove", "clear"].includes(mutation.operation)
            ? "quote_patch_remove"
            : "quote_patch_replace";
    return buildGoalPlan({
      lane: "transactional",
      goalIds: [goalId, "request_quote"],
      responseKind: "transactional_quote",
      mutatesContext: true,
      reason: "validated_semantic_intent_ast",
      slots,
    });
  }
  if (
    semanticAst?.turn_kind === "transactional" &&
    semanticAst.goal_ids.includes("request_quote") &&
    state.quote_scenario
  ) {
    return buildGoalPlan({
      lane: "transactional",
      goalIds: ["request_quote"],
      responseKind: "transactional_quote",
      mutatesContext: false,
      reason: "validated_semantic_scenario_resume",
      slots,
    });
  }
  const structuredMutation = (structuredResult?.operations || []).find(
    operation =>
      ["add", "remove", "replace", "clear"].includes(operation.operation)
  );
  if (structuredMutation) {
    return buildGoalPlan({
      lane: "transactional",
      goalIds: [
        structuredMutation.operation === "add"
          ? "quote_patch_add"
          : structuredMutation.operation === "remove" ||
              structuredMutation.operation === "clear"
            ? "quote_patch_remove"
            : "quote_patch_replace",
        ...(requestQuote ? ["request_quote"] : []),
      ],
      responseKind: requestQuote
        ? "transactional_quote"
        : "transactional_update",
      mutatesContext: true,
      reason: "validated_structured_transaction_operation",
      slots,
    });
  }
  if (
    explicitOperations.length &&
    semanticAst?.turn_kind !== "informational"
  ) {
    const operation = explicitOperations[0];
    return buildGoalPlan({
      lane: "transactional",
      goalIds: [
        operation === "add"
          ? "quote_patch_add"
          : operation === "remove"
            ? "quote_patch_remove"
            : operation === "replace"
              ? "quote_patch_replace"
              : requestQuote
                ? "quote_snapshot"
                : "correction",
        ...(requestQuote ? ["request_quote"] : []),
      ],
      responseKind: requestQuote
        ? "transactional_quote"
        : "transactional_update",
      mutatesContext: true,
      reason: "explicit_transaction_operation",
      slots,
    });
  }

  const hasPet = hasKnownPetEntity(compact(message), slots);
  const hasLodgingSubject = /包棟|整棟|房價|住宿費/.test(compact(message));
  const partialQuote =
    currentRequestQuote &&
    (slots.adult_count !== null || hasLodgingSubject) &&
    !(slots.dates.length || slots.date_type);
  if (partialQuote) {
    const goalIds = unique([
      "request_quote",
      slots.adult_count !== null ? "guest_count_lookup" : null,
      hasPet ? "pet_fee_lookup" : null,
    ]);
    return buildGoalPlan({
      lane: "partial",
      goalIds,
      responseKind: "partial_answer",
      mutatesContext: false,
      reason: "answerable_partial_quote",
      slots,
      canAnswerPartially: true,
    });
  }

  const lodgingFragment =
    slots.adult_count !== null &&
    Boolean(slots.date_type || slots.dates.length) &&
    !hasPet;
  if (lodgingFragment) {
    return buildGoalPlan({
      lane: "informational",
      goalIds: ["lodging_fee_lookup"],
      responseKind: "informational_answer",
      mutatesContext: false,
      reason: "implicit_lodging_fee_request",
      slots,
      canAnswerPartially: true,
    });
  }

  if (informational.unknown_policy) {
    return buildGoalPlan({
      lane: "knowledge",
      goalIds: ["true_knowledge_gap"],
      responseKind: "knowledge_gap",
      mutatesContext: false,
      reason: "no_approved_policy_capability",
      slots,
    });
  }
  if (informational.goal_ids.length) {
    return buildGoalPlan({
      lane: "informational",
      goalIds: informational.goal_ids,
      responseKind: "informational_answer",
      mutatesContext: false,
      reason: "implicit_information_request",
      slots,
      canonicalFaqIds: informational.canonical_faq_ids,
      canAnswerPartially: true,
    });
  }
  if (currentRequestAvailability || currentRequestQuote) {
    return buildGoalPlan({
      lane: "transactional",
      goalIds: [
        currentRequestAvailability ? "request_availability" : "request_quote",
      ],
      responseKind: "action_request",
      mutatesContext: true,
      reason: "explicit_action_request",
      slots,
    });
  }
  return buildGoalPlan({
    lane: "knowledge",
    goalIds: ["unrelated"],
    responseKind: "knowledge_candidate",
    mutatesContext: false,
    reason: "delegate_to_approved_knowledge",
    slots,
  });
}

function buildGoalPlan({
  lane,
  goalIds,
  responseKind,
  mutatesContext,
  reason,
  slots,
  canonicalFaqIds = [],
  canAnswerPartially = false,
}) {
  const normalizedGoalIds = unique(goalIds);
  return {
    lane,
    goal_ids: normalizedGoalIds,
    primary_goal_id: primaryGoal(normalizedGoalIds),
    response_kind: responseKind,
    response_authority: ["informational", "partial"].includes(lane)
      ? "dialogue_goal_planner"
      : lane === "transactional"
        ? "transaction_executor"
        : lane === "dialogue"
          ? "dialogue_protocol"
          : "knowledge_router",
    mutates_context: Boolean(mutatesContext),
    can_answer_partially: Boolean(canAnswerPartially),
    reason,
    slots,
    canonical_faq_ids: unique(canonicalFaqIds),
    capabilities: capabilitiesForGoals(normalizedGoalIds).map(capability => ({
      goal_id: capability.goal_id,
      authoritative_source: capability.authoritative_source,
      mutates_context: capability.mutates_context,
      can_answer_partially: capability.can_answer_partially,
      response_profile: capability.response_profile,
    })),
  };
}

async function approvedFaqAnswer(faqIds) {
  if (!faqIds?.length) return "";
  const faqItems = await loadFaqItems();
  const itemById = new Map(faqItems.map(item => [item.id, item]));
  return (
    faqIds
      .map(faqId => itemById.get(faqId)?.answer)
      .find(answer => String(answer || "").trim()) || ""
  );
}

function dogCountsFromWeights(weights) {
  return weights.reduce(
    (counts, weight) => {
      if (weight <= 10) counts.dogUnder10kgCount += 1;
      else if (weight <= 20) counts.dog10To20kgCount += 1;
      else counts.dogOver20kgCount += 1;
      return counts;
    },
    { dogUnder10kgCount: 0, dog10To20kgCount: 0, dogOver20kgCount: 0 }
  );
}

async function handlePetInformation(goalPlan) {
  const weights = goalPlan.slots.pet_weights_kg;
  const nights = Math.max(1, Number(goalPlan.slots.nights || 1));
  const wantsFee = goalPlan.goal_ids.includes("pet_fee_lookup");
  const wantsDeposit = goalPlan.goal_ids.includes("pet_deposit_lookup");
  const policyPlan = calculateBookingPetFees({
    dogUnder10kgCount: 1,
    nights,
  });
  if (!wantsFee || !weights.length) {
    if (wantsDeposit && !wantsFee) {
      return `狗狗可以入住，另收每棟可退寵物押金 ${formatMoney(
        policyPlan.petDepositAmount
      )}。`;
    }
    return `狗狗可以入住；住宿費依每隻體重計算，另收每棟可退寵物押金 ${formatMoney(
      policyPlan.petDepositAmount
    )}。請提供每隻狗狗體重。`;
  }

  const plan = calculateBookingPetFees({
    ...dogCountsFromWeights(weights),
    nights,
  });
  if (weights.length === 1 && nights === 1) {
    return `可以入住，${weights[0]}公斤狗狗每隻每晚 ${formatMoney(
      plan.nightlyPetFeeAmount
    )}；另收每棟可退寵物押金 ${formatMoney(plan.petDepositAmount)}。`;
  }
  if (nights === 1) {
    return `可以入住，${formatChineseCount(
      weights.length,
      "隻"
    )}狗狗住宿費每晚共 ${formatMoney(
      plan.nightlyPetFeeAmount
    )}；另收每棟可退寵物押金 ${formatMoney(plan.petDepositAmount)}。`;
  }
  const weightLabel =
    weights.length === 1 ? `${weights[0]}公斤狗狗` : `${weights.length}隻狗狗`;
  return `可以入住，${weightLabel}住${formatChineseCount(
    nights,
    "晚"
  )}住宿費共 ${formatMoney(plan.petFeeTotal)}；另收每棟可退寵物押金 ${formatMoney(
    plan.petDepositAmount
  )}。要計算完整包棟價格，請再提供入住日期與人數。`;
}

async function handleBreakfastInformation(goalPlan) {
  const quantity = goalPlan.slots.breakfast_count;
  if (Number.isInteger(quantity) && quantity > 0) {
    const breakfast = calculateBookingBreakfastFees(quantity);
    return `早餐${quantity}份共 ${formatMoney(
      breakfast.total
    )}，預計約 08:30 送至餐桌。`;
  }
  return `早餐為加購代訂服務，每份 ${formatMoney(
    breakfastAddonUnitPrice
  )}，預計約 08:30 送至餐桌。`;
}

async function handleChildPolicy() {
  return `成人與滿4歲至未滿13歲兒童共用基本${baseBookingGuestCount}位名額，合計超過基本名額後，超額不佔床兒童每位每晚 ${formatMoney(
    childFeeUnitPrice
  )}。未滿4歲不佔床免費且不設免費名額上限；滿13歲按成人計價。`;
}

async function handleLodgingInformation(goalPlan, options) {
  const adults = goalPlan.slots.adult_count;
  const dateType = goalPlan.slots.date_type;
  const nights = Math.max(1, Number(goalPlan.slots.nights || 1));
  if (!Number.isInteger(adults) || !dateType) {
    return "要計算包棟價格，請提供入住日期、晚數與入住人數。";
  }
  const pricing = await buildOfficialPricingResolution(
    {
      stay_type: "villa",
      adult_count: adults,
      child_count: 0,
      infant_count: 0,
      pet_count: 0,
      breakfast_count: 0,
      pricing_day_type: dateType,
      stay_nights: nights,
    },
    options?.pricing_options || {}
  );
  if (pricing.lodging_price?.status !== "resolved") {
    return "包棟價格需要有效日期或日期類型；請提供入住日期與晚數。";
  }
  const dayLabel = { weekday: "平日", friday: "週五", holiday: "假日" }[
    dateType
  ];
  return `${adults}位成人${dayLabel}包棟${formatChineseCount(
    nights,
    "晚"
  )} ${formatMoney(pricing.total_amount)}。`;
}

async function handlePartialQuote(goalPlan) {
  const hasPet = goalPlan.goal_ids.includes("pet_fee_lookup");
  const missing = [];
  if (!(goalPlan.slots.dates.length || goalPlan.slots.date_type)) {
    missing.push("入住日期或日期類型");
  }
  if (!goalPlan.slots.nights) missing.push("住宿晚數");
  if (hasPet && !goalPlan.slots.pet_weights_kg.length) {
    missing.push("每隻狗狗體重");
  }
  if (goalPlan.slots.adult_count === null) missing.push("入住人數");
  if (hasPet) {
    return `包棟價格還需要入住日期與晚數；狗狗費則依體重計算。請提供${unique(
      missing
    ).join("、")}。`;
  }
  return `要計算包棟價格，請提供${unique(missing).join("、")}。`;
}

async function handleApprovedFaq(goalPlan) {
  return approvedFaqAnswer(goalPlan.canonical_faq_ids);
}

function capability(definition) {
  return Object.freeze({
    required_entities: [],
    required_slots: [],
    optional_slots: [],
    compatible_goal_ids: [],
    ...definition,
  });
}

export const dialogueCapabilityRegistry = Object.freeze(
  Object.fromEntries(
    [
      capability({
        goal_id: "pet_eligibility_lookup",
        handler: handlePetInformation,
        authoritative_source: "approved FAQ faq-226",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "concise_policy",
        required_entities: ["pet"],
        required_slots: ["pet_species"],
        optional_slots: ["pet_weights_kg", "nights"],
        compatible_goal_ids: ["pet_fee_lookup", "pet_deposit_lookup"],
      }),
      capability({
        goal_id: "pet_fee_lookup",
        handler: handlePetInformation,
        authoritative_source: "bookingPricing.calculateBookingPetFees",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "concise_price",
        required_entities: ["pet"],
        required_slots: ["pet_weights_kg"],
        optional_slots: ["nights"],
        compatible_goal_ids: ["pet_eligibility_lookup", "pet_deposit_lookup"],
      }),
      capability({
        goal_id: "pet_deposit_lookup",
        handler: handlePetInformation,
        authoritative_source: "bookingPricing.calculateBookingPetFees",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "concise_policy",
        required_entities: ["pet"],
        compatible_goal_ids: ["pet_eligibility_lookup", "pet_fee_lookup"],
      }),
      capability({
        goal_id: "breakfast_info_lookup",
        handler: handleBreakfastInformation,
        authoritative_source:
          "bookingPricing.breakfastAddonUnitPrice + approved FAQ faq-204",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "concise_policy",
        required_entities: ["breakfast"],
        optional_slots: ["breakfast_count"],
      }),
      capability({
        goal_id: "lodging_fee_lookup",
        handler: handleLodgingInformation,
        authoritative_source: "bookingPricing.calculateBookingQuoteForDayTypes",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "concise_price",
        required_slots: ["adult_count", "date_type"],
        optional_slots: ["nights"],
      }),
      capability({
        goal_id: "request_quote",
        handler: handlePartialQuote,
        authoritative_source: "bookingPricing",
        mutates_context: true,
        can_answer_partially: true,
        response_profile: "partial_answer",
        compatible_goal_ids: [
          "pet_fee_lookup",
          "guest_count_lookup",
          "stay_duration_lookup",
        ],
      }),
      capability({
        goal_id: "child_policy_lookup",
        handler: handleChildPolicy,
        authoritative_source:
          "bookingPricing.childFeeUnitPrice + approved FAQ faq-030",
        mutates_context: false,
        can_answer_partially: false,
        response_profile: "concise_policy",
        required_entities: ["child"],
        optional_slots: ["child_count", "child_ages_years"],
      }),
      ...[
        ["checkin_info", "approved FAQ faq-076"],
        ["checkout_info", "approved FAQ faq-077"],
        ["facility_policy_lookup", "approved FAQ catalog"],
        ["payment_policy_lookup", "approved FAQ catalog"],
        ["cancellation_policy_lookup", "approved FAQ faq-051"],
        ["transport_policy_lookup", "approved FAQ catalog"],
        ["general_policy_lookup", "approved FAQ catalog"],
      ].map(([goal_id, authoritative_source]) =>
        capability({
          goal_id,
          handler: handleApprovedFaq,
          authoritative_source,
          mutates_context: false,
          can_answer_partially: false,
          response_profile: "concise_policy",
        })
      ),
      capability({
        goal_id: "guest_count_lookup",
        handler: handlePartialQuote,
        authoritative_source: "bookingPricing",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "partial_answer",
        required_slots: ["adult_count"],
      }),
      capability({
        goal_id: "stay_duration_lookup",
        handler: handlePartialQuote,
        authoritative_source: "bookingPricing",
        mutates_context: false,
        can_answer_partially: true,
        response_profile: "partial_answer",
        optional_slots: ["dates", "date_type", "nights"],
      }),
      ...dialogueGoalTaxonomy.transactional
        .filter(goal_id => goal_id !== "request_quote")
        .map(goal_id =>
          capability({
            goal_id,
            handler: null,
            authoritative_source: "structured transaction executor",
            mutates_context: true,
            can_answer_partially: false,
            response_profile: "transactional",
          })
        ),
      ...dialogueGoalTaxonomy.dialogue.map(goal_id =>
        capability({
          goal_id,
          handler: null,
          authoritative_source: "dialogue protocol",
          mutates_context: false,
          can_answer_partially: false,
          response_profile: "dialogue",
        })
      ),
    ].map(entry => [entry.goal_id, entry])
  )
);

function buildCapabilityRoute(goalPlan, answer, { collectInfo = false } = {}) {
  return {
    route: collectInfo ? "faq_collect_info" : "structured_informational",
    providerUsed: "dialogue_goal_planner",
    answer,
    notice: answer,
    answerMode: collectInfo ? "collect_info" : "direct",
    shouldCallDeepSeek: false,
    shouldMarkNeedsHuman: false,
    knowledgeGap: false,
    aiSkipped: true,
    reason: goalPlan.reason,
    matchedFaqItems: [],
    matchedFaqIds: goalPlan.canonical_faq_ids,
    semanticMetadata: {
      dialogue_lane: goalPlan.lane,
      dialogue_goal_ids: goalPlan.goal_ids,
      dialogue_primary_goal: goalPlan.primary_goal_id,
      response_authority: "dialogue_goal_planner",
      answerability: goalPlan.lane === "partial" ? "partial" : "complete",
      context_mutation_allowed: false,
      authoritative_sources: goalPlan.capabilities.map(
        capabilityEntry => capabilityEntry.authoritative_source
      ),
      transactional_response_kind: goalPlan.response_kind,
    },
  };
}

export async function executeDialogueGoalPlan(goalPlan, options = {}) {
  if (!["informational", "partial"].includes(goalPlan?.lane)) return null;
  const capabilityEntry =
    goalPlan.lane === "partial"
      ? goalCapability("request_quote")
      : goalCapability(goalPlan.primary_goal_id);
  const answer = capabilityEntry?.handler
    ? await capabilityEntry.handler(goalPlan, options)
    : "";
  if (!String(answer || "").trim()) return null;
  return buildCapabilityRoute(goalPlan, answer, {
    collectInfo: goalPlan.lane === "partial" || /請提供/.test(answer),
  });
}

function isApprovedKnowledgeAnswer(routeResult) {
  return Boolean(
    ["faq_direct", "faq_collect_info", "ask_human"].includes(
      routeResult?.route
    ) &&
      (routeResult?.topCandidate?.id || routeResult?.matchedFaqIds?.length)
  );
}

function plannerHasMoreSpecificAuthority(goalPlan) {
  if (!goalPlan) return false;
  if (goalPlan.lane === "partial") return true;
  if (goalPlan.lane === "transactional") {
    return goalPlan.reason !== "explicit_action_request";
  }
  if (goalPlan.lane !== "informational") return false;
  if (goalPlan.primary_goal_id === "lodging_fee_lookup") return true;
  if (
    goalPlan.primary_goal_id === "pet_fee_lookup" &&
    goalPlan.slots?.pet_weights_kg?.length
  ) {
    return true;
  }
  return Boolean(
    goalPlan.primary_goal_id === "breakfast_info_lookup" &&
      Number.isInteger(goalPlan.slots?.breakfast_count) &&
      goalPlan.slots.breakfast_count > 0
  );
}

export function selectDialogueResponseAuthority({
  goalPlan,
  structuredResolution,
  routeResult,
} = {}) {
  if (!structuredResolution) {
    return {
      authority: "legacy_router",
      execute_transaction: true,
      allow_context_mutation: true,
    };
  }
  if (goalPlan?.goal_ids?.includes("confirmation")) {
    return {
      authority: "dialogue_protocol",
      execute_transaction: true,
      allow_context_mutation: true,
    };
  }
  if (
    isApprovedKnowledgeAnswer(routeResult) &&
    !plannerHasMoreSpecificAuthority(goalPlan)
  ) {
    return {
      authority: "knowledge_router",
      execute_transaction: false,
      allow_context_mutation: false,
    };
  }
  if (["informational", "partial"].includes(goalPlan?.lane)) {
    return {
      authority: "dialogue_goal_planner",
      execute_transaction: false,
      allow_context_mutation: false,
    };
  }
  if (
    structuredResolution?.blockedByAmbiguity ||
    goalPlan?.lane === "dialogue"
  ) {
    return {
      authority: "dialogue_protocol",
      execute_transaction: false,
      allow_context_mutation: Boolean(goalPlan?.mutates_context),
    };
  }
  if (goalPlan?.lane === "transactional") {
    return {
      authority: "transaction_executor",
      execute_transaction: true,
      allow_context_mutation: true,
    };
  }
  return {
    authority: routeResult?.knowledgeGap ? "knowledge_gap" : "knowledge_router",
    execute_transaction: false,
    allow_context_mutation: false,
  };
}
