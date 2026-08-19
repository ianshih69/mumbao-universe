#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  faqMasterPath,
  loadFaqMaster,
  sortFaqItemsById,
  toFaqJsonItem,
  validateFaqMaster,
} from "./lib/faqCsvUtils.mjs";
import { createFaqEmbedding, getFaqEmbeddingConfig } from "../../server/aiChat/faqEmbeddingProvider.js";
import {
  buildApprovedSemanticCorpus,
  faqEmbeddingArtifactRelativePath,
  faqEmbeddingArtifactSchemaVersion,
  hashSemanticCorpus,
} from "../../server/aiChat/faqSemanticCorpus.js";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function writeAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

const dryRun = process.argv.includes("--dry-run");
const outputPath = getArgValue("--output") || faqEmbeddingArtifactRelativePath;
const validation = validateFaqMaster(faqMasterPath);

if (!validation.ok) {
  console.error("FAQ master validation failed; embeddings were not generated.");
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const { items } = loadFaqMaster(faqMasterPath);
const faqItems = sortFaqItemsById(items.map(toFaqJsonItem));
const corpus = buildApprovedSemanticCorpus(faqItems);
const config = getFaqEmbeddingConfig();

if (!corpus.length) {
  console.error("No approved active FAQ items are available for embedding.");
  process.exit(1);
}

const embeddedItems = [];
for (const entry of corpus) {
  const vector = await createFaqEmbedding(entry.text, { config });
  embeddedItems.push({
    faq_id: entry.faq_id,
    vector,
  });
}

const vectorDimensions = embeddedItems[0]?.vector?.length || 0;
const artifact = {
  schema_version: faqEmbeddingArtifactSchemaVersion,
  embedding_model: config.model,
  vector_dimensions: vectorDimensions,
  approved_count: corpus.length,
  source_hash: hashSemanticCorpus(corpus),
  generated_at: new Date().toISOString(),
  items: embeddedItems,
};
const content = `${JSON.stringify(artifact, null, 2)}\n`;
const report = {
  mode: dryRun ? "dry-run" : "write",
  input: faqMasterPath,
  output: outputPath,
  approved_count: corpus.length,
  embedding_model: config.model,
  vector_dimensions: vectorDimensions,
  source_hash: artifact.source_hash,
};

if (!dryRun) {
  writeAtomic(outputPath, content);
}

console.log(JSON.stringify(report, null, 2));
