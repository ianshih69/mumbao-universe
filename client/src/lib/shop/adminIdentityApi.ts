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

export async function fetchAdminSession(token: string) {
  const data = await requestAdminIdentity<{
    authMode: "account";
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
