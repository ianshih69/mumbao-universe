import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCustomerFullAddressUpdatePayload,
  buildCustomerProfileUpdatePayload,
  clampCustomerAccountPage,
  customerAccountOrderPageSize,
  customerAccountPointActivityPageSize,
  customerProfileUnlockMs,
  getCustomerAccountPageSlice,
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

  it("keeps account order pagination fixed at 5 per page", () => {
    expect(customerAccountOrderPageSize).toBe(5);
    expect(getCustomerAccountTotalPages(0)).toBe(1);
    expect(getCustomerAccountTotalPages(5)).toBe(1);
    expect(getCustomerAccountTotalPages(6)).toBe(2);
    expect(getCustomerAccountTotalPages(11)).toBe(3);
  });

  it("keeps account point activity pagination fixed at 5 per page", () => {
    expect(customerAccountPointActivityPageSize).toBe(5);
    expect(getCustomerAccountTotalPages(0, customerAccountPointActivityPageSize)).toBe(1);
    expect(getCustomerAccountTotalPages(5, customerAccountPointActivityPageSize)).toBe(1);
    expect(getCustomerAccountTotalPages(6, customerAccountPointActivityPageSize)).toBe(2);
    expect(getCustomerAccountTotalPages(12, customerAccountPointActivityPageSize)).toBe(3);
  });

  it("slices point activity pages without duplicates or omissions", () => {
    const rows = Array.from({ length: 12 }, (_, index) => `point-${index + 1}`);

    expect(getCustomerAccountPageSlice(rows, 1, customerAccountPointActivityPageSize)).toMatchObject({
      items: ["point-1", "point-2", "point-3", "point-4", "point-5"],
      page: 1,
      totalPages: 3,
    });
    expect(getCustomerAccountPageSlice(rows, 2, customerAccountPointActivityPageSize).items).toEqual([
      "point-6",
      "point-7",
      "point-8",
      "point-9",
      "point-10",
    ]);
    expect(getCustomerAccountPageSlice(rows, 3, customerAccountPointActivityPageSize).items).toEqual([
      "point-11",
      "point-12",
    ]);
  });

  it("clamps independent account pagination states to their own valid page ranges", () => {
    const pointPage = clampCustomerAccountPage(3, getCustomerAccountTotalPages(12, customerAccountPointActivityPageSize));
    const orderPage = clampCustomerAccountPage(1, getCustomerAccountTotalPages(4, customerAccountOrderPageSize));

    expect(pointPage).toBe(3);
    expect(orderPage).toBe(1);
    expect(getCustomerAccountPageSlice([], 99, customerAccountPointActivityPageSize)).toMatchObject({
      page: 1,
      totalPages: 1,
      items: [],
    });
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
    expect(source).toContain("可兌換積分");
    expect(source).toContain("待處理積分");
    expect(source).toContain("申請兌換");
    expect(source).toContain("積分紀錄");
    expect(source).toContain("createCustomerPointRedemption");
    expect(source).toContain("isDiamondMember ? (");
    expect(source).not.toContain("updateAdminMemberDiamondProfile");
    expect(source).not.toContain("completeAdminPointRedemption");
    expect(source).not.toContain("rejectAdminPointRedemption");
  });
});
