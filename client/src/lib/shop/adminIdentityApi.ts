import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminIdentity,
  getAdminRefreshToken,
  getAdminToken,
  getAdminTokenExpiresAt,
  setAdminSession,
  type AdminIdentity,
} from "./adminAuth";

async function parseJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, any>;
}

async function requestAdminIdentity<T>(
  url: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await parseJson(response)) as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401) throw new Error(adminAuthExpiredMessage);
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

export type AdminUser = AdminIdentity & {
  id: string;
  auth_user_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
};

export type AdminAuditLog = {
  id: string;
  actor_auth_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  module: string;
  target_type?: string | null;
  target_id?: string | null;
  description?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};

export type AdminMemberProfileStatus =
  | "normal"
  | "email_not_verified"
  | "missing_profile"
  | "inactive"
  | "admin_user";

export type AdminMemberLevel = "normal" | "vip" | "diamond";

export type AdminMember = {
  id: string;
  auth_user_id: string;
  profile_id?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  email_verified: boolean;
  email_verified_label: string;
  registered_at?: string | null;
  last_login_at?: string | null;
  profile_status: AdminMemberProfileStatus;
  profile_status_label: string;
  member_level: AdminMemberLevel;
  member_level_label: string;
  is_admin_user?: boolean;
  admin_profile_id?: string | null;
  member_type?: "customer" | "admin";
  has_profile: boolean;
  profile_is_active?: boolean | null;
  profile_created_at?: string | null;
  profile_updated_at?: string | null;
  admin_note?: string | null;
  admin_note_updated_at?: string | null;
  admin_note_updated_by?: string | null;
  coupon?: {
    code: string;
    bound_at?: string | null;
  } | null;
};

export type AdminMemberBusinessBlocker = {
  type: string;
  label: string;
  matched_by: string;
};

export type AdminMemberDeletionInfo = {
  hasBusinessRecords: boolean;
  blockers: AdminMemberBusinessBlocker[];
  can_delete: boolean;
  profile_deletion_mode: "auth_user_on_delete_cascade" | "no_profile";
};

export type AdminMembersResponse = {
  members: AdminMember[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  search?: string;
  memberLevel?: string;
  profileStatus?: string;
  searchLimited?: boolean;
  source?: string;
};

export type AdminMemberConsumptionSummary = {
  cumulative_spend: number;
  completed_stay_count: number;
  shop_order_count: number;
  recent_consumption_at?: string | null;
  recent_shop_consumption_at?: string | null;
  limitations?: string[];
};

export type AdminMemberBookingRecord = {
  id: string;
  booking_number: string;
  created_at?: string | null;
  updated_at?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  stay_type: "villa" | "room";
  stay_type_label: string;
  guest_count: number;
  adults: number;
  children: number;
  room_count?: number | null;
  status: string;
  customer_profile_id?: string | null;
  final_lodging_amount?: number | null;
  completed_at?: string | null;
  completed_by_admin_id?: string | null;
  partner_points_awarded_at?: string | null;
  partner_points_awarded_to_profile_id?: string | null;
  partner_points_ledger_id?: string | null;
  lodging_amount?: number | null;
  paid_amount?: number | null;
  source?: string | null;
  source_label: string;
};

export type AdminMemberShopOrderItem = {
  id: string;
  product_name: string;
  product_slug?: string | null;
  product_image_url?: string | null;
  variant_name?: string | null;
  variant_option?: string | null;
  variant_price: number;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type AdminMemberShopOrder = {
  id: string;
  order_number: string;
  created_at?: string | null;
  updated_at?: string | null;
  customer_profile_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  order_source: string;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  items_summary: string;
  item_count: number;
  total_quantity: number;
  items: AdminMemberShopOrderItem[];
};

export type AdminMemberDiamondProfile = {
  id?: string | null;
  customer_profile_id?: string | null;
  partner_name?: string | null;
  exclusive_code?: string | null;
  partnership_status?: string | null;
  points_balance: number;
} | null;

export type AdminMemberPointsLedgerRow = {
  id: string;
  customer_profile_id: string;
  points: number;
  description: string;
  source_order_id?: string | null;
  source_type?: string | null;
  created_by_admin_id?: string | null;
  created_at?: string | null;
};

export type AdminMemberDetailResponse = {
  member: AdminMember;
  deletion: AdminMemberDeletionInfo;
  consumption_summary: AdminMemberConsumptionSummary;
  booking_records: AdminMemberBookingRecord[];
  shop_orders: AdminMemberShopOrder[];
  diamond_profile: AdminMemberDiamondProfile;
  points_ledger: AdminMemberPointsLedgerRow[];
};

export type AdminAuditLogsResponse = {
  logs?: AdminAuditLog[];
  items?: AdminAuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function loginAdminAccount(email: string, password: string) {
  const response = await fetch("/api/admin-shop?action=admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password: password.trim() }),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new Error(data.error || "登入失敗，請確認 Email 與密碼。");
  setAdminSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    user: data.user,
    authMode: "account",
  });
  return data as {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string | null;
    user: AdminIdentity;
  };
}

export async function refreshAdminSession() {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) throw new Error(adminAuthExpiredMessage);

  const response = await fetch("/api/admin-shop?action=admin-refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    clearAdminToken();
    throw new Error(adminAuthExpiredMessage);
  }

  setAdminSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    user: data.user,
    authMode: "account",
  });
  return data as { accessToken: string; refreshToken?: string; user: AdminIdentity };
}

export async function ensureFreshAdminSession(currentToken: string) {
  const storedToken = getAdminToken() || currentToken;
  if (!storedToken) return storedToken;

  const expiresAt = getAdminTokenExpiresAt();
  if (!expiresAt) return storedToken;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return storedToken;

  const refreshWindowMs = 5 * 60 * 1000;
  if (expiresAtMs - Date.now() > refreshWindowMs) return storedToken;

  const refreshed = await refreshAdminSession();
  return refreshed.accessToken;
}

export async function fetchAdminSession(token: string, expiresAt?: string | null, refreshToken?: string) {
  const data = await requestAdminIdentity<{
    authMode: "account";
    user: AdminIdentity;
    permissions: string[];
  }>("/api/admin-shop?action=admin-session", token);
  setAdminSession({
    accessToken: token,
    refreshToken,
    expiresAt,
    user: {
      ...data.user,
      permissions: data.permissions || data.user?.permissions || [],
    },
    authMode: data.authMode,
  });
  return data;
}

export async function bootstrapSuperAdmin(payload: {
  adminPassword: string;
  displayName: string;
  email: string;
}) {
  const nextPayload = {
    ...payload,
    adminPassword: payload.adminPassword.trim(),
    displayName: payload.displayName.trim(),
    email: payload.email.trim(),
  };
  const response = await fetch("/api/admin-shop?action=admin-bootstrap-super", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextPayload),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new Error(data.error || "Bootstrap super admin failed.");
  return data;
}

export async function fetchAdminBootstrapStatus() {
  const response = await fetch("/api/admin-shop?action=admin-bootstrap-status");
  const data = await parseJson(response);
  if (!response.ok) return { available: false };
  return { available: Boolean(data.available) };
}

export function fetchAdminUsers(token: string) {
  return requestAdminIdentity<{ users: AdminUser[] }>(
    "/api/admin-shop?action=admin-users",
    token
  );
}

export function fetchAdminMembers(
  token: string,
  filters: {
    page?: number;
    pageSize?: number;
    search?: string;
    memberLevel?: string;
    profileStatus?: string;
  } = {}
) {
  const params = new URLSearchParams({ action: "admin-members" });
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  if (filters.memberLevel && filters.memberLevel !== "all") {
    params.set("memberLevel", filters.memberLevel);
  }
  if (filters.profileStatus && filters.profileStatus !== "all") {
    params.set("profileStatus", filters.profileStatus);
  }
  return requestAdminIdentity<AdminMembersResponse>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export function fetchAdminMemberDetail(token: string, authUserId: string) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<AdminMemberDetailResponse>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export function updateAdminMemberLevel(
  token: string,
  authUserId: string,
  memberLevel: AdminMemberLevel
) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: string;
    member: AdminMember;
    previous_member_level?: AdminMemberLevel;
    next_member_level?: AdminMemberLevel;
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action: "update-member-level",
      memberLevel,
    }),
  });
}

export function updateAdminMemberNote(
  token: string,
  authUserId: string,
  adminNote: string
) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: string;
    member: AdminMember;
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action: "update-admin-note",
      adminNote,
    }),
  });
}

export function updateAdminMemberDiamondProfile(
  token: string,
  authUserId: string,
  payload: {
    partnerName: string;
    exclusiveCode: string;
    partnershipStatus: string;
  }
) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: string;
    diamond_profile: NonNullable<AdminMemberDiamondProfile>;
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action: "update-diamond-profile",
      ...payload,
    }),
  });
}

export function adjustAdminMemberPoints(
  token: string,
  authUserId: string,
  payload: { points: number; description: string; sourceOrderId?: string }
) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: string;
    ledger: AdminMemberPointsLedgerRow;
    points_ledger: AdminMemberPointsLedgerRow[];
    points_balance: number;
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action: "adjust-points",
      ...payload,
    }),
  });
}

export function resendAdminMemberVerification(token: string, authUserId: string) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: string;
    message: string;
    cooldownSeconds?: number;
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action: "resend-verification",
    }),
  });
}

export function deleteAdminMember(
  token: string,
  authUserId: string,
  confirmEmail: string
) {
  const params = new URLSearchParams({
    action: "admin-members",
    id: authUserId,
  });
  return requestAdminIdentity<{
    ok: true;
    code: "MEMBER_DELETED";
    message: string;
    profile_deletion_mode: "auth_user_on_delete_cascade" | "no_profile";
  }>(`/api/admin-shop?${params.toString()}`, token, {
    method: "DELETE",
    body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
  });
}

export function createAdminUser(
  token: string,
  payload: {
    display_name: string;
    email: string;
    password: string;
    role_code: string;
    is_active: boolean;
  }
) {
  const nextPayload = {
    ...payload,
    display_name: payload.display_name.trim(),
    email: payload.email.trim(),
    password: payload.password.trim(),
  };
  return requestAdminIdentity<{ user: AdminUser }>(
    "/api/admin-shop?action=admin-users",
    token,
    { method: "POST", body: JSON.stringify(nextPayload) }
  );
}

export function updateAdminUser(
  token: string,
  id: string,
  payload: Partial<{
    display_name: string;
    password: string;
    role_code: string;
    is_active: boolean;
  }>
) {
  const nextPayload = { ...payload };
  if (typeof nextPayload.display_name === "string") {
    nextPayload.display_name = nextPayload.display_name.trim();
  }
  if (typeof nextPayload.password === "string") {
    nextPayload.password = nextPayload.password.trim();
  }
  return requestAdminIdentity<{ user: AdminUser }>(
    `/api/admin-shop?action=admin-users&id=${encodeURIComponent(id)}`,
    token,
    { method: "PATCH", body: JSON.stringify(nextPayload) }
  );
}

export function fetchAdminAuditLogs(
  token: string,
  filters: { actor?: string; module?: string; actionName?: string; date?: string; page?: number; pageSize?: number } = {}
) {
  const params = new URLSearchParams({ action: "admin-audit-logs" });
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.module) params.set("module", filters.module);
  if (filters.actionName) params.set("actionName", filters.actionName);
  if (filters.date) params.set("date", filters.date);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  return requestAdminIdentity<AdminAuditLogsResponse>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}

export function deleteAdminAuditLog(token: string, id: string) {
  return requestAdminIdentity<{ ok: true; id: string }>(
    `/api/admin-shop?action=admin-audit-logs&id=${encodeURIComponent(id)}`,
    token,
    { method: "DELETE" }
  );
}

export function deleteAdminAuditLogs(token: string, ids: string[]) {
  return requestAdminIdentity<{ ok: true; deletedIds: string[]; deletedCount: number }>(
    "/api/admin-shop?action=admin-audit-logs",
    token,
    { method: "DELETE", body: JSON.stringify({ ids }) }
  );
}
