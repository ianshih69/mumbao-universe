import { getServerEnv } from "../shopShared.js";

const defaultBankTransferSettings = Object.freeze({
  paymentMethod: "bank_transfer",
  currency: "TWD",
  bankName: "玉山銀行",
  bankCode: "808",
  branchName: "埔墘分行",
  accountName: "石峻銘",
  accountNumber: "0174-979-106247",
  swiftCode: "ESUNTWTP",
});

function parseEnabled(value) {
  return ["1", "true", "enabled", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function isBookingBankTransferEnabled() {
  return parseEnabled(getServerEnv("BOOKING_BANK_TRANSFER_ENABLED"));
}

export function getBookingBankTransferSettings() {
  return {
    ...defaultBankTransferSettings,
    enabled: isBookingBankTransferEnabled(),
    reviewMinutes: parseBoundedInteger(getServerEnv("BANK_TRANSFER_REVIEW_MINUTES"), 120, 15, 1440),
    reportRateLimit: {
      attempts: parseBoundedInteger(getServerEnv("BOOKING_PAYMENT_REPORT_RATE_LIMIT"), 8, 1, 100),
      windowSeconds: parseBoundedInteger(
        getServerEnv("BOOKING_PAYMENT_REPORT_RATE_WINDOW_SECONDS"),
        60,
        10,
        3600,
      ),
    },
  };
}

export function publicBankTransferSettings(settings = getBookingBankTransferSettings()) {
  if (!settings.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    method: settings.paymentMethod,
    currency: settings.currency,
    bank: {
      name: settings.bankName,
      code: settings.bankCode,
      branch: settings.branchName,
      accountName: settings.accountName,
      accountNumber: settings.accountNumber,
    },
  };
}

export const __testing = {
  defaultBankTransferSettings,
  parseBoundedInteger,
  parseEnabled,
};
