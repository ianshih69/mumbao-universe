import { createFaqEmbedding } from "./faqEmbeddingProvider.js";
import {
  buildApprovedSemanticCorpus,
  mapArtifactVectorsByFaqId,
  readFaqEmbeddingArtifact,
  validateFaqEmbeddingArtifact,
} from "./faqSemanticCorpus.js";
import {
  isApprovedActiveFaqItem,
  loadFaqItems,
  normalizeAnswerMode,
} from "./faqRetrieval.js";

export const defaultFaqSemanticThresholds = {
  topK: 3,
  directMinSimilarity: 0.86,
  directMinMargin: 0.06,
  verifierMinSimilarity: 0.76,
};

const queryEmbeddingCache = new Map();
const defaultQueryCacheTtlMs = 5 * 60 * 1000;

export function getFaqSemanticRetrievalMode(
  value = process.env.FAQ_SEMANTIC_RETRIEVAL
) {
  return String(value || "").trim().toLowerCase() === "enabled"
    ? "enabled"
    : "disabled";
}

function isSemanticRetrievalEnabled(options = {}) {
  if (typeof options.enabled === "boolean") {
    return options.enabled;
  }
  return getFaqSemanticRetrievalMode() === "enabled";
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return 0;
    }
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function normalizeVector(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  const vector = value.map((entry) => Number(entry));
  return vector.every((entry) => Number.isFinite(entry)) ? vector : [];
}

async function getQueryEmbedding(queryText, options = {}) {
  const now = Date.now();
  const cache =
    options.cache === false
      ? null
      : options.cache && typeof options.cache.get === "function"
        ? options.cache
        : queryEmbeddingCache;
  const ttlMs =
    Number.parseInt(String(options.cacheTtlMs || ""), 10) || defaultQueryCacheTtlMs;
  const cacheKey = `${options.cacheKeyPrefix || "default"}:${queryText}`;

  if (cache) {
    const cached = cache.get(cacheKey);
    if (cached && now - cached.createdAt <= ttlMs) {
      return { vector: cached.vector, cacheHit: true };
    }
  }

  const embeddingCreator =
    typeof options.createEmbedding === "function"
      ? options.createEmbedding
      : (text) => createFaqEmbedding(text, options.embeddingProviderOptions || {});
  const vector = normalizeVector(await embeddingCreator(queryText));
  if (!vector.length) {
    throw new Error("faq_query_embedding_empty");
  }

  if (cache) {
    cache.set(cacheKey, { vector, createdAt: now });
  }
  return { vector, cacheHit: false };
}

function toCandidate({ item, similarity, rank, scoreGap }) {
  return {
    id: String(item.id || ""),
    category: String(item.category || ""),
    question: String(item.question || "").trim(),
    answer: String(item.answer || "").trim(),
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    priority: Number(item.priority) || 80,
    is_active: item.is_active === true,
    status: String(item.status || ""),
    answer_mode: normalizeAnswerMode(item.answer_mode),
    source: String(item.source || "faq-master.csv"),
    source_no: Number(item.source_no) || undefined,
    score: Math.round(similarity * 1000) / 10,
    semanticSimilarity: similarity,
    semanticRank: rank,
    scoreGap: Math.round(scoreGap * 1000) / 10,
    matchedFields: ["semantic_embedding"],
    exactMatch: false,
    aliasMatch: false,
    confidence: rank === 1 ? "medium" : "low",
    rejectionReason: rank === 1 ? "semantic_needs_verifier" : "semantic_candidate",
  };
}

function classifySemanticCandidates(candidates, thresholds) {
  const top = candidates[0] || null;
  if (!top) {
    return { status: "miss", reason: "semantic_no_candidates" };
  }

  const second = candidates[1] || null;
  const topSimilarity = Number(top.semanticSimilarity || 0);
  const margin = topSimilarity - Number(second?.semanticSimilarity || 0);

  if (
    topSimilarity >= thresholds.directMinSimilarity &&
    margin >= thresholds.directMinMargin
  ) {
    return { status: "clear", reason: "semantic_clear", margin };
  }

  if (topSimilarity >= thresholds.verifierMinSimilarity) {
    return { status: "ambiguous", reason: "semantic_verifier_required", margin };
  }

  return { status: "miss", reason: "semantic_below_threshold", margin };
}

export async function retrieveSemanticFaqItems(question, options = {}) {
  const thresholds = {
    ...defaultFaqSemanticThresholds,
    ...(options.thresholds && typeof options.thresholds === "object"
      ? options.thresholds
      : {}),
  };
  const topK = Math.max(1, Number.parseInt(String(thresholds.topK || 3), 10));
  let embeddingCalled = false;

  if (!isSemanticRetrievalEnabled(options)) {
    return {
      status: "disabled",
      reason: "semantic_retrieval_disabled",
      candidates: [],
      embeddingCalled: false,
    };
  }

  try {
    const queryText = String(question || "").trim();
    if (!queryText) {
      return {
        status: "miss",
        reason: "semantic_empty_query",
        candidates: [],
        embeddingCalled: false,
      };
    }

    const faqItems = Array.isArray(options.items)
      ? options.items
      : await loadFaqItems();
    const approvedItems = faqItems.filter(isApprovedActiveFaqItem);
    const approvedById = new Map(approvedItems.map((item) => [String(item.id), item]));
    const corpus = buildApprovedSemanticCorpus(faqItems);
    const artifactResult =
      options.artifactResult ||
      (options.artifact
        ? { artifact: options.artifact, path: options.artifactPath || "" }
        : await readFaqEmbeddingArtifact({ artifactPath: options.artifactPath }));
    const validation = validateFaqEmbeddingArtifact(artifactResult.artifact, corpus);

    if (!validation.ok) {
      return {
        status:
          validation.reason === "missing_embedding_artifact" ? "unavailable" : "stale",
        reason: validation.reason,
        candidates: [],
        embeddingCalled: false,
        corpusApprovedCount: corpus.length,
        corpusNeedsReviewCount: Math.max(0, faqItems.length - approvedItems.length),
        artifactPath: artifactResult.path || "",
      };
    }

    embeddingCalled = true;
    const embedding = await getQueryEmbedding(queryText, {
      ...options,
      cacheKeyPrefix:
        options.cacheKeyPrefix ||
        `${artifactResult.artifact.embedding_model}:${artifactResult.artifact.source_hash}`,
    });
    const vectorByFaqId = mapArtifactVectorsByFaqId(artifactResult.artifact);
    const scored = corpus
      .map((entry) => {
        const item = approvedById.get(entry.faq_id);
        const vector = vectorByFaqId.get(entry.faq_id);
        if (!item || !vector) return null;
        return {
          item,
          similarity: cosineSimilarity(embedding.vector, vector),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.similarity - left.similarity);

    const candidates = scored.slice(0, topK).map((entry, index, all) =>
      toCandidate({
        item: entry.item,
        similarity: entry.similarity,
        rank: index + 1,
        scoreGap:
          index === 0
            ? entry.similarity - Number(all[1]?.similarity || 0)
            : Number(all[0]?.similarity || 0) - entry.similarity,
      })
    );
    const classification = classifySemanticCandidates(candidates, thresholds);
    const finalCandidates =
      classification.status === "miss" ? [] : candidates.slice(0, topK);

    if (classification.status === "clear" && finalCandidates[0]) {
      finalCandidates[0].confidence = "high";
      finalCandidates[0].rejectionReason = "";
    }

    return {
      status: classification.status,
      reason: classification.reason,
      candidates: finalCandidates,
      topCandidate: finalCandidates[0] || null,
      embeddingCalled: true,
      queryEmbeddingCacheHit: embedding.cacheHit,
      corpusApprovedCount: corpus.length,
      corpusNeedsReviewCount: Math.max(0, faqItems.length - approvedItems.length),
      artifactPath: artifactResult.path || "",
      sourceHash: validation.sourceHash,
      embeddingModel: validation.embeddingModel,
      vectorDimensions: validation.vectorDimensions,
      margin: classification.margin ?? 0,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error?.providerErrorCode || error?.message || "semantic_retrieval_failed",
      candidates: [],
      embeddingCalled,
    };
  }
}
