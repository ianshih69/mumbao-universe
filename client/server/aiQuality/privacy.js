import { createHmac } from "node:crypto";

export function assertAiQualityServerOnly() {
  if (typeof window !== "undefined") throw new Error("ai_quality_server_only");
}
assertAiQualityServerOnly();

const secretParameter = /token|auth|session|key|secret|password|passwd|credential|signature|recovery|management|^(?:code|sig)$/i;
const separator = "[\\s\\-‐‑‒–—−]*";
const mobile = new RegExp("(?<![A-Za-z0-9])(?:\\+?886" + separator + "(?:\\(0\\)" + separator + ")?|0)9[0-9xX*]{2}" + separator + "[0-9xX*]{3}" + separator + "[0-9xX*]{3}(?![0-9xX*])", "g");
const landline = new RegExp("(?<![A-Za-z0-9])(?:\\(\\s*)?(?:\\+?886" + separator + "[2-8][0-9]{0,2}|0[2-8][0-9]{0,2})(?:\\s*\\))?[\\s\\-‐‑‒–—−]+[0-9xX*]{3,4}" + separator + "[0-9xX*]{3,4}(?![0-9xX*])(?:\\s*(?:#|ext\\.?|分機)\\s*\\d{1,6})?", "gi");

const nameLabel = "(?:姓名|訂房人|聯絡人|入住人|收件人|(?:guest|contact|customer|full|recipient)[_ -]?name|name)";
const labelSeparator = "[\"']?(?:[ \\t]*[:=]\\s*|[ \\t]+)[\"']?";
const nameEnd = "(?=$|[\\s,，。;；!?！？、\"'<>]|想|希望|要訂|要住|電話|手機|地址|email)";
const chineseName = "[\\p{Script=Han}]{2,8}?";
const englishName = "[A-Za-z][A-Za-z'-]{0,30}(?:[ \\t\\r\\n]+[A-Za-z][A-Za-z'-]{0,30}){0,3}";
const labelledName = new RegExp("(" + nameLabel + labelSeparator + ")(" + chineseName + "|" + englishName + ")" + nameEnd, "giu");
// A surname alone is not evidence. Require an introduction and a bounded name,
// then a sentence/booking-clause boundary; never classify arbitrary Han words.
const surnames = "(?:歐陽|司馬|上官|諸葛|皇甫|司徒|[王陳林張李黃吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯孫魏翁戴范宋方鄧杜傅侯曹薛丁卓阮馬董温溫唐藍石蔣古紀姚連馮歐程湯田康姜白汪鄒熊金陸夏龔邵萬嚴秦袁])";
const introducedName = new RegExp("((?:我是|我叫|我名叫|我的名字是)[ \\t]*)(" + surnames +
  "[\\p{Script=Han}]{1,3}?|[A-Z][a-z'-]{1,30}(?:[ \\t]+[A-Z][a-z'-]{1,30}){0,3})" + nameEnd, "gu");
const introducedEnglishName = /\b((?:I am|I'm|My name is)[ \t]+)([A-Z][a-z'-]{1,30}(?:[ \t]+[A-Z][a-z'-]{1,30}){0,3})(?=$|[\s,.;!?])/g;
const nonIdentity = /(?:人|入住|帶|星期|週[一二三四五六日天]|預訂|訂房|朋友|旅客|家庭|小孩|成人|會員|學生|老師|旅遊|來自|住宿)/u;
const city = "(?:臺北|台北|新北|桃園|臺中|台中|臺南|台南|高雄|基隆|新竹|嘉義|苗栗|彰化|南投|雲林|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市]";
const district = "[\\p{Script=Han}]{1,4}[區鄉鎮市]";
const number = "[0-9一二三四五六七八九十百零〇之-]+";
const street = "[\\p{Script=Han}]{1,12}?(?:大道|路|街)(?:[ \\t]*" + number + "段)?";
const door = "(?:[ \\t]*" + number + "[巷弄]){0,2}[ \\t]*" + number +
  "[ \\t]*號(?:[ \\t]*之[ \\t]*" + number + ")?(?:[ \\t]*" + number + "[樓室Ff]){0,2}";
const fullAddress = new RegExp("(?:(?:台灣|臺灣)[ \\t]*)?(?:[0-9]{3,6}[ \\t]*)?" +
  city + "[ \\t]*(?:" + district + "[ \\t]*)?" + street + door, "gu");
const labelledAddress = new RegExp("((?:地址|住址|收件地址|寄送地址|(?:shipping[_ -]?)?address)" +
  labelSeparator + ")(?:" + district + "[ \\t]*)?" + street + door, "giu");
// Fixed server-owned public business data, verified against canonical faq-101.
// A floor/unit/door-number suffix is NOT allowlisted.
const businessAddress = "宜蘭縣員山鄉深洲二路158號";
const isBusinessAddress = value => value.replace(/[ \t]/g, "").replace(/^(?:台灣|臺灣)?(?:264)?/, "") === businessAddress;
const identityPlaceholder = /^\[(?:NAME|ADDRESS|TOKEN|PRIVACY_REDACTED)\]/;
const explicitDoorAddress = new RegExp("(?:地址|住址|收件地址|寄送地址|address)" +
  labelSeparator + "([^,，;；。]+)", "giu");

function redactIdentityText(text) {
  return text
    .replace(fullAddress, value => isBusinessAddress(value) ? value : "[ADDRESS]")
    .replace(labelledAddress, (value, label) => isBusinessAddress(value.slice(label.length)) ? value : label + "[ADDRESS]")
    .replace(labelledName, (_value, label) => label + "[NAME]")
    .replace(introducedName, (value, intro, name) => nonIdentity.test(name) ? value : intro + "[NAME]")
    .replace(introducedEnglishName, (_value, intro) => intro + "[NAME]");
}

export function detectResidualHighRiskPii(value) {
  if (typeof value !== "string") return true;
  // Re-detection covers the legacy high-risk formats. The broader explicit-label
  // check catches unsupported/overlong names which the precision matcher rejects.
  if (redactPlainText(value) !== value || redactIdentityText(value) !== value) return true;
  const labels = new RegExp(nameLabel + labelSeparator + "([^\\r\\n,，;；]+)", "giu");
  if ([...value.matchAll(labels)].some(match => !identityPlaceholder.test(match[1].trim()))) return true;
  // An explicit address label plus a private door number is high-confidence even
  // when separators or a nonstandard street spelling defeat the precise grammar.
  return [...value.matchAll(explicitDoorAddress)].some(match => {
    const address = match[1].trim();
    return !identityPlaceholder.test(address) && !isBusinessAddress(address) &&
      /[0-9一二三四五六七八九十百]+[\s]*號/u.test(address) && /路|街|大道|巷|弄/u.test(address);
  });
}

function queryPlaceholder(key) {
  const normalized = key.normalize("NFKC").replace(/[^a-z0-9]/gi, "");
  if (secretParameter.test(normalized)) return "[TOKEN]";
  if (/email/i.test(normalized)) return "[EMAIL]";
  if (/phone|mobile|^(?:tel|telephone)$/i.test(normalized)) return "[PHONE]";
  if (/booking|orderref/i.test(normalized)) return "[BOOKING_REF]";
  if (/bank|account/i.test(normalized)) return "[BANK_DATA]";
  if (/^(?:name|guestname|contactname|customername|fullname|recipientname)$/i.test(normalized)) return "[NAME]";
  if (/^(?:address|shippingaddress|homeaddress|contactaddress)$/i.test(normalized)) return "[ADDRESS]";
  return null;
}

function isCardNumber(digits) {
  if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function redactPlainText(text) {
  return text
    .replace(/([?&#])([^?&#=\s]+)=([^&#\s]*)/g, (match, delimiter, key) => {
      // Also cover relative links and pasted query fragments, not only absolute URLs.
      const decodedKey = new URLSearchParams(key + "=").keys().next().value;
      const placeholder = queryPlaceholder(decodedKey);
      return placeholder ? delimiter + key + "=" + placeholder : match;
    })
    .replace(/(\b(?:authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[TOKEN]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [TOKEN]")
    .replace(/(\b(?:[a-z_]*token|api[_-]?key|secret|password|passwd|session[_-]?id|auth[_-]?key|access[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;\[\]{}<>"']+)/gi, "$1[TOKEN]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[TOKEN]")
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[TOKEN]")
    .replace(/\b(?:sk-|sb_secret_|sb_publishable_|ghp_|github_pat_)[A-Za-z0-9_-]+\b/g, "[TOKEN]")
    .replace(/[A-Z0-9.!#$%&'*+/=?^_\u0060{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, "[EMAIL]")
    .replace(/\b(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}\b/g, "[TOKEN]")
    .replace(/((?:訂房(?:編號|代碼)?|訂單(?:編號|號碼)?|booking[_ -]?(?:reference|ref))\s*[:#=]?\s*)\d{10}(?!\d)/gi, "$1[BOOKING_REF]")
    .replace(/((?:銀行(?:帳號|賬號)?|匯款帳號|收款帳號|帳號|賬號|bank[_ -]?account)\s*[:#=]?\s*)(?:\d[ \t-]?){8,30}(?!\d)/gi, "$1[BANK_DATA]")
    .replace(/((?:信用卡(?:號(?:碼)?)?|卡號|card[_ -]?(?:number|no))\s*[:#=]?\s*)(?:\d[ \t-]?){13,19}(?!\d)/gi, "$1[CARD_DATA]")
    .replace(/(?<![A-Za-z0-9])[A-Z][12ABCD89]\d{8}(?![A-Za-z0-9])/gi, "[ID]")
    .replace(mobile, "[PHONE]")
    .replace(landline, "[PHONE]")
    .replace(/(?<![A-Za-z0-9])0(?:2\d{8}|[3-8]\d{7,8})(?!\d)/g, "[PHONE]")
    .replace(/(?<!\d)(?:\d{4}[ -]){3}\d{4}(?!\d)|(?<!\d)\d{4}[ -]\d{6}[ -]\d{5}(?!\d)/g, "[CARD_DATA]")
    .replace(/(?<![A-Za-z0-9])\d{3,6}(?:-\d{3,6}){1,5}(?!\d)/g, (value) => value.replace(/-/g, "").length >= 10 ? "[BANK_DATA]" : value)
    .replace(/(?<![A-Za-z0-9])\d{31,}(?!\d)/g, "[TOKEN]")
    .replace(/(?<!\d)\d{10,30}(?!\d)/g, (digits) => digits.length === 10 ? "[BOOKING_REF]" : isCardNumber(digits) ? "[CARD_DATA]" : "[BANK_DATA]");
}

function sanitizeUrl(input, depth = 0) {
  if (depth > 2) return "[TOKEN]";
  try {
    const url = new URL(input);
    url.username = "";
    url.password = "";
    const cleanParams = (params) => {
      const clean = new URLSearchParams();
      for (const [key, value] of params) {
        const replacement = queryPlaceholder(key)
          ?? (/^https?:\/\//i.test(value) ? sanitizeUrl(value, depth + 1) : redactPlainText(value));
        clean.append(redactPlainText(key), replacement);
      }
      return clean;
    };
    url.search = cleanParams(url.searchParams).toString();
    if (url.hash) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      url.hash = fragment.includes("=") ? cleanParams(new URLSearchParams(fragment)).toString() : redactPlainText(fragment);
    }
    url.pathname = redactPlainText(decodeURIComponent(url.pathname));
    return url.toString().replace(/%5B(TOKEN|PHONE|EMAIL|ID|BOOKING_REF|BANK_DATA|CARD_DATA|NAME|ADDRESS|PRIVACY_REDACTED)%5D/gi, "[$1]");
  } catch {
    return "[TOKEN]";
  }
}

export function sanitizeAiQualityText(value) {
  assertAiQualityServerOnly();
  if (typeof value !== "string") return "";
  if (value.length > 64000) throw new Error("ai_quality_text_too_large");
  // Redact before truncating, so a length boundary cannot expose part of a secret.
  const normalized = value.replace(/[０-９Ａ-Ｚａ-ｚ＠．＿＋－＝：／？＆％＃]/g, (char) => char.normalize("NFKC"))
    .replace(/[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
  const withSafeUrls = normalized.replace(/https?:\/\/[^\s<>"'，。；、）]+/gi, (url) => sanitizeUrl(url));
  const redacted = redactIdentityText(redactPlainText(withSafeUrls));
  const safe = detectResidualHighRiskPii(redacted) ? "[PRIVACY_REDACTED]" : redacted;
  let end = Math.min(safe.length, 8000);
  for (const match of safe.matchAll(/\[(?:PHONE|EMAIL|ID|BOOKING_REF|BANK_DATA|CARD_DATA|TOKEN|NAME|ADDRESS|PRIVACY_REDACTED)\]/g)) {
    if (match.index < end && match.index + match[0].length > end) end = match.index;
  }
  if (/[\uD800-\uDBFF]/.test(safe.charAt(end - 1))) end -= 1;
  return safe.slice(0, end);
}

export function hashAiQualityConversationKey(sourceId) {
  assertAiQualityServerOnly();
  if (typeof sourceId !== "string" || !sourceId || sourceId.length > 256 || sourceId !== sourceId.trim() || /[\s\p{C}]/u.test(sourceId)) {
    throw new Error("ai_quality_invalid_conversation_key");
  }
  const secret = process.env.AI_QUALITY_HMAC_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ai_quality_hmac_secret_unavailable");
  }
  return createHmac("sha256", secret)
    .update("mumbao/ai-quality/conversation/v1\0", "utf8")
    .update(sourceId, "utf8")
    .digest("hex");
}
