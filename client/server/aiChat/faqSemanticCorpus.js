import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isApprovedActiveFaqItem } from "./faqRetrieval.js";

export const faqEmbeddingArtifactSchemaVersion = 1;
export const faqEmbeddingArtifactRelativePath =
  "client/api/knowledge/faq-embeddings.json";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : [];
}

export function buildSemanticCorpusText(item) {
  const aliases = normalizeList(item?.aliases);
  const keywords = normalizeList(item?.keywords);
  return [
    `id: ${normalizeText(item?.id)}`,
    `question: ${normalizeText(item?.question)}`,
    `aliases: ${aliases.join(" | ")}`,
    `keywords: ${keywords.join(" | ")}`,
    `category: ${normalizeText(item?.category)}`,
  ].join("\n");
}

export function buildApprovedSemanticCorpus(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(isApprovedActiveFaqItem)
    .map((item) => ({
      faq_id: normalizeText(item.id),
      question: normalizeText(item.question),
      aliases: normalizeList(item.aliases),
      keywords: normalizeList(item.keywords),
      category: normalizeText(item.category),
      text: buildSemanticCorpusText(item),
    }))
    .filter((entry) => entry.faq_id && entry.text.trim())
    .sort((left, right) => left.faq_id.localeCompare(right.faq_id));
}

export function hashSemanticCorpus(corpus = []) {
  const stableCorpus = (Array.isArray(corpus) ? corpus : []).map((entry) => ({
    faq_id: normalizeText(entry.faq_id),
    text: normalizeText(entry.text),
  }));
  return createHash("sha256")
    .update(JSON.stringify(stableCorpus), "utf8")
    .digest("hex");
}

function getCandidateArtifactPaths({ cwd = process.cwd(), artifactPath = "" } = {}) {
  if (artifactPath) {
    return [path.isAbsolute(artifactPath) ? artifactPath : path.join(cwd, artifactPath)];
  }
  return [
    path.join(cwd, "api", "knowledge", "faq-embeddings.json"),
    path.join(cwd, faqEmbeddingArtifactRelativePath),
  ];
}

export async function readFaqEmbeddingArtifact(options = {}) {
  for (const candidatePath of getCandidateArtifactPaths(options)) {
    try {
      const raw = await fs.readFile(candidatePath, "utf8");
      return {
        artifact: JSON.parse(raw),
        path: candidatePath,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        return {
          artifact: null,
          path: candidatePath,
          error,
        };
      }
    }
  }

  return {
    artifact: null,
    path: getCandidateArtifactPaths(options).at(-1),
    error: null,
  };
}

function hasValidVector(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => Number.isFinite(Number(entry)))
  );
}

export function validateFaqEmbeddingArtifact(artifact, corpus = []) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { ok: false, reason: "missing_embedding_artifact" };
  }

  const expectedHash = hashSemanticCorpus(corpus);
  const approvedCount = Array.isArray(corpus) ? corpus.length : 0;
  const items = Array.isArray(artifact.items) ? artifact.items : [];

  if (Number(artifact.schema_version) !== faqEmbeddingArtifactSchemaVersion) {
    return { ok: false, reason: "embedding_artifact_schema_mismatch" };
  }
  if (Number(artifact.approved_count) !== approvedCount) {
    return { ok: false, reason: "embedding_artifact_count_mismatch" };
  }
  if (String(artifact.source_hash || "") !== expectedHash) {
    return { ok: false, reason: "embedding_artifact_hash_mismatch" };
  }
  if (items.length !== approvedCount) {
    return { ok: false, reason: "embedding_artifact_item_count_mismatch" };
  }
  if (!String(artifact.embedding_model || "").trim()) {
    return { ok: false, reason: "embedding_artifact_missing_model" };
  }
  const vectorDimensions = Number(artifact.vector_dimensions || 0);
  if (!Number.isInteger(vectorDimensions) || vectorDimensions <= 0) {
    return { ok: false, reason: "embedding_artifact_missing_dimensions" };
  }

  const corpusIds = new Set(corpus.map((entry) => entry.faq_id));
  const seenIds = new Set();
  for (const item of items) {
    const faqId = normalizeText(item?.faq_id);
    if (!faqId || !corpusIds.has(faqId)) {
      return { ok: false, reason: "embedding_artifact_unknown_faq_id" };
    }
    if (seenIds.has(faqId)) {
      return { ok: false, reason: "embedding_artifact_duplicate_faq_id" };
    }
    seenIds.add(faqId);
    if (!hasValidVector(item?.vector)) {
      return { ok: false, reason: "embedding_artifact_invalid_vector" };
    }
    if (item.vector.length !== vectorDimensions) {
      return { ok: false, reason: "embedding_artifact_vector_dimension_mismatch" };
    }
  }

  return {
    ok: true,
    reason: "",
    sourceHash: expectedHash,
    approvedCount,
    vectorDimensions,
    embeddingModel: String(artifact.embedding_model || ""),
  };
}

export function mapArtifactVectorsByFaqId(artifact) {
  return new Map(
    (Array.isArray(artifact?.items) ? artifact.items : []).map((item) => [
      normalizeText(item?.faq_id),
      item.vector.map((entry) => Number(entry)),
    ])
  );
}
