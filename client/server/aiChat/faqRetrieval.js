const defaultFaqLimit = 8;
const minimumMatchScore = 12;
let hasFaqCache = false;
let faqItemsCache = [];

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

  return Math.min(10, value / 10);
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

function scoreFaqItem(item, normalizedQuestion) {
  if (!normalizedQuestion) {
    return 0;
  }

  const question = normalizeText(item?.question);
  const answer = normalizeText(item?.answer);
  const category = normalizeText(item?.category);
  const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
  let score = 0;

  if (question) {
    if (question === normalizedQuestion) {
      score += 70;
    } else if (
      question.includes(normalizedQuestion) ||
      normalizedQuestion.includes(question)
    ) {
      score += 45;
    }
  }

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (normalizedQuestion === normalizedKeyword) {
      score += 28;
    } else if (
      normalizedQuestion.includes(normalizedKeyword) ||
      normalizedKeyword.includes(normalizedQuestion)
    ) {
      score += normalizedKeyword.length <= 1 ? 10 : 18;
    }
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

  return score;
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
    const limit = Math.max(
      1,
      Math.min(Number.parseInt(String(options.limit || defaultFaqLimit), 10) || defaultFaqLimit, 10)
    );
    const faqItems = await loadFaqItems();

    return faqItems
      .map((item) => ({
        item,
        score: scoreFaqItem(item, normalizedQuestion),
      }))
      .filter((entry) => entry.score >= minimumMatchScore)
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }

        return (Number(second.item?.priority) || 0) - (Number(first.item?.priority) || 0);
      })
      .slice(0, limit)
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
