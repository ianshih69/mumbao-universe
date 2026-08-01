import { createClient } from "@supabase/supabase-js";
import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
} from "../shopShared.js";
import { requirePermission, writeAdminActivityLog } from "./core.js";
import { withHandlerSafety } from "./withHandlerSafety.js";

const defaultPage = 1;
const defaultPageSize = 20;
const maxPageSize = 50;
const authSearchScanPageSize = 100;
const maxSearchScanPages = 20;
const maxEmailBlockerCandidates = 100;
const customerProfileSelect =
  "id,auth_user_id,email,name,phone,is_active,created_at,updated_at";
const adminProfileSelect =
  "id,auth_user_id,email,display_name,role_code,is_active";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memberDeleteBlockedMessage =
  "此會員已有訂單或交易紀錄，為保留帳務資料，目前不能直接刪除。";
const memberDeleteFailedMessage = "會員帳號刪除失敗，請稍後再試。";
const memberNotFoundMessage = "找不到此會員，資料可能已被刪除或更新。";
const adminMemberDeleteForbiddenMessage =
  "後台管理員帳號不可從會員管理刪除。";

let supabaseAdminClientCache = null;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
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

function getPageSize(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPageSize;
  return Math.min(parsed, maxPageSize);
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

function getMemberProfileStatus({ profile, emailVerified, adminProfile }) {
  if (adminProfile) return "admin_user";
  if (!profile) return "missing_profile";
  if (!emailVerified) return "email_not_verified";
  if (profile.is_active === false) return "inactive";
  return "normal";
}

function getMemberProfileStatusLabel(status) {
  if (status === "admin_user") return "後台管理員";
  if (status === "missing_profile") return "缺少會員 profile";
  if (status === "email_not_verified") return "Email 尚未驗證";
  if (status === "inactive") return "會員已停用";
  return "正常";
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
    is_admin_user: Boolean(adminProfile),
    admin_profile_id: adminProfile?.id || null,
    member_type: adminProfile ? "admin" : "customer",
    has_profile: Boolean(profile),
    profile_is_active: profile ? profile.is_active !== false : null,
    profile_created_at: profile?.created_at || null,
    profile_updated_at: profile?.updated_at || null,
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

async function listAuthUsers({ page, perPage }) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage,
  });

  if (error) {
    throw createHttpError(502, "會員列表讀取失敗，請稍後再試。");
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
    throw createHttpError(502, "會員資料讀取失敗，請稍後再試。");
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
        label: "住宿訂單或需求",
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

function getDeletionProtection({ member, context }) {
  if (!member) return null;
  if (cleanText(context?.actorAuthUserId) === cleanText(member.auth_user_id)) {
    return {
      type: "current_admin",
      label: "目前登入的後台管理員",
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
    ...extra,
  };
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
  await deps.writeAdminActivityLog({
    req,
    context,
    action,
    module: "members",
    targetType: "customer_member",
    targetId: member?.auth_user_id || null,
    description,
    beforeData: buildMemberAuditPayload(member),
    afterData: buildMemberAuditPayload(member, {
      delete_status: status,
      error: error || null,
    }),
  });
}

async function loadMemberRecord(authUserId, deps) {
  if (!uuidPattern.test(authUserId)) {
    return { authUser: null, profile: null, member: null };
  }

  const authUser = await deps.getAuthUserById(authUserId);
  if (!authUser?.id) return { authUser: null, profile: null, member: null };
  const profile = await deps.fetchProfileByAuthUserId(authUser.id);
  const adminProfile = await deps.fetchAdminProfileByAuthUserId(authUser.id);
  const member = normalizeAdminMember(authUser, profile, adminProfile);
  return { authUser, profile, adminProfile, member };
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
    return sendJson(res, 200, {
      member,
      deletion: {
        ...deletion,
        can_delete: !protection && !deletion.hasBusinessRecords,
        profile_deletion_mode: profile ? "auth_user_on_delete_cascade" : "no_profile",
      },
    });
  }

  const page = getPage(firstQueryValue(req.query?.page));
  const pageSize = getPageSize(firstQueryValue(req.query?.pageSize));
  const search = cleanText(firstQueryValue(req.query?.search));
  const listResult = search
    ? await searchMemberList({ page, pageSize, search }, deps)
    : await loadAuthMemberPage({ page, pageSize }, deps);

  return sendJson(res, 200, listResult);
}

async function loadAuthMemberPage({ page, pageSize }, deps) {
  const authPage = await deps.listAuthUsers({ page, perPage: pageSize });
  const members = getManageableMembers(await mergeAuthUsersWithProfiles(authPage.users, deps));
  const reportedTotal = Number(authPage.total || 0);
  const inferredTotal = (page - 1) * pageSize + members.length;
  const total = inferredTotal;
  const hasMore = Boolean(
    authPage.nextPage ||
      (reportedTotal ? page * pageSize < reportedTotal : authPage.users.length === pageSize)
  );

  return {
    members,
    page,
    pageSize,
    total,
    totalPages: hasMore ? page + 1 : Math.max(1, Math.ceil(total / pageSize)),
    hasMore,
    search: "",
    searchLimited: false,
    source: "supabase_auth_admin",
  };
}

async function searchMemberList({ page, pageSize, search }, deps) {
  const matchedMembers = [];
  let authTotal = 0;
  let scannedPages = 0;
  let reachedEnd = false;

  for (let authPage = 1; authPage <= maxSearchScanPages; authPage += 1) {
    const pageResult = await deps.listAuthUsers({
      page: authPage,
      perPage: authSearchScanPageSize,
    });
    scannedPages = authPage;
    authTotal = Number(pageResult.total || authTotal || 0);

    const members = await mergeAuthUsersWithProfiles(pageResult.users, deps);
    matchedMembers.push(
      ...getManageableMembers(members).filter((member) =>
        matchesMemberSearch(member, search)
      )
    );

    const userCount = Array.isArray(pageResult.users) ? pageResult.users.length : 0;
    if (
      userCount < authSearchScanPageSize ||
      (authTotal && authPage * authSearchScanPageSize >= authTotal) ||
      (!authTotal && !pageResult.nextPage)
    ) {
      reachedEnd = true;
      break;
    }
  }

  const from = (page - 1) * pageSize;
  const visibleMembers = matchedMembers.slice(from, from + pageSize);
  const searchLimited = !reachedEnd && scannedPages >= maxSearchScanPages;

  return {
    members: visibleMembers,
    page,
    pageSize,
    total: matchedMembers.length,
    totalPages: Math.max(1, Math.ceil(matchedMembers.length / pageSize)),
    hasMore: from + pageSize < matchedMembers.length || searchLimited,
    search,
    searchLimited,
    source: "supabase_auth_admin_search",
  };
}

async function deleteMember(req, res, deps) {
  const context = await deps.requirePermission(req, "users.update");
  const body = await deps.readBody(req);
  const authUserId = cleanText(firstQueryValue(req.query?.id) || body?.id);

  if (!uuidPattern.test(authUserId)) {
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
      description: `阻擋刪除會員帳號：${member.email}`,
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
      description: `刪除會員帳號確認失敗：${member.email}`,
      status: "failed",
      error: "email_confirmation_mismatch",
    });
    return sendJson(res, 400, {
      ok: false,
      code: "EMAIL_CONFIRMATION_MISMATCH",
      error: "請輸入該會員的完整 Email 才能刪除。",
    });
  }

  const deletion = await deps.checkBusinessRecordBlockers({ member, profile });
  if (deletion.hasBusinessRecords) {
    await writeMemberDeletionAudit({
      deps,
      req,
      context,
      action: "delete_customer_member_blocked",
      member,
      description: `阻擋刪除會員帳號：${member.email}`,
      status: "blocked",
      error: memberDeleteBlockedMessage,
    });
    return sendJson(res, 409, {
      ok: false,
      code: "MEMBER_HAS_BUSINESS_RECORDS",
      error: memberDeleteBlockedMessage,
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
      description: `刪除會員帳號失敗：${member.email}`,
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
      description: `刪除會員帳號後驗證失敗：${member.email}`,
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
    description: `刪除會員帳號：${member.email}`,
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
    fetchProfilesByAuthUserIds,
    fetchProfileByAuthUserId,
    fetchAdminProfilesByAuthUserIds,
    fetchAdminProfileByAuthUserId,
    checkBusinessRecordBlockers,
    writeAdminActivityLog,
    ...dependencyOverrides,
  };

  return withHandlerSafety(async function handleAdminMembers(req, res) {
    if (req.method === "GET") return await loadMemberList(req, res, deps);
    if (req.method === "DELETE") return await deleteMember(req, res, deps);
    return sendJson(res, 405, { error: "Method not allowed." });
  }, { name: "admin-shop-members" });
}

export const __testing = {
  checkBusinessRecordBlockers,
  hasNormalizedEmailInRows,
  matchesMemberSearch,
  normalizePhoneSearch,
};

export default createAdminMembersHandler();
