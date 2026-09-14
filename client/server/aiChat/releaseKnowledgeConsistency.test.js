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
    const approvedCsv = csvRows.filter(row => row.status === "approved");
    const approvedJson = faqItems.filter(
      item => item.status === "approved" && item.is_active === true
    );
    const benchmark = JSON.parse(
      readFileSync(
        new URL(
          "../../api/knowledge/faq-selector-benchmark-cases.json",
          import.meta.url
        ),
        "utf8"
      )
    );

    expect(new Set(csvRows.map(row => row.id)).size).toBe(csvRows.length);
    expect(new Set(faqItems.map(item => item.id)).size).toBe(faqItems.length);

    expect(approvedJson.map(item => item.id).sort())
      .toEqual(approvedCsv.map(row => row.id).sort());

    expect(benchmark.source.approved_active_count)
      .toBe(approvedJson.length);

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
    ["faq-050", ["TWD 10,000", "不列入住宿總價、訂金或尾款"]],
    ["faq-079", ["1,000", "最多可延後 1 小時", "12:00"]],
    ["faq-092", ["退房後恕不提供行李寄放"]],
    ["faq-131", ["6 間主題客房"]],
    ["faq-135", ["3 間四人房"]],
    ["faq-203", ["不提供素食早餐"]],
    ["faq-226", ["僅開放狗狗入住", "貓咪暫不開放"]],
    ["faq-234", ["大型犬可入住", "狗狗住宿費"]],
    ["faq-237", ["吃飯碗", "喝水碗", "1 組寵物圍籬"]],
    ["faq-243", ["正常掉毛不會另外收費"]],
    ["faq-244", ["請勿使用民宿毛巾"]],
    ["faq-320", ["TWD 600", "23:00", "提前告知"]],
  ])("keeps %s aligned with the formal rules", (faqId, faqFacts) => {
    const faq = csvById.get(faqId);
    for (const fact of faqFacts) expect(faq.answer).toContain(fact);
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

  it("keeps identity, brand and concise style in the production system prompt", () => {
    const source = readFileSync(new URL("./message.js", import.meta.url), "utf8");
    const matches = [...source.matchAll(/^const systemPrompt = `([^`]*)`;/gm)];
    expect(matches).toHaveLength(1);
    const prompt = matches[0][1];
    expect(prompt).not.toContain("${");
    expect(prompt).toContain("不得自稱 DeepSeek、AI 模型、機器人或其他模型／供應商身分。");
    expect(prompt).toContain("「白雲基地」是慢寶 MUMBAO 在世界觀中的家；現實中的實體場域是宜蘭的「慢慢蒔光 STime Villa」。");
    expect(prompt).toContain("可自然使用白雲基地、慢寶、雲朵、慢慢來、星光管家、療癒等品牌詞，但不要每一句都刻意加入品牌詞。");
    expect(prompt).toContain("交易與結構化政策問題以 1～2 句為主");
    expect(prompt).not.toContain("80～180 字");
  });
});
