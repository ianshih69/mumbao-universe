import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectResidualHighRiskPii, sanitizeAiQualityText } from "./privacy.js";
import { prepareAiQualityTurn } from "./observer.js";
import { buildAiQualityTurnSnapshot } from "./snapshot.js";
import { persistAiQualityTurn } from "./persistence.js";

// Synthetic identities and locations; no customer records are used.
const names = ["王小明", "陳美玲", "林志豪", "張雅婷", "John Chen", "Mary Lin"];
const addresses = [
  "新北市板橋區文化路一段123號", "臺北市大安區和平東路二段321號3樓",
  "桃園市中壢區中正路45巷6弄789號", "臺中市西屯區臺灣大道三段456號",
  "高雄市苓雅區青年一路567號之2", "宜蘭縣員山鄉深洲二路159號",
];
const corpus = [];
for (const name of names) for (const label of ["姓名", "訂房人", "聯絡人", "入住人", "guest_name", "contact_name", "customer_name"])
  for (const separator of [":", "：", " ", ":\n"])
    corpus.push({ id: "label-" + corpus.length, input: label + separator + name + "，2026/11/01 10人 22公斤 25000", forbidden: [name] });
for (const name of names) for (const intro of ["我是", "我叫", "我的名字是"])
  corpus.push({ id: "intro-" + corpus.length, input: intro + name + "，想訂2026/11/01", forbidden: [name] });
for (const address of addresses) for (const intro of ["我住", "地址:", "地址：", "寄送地址: ", "請寄到", "address: "])
  corpus.push({ id: "address-" + corpus.length, input: intro + address + "，2026/11/01", forbidden: [address] });
for (let i = 0; i < 48; i++) {
  const name = names[i % names.length], address = addresses[i % addresses.length];
  const phone = "0988-123-456", email = "quality.person@example.invalid";
  corpus.push({ id: "mixed-" + i, input: "姓名：" + name + "\n地址：" + address +
    "\n電話 " + phone + " email " + email + "\n訂房編號 8752989600 銀行帳號 123-456-789012" +
    "\n卡號 4111 1111 1111 1111 身分證 A123456789 api_key=synthetic-private\n2026/11/01 25000 22公斤",
  forbidden: [name, address, phone, email, "8752989600", "123-456-789012", "4111 1111 1111 1111", "A123456789", "synthetic-private"] });
}
const ordinary = [
  "我是10人", "我是10人入住", "我是宜蘭人", "我是帶狗入住", "我是星期五入住", "我是帶一隻狗",
  "我是王老師", "我是陳先生的朋友", "我是會員", "我叫一台計程車", "我是來自板橋",
  "宜蘭", "員山", "宜蘭員山", "宜蘭民宿", "板橋", "文化路", "深洲二路", "我要去宜蘭員山",
  "民宿在深洲二路嗎？", "22公斤", "25000", "49000", "2026/11/01", "15:00", "5–10月",
  "我是慢寶，住在宜蘭員山", "I am bringing my dog", "I am booking two nights",
  "姓名可以晚點提供嗎？", "地址在哪裡？", "我住宜蘭", "我住文化路", "三位成人兩位兒童",
  "早餐250元", "第二晚95折", "30%訂金70%尾款", "faq-101", "[NAME] [ADDRESS] [PRIVACY_REDACTED]",
  "地址:宜蘭", "地址:員山", "地址:文化路", "地址:深洲二路",
];

beforeEach(() => {
  vi.stubEnv("AI_QUALITY_HMAC_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("SUPABASE_URL", "https://quality.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-only");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("A1.1 persisted synthetic privacy corpus", () => {
  it("contains at least 200 independently checked payloads", () => expect(corpus.length).toBeGreaterThanOrEqual(200));
  it.each(corpus)("$id never persists synthetic sensitive values", async ({ input, forbidden }) => {
    const snapshot = buildAiQualityTurnSnapshot({
      conversationId: "synthetic-conversation", turnId: "synthetic-turn",
      userText: input, assistantText: input, beforeContext: {}, afterContext: {},
      metadata: { final_response_kind: "informational_answer" },
    });
    const p = prepareAiQualityTurn(snapshot);
    let body;
    const transport = vi.fn(async (_url, init) => {
      body = JSON.parse(init.body).p_turn;
      return new Response(null, { status: 204 });
    });
    expect(await persistAiQualityTurn(p, { fetchImpl: transport })).toBe("saved");
    expect(transport).toHaveBeenCalledTimes(1);
    for (const value of forbidden) expect(JSON.stringify(body)).not.toContain(value);
    for (const text of [body.user_text, body.assistant_text]) {
      expect(detectResidualHighRiskPii(text)).toBe(false);
      expect(sanitizeAiQualityText(text)).toBe(text);
    }
    expect(body.metadata.provider_call_count).toBe(0);
  });
});

describe("precision and residual fail closed", () => {
  it.each(ordinary)("preserves geography and booking semantics: %s", text => {
    // Existing Quality normalization converts fullwidth question marks.
    expect(sanitizeAiQualityText(text)).toBe(text.replace(/？/g, "?"));
    expect(detectResidualHighRiskPii(text)).toBe(false);
  });
  it.each([
    ["我是王小明，想訂11/1", "我是[NAME]，想訂11/1"],
    ["我叫陳美玲", "我叫[NAME]"], ["姓名 林志豪", "姓名 [NAME]"],
    ["聯絡人 John Chen", "聯絡人 [NAME]"],
    ["我住新北市板橋區文化路一段123號", "我住[ADDRESS]"],
  ])("preserves sentence meaning: %s", (text, expected) => expect(sanitizeAiQualityText(text)).toBe(expected));
  it("fails closed on an explicit identity value outside the bounded name grammar", () => {
    const text = "姓名:這是一個超出支援長度而無法確認安全的稱謂，11/1入住";
    expect(detectResidualHighRiskPii(text)).toBe(true);
    expect(sanitizeAiQualityText(text)).toBe("[PRIVACY_REDACTED]");
    expect(sanitizeAiQualityText(sanitizeAiQualityText(text))).toBe("[PRIVACY_REDACTED]");
  });
  it.each(["地址:新北市\n板橋區\n文化路一段123號", "地址:新北市板橋區文化 路123號",
    "住址:新北市板橋區A路123號", "姓名:王 小 明", "聯絡人:John\nChen"])(
    "rejects unsupported explicit identity formatting without leaking it: %s", text => {
      const safe = sanitizeAiQualityText(text);
      expect(safe).not.toMatch(/123號|小 明|John|Chen/);
      expect(detectResidualHighRiskPii(safe)).toBe(false);
      expect(sanitizeAiQualityText(safe)).toBe(safe);
    });
  it.each(["姓名:王小明", "地址:新北市板橋區文化路一段123號", "0988123456",
    "a@example.invalid", "A123456789", "4111111111111111", "銀行帳號:123456789012", "api_key=synthetic-only"])(
    "detects a residual high-risk value: %s", text => expect(detectResidualHighRiskPii(text)).toBe(true));
  it("preserves only the fixed public business address, not another number or a private unit", () => {
    const catalog = JSON.parse(readFileSync(new URL("../../api/knowledge/faq-items.json", import.meta.url), "utf8"));
    const answer = catalog.find(item => item.id === "faq-101").answer;
    expect(sanitizeAiQualityText(answer)).toBe(answer);
    expect(sanitizeAiQualityText("地址:宜蘭縣員山鄉深洲二路 158 號")).toBe("地址:宜蘭縣員山鄉深洲二路 158 號");
    expect(sanitizeAiQualityText("宜蘭縣員山鄉深洲二路158號3樓")).toBe("[ADDRESS]");
    expect(sanitizeAiQualityText(addresses[0], { allowlist: [addresses[0]] })).toBe("[ADDRESS]");
  });
  it("redacts identity query values without accepting a client allowlist", () => {
    const safe = sanitizeAiQualityText("https://example.invalid/?guest_name=John%20Chen&address=private&nights=2");
    expect(safe).not.toMatch(/John|Chen|private/);
    expect(safe).toContain("nights=2");
    expect(sanitizeAiQualityText(safe)).toBe(safe);
  });
  it("does not project structured profile or booking identity fields", () => {
    const fields = Object.fromEntries(["name", "guest_name", "contact_name", "customer_name", "address", "profile", "booking"]
      .map(key => [key, { value: "STRUCTURED_IDENTITY_MUST_NOT_APPEAR" }]));
    const snapshot = buildAiQualityTurnSnapshot({ ...fields, conversationId: "synthetic", turnId: "one",
      userText: "11/1 10人", assistantText: "25000", beforeContext: fields, afterContext: fields,
      metadata: fields, route: fields, structured: fields });
    expect(JSON.stringify(prepareAiQualityTurn(snapshot))).not.toContain("STRUCTURED_IDENTITY");
  });
});
