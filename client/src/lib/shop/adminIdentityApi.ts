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

export async function loginAdminAccount(email: string, password: string) {
  const response = await fetch("/api/admin-shop?action=admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new Error(data.error || "\u767b\u5165\u5931\u6557\uff0c\u8acb\u78ba\u8a8d Email \u8207\u5bc6\u78bc\u3002");
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

export async function loginLegacyAdminPassword(legacyAdminPassword: string) {
  const response = await fetch("/api/admin-shop?action=admin-legacy-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legacyAdminPassword }),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(data.error || "\u820a\u7248\u5171\u7528\u5bc6\u78bc\u767b\u5165\u5931\u6557\uff0c\u8acb\u78ba\u8a8d\u5bc6\u78bc\u8207\u4f3a\u670d\u5668\u8a2d\u5b9a\u3002");
  }
  setAdminSession({
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    user: data.user,
    authMode: "legacy",
  });
  return data as { accessToken: string; expiresAt?: string; user: AdminIdentity };
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
  const identity = getAdminIdentity();
  const storedToken = getAdminToken() || currentToken;
  if (!storedToken || identity?.authMode === "legacy") return storedToken;

  const expiresAt = getAdminTokenExpiresAt();
  if (!expiresAt) return storedToken;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return storedToken;

  const refreshWindowMs = 5 * 60 * 1000;
  if (expiresAtMs - Date.now() > refreshWindowMs) return storedToken;

  const refreshed = await refreshAdminSession();
  return refreshed.accessToken;
}

export async function fetchAdminSession(token: string) {
  const data = await requestAdminIdentity<{
    authMode: "account" | "legacy";
    user: AdminIdentity;
    permissions: string[];
  }>("/api/admin-shop?action=admin-session", token);
  setAdminSession({
    accessToken: token,
    user: {
      ...data.user,
      permissions: data.permissions || data.user?.permissions || [],
    },
    authMode: data.authMode,
  });
  return data;
}

export async function bootstrapSuperAdmin(payload: {
  legacyAdminPassword: string;
  displayName: string;
  email: string;
  password: string;
}) {
  const response = await fetch("/api/admin-shop?action=admin-bootstrap-super", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new Error(data.error || "Bootstrap super admin failed.");
  return data;
}

export function fetchAdminUsers(token: string) {
  return requestAdminIdentity<{ users: AdminUser[] }>(
    "/api/admin-shop?action=admin-users",
    token
  );
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
  return requestAdminIdentity<{ user: AdminUser }>(
    "/api/admin-shop?action=admin-users",
    token,
    { method: "POST", body: JSON.stringify(payload) }
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
  return requestAdminIdentity<{ user: AdminUser }>(
    `/api/admin-shop?action=admin-users&id=${encodeURIComponent(id)}`,
    token,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export function fetchAdminAuditLogs(
  token: string,
  filters: { actor?: string; module?: string; actionName?: string; date?: string } = {}
) {
  const params = new URLSearchParams({ action: "admin-audit-logs" });
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.module) params.set("module", filters.module);
  if (filters.actionName) params.set("actionName", filters.actionName);
  if (filters.date) params.set("date", filters.date);
  return requestAdminIdentity<{ logs: AdminAuditLog[] }>(
    `/api/admin-shop?${params.toString()}`,
    token
  );
}
