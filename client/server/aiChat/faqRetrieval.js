const defaultFaqLimit = 5;
const minimumMatchScore = 28;
const highConfidenceScore = 70;
const strongScoreGap = 18;
let hasRawFaqCache = false;
let rawFaqItemsCache = [];

const broadKeywords = new Set([
  "包棟",
  "寵物",
  "入住",
  "退房",
  "訂房",
  "早餐",
  "停車",
  "費用",
  "價格",
  "清潔",
  "訪客",
  "房間",
  "房型",
]);

const topicSignals = [
  {
    name: "pet",
    terms: ["寵物", "毛孩", "狗", "狗狗", "貓", "貓咪", "大型犬", "小型犬", "犬"],
    categoryHints: ["寵物"],
  },
  {
    name: "fee",
    terms: ["加錢", "收費", "費用", "多少錢", "價格", "錢", "清潔費"],
    categoryHints: ["房價", "付款", "費用"],
  },
  {
    name: "privateVilla",
    terms: ["包棟"],
    categoryHints: ["包棟", "訂房", "房價", "付款", "人數", "房型"],
  },
  {
    name: "booking",
    terms: ["訂房", "預訂", "預約", "怎麼訂", "如何訂"],
    categoryHints: ["訂房", "空房"],
  },
  {
    name: "breakfast",
    terms: ["早餐"],
    categoryHints: ["早餐", "餐飲", "廚房"],
  },
  {
    name: "singing",
    terms: ["唱歌", "歡唱", "ktv", "卡拉ok"],
    categoryHints: ["ktv", "娛樂", "噪音", "規範"],
  },
  {
    name: "parking",
    terms: ["停車", "停車位", "車位"],
    categoryHints: ["交通", "停車"],
  },
];

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[，。！？、；：「」『』（）()\[\]【】"'`~!@#$%^&*_+=|\\/:;,.?<>-]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeKeyword(value) {
  return normalizeText(value);
}

function getPriorityBoost(priority) {
  const value = Number(priority);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(6, value / 15);
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeAnswerMode(value) {
  const mode = String(value || "direct").trim().toLowerCase();
  if (mode === "human") return "ask_human";
  if (mode === "ask_human" || mode === "collect_info" || mode === "direct") {
    return mode;
  }
  return "direct";
}

export function isApprovedActiveFaqItem(item) {
  return (
    item?.is_active === true &&
    normalizeStatus(item?.status) === "approved" &&
    Boolean(String(item?.question || "").trim()) &&
    Boolean(String(item?.answer || "").trim())
  );
}

async function loadRawFaqItems() {
  if (hasRawFaqCache) {
    return rawFaqItemsCache;
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const cwd = process.cwd();
  const candidatePaths = [
    path.join(cwd, "api", "knowledge", "faq-items.json"),
    path.join(cwd, "client", "api", "knowledge", "faq-items.json"),
  ];

  for (const faqPath of candidatePaths) {
    try {
      const raw = await fs.readFile(faqPath, "utf8");
      const parsed = JSON.parse(raw);
      rawFaqItemsCache = Array.isArray(parsed) ? parsed : [];
      hasRawFaqCache = true;
      return rawFaqItemsCache;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("[ai-chat] failed to load FAQ knowledge:", {
          path: faqPath,
          message: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  }

  hasRawFaqCache = true;
  rawFaqItemsCache = [];
  return rawFaqItemsCache;
}

export async function loadFaqItems(options = {}) {
  const items = Array.isArray(options.items)
    ? options.items
    : await loadRawFaqItems();
  return options.includeAll ? items : items.filter(isApprovedActiveFaqItem);
}

function getAliasValues(item) {
  return [
    item?.alias,
    ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ...(Array.isArray(item?.alternate_questions) ? item.alternate_questions : []),
    ...(Array.isArray(item?.alternative_questions) ? item.alternative_questions : []),
  ].filter(Boolean);
}

function detectQuestionTopics(normalizedQuestion) {
  return topicSignals.filter((topic) =>
    topic.terms.some((term) => normalizedQuestion.includes(normalizeText(term)))
  );
}

function includesAnyTerm(text, terms) {
  const normalizedText = normalizeText(text);
  return terms.some((term) => normalizedText.includes(normalizeText(term)));
}

function scoreTopicAlignment({
  normalizedQuestion,
  itemQuestion,
  answer,
  category,
  keywords,
}) {
  const topics = detectQuestionTopics(normalizedQuestion);
  let score = 0;
  let categoryAlignment = false;
  const topicNames = [];

  for (const topic of topics) {
    let topicScore = 0;

    if (includesAnyTerm(itemQuestion, topic.terms)) {
      topicScore += 14;
    }

    if (includesAnyTerm(category, topic.categoryHints)) {
      topicScore += 12;
      categoryAlignment = true;
    }

    if (keywords.some((keyword) => includesAnyTerm(keyword, topic.terms))) {
      topicScore += 8;
    }

    if (includesAnyTerm(answer, topic.terms)) {
      topicScore += 3;
    }

    if (topicScore > 0) {
      topicNames.push(topic.name);
      score += topicScore;
    }
  }

  return { score, categoryAlignment, topicNames };
}

function scoreFaqItem(item, normalizedQuestion) {
  if (!normalizedQuestion) {
    return {
      score: 0,
      isExactQuestionMatch: false,
      isAliasMatch: false,
      matchedFields: [],
      keywordMatchCount: 0,
      broadKeywordMatchCount: 0,
      nonBroadKeywordMatchCount: 0,
      categoryAlignment: false,
      topicNames: [],
    };
  }

  const question = normalizeText(item?.question);
  const answer = normalizeText(item?.answer);
  const category = normalizeText(item?.category);
  const keywords = Array.isArray(item?.keywords)
    ? item.keywords.map(normalizeKeyword)
    : [];
  const aliases = getAliasValues(item).map(normalizeText);
  const matchedFields = [];
  let keywordMatchCount = 0;
  let broadKeywordMatchCount = 0;
  let nonBroadKeywordMatchCount = 0;
  let isExactQuestionMatch = false;
  let isAliasMatch = false;
  let score = 0;
  let categoryAlignment = false;
  let topicNames = [];

  if (question) {
    if (question === normalizedQuestion) {
      isExactQuestionMatch = true;
      matchedFields.push("question_exact");
      score += 100;
    } else if (
      question.includes(normalizedQuestion) ||
      normalizedQuestion.includes(question)
    ) {
      matchedFields.push("question_partial");
      score += 60;
    } else {
      const topicScore = scoreTopicAlignment({
        normalizedQuestion,
        itemQuestion: question,
        answer,
        category,
        keywords,
      });
      score += topicScore.score;
      categoryAlignment = topicScore.categoryAlignment;
      topicNames = topicScore.topicNames;
      if (topicScore.score > 0) {
        matchedFields.push("topic_alignment");
      }
    }
  }

  for (const alias of aliases) {
    if (!alias) {
      continue;
    }

    if (alias === normalizedQuestion) {
      isAliasMatch = true;
      matchedFields.push("alias_exact");
      score += 82;
    } else if (alias.includes(normalizedQuestion) || normalizedQuestion.includes(alias)) {
      isAliasMatch = true;
      matchedFields.push("alias_partial");
      score += 55;
    }
  }

  for (const normalizedKeyword of keywords) {
    if (!normalizedKeyword) {
      continue;
    }

    const isBroadKeyword = broadKeywords.has(normalizedKeyword);
    const isMatch =
      normalizedQuestion === normalizedKeyword ||
      normalizedQuestion.includes(normalizedKeyword) ||
      normalizedKeyword.includes(normalizedQuestion);

    if (!isMatch) {
      continue;
    }

    keywordMatchCount += 1;
    if (isBroadKeyword) {
      broadKeywordMatchCount += 1;
    } else {
      nonBroadKeywordMatchCount += 1;
    }

    matchedFields.push(isBroadKeyword ? "keyword_broad" : "keyword");
    if (normalizedQuestion === normalizedKeyword) {
      score += isBroadKeyword ? 18 : 45;
    } else {
      score += isBroadKeyword ? 8 : 28;
    }
  }

  if (keywordMatchCount > 1) {
    score += Math.min(12, (keywordMatchCount - 1) * 6);
  }

  if (category && normalizedQuestion.includes(category)) {
    categoryAlignment = true;
    matchedFields.push("category");
    score += 8;
  }

  if (answer && answer.includes(normalizedQuestion)) {
    matchedFields.push("answer");
    score += 4;
  }

  if (score > 0) {
    score += getPriorityBoost(item?.priority);
  }

  return {
    score,
    isExactQuestionMatch,
    isAliasMatch,
    matchedFields: Array.from(new Set(matchedFields)),
    keywordMatchCount,
    broadKeywordMatchCount,
    nonBroadKeywordMatchCount,
    categoryAlignment,
    topicNames: Array.from(new Set(topicNames)),
  };
}

function getScoreGap(candidates, index) {
  if (index !== 0) {
    return Number(candidates[0]?.score || 0) - Number(candidates[index]?.score || 0);
  }

  return Number(candidates[0]?.score || 0) - Number(candidates[1]?.score || 0);
}

function getRejectionReason(entry, candidates, index, normalizedQuestion) {
  if (!isApprovedActiveFaqItem(entry.item)) return "not_approved_active";
  if (entry.score < minimumMatchScore) return "below_minimum_score";

  const scoreGap = getScoreGap(candidates, index);
  const second = candidates[index === 0 ? 1 : 0];
  const closeDifferentCategory =
    second &&
    Math.abs(Number(entry.score || 0) - Number(second.score || 0)) < strongScoreGap &&
    String(second.item?.category || "") !== String(entry.item?.category || "");
  const singleBroadKeywordQuery =
    broadKeywords.has(normalizedQuestion) &&
    !entry.isExactQuestionMatch &&
    !entry.isAliasMatch &&
    entry.nonBroadKeywordMatchCount === 0;

  if (singleBroadKeywordQuery) return "single_broad_keyword";
  if (closeDifferentCategory) return "close_cross_category_candidate";
  if (index === 0 && candidates[1] && scoreGap < strongScoreGap) {
    return "top_score_gap_too_small";
  }
  if (
    !entry.isExactQuestionMatch &&
    !entry.isAliasMatch &&
    entry.score < highConfidenceScore
  ) {
    return "medium_score";
  }
  if (
    !entry.isExactQuestionMatch &&
    !entry.isAliasMatch &&
    !entry.categoryAlignment &&
    entry.topicNames.length > 0
  ) {
    return "topic_not_aligned";
  }

  return "";
}

function getConfidence(entry, candidates, index, normalizedQuestion) {
  if (entry.score < minimumMatchScore) return "none";

  const rejectionReason = getRejectionReason(
    entry,
    candidates,
    index,
    normalizedQuestion
  );

  if (entry.isExactQuestionMatch || entry.isAliasMatch) {
    return rejectionReason === "close_cross_category_candidate" ? "medium" : "high";
  }

  if (!rejectionReason && entry.score >= highConfidenceScore) {
    return "high";
  }

  if (entry.score >= 45 || rejectionReason === "single_broad_keyword") {
    return "medium";
  }

  return "low";
}

function enrichCandidate(entry, candidates, index, normalizedQuestion) {
  const scoreGap = getScoreGap(candidates, index);
  const confidence = getConfidence(entry, candidates, index, normalizedQuestion);
  const rejectionReason =
    confidence === "high"
      ? ""
      : getRejectionReason(entry, candidates, index, normalizedQuestion) ||
        "not_high_confidence";

  return {
    ...entry,
    confidence,
    scoreGap,
    rejectionReason,
  };
}

function limitCandidates(candidates, requestedLimit) {
  if (!candidates.length) {
    return [];
  }

  const topScore = Number(candidates[0]?.score || 0);
  const hasExactOrAliasTop = Boolean(
    candidates[0]?.isExactQuestionMatch || candidates[0]?.isAliasMatch
  );
  const relativeFloor = hasExactOrAliasTop
    ? Math.max(minimumMatchScore, topScore * 0.4)
    : minimumMatchScore;

  return candidates
    .filter((entry) => Number(entry?.score || 0) >= relativeFloor)
    .slice(0, requestedLimit);
}

function normalizeFaqForPrompt(entry) {
  const { item } = entry;
  return {
    id: String(item?.id || ""),
    category: String(item?.category || "未分類"),
    question: String(item?.question || "").trim(),
    answer: String(item?.answer || "").trim(),
    answer_mode: normalizeAnswerMode(item?.answer_mode),
    priority: Number(item?.priority) || 0,
    score: Number(entry.score || 0),
    matchedFields: entry.matchedFields || [],
    exactMatch: Boolean(entry.isExactQuestionMatch),
    aliasMatch: Boolean(entry.isAliasMatch),
    categoryAlignment: Boolean(entry.categoryAlignment),
    confidence: entry.confidence || "none",
    scoreGap: Number(entry.scoreGap || 0),
    rejectionReason: entry.rejectionReason || "",
  };
}

export async function retrieveFaqItems(question, options = {}) {
  try {
    const normalizedQuestion = normalizeText(question);
    const faqItems = await loadFaqItems(options);

    const requestedLimit = Math.max(
      1,
      Math.min(
        Number.parseInt(String(options.limit || defaultFaqLimit), 10) ||
          defaultFaqLimit,
        Number.parseInt(String(options.maxLimit || 8), 10) || 8
      )
    );
    const candidates = faqItems
      .map((item) => ({
        item,
        ...scoreFaqItem(item, normalizedQuestion),
      }))
      .filter((entry) => entry.score >= minimumMatchScore)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return (Number(second.item?.priority) || 0) - (Number(first.item?.priority) || 0);
      })
      .map((entry, index, allCandidates) =>
        enrichCandidate(entry, allCandidates, index, normalizedQuestion)
      );
    const limitedCandidates = limitCandidates(candidates, requestedLimit);

    return limitedCandidates.map(normalizeFaqForPrompt);
  } catch (error) {
    console.warn("[ai-chat] FAQ retrieval unavailable:", error);
    return [];
  }
}

export function hasHighConfidenceFaqMatch(items) {
  return (items || []).some((item) => item?.confidence === "high");
}

export function buildFaqPromptSection(items) {
  const faqItems = (items || []).filter(
    (item) =>
      item?.confidence === "high" &&
      item?.question &&
      item?.answer &&
      normalizeAnswerMode(item?.answer_mode) !== "ask_human"
  );

  if (!faqItems.length) {
    return "";
  }

  const entries = faqItems
    .map(
      (item) =>
        `FAQ ID: ${item.id}\n問題: ${item.question}\n標準答案: ${item.answer}\n分類: ${item.category}\n回答模式: ${normalizeAnswerMode(item.answer_mode)}`
    )
    .join("\n\n");

  return `<approved_knowledge>\n${entries}\n</approved_knowledge>`;
}
