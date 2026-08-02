import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { __testing, createAdminMembersHandler } from "./members.js";

const authUserA = "11111111-1111-4111-8111-111111111111";
const authUserB = "22222222-2222-4222-8222-222222222222";
const authUserC = "33333333-3333-4333-8333-333333333333";
const authUserD = "44444444-4444-4444-8444-444444444444";
const authUserE = "55555555-5555-4555-8555-555555555555";
const authUserF = "66666666-6666-4666-8666-666666666666";
const authUserAdmin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const adminProfileId = "admin-profile-1";

const extraAuthUsers = Array.from({ length: 12 }, (_, index) => {
  const suffix = String(index + 1).padStart(12, "0");
  return {
    id: `70000000-0000-4000-8000-${suffix}`,
    email: `extra-${index + 1}@example.com`,
    created_at: `2026-08-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`,
    last_sign_in_at: null,
    email_confirmed_at: `2026-08-${String(index + 10).padStart(2, "0")}T00:05:00.000Z`,
    confirmed_at: null,
    user_metadata: { name: `Extra Member ${index + 1}`, phone: `09000000${String(index + 1).padStart(2, "0")}` },
  };
});

const users = [
  {
    id: authUserA,
    email: "Test@Example.com",
    created_at: "2026-08-01T00:00:00.000Z",
    last_sign_in_at: "2026-08-01T01:00:00.000Z",
    email_confirmed_at: "2026-08-01T00:05:00.000Z",
    confirmed_at: null,
    user_metadata: { name: "Auth Alice", phone: "0900000000" },
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
    user_metadata: { name: "Legacy Account" },
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
    id: authUserE,
    email: "diamond@example.com",
    created_at: "2026-08-01T05:00:00.000Z",
    last_sign_in_at: "2026-08-02T01:00:00.000Z",
    email_confirmed_at: "2026-08-01T05:05:00.000Z",
    confirmed_at: null,
    user_metadata: {},
  },
  {
    id: authUserF,
    email: "vip@example.com",
    created_at: "2026-08-01T06:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-08-01T06:05:00.000Z",
    confirmed_at: null,
    user_metadata: {},
  },
  ...extraAuthUsers,
  {
    id: authUserAdmin,
    email: "admin@example.com",
    created_at: "2026-08-01T07:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed_at: "2026-08-01T07:05:00.000Z",
    confirmed_at: null,
    user_metadata: { name: "Back Office Admin" },
  },
];

const profiles = [
  {
    id: "profile-a",
    auth_user_id: authUserA,
    email: "test@example.com",
    name: "Alice Chen",
    phone: "0912345678",
    is_active: true,
    member_level: "normal",
    admin_note: "",
    admin_note_updated_at: null,
    admin_note_updated_by: null,
    coupon_code: null,
    coupon_bound_at: null,
    created_at: "2026-08-01T00:00:01.000Z",
    updated_at: "2026-08-01T00:00:01.000Z",
  },
  {
    id: "profile-b",
    auth_user_id: authUserB,
    email: "pending@example.com",
    name: "Pending Member",
    phone: "0987654321",
    is_active: true,
    member_level: "normal",
    admin_note: "",
    admin_note_updated_at: null,
    admin_note_updated_by: null,
    coupon_code: null,
    coupon_bound_at: null,
    created_at: "2026-08-01T02:00:01.000Z",
    updated_at: "2026-08-01T02:00:01.000Z",
  },
  {
    id: "profile-d",
    auth_user_id: authUserD,
    email: "delete@example.com",
    name: "Delete Me",
    phone: "0911000000",
    is_active: true,
    member_level: "normal",
    admin_note: "",
    admin_note_updated_at: null,
    admin_note_updated_by: null,
    coupon_code: null,
    coupon_bound_at: null,
    created_at: "2026-08-01T04:00:01.000Z",
    updated_at: "2026-08-01T04:00:01.000Z",
  },
  {
    id: "profile-e",
    auth_user_id: authUserE,
    email: "diamond@example.com",
    name: "Diamond Partner",
    phone: "0922000000",
    is_active: true,
    member_level: "diamond",
    admin_note: "Prefers low floor.",
    admin_note_updated_at: "2026-08-02T00:00:00.000Z",
    admin_note_updated_by: adminProfileId,
    coupon_code: "DIAMOND2026",
    coupon_bound_at: "2026-08-02T00:00:00.000Z",
    created_at: "2026-08-01T05:00:01.000Z",
    updated_at: "2026-08-01T05:00:01.000Z",
  },
  {
    id: "profile-f",
    auth_user_id: authUserF,
    email: "vip@example.com",
    name: "VIP Member",
    phone: "0933000000",
    is_active: true,
    member_level: "vip",
    admin_note: "",
    admin_note_updated_at: null,
    admin_note_updated_by: null,
    coupon_code: null,
    coupon_bound_at: null,
    created_at: "2026-08-01T06:00:01.000Z",
    updated_at: "2026-08-01T06:00:01.000Z",
  },
  ...extraAuthUsers.map((user, index) => ({
    id: `profile-extra-${index + 1}`,
    auth_user_id: user.id,
    email: user.email,
    name: user.user_metadata.name,
    phone: user.user_metadata.phone,
    is_active: true,
    member_level: index === 10 ? "vip" : "normal",
    admin_note: "",
    admin_note_updated_at: null,
    admin_note_updated_by: null,
    coupon_code: null,
    coupon_bound_at: null,
    created_at: user.created_at,
    updated_at: user.created_at,
  })),
];

const adminProfiles = [
  {
    id: adminProfileId,
    auth_user_id: authUserAdmin,
    email: "admin@example.com",
    display_name: "Back Office Admin",
    role_code: "super_admin",
    is_active: true,
  },
];

const shopOrders = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    order_number: "SHOP-001",
    customer_profile_id: "profile-a",
    customer_email: " Test@Example.com ",
    customer_name: "Alice Chen",
    customer_phone: "0912345678",
    subtotal: 1000,
    shipping_fee: 200,
    total: 1200,
    payment_method: "credit_card",
    payment_status: "confirmed",
    order_status: "completed",
    order_source: "online",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T01:00:00.000Z",
    items: [
      {
        id: "item-1",
        order_id: "90000000-0000-4000-8000-000000000001",
        product_name: "Mumbao Mug",
        variant_name: "Color",
        variant_option: "White",
        variant_price: 500,
        unit_price: 500,
        quantity: 2,
        line_total: 1000,
      },
    ],
  },
  {
    id: "90000000-0000-4000-8000-000000000002",
    order_number: "SHOP-CANCELLED",
    customer_profile_id: "profile-a",
    customer_email: "test@example.com",
    total: 5000,
    payment_status: "confirmed",
    order_status: "cancelled",
    order_source: "online",
    created_at: "2026-07-02T00:00:00.000Z",
    items: [],
  },
  {
    id: "90000000-0000-4000-8000-000000000003",
    order_number: "SHOP-FAILED",
    customer_profile_id: "profile-a",
    customer_email: "test@example.com",
    total: 3000,
    payment_status: "failed",
    order_status: "completed",
    order_source: "online",
    created_at: "2026-07-03T00:00:00.000Z",
    items: [],
  },
  {
    id: "90000000-0000-4000-8000-000000000004",
    order_number: "SHOP-REFUNDED",
    customer_profile_id: "profile-a",
    customer_email: "test@example.com",
    total: 2200,
    payment_status: "confirmed",
    order_status: "refunded",
    order_source: "online",
    created_at: "2026-07-04T00:00:00.000Z",
    items: [],
  },
  {
    id: "90000000-0000-4000-8000-000000000005",
    order_number: "TEST-ORDER-001",
    customer_profile_id: "profile-a",
    customer_email: "test@example.com",
    total: 9999,
    payment_status: "confirmed",
    order_status: "completed",
    order_source: "test",
    created_at: "2026-07-05T00:00:00.000Z",
    items: [],
  },
  {
    id: "90000000-0000-4000-8000-000000000006",
    order_number: "SHOP-DIAMOND",
    customer_profile_id: "profile-e",
    customer_email: "diamond@example.com",
    total: 2000,
    payment_status: "confirmed",
    order_status: "completed",
    order_source: "online",
    created_at: "2026-07-06T00:00:00.000Z",
    items: [
      {
        id: "item-2",
        order_id: "90000000-0000-4000-8000-000000000006",
        product_name: "Slow Time Tea",
        variant_name: "Pack",
        variant_option: "Gift",
        variant_price: 1000,
        unit_price: 1000,
        quantity: 2,
        line_total: 2000,
      },
    ],
  },
];

const bookingRequests = [
  {
    id: "book-a-1",
    guest_email: "TEST@example.com",
    guest_name: "Alice Chen",
    guest_phone: "0912345678",
    status: "confirmed",
    check_in: "2026-01-01",
    check_out: "2026-01-03",
    stay_type: "villa",
    guest_count: 4,
    adults: 2,
    children: 2,
    room_count: null,
    source: "official_site",
    created_at: "2025-12-01T00:00:00.000Z",
    updated_at: "2025-12-01T01:00:00.000Z",
  },
  {
    id: "book-a-2",
    guest_email: "test@example.com",
    guest_name: "Alice Chen",
    guest_phone: "0912345678",
    status: "cancelled",
    check_in: "2026-02-01",
    check_out: "2026-02-03",
    stay_type: "room",
    guest_count: 2,
    adults: 2,
    children: 0,
    room_count: 1,
    source: "line",
    created_at: "2025-12-05T00:00:00.000Z",
    updated_at: "2025-12-05T01:00:00.000Z",
  },
  {
    id: "book-other",
    guest_email: "other@example.com",
    guest_name: "Other Guest",
    guest_phone: "0900000000",
    status: "confirmed",
    check_in: "2026-01-05",
    check_out: "2026-01-07",
    stay_type: "villa",
    guest_count: 3,
    adults: 3,
    children: 0,
    room_count: null,
    source: "phone",
    created_at: "2025-12-02T00:00:00.000Z",
    updated_at: "2025-12-02T01:00:00.000Z",
  },
];

const diamondProfiles = [
  {
    id: "diamond-profile-e",
    customer_profile_id: "profile-e",
    partner_name: "Slow Partner Cafe",
    exclusive_code: "DIAMOND2026",
    partnership_status: "active",
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
  },
];

const pointsLedger = [
  {
    id: "ledger-1",
    customer_profile_id: "profile-e",
    points: 2000,
    description: "Stay reward",
    source_order_id: null,
    created_by_admin_id: adminProfileId,
    created_at: "2026-08-02T00:00:00.000Z",
  },
  {
    id: "ledger-2",
    customer_profile_id: "profile-e",
    points: -300,
    description: "Partner redemption",
    source_order_id: null,
    created_by_admin_id: adminProfileId,
    created_at: "2026-08-03T00:00:00.000Z",
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

async function invoke(handler, { method = "GET", query = {}, body = null, ip = "127.0.0.1" } = {}) {
  const req = {
    method,
    query,
    body,
    headers: { authorization: "Bearer admin-token" },
    socket: { remoteAddress: ip },
  };
  const res = createMockResponse();
  await handler(req, res);
  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createDependencies(options = {}) {
  const {
    isAdmin = true,
    permissions = ["*"],
    usersData = users,
    profilesData = profiles,
    adminProfilesData = adminProfiles,
    shopOrdersData = shopOrders,
    bookingRequestsData = bookingRequests,
    diamondProfilesData = diamondProfiles,
    pointsLedgerData = pointsLedger,
    currentAdminAuthUserId = authUserAdmin,
    deleteRejects = false,
    deleteLeavesAuthUser = false,
    deleteLeavesProfile = false,
    resendRejects = false,
  } = options;
  const userById = new Map(usersData.map((user) => [user.id, user]));
  const profileByAuthUserId = new Map(profilesData.map((profile) => [profile.auth_user_id, { ...profile }]));
  const profileById = new Map(profilesData.map((profile) => [profile.id, { ...profile }]));
  const adminProfileByAuthUserId = new Map(adminProfilesData.map((profile) => [profile.auth_user_id, profile]));
  const diamondProfileByProfileId = new Map(diamondProfilesData.map((profile) => [profile.customer_profile_id, profile]));
  const ledgerByProfileId = new Map();
  for (const row of pointsLedgerData) {
    const rows = ledgerByProfileId.get(row.customer_profile_id) || [];
    rows.push({ ...row });
    ledgerByProfileId.set(row.customer_profile_id, rows);
  }
  const deletedAuthUserIds = new Set();
  const deletedProfileAuthUserIds = new Set();

  const hasPermission = (permission) =>
    permissions.includes("*") || permissions.includes(permission);

  return {
    requirePermission: vi.fn(async (_req, permission) => {
      if (!isAdmin || !hasPermission(permission)) {
        const error = new Error("Permission denied.");
        error.status = 403;
        throw error;
      }
      return {
        actorAuthUserId: currentAdminAuthUserId,
        actorName: "Admin",
        actorEmail: "admin@example.test",
        roleCode: "super_admin",
        permissions,
        profile: { id: adminProfileId },
      };
    }),
    readBody: vi.fn(async (req) => req.body || {}),
    listAuthUsers: vi.fn(async ({ page, perPage }) => {
      const from = (page - 1) * perPage;
      const visibleUsers = usersData.slice(from, from + perPage);
      return {
        users: visibleUsers,
        total: usersData.length,
        nextPage: from + perPage < usersData.length ? page + 1 : null,
      };
    }),
    getAuthUserById: vi.fn(async (authUserId) => {
      if (deletedAuthUserIds.has(authUserId) && !deleteLeavesAuthUser) return null;
      return userById.get(authUserId) || null;
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
    updateCustomerProfile: vi.fn(async (profileId, patch) => {
      const existing = profileById.get(profileId);
      if (!existing) throw new Error("profile not found");
      const next = {
        ...existing,
        ...patch,
        updated_at: patch.updated_at || "2026-08-05T00:00:00.000Z",
      };
      profileById.set(profileId, next);
      profileByAuthUserId.set(next.auth_user_id, next);
      return next;
    }),
    fetchAdminProfilesByAuthUserIds: vi.fn(async (authUserIds) =>
      authUserIds.map((authUserId) => adminProfileByAuthUserId.get(authUserId)).filter(Boolean)
    ),
    fetchAdminProfileByAuthUserId: vi.fn(async (authUserId) => adminProfileByAuthUserId.get(authUserId) || null),
    checkBusinessRecordBlockers: vi.fn(async ({ member, profile }) => {
      const email = normalizeEmail(member?.email || profile?.email);
      const blockers = [];
      const matchedShopOrders = shopOrdersData.filter(
        (order) =>
          (profile?.id && order.customer_profile_id === profile.id) ||
          normalizeEmail(order.customer_email) === email
      );
      const matchedBookings = bookingRequestsData.filter(
        (request) => normalizeEmail(request.guest_email) === email
      );
      const matchedPointsLedger = profile?.id ? ledgerByProfileId.get(profile.id) || [] : [];
      if (matchedShopOrders.length) {
        blockers.push({ type: "shop_order", label: "shop_orders", matched_by: "profile_or_email" });
      }
      if (matchedBookings.length) {
        blockers.push({ type: "booking_request", label: "booking_requests", matched_by: "guest_email" });
      }
      if (matchedPointsLedger.length) {
        blockers.push({ type: "member_points_ledger", label: "member_points_ledger", matched_by: "customer_profile_id" });
      }
      return { hasBusinessRecords: blockers.length > 0, blockers };
    }),
    fetchShopOrdersForMember: vi.fn(async ({ member, profile }) => {
      const email = normalizeEmail(member?.email || profile?.email);
      return shopOrdersData
        .filter(
          (order) =>
            (profile?.id && order.customer_profile_id === profile.id) ||
            normalizeEmail(order.customer_email) === email
        )
        .map((order) => __testing.normalizeShopOrder(order, order.items || []))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    }),
    fetchBookingRequestsForMember: vi.fn(async ({ member, profile }) => {
      const email = normalizeEmail(member?.email || profile?.email);
      return bookingRequestsData
        .filter((request) => normalizeEmail(request.guest_email) === email)
        .map((request) => ({
          id: request.id,
          booking_number: request.id,
          created_at: request.created_at,
          updated_at: request.updated_at,
          check_in: request.check_in,
          check_out: request.check_out,
          stay_type: request.stay_type,
          stay_type_label: request.stay_type === "room" ? "單間" : "包棟",
          guest_count: request.guest_count,
          adults: request.adults,
          children: request.children,
          room_count: request.room_count,
          status: request.status,
          lodging_amount: null,
          paid_amount: null,
          source: request.source,
          source_label: request.source === "line" ? "LINE" : "官網",
        }));
    }),
    fetchDiamondProfile: vi.fn(async (profileId) => diamondProfileByProfileId.get(profileId) || null),
    fetchPointsLedger: vi.fn(async (profileId) => ledgerByProfileId.get(profileId) || []),
    insertPointsLedger: vi.fn(async (row) => {
      const next = {
        id: `ledger-${Date.now()}`,
        ...row,
        created_at: "2026-08-04T00:00:00.000Z",
      };
      const rows = ledgerByProfileId.get(row.customer_profile_id) || [];
      rows.unshift(next);
      ledgerByProfileId.set(row.customer_profile_id, rows);
      return next;
    }),
    resendVerificationEmail: vi.fn(async () => {
      if (resendRejects) throw new Error("resend failed");
      return { ok: true };
    }),
    writeAdminActivityLog: vi.fn(async () => undefined),
  };
}

describe("admin members API", () => {
  it("lists only non-admin members with a fixed page size of 10", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, { query: { page: "1", pageSize: "99" } });

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(10);
    expect(response.body.members).toHaveLength(10);
    expect(response.body.total).toBe(users.length - 1);
    expect(response.body.totalPages).toBe(2);
    expect(response.body.members.map((member) => member.auth_user_id)).not.toContain(authUserAdmin);
    expect(deps.requirePermission).toHaveBeenCalledWith(expect.any(Object), "users.view");
  });

  it("returns the next member page", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { page: "2" } });

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(response.body.members.length).toBeGreaterThan(0);
    expect(response.body.members[0].auth_user_id).not.toBe(authUserA);
  });

  it("searches the full scanned member set by name, email, and phone", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const firstPage = await invoke(handler, { query: { page: "1" } });
    const byName = await invoke(handler, { query: { search: "0900000012" } });
    const byEmail = await invoke(handler, { query: { search: " TEST@example.COM " } });
    const byPhone = await invoke(handler, { query: { search: "0987-654-321" } });

    expect(firstPage.body.members.map((member) => member.name)).not.toContain("Extra Member 12");
    expect(byName.body.members.map((member) => member.name)).toEqual(["Extra Member 12"]);
    expect(byEmail.body.members.map((member) => member.auth_user_id)).toEqual([authUserA]);
    expect(byPhone.body.members.map((member) => member.auth_user_id)).toEqual([authUserB]);
  });

  it("filters by member level and profile status", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const vipResponse = await invoke(handler, { query: { memberLevel: "vip" } });
    const pendingResponse = await invoke(handler, { query: { profileStatus: "email_not_verified" } });
    const missingProfileResponse = await invoke(handler, { query: { profileStatus: "missing_profile" } });

    expect(vipResponse.body.members.map((member) => member.member_level)).toEqual(["vip", "vip"]);
    expect(pendingResponse.body.members.map((member) => member.auth_user_id)).toEqual([authUserB]);
    expect(missingProfileResponse.body.members.map((member) => member.auth_user_id)).toEqual([authUserC]);
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
  });

  it("rejects member listing without users.view", async () => {
    const handler = createAdminMembersHandler(createDependencies({ permissions: ["users.update"] }));

    const response = await invoke(handler);

    expect(response.status).toBe(403);
  });

  it("loads detail data, purchase summaries, bookings, and shop item snapshots for one member", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { id: authUserA } });

    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({
      auth_user_id: authUserA,
      profile_id: "profile-a",
      name: "Alice Chen",
      email_verified: true,
      member_level: "normal",
      coupon: null,
    });
    expect(response.body.consumption_summary).toMatchObject({
      cumulative_spend: 1200,
      completed_stay_count: 1,
      shop_order_count: 1,
      recent_shop_consumption_at: "2026-07-01T00:00:00.000Z",
    });
    expect(response.body.consumption_summary.recent_consumption_at).toBe("2026-07-01T00:00:00.000Z");
    expect(response.body.booking_records.map((record) => record.id).sort()).toEqual(["book-a-1", "book-a-2"]);
    expect(response.body.shop_orders[0]).toMatchObject({
      order_number: "TEST-ORDER-001",
      items_summary: "尚無商品明細",
    });
    const completedOrder = response.body.shop_orders.find((order) => order.order_number === "SHOP-001");
    expect(completedOrder.items[0]).toMatchObject({
      product_name: "Mumbao Mug",
      variant_name: "Color",
      variant_option: "White",
      unit_price: 500,
      quantity: 2,
      line_total: 1000,
    });
  });

  it("loads limited detail data for an Auth account without a customer profile", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler, { query: { id: authUserC } });

    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({
      auth_user_id: authUserC,
      has_profile: false,
      profile_status: "missing_profile",
      member_level: "normal",
    });
    expect(response.body.diamond_profile).toBeNull();
    expect(response.body.points_ledger).toEqual([]);
  });

  it("distinguishes verified and unverified email status from Auth timestamps", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const response = await invoke(handler);
    const verified = response.body.members.find((member) => member.auth_user_id === authUserA);
    const unverified = response.body.members.find((member) => member.auth_user_id === authUserB);

    expect(verified.email_verified).toBe(true);
    expect(unverified).toMatchObject({
      email_verified: false,
      profile_status: "email_not_verified",
    });
  });

  it("shows coupon data only when a member has a bound coupon code", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const normal = await invoke(handler, { query: { id: authUserA } });
    const diamond = await invoke(handler, { query: { id: authUserE } });

    expect(normal.body.member.coupon).toBeNull();
    expect(diamond.body.member.coupon).toEqual({
      code: "DIAMOND2026",
      bound_at: "2026-08-02T00:00:00.000Z",
    });
  });

  it("returns diamond profile and points balance only for diamond members", async () => {
    const handler = createAdminMembersHandler(createDependencies());

    const diamond = await invoke(handler, { query: { id: authUserE } });
    const vip = await invoke(handler, { query: { id: authUserF } });

    expect(diamond.body.member.member_level).toBe("diamond");
    expect(diamond.body.diamond_profile).toMatchObject({
      partner_name: "Slow Partner Cafe",
      exclusive_code: "DIAMOND2026",
      partnership_status: "active",
      points_balance: 1700,
    });
    expect(diamond.body.points_ledger).toHaveLength(2);
    expect(vip.body.diamond_profile).toBeNull();
    expect(vip.body.points_ledger).toEqual([]);
  });

  it("normalizes diamond exclusive codes before server-side use", () => {
    expect(__testing.normalizeDiamondExclusiveCode("  CafeVIP2026  ")).toBe("CafeVIP2026");
    expect(__testing.getDiamondExclusiveCodeKey("  CafeVIP2026  ")).toBe("cafevip2026");
    expect(__testing.normalizeDiamondProfile({
      id: "diamond-profile",
      customer_profile_id: "profile-x",
      partner_name: "  Partner Cafe  ",
      exclusive_code: "  CafeVIP2026  ",
      partnership_status: "  active  ",
    })).toMatchObject({
      partner_name: "Partner Cafe",
      exclusive_code: "CafeVIP2026",
      partnership_status: "active",
    });
  });

  it("detects duplicate diamond exclusive codes case-insensitively and ignoring surrounding spaces", () => {
    const rows = [
      { customer_profile_id: "profile-a", exclusive_code: " CafeVIP2026 " },
      { customer_profile_id: "profile-b", exclusive_code: "OTHER" },
    ];

    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, "cafevip2026", "profile-b")).toBe(true);
    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, " CAFEVIP2026 ", "profile-b")).toBe(true);
    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, "CafeVIP2026", "profile-a")).toBe(false);
    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, "NEWCODE", "profile-b")).toBe(false);
  });

  it("returns a clear server-side duplicate exclusive code error", () => {
    const rows = [
      { customer_profile_id: "profile-a", exclusive_code: "CafeVIP2026" },
    ];

    try {
      __testing.assertDiamondExclusiveCodeAvailable(rows, " cafevip2026 ", "profile-b");
      throw new Error("expected duplicate exclusive code validation to fail");
    } catch (error) {
      expect(error.message).toBe("此鑽石會員專屬優惠碼已被其他合作店家使用。");
      expect(error.status).toBe(409);
    }
    expect(__testing.assertDiamondExclusiveCodeAvailable(rows, " new-code ", "profile-b")).toBe("new-code");
  });

  it("allows multiple empty diamond exclusive codes in duplicate checks", () => {
    const rows = [
      { customer_profile_id: "profile-a", exclusive_code: null },
      { customer_profile_id: "profile-b", exclusive_code: "" },
      { customer_profile_id: "profile-c", exclusive_code: "   " },
    ];

    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, null, "profile-d")).toBe(false);
    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, "", "profile-d")).toBe(false);
    expect(__testing.hasDuplicateDiamondExclusiveCode(rows, "   ", "profile-d")).toBe(false);
  });

  it("updates member level with users.update permission and writes audit log", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserD },
      body: { action: "update-member-level", memberLevel: "vip" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      code: "MEMBER_LEVEL_UPDATED",
      previous_member_level: "normal",
      next_member_level: "vip",
    });
    expect(deps.updateCustomerProfile).toHaveBeenCalledWith("profile-d", { member_level: "vip" });
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "update_customer_member_level",
      targetType: "customer_member",
      targetId: authUserD,
    }));
  });

  it("rejects invalid member levels instead of silently normalizing them", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserD },
      body: { action: "update-member-level", memberLevel: "gold" },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_MEMBER_LEVEL");
    expect(deps.updateCustomerProfile).not.toHaveBeenCalled();
  });

  it("updates internal note with audit logging", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserA },
      body: { action: "update-admin-note", adminNote: "Often brings a pet." },
    });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("MEMBER_ADMIN_NOTE_UPDATED");
    expect(deps.updateCustomerProfile).toHaveBeenCalledWith("profile-a", expect.objectContaining({
      admin_note: "Often brings a pet.",
      admin_note_updated_by: adminProfileId,
    }));
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "update_customer_member_admin_note",
    }));
  });

  it("adjusts diamond points, recalculates balance, and writes audit log", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserE },
      body: { action: "adjust-points", points: "500", description: "Manual reward" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: "MEMBER_POINTS_ADJUSTED",
      points_balance: 2200,
    });
    expect(deps.insertPointsLedger).toHaveBeenCalledWith(expect.objectContaining({
      customer_profile_id: "profile-e",
      points: 500,
      description: "Manual reward",
      created_by_admin_id: adminProfileId,
    }));
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "adjust_customer_member_points",
    }));
  });

  it("allows manual point deductions for diamond members when the balance remains non-negative", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserE },
      body: { action: "adjust-points", points: "-300", description: "Manual redemption" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: "MEMBER_POINTS_ADJUSTED",
      points_balance: 1400,
    });
    expect(deps.insertPointsLedger).toHaveBeenCalledWith(expect.objectContaining({
      customer_profile_id: "profile-e",
      points: -300,
      description: "Manual redemption",
    }));
  });

  it("rejects point deductions that would make a diamond member balance negative", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserE },
      body: { action: "adjust-points", points: "-2000", description: "Too much redemption" },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "MEMBER_POINTS_BALANCE_NEGATIVE",
      points_balance: 1700,
    });
    expect(deps.insertPointsLedger).not.toHaveBeenCalled();
  });

  it("does not allow point adjustment for non-diamond members", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserA },
      body: { action: "adjust-points", points: "100", description: "Should fail" },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("MEMBER_POINTS_DIAMOND_ONLY");
    expect(deps.insertPointsLedger).not.toHaveBeenCalled();
  });

  it("does not allow member mutations for legacy Auth accounts without customer profiles", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const levelResponse = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserC },
      body: { action: "update-member-level", memberLevel: "vip" },
    });
    const noteResponse = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserC },
      body: { action: "update-admin-note", adminNote: "Should not save" },
    });
    const pointsResponse = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserC },
      body: { action: "adjust-points", points: "100", description: "Should not save" },
    });

    expect(levelResponse.status).toBe(409);
    expect(noteResponse.status).toBe(409);
    expect(pointsResponse.status).toBe(409);
    expect(deps.updateCustomerProfile).not.toHaveBeenCalled();
    expect(deps.insertPointsLedger).not.toHaveBeenCalled();
  });

  it("resends verification only for unverified members and writes audit log", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserB },
      body: { action: "resend-verification" },
      ip: "127.0.0.50",
    });

    expect(response.status).toBe(200);
    expect(response.body.code).toBe("MEMBER_VERIFICATION_RESENT");
    expect(deps.resendVerificationEmail).toHaveBeenCalledWith("pending@example.com");
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "resend_customer_member_verification",
    }));
  });

  it("does not display resend success when Supabase resend fails", async () => {
    const failUsers = users.map((user) =>
      user.id === authUserB ? { ...user, email: "pending-fail@example.com" } : user
    );
    const failProfiles = profiles.map((profile) =>
      profile.auth_user_id === authUserB ? { ...profile, email: "pending-fail@example.com" } : profile
    );
    const deps = createDependencies({
      resendRejects: true,
      usersData: failUsers,
      profilesData: failProfiles,
    });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserB },
      body: { action: "resend-verification" },
      ip: "127.0.0.51",
    });

    expect(response.status).toBe(500);
    expect(response.body.code).not.toBe("MEMBER_VERIFICATION_RESENT");
    expect(response.body.error).toBeTruthy();
    expect(deps.writeAdminActivityLog).not.toHaveBeenCalledWith(expect.objectContaining({
      action: "resend_customer_member_verification",
    }));
  });

  it("requires users.update for member mutations", async () => {
    const deps = createDependencies({ permissions: ["users.view"] });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "PATCH",
      query: { id: authUserA },
      body: { action: "update-admin-note", adminNote: "Blocked" },
    });

    expect(response.status).toBe(403);
    expect(deps.updateCustomerProfile).not.toHaveBeenCalled();
  });

  it("does not delete admin Auth users or the current admin account", async () => {
    const adminDeps = createDependencies();
    const adminHandler = createAdminMembersHandler(adminDeps);
    const selfDeps = createDependencies({
      currentAdminAuthUserId: authUserD,
      adminProfilesData: [],
      shopOrdersData: [],
      bookingRequestsData: [],
    });
    const selfHandler = createAdminMembersHandler(selfDeps);

    const adminResponse = await invoke(adminHandler, {
      method: "DELETE",
      query: { id: authUserAdmin },
      body: { confirmEmail: "admin@example.com" },
    });
    const selfResponse = await invoke(selfHandler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(adminResponse.status).toBe(403);
    expect(selfResponse.status).toBe(403);
    expect(adminDeps.deleteAuthUser).not.toHaveBeenCalled();
    expect(selfDeps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("blocks deletion when normalized email matches shop orders or booking requests", async () => {
    const deps = createDependencies();
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserA },
      body: { confirmEmail: " test@example.com " },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("MEMBER_HAS_BUSINESS_RECORDS");
    expect(response.body.blockers.map((blocker) => blocker.type).sort()).toEqual(["booking_request", "shop_order"]);
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("blocks deletion before deleteUser when the member has points ledger history", async () => {
    const deps = createDependencies({ shopOrdersData: [], bookingRequestsData: [] });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserE },
      body: { confirmEmail: "diamond@example.com" },
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "MEMBER_HAS_BUSINESS_RECORDS",
      error: "此會員已有合作回饋或積分紀錄，為保留帳務資料，目前不能直接刪除。",
    });
    expect(response.body.blockers.map((blocker) => blocker.type)).toContain("member_points_ledger");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes a member without business records and verifies Auth/profile removal", async () => {
    const deps = createDependencies({ shopOrdersData: [], bookingRequestsData: [] });
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
      profile_deletion_mode: "auth_user_on_delete_cascade",
    });
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(authUserD);
    expect(deps.getAuthUserById).toHaveBeenCalledTimes(2);
    expect(deps.fetchProfileByAuthUserId).toHaveBeenCalledTimes(2);
    expect(deps.writeAdminActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "delete_customer_member",
      targetType: "customer_member",
      targetId: authUserD,
    }));
  });

  it("allows safe deletion for legacy Auth accounts without profiles when they have no business records", async () => {
    const deps = createDependencies({ shopOrdersData: [], bookingRequestsData: [], pointsLedgerData: [] });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserC },
      body: { confirmEmail: "legacy@example.com" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: "MEMBER_DELETED",
      profile_deletion_mode: "no_profile",
    });
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(authUserC);
  });

  it("does not report delete success when Supabase deletion or verification fails", async () => {
    const rejectDeps = createDependencies({ shopOrdersData: [], bookingRequestsData: [], deleteRejects: true });
    const rejectHandler = createAdminMembersHandler(rejectDeps);
    const verifyDeps = createDependencies({ shopOrdersData: [], bookingRequestsData: [], deleteLeavesProfile: true });
    const verifyHandler = createAdminMembersHandler(verifyDeps);

    const rejectResponse = await invoke(rejectHandler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });
    const verifyResponse = await invoke(verifyHandler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "delete@example.com" },
    });

    expect(rejectResponse.status).toBe(502);
    expect(rejectResponse.body.code).toBe("MEMBER_DELETE_FAILED");
    expect(verifyResponse.status).toBe(502);
    expect(verifyResponse.body.code).toBe("MEMBER_DELETE_VERIFY_FAILED");
  });

  it("rejects deletion when the email confirmation text does not match", async () => {
    const deps = createDependencies({ shopOrdersData: [], bookingRequestsData: [] });
    const handler = createAdminMembersHandler(deps);

    const response = await invoke(handler, {
      method: "DELETE",
      query: { id: authUserD },
      body: { confirmEmail: "other@example.com" },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("EMAIL_CONFIRMATION_MISMATCH");
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
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

  it("excludes failed, cancelled, refunded, and test orders from consumption summary", () => {
    const normalizedOrders = shopOrders
      .filter((order) => order.customer_profile_id === "profile-a")
      .map((order) => __testing.normalizeShopOrder(order, order.items || []));

    const summary = __testing.buildConsumptionSummary({
      shopOrders: normalizedOrders,
      bookingRecords: [
        {
          status: "confirmed",
          check_out: "2026-01-03",
        },
      ],
    });

    expect(summary.cumulative_spend).toBe(1200);
    expect(summary.shop_order_count).toBe(1);
    expect(__testing.isFullyRefundedShopOrder(normalizedOrders.find((order) => order.order_number === "SHOP-REFUNDED"))).toBe(true);
    expect(__testing.isTestShopOrder(normalizedOrders.find((order) => order.order_number === "TEST-ORDER-001"))).toBe(true);
  });

  it("does not mix lodging records into shop spend or recent shop consumption date", () => {
    const summary = __testing.buildConsumptionSummary({
      shopOrders: [
        __testing.normalizeShopOrder(
          {
            id: "shop-summary",
            order_number: "SHOP-SUMMARY",
            total: 1200,
            payment_status: "confirmed",
            order_status: "completed",
            order_source: "online",
            created_at: "2026-07-01T00:00:00.000Z",
          },
          []
        ),
      ],
      bookingRecords: [
        {
          status: "confirmed",
          check_out: "2026-07-20",
          lodging_amount: 50000,
        },
      ],
    });

    expect(summary.cumulative_spend).toBe(1200);
    expect(summary.completed_stay_count).toBe(1);
    expect(summary.recent_shop_consumption_at).toBe("2026-07-01T00:00:00.000Z");
    expect(summary.recent_consumption_at).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses accurate member detail summary labels in the admin UI", () => {
    const source = readFileSync(new URL("../../src/pages/AdminMemberDetail.tsx", import.meta.url), "utf8");

    expect(source).toContain("商城累積消費");
    expect(source).toContain("目前不包含住宿消費。");
    expect(source).toContain("住宿紀錄");
    expect(source).toContain("依已確認且退房日期已過的住宿資料計算。");
    expect(source).toContain("最近商城消費日期");
    expect(source).not.toContain("累積消費金額");
    expect(source).not.toContain("完成住宿次數");
    expect(source).not.toContain("最近消費日期");
  });

  it("keeps the membership migration safe for points ledger history", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/2026-08-01-shop-customer-membership.sql", import.meta.url), "utf8").toLowerCase();

    expect(sql).toContain("member_level text not null default 'normal'");
    expect(sql).toContain("check (member_level in ('normal', 'vip', 'diamond'))");
    expect(sql).toContain("create unique index if not exists member_diamond_profiles_exclusive_code_unique_idx");
    expect(sql).toContain("on public.member_diamond_profiles((lower(trim(exclusive_code))))");
    expect(sql).toContain("where exclusive_code is not null");
    expect(sql).toContain("and trim(exclusive_code) <> ''");
    expect(sql).not.toContain("shop_customer_profiles_coupon_code");
    expect(sql).not.toContain("coupon_code_unique");
    expect(sql).toContain("create table if not exists public.member_points_ledger");
    expect(sql).toContain("check (points <> 0)");
    expect(sql).toContain("on delete restrict");
    expect(sql).not.toContain("member_points_ledger (\n  id uuid primary key default gen_random_uuid(),\n  customer_profile_id uuid not null references public.shop_customer_profiles(id) on update cascade on delete cascade");
    expect(sql).toContain("member_points_ledger_customer_profile_created_at_idx");
    expect(sql).toContain("alter table public.member_points_ledger enable row level security");
    expect(sql).toContain("revoke all on table public.member_points_ledger from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.member_points_ledger to service_role");
  });

  it("uses an existing generic updated_at trigger function without warehouse side effects", () => {
    const functionSql = readFileSync(new URL("../../supabase/migrations/2026-06-16-shop-warehouse-assets.sql", import.meta.url), "utf8").toLowerCase();
    const membershipSql = readFileSync(new URL("../../supabase/migrations/2026-08-01-shop-customer-membership.sql", import.meta.url), "utf8").toLowerCase();

    expect(functionSql).toContain("create or replace function public.set_shop_warehouse_updated_at()");
    expect(functionSql).toContain("new.updated_at = now();");
    expect(functionSql).toContain("return new;");
    expect(membershipSql).toContain("drop trigger if exists set_member_diamond_profiles_updated_at on public.member_diamond_profiles");
    expect(membershipSql).toContain("create trigger set_member_diamond_profiles_updated_at");
    expect(membershipSql).toContain("execute function public.set_shop_warehouse_updated_at()");
  });
});
