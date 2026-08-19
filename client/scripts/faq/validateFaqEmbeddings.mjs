#!/usr/bin/env node
import {
  faqMasterPath,
  loadFaqMaster,
  sortFaqItemsById,
  toFaqJsonItem,
  validateFaqMaster,
} from "./lib/faqCsvUtils.mjs";
import { getFaqSemanticRetrievalMode } from "../../server/aiChat/faqSemanticRetrieval.js";
import {
  buildApprovedSemanticCorpus,
  readFaqEmbeddingArtifact,
  validateFaqEmbeddingArtifact,
} from "../../server/aiChat/faqSemanticCorpus.js";

const requireArtifact =
  process.argv.includes("--require") ||
  getFaqSemanticRetrievalMode() === "enabled";
const validation = validateFaqMaster(faqMasterPath);

if (!validation.ok) {
  console.error("FAQ master validation failed; embedding artifact was not checked.");
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const { items } = loadFaqMaster(faqMasterPath);
const faqItems = sortFaqItemsById(items.map(toFaqJsonItem));
const corpus = buildApprovedSemanticCorpus(faqItems);
const artifactResult = await readFaqEmbeddingArtifact();
const artifactValidation = validateFaqEmbeddingArtifact(
  artifactResult.artifact,
  corpus
);
const report = {
  ok: artifactValidation.ok || !requireArtifact,
  required: requireArtifact,
  artifactPath: artifactResult.path,
  status: artifactValidation.ok ? "fresh" : artifactValidation.reason,
  approved_count: corpus.length,
  embedding_model: artifactValidation.embeddingModel || "",
  vector_dimensions: artifactValidation.vectorDimensions || 0,
  source_hash: artifactValidation.sourceHash || "",
};

console.log(JSON.stringify(report, null, 2));

if (!artifactValidation.ok && requireArtifact) {
  process.exit(1);
}
