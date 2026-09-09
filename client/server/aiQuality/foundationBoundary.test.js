import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const client = fileURLToPath(new URL("../../", import.meta.url));
function sources(directory) {
  return readdirSync(directory, {withFileTypes:true}).flatMap((entry) => {
    const full = path.join(directory,entry.name);
    if (entry.isDirectory()) return entry.name==="aiQuality" ? [] : sources(full);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [full] : [];
  });
}
describe("Quality sidecar integration boundary", () => {
  it("has one bounded DB authority and no LLM, analyzer, file-write or raw logging surface", () => {
    const calls = [];
    const imports = [];
    for (const name of ["observer.js", "snapshot.js", "signals.js", "persistence.js"]) {
      const text = readFileSync(new URL(name, import.meta.url), "utf8");
      const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function visit(node) {
        if (ts.isCallExpression(node)) {
          calls.push([name, node.expression.getText(source)]);
          if (node.expression.getText(source) === "console.warn") {
            expect(node.arguments.map(value => value.getText(source)).join(" ")).not.toMatch(/snapshot|payload|error\.|source_id|user_text|assistant_text/);
          }
        }
        if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(text).not.toMatch(/DEEPSEEK_API_KEY|aggregate_ai_daily_metrics|ai_review_items|ai_daily_metrics|JSON\.stringify\((?:before|after|context|snapshot|error)\)/);
    }
    expect(imports).not.toContain("node:fs");
    expect(imports.some(value => /deepSeek|semanticOrchestrator|Provider|Resolver|Router/.test(value))).toBe(false);
    expect(calls.filter(([, call]) => /^(?:fetch|fetchImpl)$/.test(call))).toEqual([["persistence.js", "fetchImpl"]]);
    expect(calls.filter(([, call]) => /writeFile|appendFile|createClient|applyScenarioTransition|matchSemantic|console\.(log|info|error)/.test(call))).toEqual([]);
  });
  it("allows only the completed-turn hook and the two approved server quality APIs", () => {
    const forbidden = /\b(?:aiQuality|sanitizeAiQualityText|hashAiQualityConversationKey|ai_quality_(?:conversations|messages|events)|aggregate_ai_daily_metrics|delete_expired_ai_quality_data)\b/;
    const offenders = ["api","server","src"].flatMap((folder) => sources(path.join(client,folder)))
      .filter((file) => forbidden.test(readFileSync(file,"utf8")))
      .map((file) => path.relative(client,file));
    expect(offenders.sort()).toEqual([
      path.join("api", "admin-ai-quality.js"),
      path.join("api", "ai-quality-feedback.js"),
      path.join("server", "aiChat", "message.js"),
    ].sort());
  });
  it("quality helpers contain no network, DB, file-write or logging calls and only one dedicated env lookup", () => {
    const calls = [];
    const envReads = [];
    const imports = [];
    for (const name of ["privacy.js","metadata.js"]) {
      const source = ts.createSourceFile(name,readFileSync(new URL(name,import.meta.url),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
      function visit(node) {
        if (ts.isCallExpression(node)) calls.push(node.expression.getText(source));
        if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
        if (ts.isPropertyAccessExpression(node) && node.expression.getText(source)==="process.env") envReads.push(node.name.text);
        if (ts.isElementAccessExpression(node)) expect(node.expression.getText(source)).not.toBe("process.env");
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
    expect(imports.sort()).toEqual(["../aiChat/dialogueCapabilities.js","./privacy.js","node:crypto"].sort());
    expect(envReads).toEqual(["AI_QUALITY_HMAC_SECRET"]);
    expect(calls.filter((name) => /^(?:console\.|fetch$|axios\b|createClient$|writeFile|appendFile|setInterval$|setTimeout$)/.test(name))).toEqual([]);
  });
});
