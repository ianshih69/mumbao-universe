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
    "age", "breakfast_count", "date_type", "generic_quantity"].includes(span.normalized_type) &&
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
