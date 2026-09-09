import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAiQualityServerOnly, hashAiQualityConversationKey, sanitizeAiQualityText } from "./privacy.js";

// All identifiers below are synthetic fixtures, never customer or environment data.
const redactions = [
  ["0988-123-456", "[PHONE]"], ["0988123456", "[PHONE]"],
  ["+886 988 123 456", "[PHONE]"], ["+886 (0)988-123-456", "[PHONE]"],
  ["03-xxxxxxx", "[PHONE]"], ["02-xxxxxxxx", "[PHONE]"],
  ["(02) 2345-6789 分機 123", "[PHONE]"], ["039876543", "[PHONE]"],
  ["+886-2-2345-6789", "[PHONE]"], ["03-987-6543", "[PHONE]"],
  ["test.person+quality@example.invalid", "[EMAIL]"],
  ["synthetic.long.email.local.part.for.quality@example.invalid", "[EMAIL]"],
  ["A123456789", "[ID]"], ["AB12345678", "[ID]"], ["A812345678", "[ID]"],
  ["8752989600", "[BOOKING_REF]"], ["訂房編號:0988123456", "訂房編號:[BOOKING_REF]"],
  ["銀行帳號:123-456-789012", "銀行帳號:[BANK_DATA]"],
  ["123-456-789012", "[BANK_DATA]"],
  ["7".repeat(40), "[TOKEN]"],
  ["123456789012345", "[BANK_DATA]"],
  ["4111 1111 1111 1111", "[CARD_DATA]"], ["4111111111111111", "[CARD_DATA]"],
  ["信用卡:1234-5678-9012-3456", "信用卡:[CARD_DATA]"],
  ["Bearer synthetic_access_12345678901234567890", "Bearer [TOKEN]"],
  ["Authorization: Bearer synthetic-token\n早餐三份", "Authorization: [TOKEN]\n早餐三份"],
  ["Cookie: session=synthetic-token\n三晚", "Cookie: [TOKEN]\n三晚"],
  ['{"management_token":"synthetic-only"}', '{"management_token":[TOKEN]}'],
  ["recovery_token=synthetic-only", "recovery_token=[TOKEN]"],
  ["api_key=synthetic-only", "api_key=[TOKEN]"],
  ["sk-synthetic1234567890123456789012345", "[TOKEN]"],
  ["12345678-1234-1234-1234-123456789012", "[TOKEN]"],
  ["abcdefgh.ijklmnop.qrstuvwx", "[TOKEN]"],
  ["SyntheticOpaqueTokenAbcdefghijk1234567890123", "[TOKEN]"],
  ["０９８８１２３４５６", "[PHONE]"],
  ["0988\u200b123456", "[PHONE]"],
];
const ordinary = [
  "25000", "49000", "2026/11/01", "2026/11/1", "2026-11-01", "22公斤",
  "10位成人", "3位小孩", "5–10月", "15:00", "11:00", "房號530", "房號101",
  "faq-091", "schema_version=1", "宜蘭員山10人3晚", "早餐250元", "30%訂金70%尾款",
  "500/800/1200", "第二晚95折", "2026年11月1日", "我是慢寶，住在宜蘭員山",
  "2026-2027", "房號101-102",
];

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("quality text privacy", () => {
  it.each(redactions)("redacts synthetic fixture %s", (input, expected) => {
    expect(sanitizeAiQualityText(input)).toBe(expected);
  });
  it.each(ordinary)("preserves lodging semantics %s", (input) => {
    expect(sanitizeAiQualityText(input)).toBe(input);
  });
  it.each([...redactions.map(([input]) => input), ...ordinary,
    "[PHONE] [EMAIL] [ID] [BOOKING_REF] [BANK_DATA] [CARD_DATA] [TOKEN]",
    "https://example.invalid/?token=short&nights=3&date=2026%2F11%2F1",
    "https://example.invalid/?next=https%3A%2F%2Fexample.invalid%2F%3Ftoken%3Dshort",
  ])("is idempotent for %s", (input) => {
    const safe = sanitizeAiQualityText(input);
    expect(sanitizeAiQualityText(safe)).toBe(safe);
  });
  it.each(["token", "Auth", "sessionId", "api-key", "recovery_token", "managementToken",
    "password", "signature", "code", "session%5Btoken%5D", "%74%6f%6b%65%6e",
  ])("redacts decoded URL query %s without dumping it", (key) => {
    const safe = sanitizeAiQualityText("https://example.invalid/?"+key+"=synthetic-short&nights=3");
    expect(safe).not.toContain("synthetic-short");
    expect(safe).toContain("[TOKEN]");
    expect(safe).toContain("nights=3");
  });
  it("cleans repeated parameters, fragments, nested URLs, path PII and credentials", () => {
    for (const url of [
      "https://example.invalid/?token=short-one&token=short-two#session=short-three",
      "https://synthetic-user:synthetic-pass@example.invalid/0988123456?email=a%40example.invalid",
      "https://example.invalid/?next=https%3A%2F%2Fexample.invalid%2F%3Ftoken%3Dshort-one",
    ]) {
      const safe = sanitizeAiQualityText(url);
      for (const forbidden of ["short-one", "short-two", "short-three", "synthetic-user", "synthetic-pass", "0988123456", "a%40"]) {
        expect(safe).not.toContain(forbidden);
      }
      expect(sanitizeAiQualityText(safe)).toBe(safe);
    }
  });
  it("fails closed on malformed URLs", () => {
    expect(sanitizeAiQualityText("https://example.invalid/%ZZ?token=short")).toBe("[TOKEN]");
  });
  it.each(["auth", "session", "key", "%61uth", "management_token", "recovery-token"])(
    "redacts sensitive query %s in relative links without altering lodging fields", (key) => {
      const safe = sanitizeAiQualityText("/booking/manage?"+key+"=synthetic-private&nights=3");
      expect(safe).not.toContain("synthetic-private");
      expect(safe).toContain("[TOKEN]");
      expect(safe).toContain("nights=3");
      expect(sanitizeAiQualityText(safe)).toBe(safe);
    },
  );
  it("sanitizes the entire input before applying its storage length bound", () => {
    const safe = sanitizeAiQualityText("住".repeat(7998) + "0988123456" + "三晚");
    expect(safe).not.toContain("0988");
    expect(safe).not.toMatch(/\[[A-Z_]*$/);
    expect(safe.length).toBeLessThanOrEqual(8000);
    expect(sanitizeAiQualityText(safe)).toBe(safe);
    expect(() => sanitizeAiQualityText("住".repeat(64001))).toThrow("ai_quality_text_too_large");
  });
  it("never serializes an arbitrary request object", () => {
    const toString = vi.fn(() => "should-not-run");
    expect(sanitizeAiQualityText({ toString })).toBe("");
    expect(toString).not.toHaveBeenCalled();
    expect(sanitizeAiQualityText(null)).toBe("");
  });
  it("rejects browser invocation", () => {
    vi.stubGlobal("window", {});
    expect(assertAiQualityServerOnly).toThrow("ai_quality_server_only");
    expect(() => sanitizeAiQualityText("三晚")).toThrow("ai_quality_server_only");
    expect(() => hashAiQualityConversationKey("synthetic-session")).toThrow("ai_quality_server_only");
  });
});

describe("quality conversation HMAC", () => {
  const secret = "synthetic-test-only-hmac-secret-never-production";
  it("is domain-separated HMAC-SHA256, stable but input/secret dependent", () => {
    vi.stubEnv("AI_QUALITY_HMAC_SECRET", secret);
    const first = hashAiQualityConversationKey("synthetic-session-one");
    const expected = createHmac("sha256", secret)
      .update("mumbao/ai-quality/conversation/v1\0").update("synthetic-session-one").digest("hex");
    expect(first).toBe(expected);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("synthetic-session-one");
    expect(hashAiQualityConversationKey("synthetic-session-one")).toBe(first);
    expect(hashAiQualityConversationKey("synthetic-session-two")).not.toBe(first);
    vi.stubEnv("AI_QUALITY_HMAC_SECRET", secret+"-different");
    expect(hashAiQualityConversationKey("synthetic-session-one")).not.toBe(first);
  });
  it.each([undefined, "", "too-short"])("has no default or alternate-secret fallback (%s)", (value) => {
    vi.stubEnv("AI_QUALITY_HMAC_SECRET", value);
    expect(() => hashAiQualityConversationKey("synthetic-session")).toThrow("ai_quality_hmac_secret_unavailable");
  });
  it.each(["", " session", "session ", "two sessions", "a\nb", "a".repeat(257), null, {}])(
    "rejects invalid source ids without echoing them (%s)", (id) => {
      vi.stubEnv("AI_QUALITY_HMAC_SECRET", secret);
      expect(() => hashAiQualityConversationKey(id)).toThrow("ai_quality_invalid_conversation_key");
    },
  );
});
