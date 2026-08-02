import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  firstQueryValue,
  getServerEnv,
  getSupabaseConfig,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../shopShared.js";
import { requirePermission, writeAdminActivityLog } from "./core.js";
import { withHandlerSafety } from "./withHandlerSafety.js";

const defaultPage = 1;
const memberListPageSize = 10;
const authScanPageSize = 100;
const maxAuthScanPages = 20;
const maxEmailBlockerCandidates = 100;
const memberVerificationResendCooldownMs = 60_000;
const memberVerificationResendRateLimitWindowMs = 60_000;
const memberVerificationResendIpLimit = 10;
const customerAccountOrigin = "https://www.mumbao.tw";
const customerVerificationRedirectPath = "/account/login?verified=1";
const customerProfileSelect = [
  "id",
  "auth_user_id",
  "email",
  "name",
  "phone",
  "is_active",
  "created_at",
  "updated_at",
  "member_level",
  "admin_note",
  "admin_note_updated_at",
  "admin_note_updated_by",
  "coupon_code",
  "coupon_bound_at",
].join(",");
const adminProfileSelect =
  "id,auth_user_id,email,display_name,role_code,is_active";
const shopOrderSelect = [
  "id",
  "order_number",
  "customer_profile_id",
  "customer_name",
  "customer_phone",
  "customer_email",
  "subtotal",
  "shipping_fee",
  "total",
  "payment_method",
  "payment_status",
  "order_status",
  "order_source",
  "shipping_carrier",
  "tracking_number",
  "created_at",
  "updated_at",
].join(",");
const shopOrderItemSelect = [
  "id",
  "order_id",
  "product_name",
  "product_slug",
  "product_image_url",
  "variant_name",
  "variant_option",
  "variant_price",
  "unit_price",
  "quantity",
  "line_total",
  "created_at",
].join(",");
const bookingRequestSelect = [
  "id",
  "guest_name",
  "guest_email",
  "guest_phone",
  "check_in",
  "check_out",
  "guest_count",
  "status",
  "customer_profile_id",
  "final_lodging_amount",
  "completed_at",
  "completed_by_admin_id",
  "partner_points_awarded_at",
  "partner_points_awarded_to_profile_id",
  "partner_points_ledger_id",
  "stay_type",
  "adults",
  "children",
  "room_count",
  "has_pets",
  "pet_count",
  "pet_type",
  "pet_notes",
  "source",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const diamondProfileSelect =
  "id,customer_profile_id,partner_name,exclusive_code,partnership_status,created_at,updated_at";
const pointsLedgerSelect =
  "id,customer_profile_id,points,description,source_order_id,source_type,created_by_admin_id,created_at";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memberLevels = new Set(["normal", "vip", "diamond"]);
const memberStatusFilters = new Set([
  "normal",
  "email_not_verified",
  "missing_profile",
  "inactive",
]);
const diamondPartnershipStatuses = new Set(["active", "paused", "ended"]);
const memberLevelLabels = {
  normal: "普通會員",
  vip: "VIP會員",
  diamond: "鑽石會員",
};
const memberStatusLabels = {
  admin_user: "後台管理員",
  missing_profile: "缺少會員 profile",
  email_not_verified: "Email 尚未驗證",
  inactive: "已停用",
  normal: "正常",
};
const memberDeleteBlockedMessage =
  "此會員已有訂單或交易紀錄，為保留帳務資料，目前不能直接刪除。";
const memberPointsLedgerDeleteBlockedMessage =
  "此會員已有合作回饋或積分紀錄，為保留帳務資料，目前不能直接刪除。";
const diamondExclusiveCodeDuplicateMessage =
  "此鑽石會員專屬優惠碼已被其他合作店家使用。";
const memberDeleteFailedMessage = "會員帳號刪除失敗，請稍後再試。";
const memberNotFoundMessage = "找不到此會員，資料可能已被刪除或更新。";
const adminMemberDeleteForbiddenMessage = "後台管理員帳號不可從會員管理刪除。";

let supabaseAdminClientCache = null;
const resendCooldownByEmailHash = new Map();
const resendRateLimitByIpHash = new Map();

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanLimitedText(value, maxLength) {
  return cleanText(value).slice(0, maxLength);
}

export function normalizeMemberEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizePhoneSearch(value) {
  return cleanText(value).replace(/[^\d+]/g, "");
}

function getPage(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPage;
}

function getPageSize() {
  return memberListPageSize;
}

function isValidUuid(value) {
  return uuidPattern.test(cleanText(value));
}

function getAuthUserMetadataValue(user, keys) {
  const metadata =
    user?.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
  for (const key of keys) {
    const value = cleanText(metadata[key]);
    if (value) return value;
  }
  return "";
}

function normalizeMemberLevel(value) {
  const level = cleanText(value || "normal").toLowerCase();
  return memberLevels.has(level) ? level : "normal";
}

function getMemberProfileStatus({ profile, emailVerified, adminProfile }) {
  if (adminProfile) return "admin_user";
  if (!profile) return "missing_profile";
  if (!emailVerified) return "email_not_verified";
  if (profile.is_active === false) return "inactive";
  return "normal";
}

function getMemberProfileStatusLabel(status) {
  return memberStatusLabels[status] || memberStatusLabels.normal;
}

function getMemberLevelLabel(level) {
  return memberLevelLabels[normalizeMemberLevel(level)];
}

export function normalizeAdminMember(authUser, profile = null, adminProfile = null) {
  const user = authUser?.user || authUser || {};
  const authUserId = cleanText(user.id);
  const email = normalizeMemberEmail(user.email || profile?.email);
  const emailVerified = Boolean(user.email_confirmed_at || user.confirmed_at);
  const name =
    cleanText(profile?.name) ||
    getAuthUserMetadataValue(user, ["name", "display_name", "displayName", "full_name"]);
  const phone =
    cleanText(profile?.phone) || getAuthUserMetadataValue(user, ["phone", "phone_number"]);
  const profileStatus = getMemberProfileStatus({ profile, emailVerified, adminProfile });
  const memberLevel = normalizeMemberLevel(profile?.member_level);
  const couponCode = cleanText(profile?.coupon_code);

  return {
    id: authUserId,
    auth_user_id: authUserId,
    profile_id: profile?.id || null,
    name,
    email,
    phone,
    email_verified: emailVerified,
    email_verified_label: emailVerified ? "已驗證" : "尚未驗證",
    registered_at: user.created_at || user.createdAt || null,
    last_login_at: user.last_sign_in_at || user.lastSignInAt || null,
    profile_status: profileStatus,
    profile_status_label: getMemberProfileStatusLabel(profileStatus),
    member_level: memberLevel,
    member_level_label: getMemberLevelLabel(memberLevel),
    is_admin_user: Boolean(adminProfile),
    admin_profile_id: adminProfile?.id || null,
    member_type: adminProfile ? "admin" : "customer",
    has_profile: Boolean(profile),
    profile_is_active: profile ? profile.is_active !== false : null,
    profile_created_at: profile?.created_at || null,
    profile_updated_at: profile?.updated_at || null,
    admin_note: profile?.admin_note || "",
    admin_note_updated_at: profile?.admin_note_updated_at || null,
    admin_note_updated_by: profile?.admin_note_updated_by || null,
    coupon: couponCode
      ? {
          code: couponCode,
          bound_at: profile?.coupon_bound_at || null,
        }
      : null,
  };
}

function matchesMemberSearch(member, rawSearch) {
  const search = cleanText(rawSearch).toLowerCase();
  if (!search) return true;

  const emailSearch = normalizeMemberEmail(search);
  const phoneSearch = normalizePhoneSearch(search);
  const fields = [member.name, member.email, member.phone].map((value) =>
    cleanText(value).toLowerCase()
  );
  const rawMatch = fields.some((value) => value.includes(search));
  const emailMatch = member.email.includes(emailSearch);
  const phoneMatch =
    phoneSearch &&
    normalizePhoneSearch(member.phone).includes(phoneSearch);

  return Boolean(rawMatch || emailMatch || phoneMatch);
}

function matchesMemberLevel(member, rawLevel) {
  const level = cleanText(rawLevel).toLowerCase();
  if (!level || level === "all") return true;
  if (!memberLevels.has(level)) return true;
  return member.member_level === level;
}

function matchesMemberStatus(member, rawStatus) {
  const status = cleanText(rawStatus).toLowerCase();
  if (!status || status === "all") return true;
  if (!memberStatusFilters.has(status)) return true;
  return member.profile_status === status;
}

function buildIlikeContainsFilter(value) {
  return encodeURIComponent(`*${cleanText(value)}*`);
}

function getSupabaseAdminClient() {
  const supabaseUrl = cleanText(getServerEnv("SUPABASE_URL")).replace(/\/$/, "");
  const serviceRoleKey = cleanText(getServerEnv("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    throw createHttpError(500, "Supabase admin client is not configured.");
  }

  if (
    supabaseAdminClientCache?.supabaseUrl === supabaseUrl &&
    supabaseAdminClientCache?.serviceRoleKey === serviceRoleKey
  ) {
    return supabaseAdminClientCache.client;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  supabaseAdminClientCache = {
    supabaseUrl,
    serviceRoleKey,
    client,
  };
  return client;
}

function getSupabasePublicAuthClient() {
  const supabaseUrl =
    getServerEnv("SUPABASE_URL") ||
    getServerEnv("VITE_SUPABASE_URL") ||
    getServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    getServerEnv("SUPABASE_ANON_KEY") ||
    getServerEnv("VITE_SUPABASE_ANON_KEY") ||
    getServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    throw createHttpError(500, "Supabase public auth client is not configured.");
  }

  return createClient(String(supabaseUrl).replace(/\/$/, ""), anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function listAuthUsers({ page, perPage }) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage,
  });

  if (error) {
    throw createHttpError(502, "會員 Auth 資料暫時無法讀取，請稍後再試。");
  }

  return {
    users: Array.isArray(data?.users) ? data.users : [],
    total: Number(data?.total || 0),
    nextPage: data?.nextPage || null,
    lastPage: Number(data?.lastPage || 0),
  };
}

async function getAuthUserById(authUserId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(authUserId);

  if (error) {
    const status = Number(error.status || 0);
    if (status === 404) return null;
    throw createHttpError(502, "會員 Auth 資料暫時無法讀取，請稍後再試。");
  }

  return data?.user || null;
}

async function deleteAuthUser(authUserId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) {
    throw createHttpError(502, memberDeleteFailedMessage);
  }
}

async function resendVerificationEmail(email) {
  const supabase = getSupabasePublicAuthClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${customerAccountOrigin}${customerVerificationRedirectPath}`,
    },
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const code = String(error.code || "").toLowerCase();
    const safeNoop =
      code.includes("user_not_found") ||
      code.includes("email_not_found") ||
      message.includes("user not found") ||
      message.includes("email not found") ||
      message.includes("not registered") ||
      message.includes("already confirmed") ||
      message.includes("already verified");
    if (!safeNoop) throw createHttpError(502, "驗證信寄送失敗，請稍後再試。");
  }
}

async function fetchProfilesByAuthUserIds(authUserIds) {
  const uniqueIds = Array.from(
    new Set(authUserIds.map((id) => cleanText(id)).filter(Boolean))
  );
  if (!uniqueIds.length) return [];

  const idList = uniqueIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=in.(${idList})&select=${customerProfileSelect}`
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchProfileByAuthUserId(authUserId) {
  if (!authUserId) return null;
  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&select=${customerProfileSelect}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateCustomerProfile(profileId, patch) {
  const rows = await supabaseRequest(
    `/shop_customer_profiles?id=eq.${encodeURIComponent(profileId)}&select=${customerProfileSelect}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function fetchAdminProfilesByAuthUserIds(authUserIds) {
  const uniqueIds = Array.from(
    new Set(authUserIds.map((id) => cleanText(id)).filter(Boolean))
  );
  if (!uniqueIds.length) return [];

  const idList = uniqueIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest(
    `/admin_profiles?auth_user_id=in.(${idList})&select=${adminProfileSelect}`
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchAdminProfileByAuthUserId(authUserId) {
  if (!authUserId) return null;
  const rows = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&select=${adminProfileSelect}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function restRowsExist(pathname) {
  const rows = await supabaseRequest(pathname);
  return Array.isArray(rows) && rows.length > 0;
}

async function restRows(pathname) {
  const rows = await supabaseRequest(pathname);
  return Array.isArray(rows) ? rows : [];
}

function hasNormalizedEmailInRows(rows, column, email) {
  const normalizedEmail = normalizeMemberEmail(email);
  if (!normalizedEmail) return false;
  return (rows || []).some(
    (row) => normalizeMemberEmail(row?.[column]) === normalizedEmail
  );
}

async function hasNormalizedEmailMatch({ table, column, email }) {
  const normalizedEmail = normalizeMemberEmail(email);
  if (!normalizedEmail) return false;

  const emailPattern = buildIlikeContainsFilter(normalizedEmail);
  const rows = await restRows(
    `/${table}?${column}=ilike.${emailPattern}&select=id,${column}&limit=${maxEmailBlockerCandidates}`
  );
  return hasNormalizedEmailInRows(rows, column, normalizedEmail);
}

async function checkBusinessRecordBlockers({ member, profile }) {
  const blockers = [];
  const email = normalizeMemberEmail(member?.email || profile?.email);

  if (profile?.id) {
    const hasProfileOrders = await restRowsExist(
      `/shop_orders?customer_profile_id=eq.${encodeURIComponent(
        profile.id
      )}&select=id&limit=1`
    );
    if (hasProfileOrders) {
      blockers.push({
        type: "shop_order",
        label: "商城訂單",
        matched_by: "customer_profile_id",
      });
    }

    const hasPointsLedger = await restRowsExist(
      `/member_points_ledger?customer_profile_id=eq.${encodeURIComponent(
        profile.id
      )}&select=id&limit=1`
    );
    if (hasPointsLedger) {
      blockers.push({
        type: "member_points_ledger",
        label: "合作回饋或積分紀錄",
        matched_by: "customer_profile_id",
      });
    }
  }

  if (email) {
    const hasEmailOrders = await hasNormalizedEmailMatch({
      table: "shop_orders",
      column: "customer_email",
      email,
    });
    if (hasEmailOrders) {
      blockers.push({
        type: "shop_order",
        label: "商城訂單",
        matched_by: "customer_email",
      });
    }

    const hasBookingRequests = await hasNormalizedEmailMatch({
      table: "booking_requests",
      column: "guest_email",
      email,
    });
    if (hasBookingRequests) {
      blockers.push({
        type: "booking_request",
        label: "住宿預約資料",
        matched_by: "guest_email",
      });
    }
  }

  return {
    hasBusinessRecords: blockers.length > 0,
    blockers,
  };
}

function mapProfilesByAuthUserId(profiles) {
  const map = new Map();
  for (const profile of profiles || []) {
    const authUserId = cleanText(profile?.auth_user_id);
    if (authUserId) map.set(authUserId, profile);
  }
  return map;
}

function mapAdminProfilesByAuthUserId(adminProfiles) {
  const map = new Map();
  for (const profile of adminProfiles || []) {
    const authUserId = cleanText(profile?.auth_user_id);
    if (authUserId) map.set(authUserId, profile);
  }
  return map;
}

async function mergeAuthUsersWithProfiles(authUsers, deps) {
  const users = Array.isArray(authUsers) ? authUsers : [];
  const authUserIds = users.map((user) => user?.id).filter(Boolean);
  const profiles = await deps.fetchProfilesByAuthUserIds(authUserIds);
  const adminProfiles = await deps.fetchAdminProfilesByAuthUserIds(authUserIds);
  const profileByAuthUserId = mapProfilesByAuthUserId(profiles);
  const adminProfileByAuthUserId = mapAdminProfilesByAuthUserId(adminProfiles);

  return users.map((user) =>
    normalizeAdminMember(
      user,
      profileByAuthUserId.get(user.id) || null,
      adminProfileByAuthUserId.get(user.id) || null
    )
  );
}

function getManageableMembers(members) {
  return (members || []).filter((member) => !member.is_admin_user);
}

function filterMemberList(members, { search, memberLevel, profileStatus }) {
  return getManageableMembers(members).filter(
    (member) =>
      matchesMemberSearch(member, search) &&
      matchesMemberLevel(member, memberLevel) &&
      matchesMemberStatus(member, profileStatus)
  );
}

function getDeletionProtection({ member, context }) {
  if (!member) return null;
  if (cleanText(context?.actorAuthUserId) === cleanText(member.auth_user_id)) {
    return {
      type: "current_admin",
      label: "目前登入管理員",
      message: adminMemberDeleteForbiddenMessage,
    };
  }
  if (member.is_admin_user) {
    return {
      type: "admin_profile",
      label: "後台管理員",
      message: adminMemberDeleteForbiddenMessage,
    };
  }
  return null;
}

function buildMemberAuditPayload(member, extra = {}) {
  return {
    id: member?.id || null,
    auth_user_id: member?.auth_user_id || null,
    profile_id: member?.profile_id || null,
    email: member?.email || null,
    name: member?.name || null,
    phone: member?.phone || null,
    profile_status: member?.profile_status || null,
    member_level: member?.member_level || null,
    admin_note: member?.admin_note || null,
    ...extra,
  };
}

async function writeMemberAudit({
  deps,
  req,
  context,
  action,
  member,
  description,
  beforeData,
  afterData,
}) {
  await deps.writeAdminActivityLog({
    req,
    context,
    action,
    module: "members",
    targetType: "customer_member",
    targetId: member?.auth_user_id || null,
    description,
    beforeData: {
      ...buildMemberAuditPayload(member),
      ...(beforeData || {}),
    },
    afterData: {
      ...buildMemberAuditPayload(member),
      ...(afterData || {}),
    },
  });
}

async function writeMemberDeletionAudit({
  deps,
  req,
  context,
  action,
  member,
  description,
  status,
  error,
}) {
  await writeMemberAudit({
    deps,
    req,
    context,
    action,
    member,
    description,
    beforeData: {},
    afterData: {
      delete_status: status,
      error: error || null,
    },
  });
}

async function loadMemberRecord(authUserId, deps) {
  if (!isValidUuid(authUserId)) {
    return { authUser: null, profile: null, adminProfile: null, member: null };
  }

  const authUser = await deps.getAuthUserById(authUserId);
  if (!authUser?.id) {
    return { authUser: null, profile: null, adminProfile: null, member: null };
  }
  const profile = await deps.fetchProfileByAuthUserId(authUser.id);
  const adminProfile = await deps.fetchAdminProfileByAuthUserId(authUser.id);
  const member = normalizeAdminMember(authUser, profile, adminProfile);
  return { authUser, profile, adminProfile, member };
}

async function scanMemberList({ page, pageSize, search, memberLevel, profileStatus }, deps) {
  const matchedMembers = [];
  let authTotal = 0;
  let scannedPages = 0;
  let reachedEnd = false;

  for (let authPage = 1; authPage <= maxAuthScanPages; authPage += 1) {
    const pageResult = await deps.listAuthUsers({
      page: authPage,
      perPage: authScanPageSize,
    });
    scannedPages = authPage;
    authTotal = Number(pageResult.total || authTotal || 0);

    const members = await mergeAuthUsersWithProfiles(pageResult.users, deps);
    matchedMembers.push(
      ...filterMemberList(members, { search, memberLevel, profileStatus })
    );

    const userCount = Array.isArray(pageResult.users) ? pageResult.users.length : 0;
    if (
      userCount < authScanPageSize ||
      (authTotal && authPage * authScanPageSize >= authTotal) ||
      (!authTotal && !pageResult.nextPage)
    ) {
      reachedEnd = true;
      break;
    }
  }

  const from = (page - 1) * pageSize;
  const visibleMembers = matchedMembers.slice(from, from + pageSize);
  const searchLimited = !reachedEnd && scannedPages >= maxAuthScanPages;

  return {
    members: visibleMembers,
    page,
    pageSize,
    total: matchedMembers.length,
    totalPages: Math.max(1, Math.ceil(matchedMembers.length / pageSize)),
    hasMore: from + pageSize < matchedMembers.length || searchLimited,
    search,
    memberLevel,
    profileStatus,
    searchLimited,
    source: "supabase_auth_admin_scan",
  };
}

function uniqueRowsById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.id) map.set(row.id, row);
  }
  return Array.from(map.values());
}

function rowsWithNormalizedEmail(rows, column, email) {
  const normalizedEmail = normalizeMemberEmail(email);
  if (!normalizedEmail) return [];
  return (rows || []).filter(
    (row) => normalizeMemberEmail(row?.[column]) === normalizedEmail
  );
}

async function fetchShopOrdersForMember({ member, profile }) {
  const queries = [];
  const email = normalizeMemberEmail(member?.email || profile?.email);

  if (profile?.id) {
    queries.push(
      restRows(
        `/shop_orders?customer_profile_id=eq.${encodeURIComponent(
          profile.id
        )}&select=${shopOrderSelect}&order=created_at.desc&limit=100`
      )
    );
  }

  if (email) {
    queries.push(
      restRows(
        `/shop_orders?customer_email=ilike.${buildIlikeContainsFilter(
          email
        )}&select=${shopOrderSelect}&order=created_at.desc&limit=100`
      ).then((rows) => rowsWithNormalizedEmail(rows, "customer_email", email))
    );
  }

  const orderRows = uniqueRowsById((await Promise.all(queries)).flat());
  const orderIds = orderRows.map((order) => order.id).filter(Boolean);
  const items = orderIds.length
    ? await restRows(
        `/shop_order_items?order_id=in.(${orderIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=${shopOrderItemSelect}&order=created_at.asc&limit=500`
      )
    : [];
  const itemsByOrderId = new Map();
  for (const item of items || []) {
    const nextItems = itemsByOrderId.get(item.order_id) || [];
    nextItems.push(item);
    itemsByOrderId.set(item.order_id, nextItems);
  }

  return orderRows
    .map((order) => normalizeShopOrder(order, itemsByOrderId.get(order.id) || []))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function normalizeShopOrder(order, items) {
  const normalizedItems = (items || []).map((item) => ({
    id: item.id,
    product_name: item.product_name || "",
    product_slug: item.product_slug || "",
    product_image_url: item.product_image_url || "",
    variant_name: item.variant_name || "",
    variant_option: item.variant_option || "",
    variant_price: Number(item.variant_price || 0),
    unit_price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    line_total: Number(item.line_total || 0),
  }));
  const totalQuantity = normalizedItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const firstItem = normalizedItems[0] || null;
  const itemSummary =
    normalizedItems.length === 0
      ? "尚無商品明細"
      : normalizedItems.length === 1
        ? firstItem.product_name
        : `${firstItem.product_name || "商品"}等 ${normalizedItems.length} 項`;

  return {
    id: order.id,
    order_number: order.order_number,
    created_at: order.created_at || null,
    updated_at: order.updated_at || null,
    customer_profile_id: order.customer_profile_id || null,
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: normalizeMemberEmail(order.customer_email),
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    payment_method: order.payment_method || "",
    payment_status: order.payment_status || "pending",
    order_status: order.order_status || "pending_confirm",
    order_source: order.order_source || "online",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    items_summary: itemSummary,
    item_count: normalizedItems.length,
    total_quantity: totalQuantity,
    items: normalizedItems,
  };
}

async function fetchBookingRequestsForMember({ member, profile }) {
  const email = normalizeMemberEmail(member?.email || profile?.email);
  if (!email) return [];

  const rows = await restRows(
    `/booking_requests?guest_email=ilike.${buildIlikeContainsFilter(
      email
    )}&select=${bookingRequestSelect}&order=check_in.desc,created_at.desc&limit=100`
  );

  return rowsWithNormalizedEmail(rows, "guest_email", email)
    .map(normalizeBookingRequestRecord)
    .sort((a, b) =>
      String(b.check_in || b.created_at || "").localeCompare(
        String(a.check_in || a.created_at || "")
      )
    );
}

function getBookingSourceLabel(source) {
  const labels = {
    official_site: "官網",
    website: "官網",
    line: "LINE",
    phone: "電話",
    booking: "Booking",
    booking_ical: "Booking",
    booking_email: "Booking",
    manual: "管理員建立",
    admin: "管理員建立",
  };
  return labels[source] || source || "-";
}

function normalizeBookingRequestRecord(row) {
  const adults = Number(row.adults || 0);
  const children = Number(row.children || 0);
  return {
    id: row.id,
    booking_number: row.id,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    check_in: row.check_in || null,
    check_out: row.check_out || null,
    stay_type: row.stay_type || "villa",
    stay_type_label: row.stay_type === "room" ? "單間" : "包棟",
    guest_count: Number(row.guest_count || adults + children || 0),
    adults,
    children,
    room_count: row.room_count == null ? null : Number(row.room_count),
    status: row.status || "pending_review",
    customer_profile_id: row.customer_profile_id || null,
    final_lodging_amount: row.final_lodging_amount == null ? null : Number(row.final_lodging_amount),
    completed_at: row.completed_at || null,
    completed_by_admin_id: row.completed_by_admin_id || null,
    partner_points_awarded_at: row.partner_points_awarded_at || null,
    partner_points_awarded_to_profile_id: row.partner_points_awarded_to_profile_id || null,
    partner_points_ledger_id: row.partner_points_ledger_id || null,
    lodging_amount: row.final_lodging_amount == null ? null : Number(row.final_lodging_amount),
    paid_amount: null,
    source: row.source || "",
    source_label: getBookingSourceLabel(row.source),
  };
}

function normalizeDiamondExclusiveCode(value) {
  return cleanText(value);
}

function getDiamondExclusiveCodeKey(value) {
  return normalizeDiamondExclusiveCode(value).toLowerCase();
}

function hasDuplicateDiamondExclusiveCode(rows, exclusiveCode, currentProfileId = "") {
  const key = getDiamondExclusiveCodeKey(exclusiveCode);
  if (!key) return false;
  const currentId = cleanText(currentProfileId);
  return (rows || []).some((row) => {
    const rowKey = getDiamondExclusiveCodeKey(row?.exclusive_code);
    if (!rowKey || rowKey !== key) return false;
    if (!currentId) return true;
    return cleanText(row?.customer_profile_id) !== currentId;
  });
}

function assertDiamondExclusiveCodeAvailable(rows, exclusiveCode, currentProfileId = "") {
  const normalizedCode = normalizeDiamondExclusiveCode(exclusiveCode);
  if (hasDuplicateDiamondExclusiveCode(rows, normalizedCode, currentProfileId)) {
    throw createHttpError(409, diamondExclusiveCodeDuplicateMessage);
  }
  return normalizedCode;
}

function normalizeDiamondProfile(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    customer_profile_id: row.customer_profile_id || null,
    partner_name: cleanText(row.partner_name),
    exclusive_code: normalizeDiamondExclusiveCode(row.exclusive_code),
    partnership_status: cleanText(row.partnership_status) || "active",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function fetchDiamondProfile(profileId) {
  if (!profileId) return null;
  const rows = await restRows(
    `/member_diamond_profiles?customer_profile_id=eq.${encodeURIComponent(
      profileId
    )}&select=${diamondProfileSelect}&limit=1`
  );
  return normalizeDiamondProfile(Array.isArray(rows) ? rows[0] || null : null);
}

async function fetchAllDiamondProfiles() {
  return restRows(`/member_diamond_profiles?select=${diamondProfileSelect}&limit=1000`);
}

function isDiamondExclusiveCodeConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("23505") ||
    message.includes("duplicate") ||
    message.includes("member_diamond_profiles_exclusive_code_unique_idx")
  );
}

async function upsertDiamondProfile(profileId, patch) {
  const existing = await fetchDiamondProfile(profileId);
  const payload = {
    customer_profile_id: profileId,
    ...patch,
  };

  const pathname = existing?.id
    ? `/member_diamond_profiles?id=eq.${encodeURIComponent(existing.id)}&select=${diamondProfileSelect}`
    : `/member_diamond_profiles?select=${diamondProfileSelect}`;
  const rows = await supabaseRequest(pathname, {
    method: existing?.id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
  return normalizeDiamondProfile(Array.isArray(rows) ? rows[0] || null : rows || null);
}

async function fetchPointsLedger(profileId) {
  if (!profileId) return [];
  const rows = await restRows(
    `/member_points_ledger?customer_profile_id=eq.${encodeURIComponent(
      profileId
    )}&select=${pointsLedgerSelect}&order=created_at.desc&limit=200`
  );
  return (rows || []).map(normalizePointsLedgerRow);
}

async function fetchPendingRedemptionPoints(profileId) {
  if (!profileId) return 0;
  const rows = await restRows(
    `/member_points_redemption_requests?customer_profile_id=eq.${encodeURIComponent(
      profileId
    )}&status=eq.pending&select=points&limit=1000`
  );
  return (rows || []).reduce((sum, row) => sum + Number(row.points || 0), 0);
}

function normalizePointsLedgerRow(row) {
  return {
    id: row.id,
    customer_profile_id: row.customer_profile_id,
    points: Number(row.points || 0),
    description: row.description || "",
    source_order_id: row.source_order_id || null,
    source_type: row.source_type || null,
    created_by_admin_id: row.created_by_admin_id || null,
    created_at: row.created_at || null,
  };
}

async function insertPointsLedger(row) {
  const rows = await supabaseRequest(
    `/member_points_ledger?select=${pointsLedgerSelect}`,
    {
      method: "POST",
      body: JSON.stringify(row),
    }
  );
  return normalizePointsLedgerRow(Array.isArray(rows) ? rows[0] || {} : rows || {});
}

async function adjustPointsLedger(row) {
  const ledger = await supabaseRpc("adjust_member_points_with_redemption_reserve", {
    p_customer_profile_id: row.customer_profile_id,
    p_points: row.points,
    p_description: row.description,
    p_source_order_id: row.source_order_id,
    p_created_by_admin_id: row.created_by_admin_id,
  });
  return normalizePointsLedgerRow(ledger || {});
}

function isCompletedPaidShopOrder(order) {
  return (
    order.payment_status === "confirmed" &&
    order.order_status === "completed" &&
    !isFullyRefundedShopOrder(order) &&
    !isTestShopOrder(order)
  );
}

function isEstablishedShopOrder(order) {
  return (
    order.payment_status === "confirmed" &&
    order.order_status !== "cancelled" &&
    !isFullyRefundedShopOrder(order) &&
    !isTestShopOrder(order)
  );
}

function isFullyRefundedShopOrder(order) {
  const orderStatus = cleanText(order?.order_status).toLowerCase();
  const paymentStatus = cleanText(order?.payment_status).toLowerCase();
  return ["refunded", "fully_refunded"].includes(orderStatus) ||
    ["refunded", "fully_refunded"].includes(paymentStatus);
}

function isTestShopOrder(order) {
  const source = cleanText(order?.order_source).toLowerCase();
  const orderNumber = cleanText(order?.order_number).toLowerCase();
  return source === "test" || orderNumber.includes("test");
}

function isCompletedStay(record, now = new Date()) {
  if (record.status !== "confirmed" || !record.check_out) return false;
  const checkOutMs = Date.parse(`${record.check_out}T00:00:00.000Z`);
  return Number.isFinite(checkOutMs) && checkOutMs < now.getTime();
}

function maxIsoDate(values) {
  const valid = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return valid[0]?.toISOString() || null;
}

function buildConsumptionSummary({ shopOrders, bookingRecords }) {
  const completedPaidShopOrders = shopOrders.filter(isCompletedPaidShopOrder);
  const establishedShopOrders = shopOrders.filter(isEstablishedShopOrder);
  const completedStays = bookingRecords.filter((record) => isCompletedStay(record));
  const totalSpend = completedPaidShopOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );
  const recentShopConsumptionAt = maxIsoDate(
    completedPaidShopOrders.map((order) => order.created_at)
  );

  return {
    cumulative_spend: totalSpend,
    completed_stay_count: completedStays.length,
    shop_order_count: establishedShopOrders.length,
    recent_consumption_at: recentShopConsumptionAt,
    recent_shop_consumption_at: recentShopConsumptionAt,
    limitations: [
      "booking_requests 目前沒有住宿金額、已付款金額或退款欄位，累積消費暫不納入住宿金額。",
      "booking_external_reservations 有金額欄位，但目前沒有會員 profile、Email 或手機關聯；第一版不以姓名推測歸屬。",
      "shop_orders 目前只有 refunded 狀態，沒有部分退款金額欄位；已全額退款訂單會排除，部分退款無法精準扣除。",
      "booking_requests 目前沒有完成入住狀態；完成住宿次數以 status=confirmed 且退房日已過作為第一版判斷。",
    ],
  };
}

function getPointsBalance(pointsLedger) {
  return (pointsLedger || []).reduce((sum, row) => sum + Number(row.points || 0), 0);
}

async function buildMemberDetailPayload({ member, profile, context, deps }) {
  const protection = getDeletionProtection({ member, context });
  const deletion = protection
    ? {
        hasBusinessRecords: false,
        blockers: [
          {
            type: protection.type,
            label: protection.label,
            matched_by: "auth_user_id",
          },
        ],
      }
    : await deps.checkBusinessRecordBlockers({ member, profile });
  const [shopOrders, bookingRecords, diamondProfile, pointsLedger] = await Promise.all([
    deps.fetchShopOrdersForMember({ member, profile }),
    deps.fetchBookingRequestsForMember({ member, profile }),
    profile?.id ? deps.fetchDiamondProfile(profile.id) : null,
    profile?.id ? deps.fetchPointsLedger(profile.id) : [],
  ]);
  const consumptionSummary = buildConsumptionSummary({ shopOrders, bookingRecords });
  const pointsBalance = getPointsBalance(pointsLedger);

  return {
    member,
    deletion: {
      ...deletion,
      can_delete: !protection && !deletion.hasBusinessRecords,
      profile_deletion_mode: profile ? "auth_user_on_delete_cascade" : "no_profile",
    },
    consumption_summary: consumptionSummary,
    booking_records: bookingRecords,
    shop_orders: shopOrders,
    diamond_profile: member.member_level === "diamond"
      ? {
          id: diamondProfile?.id || null,
          customer_profile_id: profile?.id || null,
          partner_name: diamondProfile?.partner_name || "",
          exclusive_code: diamondProfile?.exclusive_code || "",
          partnership_status: diamondProfile?.partnership_status || "",
          points_balance: pointsBalance,
        }
      : null,
    points_ledger: member.member_level === "diamond" ? pointsLedger : [],
  };
}

function requireMutableCustomerProfile({ member, profile }) {
  if (!member) throw createHttpError(404, memberNotFoundMessage);
  if (member.is_admin_user) throw createHttpError(403, adminMemberDeleteForbiddenMessage);
  if (!profile?.id) throw createHttpError(409, "此 Auth 帳號缺少會員 profile，尚不能修改會員等級或備註。");
}

async function loadMemberList(req, res, deps) {
  const context = await deps.requirePermission(req, "users.view");

  const id = cleanText(firstQueryValue(req.query?.id || req.query?.authUserId));
  if (id) {
    const { profile, member } = await loadMemberRecord(id, deps);
    if (!member) {
      return sendJson(res, 404, {
        ok: false,
        code: "MEMBER_NOT_FOUND",
        error: memberNotFoundMessage,
      });
    }

    const detail = await buildMemberDetailPayload({ member, profile, context, deps });
    return sendJson(res, 200, detail);
  }

  const page = getPage(firstQueryValue(req.query?.page));
  const pageSize = getPageSize();
  const search = cleanText(firstQueryValue(req.query?.search));
  const memberLevel = cleanText(firstQueryValue(req.query?.memberLevel || req.query?.level));
  const profileStatus = cleanText(firstQueryValue(req.query?.profileStatus || req.query?.status));
  const listResult = await scanMemberList(
    { page, pageSize, search, memberLevel, profileStatus },
    deps
  );

  return sendJson(res, 200, listResult);
}

async function updateMemberLevel(req, res, deps, context, body, authUserId) {
  const nextLevel = cleanText(body?.memberLevel || body?.member_level).toLowerCase();
  if (!memberLevels.has(nextLevel)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_MEMBER_LEVEL",
      error: "會員等級不正確。",
    });
  }

  const { profile, member } = await loadMemberRecord(authUserId, deps);
  requireMutableCustomerProfile({ member, profile });
  const beforeLevel = member.member_level;
  if (beforeLevel === nextLevel) {
    return sendJson(res, 200, {
      ok: true,
      code: "MEMBER_LEVEL_UNCHANGED",
      member,
    });
  }

  const updatedProfile = await deps.updateCustomerProfile(profile.id, {
    member_level: nextLevel,
  });
  await writeMemberAudit({
    deps,
    req,
    context,
    action: "update_customer_member_level",
    member,
    description: `修改會員等級：${member.email}`,
    beforeData: {
      previous_member_level: beforeLevel,
    },
    afterData: {
      next_member_level: nextLevel,
    },
  });

  return sendJson(res, 200, {
    ok: true,
    code: "MEMBER_LEVEL_UPDATED",
    member: {
      ...member,
      member_level: nextLevel,
      member_level_label: getMemberLevelLabel(nextLevel),
      profile_updated_at: updatedProfile?.updated_at || member.profile_updated_at,
    },
    previous_member_level: beforeLevel,
    next_member_level: nextLevel,
  });
}

async function updateAdminNote(req, res, deps, context, body, authUserId) {
  const note = cleanLimitedText(body?.adminNote ?? body?.admin_note, 2000);
  const { profile, member } = await loadMemberRecord(authUserId, deps);
  requireMutableCustomerProfile({ member, profile });

  const updatedAt = new Date().toISOString();
  const updatedProfile = await deps.updateCustomerProfile(profile.id, {
    admin_note: note || null,
    admin_note_updated_at: updatedAt,
    admin_note_updated_by: context?.profile?.id || null,
  });

  await writeMemberAudit({
    deps,
    req,
    context,
    action: "update_customer_member_admin_note",
    member,
    description: `更新會員內部備註：${member.email}`,
    beforeData: {
      previous_admin_note: member.admin_note || "",
    },
    afterData: {
      next_admin_note: note,
    },
  });

  return sendJson(res, 200, {
    ok: true,
    code: "MEMBER_ADMIN_NOTE_UPDATED",
    member: {
      ...member,
      admin_note: updatedProfile?.admin_note || "",
      admin_note_updated_at: updatedProfile?.admin_note_updated_at || updatedAt,
      admin_note_updated_by: updatedProfile?.admin_note_updated_by || context?.profile?.id || null,
      profile_updated_at: updatedProfile?.updated_at || member.profile_updated_at,
    },
  });
}

async function updateDiamondProfile(req, res, deps, context, body, authUserId) {
  const partnerName = cleanLimitedText(body?.partnerName ?? body?.partner_name, 120);
  const exclusiveCode = normalizeDiamondExclusiveCode(body?.exclusiveCode ?? body?.exclusive_code);
  const partnershipStatus = cleanText((body?.partnershipStatus ?? body?.partnership_status) || "active").toLowerCase();
  const { profile, member } = await loadMemberRecord(authUserId, deps);
  requireMutableCustomerProfile({ member, profile });

  if (member.member_level !== "diamond") {
    return sendJson(res, 409, {
      ok: false,
      code: "DIAMOND_PROFILE_DIAMOND_ONLY",
      error: "只有鑽石會員可以設定合作店家資料。",
    });
  }
  if (!diamondPartnershipStatuses.has(partnershipStatus)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_PARTNERSHIP_STATUS",
      error: "合作狀態不正確。",
    });
  }
  if (exclusiveCode.length > 80) {
    return sendJson(res, 400, {
      ok: false,
      code: "EXCLUSIVE_CODE_TOO_LONG",
      error: "專屬優惠碼長度不可超過 80 個字元。",
    });
  }

  const beforeDiamondProfile = await deps.fetchDiamondProfile(profile.id);
  try {
    const existingProfiles = await deps.fetchAllDiamondProfiles();
    assertDiamondExclusiveCodeAvailable(existingProfiles, exclusiveCode, profile.id);
    const diamondProfile = await deps.upsertDiamondProfile(profile.id, {
      partner_name: partnerName || null,
      exclusive_code: exclusiveCode || null,
      partnership_status: partnershipStatus,
    });
    const pointsLedger = await deps.fetchPointsLedger(profile.id);
    const pointsBalance = getPointsBalance(pointsLedger);

    await writeMemberAudit({
      deps,
      req,
      context,
      action: "update_customer_member_diamond_profile",
      member,
      description: `更新鑽石會員合作資料：${member.email}`,
      beforeData: {
        diamond_profile: beforeDiamondProfile,
      },
      afterData: {
        diamond_profile: diamondProfile,
      },
    });

    return sendJson(res, 200, {
      ok: true,
      code: "DIAMOND_PROFILE_UPDATED",
      diamond_profile: {
        ...diamondProfile,
        points_balance: pointsBalance,
      },
    });
  } catch (error) {
    if (isDiamondExclusiveCodeConflict(error) || error?.status === 409) {
      return sendJson(res, 409, {
        ok: false,
        code: "DIAMOND_EXCLUSIVE_CODE_DUPLICATE",
        error: diamondExclusiveCodeDuplicateMessage,
      });
    }
    throw error;
  }
}

async function adjustMemberPoints(req, res, deps, context, body, authUserId) {
  const points = Number.parseInt(String(body?.points || ""), 10);
  const description = cleanLimitedText(body?.description, 300);
  const sourceOrderId = cleanText(body?.sourceOrderId || body?.source_order_id) || null;
  const { profile, member } = await loadMemberRecord(authUserId, deps);
  requireMutableCustomerProfile({ member, profile });

  if (member.member_level !== "diamond") {
    return sendJson(res, 409, {
      ok: false,
      code: "MEMBER_POINTS_DIAMOND_ONLY",
      error: "只有鑽石會員可以調整積分。",
    });
  }
  if (!Number.isInteger(points) || points === 0) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_POINTS",
      error: "請輸入非 0 的整數積分。",
    });
  }
  if (!description) {
    return sendJson(res, 400, {
      ok: false,
      code: "POINTS_DESCRIPTION_REQUIRED",
      error: "請輸入積分來源說明。",
    });
  }
  if (sourceOrderId && !isValidUuid(sourceOrderId)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_SOURCE_ORDER_ID",
      error: "來源訂單 ID 格式不正確。",
    });
  }

  const currentPointsLedger = await deps.fetchPointsLedger(profile.id);
  const currentPointsBalance = getPointsBalance(currentPointsLedger);
  const pendingRedemptionPoints = await deps.fetchPendingRedemptionPoints(profile.id);
  if (currentPointsBalance + points < pendingRedemptionPoints) {
    const hasPendingReserve = pendingRedemptionPoints > 0;
    return sendJson(res, 409, {
      ok: false,
      code: hasPendingReserve ? "MEMBER_POINTS_RESERVED_BALANCE_NEGATIVE" : "MEMBER_POINTS_BALANCE_NEGATIVE",
      error: hasPendingReserve
        ? "已有待處理兌換保留點數，人工扣點後可兌換積分不可低於 0。"
        : "積分扣除後不可低於 0。",
      points_balance: currentPointsBalance,
      pending_redemption_points: pendingRedemptionPoints,
    });
  }

  let ledger;
  try {
    ledger = await deps.adjustPointsLedger({
      customer_profile_id: profile.id,
      points,
      description,
      source_order_id: sourceOrderId,
      created_by_admin_id: context?.profile?.id || null,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("MEMBER_POINTS_RESERVED_BALANCE_NEGATIVE")) {
      const hasPendingReserve = pendingRedemptionPoints > 0;
      return sendJson(res, 409, {
        ok: false,
        code: hasPendingReserve ? "MEMBER_POINTS_RESERVED_BALANCE_NEGATIVE" : "MEMBER_POINTS_BALANCE_NEGATIVE",
        error: hasPendingReserve
          ? "已有待處理兌換保留點數，人工扣點後可兌換積分不可低於 0。"
          : "積分扣除後不可低於 0。",
        points_balance: currentPointsBalance,
        pending_redemption_points: pendingRedemptionPoints,
      });
    }
    throw error;
  }
  const pointsLedger = await deps.fetchPointsLedger(profile.id);
  const pointsBalance = getPointsBalance(pointsLedger);

  await writeMemberAudit({
    deps,
    req,
    context,
    action: "adjust_customer_member_points",
    member,
    description: `調整鑽石會員積分：${member.email}`,
    beforeData: {},
    afterData: {
      points,
      points_balance: pointsBalance,
      points_description: description,
      source_order_id: sourceOrderId,
    },
  });

  return sendJson(res, 200, {
    ok: true,
    code: "MEMBER_POINTS_ADJUSTED",
    ledger,
    points_ledger: pointsLedger,
    points_balance: pointsBalance,
  });
}

function getRequestIp(req) {
  return (
    String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.socket?.remoteAddress || "").trim() ||
    "unknown"
  );
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function enforceResendRateLimit(req, email) {
  const now = Date.now();
  const ipKey = sha256(getRequestIp(req));
  const currentIp = resendRateLimitByIpHash.get(ipKey);
  if (!currentIp || currentIp.resetAt <= now) {
    resendRateLimitByIpHash.set(ipKey, {
      count: 1,
      resetAt: now + memberVerificationResendRateLimitWindowMs,
    });
  } else if (currentIp.count >= memberVerificationResendIpLimit) {
    throw createHttpError(429, "短時間寄送次數較多，請稍後再試。");
  } else {
    currentIp.count += 1;
  }

  const emailKey = sha256(normalizeMemberEmail(email));
  const lastSentAt = resendCooldownByEmailHash.get(emailKey) || 0;
  const remainingMs = memberVerificationResendCooldownMs - (now - lastSentAt);
  if (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    throw createHttpError(429, `請等候 ${seconds} 秒後再重新寄送驗證信。`);
  }
}

function markResendVerificationSent(email) {
  resendCooldownByEmailHash.set(sha256(normalizeMemberEmail(email)), Date.now());
}

async function resendMemberVerification(req, res, deps, context, authUserId) {
  const { member } = await loadMemberRecord(authUserId, deps);
  if (!member) {
    return sendJson(res, 404, {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      error: memberNotFoundMessage,
    });
  }
  if (member.is_admin_user) {
    return sendJson(res, 403, {
      ok: false,
      code: "ADMIN_MEMBER_OPERATION_FORBIDDEN",
      error: adminMemberDeleteForbiddenMessage,
    });
  }
  if (member.email_verified) {
    return sendJson(res, 409, {
      ok: false,
      code: "MEMBER_EMAIL_ALREADY_VERIFIED",
      error: "此會員 Email 已完成驗證。",
    });
  }

  enforceResendRateLimit(req, member.email);
  await deps.resendVerificationEmail(member.email);
  markResendVerificationSent(member.email);
  await writeMemberAudit({
    deps,
    req,
    context,
    action: "resend_customer_member_verification",
    member,
    description: `重新寄送會員驗證信：${member.email}`,
    beforeData: {},
    afterData: {
      resend_status: "success",
    },
  });

  return sendJson(res, 200, {
    ok: true,
    code: "MEMBER_VERIFICATION_RESENT",
    message: "驗證信已重新寄出。",
    cooldownSeconds: Math.ceil(memberVerificationResendCooldownMs / 1000),
  });
}

async function patchMember(req, res, deps) {
  const context = await deps.requirePermission(req, "users.update");
  const body = await deps.readBody(req);
  const authUserId = cleanText(firstQueryValue(req.query?.id) || body?.id);

  if (!isValidUuid(authUserId)) {
    return sendJson(res, 404, {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      error: memberNotFoundMessage,
    });
  }

  const action = cleanText(body?.action);
  if (action === "update-member-level") {
    return updateMemberLevel(req, res, deps, context, body, authUserId);
  }
  if (action === "update-admin-note") {
    return updateAdminNote(req, res, deps, context, body, authUserId);
  }
  if (action === "update-diamond-profile") {
    return updateDiamondProfile(req, res, deps, context, body, authUserId);
  }
  if (action === "adjust-points") {
    return adjustMemberPoints(req, res, deps, context, body, authUserId);
  }
  if (action === "resend-verification") {
    return resendMemberVerification(req, res, deps, context, authUserId);
  }

  return sendJson(res, 400, {
    ok: false,
    code: "UNKNOWN_MEMBER_ACTION",
    error: "Unknown member action.",
  });
}

async function deleteMember(req, res, deps) {
  const context = await deps.requirePermission(req, "users.update");
  const body = await deps.readBody(req);
  const authUserId = cleanText(firstQueryValue(req.query?.id) || body?.id);

  if (!isValidUuid(authUserId)) {
    return sendJson(res, 404, {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      error: memberNotFoundMessage,
    });
  }

  const { profile, member } = await loadMemberRecord(authUserId, deps);
  if (!member) {
    return sendJson(res, 404, {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      error: memberNotFoundMessage,
    });
  }

  const protection = getDeletionProtection({ member, context });
  if (protection) {
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_blocked",
      member,
      description: `阻擋刪除會員：${member.email}`,
      status: "blocked",
      error: protection.message,
    });
    return sendJson(res, 403, {
      ok: false,
      code: "ADMIN_MEMBER_DELETE_FORBIDDEN",
      error: protection.message,
    });
  }

  const confirmEmail = normalizeMemberEmail(body?.confirmEmail || body?.confirm_email);
  if (!confirmEmail || confirmEmail !== normalizeMemberEmail(member.email)) {
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_failed",
      member,
      description: `刪除會員確認 Email 不符：${member.email}`,
      status: "failed",
      error: "email_confirmation_mismatch",
    });
    return sendJson(res, 400, {
      ok: false,
      code: "EMAIL_CONFIRMATION_MISMATCH",
      error: "請輸入此會員的完整 Email 才能刪除。",
    });
  }

  const deletion = await deps.checkBusinessRecordBlockers({ member, profile });
  if (deletion.hasBusinessRecords) {
    const blockerError = deletion.blockers?.some((blocker) => blocker.type === "member_points_ledger")
      ? memberPointsLedgerDeleteBlockedMessage
      : memberDeleteBlockedMessage;
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_blocked",
      member,
      description: `阻擋刪除會員：${member.email}`,
      status: "blocked",
      error: blockerError,
    });
    return sendJson(res, 409, {
      ok: false,
      code: "MEMBER_HAS_BUSINESS_RECORDS",
      error: blockerError,
      blockers: deletion.blockers,
    });
  }

  try {
    await deps.deleteAuthUser(authUserId);
  } catch {
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_failed",
      member,
      description: `刪除會員失敗：${member.email}`,
      status: "failed",
      error: "delete_user_failed",
    });
    return sendJson(res, 502, {
      ok: false,
      code: "MEMBER_DELETE_FAILED",
      error: memberDeleteFailedMessage,
    });
  }

  const authUserAfterDelete = await deps.getAuthUserById(authUserId);
  const profileAfterDelete = await deps.fetchProfileByAuthUserId(authUserId);
  if (authUserAfterDelete || profileAfterDelete) {
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_failed",
      member,
      description: `刪除會員後驗證失敗：${member.email}`,
      status: "failed",
      error: authUserAfterDelete
        ? "auth_user_still_exists"
        : "customer_profile_still_exists",
    });
    return sendJson(res, 502, {
      ok: false,
      code: "MEMBER_DELETE_VERIFY_FAILED",
      error: memberDeleteFailedMessage,
    });
  }

  await writeMemberDeletionAudit({
    deps,
    req,
    context,
    action: "delete_customer_member",
    member,
    description: `刪除會員：${member.email}`,
    status: "success",
  });

  return sendJson(res, 200, {
    ok: true,
    code: "MEMBER_DELETED",
    message: "會員帳號已刪除。",
    profile_deletion_mode: profile ? "auth_user_on_delete_cascade" : "no_profile",
  });
}

export function createAdminMembersHandler(dependencyOverrides = {}) {
  const deps = {
    requirePermission,
    readBody,
    listAuthUsers,
    getAuthUserById,
    deleteAuthUser,
    resendVerificationEmail,
    fetchProfilesByAuthUserIds,
    fetchProfileByAuthUserId,
    updateCustomerProfile,
    fetchAdminProfilesByAuthUserIds,
    fetchAdminProfileByAuthUserId,
    checkBusinessRecordBlockers,
    fetchShopOrdersForMember,
    fetchBookingRequestsForMember,
    fetchDiamondProfile,
    fetchAllDiamondProfiles,
    upsertDiamondProfile,
    fetchPointsLedger,
    fetchPendingRedemptionPoints,
    insertPointsLedger,
    adjustPointsLedger,
    writeAdminActivityLog,
    ...dependencyOverrides,
  };

  return withHandlerSafety(async function handleAdminMembers(req, res) {
    if (req.method === "GET") return await loadMemberList(req, res, deps);
    if (req.method === "PATCH") return await patchMember(req, res, deps);
    if (req.method === "DELETE") return await deleteMember(req, res, deps);
    return sendJson(res, 405, { error: "Method not allowed." });
  }, { name: "admin-shop-members" });
}

export const __testing = {
  buildConsumptionSummary,
  checkBusinessRecordBlockers,
  assertDiamondExclusiveCodeAvailable,
  getPointsBalance,
  getDiamondExclusiveCodeKey,
  hasDuplicateDiamondExclusiveCode,
  hasNormalizedEmailInRows,
  isDiamondExclusiveCodeConflict,
  isCompletedStay,
  isEstablishedShopOrder,
  isFullyRefundedShopOrder,
  isTestShopOrder,
  matchesMemberSearch,
  matchesMemberLevel,
  matchesMemberStatus,
  normalizeDiamondExclusiveCode,
  normalizeDiamondProfile,
  normalizePhoneSearch,
  normalizeShopOrder,
  rowsWithNormalizedEmail,
};

export default createAdminMembersHandler();
