#!/usr/bin/env node
import fs from "node:fs";
import {
  loadFaqMaster,
  splitListCell,
  stringifyCsv,
} from "./lib/faqCsvUtils.mjs";

const outputPath = "docs/faq-review-queue.csv";
const knownP0 = new Map([
  ["faq-110", "問題問火車交通，但目前答案偏向停車資訊"],
  ["faq-112", "問題問公車，但目前答案偏向停車資訊"],
  ["faq-114", "問題問叫車服務，但目前答案偏向停車資訊"],
  ["faq-125", "退房後景點路線題不可用泛用答案直接承諾"],
  ["faq-205", "早餐價格與 guesthouse-rules.md 的價格未提供需要人工確認"],
  ["faq-411", "行程規劃需要日期、人數、交通與喜好，不適合 direct"],
  ["faq-412", "行程規劃需要日期、人數、交通與喜好，不適合 direct"],
  ["faq-493", "問題問攝影師推薦，但目前答案主題不一致"],
]);

const p0Categories = new Set([
  "房價與付款",
  "取消改期與不可抗力",
  "發票收據資料與身分登記",
  "隱私保險遺失物與客訴",
]);

const p1Categories = new Set([
  "入住退房與抵達",
  "交通停車與周邊",
  "人數房型與包棟",
  "房間設備與備品",
  "公共空間與設施",
  "早餐餐飲與廚房",
  "寵物友善",
  "噪音禁菸安全與規範",
]);

const p2Categories = new Set([
  "旅遊行程與在地推薦",
  "特殊需求與情境應對",
]);

const p0Terms = [
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

const vaguePhrases = [
  "依公告為準",
  "需要確認",
  "請先詢問",
  "依現場",
  "管家確認",
  "官方 LINE",
  "官方LINE",
  "協助確認",
  "另行確認",
  "視",
];

const actionByPriority = {
  P0: "人工確認正確答案；必要時改 status=needs_review 並改 answer_mode=collect_info 或 ask_human",
  P1: "補足具體條件、限制或改為 collect_info；若只是同義問法，整理成 aliases",
  P2: "整理 aliases、合併重複題或補充較溫和的說法",
};

const suggestedModeByPriority = {
  P0: "ask_human",
  P1: "collect_info",
  P2: "direct",
};

const { items } = loadFaqMaster();
const answerGroups = new Map();
for (const item of items) {
  const answer = item.canonical.answer;
  answerGroups.set(answer, [...(answerGroups.get(answer) || []), item.canonical.id]);
}

const rows = [];
for (const item of items) {
  const row = item.canonical;
  const review = classify(row, answerGroups.get(row.answer) || []);
  if (!review) continue;

  rows.push({
    priority: review.priority,
    faq_id: row.id,
    category: row.category,
    question: row.question,
    current_answer: row.answer,
    risk_type: review.riskType,
    audit_reason: review.reason,
    suggested_status: "needs_review",
    suggested_answer_mode: review.suggestedMode,
    suggested_action: actionByPriority[review.priority],
    owner_note: "",
  });
}

rows.sort((left, right) => {
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  return (
    priorityOrder[left.priority] - priorityOrder[right.priority] ||
    left.faq_id.localeCompare(right.faq_id)
  );
});

const outputRows = [
  [
    "priority",
    "faq_id",
    "category",
    "question",
    "current_answer",
    "risk_type",
    "audit_reason",
    "suggested_status",
    "suggested_answer_mode",
    "suggested_action",
    "owner_note",
  ],
  ...rows.map((row) => [
    row.priority,
    row.faq_id,
    row.category,
    row.question,
    row.current_answer,
    row.risk_type,
    row.audit_reason,
    row.suggested_status,
    row.suggested_answer_mode,
    row.suggested_action,
    row.owner_note,
  ]),
];

fs.writeFileSync(outputPath, stringifyCsv(outputRows), "utf8");

const counts = rows.reduce(
  (accumulator, row) => {
    accumulator[row.priority] += 1;
    accumulator.total += 1;
    return accumulator;
  },
  { P0: 0, P1: 0, P2: 0, total: 0 }
);

console.log(JSON.stringify({ outputPath, ...counts }, null, 2));

function classify(row, duplicateIds) {
  if (knownP0.has(row.id)) {
    return {
      priority: "P0",
      riskType: "known_high_risk",
      reason: knownP0.get(row.id),
      suggestedMode: suggestedModeByPriority.P0,
    };
  }

  const riskText = `${row.category} ${row.question}`;
  if (
    p0Categories.has(row.category) ||
    p0Terms.some((term) => riskText.includes(term))
  ) {
    return {
      priority: "P0",
      riskType: "price_refund_privacy_safety_or_policy",
      reason: "價格、退款、押金、付款、發票、個資、安全或客服承諾類題目不宜直接核准為 direct",
      suggestedMode: suggestedModeByPriority.P0,
    };
  }

  if (p1Categories.has(row.category)) {
    return {
      priority: "P1",
      riskType: "operational_detail",
      reason: "設備、房型、交通、寵物、入住規範或現場條件需要人工確認是否足夠具體",
      suggestedMode: suggestedModeByPriority.P1,
    };
  }

  if (vaguePhrases.some((phrase) => row.answer.includes(phrase))) {
    return {
      priority: "P1",
      riskType: "vague_answer",
      reason: "答案含確認或依公告語氣，建議檢查是否應改 collect_info 或 ask_human",
      suggestedMode: suggestedModeByPriority.P1,
    };
  }

  if (p2Categories.has(row.category)) {
    return {
      priority: "P2",
      riskType: "soft_recommendation_or_scenario",
      reason: "景點、餐廳、推薦或情境型回答建議人工整理 aliases 與適用條件",
      suggestedMode: suggestedModeByPriority.P2,
    };
  }

  if (duplicateIds.length >= 5) {
    return {
      priority: "P2",
      riskType: "duplicate_answer_group",
      reason: `與 ${duplicateIds.length} 題共用相同答案，建議檢查是否可合併為 aliases`,
      suggestedMode: suggestedModeByPriority.P2,
    };
  }

  const keywords = splitListCell(row.keywords);
  if (keywords.some((keyword) => keyword.length > 12)) {
    return {
      priority: "P2",
      riskType: "keyword_should_be_alias",
      reason: "keyword 接近完整問句，建議搬到 aliases，keywords 保留短詞",
      suggestedMode: suggestedModeByPriority.P2,
    };
  }

  return null;
}
