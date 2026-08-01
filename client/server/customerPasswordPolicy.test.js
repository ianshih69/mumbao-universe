import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PASSWORD_HINT,
  getCustomerPasswordErrors,
  getCustomerPasswordValidationError,
  isCustomerPasswordValid,
} from "./customerPasswordPolicy.js";

describe("customer password policy", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(getCustomerPasswordValidationError("Aa12345")).toBe("密碼至少需要 8 個字元");
  });

  it("rejects 8-character passwords without uppercase letters", () => {
    expect(getCustomerPasswordValidationError("aa123456")).toBe(
      "密碼需要包含至少 1 個大寫英文字母",
    );
  });

  it("rejects 8-character passwords without lowercase letters", () => {
    expect(getCustomerPasswordValidationError("AA123456")).toBe(
      "密碼需要包含至少 1 個小寫英文字母",
    );
  });

  it("rejects 8-character passwords without numbers", () => {
    expect(getCustomerPasswordValidationError("Aaaaaaaa")).toBe("密碼需要包含至少 1 個數字");
  });

  it("accepts passwords with uppercase, lowercase, and numbers", () => {
    expect(isCustomerPasswordValid("Mumbao88")).toBe(true);
    expect(getCustomerPasswordErrors("Mumbao88")).toEqual([]);
  });

  it("documents the same hint shown by account forms", () => {
    expect(CUSTOMER_PASSWORD_HINT).toBe("密碼至少 8 碼，並包含英文大寫、英文小寫及數字。");
  });
});
