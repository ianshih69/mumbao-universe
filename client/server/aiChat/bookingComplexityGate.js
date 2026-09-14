import { isPendingInteractionCurrent } from "./quoteDialogueState.js";

export const bookingComplexityWeights = Object.freeze({
  pending: 5, quote: 3, numeric_density: 2, date_and_party: 2,
  child_age: 2, pet_weight: 2, total_and_breakdown: 3,
  ambiguity: 4, unparsed_date: 4, contextual_reference: 2,
});
export const bookingComplexityThreshold = 4;
const quoteIntent = /詢價|報價|多少錢|費用多少|多少費用|幾錢|想訂|訂房|入住.*多少|住.*多少|包棟.*多少/;
const contextTerms = /其中|裡(?:面)?有|裏(?:面)?有|剛剛|剛才|那這樣|其他(?:都)?是|其餘|原本|另外|那隻|牠|牠們|這隻|那個/;
export const isExplicitBookingPolicyQuestion = message =>
  /怎麼(?:收費|計費|算)|如何(?:收費|計費)|規定|政策|可以嗎|能不能|幾點|要收費嗎/.test(message);

export function evaluateBookingComplexity({ message, spans = [], context = {}, ambiguities = [],
  compilerFailures = 0, headcount = null, nowIso = new Date().toISOString() }) {
  const text = String(message || "").normalize("NFKC");
  const types = new Set(spans.map(span => span.normalized_type));
  const pending = isPendingInteractionCurrent(context, context.pending_interaction, nowIso);
  const quote = quoteIntent.test(text) && !isExplicitBookingPolicyQuestion(text);
  const date = types.has("date");
  const party = ["total_guest_count", "adult_count", "child_count", "age"].some(type => types.has(type));
  const dateLike = /(?:\d{1,4}[/.]\d{1,2}|\d{1,2}月\d{1,2}|今天|明天|後天)/.test(text);
  const contextual = Boolean(context.quote_scenario) && (contextTerms.test(text) ||
    (types.has("age") && !isExplicitBookingPolicyQuestion(text)));
  const dimensions = [
    date, types.has("nights") || types.has("duration_days"), types.has("total_guest_count"),
    types.has("adult_count"), types.has("child_count") || types.has("age"),
    types.has("pet_count") || types.has("pet_type"), types.has("pet_weight"),
  ].filter(Boolean).length;
  const signals = {
    pending, quote, numeric_density: (text.match(/\d+(?:\.\d+)?|[一二兩三四五六七八九十]+/g) || []).length >= 3,
    date_and_party: date && party, child_age: types.has("age"), pet_weight: types.has("pet_weight"),
    total_and_breakdown: Boolean(headcount), ambiguity: ambiguities.length > 0 || compilerFailures > 0,
    unparsed_date: dateLike && !date, contextual_reference: contextual,
  };
  const reasons = Object.keys(signals).filter(key => signals[key]);
  const hardReasons = [
    pending && "pending", signals.ambiguity && "ambiguity",
    quote && dimensions >= 2 && "multi_dimension_quote",
    signals.unparsed_date && "unparsed_date", contextual && "contextual_reference",
  ].filter(Boolean);
  const score = reasons.reduce((sum, reason) => sum + bookingComplexityWeights[reason], 0);
  return { triggered: hardReasons.length > 0 || score >= bookingComplexityThreshold,
    score, reasons: [...new Set([...hardReasons, ...reasons])], dimensions };
}
