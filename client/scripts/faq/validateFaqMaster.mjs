#!/usr/bin/env node
import { faqMasterPath, validateFaqMaster } from "./lib/faqCsvUtils.mjs";

const result = validateFaqMaster(faqMasterPath);

console.log(
  JSON.stringify(
    {
      file: faqMasterPath,
      ok: result.ok,
      rows: result.stats.rows || 0,
      columns: result.stats.columns || [],
      statusCounts: result.stats.statusCounts || {},
      answerModeCounts: result.stats.answerModeCounts || {},
      errors: result.errors.length,
      warnings: result.warnings.length,
    },
    null,
    2
  )
);

if (result.errors.length > 0) {
  console.error("\nFAQ master validation errors:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
}

if (result.warnings.length > 0) {
  console.warn("\nFAQ master warning summary:");
  for (const warning of result.warnings.slice(0, 80)) {
    console.warn(`- ${warning}`);
  }
  if (result.warnings.length > 80) {
    console.warn(`- ... ${result.warnings.length - 80} more warnings`);
  }
}

process.exit(result.ok ? 0 : 1);
