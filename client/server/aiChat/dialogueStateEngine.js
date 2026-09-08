import {
  getConversationContextForStorage,
  normalizeConversationContext,
} from "./conversationContext.js";
import {
  reduceBookingContext,
  toTypedBookingContext,
  validateStructuredTurnResult,
} from "./structuredBookingTurn.js";
import {
  buildQuoteScopeBaseContext,
  finalizeQuoteScenarioContext,
} from "./quoteDialogueState.js";
import { setDiscourseAnchor } from "./typedEntityReferences.js";

function addIsoDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eventTypeFor(operation) {
  if (operation.entity === "stay") {
    return operation.nights && !operation.check_in && !operation.check_out
      ? "NightCountChanged"
      : "StayDateChanged";
  }
  if (operation.entity === "breakfast") {
    if (operation.operation === "add") return "BreakfastAdded";
    if (["remove", "clear"].includes(operation.operation)) return "BreakfastRemoved";
    return "BreakfastCountSet";
  }
  if (operation.entity === "pet") {
    if (operation.operation === "clear") return "PetsCleared";
    if (operation.operation === "remove") return "PetRemoved";
    if (operation.operation === "replace") return "PetWeightChanged";
    return "PetAdded";
  }
  const title = operation.entity[0].toUpperCase() + operation.entity.slice(1);
  if (operation.operation === "add") return `${title}CountAdded`;
  if (["remove", "clear"].includes(operation.operation)) {
    return `${title}CountRemoved`;
  }
  return `${title}CountSet`;
}

function operationData(operation) {
  return Object.fromEntries(
    Object.entries(operation).filter(([key, value]) =>
      !["operation", "entity", "evidence"].includes(key) && value !== undefined,
    ),
  );
}

function buildEvent({
  type,
  operation = null,
  astOperation = null,
  scenarioId,
  conversationId,
  baseVersion,
  appliedVersion,
  turnId,
  eventIndex,
  nowIso,
}) {
  const data = operation ? operationData(operation) : {};
  const spanIds = astOperation?.span_bindings || [];
  const contextRefs = astOperation?.context_bindings || [];
  return {
    event_id: `${turnId}:${String(eventIndex).padStart(3, "0")}:${type}`,
    conversation_id: conversationId || null,
    type,
    scenario_id: scenarioId,
    base_version: baseVersion,
    applied_version: appliedVersion,
    state_version: appliedVersion,
    turn_id: turnId,
    entity: operation?.entity || null,
    operation: operation?.operation || null,
    data,
    validated_value: data,
    span_ids: spanIds,
    source_span_ids: spanIds,
    context_refs: contextRefs,
    source_context_ids: contextRefs,
    created_at: nowIso,
    timestamp: nowIso,
  };
}

function unchanged(context, result, reason, extras = {}) {
  const stored = getConversationContextForStorage(context);
  const typed = toTypedBookingContext(stored);
  return {
    before: typed,
    operations: [],
    after: typed,
    context: stored,
    changed: false,
    applied: false,
    reason,
    events: [],
    duplicate: false,
    stale: false,
    turn_delta: {
      selected_candidate_ids: [],
      candidates: [],
      operations: [],
    },
    result,
    ...extras,
  };
}

function appendEvents(context, events, turnId) {
  return getConversationContextForStorage({
    ...context,
    dialogue_events: [...(context.dialogue_events || []), ...events].slice(-80),
    processed_turn_ids: [
      ...(context.processed_turn_ids || []).filter((id) => id !== turnId),
      turnId,
    ].slice(-80),
  });
}

function isExpired(pending, nowIso) {
  const expiresAt = Date.parse(String(pending?.expires_at || ""));
  const now = Date.parse(String(nowIso || ""));
  return Number.isFinite(expiresAt) &&
    expiresAt <= (Number.isFinite(now) ? now : Date.now());
}

function replacementPendingAfterRejection(pending, turnId, nowIso) {
  return {
    ...pending,
    action: "collect_quote_fields",
    proposed_values: {},
    required_response_type: "fields",
    source_assistant_message_id: turnId,
    asked_turn_id: turnId,
    created_turn_id: turnId,
    created_at: nowIso,
  };
}

function touchedFields(entity) {
  return {
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
  }[entity] || [];
}

function withOperationProvenance(
  context,
  ast,
  operations,
  { turnId, nowIso, confidence },
) {
  const next = {
    ...context,
    slot_meta: { ...(context.slot_meta || {}) },
  };
  operations.forEach((operation, index) => {
    const binding = ast.operations[index] || {
      span_bindings: [],
      context_bindings: [],
    };
    for (const field of touchedFields(operation.entity)) {
      next.slot_meta[field] = {
        source: "structured_candidate",
        source_message_id: turnId,
        source_turn_id: turnId,
        updated_at: nowIso,
        confidence,
        value: Array.isArray(next[field]) ? [...next[field]] : next[field] ?? null,
        evidence_span_ids: [...binding.span_bindings],
        context_refs: binding.context_bindings.filter(
          (ref) => ref !== "quote_scenario.context_version",
        ),
      };
    }
  });
  return getConversationContextForStorage(next);
}

function pendingEventType(status) {
  if (["created", "updated"].includes(status)) return "PendingCreated";
  if (status === "completed") return "PendingResolved";
  if (status === "stale") return "PendingExpired";
  return null;
}

// Active mode has one mutation entry point. Event records are provenance only;
// they never act as a second reducer or response authority.
export function applyScenarioTransition({
  context,
  ast,
  operations = [],
  result,
  plan,
  nowIso = new Date().toISOString(),
  sourceTurnId = "",
} = {}) {
  const previous = getConversationContextForStorage(context);
  const turnId = String(
    sourceTurnId ||
      plan.slot_fill_transaction?.transaction_id ||
      "dialogue-turn",
  ).slice(0, 120);
  const conversationId = String(plan.conversation_id || "").slice(0, 120);
  const evidenceMessage =
    plan.slot_fill_transaction?.evidence_message || plan.sanitized_message;
  const validatedResult = validateStructuredTurnResult(
    {
      ...result,
      operations,
    },
    { message: evidenceMessage, currentDate: plan.current_date },
  );

  if (previous.processed_turn_ids.includes(turnId)) {
    return unchanged(previous, validatedResult, "duplicate_turn", {
      duplicate: true,
    });
  }

  const confirmation = plan.dialogue_state?.confirmation || "none";
  const confirmationPending = previous.pending_interaction;
  if (
    plan.dialogue_state?.turn_type === "confirmation" &&
    confirmationPending?.required_response_type === "confirmation"
  ) {
    const current = Boolean(plan.dialogue_state.pending_confirmation_current);
    const expired = isExpired(confirmationPending, nowIso);
    const eventType = !current || expired ? "PendingExpired" : "PendingResolved";
    const scenario = previous.quote_scenario;
    const baseVersion = scenario?.context_version ?? null;
    const appliedVersion =
      confirmation === "confirm" && current && !expired && scenario
        ? scenario.context_version + 1
        : baseVersion;
    const event = buildEvent({
      type: eventType,
      conversationId,
      scenarioId: scenario?.scenario_id || confirmationPending.scenario_id,
      baseVersion,
      appliedVersion,
      turnId,
      eventIndex: 0,
      nowIso,
    });
    let next;
    if (!current || expired) {
      next = { ...previous, pending_interaction: null };
    } else if (confirmation === "confirm") {
      next = {
        ...previous,
        ...(confirmationPending.proposed_values || {}),
        pending_interaction: null,
        quote_scenario: scenario
          ? { ...scenario, context_version: appliedVersion }
          : null,
      };
    } else {
      next = {
        ...previous,
        pending_interaction: replacementPendingAfterRejection(
          confirmationPending,
          turnId,
          nowIso,
        ),
      };
    }
    next = appendEvents(next, [event], turnId);
    return {
      ...unchanged(previous, validatedResult, `confirmation_${confirmation}`),
      after: toTypedBookingContext(next),
      context: next,
      changed: true,
      applied: current && !expired,
      stale: !current || expired,
      events: [event],
    };
  }

  const pendingStatus = plan.slot_fill_transaction?.status || "none";
  if (pendingStatus === "duplicate") {
    const cleared = getConversationContextForStorage({
      ...previous,
      pending_interaction: null,
    });
    return {
      ...unchanged(previous, validatedResult, "duplicate_pending_transaction", {
        duplicate: true,
      }),
      context: cleared,
      changed: JSON.stringify(cleared) !== JSON.stringify(previous),
    };
  }
  if (pendingStatus === "stale") {
    const scenario = previous.quote_scenario;
    const event = buildEvent({
      type: "PendingExpired",
      conversationId,
      scenarioId: scenario?.scenario_id || null,
      baseVersion: scenario?.context_version ?? null,
      appliedVersion: scenario?.context_version ?? null,
      turnId,
      eventIndex: 0,
      nowIso,
    });
    const next = appendEvents(
      { ...previous, pending_interaction: null },
      [event],
      turnId,
    );
    return {
      ...unchanged(previous, validatedResult, "stale_pending_blocked"),
      context: next,
      changed: true,
      stale: true,
      events: [event],
      turn_delta: {
        selected_candidate_ids: [],
        candidates: [],
        operations: [],
      },
    };
  }
  if (["created", "updated"].includes(pendingStatus)) {
    const pending = plan.slot_fill_transaction.pending;
    const scenario = previous.quote_scenario || plan.pending_scenario;
    const event = buildEvent({
      type: "PendingCreated",
      conversationId,
      scenarioId: scenario?.scenario_id || null,
      baseVersion: scenario?.context_version ?? null,
      appliedVersion: scenario?.context_version ?? null,
      turnId,
      eventIndex: 0,
      nowIso,
    });
    const next = appendEvents(
      {
        ...previous,
        quote_scenario: scenario,
        pending_interaction: pending,
      },
      [event],
      turnId,
    );
    return {
      ...unchanged(previous, validatedResult, `pending_slot_fill_${pendingStatus}`),
      context: next,
      changed: true,
      applied: false,
      events: [event],
      turn_delta: {
        selected_candidate_ids: [],
        candidates: [],
        operations: [],
      },
    };
  }

  if (ast.turn_kind !== "transactional") {
    if (ast.turn_kind === "informational" && plan.entity_reference?.status === "unique") {
      const next = getConversationContextForStorage(setDiscourseAnchor(previous, plan.entity_reference.target_ids, turnId));
      return { ...unchanged(previous, validatedResult, "read_only_entity_reference"), context: next,
        changed: JSON.stringify(previous) !== JSON.stringify(next) };
    }
    return unchanged(previous, validatedResult, "read_only_turn");
  }
  if (
    ast.scenario_action === "continue" &&
    !previous.quote_scenario &&
    previous.active_intent !== "pricing" &&
    previous.current_topic !== "booking_price"
  ) {
    return unchanged(previous, validatedResult, "stale_scenario_reference", {
      stale: true,
    });
  }

  const resetSnapshot = Boolean(
    ast.scenario_action === "new" &&
      validatedResult.intents.includes("request_quote"),
  );
  const dialogueState = {
    quote_scope: resetSnapshot ? "snapshot" : "patch",
  };
  const historicalEvents = previous.dialogue_events || [];
  const historicalTurns = previous.processed_turn_ids || [];
  let base = resetSnapshot
    ? buildQuoteScopeBaseContext(previous, dialogueState, turnId)
    : previous;
  const beforeScenario = previous.quote_scenario;
  if (pendingStatus === "completed") {
    base = getConversationContextForStorage({
      ...base,
      pending_interaction: null,
    });
  }
  const reduction = reduceBookingContext(base, validatedResult, {
    message: evidenceMessage,
    nowIso,
    sourceMessageId: turnId,
    currentDate: plan.current_date,
  });
  let reducedContext = reduction.context;
  if (
    plan.single_date_one_night_default_used &&
    reducedContext.check_in &&
    !reducedContext.check_out &&
    !reducedContext.stay_nights
  ) {
    reducedContext = getConversationContextForStorage({
      ...reducedContext,
      check_out: addIsoDays(reducedContext.check_in, 1),
      stay_nights: 1,
    });
  }
  let next = finalizeQuoteScenarioContext({
    previousContext: previous,
    context: reducedContext,
    dialogueState,
    sourceTurnId: turnId,
    changed: reduction.changed || ast.scenario_action === "new",
  });
  next = withOperationProvenance(next, ast, operations, {
    turnId,
    nowIso,
    confidence: validatedResult.confidence,
  });
  const scenario = next.quote_scenario;
  const baseVersion = beforeScenario?.context_version || 0;
  const appliedVersion = scenario?.context_version || baseVersion;
  const events = [];
  if (ast.scenario_action === "new") {
    if (beforeScenario?.scenario_id) {
      events.push(
        buildEvent({
          type: "ScenarioSuperseded",
          conversationId,
          scenarioId: beforeScenario.scenario_id,
          baseVersion,
          appliedVersion: baseVersion,
          turnId,
          eventIndex: events.length,
          nowIso,
        }),
      );
    }
    events.push(
      buildEvent({
        type: "QuoteScenarioCreated",
        conversationId,
        scenarioId: scenario?.scenario_id || turnId,
        baseVersion: 0,
        appliedVersion,
        turnId,
        eventIndex: events.length,
        nowIso,
      }),
    );
  }
  operations.forEach((operation, index) => {
    events.push(
      buildEvent({
        type: eventTypeFor(operation),
        conversationId,
        operation,
        astOperation: ast.operations[index],
        scenarioId: scenario?.scenario_id || turnId,
        baseVersion,
        appliedVersion,
        turnId,
        eventIndex: events.length,
        nowIso,
      }),
    );
  });
  const pendingType = pendingEventType(pendingStatus);
  if (pendingType) {
    events.push(
      buildEvent({
        type: pendingType,
        conversationId,
        scenarioId: scenario?.scenario_id || turnId,
        baseVersion,
        appliedVersion,
        turnId,
        eventIndex: events.length,
        nowIso,
      }),
    );
  }
  next = appendEvents(
    {
      ...next,
      dialogue_events: historicalEvents,
      processed_turn_ids: historicalTurns,
      quote_scenario: scenario
        ? {
            ...scenario,
            last_applied_turn_id: turnId,
            ...(plan.slot_fill_transaction?.transaction_id
              ? {
                  last_applied_transaction_id:
                    plan.slot_fill_transaction.transaction_id,
                }
              : {}),
          }
        : null,
      pending_interaction:
        pendingStatus === "completed" ? null : next.pending_interaction,
    },
    events,
    turnId,
  );
  const changed =
    JSON.stringify(getConversationContextForStorage(previous)) !==
    JSON.stringify(getConversationContextForStorage(next));

  return {
    ...reduction,
    after: toTypedBookingContext(next),
    context: next,
    changed,
    applied: true,
    reason: changed ? "events_applied" : "no_context_change",
    events,
    duplicate: false,
    stale: false,
    turn_delta: {
      selected_candidate_ids: [],
      candidates: [],
      operations,
    },
    result: validatedResult,
  };
}

export function replayDialogueEvents(events, { baseContext = {} } = {}) {
  let context = getConversationContextForStorage(baseContext);
  for (const event of events || []) {
    if (!event?.entity || !event?.operation) continue;
    const operation = {
      operation: event.operation,
      entity: event.entity,
      ...(event.data || {}),
      evidence: [
        event.data?.check_in,
        event.data?.check_out,
        Number.isInteger(event.data?.nights) ? `${event.data.nights}晚` : "",
        Number.isInteger(event.data?.count)
          ? `${event.data.count}${event.entity === "pet" ? "隻狗" : event.entity === "breakfast" ? "份早餐" : "位成人"}`
          : "",
        ...(event.data?.weights_kg || []).map((weight) => `${weight}公斤`),
      ]
        .filter(Boolean)
        .join("、") || "清除",
    };
    const result = {
      intents: ["request_quote"],
      operations: [operation],
      missing_fields: [],
      ambiguities: [],
      confidence: 1,
    };
    context = reduceBookingContext(context, result, {
      message: operation.evidence,
      sourceMessageId: event.turn_id,
      nowIso: event.created_at,
    }).context;
  }
  return context;
}
