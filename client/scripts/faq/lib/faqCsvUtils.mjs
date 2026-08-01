import fs from "node:fs";
import { TextDecoder } from "node:util";

export const faqMasterPath = "client/api/knowledge/faq-master.csv";
export const faqItemsPath = "client/api/knowledge/faq-items.json";
export const canonicalHeaders = [
  "id",
  "category",
  "question",
  "aliases",
  "answer",
  "keywords",
  "answer_mode",
  "status",
  "priority",
  "last_verified_at",
  "internal_note",
];

export const allowedAnswerModes = new Set([
  "direct",
  "collect_info",
  "ask_human",
]);
export const allowedStatuses = new Set([
  "approved",
  "needs_review",
  "archived",
]);

const legacyHeaders = {
  idNumber: "編號",
  category: "分類",
  question: "常見問題",
  answer: "建議標準答案",
  keywords: "關鍵字",
};

const uncertainAnswerPhrases = [
  "依公告為準",
  "需要確認",
  "請先詢問",
  "是否提供依現場",
  "依現場",
  "管家確認",
  "官方 LINE",
  "官方LINE",
];

const highRiskTerms = [
  "價格",
  "房價",
  "多少錢",
  "費用",
  "收費",
  "加錢",
  "訂金",
  "押金",
  "退款",
  "取消",
  "改期",
  "匯款",
  "付款",
  "發票",
  "收據",
  "統編",
  "公司帳",
  "個資",
  "身分",
  "隱私",
  "保險",
  "安全",
  "賠償",
  "法律",
  "客訴",
  "緊急",
];

const knownRuleConflictWarnings = new Map([
  [
    "faq-080",
    "guesthouse-rules.md 寫入住 16:00-17:00；目前答案需人工確認是否一致。",
  ],
  [
    "faq-205",
    "guesthouse-rules.md 寫早餐價格未提供；目前答案若提到固定金額需人工確認。",
  ],
]);

export function readUtf8File(filePath) {
  const buffer = fs.readFileSync(filePath);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(buffer);
}

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && nextChar === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV quote is not closed");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((candidate) =>
    candidate.some((value) => String(value || "").trim() !== "")
  );
}

function stringifyCsvField(value, { quoteAll = true } = {}) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (quoteAll || /[",\r\n]/.test(text)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function stringifyCsv(rows, options = {}) {
  const {
    bom = false,
    lineEnding = "\r\n",
    quoteAll = true,
  } = options;
  const body = rows
    .map((row) =>
      row
        .map((value) => stringifyCsvField(value, { quoteAll }))
        .join(",")
    )
    .join(lineEnding);

  return `${bom ? "\ufeff" : ""}${body}${lineEnding}`;
}

export function splitListCell(value) {
  return String(value || "")
    .split("｜")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function joinListCell(values) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).join(
    "｜"
  );
}

export function stripCategoryPrefix(value) {
  return String(value || "")
    .replace(/^\d+\s*/, "")
    .trim();
}

export function normalizeAnswerMode(value) {
  const mode = String(value || "direct").trim().toLowerCase();
  if (mode === "human") return "ask_human";
  return allowedAnswerModes.has(mode) ? mode : mode;
}

export function normalizeStatus(value) {
  const status = String(value || "approved").trim().toLowerCase();
  return allowedStatuses.has(status) ? status : status;
}

export function makeFaqId(value) {
  const text = String(value || "").trim();
  if (/^faq-\d{3}$/.test(text)) return text;
  const number = Number(text.replace(/^faq-/i, ""));
  if (Number.isInteger(number) && number > 0) {
    return `faq-${String(number).padStart(3, "0")}`;
  }
  return text;
}

export function rowToCanonical(row, headers) {
  const get = (header) => row[headers.indexOf(header)] ?? "";
  const hasCanonical = headers.includes("id");

  if (hasCanonical) {
    return {
      id: makeFaqId(get("id")),
      category: get("category").trim(),
      question: get("question").trim(),
      aliases: joinListCell(splitListCell(get("aliases"))),
      answer: get("answer").trim(),
      keywords: joinListCell(splitListCell(get("keywords"))),
      answer_mode: normalizeAnswerMode(get("answer_mode") || "direct"),
      status: normalizeStatus(get("status") || "approved"),
      priority: String(get("priority") || "80").trim(),
      last_verified_at: get("last_verified_at").trim(),
      internal_note: get("internal_note").trim(),
    };
  }

  return {
    id: makeFaqId(get(legacyHeaders.idNumber)),
    category: stripCategoryPrefix(get(legacyHeaders.category)),
    question: get(legacyHeaders.question).trim(),
    aliases: "",
    answer: get(legacyHeaders.answer).trim(),
    keywords: joinListCell(splitListCell(get(legacyHeaders.keywords))),
    answer_mode: "direct",
    status: "approved",
    priority: "80",
    last_verified_at: "",
    internal_note: "",
  };
}

export function loadFaqMaster(filePath = faqMasterPath) {
  const text = readUtf8File(filePath);
  const rows = parseCsv(text);
  const headers = rows[0] || [];
  const items = rows.slice(1).map((row, index) => ({
    line: index + 2,
    raw: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
    canonical: rowToCanonical(row, headers),
  }));

  return { headers, rows, items, text };
}

export function canonicalRowsFromItems(items) {
  return [
    canonicalHeaders,
    ...items.map(({ canonical }) =>
      canonicalHeaders.map((header) => canonical[header] ?? "")
    ),
  ];
}

function hasSeparatorFormatWarning(value) {
  const text = String(value || "");
  return /[|；;]/.test(text);
}

function isLikelyTruncatedKeyword(keyword, question) {
  const normalizedKeyword = String(keyword || "").replace(/\s+/g, "");
  const normalizedQuestion = String(question || "").replace(/\s+/g, "");
  return (
    normalizedKeyword.length >= 8 &&
    normalizedQuestion.startsWith(normalizedKeyword) &&
    normalizedKeyword.length <= normalizedQuestion.length - 2
  );
}

export function validateFaqMaster(filePath = faqMasterPath) {
  const errors = [];
  const warnings = [];
  let loaded;

  try {
    loaded = loadFaqMaster(filePath);
  } catch (error) {
    return {
      ok: false,
      errors: [`UTF-8 or CSV parse failed: ${error.message}`],
      warnings,
      stats: {},
    };
  }

  const { headers, items, text } = loaded;
  const isCanonical = canonicalHeaders.every((header) => headers.includes(header));
  if (!isCanonical) {
    errors.push(
      `Missing required canonical columns: ${canonicalHeaders
        .filter((header) => !headers.includes(header))
        .join(", ")}`
    );
  }

  if (text.includes("\ufffd")) {
    errors.push("UTF-8 parse produced replacement characters");
  }

  const seenIds = new Set();
  const seenQuestions = new Map();
  const statusCounts = new Map();
  const answerModeCounts = new Map();

  for (const item of items) {
    const row = item.canonical;
    const id = row.id;
    const questionKey = row.question.trim();
    const aliases = splitListCell(row.aliases);
    const keywords = splitListCell(row.keywords);

    statusCounts.set(row.status, (statusCounts.get(row.status) || 0) + 1);
    answerModeCounts.set(
      row.answer_mode,
      (answerModeCounts.get(row.answer_mode) || 0) + 1
    );

    if (!/^faq-\d{3}$/.test(id)) {
      errors.push(`Line ${item.line}: invalid id format "${id}"`);
    }
    if (seenIds.has(id)) {
      errors.push(`Line ${item.line}: duplicate id "${id}"`);
    }
    seenIds.add(id);

    if (!row.question.trim()) {
      errors.push(`Line ${item.line}: empty question`);
    }
    if (!row.answer.trim()) {
      errors.push(`Line ${item.line}: empty answer`);
    }
    if (!allowedStatuses.has(row.status)) {
      errors.push(`Line ${item.line}: invalid status "${row.status}"`);
    }
    if (!allowedAnswerModes.has(row.answer_mode)) {
      errors.push(`Line ${item.line}: invalid answer_mode "${row.answer_mode}"`);
    }
    if (row.status === "approved" && !row.answer.trim()) {
      errors.push(`Line ${item.line}: approved item has empty answer`);
    }

    if (hasSeparatorFormatWarning(row.aliases)) {
      warnings.push(`Line ${item.line} ${id}: aliases should use full-width ｜ separator`);
    }
    if (hasSeparatorFormatWarning(row.keywords)) {
      warnings.push(`Line ${item.line} ${id}: keywords should use full-width ｜ separator`);
    }

    for (const keyword of keywords) {
      if (isLikelyTruncatedKeyword(keyword, row.question)) {
        warnings.push(`Line ${item.line} ${id}: keyword "${keyword}" looks truncated`);
      }
    }

    if (seenQuestions.has(questionKey)) {
      warnings.push(
        `Line ${item.line} ${id}: duplicate question also appears at ${seenQuestions.get(
          questionKey
        )}`
      );
    } else if (questionKey) {
      seenQuestions.set(questionKey, item.line);
    }

    if (
      row.status === "approved" &&
      row.answer_mode === "direct" &&
      uncertainAnswerPhrases.some((phrase) => row.answer.includes(phrase))
    ) {
      warnings.push(
        `Line ${item.line} ${id}: approved+direct answer contains confirmation wording`
      );
    }

    const riskText = `${row.category} ${row.question} ${row.answer}`;
    if (
      row.status === "approved" &&
      row.answer_mode === "direct" &&
      highRiskTerms.some((term) => riskText.includes(term))
    ) {
      warnings.push(
        `Line ${item.line} ${id}: approved+direct item contains high-risk topic`
      );
    }

    if (knownRuleConflictWarnings.has(id)) {
      warnings.push(`Line ${item.line} ${id}: ${knownRuleConflictWarnings.get(id)}`);
    }

    if (aliases.some((alias) => alias.length < 3)) {
      warnings.push(`Line ${item.line} ${id}: alias is very short`);
    }
    if (keywords.some((keyword) => keyword.length > 14)) {
      warnings.push(`Line ${item.line} ${id}: keyword may be a sentence, consider alias`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      rows: items.length,
      columns: headers,
      statusCounts: Object.fromEntries(statusCounts),
      answerModeCounts: Object.fromEntries(answerModeCounts),
      duplicateQuestionWarnings: warnings.filter((warning) =>
        warning.includes("duplicate question")
      ).length,
      warningCount: warnings.length,
    },
  };
}

export function toFaqJsonItem(item) {
  const row = item.canonical;
  const status = normalizeStatus(row.status);
  const isApproved = status === "approved";
  const sourceNo = Number(row.id.replace(/^faq-/, ""));
  const jsonItem = {
    id: row.id,
    category: row.category,
    question: row.question,
    aliases: splitListCell(row.aliases),
    answer: row.answer,
    keywords: splitListCell(row.keywords),
    priority: Number(row.priority) || 80,
    is_active: isApproved,
    status,
    answer_mode: normalizeAnswerMode(row.answer_mode),
    source: "faq-master.csv",
    source_no: sourceNo,
  };

  if (row.last_verified_at) {
    jsonItem.last_verified_at = row.last_verified_at;
  }

  return jsonItem;
}

export function sortFaqItemsById(items) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}
