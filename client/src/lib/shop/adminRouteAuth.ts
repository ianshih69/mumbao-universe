import {
  getAdminRefreshToken,
  getAdminToken,
  getAdminTokenExpiresAt,
  isAdminAuthError,
  isAdminPermissionError,
  type AdminIdentity,
} from "./adminAuth";
import { ensureFreshAdminSession, fetchAdminSession } from "./adminIdentityApi";
import {
  canViewAdminNavItem,
  findAdminNavItemByPath,
} from "@/components/admin/adminNavigation";

export type AdminRouteAuthResult =
  | { status: "authenticated"; token: string; identity: AdminIdentity }
  | { status: "unauthenticated"; reason: "missing" | "expired" | "invalid-admin" }
  | { status: "error"; error: unknown };

type AdminSessionResponse = Awaited<ReturnType<typeof fetchAdminSession>>;

type ValidateAdminRouteAuthOptions = {
  token?: string;
  refreshToken?: string;
  expiresAt?: string | null;
  ensureSession?: (token: string) => Promise<string>;
  fetchSession?: (
    token: string,
    expiresAt?: string | null,
    refreshToken?: string,
  ) => Promise<AdminSessionResponse>;
};

export function adminRouteCanRender(pathname: string, identity: AdminIdentity | null) {
  if (!identity || identity.is_active === false) return false;
  if (pathname === "/admin/legacy-content") return true;
  const item = findAdminNavItemByPath(pathname);
  if (!item) return true;
  return canViewAdminNavItem(item, identity);
}

export async function validateAdminRouteAuth(
  options: ValidateAdminRouteAuthOptions = {},
): Promise<AdminRouteAuthResult> {
  const token = options.token ?? getAdminToken();
  if (!token) return { status: "unauthenticated", reason: "missing" };

  const ensureSession = options.ensureSession || ensureFreshAdminSession;
  const fetchSession = options.fetchSession || fetchAdminSession;

  try {
    const activeToken = await ensureSession(token);
    if (!activeToken) return { status: "unauthenticated", reason: "expired" };

    const activeExpiresAt = options.expiresAt ?? getAdminTokenExpiresAt();
    const activeRefreshToken = options.refreshToken ?? getAdminRefreshToken();
    const session = await fetchSession(activeToken, activeExpiresAt, activeRefreshToken);
    const identity: AdminIdentity = {
      ...session.user,
      permissions: session.permissions || session.user.permissions || [],
    };
    if (identity.is_active === false) {
      return { status: "unauthenticated", reason: "invalid-admin" };
    }
    return { status: "authenticated", token: activeToken, identity };
  } catch (error) {
    if (isAdminAuthError(error)) {
      return { status: "unauthenticated", reason: "expired" };
    }
    if (isAdminPermissionError(error)) {
      return { status: "unauthenticated", reason: "invalid-admin" };
    }
    return { status: "error", error };
  }
}
