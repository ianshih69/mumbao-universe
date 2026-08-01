export const CUSTOMER_PASSWORD_MIN_LENGTH = 8;

export const CUSTOMER_PASSWORD_HINT =
  "密碼至少 8 碼，並包含英文大寫、英文小寫及數字。";

export const CUSTOMER_PASSWORD_ERROR_MESSAGES = {
  minLength: "密碼至少需要 8 個字元",
  uppercase: "密碼需要包含至少 1 個大寫英文字母",
  lowercase: "密碼需要包含至少 1 個小寫英文字母",
  number: "密碼需要包含至少 1 個數字",
};

export function getCustomerPasswordErrors(password) {
  const value = String(password || "");
  const errors = [];

  if (value.length < CUSTOMER_PASSWORD_MIN_LENGTH) {
    errors.push(CUSTOMER_PASSWORD_ERROR_MESSAGES.minLength);
  }
  if (!/[A-Z]/.test(value)) {
    errors.push(CUSTOMER_PASSWORD_ERROR_MESSAGES.uppercase);
  }
  if (!/[a-z]/.test(value)) {
    errors.push(CUSTOMER_PASSWORD_ERROR_MESSAGES.lowercase);
  }
  if (!/[0-9]/.test(value)) {
    errors.push(CUSTOMER_PASSWORD_ERROR_MESSAGES.number);
  }

  return errors;
}

export function getCustomerPasswordValidationError(password) {
  return getCustomerPasswordErrors(password)[0] || "";
}

export function isCustomerPasswordValid(password) {
  return getCustomerPasswordErrors(password).length === 0;
}
