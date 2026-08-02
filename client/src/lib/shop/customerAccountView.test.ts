import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCustomerFullAddressUpdatePayload,
  buildCustomerProfileUpdatePayload,
  customerAccountOrderPageSize,
  customerProfileUnlockMs,
  getCustomerAccountOrderSummary,
  getCustomerAccountOrderTypeLabel,
  getCustomerAccountTotalPages,
  getCustomerDefaultFullAddress,
  getCustomerEmailVerificationLabel,
  getCustomerMemberLevelLabel,
  hasDefaultShippingProfile,
} from "./customerAccountView";

describe("customer account view helpers", () => {
  it("maps member levels for the member-facing account page", () => {
    expect(getCustomerMemberLevelLabel("normal")).toBe("普通會員");
    expect(getCustomerMemberLevelLabel("vip")).toBe("VIP會員");
    expect(getCustomerMemberLevelLabel("diamond")).toBe("鑽石會員");
    expect(getCustomerMemberLevelLabel(null)).toBe("普通會員");
    expect(getCustomerMemberLevelLabel("unknown")).toBe("普通會員");
  });

  it("formats email verification status safely", () => {
    expect(getCustomerEmailVerificationLabel(true)).toBe("已驗證");
    expect(getCustomerEmailVerificationLabel(false)).toBe("尚未驗證");
  });

  it("keeps account order pagination fixed at 10 per page", () => {
    expect(customerAccountOrderPageSize).toBe(10);
    expect(getCustomerAccountTotalPages(0)).toBe(1);
    expect(getCustomerAccountTotalPages(10)).toBe(1);
    expect(getCustomerAccountTotalPages(11)).toBe(2);
    expect(getCustomerAccountTotalPages(37)).toBe(4);
  });

  it("only sends member-editable profile fields", () => {
    const payload = buildCustomerProfileUpdatePayload({
      name: "Mumbao",
      phone: "0912345678",
      default_postal_code: "970",
      default_city: "花蓮縣",
      default_district: "壽豐鄉",
      default_address: "慢慢蒔光路 1 號",
      member_level: "diamond",
      admin_note: "hidden",
      email_verified: "true",
    } as never);

    expect(payload).toEqual({
      name: "Mumbao",
      phone: "0912345678",
      default_postal_code: "970",
      default_city: "花蓮縣",
      default_district: "壽豐鄉",
      default_address: "慢慢蒔光路 1 號",
    });
    expect(payload).not.toHaveProperty("member_level");
    expect(payload).not.toHaveProperty("admin_note");
    expect(payload).not.toHaveProperty("email_verified");
  });

  it("detects existing default shipping fields without inventing unavailable fields", () => {
    expect(
      hasDefaultShippingProfile({
        default_postal_code: "",
        default_city: "",
        default_district: "",
        default_address: "",
      }),
    ).toBe(false);
    expect(
      hasDefaultShippingProfile({
        default_postal_code: "",
        default_city: "花蓮縣",
        default_district: "",
        default_address: "",
      }),
    ).toBe(true);
  });

  it("shows legacy split address fields as one full address and saves future edits into default_address", () => {
    const legacyProfile = {
      default_postal_code: "220",
      default_city: "新北市",
      default_district: "板橋區",
      default_address: "文化路一段100號5樓",
    };

    expect(getCustomerDefaultFullAddress(legacyProfile)).toBe("220 新北市 板橋區 文化路一段100號5樓");
    expect(
      buildCustomerFullAddressUpdatePayload({
        name: "Mumbao",
        phone: "0912345678",
        default_address: "新北市板橋區文化路一段100號5樓",
      }),
    ).toEqual({
      name: "Mumbao",
      phone: "0912345678",
      default_postal_code: "",
      default_city: "",
      default_district: "",
      default_address: "新北市板橋區文化路一段100號5樓",
    });
  });

  it("labels current account order sources and summaries", () => {
    expect(getCustomerAccountOrderTypeLabel("shop")).toBe("商品");
    expect(getCustomerAccountOrderTypeLabel("booking")).toBe("住宿");
    expect(getCustomerAccountOrderSummary({ item_count: 3, item_summary: "慢寶星座馬克杯等 3 項" })).toBe(
      "慢寶星座馬克杯等 3 項",
    );
    expect(getCustomerAccountOrderSummary({ item_count: 2, item_summary: "" })).toBe("商品等 2 項");
  });

  it("keeps Mumbao chat history hidden from the member account page", () => {
    const source = readFileSync(new URL("../../pages/CustomerAccount.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("問慢寶紀錄");
    expect(source).not.toContain("fetchAccountChat");
    expect(source).not.toContain("deleteAccountChat");
    expect(source).not.toContain("ai-chat?action=history");
  });

  it("keeps profile editing behind Supabase password verification without password storage", () => {
    const source = readFileSync(new URL("../../pages/CustomerAccount.tsx", import.meta.url), "utf8");

    expect(customerProfileUnlockMs).toBe(10 * 60 * 1000);
    expect(source).toContain("為保護您的會員資料，請輸入目前帳號密碼。");
    expect(source).toContain("signInWithPassword");
    expect(source).toContain("密碼不正確，請重新輸入。");
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain("sessionStorage.setItem");
    expect(source).not.toContain("console.");
  });

  it("keeps the member account address and diamond card member-facing only", () => {
    const source = readFileSync(new URL("../../pages/CustomerAccount.tsx", import.meta.url), "utf8");

    expect(source).toContain("預設地址");
    expect(source).not.toContain("預設郵遞區號");
    expect(source).not.toContain("預設縣市");
    expect(source).not.toContain("預設區域");
    expect(source).toContain("鑽石會員合作資料");
    expect(source).toContain("專屬優惠碼");
    expect(source).toContain("目前積分");
    expect(source).not.toContain("updateAdminMemberDiamondProfile");
  });
});
