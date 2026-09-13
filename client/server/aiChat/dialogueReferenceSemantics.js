// Compose typed lexical evidence; unmatched content cannot imply a resume/scope.
export function analyzeDialogueReferences(message, spans = []) {
  const values = (type) => spans.filter((span) => span.normalized_type === type)
    .map((span) => span.normalized_value);
  const covered = new Set();
  for (const span of spans) {
    for (let index = span.start; index < span.end; index += 1) covered.add(index);
  }
  const remainder = String(message || "").split("")
    .filter((_character, index) => !covered.has(index)).join("")
    .normalize("NFKC").replace(/[\s,，。.!！?？、]/g, "");
  const complete = /^(?:那|這|就|的|呢|了|嗎|請問|請|是|如果)*$/.test(remainder);
  const refs = values("reference_cue");
  const scopes = values("scope_cue");
  const continuation = values("continuation_cue");
  const operations = [...new Set(spans.filter((span) => span.normalized_type === "operation_cue" &&
    !(span.normalized_value === "add" && spans.some((ref) => ref.normalized_type === "reference_cue" &&
      ref.normalized_value === "other" && ref.start <= span.start && ref.end >= span.end)))
    .map((span) => span.normalized_value))];
  const entities = [...new Set(values("entity_label"))];
  const hasValues = spans.some((span) => ["date", "nights", "duration_days",
    "adult_count", "child_count", "infant_count", "pet_count", "pet_weight",
    "age", "breakfast_count", "date_type", "generic_quantity", "scalar_value"].includes(span.normalized_type) &&
    !spans.some((reference) => reference.normalized_type === "reference_quantity" &&
      reference.start <= span.start && reference.end >= span.end));
  const hasExplicitQuestion = spans.some((span) => span.normalized_type === "action_cue");
  return {
    complete, entities, operations,
    previous: refs.includes("previous"), other: refs.includes("other"),
    same: refs.includes("same"), before: refs.includes("before"), after: refs.includes("after"),
    remaining: scopes.includes("remaining"), rejected: values("reference_rejection").length > 0,
    classifierEntities: [...new Set(values("reference_classifier"))],
    all: complete && !hasValues && scopes.includes("all") && !refs.includes("other"),
    resume: complete && !hasValues && !hasExplicitQuestion && !operations.length && !entities.length &&
      !refs.includes("other") && (
        (continuation.includes("same") && (refs.includes("previous") || scopes.includes("remaining"))) ||
        (continuation.includes("follow") && refs.includes("previous"))
      ),
  };
}

// A value asserted about a subject is not an attribute used to find that subject.
// This grammar composes lexical spans; unknown residual language stays outside the fast path.
export function analyzeEntityAttributeAssertion(message, spans = []) {
  const reference = analyzeDialogueReferences(message, spans);
  if (!reference.complete || reference.entities.some((entity) => entity !== "pet") ||
      spans.some((span) => span.normalized_type === "action_cue") ||
      spans.some((span) => span.normalized_type === "scope_cue" && span.normalized_value === "all") ||
      /嗎|是否/.test(message) ||
      reference.operations.some((operation) => operation !== "replace")) return null;
  const ofType = (type) => spans.filter((span) => span.normalized_type === type);
  const attributes = ofType("attribute_name").filter((span) => span.normalized_value === "weight_kg");
  const weights = ofType("pet_weight");
  const scalars = ofType("scalar_value").filter((scalar) => !spans.some((span) =>
    span !== scalar && span.start <= scalar.start && span.end >= scalar.end &&
    ["pet_weight", "pet_count", "entity_ordinal", "reference_quantity", "nights", "date", "age"].includes(span.normalized_type)));
  const refs = spans.filter((span) => ["reference_cue", "entity_ordinal"].includes(span.normalized_type));
  const replace = ofType("operation_cue").find((span) => span.normalized_value === "replace");
  const copula = ofType("assertion_cue").find((span) => span.normalized_value === "copula");
  const rejection = ofType("reference_rejection");
  const conditional = ofType("conditional_cue").length > 0;
  const values = [...weights, ...(attributes.length || rejection.length ? scalars : [])].sort((a, b) => a.start - b.start);
  if (!values.length || values.length > 2 || values.some((span) =>
    !Number.isFinite(span.normalized_value) || span.normalized_value <= 0 || span.normalized_value > 200)) return null;
  const value = values.at(-1);
  const contrast = rejection.length === 1 && values.length === 2 && copula &&
    rejection[0].end <= values[0].start && values[0].end <= copula.start && copula.end <= value.start;
  if (rejection.length && !contrast) return null;
  const subjectBeforeValue = refs.some((span) => span.end <= value.start);
  const assertionCue = ofType("assertion_cue").some((span) =>
    span.normalized_value === "correction" || span.end <= value.start);
  const predicateBeforeValue = replace && replace.end <= value.start ||
    attributes.some((span) => span.end <= value.start);
  if (!(subjectBeforeValue && assertionCue) && !predicateBeforeValue && !contrast && !conditional) return null;
  const targetValues = values.slice(0, -1);
  if (targetValues.length && !contrast && !(replace && targetValues[0].end <= replace.start)) return null;
  if (!weights.length && !attributes.length) return null;
  return {
    entity: "pet", field: "weights_kg", value: value.normalized_value,
    value_span_ids: [value.span_id], target_span_ids: targetValues.map((span) => span.span_id),
    has_reference: refs.length > 0, conditional, contrast: Boolean(contrast),
    // Bare pronouns require a live anchor, including after removal or a fresh session.
    requires_anchor: refs.some((span) => ["牠", "它"].includes(span.text)),
  };
}
