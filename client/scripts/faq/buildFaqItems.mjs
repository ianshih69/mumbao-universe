#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  faqItemsPath,
  faqMasterPath,
  loadFaqMaster,
  sortFaqItemsById,
  toFaqJsonItem,
  validateFaqMaster,
} from "./lib/faqCsvUtils.mjs";

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

const dryRun = process.argv.includes("--dry-run");
const outputPath = getArgValue("--output") || faqItemsPath;
const validation = validateFaqMaster(faqMasterPath);

if (!validation.ok) {
  console.error("FAQ master validation failed; faq-items.json was not written.");
  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const { items } = loadFaqMaster(faqMasterPath);
const jsonItems = sortFaqItemsById(items.map(toFaqJsonItem));
const nextJson = `${JSON.stringify(jsonItems, null, 2)}\n`;
let currentJson = "";

try {
  currentJson = fs.readFileSync(faqItemsPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const report = {
  mode: dryRun ? "dry-run" : "write",
  input: faqMasterPath,
  output: outputPath,
  rows: jsonItems.length,
  currentSha256: currentJson ? sha256(currentJson) : null,
  nextSha256: sha256(nextJson),
  wouldChangeCurrent: currentJson ? currentJson !== nextJson : true,
  validationWarnings: validation.warnings.length,
};

if (dryRun) {
  if (outputPath !== faqItemsPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    writeAtomic(outputPath, nextJson);
    report.dryRunArtifact = outputPath;
  } else {
    const tempPath = path.join(os.tmpdir(), `mumbao-faq-items-${Date.now()}.json`);
    writeAtomic(tempPath, nextJson);
    report.dryRunArtifact = tempPath;
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

writeAtomic(outputPath, nextJson);
console.log(JSON.stringify(report, null, 2));
