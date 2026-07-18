import { readFile } from "node:fs/promises";
import path from "node:path";

let knowledgeCache = null;

function getKnowledgeCandidates() {
  const cwd = process.cwd();
  const moduleDirectory =
    typeof __dirname === "string" && __dirname ? __dirname : null;

  return [
    ...(moduleDirectory
      ? [
          {
            source: "module_relative",
            location: path.join(
              moduleDirectory,
              "..",
              "..",
              "api",
              "knowledge",
              "guesthouse-rules.md"
            ),
          },
        ]
      : []),
    {
      source: "project_root",
      location: path.join(cwd, "api", "knowledge", "guesthouse-rules.md"),
    },
    {
      source: "repository_root",
      location: path.join(
        cwd,
        "client",
        "api",
        "knowledge",
        "guesthouse-rules.md"
      ),
    },
  ];
}

export async function loadGuesthouseKnowledge() {
  if (knowledgeCache !== null) {
    return knowledgeCache;
  }

  for (const candidate of getKnowledgeCandidates()) {
    try {
      knowledgeCache = await readFile(candidate.location, "utf8");
      return knowledgeCache;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[ai-chat] guesthouse knowledge load failed", {
          source: candidate.source,
          code: String(error?.code || "read_failed").slice(0, 80),
        });
      }
    }
  }

  console.warn("[ai-chat] guesthouse knowledge unavailable", {
    code: "knowledge_file_not_found",
  });
  return "";
}
