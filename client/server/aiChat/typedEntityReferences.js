import { analyzeDialogueReferences } from "./dialogueReferenceSemantics.js";

const petId = /^pet_[1-9]\d{0,8}$/;
const clone = (value) => JSON.parse(JSON.stringify(value));

// IDs belong to a scenario, not to the current array position or pet weight.
export function normalizeEntityReferences(value, context) {
  const count = Math.min(20, Math.max(0, context.pet_count || 0));
  const input = Array.isArray(value?.pets) ? value.pets : [];
  const valid = input.length === count && input.every((item) => petId.test(item?.id)) &&
    new Set(input.map((item) => item.id)).size === input.length;
  let next = Math.max(1, Number.isSafeInteger(value?.next_pet_id) ? value.next_pet_id : 1,
    ...input.filter((item) => petId.test(item?.id)).map((item) => Number(item.id.slice(4)) + 1));
  const pets = Array.from({ length: count }, (_, index) => ({
    id: valid ? input[index].id : `pet_${next++}`,
    type: "pet",
    weight_kg: context.pet_weights_kg?.[index] ?? null,
  }));
  const anchor = value?.anchor;
  const anchorValid = valid && anchor?.last_referenced_entity_type === "pet" &&
    pets.some((item) => item.id === anchor.last_referenced_entity_id) &&
    typeof anchor.last_reference_turn === "string" &&
    /^[a-zA-Z0-9:_-]{1,120}$/.test(anchor.last_reference_turn);
  return { pets, next_pet_id: next, anchor: anchorValid ? {
    last_referenced_entity_id: anchor.last_referenced_entity_id,
    last_referenced_entity_type: "pet",
    last_reference_turn: anchor.last_reference_turn,
  } : null };
}

export function setDiscourseAnchor(context, ids, turnId) {
  const refs = normalizeEntityReferences(context.entity_references, context);
  const unique = [...new Set(ids)];
  const id = unique.length === 1 && refs.pets.some((pet) => pet.id === unique[0]) ? unique[0] : null;
  return { ...context, entity_references: { ...refs, anchor: id ? {
    last_referenced_entity_id: id, last_referenced_entity_type: "pet",
    last_reference_turn: String(turnId || "reference-turn").slice(0, 120),
  } : null } };
}

export function updatePetEntityReferences(before, after, operation, turnId) {
  const refs = normalizeEntityReferences(before.entity_references, before);
  const next = clone(refs);
  let touched = [];
  if (operation.operation === "clear" || operation.target_scope === "all" && operation.operation === "remove") {
    next.pets = [];
  } else if (operation.operation === "remove" && Number.isInteger(operation.target_pet)) {
    next.pets.splice(operation.target_pet, 1);
  } else if (operation.operation === "add") {
    while (next.pets.length < after.pet_count) {
      const id = `pet_${next.next_pet_id++}`;
      next.pets.push({ id, type: "pet", weight_kg: null });
      touched.push(id);
    }
  } else if (operation.operation === "replace" && Number.isInteger(operation.target_pet)) {
    touched = [next.pets[operation.target_pet]?.id].filter(Boolean);
  } else if (operation.operation === "replace" && operation.target_scope === "all") {
    touched = next.pets.map((item) => item.id);
  } else if (operation.operation === "set") {
    next.pets = Array.from({ length: after.pet_count || 0 }, () => ({
      id: `pet_${next.next_pet_id++}`, type: "pet", weight_kg: null,
    }));
    touched = next.pets.map((item) => item.id);
  } else if (after.pet_count === 1 && next.pets.length === 1) {
    touched = [next.pets[0].id];
  }
  next.pets = next.pets.slice(0, after.pet_count || 0).map((pet, index) => ({
    ...pet, weight_kg: after.pet_weights_kg?.[index] ?? null,
  }));
  const context = { ...after, entity_references: next };
  // A deletion or a plural operation does not identify a surviving singular referent.
  return setDiscourseAnchor(context, touched, turnId);
}

export function resolveTypedEntityReference({ context, message, spans = [], entity = "pet", allowAll = false }) {
  const state = normalizeEntityReferences(context?.entity_references, context || {});
  const entities = entity === "pet" ? state.pets : [];
  const reference = analyzeDialogueReferences(message, spans);
  const cues = spans.filter((span) => ["reference_cue", "scope_cue", "entity_ordinal", "reference_rejection"].includes(span.normalized_type));
  const classifiers = reference.classifierEntities;
  const entityCompatible = reference.entities.every((item) => item === entity) &&
    classifiers.every((item) => item === entity || item === "party");
  const anchorId = state.anchor?.last_referenced_entity_type === entity
    ? state.anchor.last_referenced_entity_id : null;
  const base = entities.findIndex((item) => item.id === anchorId);
  const reply = (status, ids = [], category = "none") => ({
    status, entity, category, target_ids: ids, anchor_id: anchorId,
    candidate_targets: entities.map((item) => item.id),
    span_ids: cues.map((span) => span.span_id),
    clarification_code: status === "ambiguous" ? "missing_target_reference" : null,
  });
  if (!entityCompatible || reference.rejected) return reply("ambiguous", [], "rejected");
  const hasEntityScope = reference.classifierEntities.includes(entity) || reference.entities.includes(entity) ||
    context?.pending_interaction?.entity === entity || base >= 0;
  if (!hasEntityScope && !spans.some((span) => ["pet_weight", "entity_ordinal"].includes(span.normalized_type))) {
    return reply("absent");
  }
  const ordinals = spans.filter((span) => span.normalized_type === "entity_ordinal");
  const categories = [reference.other || reference.remaining && !reference.resume ? "alternate" : null,
    reference.before ? "before" : null, reference.after ? "after" : null,
    reference.previous ? "previous" : null, reference.same && !reference.other && !reference.previous ? "same" : null,
    reference.all ? "all" : null].filter(Boolean);
  if (new Set(categories.filter((value) => value !== "same")).size > 1 || ordinals.length > 1) {
    return reply("ambiguous", [], "conflicting");
  }
  const weights = spans.filter((span) => span.normalized_type === "pet_weight");
  const targetWeights = weights.filter((weight) => spans.some((span) =>
    span.normalized_type === "operation_cue" && span.normalized_value === "replace" && span.start >= weight.end));
  const attributes = targetWeights.length ? targetWeights : reference.operations.length ? [] : weights;
  if (attributes.length) {
    const matches = attributes.length === 1 ? entities.filter((item) => item.weight_kg === attributes[0].normalized_value) : [];
    const ordinalTarget = ordinals.length ? entities[ordinals[0].normalized_value - 1] : null;
    const compatibleOrdinal = !ordinals.length || ordinalTarget?.id === matches[0]?.id;
    const compatibleAlternate = !categories.includes("alternate") || base >= 0 &&
      entities.filter((item) => item.id !== anchorId).length === 1 && matches[0]?.id !== anchorId;
    const resolved = matches.length === 1 && compatibleOrdinal && compatibleAlternate;
    return { ...reply(resolved ? "unique" : "ambiguous", resolved ? [matches[0].id] : [], "attribute"),
      span_ids: [...new Set([...cues, ...attributes].map((span) => span.span_id))] };
  }
  if (ordinals.length === 1) {
    const target = entities[ordinals[0].normalized_value - 1];
    return target ? reply("unique", [target.id], "ordinal") : reply("ambiguous", [], "ordinal");
  }
  const category = categories[0] || "none";
  if (category === "all") {
    const quantity = spans.find((span) => span.normalized_type === "reference_quantity");
    return allowAll && reference.complete && (!quantity || quantity.normalized_value === entities.length)
      ? reply("all", entities.map((item) => item.id), category) : reply("ambiguous", [], category);
  }
  if (category === "alternate") {
    const complement = entities.filter((item) => item.id !== anchorId);
    return base >= 0 && complement.length === 1
      ? reply("unique", [complement[0].id], category) : reply("ambiguous", [], category);
  }
  if (["before", "after"].includes(category)) {
    const target = base < 0 ? null : entities[base + (category === "before" ? -1 : 1)];
    return target ? reply("unique", [target.id], category) : reply("ambiguous", [], category);
  }
  if (["same", "previous"].includes(category)) {
    const target = base >= 0 ? entities[base] : entities.length === 1 ? entities[0] : null;
    return target ? reply("unique", [target.id], category) : reply("ambiguous", [], category);
  }
  return reply("absent");
}

export function referenceContextForProvider(context) {
  const refs = normalizeEntityReferences(context?.entity_references, context || {});
  return { entities: refs.pets, discourse_anchor: refs.anchor ? {
    last_referenced_entity_id: refs.anchor.last_referenced_entity_id,
    last_referenced_entity_type: refs.anchor.last_referenced_entity_type,
    // The local source turn ID is deliberately not part of the outbound projection.
    last_reference_turn: "previous",
  } : null };
}
