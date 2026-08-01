import { describe, expect, it, vi } from "vitest";
import { __testing, createAdminMembersHandler } from "./members.js";

const authUserA = "11111111-1111-4111-8111-111111111111";
const authUserB = "22222222-2222-4222-8222-222222222222";
const authUserC = "33333333-3333-4333-8333-333333333333";
const authUserD = "44444444-4444-4444-8444-444444444444";
const authUserAdmin = "55555555-5555-4555-8555-555555555555";

const adminContext = {
  actorAuthUserId: authUserAdmin,
  actorName: "Admin",
  actorEmail: "admin@example.test",
  roleCode: "super_admin",
  permissions: ["*"],
};

const users = [
  {
    id: authUserA,
    email: "Test@Example.com",
    created_at: "2026-08-01T00:00:00.000Z",
    last_sign_in_at: "2026-08-01T01:00:00.000Z",
    email_confirmed_at: "2026-08-01T00:05:00.000Z",
    confirmed_at: null,
    user_metadata: { name: "Auth Name", phone: "0900000000" },
    raw_app_meta_data: { provider: "email" },
    raw_user_meta_data: { secret_note: "do not return" },
    identities: [{ id: "identity-a" }],
    confirmation_token: "token-a",
    recovery_token: "token-b",
  },
  {
    id: authUserB,
    email: "pending@example.com",
    created_at: "2026-08-01T02:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: null,
    confirmed_at: null,
    user_metadata: {},
  },
  {
    id: authUserC,
    email: "legacy@example.com",
    created_at: "2026-08-01T03:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-08-01T03:05:00.000Z",
    confirmed_at: null,
    user_metadata: { name: "舊帳號" },
  },
  {
    id: authUserD,
    email: "delete@example.com",
    created_at: "2026-08-01T04:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-08-01T04:05:00.000Z",
    confirmed_at: null,
    user_metadata: {},
  },
  {
    id: authUserAdmin,
    email: "admin@example.com",
    created_at: "2026-08-01T05:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-08-01T05:05:00.000Z",
    confirmed_at: null,
    user_metadata: { name: "後台管理員" },
  },
];

const profiles = [
  {
    id: "profile-a",
    auth_user_id: authUserA,
    email: "test@example.com",
    name: "慢寶會員",
    phone: "0912345678",
    is_active: true,
    created_at: "2026-08-01T00:00:01.000Z",
    updated_at: "2026-08-01T00:00:01.000Z",
  },
  {
    id: "profile-b",
    auth_user_id: authUserB,
    email: "pending@example.com",
    name: "未驗證會員",
    phone: "0987654321",
    is_active: true,
    created_at: "2026-08-01T02:00:01.000Z",
    updated_at: "2026-08-01T02:00:01.000Z",
  },
  {
    id: "profile-d",
    auth_user_id: authUserD,
    email: "delete@example.com",
    name: "可刪會員",
    phone: "0911000000",
    is_active: true,
    created_at: "2026-08-01T04:00:01.000Z",
    updated_at: "2026-08-01T04:00:01.000Z",
  },
];

const adminProfiles = [
  {
    id: "admin-profile-1",
    auth_user_id: authUserAdmin,
    email: "admin@example.com",
    display_name: "後台管理員",
    role_code: "super_admin",
    is_active: true,
  },
];

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    headersSent: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    end(value) {
      this.body = value || "";
      this.headersSent = true;
    },
  };
}

async function invoke(handler, { method = "GET", query = {}, body = null } = {}) {
  const req = {
    method,
    query,
    body,
    headers: { authorization: "Bearer admin-token" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = createMockResponse();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

function createDependencies(options = {}) {
  const {
    isAdmin = true,
    businessRecordAuthUserIds = new Set(),
    adminAuthUserIds = new Set([authUserAdmin]),
    currentAdminAuthUserId = authUserAdmin,
    deleteRejects = false,
    deleteLeavesAuthUser = false,
    deleteLeavesProfile = false,
  } = options;
  const profileByAuthUserId = new Map(profiles.map((profile) => [profile.auth_user_id, profile]));
  const adminProfileByAuthUserId = new Map(
    adminProfiles
      .filter((profile) => adminAuthUserIds.has(profile.auth_user_id))
      .map((profile) => [profile.auth_user_id, profile])
  );
  const deletedAuthUserIds = new Set();
  const deletedProfileAuthUserIds = new Set();

  return {
    requirePermission: vi.fn(async (_req, permission) => {
      if (!isAdmin) {
        const error = new Error("Permission denied.");
        error.status = 403;
        throw error;
      }
      return { ...adminContext, actorAuthUserId: currentAdminAuthUserId, permission };
    }),
    readBody: vi.fn(async (req) => req.body || {}),
    listAuthUsers: vi.fn(async ({ page, perPage }) => {
      const from = (page - 1) * perPage;
      const visibleUsers = users.slice(from, from + perPage);
      return {
        users: visibleUsers,
        total: users.length,
        nextPage: from + perPage < users.length ? page + 1 : null,
      };
    }),
    getAuthUserById: vi.fn(async (authUserId) => {
      if (deletedAuthUserIds.has(authUserId) && !deleteLeavesAuthUser) return null;
      return users.find((user) => user.id === authUserId) || null;
    }),
    deleteAuthUser: vi.fn(async (authUserId) => {
      if (deleteRejects) throw new Error("delete failed");
      deletedAuthUserIds.add(authUserId);
      deletedProfileAuthUserIds.add(authUserId);
    }),
    fetchProfilesByAuthUserIds: vi.fn(async (authUserIds) =>
      authUserIds.map((authUserId) => profileByAuthUserId.get(authUserId)).filter(Boolean)
    ),
    fetchProfileByAuthUserId: vi.fn(async (authUserId) => {
      if (deletedProfileAuthUserIds.has(authUserId) && !deleteLeavesProfile) return null;
      return profileByAuthUserId.get(authUserId) || null;
    }),
    fetchAdminProfilesByAuthUserIds: vi.fn(async (authUserIds) =>
      authUserIds.map((authUserId) => adminProfileByAuthUserId.get(authUserId)).filter(Boolean)
    ),
    fetchAdminProfileByAuthUserId: vi.fn(async (authUserId) => adminProfileByAuthUserId.get(authUserId) || null),
    checkBusinessRecordBlockers: vi.fn(async ({ member }) => {
      if (!businessRecordAuthUserIds.has(member.auth_user_id)) {
        return { hasBusinessRecords: false, blockers: [] };
      }

      return {
        hasBusinessRecords: true,
        blockers: [
          {
            type: "shop_order",
            label: "商城訂單",
            matched_by: "customer_profile_id",
          },
        ],
      };
    }),
    writeAdminActivityLog: vi.fn(async () => undefined),
  };
}

describe("admin members API", () => {
  it("allows an admin to list Auth users merged with customer profiles", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      query: { page: "1", pageSize: "20" },
    });

    expect(response.status).toBe(200);
    expect(response.body.members).toHaveLength(4);
    expect(response.body.members[0]).toMatchObject({
      auth_user_id: authUserA,
      profile_id: "profile-a",
      name: "慢寶會員",
      email: "test@example.com",
      phone: "0912345678",
      profile_status: "normal",
    });
    expect(deps.requirePermission).toHaveBeenCalledWith(expect.any(Object), "users.view");
  });

  it("excludes Auth users that already have admin_profiles from the member list", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler);

    expect(response.status).toBe(200);
    expect(response.body.members.map((member) => member.auth_user_id)).not.toContain(authUserAdmin);
    expect(deps.fetchAdminProfilesByAuthUserIds).toHaveBeenCalled();
  });

  it("does not return unnecessary Auth metadata to the frontend", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler);
    const member = response.body.members.find((item) => item.auth_user_id === authUserA);

    expect(member).toBeTruthy();
    expect(member).not.toHaveProperty("raw_app_meta_data");
    expect(member).not.toHaveProperty("raw_user_meta_data");
    expect(member).not.toHaveProperty("identities");
    expect(member).not.toHaveProperty("confirmation_token");
    expect(member).not.toHaveProperty("recovery_token");
    expect(Object.keys(member).sort()).toEqual([
      "admin_profile_id",
      "auth_user_id",
      "email",
      "email_verified",
      "email_verified_label",
      "has_profile",
      "id",
      "is_admin_user",
      "last_login_at",
      "member_type",
      "name",
      "phone",
      "profile_created_at",
      "profile_id",
      "profile_is_active",
      "profile_status",
      "profile_status_label",
      "profile_updated_at",
      "registered_at",
    ]);
  });

  it("rejects non-admin member listing", async () => {
    const deps = createDependencies({ isAdmin: false });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Permission denied.");
  });

  it("shows Auth users without customer profiles as incomplete members", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler);
    const legacyMember = response.body.members.find((member) => member.auth_user_id === authUserC);

    expect(legacyMember).toMatchObject({
      has_profile: false,
      profile_status: "missing_profile",
      profile_status_label: "缺少會員 profile",
      email_verified: true,
    });
  });

  it("uses Auth email confirmation timestamps for verified and unverified status", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler);
    const verified = response.body.members.find((member) => member.auth_user_id === authUserA);
    const unverified = response.body.members.find((member) => member.auth_user_id === authUserB);

    expect(verified.email_verified_label).toBe("已驗證");
    expect(unverified).toMatchObject({
      email_verified: false,
      email_verified_label: "尚未驗證",
      profile_status: "email_not_verified",
    });
  });

  it("searches by profile name", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { search: "慢寶" } });

    expect(response.status).toBe(200);
    expect(response.body.members.map((member) => member.auth_user_id)).toEqual([authUserA]);
  });

  it("searches beyond the current visible list page", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const firstPage = await invoke(handler, { query: { page: "1", pageSize: "2" } });
    const searchResponse = await invoke(handler, {
      query: { page: "1", pageSize: "2", search: "舊帳號" },
    });

    expect(firstPage.body.members.map((member) => member.auth_user_id)).not.toContain(authUserC);
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.members.map((member) => member.auth_user_id)).toEqual([authUserC]);
  });

  it("searches by normalized email casing and surrounding spaces", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { search: " TEST@example.COM " } });

    expect(response.status).toBe(200);
    expect(response.body.members.map((member) => member.auth_user_id)).toEqual([authUserA]);
  });

  it("searches by phone", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { search: "0987-654-321" } });

    expect(response.status).toBe(200);
    expect(response.body.members.map((member) => member.auth_user_id)).toEqual([authUserB]);
  });

  it("returns a clear empty state payload when search has no result", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { search: "不存在的會員" } });

    expect(response.status).toBe(200);
    expect(response.body.members).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it("loads a single member with deletion information for the confirmation dialog", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { id: authUserD } });

    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({
      auth_user_id: authUserD,
      profile_id: "profile-d",
    });
    expect(response.body.deletion).toMatchObject({
      hasBusinessRecords: false,
      can_delete: true,
      profile_deletion_mode: "auth_user_on_delete_cascade",
    });
  });

  it("marks admin Auth users as not deletable when requested directly", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { id: authUserAdmin } });

    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({
      auth_user_id: authUserAdmin,
      is_admin_user: true,
      profile_status: "admin_user",
      profile_status_label: "後台管理員",
    });
    expect(response.body.deletion).toMatchObject({
      can_delete: false,
    });
  });

  it("does not delete Auth users that have admin_profiles", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserAdmin },
      body: { confirmEmail: "admin@example.com" },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      code: "ADMIN_MEMBER_DELETE_FORBIDDEN",
      error: "後台管理員帳號不可從會員管理刪除。",
    });
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member_blocked",
        targetType: "customer_member",
        targetId: authUserAdmin,
      })
    );
  });

  it("does not allow the currently signed-in admin to delete themselves", async () => {
    const deps = createDependencies({
      currentAdminAuthUserId: authUserD,
      adminAuthUserIds: new Set(),
    });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ADMIN_MEMBER_DELETE_FORBIDDEN");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes a member without orders through Auth Admin deleteUser and relies on profile cascade", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: " delete@example.com " },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: "MEMBER_DELETED",
      message: "會員帳號已刪除。",
      profile_deletion_mode: "auth_user_on_delete_cascade",
    });
    expect(deps.requirePermission).toHaveBeenCalledWith(expect.any(Object), "users.update");
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(authUserD);
    expect(deps.getAuthUserById).toHaveBeenCalledTimes(2);
    expect(deps.fetchProfileByAuthUserId).toHaveBeenCalledTimes(2);
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member",
        targetType: "customer_member",
        targetId: authUserD,
        beforeData: expect.objectContaining({
          auth_user_id: authUserD,
          email: "delete@example.com",
        }),
        afterData: expect.objectContaining({
          delete_status: "success",
        }),
      })
    );
  });

  it("blocks permanent deletion when the member has orders or business records", async () => {
    const deps = createDependencies({ businessRecordAuthUserIds: new Set([authUserD]) });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: "MEMBER_HAS_BUSINESS_RECORDS",
      error: "此會員已有訂單或交易紀錄，為保留帳務資料，目前不能直接刪除。",
    });
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member_blocked",
        targetType: "customer_member",
        targetId: authUserD,
        afterData: expect.objectContaining({
          delete_status: "blocked",
        }),
      })
    );
  });

  it("matches order blocker emails with trim and lowercase normalization", () => {
    expect(
      __testing.hasNormalizedEmailInRows(
        [
          { id: "order-1", customer_email: " Test@Example.com " },
          { id: "order-2", customer_email: "other-test@example.com" },
        ],
        "customer_email",
        "test@example.com"
      )
    ).toBe(true);
    expect(
      __testing.hasNormalizedEmailInRows(
        [{ id: "order-2", guest_email: "other-test@example.com" }],
        "guest_email",
        "test@example.com"
      )
    ).toBe(false);
  });

  it("rejects non-admin deletion", async () => {
    const deps = createDependencies({ isAdmin: false });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(response.status).toBe(403);
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("does not delete when the confirmation email does not match exactly after normalization", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "other@example.com" },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("EMAIL_CONFIRMATION_MISMATCH");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member_failed",
        targetType: "customer_member",
        targetId: authUserD,
        afterData: expect.objectContaining({
          delete_status: "failed",
          error: "email_confirmation_mismatch",
        }),
      })
    );
  });

  it("does not report success when Supabase Auth deletion fails", async () => {
    const deps = createDependencies({ deleteRejects: true });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      ok: false,
      code: "MEMBER_DELETE_FAILED",
      error: "會員帳號刪除失敗，請稍後再試。",
    });
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member_failed",
        targetType: "customer_member",
        targetId: authUserD,
        afterData: expect.objectContaining({
          delete_status: "failed",
          error: "delete_user_failed",
        }),
      })
    );
  });

  it("does not report success if deletion verification finds Auth or profile data remaining", async () => {
    const deps = createDependencies({ deleteLeavesProfile: true });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      ok: false,
      code: "MEMBER_DELETE_VERIFY_FAILED",
      error: "會員帳號刪除失敗，請稍後再試。",
    });
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete_customer_member_failed",
        targetType: "customer_member",
        targetId: authUserD,
        afterData: expect.objectContaining({
          delete_status: "failed",
          error: "customer_profile_still_exists",
        }),
      })
    );
  });
});
