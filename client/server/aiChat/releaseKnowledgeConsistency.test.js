import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalHeaders,
  parseCsv,
  splitListCell,
} from "../../scripts/faq/lib/faqCsvUtils.mjs";

const csvText = readFileSync(
  new URL("../../api/knowledge/faq-master.csv", import.meta.url),
  "utf8",
);
const mdText = readFileSync(
  new URL("../../api/knowledge/guesthouse-rules.md", import.meta.url),
  "utf8",
);
const faqItems = JSON.parse(
  readFileSync(
    new URL("../../api/knowledge/faq-items.json", import.meta.url),
    "utf8",
  ),
);
const [headers, ...values] = parseCsv(csvText);
const csvRows = values.map(row =>
  Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])),
);
const csvById = new Map(csvRows.map(row => [row.id, row]));

describe("release knowledge consistency", () => {
  it("keeps every approved CSV row fresh in the runtime JSON projection", () => {
    expect(headers).toEqual(canonicalHeaders);
    expect(csvRows).toHaveLength(310);
    expect(faqItems).toHaveLength(310);

    for (const item of faqItems) {
      const source = csvById.get(item.id);
      expect(source, item.id).toBeDefined();
      expect(item, item.id).toMatchObject({
        id: source.id,
        category: source.category,
        question: source.question,
        aliases: splitListCell(source.aliases),
        answer: source.answer,
        keywords: splitListCell(source.keywords),
        answer_mode: source.answer_mode,
        priority: Number(source.priority),
        status: "approved",
        is_active: true,
      });
      expect(item, item.id).not.toHaveProperty("internal_note");
    }
  });

  it.each([
    ["faq-050", ["TWD 10,000", "不列入住宿總價、訂金或尾款"], ["一般住宿押金 TWD 10,000", "不列入住宿總價、訂金或尾款"]],
    ["faq-079", ["1,000", "最多可延後 1 小時", "12:00"], ["TWD 1,000", "最多延後 1 小時", "12:00"]],
    ["faq-092", ["退房後恕不提供行李寄放"], ["退房時間：隔日 11:00 前"]],
    ["faq-131", ["6 間主題客房"], ["共有 6 間主題客房"]],
    ["faq-135", ["3 間四人房"], ["3 間四人房"]],
    ["faq-203", ["不提供素食早餐"], ["不提供素食早餐"]],
    ["faq-226", ["僅開放狗狗入住", "貓咪暫不開放"], ["目前僅開放狗狗入住", "貓咪目前不開放"]],
    ["faq-234", ["大型犬可入住", "狗狗住宿費"], ["大型犬可以入住", "狗狗住宿費"]],
    ["faq-237", ["吃飯碗", "喝水碗", "1 組寵物圍籬"], ["吃飯碗", "喝水碗", "1 組寵物圍籬"]],
    ["faq-243", ["正常掉毛不會另外收費"], ["狗狗住宿費"]],
    ["faq-244", ["請勿使用民宿毛巾"], ["寵物入住公約"]],
    ["faq-320", ["TWD 600", "23:00", "提前告知"], ["TWD 600", "23:00", "提前告知"]],
  ])("keeps %s aligned with the formal rules", (faqId, faqFacts, mdFacts) => {
    const faq = csvById.get(faqId);
    for (const fact of faqFacts) expect(faq.answer).toContain(fact);
    for (const fact of mdFacts) expect(mdText).toContain(fact);
  });

  it("keeps review-required answers within their internal evidence scope", () => {
    expect(csvById.get("faq-271")).toMatchObject({ answer_mode: "ask_human" });
    expect(csvById.get("faq-271").answer).toContain("由管家協助確認");
    expect(csvById.get("faq-271").internal_note).toContain("不得直接承諾");

    expect(csvById.get("faq-437").answer).toContain("發票能否事後補開");
    expect(csvById.get("faq-437").answer).toContain("若需要的是收據");
    expect(csvById.get("faq-437").internal_note).toContain("不承諾");

    expect(csvById.get("faq-453").answer).toContain("當期有效保單");
    expect(csvById.get("faq-453").internal_note).toContain("不得直接承諾已投保");

    expect(csvById.get("faq-467").answer).not.toContain("即可獲贈");
    expect(csvById.get("faq-467").internal_note).toContain("不得承諾");
  });

  it("uses the concise response-style authority in both runtime and rules", () => {
    expect(mdText).toContain("交易與結構化政策回答以 1～2 句為主");
    expect(mdText).not.toContain("80～180 字");
  });
});
