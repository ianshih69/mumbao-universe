import { getServerEnv, supabaseRequest } from "../shopShared.js";

const chatSupportRoles = new Set(["super_admin", "admin", "manager"]);

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "");
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}

function getSupabaseBaseUrl() {
  const url = String(getServerEnv("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!url) throw createHttpError(500, "SUPABASE_URL is not configured.");
  return url;
}

function getSupabaseServiceRoleKey() {
  const key = String(getServerEnv("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!key) {
    throw createHttpError(500, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return key;
}

async function verifySupabaseAccessToken(accessToken) {
  if (!accessToken) {
    throw createHttpError(401, "請先登入後台。", "unauthorized");
  }

  const response = await fetch(`${getSupabaseBaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: getSupabaseServiceRoleKey(),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    throw createHttpError(401, "請先登入後台。", "unauthorized");
  }

  return data;
}

export async function requireChatSupportAdmin(req) {
  const authUser = await verifySupabaseAccessToken(getBearerToken(req));
  const profiles = await supabaseRequest(
    `/admin_profiles?auth_user_id=eq.${encodeURIComponent(
      authUser.id
    )}&select=id,auth_user_id,email,display_name,role_code,is_active&limit=1`
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;

  if (!profile || profile.is_active === false) {
    throw createHttpError(403, "你沒有問慢寶客服後台權限。", "forbidden");
  }

  if (!chatSupportRoles.has(String(profile.role_code || ""))) {
    throw createHttpError(403, "你沒有問慢寶客服後台權限。", "forbidden");
  }

  return {
    authUserId: profile.auth_user_id,
    adminProfileId: profile.id,
    displayName: profile.display_name || profile.email || authUser.email || "Admin",
    email: profile.email || authUser.email || "",
    roleCode: profile.role_code,
  };
}

export function getAdminChatAuthErrorMessage(error) {
  if (error?.status === 401) return "請先登入後台。";
  if (error?.status === 403) return "你沒有問慢寶客服後台權限。";
  return "問慢寶客服後台暫時無法處理，請稍後再試。";
}
