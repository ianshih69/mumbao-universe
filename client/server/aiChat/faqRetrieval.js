const defaultFaqLimit = 5;
const minimumMatchScore = 28;
let hasFaqCache = false;
let faqItemsCache = [];

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

function normalizeText(value) {
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

async function loadFaqItems() {
  if (hasFaqCache) {
    return faqItemsCache;
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
      faqItemsCache = Array.isArray(parsed) ? parsed.filter((item) => item?.is_active) : [];
      hasFaqCache = true;
      return faqItemsCache;
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

  hasFaqCache = true;
  faqItemsCache = [];
  return faqItemsCache;
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
  return terms.some((term) => text.includes(normalizeText(term)));
}

function scoreTopicAlignment({ normalizedQuestion, itemQuestion, answer, category, keywords }) {
  const topics = detectQuestionTopics(normalizedQuestion);
  let score = 0;

  for (const topic of topics) {
    if (includesAnyTerm(itemQuestion, topic.terms)) {
      score += 14;
    }

    if (includesAnyTerm(category, topic.categoryHints)) {
      score += 12;
    }

    if (keywords.some((keyword) => includesAnyTerm(keyword, topic.terms))) {
      score += 8;
    }

    if (includesAnyTerm(answer, topic.terms)) {
      score += 3;
    }
  }

  return score;
}

function scoreFaqItem(item, normalizedQuestion) {
  if (!normalizedQuestion) {
    return { score: 0, isExactQuestionMatch: false, isAliasMatch: false };
  }

  const question = normalizeText(item?.question);
  const answer = normalizeText(item?.answer);
  const category = normalizeText(item?.category);
  const keywords = Array.isArray(item?.keywords) ? item.keywords.map(normalizeKeyword) : [];
  const aliases = getAliasValues(item).map(normalizeText);
  let keywordMatchCount = 0;
  let isExactQuestionMatch = false;
  let isAliasMatch = false;
  let score = 0;

  if (question) {
    if (question === normalizedQuestion) {
      isExactQuestionMatch = true;
      score += 100;
    } else if (
      question.includes(normalizedQuestion) ||
      normalizedQuestion.includes(question)
    ) {
      score += 60;
    } else {
      score += scoreTopicAlignment({
        normalizedQuestion,
        itemQuestion: question,
        answer,
        category,
        keywords,
      });
    }
  }

  for (const alias of aliases) {
    if (!alias) {
      continue;
    }

    if (alias === normalizedQuestion) {
      isAliasMatch = true;
      score += 82;
    } else if (alias.includes(normalizedQuestion) || normalizedQuestion.includes(alias)) {
      isAliasMatch = true;
      score += 55;
    }
  }

  for (const normalizedKeyword of keywords) {
    if (!normalizedKeyword) {
      continue;
    }

    if (normalizedQuestion === normalizedKeyword) {
      keywordMatchCount += 1;
      score += broadKeywords.has(normalizedKeyword) ? 18 : 45;
    } else if (
      normalizedQuestion.includes(normalizedKeyword) ||
      normalizedKeyword.includes(normalizedQuestion)
    ) {
      keywordMatchCount += 1;
      score += broadKeywords.has(normalizedKeyword) ? 8 : 28;
    }
  }

  if (keywordMatchCount > 1) {
    score += Math.min(12, (keywordMatchCount - 1) * 6);
  }

  if (category && normalizedQuestion.includes(category)) {
    score += 8;
  }

  if (answer && answer.includes(normalizedQuestion)) {
    score += 4;
  }

  if (score > 0) {
    score += getPriorityBoost(item?.priority);
  }

  return { score, isExactQuestionMatch, isAliasMatch };
}

function limitCandidates(candidates, requestedLimit) {
  if (!candidates.length) {
    return [];
  }

  const topScore = Number(candidates[0]?.score || 0);
  const secondScore = Number(candidates[1]?.score || 0);
  const hasExactOrAliasTop = Boolean(
    candidates[0]?.isExactQuestionMatch || candidates[0]?.isAliasMatch
  );
  const relativeFloor = hasExactOrAliasTop
    ? Math.max(minimumMatchScore, topScore * 0.4)
    : minimumMatchScore;
  const hasStrongLead = secondScore > 0 && topScore - secondScore >= 60;
  const confidenceLimit = hasExactOrAliasTop && hasStrongLead ? 3 : requestedLimit;

  return candidates
    .filter((entry) => Number(entry?.score || 0) >= relativeFloor)
    .slice(0, Math.min(requestedLimit, confidenceLimit));
}

function normalizeFaqForPrompt(item, score) {
  return {
    id: String(item?.id || ""),
    category: String(item?.category || "未分類"),
    question: String(item?.question || "").trim(),
    answer: String(item?.answer || "").trim(),
    priority: Number(item?.priority) || 0,
    score,
  };
}

export async function retrieveFaqItems(question, options = {}) {
  try {
    const normalizedQuestion = normalizeText(question);
    const faqItems = await loadFaqItems();

    const requestedLimit = Math.max(
      1,
      Math.min(
        Number.parseInt(String(options.limit || defaultFaqLimit), 10) || defaultFaqLimit,
        defaultFaqLimit
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
      });
    const limitedCandidates = limitCandidates(candidates, requestedLimit);

    return limitedCandidates
      .map(({ item, score }) => normalizeFaqForPrompt(item, score));
  } catch (error) {
    console.warn("[ai-chat] FAQ retrieval unavailable:", error);
    return [];
  }
}

export function hasHighConfidenceFaqMatch(items, threshold = 20) {
  return (items || []).some((item) => Number(item?.score || 0) >= threshold);
}

export function buildFaqPromptSection(items) {
  const faqItems = (items || []).filter(
    (item) => item?.question && item?.answer
  );

  if (!faqItems.length) {
    return "";
  }

  const entries = faqItems
    .map(
      (item, index) =>
        `${index + 1}. 分類：${item.category}\n問題：${item.question}\n標準回答：${item.answer}`
    )
    .join("\n\n");

  return `\n\n以下是與使用者問題最相關的問慢寶 FAQ，若與問題相關，請優先依此回答；若不相關，不要硬套。\n${entries}`;
}
