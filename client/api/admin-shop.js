import {
  firstQueryValue,
  getServerEnv,
  readBody,
  sendJson,
  supabaseRequest,
  supabaseRpc,
} from "../server/shopShared.js";
import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const defaultLimit = 30;
const maxLimit = 50;
const exportLimit = 1000;
const validOrderStatuses = new Set([
  "pending_confirm",
  "pending_payment",
  "paid",
  "shipping",
  "completed",
  "cancelled",
]);
const validOrderSources = new Set(["online", "pos"]);
const validPaymentStatuses = new Set([
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);
const validProductStatuses = new Set(["draft", "published", "archived"]);
const validVariantStatuses = new Set(["active", "inactive"]);
const validInventoryMovementTypes = new Set([
  "stock_in",
  "stock_out",
  "adjustment",
  "manual_sale",
  "online_order",
  "return_in",
]);
const knownInventoryErrors = new Map([
  ["VARIANT_ID_REQUIRED", "Variant id is required."],
  ["INVALID_MOVEMENT_TYPE", "Invalid inventory movement type."],
  ["INVALID_QUANTITY", "Inventory quantity is invalid."],
  ["VARIANT_NOT_FOUND", "Product variant not found."],
  ["INSUFFICIENT_INVENTORY", "Inventory cannot be less than 0."],
]);
const validPosPaymentMethods = new Set(["cash", "transfer", "other"]);
const knownManualSaleErrors = new Map([
  ["SALE_ITEMS_REQUIRED", "Sale items are required."],
  ["INVALID_PAYMENT_METHOD", "Invalid payment method."],
  ["INVALID_SALE_ITEM", "Sale item quantity is invalid."],
  ["VARIANT_NOT_FOUND", "Product variant not found or is not active."],
  ["PRODUCT_NOT_FOUND", "Product not found."],
  ["INSUFFICIENT_INVENTORY", "Inventory is not enough for this sale."],
]);
const instagramRequiredScopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];
const instagramOAuthScope =
  "instagram_business_basic,instagram_business_content_publish";
const instagramLoginRequiredScopes = instagramOAuthScope.split(",");
const instagramOAuthStateCookie = "mumbao_instagram_oauth_state";
const instagramExpectedUsername = "mumbao.tw";
const instagramOAuthRedirectUri =
  "https://mumbao.tw/api/instagram-oauth-callback";
const warehouseLocationCodes = [
  "F1-L1",
  "F1-L2",
  "F1-L3",
  "F1-L4",
  "F1-L5",
  "F1-L6",
  "F1-L7",
  "F2-L1",
  "F2-L2",
  "F2-L3",
  "F2-L4",
  "F2-L5",
  "F2-L6",
  "F2-L7",
];
const warehouseLocationCodeSet = new Set(warehouseLocationCodes);
const warehouseTargetTypes = new Set(["supply", "furniture", "housekeeping"]);
const allowedWarehouseFileTypes = new Map([
  ["image/jpeg", { extension: "jpg", maxSize: 10 * 1024 * 1024 }],
  ["image/png", { extension: "png", maxSize: 10 * 1024 * 1024 }],
  ["image/webp", { extension: "webp", maxSize: 10 * 1024 * 1024 }],
]);
const warehousePresignedUrlExpiresInSeconds = 10 * 60;

function requireAdmin(req) {
  const adminPassword = String(getServerEnv("ADMIN_PASSWORD") || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedPassword =
    bearerToken || String(req.headers?.["x-admin-password"] || "").trim();

  if (!adminPassword) {
    const error = new Error("ADMIN_PASSWORD is not configured.");
    error.status = 500;
    throw error;
  }

  if (providedPassword !== adminPassword) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwardedProto === "https";
}

function setInstagramOAuthStateCookie(req, res, state) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  const host = String(req.headers?.host || "").split(":")[0].toLowerCase();
  const domain = host.endsWith("mumbao.tw") ? "; Domain=mumbao.tw" : "";
  res.setHeader(
    "Set-Cookie",
    `${instagramOAuthStateCookie}=${encodeURIComponent(
      state
    )}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=600${secure}${domain}`
  );
}

function createMetaStatus(
  status,
  accountName = null,
  error = null,
  errorCode = null,
  metaError = null
) {
  return {
    status,
    accountName,
    error,
    errorCode,
    metaError,
  };
}

function getMetaGraphVersion() {
  const configuredVersion = String(
    getServerEnv("META_GRAPH_API_VERSION") || ""
  ).trim();

  return /^v\d+\.\d+$/.test(configuredVersion)
    ? configuredVersion
    : "v25.0";
}

function sanitizeMetaErrorMessage(value) {
  const message = cleanText(value);
  if (!message) return "";

  return message
    .replace(/access_token\s*[=:]\s*[^&\s,}"']+/gi, "access_token=[hidden]")
    .replace(/https?:\/\/\S+/gi, "[URL hidden]")
    .slice(0, 300);
}

function getSafeMetaError(status, metaError) {
  const code = Number(metaError?.code || 0);
  const safeMessage = sanitizeMetaErrorMessage(metaError?.message);
  const details = {
    code: code || null,
    type: cleanText(metaError?.type) || null,
    error_subcode: Number(metaError?.error_subcode || 0) || null,
    message: safeMessage || null,
  };

  if (code === 190 || status === 401) {
    return {
      code: code ? `META_${code}` : "META_HTTP_401",
      reason:
        safeMessage ||
        "存取權杖無效或已過期，請更新 Page Access Token。",
      details,
    };
  }

  if (code === 10 || code === 200 || status === 403) {
    return {
      code: code ? `META_${code}` : "META_HTTP_403",
      reason:
        safeMessage ||
        "Meta 權限不足，請確認 Page 權限與 App 權限設定。",
      details,
    };
  }

  if (code === 100) {
    return {
      code: "META_100",
      reason:
        safeMessage ||
        "Meta 無法解析 Page ID 或查詢參數，請確認 FACEBOOK_PAGE_ID。",
      details,
    };
  }

  if (status === 404) {
    return {
      code: code ? `META_${code}` : "META_HTTP_404",
      reason:
        safeMessage ||
        "找不到指定的 Meta 帳號，請確認帳號 ID 是否正確。",
      details,
    };
  }

  if (status === 429) {
    return {
      code: code ? `META_${code}` : "META_HTTP_429",
      reason: safeMessage || "Meta API 請求過於頻繁，請稍後再試。",
      details,
    };
  }

  return {
    code: code ? `META_${code}` : `META_HTTP_${status || 500}`,
    reason:
      safeMessage ||
      "Meta API 拒絕此項查詢，請確認帳號 ID、Page Access Token 與權限設定。",
    details,
  };
}

async function fetchMetaProfile({
  baseUrl,
  version,
  accountId,
  accessToken,
  fields,
}) {
  const url = new URL(
    `${baseUrl}/${version}/${encodeURIComponent(accountId)}`
  );
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return createMetaStatus(
      "error",
      null,
      "目前無法連線 Meta API，請稍後再試。",
      "META_NETWORK_ERROR"
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const safeError = getSafeMetaError(response.status, payload?.error);

    return createMetaStatus(
      "error",
      null,
      safeError.reason,
      safeError.code,
      safeError.details
    );
  }

  const accountName = cleanText(payload?.name || payload?.username);
  return createMetaStatus(
    "connected",
    accountName || "帳號已連線",
    null
  );
}

async function checkFacebookConnection() {
  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));
  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );
  const diagnostics = {
    hasFacebookPageId: Boolean(pageId),
    facebookPageIdLength: pageId.length,
    hasFacebookPageToken: Boolean(accessToken),
    facebookPageTokenPrefix: accessToken.slice(0, 6),
    facebookPageTokenLength: accessToken.length,
  };

  if (!pageId) {
    return {
      ...createMetaStatus(
        "not_configured",
        null,
        "FACEBOOK_PAGE_ID 未設定或空白。",
        "META_NOT_CONFIGURED"
      ),
      diagnostics,
    };
  }

  if (!accessToken) {
    return {
      ...createMetaStatus(
        "not_configured",
        null,
        "FACEBOOK_PAGE_ACCESS_TOKEN 未設定或空白。",
        "META_NOT_CONFIGURED"
      ),
      diagnostics,
    };
  }

  const connection = await fetchMetaProfile({
    baseUrl: "https://graph.facebook.com",
    version: "v25.0",
    accountId: pageId,
    accessToken,
    fields: ["id", "name"],
  });

  return {
    ...connection,
    diagnostics,
  };
}

async function inspectFacebookTokenScopes() {
  const appId = cleanText(getServerEnv("META_APP_ID"));
  const appSecret = cleanText(getServerEnv("META_APP_SECRET"));
  const pageAccessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!appId || !appSecret || !pageAccessToken) {
    return {
      available: false,
      scopes: [],
      error: "無法檢查 Token scopes，請確認 Meta App 與 Page Token 環境變數。",
    };
  }

  const url = new URL("https://graph.facebook.com/v25.0/debug_token");
  url.searchParams.set("input_token", pageAccessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return {
      available: false,
      scopes: [],
      error: "目前無法檢查 Meta Token scopes，請稍後再試。",
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const safeError = getSafeMetaError(response.status, payload?.error);
    return {
      available: false,
      scopes: [],
      error: safeError.reason,
    };
  }

  return {
    available: true,
    scopes: Array.isArray(payload.data.scopes)
      ? payload.data.scopes.map((scope) => cleanText(scope)).filter(Boolean)
      : [],
    error: null,
  };
}

async function checkInstagramConnectionWithFacebookLoginLegacy(tokenInspection) {
  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );
  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));
  const configuredAccountId = cleanText(
    getServerEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
  );

  if (!accessToken || (!configuredAccountId && !pageId)) {
    return createMetaStatus("not_configured");
  }

  const grantedScopes = tokenInspection?.scopes || [];
  const missingScopes = tokenInspection?.available
    ? instagramRequiredScopes.filter(
        (scope) => !grantedScopes.includes(scope)
      )
    : [];
  const scopeDiagnostics = {
    scopeCheckAvailable: tokenInspection?.available === true,
    grantedScopes,
    requiredScopes: instagramRequiredScopes,
    missingScopes,
    canPublishInstagram:
      tokenInspection?.available === true && missingScopes.length === 0,
    scopeCheckError: tokenInspection?.error || null,
  };

  let pageLink;
  try {
    pageLink = await fetchInstagramPageLink(
      pageId,
      accessToken
    );
  } catch (error) {
    const missingScopeMessage = missingScopes.includes("instagram_basic")
      ? "目前 token 缺少 instagram_basic，請重新授權 Meta App。"
      : missingScopes.includes("instagram_content_publish")
        ? "目前 token 缺少 instagram_content_publish，無法發布 Instagram 貼文，請重新授權 Meta App。"
        : null;

    return {
      ...createMetaStatus(
        "error",
        null,
        missingScopeMessage ||
          error.message ||
          "無法取得 Instagram 商業帳號。",
        missingScopeMessage
          ? "INSTAGRAM_REQUIRED_SCOPE_MISSING"
          : error.code || "INSTAGRAM_ACCOUNT_LOOKUP_FAILED",
        error.metaError || null
      ),
      diagnostics: scopeDiagnostics,
    };
  }

  const profile = await fetchMetaProfile({
    baseUrl: "https://graph.facebook.com",
    version: getMetaGraphVersion(),
    accountId: pageLink.accountId,
    accessToken,
    fields: ["id", "username", "name"],
  });

  return {
    ...createMetaStatus(
      "connected",
      profile.status === "connected"
        ? profile.accountName
        : `Instagram 帳號 ${pageLink.accountId}`,
      profile.status === "error" ? profile.error : null,
      profile.status === "error" ? profile.errorCode : null,
      profile.status === "error" ? profile.metaError : null
    ),
    diagnostics: {
      pageId: pageLink.pageId,
      pageName: pageLink.pageName,
      instagramBusinessAccountId: pageLink.accountId,
      hasInstagramBusinessAccount: true,
      ...scopeDiagnostics,
    },
  };
}

function normalizeInstagramProfile(payload) {
  const profile = Array.isArray(payload?.data) ? payload.data[0] : payload;
  return {
    userId: cleanText(profile?.user_id || profile?.id),
    username: cleanText(profile?.username),
    name: cleanText(profile?.name),
    accountType: cleanText(profile?.account_type),
  };
}

function normalizeGrantedScopes(value) {
  if (Array.isArray(value)) {
    return value.map((scope) => cleanText(scope)).filter(Boolean);
  }

  return cleanText(value)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parseExpiryDate(value) {
  const text = cleanText(value);
  if (!text) return null;

  const numericValue = Number(text);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    const milliseconds = numericValue > 10_000_000_000
      ? numericValue
      : numericValue * 1000;
    return new Date(milliseconds).toISOString();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function loadStoredInstagramCredential() {
  const rows = await supabaseRequest(
    "/shop_social_platform_credentials?platform=eq.instagram&select=external_user_id,username,account_name,account_type,access_token,token_expires_at,granted_scopes,updated_at&limit=1"
  ).catch(() => []);

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function loadInstagramCredential() {
  const envToken = cleanText(getServerEnv("INSTAGRAM_USER_ACCESS_TOKEN"));
  const envUserId = cleanText(getServerEnv("INSTAGRAM_USER_ID"));

  if (envToken) {
    return {
      accessToken: envToken,
      userId: envUserId,
      username: "",
      name: "",
      accountType: "",
      expiresAt: parseExpiryDate(
        getServerEnv("INSTAGRAM_TOKEN_EXPIRES_AT")
      ),
      grantedScopes: [],
      source: "environment",
    };
  }

  const stored = await loadStoredInstagramCredential();
  if (!stored?.access_token) return null;

  return {
    accessToken: cleanText(stored.access_token),
    userId: cleanText(stored.external_user_id),
    username: cleanText(stored.username),
    name: cleanText(stored.account_name),
    accountType: cleanText(stored.account_type),
    expiresAt: parseExpiryDate(stored.token_expires_at),
    grantedScopes: normalizeGrantedScopes(stored.granted_scopes),
    source: "oauth_store",
  };
}

async function fetchInstagramProfile(accessToken) {
  const url = new URL(
    `https://graph.instagram.com/${getMetaGraphVersion()}/me`
  );
  url.searchParams.set("fields", "user_id,username,name,account_type");
  url.searchParams.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error(
      "無法連線 Instagram API，請稍後再試。"
    );
    error.code = "INSTAGRAM_NETWORK_ERROR";
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const safeError = getSafeMetaError(response.status, payload?.error);
    const error = new Error(safeError.reason);
    error.code = safeError.code;
    error.status = 502;
    error.metaError = safeError.details;
    throw error;
  }

  const profile = normalizeInstagramProfile(payload);
  if (!profile.userId || !profile.username) {
    const error = new Error("Instagram API 未回傳完整帳號資料。");
    error.code = "INSTAGRAM_PROFILE_INCOMPLETE";
    error.status = 502;
    throw error;
  }

  return profile;
}

async function checkInstagramConnection() {
  const credential = await loadInstagramCredential();
  if (!credential?.accessToken) {
    return {
      ...createMetaStatus(
        "not_configured",
        null,
        "Instagram 尚未授權，請使用 @mumbao.tw 登入並授權。",
        "INSTAGRAM_NOT_AUTHORIZED"
      ),
      diagnostics: {
        requiredScopes: instagramLoginRequiredScopes,
        grantedScopes: [],
        missingScopes: instagramLoginRequiredScopes,
        scopeCheckAvailable: false,
        canPublishInstagram: false,
        publishingEnabled: false,
      },
    };
  }

  const grantedScopes = credential.grantedScopes;
  const scopeCheckAvailable = grantedScopes.length > 0;
  const missingScopes = scopeCheckAvailable
    ? instagramLoginRequiredScopes.filter(
        (scope) => !grantedScopes.includes(scope)
      )
    : [];

  try {
    const profile = await fetchInstagramProfile(credential.accessToken);
    if (profile.username.toLowerCase() !== instagramExpectedUsername) {
      return {
        ...createMetaStatus(
          "error",
          `@${profile.username}`,
          "目前授權的 Instagram 帳號不是 @mumbao.tw，請重新授權正確帳號。",
          "INSTAGRAM_USERNAME_MISMATCH"
        ),
        diagnostics: {
          instagramUserId: profile.userId,
          username: profile.username,
          accountType: profile.accountType,
          tokenExpiresAt: credential.expiresAt,
          tokenLastFour: credential.accessToken.slice(-4),
          credentialSource: credential.source,
          requiredScopes: instagramLoginRequiredScopes,
          grantedScopes,
          missingScopes,
          scopeCheckAvailable,
          canPublishInstagram: false,
          publishingEnabled: false,
        },
      };
    }

    return {
      ...createMetaStatus(
        "connected",
        `@${profile.username}`,
        null
      ),
      diagnostics: {
        instagramUserId: profile.userId,
        username: profile.username,
        accountType: profile.accountType,
        tokenExpiresAt: credential.expiresAt,
        tokenLastFour: credential.accessToken.slice(-4),
        credentialSource: credential.source,
        requiredScopes: instagramLoginRequiredScopes,
        grantedScopes,
        missingScopes,
        scopeCheckAvailable,
        canPublishInstagram:
          scopeCheckAvailable && missingScopes.length === 0,
        publishingEnabled: false,
      },
    };
  } catch (error) {
    return {
      ...createMetaStatus(
        "error",
        null,
        error.message || "Instagram 連線檢查失敗。",
        error.code || "INSTAGRAM_CONNECTION_FAILED",
        error.metaError || null
      ),
      diagnostics: {
        tokenExpiresAt: credential.expiresAt,
        tokenLastFour: credential.accessToken.slice(-4),
        credentialSource: credential.source,
        requiredScopes: instagramLoginRequiredScopes,
        grantedScopes,
        missingScopes,
        scopeCheckAvailable,
        canPublishInstagram: false,
        publishingEnabled: false,
      },
    };
  }
}

async function checkThreadsConnection() {
  const userId = cleanText(getServerEnv("THREADS_USER_ID"));
  const accessToken = cleanText(getServerEnv("THREADS_ACCESS_TOKEN"));

  if (!userId || !accessToken) {
    return createMetaStatus("not_configured");
  }

  return fetchMetaProfile({
    baseUrl: "https://graph.threads.net",
    version: "v1.0",
    accountId: userId,
    accessToken,
    fields: ["id", "username", "name"],
  });
}

async function loadMetaStatus(_req, res) {
  const [facebook, instagram, threads] = await Promise.all([
    checkFacebookConnection(),
    checkInstagramConnection(),
    checkThreadsConnection(),
  ]);

  return sendJson(res, 200, {
    platforms: {
      facebook,
      instagram,
      threads,
    },
    checkedAt: new Date().toISOString(),
  });
}

async function handleInstagramOAuthStart(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      ok: false,
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const appId = cleanText(getServerEnv("INSTAGRAM_APP_ID"));
  const configuredRedirectUri = cleanText(
    getServerEnv("INSTAGRAM_REDIRECT_URI")
  );
  const scope = instagramOAuthScope;
  const diagnostics = {
    clientIdLastFour: appId ? appId.slice(-4) : "",
    redirectUri: configuredRedirectUri,
    scope,
  };

  if (!/^\d+$/.test(appId)) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "INSTAGRAM_APP_ID_INVALID",
      errorMessage:
        "INSTAGRAM_APP_ID 未設定或格式錯誤，請確認沒有前後空格、引號，且使用 Instagram App ID。",
      diagnostics,
    });
  }

  if (configuredRedirectUri !== instagramOAuthRedirectUri) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "INSTAGRAM_REDIRECT_URI_MISMATCH",
      errorMessage:
        "INSTAGRAM_REDIRECT_URI 必須逐字設定為 https://mumbao.tw/api/instagram-oauth-callback。",
      diagnostics,
    });
  }

  const body = await readBody(req);
  const state = randomBytes(32).toString("base64url");
  setInstagramOAuthStateCookie(req, res, state);

  const authorizationUrl = new URL(
    "https://www.instagram.com/oauth/authorize"
  );
  authorizationUrl.searchParams.set("client_id", appId);
  authorizationUrl.searchParams.set(
    "redirect_uri",
    instagramOAuthRedirectUri
  );
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scope);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("enable_fb_login", "0");
  if (body?.forceReauth === true) {
    authorizationUrl.searchParams.set("force_reauth", "true");
  }

  if (authorizationUrl.searchParams.get("scope") !== instagramOAuthScope) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "INSTAGRAM_OAUTH_SCOPE_INVALID",
      errorMessage:
        "Instagram OAuth scope 格式錯誤，必須使用逗號分隔兩個權限。",
      diagnostics,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    authorizationUrl: authorizationUrl.toString(),
    diagnostics: {
      clientIdLastFour: appId.slice(-4),
      redirectUri: instagramOAuthRedirectUri,
      scope,
    },
  });
}

function nullableUnixTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function handleDebugFacebookToken(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, {
      ok: false,
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const appId = cleanText(getServerEnv("META_APP_ID"));
  const appSecret = cleanText(getServerEnv("META_APP_SECRET"));
  const pageAccessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!appId) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "META_APP_ID_NOT_CONFIGURED",
      errorMessage: "META_APP_ID 未設定或空白。",
      metaError: null,
    });
  }

  if (!appSecret) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "META_APP_SECRET_NOT_CONFIGURED",
      errorMessage: "META_APP_SECRET 未設定或空白。",
      metaError: null,
    });
  }

  if (!pageAccessToken) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "FACEBOOK_PAGE_TOKEN_NOT_CONFIGURED",
      errorMessage: "FACEBOOK_PAGE_ACCESS_TOKEN 未設定或空白。",
      metaError: null,
    });
  }

  const url = new URL(
    "https://graph.facebook.com/v25.0/debug_token"
  );
  url.searchParams.set("input_token", pageAccessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return sendJson(res, 502, {
      ok: false,
      errorCode: "META_TOKEN_DEBUG_NETWORK_ERROR",
      errorMessage: "目前無法連線 Meta Token Debug API，請稍後再試。",
      metaError: null,
    });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.data) {
    const safeError = getSafeMetaError(response.status, payload?.error);

    return sendJson(res, 502, {
      ok: false,
      errorCode: safeError.code || "META_TOKEN_DEBUG_FAILED",
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    });
  }

  const data = payload.data;
  const isValid = data?.is_valid === true;

  return sendJson(res, 200, {
    ok: true,
    isValid,
    appId: cleanText(data?.app_id),
    type: cleanText(data?.type),
    application: cleanText(data?.application),
    profileId: cleanText(data?.profile_id),
    userId: cleanText(data?.user_id),
    expiresAt: nullableUnixTimestamp(data?.expires_at),
    dataAccessExpiresAt: nullableUnixTimestamp(
      data?.data_access_expires_at
    ),
    scopes: Array.isArray(data?.scopes)
      ? data.scopes.map((scope) => cleanText(scope)).filter(Boolean)
      : [],
    tokenPrefix: pageAccessToken.slice(0, 6),
    tokenLength: pageAccessToken.length,
    checkedAt: new Date().toISOString(),
    errorCode: isValid ? null : "FACEBOOK_TOKEN_INVALID",
    errorMessage: isValid
      ? null
      : "Meta 判定目前的 FACEBOOK_PAGE_ACCESS_TOKEN 無效，請重新產生並更新 Vercel。",
  });
}

function normalizeSocialPostStatus(value) {
  const status = cleanText(value);
  if (status === "pending") return "draft";
  if (
    ["draft", "scheduled", "published", "deleted", "failed"].includes(status)
  ) {
    return status;
  }
  return "draft";
}

function normalizePlatformStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function buildSocialPostRow(task) {
  const id = cleanText(task?.id);
  if (!id) {
    const error = new Error("Social task id is required.");
    error.status = 400;
    throw error;
  }

  return {
    id,
    title: cleanText(task?.title),
    content: cleanText(task?.content),
    hashtags: cleanText(task?.hashtags),
    platforms: Array.isArray(task?.platforms) ? task.platforms : [],
    mode: task?.mode === "scheduled" ? "scheduled" : "now",
    scheduled_at: cleanText(task?.scheduledAt) || null,
    status: normalizeSocialPostStatus(task?.status),
    media_file_names: Array.isArray(task?.mediaFileNames)
      ? task.mediaFileNames
      : [],
    media_files: Array.isArray(task?.mediaFiles) ? task.mediaFiles : [],
    fb_post_id: cleanText(task?.facebookPostId) || null,
    fb_permalink_url: cleanText(task?.facebookPermalinkUrl) || null,
    ig_media_id: cleanText(task?.instagramMediaId) || null,
    ig_permalink_url: cleanText(task?.instagramPermalinkUrl) || null,
    ig_published_at: cleanText(task?.instagramPublishedAt) || null,
    ig_status: cleanText(task?.instagramStatus) || null,
    threads_media_id: cleanText(task?.threadsMediaId) || null,
    threads_permalink_url: cleanText(task?.threadsPermalinkUrl) || null,
    threads_published_at: cleanText(task?.threadsPublishedAt) || null,
    threads_status: cleanText(task?.threadsStatus) || null,
    threads_error: cleanText(task?.threadsError) || null,
    image_url: cleanText(task?.imageUrl) || null,
    r2_key: cleanText(task?.r2Key) || null,
    platform_status: normalizePlatformStatus(task?.platformStatus),
    published_at: cleanText(task?.publishedAt) || null,
    deleted_at: cleanText(task?.deletedAt) || null,
    delete_source: cleanText(task?.deleteSource) || null,
    last_synced_at: cleanText(task?.lastSyncedAt) || null,
    publish_error: task?.publishError || null,
    created_at: cleanText(task?.createdAt) || new Date().toISOString(),
    updated_at: cleanText(task?.updatedAt) || new Date().toISOString(),
  };
}

async function loadSocialPostById(taskId) {
  const rows = await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}&select=*&limit=1`
  );
  return rows?.[0] || null;
}

function normalizeSocialPost(row) {
  return {
    id: row.id,
    title: row.title || "",
    content: row.content || "",
    hashtags: row.hashtags || "",
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    mode: row.mode || "now",
    scheduledAt: row.scheduled_at || "",
    status: row.status === "draft" ? "pending" : row.status,
    mediaFileNames: Array.isArray(row.media_file_names)
      ? row.media_file_names
      : [],
    mediaFiles: Array.isArray(row.media_files) ? row.media_files : [],
    facebookPostId: row.fb_post_id || undefined,
    facebookPermalinkUrl: row.fb_permalink_url || undefined,
    instagramMediaId: row.ig_media_id || undefined,
    instagramPermalinkUrl: row.ig_permalink_url || undefined,
    instagramPublishedAt: row.ig_published_at || undefined,
    instagramStatus: row.ig_status || undefined,
    threadsMediaId: row.threads_media_id || undefined,
    threadsPermalinkUrl: row.threads_permalink_url || undefined,
    threadsPublishedAt: row.threads_published_at || undefined,
    threadsStatus: row.threads_status || undefined,
    threadsError: row.threads_error || undefined,
    imageUrl: row.image_url || undefined,
    r2Key: row.r2_key || undefined,
    platformStatus: normalizePlatformStatus(row.platform_status),
    publishedAt: row.published_at || undefined,
    deletedAt: row.deleted_at || undefined,
    deleteSource: row.delete_source || undefined,
    lastSyncedAt: row.last_synced_at || undefined,
    publishError: row.publish_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadSocialPosts(req, res) {
  const rows = await supabaseRequest(
    "/shop_social_posts?select=*&order=updated_at.desc&limit=200"
  );
  return sendJson(res, 200, {
    posts: (rows || []).map(normalizeSocialPost),
  });
}

async function handleSocialPostsSync(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = await readBody(req);
  const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
  if (!tasks.length) {
    return sendJson(res, 200, { ok: true, synced: 0 });
  }

  const rows = tasks.map(buildSocialPostRow);
  await supabaseRequest("/shop_social_posts?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  return sendJson(res, 200, { ok: true, synced: rows.length });
}

async function handlePublishFacebookPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));
  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!pageId) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_ID_NOT_CONFIGURED",
      errorMessage: "FACEBOOK_PAGE_ID 未設定或空白。",
      metaError: null,
    });
  }

  if (!accessToken) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_TOKEN_NOT_CONFIGURED",
      errorMessage: "FACEBOOK_PAGE_ACCESS_TOKEN 未設定或空白。",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const taskId = cleanText(body?.taskId);
  const storedTask = taskId ? await loadSocialPostById(taskId) : null;
  const content = cleanText(storedTask?.content || body?.content);
  const hashtags = cleanText(storedTask?.hashtags || body?.hashtags);
  const message = [content, hashtags].filter(Boolean).join("\n\n");

  if (!message) {
    return sendJson(res, 400, {
      errorCode: "FACEBOOK_MESSAGE_REQUIRED",
      errorMessage: "發文內容與 Hashtag 不可同時為空。",
      metaError: null,
    });
  }

  const url = new URL(
    `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/feed`
  );
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return sendJson(res, 502, {
      errorCode: "META_NETWORK_ERROR",
      errorMessage: "目前無法連線 Facebook Graph API，請稍後再試。",
      metaError: null,
    });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.id) {
    const safeError = getSafeMetaError(response.status, payload?.error);

    return sendJson(res, 502, {
      errorCode: safeError.code,
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    });
  }

  const createdAt = new Date().toISOString();
  const facebookPostId = cleanText(payload.id);
  let facebookPermalinkUrl = "";

  try {
    const permalinkUrl = new URL(
      `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
        facebookPostId
      )}`
    );
    permalinkUrl.searchParams.set("fields", "permalink_url");
    const permalinkResponse = await fetch(permalinkUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    const permalinkPayload = await permalinkResponse.json().catch(() => null);
    if (permalinkResponse.ok) {
      facebookPermalinkUrl = cleanText(permalinkPayload?.permalink_url);
    }
  } catch {
    facebookPermalinkUrl = "";
  }

  if (taskId) {
    await supabaseRequest(
      `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "published",
          fb_post_id: facebookPostId,
          fb_permalink_url: facebookPermalinkUrl || null,
          published_at: createdAt,
          deleted_at: null,
          delete_source: null,
          updated_at: createdAt,
        }),
      }
    );
  }

  return sendJson(res, 200, {
    ok: true,
    facebookPostId,
    facebookPermalinkUrl: facebookPermalinkUrl || null,
    createdAt,
  });
}

async function fetchInstagramPageLink(pageId, accessToken) {
  const configuredAccountId = cleanText(
    getServerEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID")
  );

  if (!pageId) {
    if (configuredAccountId) {
      return {
        pageId: "",
        pageName: "",
        accountId: configuredAccountId,
      };
    }

    const error = new Error(
      "INSTAGRAM_BUSINESS_ACCOUNT_ID 與 FACEBOOK_PAGE_ID 均未設定。"
    );
    error.code = "INSTAGRAM_ACCOUNT_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const url = new URL(
    `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
      pageId
    )}`
  );
  url.searchParams.set("fields", "id,name,instagram_business_account");
  url.searchParams.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error("目前無法查詢 Instagram 商業帳號，請稍後再試。");
    error.code = "META_NETWORK_ERROR";
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => null);
  const accountId = cleanText(payload?.instagram_business_account?.id);
  if (!response.ok) {
    const safeError = getSafeMetaError(response.status, payload?.error);
    const error = new Error(safeError.reason);
    error.code = safeError.code;
    error.status = 502;
    error.metaError = safeError.details;
    throw error;
  }

  if (!accountId) {
    const error = new Error(
      "Facebook 粉專尚未連結 Instagram 專業帳號。"
    );
    error.code = "INSTAGRAM_ACCOUNT_NOT_LINKED";
    error.status = 502;
    throw error;
  }

  return {
    pageId: cleanText(payload?.id) || pageId,
    pageName: cleanText(payload?.name),
    accountId,
  };
}

async function resolveInstagramBusinessAccountId(pageId, accessToken) {
  const pageLink = await fetchInstagramPageLink(pageId, accessToken);
  return pageLink.accountId;
}

function findInstagramImage(task, requestedImageUrl, requestedR2Key) {
  const mediaFiles = Array.isArray(task?.media_files)
    ? task.media_files
    : [];
  const image = mediaFiles[0];
  const requestedUrl = cleanText(requestedImageUrl);
  const requestedKey = cleanText(requestedR2Key);

  if (!image) {
    return {
      errorCode: "INSTAGRAM_IMAGE_REQUIRED",
      errorMessage: "Instagram 發文需要上傳 1 張圖片",
    };
  }

  const publicUrl = cleanText(image.publicUrl);
  const contentType = cleanText(image.contentType);
  const key = cleanText(image.key);

  if (contentType === "video/mp4" || contentType.startsWith("video/")) {
    return {
      errorCode: "INSTAGRAM_VIDEO_NOT_SUPPORTED",
      errorMessage:
        "Instagram 第一版目前只支援單張圖片貼文，暫不支援影片",
    };
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return {
      errorCode: "INSTAGRAM_IMAGE_TYPE_NOT_SUPPORTED",
      errorMessage: "Instagram 第一版僅支援 JPG、PNG 或 WebP 圖片。",
    };
  }

  if (!publicUrl || !/^https:\/\//i.test(publicUrl)) {
    return {
      errorCode: "INSTAGRAM_PUBLIC_IMAGE_REQUIRED",
      errorMessage:
        "請先上傳圖片，取得公開圖片網址後才能發佈到 Instagram",
    };
  }

  if (requestedUrl && requestedUrl !== publicUrl) {
    return {
      errorCode: "INSTAGRAM_IMAGE_MISMATCH",
      errorMessage: "發文圖片與任務中的第一張已上傳圖片不一致，請重新整理後再試。",
    };
  }

  if (requestedKey && key && requestedKey !== key) {
    return {
      errorCode: "INSTAGRAM_R2_KEY_MISMATCH",
      errorMessage: "發文圖片識別資料不一致，請重新整理後再試。",
    };
  }

  return {
    publicUrl,
    contentType,
    key,
  };
}

async function markInstagramPublishFailed(taskId, storedTask, errorDetails) {
  if (!taskId) return;

  const updatedAt = new Date().toISOString();
  const platformStatus = {
    ...normalizePlatformStatus(storedTask?.platform_status),
    instagram: "failed",
  };
  await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: storedTask?.fb_post_id ? "published" : "failed",
        ig_status: "failed",
        platform_status: platformStatus,
        publish_error: {
          platform: "instagram",
          errorCode: errorDetails.errorCode,
          errorMessage: errorDetails.errorMessage,
          metaError: errorDetails.metaError || null,
        },
        updated_at: updatedAt,
      }),
    }
  ).catch(() => {
    // Publishing error response should not be replaced by a sync failure.
  });
}

async function handlePublishInstagramPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );
  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));
  if (!pageId) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_ID_NOT_CONFIGURED",
      errorMessage: "FACEBOOK_PAGE_ID 未設定或空白。",
      metaError: null,
    });
  }

  if (!accessToken) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_TOKEN_NOT_CONFIGURED",
      errorMessage: "Facebook Page Access Token 未設定或無效。",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const taskId = cleanText(body?.taskId);
  if (!taskId) {
    return sendJson(res, 400, {
      errorCode: "SOCIAL_TASK_ID_REQUIRED",
      errorMessage: "找不到要發布的發文任務。",
      metaError: null,
    });
  }

  const storedTask = await loadSocialPostById(taskId);
  if (!storedTask) {
    return sendJson(res, 404, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  const image = findInstagramImage(storedTask, body?.imageUrl, body?.r2Key);
  if (image.errorCode) {
    const errorDetails = {
      errorCode: image.errorCode,
      errorMessage: image.errorMessage,
      metaError: null,
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 400, errorDetails);
  }

  const content = cleanText(storedTask.content || body?.content);
  const title = cleanText(storedTask.title || body?.title);
  const hashtags = cleanText(storedTask.hashtags || body?.hashtags);
  const caption = [content || title, hashtags].filter(Boolean).join("\n\n");
  if (!caption) {
    const errorDetails = {
      errorCode: "INSTAGRAM_CAPTION_REQUIRED",
      errorMessage: "請先輸入發文標題或內容。",
      metaError: null,
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 400, errorDetails);
  }

  let instagramAccountId;
  try {
    instagramAccountId = await resolveInstagramBusinessAccountId(
      pageId,
      accessToken
    );
  } catch (error) {
    const errorDetails = {
      errorCode: error.code || "INSTAGRAM_ACCOUNT_LOOKUP_FAILED",
      errorMessage:
        error.message || "無法取得 Instagram 商業帳號，請稍後再試。",
      metaError: error.metaError
        ? {
            code: error.metaError.code,
            type: error.metaError.type,
            error_subcode: error.metaError.error_subcode,
          }
        : null,
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, error.status || 502, errorDetails);
  }

  const createUrl = new URL(
    `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
      instagramAccountId
    )}/media`
  );
  const createForm = new URLSearchParams();
  createForm.set("image_url", image.publicUrl);
  createForm.set("caption", caption);
  createForm.set("access_token", accessToken);

  let createResponse;
  try {
    createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: createForm,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const errorDetails = {
      errorCode: "META_NETWORK_ERROR",
      errorMessage: "目前無法建立 Instagram 圖片貼文，請稍後再試。",
      metaError: null,
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const createPayload = await createResponse.json().catch(() => null);
  const creationId = cleanText(createPayload?.id);
  if (!createResponse.ok || !creationId) {
    const safeError = getSafeMetaError(
      createResponse.status,
      createPayload?.error
    );
    const errorDetails = {
      errorCode: safeError.code,
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const publishUrl = new URL(
    `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
      instagramAccountId
    )}/media_publish`
  );
  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", creationId);
  publishForm.set("access_token", accessToken);

  let publishResponse;
  try {
    publishResponse = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: publishForm,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const errorDetails = {
      errorCode: "META_NETWORK_ERROR",
      errorMessage: "Instagram 圖片已建立，但目前無法發布，請稍後再試。",
      metaError: null,
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const publishPayload = await publishResponse.json().catch(() => null);
  const instagramMediaId = cleanText(publishPayload?.id);
  if (!publishResponse.ok || !instagramMediaId) {
    const safeError = getSafeMetaError(
      publishResponse.status,
      publishPayload?.error
    );
    const errorDetails = {
      errorCode: safeError.code,
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    };
    await markInstagramPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  let instagramPermalinkUrl = "";
  let instagramPublishedAt = "";
  try {
    const permalinkUrl = new URL(
      `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
        instagramMediaId
      )}`
    );
    permalinkUrl.searchParams.set("fields", "id,permalink,timestamp");
    permalinkUrl.searchParams.set("access_token", accessToken);
    const permalinkResponse = await fetch(permalinkUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const permalinkPayload = await permalinkResponse.json().catch(() => null);
    if (permalinkResponse.ok) {
      instagramPermalinkUrl = cleanText(permalinkPayload?.permalink);
      instagramPublishedAt = cleanText(permalinkPayload?.timestamp);
    }
  } catch {
    instagramPermalinkUrl = "";
  }

  const createdAt =
    instagramPublishedAt && !Number.isNaN(Date.parse(instagramPublishedAt))
      ? new Date(instagramPublishedAt).toISOString()
      : new Date().toISOString();
  const platformStatus = {
    ...normalizePlatformStatus(storedTask.platform_status),
    instagram: "published",
  };
  await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "published",
        ig_status: "published",
        ig_media_id: instagramMediaId,
        ig_permalink_url: instagramPermalinkUrl || null,
        ig_published_at: createdAt,
        image_url: image.publicUrl,
        r2_key: image.key || null,
        platform_status: platformStatus,
        publish_error: null,
        published_at: storedTask.published_at || createdAt,
        updated_at: createdAt,
      }),
    }
  );

  return sendJson(res, 200, {
    ok: true,
    instagramMediaId,
    instagramPermalinkUrl: instagramPermalinkUrl || null,
    imageUrl: image.publicUrl,
    r2Key: image.key || null,
    createdAt,
  });
}

async function markThreadsPublishFailed(taskId, storedTask, errorDetails) {
  if (!taskId) return;

  const updatedAt = new Date().toISOString();
  const hasPublishedPlatform = Boolean(
    storedTask?.fb_post_id || storedTask?.ig_media_id
  );
  const platformStatus = {
    ...normalizePlatformStatus(storedTask?.platform_status),
    threads: "failed",
  };

  await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: hasPublishedPlatform ? "published" : "failed",
        threads_status: "failed",
        threads_error: errorDetails.errorMessage,
        platform_status: platformStatus,
        publish_error: {
          platform: "threads",
          errorCode: errorDetails.errorCode,
          errorMessage: errorDetails.errorMessage,
          metaError: errorDetails.metaError || null,
        },
        updated_at: updatedAt,
      }),
    }
  ).catch(() => {
    // Keep the original Threads error response if task sync also fails.
  });
}

async function handlePublishThreadsPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const userId = cleanText(getServerEnv("THREADS_USER_ID"));
  const accessToken = cleanText(getServerEnv("THREADS_ACCESS_TOKEN"));
  if (!userId || !accessToken) {
    return sendJson(res, 500, {
      errorCode: "THREADS_NOT_CONFIGURED",
      errorMessage: "Threads 尚未設定 access token 或 user id",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const taskId = cleanText(body?.taskId);
  if (!taskId) {
    return sendJson(res, 400, {
      errorCode: "SOCIAL_TASK_ID_REQUIRED",
      errorMessage: "找不到要發布的發文任務。",
      metaError: null,
    });
  }

  const storedTask = await loadSocialPostById(taskId);
  if (!storedTask) {
    return sendJson(res, 404, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  if (storedTask.mode === "scheduled") {
    const errorDetails = {
      errorCode: "THREADS_SCHEDULE_NOT_SUPPORTED",
      errorMessage: "Threads 第一版暫不支援排程發文。",
      metaError: null,
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 400, errorDetails);
  }

  const content = cleanText(storedTask.content || body?.content);
  const title = cleanText(storedTask.title || body?.title);
  const hashtags = cleanText(storedTask.hashtags || body?.hashtags);
  const text = [content || title, hashtags].filter(Boolean).join("\n\n");

  if (!text) {
    const errorDetails = {
      errorCode: "THREADS_TEXT_REQUIRED",
      errorMessage: "請先輸入 Threads 發文內容",
      metaError: null,
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 400, errorDetails);
  }

  if (Array.from(text).length > 500) {
    const errorDetails = {
      errorCode: "THREADS_TEXT_TOO_LONG",
      errorMessage: "Threads 發文內容不可超過 500 字",
      metaError: null,
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 400, errorDetails);
  }

  const createUrl = new URL(
    `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`
  );
  const createForm = new URLSearchParams();
  createForm.set("media_type", "TEXT");
  createForm.set("text", text);
  createForm.set("access_token", accessToken);

  let createResponse;
  try {
    createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: createForm,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const errorDetails = {
      errorCode: "THREADS_NETWORK_ERROR",
      errorMessage: "目前無法建立 Threads 貼文，請稍後再試。",
      metaError: null,
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const createPayload = await createResponse.json().catch(() => null);
  const creationId = cleanText(createPayload?.id);
  if (!createResponse.ok || !creationId) {
    const safeError = getSafeMetaError(
      createResponse.status,
      createPayload?.error
    );
    const errorDetails = {
      errorCode: safeError.code,
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const publishUrl = new URL(
    `https://graph.threads.net/v1.0/${encodeURIComponent(
      userId
    )}/threads_publish`
  );
  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", creationId);
  publishForm.set("access_token", accessToken);

  let publishResponse;
  try {
    publishResponse = await fetch(publishUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: publishForm,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const errorDetails = {
      errorCode: "THREADS_NETWORK_ERROR",
      errorMessage: "Threads 貼文已建立，但目前無法發布，請稍後再試。",
      metaError: null,
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  const publishPayload = await publishResponse.json().catch(() => null);
  const threadsMediaId = cleanText(publishPayload?.id);
  if (!publishResponse.ok || !threadsMediaId) {
    const safeError = getSafeMetaError(
      publishResponse.status,
      publishPayload?.error
    );
    const errorDetails = {
      errorCode: safeError.code,
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    };
    await markThreadsPublishFailed(taskId, storedTask, errorDetails);
    return sendJson(res, 502, errorDetails);
  }

  let threadsPermalinkUrl = "";
  let threadsPublishedAt = "";
  try {
    const detailsUrl = new URL(
      `https://graph.threads.net/v1.0/${encodeURIComponent(threadsMediaId)}`
    );
    detailsUrl.searchParams.set("fields", "id,permalink,timestamp");
    detailsUrl.searchParams.set("access_token", accessToken);
    const detailsResponse = await fetch(detailsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const detailsPayload = await detailsResponse.json().catch(() => null);
    if (detailsResponse.ok) {
      threadsPermalinkUrl = cleanText(detailsPayload?.permalink);
      threadsPublishedAt = cleanText(detailsPayload?.timestamp);
    }
  } catch {
    threadsPermalinkUrl = "";
  }

  const createdAt =
    threadsPublishedAt && !Number.isNaN(Date.parse(threadsPublishedAt))
      ? new Date(threadsPublishedAt).toISOString()
      : new Date().toISOString();
  const platformStatus = {
    ...normalizePlatformStatus(storedTask.platform_status),
    threads: "published",
  };

  await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "published",
        threads_media_id: threadsMediaId,
        threads_permalink_url: threadsPermalinkUrl || null,
        threads_published_at: createdAt,
        threads_status: "published",
        threads_error: null,
        platform_status: platformStatus,
        published_at: storedTask.published_at || createdAt,
        updated_at: createdAt,
      }),
    }
  );

  return sendJson(res, 200, {
    ok: true,
    threadsMediaId,
    threadsPermalinkUrl: threadsPermalinkUrl || null,
    createdAt,
  });
}

async function handleDeleteFacebookPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );

  if (!accessToken) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_TOKEN_NOT_CONFIGURED",
      errorMessage:
        "Facebook Token 無效，請更新 Page Access Token 後再試。",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const taskId = cleanText(body?.taskId);

  if (!taskId) {
    return sendJson(res, 400, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  const task = await loadSocialPostById(taskId);
  if (!task) {
    return sendJson(res, 404, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  const facebookPostId = cleanText(task.fb_post_id);
  if (!facebookPostId) {
    return sendJson(res, 400, {
      errorCode: "FACEBOOK_POST_ID_REQUIRED",
      errorMessage: "這筆任務沒有 Facebook 貼文 ID，無法刪除。",
      metaError: null,
    });
  }

  if (task.status !== "published") {
    return sendJson(res, 409, {
      errorCode: "FACEBOOK_POST_NOT_PUBLISHED",
      errorMessage: "只有已發布的 Facebook 貼文可以刪除。",
      metaError: null,
    });
  }

  const version = getMetaGraphVersion();
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(
      facebookPostId
    )}`
  );

  let response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return sendJson(res, 502, {
      errorCode: "META_NETWORK_ERROR",
      errorMessage: "Facebook 貼文刪除失敗，請稍後再試。",
      metaError: null,
    });
  }

  const payload = await response.json().catch(() => null);
  const deleteSucceeded =
    response.ok && (payload === true || payload?.success === true);

  if (!deleteSucceeded) {
    const safeError = getSafeMetaError(response.status, payload?.error);
    const tokenInvalid =
      safeError.details.code === 190 || response.status === 401;

    console.error("facebook post delete failed:", {
      status: response.status,
      metaCode: safeError.details.code,
      metaType: safeError.details.type,
      metaSubcode: safeError.details.error_subcode,
    });

    return sendJson(res, 502, {
      errorCode: safeError.code,
      errorMessage: tokenInvalid
        ? "Facebook Token 無效，請更新 Page Access Token 後再試。"
        : "Facebook 貼文刪除失敗，請稍後再試。",
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    });
  }

  const deletedAt = new Date().toISOString();
  await supabaseRequest(
    `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "deleted",
        deleted_at: deletedAt,
        delete_source: "admin",
        last_synced_at: deletedAt,
        updated_at: deletedAt,
      }),
    }
  );

  return sendJson(res, 200, {
    ok: true,
    taskId,
    facebookPostId,
    deletedAt,
    deleteSource: "admin",
  });
}

async function handleSyncFacebookPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
    });
  }

  const accessToken = cleanText(
    getServerEnv("FACEBOOK_PAGE_ACCESS_TOKEN")
  );
  if (!accessToken) {
    return sendJson(res, 500, {
      errorCode: "FACEBOOK_PAGE_TOKEN_NOT_CONFIGURED",
      errorMessage:
        "Facebook Token 無效，請更新 Page Access Token 後再試。",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const taskId = cleanText(body?.taskId);
  if (!taskId) {
    return sendJson(res, 400, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  const task = await loadSocialPostById(taskId);
  if (!task) {
    return sendJson(res, 404, {
      errorCode: "SOCIAL_TASK_NOT_FOUND",
      errorMessage: "找不到這筆發文任務。",
      metaError: null,
    });
  }

  if (task.status !== "published") {
    return sendJson(res, 409, {
      errorCode: "FACEBOOK_POST_NOT_PUBLISHED",
      errorMessage: "只有已發布的 Facebook 貼文可以同步狀態。",
      metaError: null,
    });
  }

  const facebookPostId = cleanText(task.fb_post_id);
  if (!facebookPostId) {
    return sendJson(res, 400, {
      errorCode: "FACEBOOK_POST_ID_REQUIRED",
      errorMessage: "這筆任務沒有 Facebook 貼文 ID，無法同步。",
      metaError: null,
    });
  }

  const checkedAt = new Date().toISOString();
  const url = new URL(
    `https://graph.facebook.com/${getMetaGraphVersion()}/${encodeURIComponent(
      facebookPostId
    )}`
  );
  url.searchParams.set("fields", "id,permalink_url");

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return sendJson(res, 502, {
      errorCode: "META_NETWORK_ERROR",
      errorMessage: "Facebook 狀態同步失敗，請稍後再試。",
      metaError: null,
    });
  }

  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.id) {
    const permalinkUrl =
      cleanText(payload?.permalink_url) || cleanText(task.fb_permalink_url);
    await supabaseRequest(
      `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fb_permalink_url: permalinkUrl || null,
          last_synced_at: checkedAt,
          updated_at: checkedAt,
        }),
      }
    );

    return sendJson(res, 200, {
      ok: true,
      taskId,
      status: "published",
      facebookPostId,
      facebookPermalinkUrl: permalinkUrl || null,
      lastSyncedAt: checkedAt,
      deletedAt: null,
      deleteSource: null,
    });
  }

  const safeError = getSafeMetaError(response.status, payload?.error);
  const safeMessage = String(safeError.details.message || "").toLowerCase();
  const postDoesNotExist =
    response.status === 404 ||
    safeError.details.code === 100 ||
    safeError.details.code === 803 ||
    safeMessage.includes("unsupported get request") ||
    safeMessage.includes("object does not exist") ||
    safeMessage.includes("cannot be loaded");

  if (postDoesNotExist) {
    await supabaseRequest(
      `/shop_social_posts?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "deleted",
          deleted_at: checkedAt,
          delete_source: "facebook",
          last_synced_at: checkedAt,
          updated_at: checkedAt,
        }),
      }
    );

    return sendJson(res, 200, {
      ok: true,
      taskId,
      status: "deleted",
      facebookPostId,
      facebookPermalinkUrl: cleanText(task.fb_permalink_url) || null,
      lastSyncedAt: checkedAt,
      deletedAt: checkedAt,
      deleteSource: "facebook",
    });
  }

  return sendJson(res, 502, {
    errorCode: safeError.code,
    errorMessage:
      safeError.details.code === 190
        ? "Facebook Token 無效，請更新 Page Access Token 後再試。"
        : "Facebook 狀態同步失敗，請稍後再試。",
    metaError: {
      code: safeError.details.code,
      type: safeError.details.type,
      error_subcode: safeError.details.error_subcode,
    },
  });
}

function parseMetaTokenExchangePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return {
      access_token: params.get("access_token"),
      token_type: params.get("token_type"),
      expires_in: params.get("expires_in"),
    };
  }
}

function createMetaActionError(status, errorCode, errorMessage, metaError = null) {
  return {
    status,
    body: {
      ok: false,
      errorCode,
      errorMessage,
      metaError,
    },
  };
}

async function handleExchangeMetaToken(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      ok: false,
      errorCode: "METHOD_NOT_ALLOWED",
      errorMessage: "Method not allowed.",
      metaError: null,
    });
  }

  const appId = cleanText(getServerEnv("META_APP_ID"));
  const appSecret = cleanText(getServerEnv("META_APP_SECRET"));
  const pageId = cleanText(getServerEnv("FACEBOOK_PAGE_ID"));

  if (!appId) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "META_APP_ID_NOT_CONFIGURED",
      errorMessage: "META_APP_ID 未設定或空白。",
      metaError: null,
    });
  }

  if (!appSecret) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "META_APP_SECRET_NOT_CONFIGURED",
      errorMessage: "META_APP_SECRET 未設定或空白。",
      metaError: null,
    });
  }

  if (!pageId) {
    return sendJson(res, 500, {
      ok: false,
      errorCode: "FACEBOOK_PAGE_ID_NOT_CONFIGURED",
      errorMessage: "FACEBOOK_PAGE_ID 未設定或空白。",
      metaError: null,
    });
  }

  const body = await readBody(req);
  const shortLivedUserToken = cleanText(body?.shortLivedUserToken);

  if (!shortLivedUserToken) {
    return sendJson(res, 400, {
      ok: false,
      errorCode: "SHORT_LIVED_USER_TOKEN_REQUIRED",
      errorMessage: "請貼上 Graph API Explorer 產生的短效 User Token。",
      metaError: null,
    });
  }

  const exchangeUrl = new URL(
    "https://graph.facebook.com/v25.0/oauth/access_token"
  );
  exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set(
    "fb_exchange_token",
    shortLivedUserToken
  );

  let exchangeResponse;
  try {
    exchangeResponse = await fetch(exchangeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const safeError = createMetaActionError(
      502,
      "META_TOKEN_EXCHANGE_NETWORK_ERROR",
      "目前無法連線 Meta Token Exchange API，請稍後再試。"
    );
    return sendJson(res, safeError.status, safeError.body);
  }

  const exchangeText = await exchangeResponse.text();
  const exchangePayload = parseMetaTokenExchangePayload(exchangeText);

  if (!exchangeResponse.ok || !exchangePayload?.access_token) {
    const safeError = getSafeMetaError(
      exchangeResponse.status,
      exchangePayload?.error
    );
    return sendJson(res, 502, {
      ok: false,
      errorCode: safeError.code || "META_TOKEN_EXCHANGE_FAILED",
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    });
  }

  const longLivedUserToken = cleanText(exchangePayload.access_token);
  const accountsUrl = new URL(
    "https://graph.facebook.com/v25.0/me/accounts"
  );
  accountsUrl.searchParams.set("fields", "id,name,tasks,access_token");
  accountsUrl.searchParams.set("access_token", longLivedUserToken);

  let accountsResponse;
  try {
    accountsResponse = await fetch(accountsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const safeError = createMetaActionError(
      502,
      "META_PAGE_LIST_NETWORK_ERROR",
      "已交換 User Token，但目前無法讀取 Facebook 粉絲專頁清單。"
    );
    return sendJson(res, safeError.status, safeError.body);
  }

  const accountsPayload = await accountsResponse.json().catch(() => null);

  if (!accountsResponse.ok) {
    const safeError = getSafeMetaError(
      accountsResponse.status,
      accountsPayload?.error
    );
    return sendJson(res, 502, {
      ok: false,
      errorCode: safeError.code || "META_PAGE_LIST_FAILED",
      errorMessage: safeError.reason,
      metaError: {
        code: safeError.details.code,
        type: safeError.details.type,
        error_subcode: safeError.details.error_subcode,
      },
    });
  }

  const pages = Array.isArray(accountsPayload?.data)
    ? accountsPayload.data
    : [];
  const page = pages.find((item) => cleanText(item?.id) === pageId);

  if (!page) {
    return sendJson(res, 404, {
      ok: false,
      errorCode: "FACEBOOK_PAGE_NOT_FOUND",
      errorMessage:
        "此 User Token 可管理的粉絲專頁中找不到 FACEBOOK_PAGE_ID，請確認帳號權限與粉絲專頁 ID。",
      metaError: null,
    });
  }

  const pageAccessToken = cleanText(page?.access_token);
  if (!pageAccessToken) {
    return sendJson(res, 403, {
      ok: false,
      errorCode: "FACEBOOK_PAGE_TOKEN_MISSING",
      errorMessage:
        "已找到粉絲專頁，但 Meta 未回傳 Page Access Token，請確認 User Token 權限。",
      metaError: null,
    });
  }

  const expiresIn = Number.parseInt(
    String(exchangePayload?.expires_in || ""),
    10
  );

  return sendJson(res, 200, {
    ok: true,
    pageId: cleanText(page.id),
    pageName: cleanText(page.name) || "Facebook 粉絲專頁",
    hasPageAccessToken: true,
    pageAccessTokenPrefix: pageAccessToken.slice(0, 6),
    pageAccessTokenLength: pageAccessToken.length,
    pageAccessToken,
    tasks: Array.isArray(page.tasks)
      ? page.tasks.map((task) => cleanText(task)).filter(Boolean)
      : [],
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    exchangedAt: new Date().toISOString(),
  });
}

function getPositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

function getPage(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function getRequiredInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${fieldName} must be a number.`);
    error.status = 400;
    throw error;
  }

  return parsed;
}

function nullableText(value) {
  const text = cleanText(value);
  return text ? text : null;
}

function getNextDateString(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
  );

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getKnownInventoryErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownInventoryErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownInventoryErrors.get(matchedKey) : "";
}

function getKnownManualSaleErrorMessage(error) {
  const message = String(error?.details?.message || error?.message || "");
  const matchedKey = Array.from(knownManualSaleErrors.keys()).find((key) =>
    message.includes(key)
  );

  return matchedKey ? knownManualSaleErrors.get(matchedKey) : "";
}

function normalizeOrderSummary(order) {
  return {
    id: order.id,
    order_number: order.order_number || "",
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: order.customer_email || "",
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    total: Number(order.total || 0),
    payment_method: order.payment_method || "manual_confirmation",
    payment_status: order.payment_status || "pending",
    order_status: order.order_status || "pending_confirm",
    order_source: order.order_source || "online",
    shipping_address: order.shipping_address || "",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    note: order.note || "",
    internal_note: order.internal_note || "",
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
  };
}

function buildOrderItemsSummary(items = []) {
  if (!items.length) {
    return {
      items_summary: "尚無商品明細",
      item_count: 0,
    };
  }

  if (items.length === 1) {
    const item = items[0];
    return {
      items_summary: `${item.product_name || "未命名商品"} ×${Number(item.quantity || 0)}`,
      item_count: 1,
    };
  }

  return {
    items_summary: `共 ${items.length} 項商品`,
    item_count: items.length,
  };
}

function normalizeDashboardOrderSummary(order, itemsByOrderId = new Map()) {
  const items = itemsByOrderId.get(order.id) || [];

  return {
    ...normalizeOrderSummary(order),
    ...buildOrderItemsSummary(items),
  };
}

function normalizeOrder(order, items = []) {
  return {
    ...normalizeOrderSummary(order),
    shipping_address: order.shipping_address || "",
    note: order.note || "",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    internal_note: order.internal_note || "",
    items: items.map(normalizeItem),
  };
}

function normalizeItem(item) {
  return {
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id || "",
    variant_id: item.variant_id || "",
    product_name: item.product_name || "",
    product_slug: item.product_slug || "",
    product_image_url: item.product_image_url || "",
    variant_name: item.variant_name || "",
    variant_option: item.variant_option || "",
    variant_price: Number(item.variant_price || 0),
    unit_price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    line_total: Number(item.line_total || 0),
    created_at: item.created_at || "",
  };
}

function normalizeVariant(variant) {
  return {
    id: variant.id,
    product_id: variant.product_id,
    sku: variant.sku || "",
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || "",
    image_url: variant.image_url || null,
    price: Number(variant.price || 0),
    compare_at_price:
      variant.compare_at_price === null || variant.compare_at_price === undefined
        ? null
        : Number(variant.compare_at_price),
    inventory: Number(variant.inventory || 0),
    status: variant.status || "active",
    sort_order: Number(variant.sort_order || 0),
    created_at: variant.created_at || "",
    updated_at: variant.updated_at || "",
  };
}

function normalizeImage(image) {
  return {
    id: image.id,
    product_id: image.product_id,
    image_url: image.image_url || "",
    alt: image.alt || "",
    sort_order: Number(image.sort_order || 0),
    created_at: image.created_at || "",
  };
}

function getProductStats(productId, variantsByProductId, imagesByProductId) {
  const variants = variantsByProductId.get(productId) || [];
  const images = imagesByProductId.get(productId) || [];
  const activePrices = variants
    .filter((variant) => variant.status === "active")
    .map((variant) => Number(variant.price || 0));
  const allPrices = variants.map((variant) => Number(variant.price || 0));
  const prices = activePrices.length ? activePrices : allPrices;

  return {
    min_price: prices.length ? Math.min(...prices) : 0,
    total_inventory: variants.reduce(
      (total, variant) => total + Number(variant.inventory || 0),
      0
    ),
    variant_count: variants.length,
    image_count: images.length,
  };
}

function normalizeProductSummary(product, variantsByProductId, imagesByProductId) {
  return {
    id: product.id,
    slug: product.slug || "",
    name: product.name || "",
    subtitle: product.subtitle || "",
    description: product.description || "",
    category: product.category || "",
    status: product.status || "draft",
    featured: Boolean(product.featured),
    sort_order: Number(product.sort_order || 0),
    cover_image_url: product.cover_image_url || "",
    created_at: product.created_at || "",
    updated_at: product.updated_at || "",
    ...getProductStats(product.id, variantsByProductId, imagesByProductId),
  };
}

function normalizeProduct(product, variants = [], images = []) {
  const variantsByProductId = new Map([[product.id, variants.map(normalizeVariant)]]);
  const imagesByProductId = new Map([[product.id, images.map(normalizeImage)]]);

  return {
    ...normalizeProductSummary(product, variantsByProductId, imagesByProductId),
    variants: variantsByProductId.get(product.id) || [],
    images: imagesByProductId.get(product.id) || [],
  };
}

function normalizeInventoryMovement(
  movement,
  productsById = new Map(),
  variantsById = new Map()
) {
  const product = productsById.get(movement.product_id);
  const variant = variantsById.get(movement.variant_id);

  return {
    id: movement.id,
    product_id: movement.product_id || "",
    variant_id: movement.variant_id || "",
    product_name: product?.name || "",
    product_slug: product?.slug || "",
    variant_name: variant?.variant_name || "",
    variant_option: variant?.variant_option || "",
    sku: variant?.sku || "",
    movement_type: movement.movement_type || "adjustment",
    quantity_delta: Number(movement.quantity_delta || 0),
    quantity_before: Number(movement.quantity_before || 0),
    quantity_after: Number(movement.quantity_after || 0),
    reference_type: movement.reference_type || "",
    reference_number: movement.reference_number || "",
    note: movement.note || "",
    created_at: movement.created_at || "",
    created_by: movement.created_by || "",
  };
}

function normalizeInventoryLookup(product, variant) {
  return {
    product: {
      id: product.id,
      slug: product.slug || "",
      name: product.name || "",
      category: product.category || "",
      status: product.status || "draft",
      cover_image_url: product.cover_image_url || "",
    },
    variant: normalizeVariant(variant),
    inventory: Number(variant.inventory || 0),
  };
}

function normalizeInventorySearchItem(product, variant) {
  return {
    product: {
      id: product.id,
      slug: product.slug || "",
      name: product.name || "",
      category: product.category || "",
      status: product.status || "draft",
      cover_image_url: product.cover_image_url || "",
    },
    variant: normalizeVariant(variant),
    inventory: Number(variant.inventory || 0),
  };
}

function getTaipeiTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  const taipeiOffsetMs = 8 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month - 1, day) - taipeiOffsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function isPaidOrCompletedOrder(order) {
  return order.payment_status === "confirmed" || order.order_status === "completed";
}

function getOrderSource(order) {
  return order.order_source === "pos" ? "pos" : "online";
}

function summarizeTodayOrders(orders = []) {
  const salesOrders = orders.filter(isPaidOrCompletedOrder);
  const totalBySource = (source) =>
    salesOrders
      .filter((order) => getOrderSource(order) === source)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const countBySource = (source) =>
    orders.filter((order) => getOrderSource(order) === source).length;

  return {
    sales_total: salesOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    online_sales_total: totalBySource("online"),
    pos_sales_total: totalBySource("pos"),
    order_count: orders.length,
    online_order_count: countBySource("online"),
    pos_order_count: countBySource("pos"),
  };
}

async function loadProductsByIds(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const productsById = new Map();

  if (!ids.length) return productsById;

  const products = await supabaseRequest(
    `/shop_products?select=id,slug,name&id=in.(${ids.join(",")})`
  );

  for (const product of products || []) {
    productsById.set(product.id, product);
  }

  return productsById;
}

async function loadVariantsByIds(variantIds = []) {
  const ids = [...new Set(variantIds.filter(Boolean))];
  const variantsById = new Map();

  if (!ids.length) return variantsById;

  const variants = await supabaseRequest(
    `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option&id=in.(${ids.join(",")})`
  );

  for (const variant of variants || []) {
    variantsById.set(variant.id, variant);
  }

  return variantsById;
}

function normalizeLowInventoryVariant(variant, productsById = new Map()) {
  const product = productsById.get(variant.product_id);

  return {
    product_id: variant.product_id || "",
    variant_id: variant.id || "",
    product_name: product?.name || "",
    variant_name: variant.variant_name || "",
    variant_option: variant.variant_option || "",
    sku: variant.sku || "",
    inventory: Number(variant.inventory || 0),
  };
}

async function loadDashboard(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const { startIso, endIso } = getTaipeiTodayRange();
  const orderSelect =
    "id,order_number,customer_name,total,payment_status,order_status,order_source,created_at";
  const movementSelect =
    "id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_number,note,created_at,created_by";
  const [
    todayOrders,
    pendingOnlineOrders,
    recentOrders,
    lowInventoryVariants,
    recentMovements,
  ] = await Promise.all([
    supabaseRequest(
      `/shop_orders?select=${orderSelect}&created_at=gte.${encodeURIComponent(
        startIso
      )}&created_at=lt.${encodeURIComponent(endIso)}&order=created_at.desc&limit=1000`
    ),
    supabaseRequest(
      "/shop_orders?select=id&order_source=eq.online&order_status=eq.pending_confirm&limit=1000"
    ),
    supabaseRequest(
      `/shop_orders?select=${orderSelect}&order=created_at.desc&limit=5`
    ),
    supabaseRequest(
      "/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,inventory,status&inventory=lte.3&order=inventory.asc,updated_at.desc&limit=10"
    ),
    supabaseRequest(
      `/shop_inventory_movements?select=${movementSelect}&order=created_at.desc&limit=5`
    ),
  ]);

  const lowInventoryProductsById = await loadProductsByIds(
    (lowInventoryVariants || []).map((variant) => variant.product_id)
  );
  const movementProductsById = await loadProductsByIds(
    (recentMovements || []).map((movement) => movement.product_id)
  );
  const movementVariantsById = await loadVariantsByIds(
    (recentMovements || []).map((movement) => movement.variant_id)
  );
  const recentOrderIds = (recentOrders || []).map((order) => order.id).filter(Boolean);
  const recentOrderItems = recentOrderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${recentOrderIds.join(
          ","
        )})&select=order_id,product_name,quantity,created_at&order=created_at.asc`
      )
    : [];
  const recentOrderItemsByOrderId = new Map();

  for (const item of recentOrderItems || []) {
    const items = recentOrderItemsByOrderId.get(item.order_id) || [];
    items.push(item);
    recentOrderItemsByOrderId.set(item.order_id, items);
  }

  return sendJson(res, 200, {
    dashboard: {
      today: summarizeTodayOrders(todayOrders || []),
      pending_online_order_count: (pendingOnlineOrders || []).length,
      low_inventory: (lowInventoryVariants || []).map((variant) =>
        normalizeLowInventoryVariant(variant, lowInventoryProductsById)
      ),
      recent_orders: (recentOrders || []).map((order) =>
        normalizeDashboardOrderSummary(order, recentOrderItemsByOrderId)
      ),
      recent_movements: (recentMovements || []).map((movement) =>
        normalizeInventoryMovement(
          movement,
          movementProductsById,
          movementVariantsById
        )
      ),
    },
  });
}

function buildOrderListFilters(req) {
  const search = String(firstQueryValue(req.query?.q) || "").trim();
  const status = String(firstQueryValue(req.query?.status) || "").trim();
  const source = String(firstQueryValue(req.query?.source) || "").trim();
  const paymentStatus = String(firstQueryValue(req.query?.paymentStatus) || "").trim();
  const dateFrom = String(firstQueryValue(req.query?.dateFrom) || "").trim();
  const dateTo = String(firstQueryValue(req.query?.dateTo) || "").trim();
  const tracking = String(firstQueryValue(req.query?.tracking) || "").trim();
  const statusFilter =
    status && validOrderStatuses.has(status)
      ? `&order_status=eq.${encodeURIComponent(status)}`
      : "";
  const sourceFilter =
    source && validOrderSources.has(source)
      ? `&order_source=eq.${encodeURIComponent(source)}`
      : "";
  const paymentStatusFilter =
    paymentStatus && validPaymentStatuses.has(paymentStatus)
      ? `&payment_status=eq.${encodeURIComponent(paymentStatus)}`
      : "";
  const dateFromFilter = isDateString(dateFrom)
    ? `&created_at=gte.${encodeURIComponent(`${dateFrom}T00:00:00`)}`
    : "";
  const nextDateTo = getNextDateString(dateTo);
  const dateToFilter = nextDateTo
    ? `&created_at=lt.${encodeURIComponent(`${nextDateTo}T00:00:00`)}`
    : "";
  const trackingFilter =
    tracking === "with"
      ? "&tracking_number=not.is.null"
      : tracking === "without"
        ? "&tracking_number=is.null"
        : "";
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const searchFilter = search
    ? `&or=(order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm},customer_email.ilike.${searchTerm},tracking_number.ilike.${searchTerm})`
    : "";

  return `${statusFilter}${sourceFilter}${paymentStatusFilter}${dateFromFilter}${dateToFilter}${trackingFilter}${searchFilter}`;
}

async function loadOrders(req, res) {
  const isExport = String(firstQueryValue(req.query?.export) || "").trim() === "1";
  const limit = isExport
    ? exportLimit
    : getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = isExport ? 0 : getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const select = isExport
    ? "id,order_number,customer_name,customer_phone,customer_email,shipping_address,subtotal,shipping_fee,total,payment_method,payment_status,order_status,order_source,shipping_carrier,tracking_number,note,internal_note,created_at,updated_at"
    : "id,order_number,customer_name,customer_phone,customer_email,subtotal,shipping_fee,total,payment_method,payment_status,order_status,order_source,tracking_number,created_at,updated_at";
  const orderFilters = buildOrderListFilters(req);
  const orders = await supabaseRequest(
    `/shop_orders?select=${select}${orderFilters}&order=created_at.desc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const hasMore = (orders || []).length > limit;
  const visibleOrders = (orders || []).slice(0, limit);
  const visibleOrderIds = visibleOrders.map((order) => order.id).filter(Boolean);
  const visibleOrderItems = visibleOrderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${visibleOrderIds.join(
          ","
        )})&select=order_id,product_name,quantity,created_at&order=created_at.asc`
      )
    : [];
  const visibleOrderItemsByOrderId = new Map();

  for (const item of visibleOrderItems || []) {
    const items = visibleOrderItemsByOrderId.get(item.order_id) || [];
    items.push(item);
    visibleOrderItemsByOrderId.set(item.order_id, items);
  }

  return sendJson(res, 200, {
    orders: visibleOrders.map((order) =>
      normalizeDashboardOrderSummary(order, visibleOrderItemsByOrderId)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

function normalizeOrderItemExportRow(order, item, variant) {
  return {
    order_number: order.order_number || "",
    created_at: order.created_at || "",
    order_source: order.order_source || "online",
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    customer_email: order.customer_email || "",
    order_status: order.order_status || "pending_confirm",
    payment_status: order.payment_status || "pending",
    shipping_carrier: order.shipping_carrier || "",
    tracking_number: order.tracking_number || "",
    product_name: item.product_name || "",
    variant_name: item.variant_name || "",
    variant_option: item.variant_option || "",
    sku: variant?.sku || "",
    unit_price: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    line_total: Number(item.line_total || 0),
    order_total: Number(order.total || 0),
    internal_note: order.internal_note || "",
  };
}

async function loadOrderItemsExport(req, res) {
  const select =
    "id,order_number,customer_name,customer_phone,customer_email,total,payment_status,order_status,order_source,shipping_carrier,tracking_number,internal_note,created_at";
  const orderFilters = buildOrderListFilters(req);
  const orders = await supabaseRequest(
    `/shop_orders?select=${select}${orderFilters}&order=created_at.desc&limit=${exportLimit}`
  );

  if (!orders?.length) {
    return sendJson(res, 200, { rows: [] });
  }

  const orderIds = orders.map((order) => order.id).filter(Boolean);
  const items = orderIds.length
    ? await supabaseRequest(
        `/shop_order_items?order_id=in.(${orderIds.join(
          ","
        )})&select=*&order=created_at.asc`
      )
    : [];
  const variantsById = await loadVariantsByIds((items || []).map((item) => item.variant_id));
  const itemsByOrderId = new Map();

  for (const item of items || []) {
    const orderItems = itemsByOrderId.get(item.order_id) || [];
    orderItems.push(item);
    itemsByOrderId.set(item.order_id, orderItems);
  }

  const rows = [];
  for (const order of orders || []) {
    const orderItems = itemsByOrderId.get(order.id) || [];
    for (const item of orderItems) {
      rows.push(
        normalizeOrderItemExportRow(
          order,
          item,
          variantsById.get(item.variant_id)
        )
      );
    }
  }

  return sendJson(res, 200, { rows });
}

async function loadOrder(orderNumber) {
  const orders = await supabaseRequest(
    `/shop_orders?order_number=eq.${encodeURIComponent(
      orderNumber
    )}&select=*&limit=1`
  );
  const order = orders?.[0];

  if (!order) {
    const error = new Error("Order not found.");
    error.status = 404;
    throw error;
  }

  const items = await supabaseRequest(
    `/shop_order_items?order_id=eq.${encodeURIComponent(
      order.id
    )}&select=*&order=created_at.asc`
  );

  return normalizeOrder(order, items || []);
}

function validateStatusPatch(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "order_status")) {
    const value = String(body.order_status || "").trim();
    if (!validOrderStatuses.has(value)) {
      const error = new Error("Invalid order_status.");
      error.status = 400;
      throw error;
    }
    patch.order_status = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "payment_status")) {
    const value = String(body.payment_status || "").trim();
    if (!validPaymentStatuses.has(value)) {
      const error = new Error("Invalid payment_status.");
      error.status = 400;
      throw error;
    }
    patch.payment_status = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "shipping_carrier")) {
    patch.shipping_carrier = nullableText(body.shipping_carrier);
  }

  if (Object.prototype.hasOwnProperty.call(body, "tracking_number")) {
    patch.tracking_number = nullableText(body.tracking_number);
  }

  if (Object.prototype.hasOwnProperty.call(body, "internal_note")) {
    patch.internal_note = nullableText(body.internal_note);
  }

  if (!Object.keys(patch).length) {
    const error = new Error("No fields to update.");
    error.status = 400;
    throw error;
  }

  return patch;
}

async function handleOrderAction(req, res) {
  if (req.method === "GET") {
    const orderNumber = String(firstQueryValue(req.query?.orderNumber) || "").trim();
    if (!orderNumber) {
      return sendJson(res, 400, { error: "orderNumber is required." });
    }

    return sendJson(res, 200, { order: await loadOrder(orderNumber) });
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    const orderNumber = String(body?.orderNumber || "").trim();
    if (!orderNumber) {
      return sendJson(res, 400, { error: "orderNumber is required." });
    }

    const patch = validateStatusPatch(body);
    await supabaseRequest(
      `/shop_orders?order_number=eq.${encodeURIComponent(orderNumber)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...patch,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return sendJson(res, 200, { order: await loadOrder(orderNumber) });
  }

  res.setHeader("Allow", "GET, PATCH");
  return sendJson(res, 405, { error: "Method not allowed." });
}

async function loadProducts(req, res) {
  const search = cleanText(firstQueryValue(req.query?.q));
  const status = cleanText(firstQueryValue(req.query?.status));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const statusFilter =
    status && validProductStatuses.has(status)
      ? `&status=eq.${encodeURIComponent(status)}`
      : "";
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const searchFilter = search
    ? `&or=(name.ilike.${searchTerm},slug.ilike.${searchTerm},category.ilike.${searchTerm})`
    : "";
  const select =
    "id,slug,name,subtitle,description,category,status,featured,sort_order,cover_image_url,created_at,updated_at";
  const products = await supabaseRequest(
    `/shop_products?select=${select}${statusFilter}${searchFilter}&order=updated_at.desc,sort_order.asc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const visibleProducts = (products || []).slice(0, limit);
  const productIds = visibleProducts.map((product) => product.id);
  const variantsByProductId = new Map();
  const imagesByProductId = new Map();

  if (productIds.length) {
    const idList = productIds.join(",");
    const [variants, images] = await Promise.all([
      supabaseRequest(
        `/shop_product_variants?select=id,product_id,sku,variant_name,variant_option,image_url,price,compare_at_price,inventory,status,sort_order,created_at,updated_at&product_id=in.(${idList})&order=sort_order.asc,created_at.asc`
      ),
      supabaseRequest(
        `/shop_product_images?select=id,product_id,image_url,alt,sort_order,created_at&product_id=in.(${idList})&order=sort_order.asc,created_at.asc`
      ),
    ]);

    for (const variant of variants || []) {
      const current = variantsByProductId.get(variant.product_id) || [];
      current.push(normalizeVariant(variant));
      variantsByProductId.set(variant.product_id, current);
    }

    for (const image of images || []) {
      const current = imagesByProductId.get(image.product_id) || [];
      current.push(normalizeImage(image));
      imagesByProductId.set(image.product_id, current);
    }
  }

  const hasMore = (products || []).length > limit;

  return sendJson(res, 200, {
    products: visibleProducts.map((product) =>
      normalizeProductSummary(product, variantsByProductId, imagesByProductId)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

async function loadProductById(productId) {
  const products = await supabaseRequest(
    `/shop_products?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`
  );
  const product = products?.[0];

  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }

  const [variants, images] = await Promise.all([
    supabaseRequest(
      `/shop_product_variants?product_id=eq.${encodeURIComponent(
        product.id
      )}&select=*&order=sort_order.asc,created_at.asc`
    ),
    supabaseRequest(
      `/shop_product_images?product_id=eq.${encodeURIComponent(
        product.id
      )}&select=*&order=sort_order.asc,created_at.asc`
    ),
  ]);

  return normalizeProduct(product, variants || [], images || []);
}

function validateProductPatch(product) {
  const id = cleanText(product?.id);
  const name = cleanText(product?.name);
  const slug = cleanText(product?.slug);
  const category = cleanText(product?.category);
  const status = cleanText(product?.status);

  if (!id) {
    const error = new Error("Product id is required.");
    error.status = 400;
    throw error;
  }

  if (!name || !slug || !category) {
    const error = new Error("Product name, slug, and category are required.");
    error.status = 400;
    throw error;
  }

  if (!validProductStatuses.has(status)) {
    const error = new Error("Invalid product status.");
    error.status = 400;
    throw error;
  }

  return {
    id,
    patch: {
      name,
      slug,
      subtitle: nullableText(product.subtitle),
      description: nullableText(product.description),
      category,
      status,
      featured: Boolean(product.featured),
      sort_order: getInteger(product.sort_order, 0),
      cover_image_url: nullableText(product.cover_image_url),
      updated_at: new Date().toISOString(),
    },
  };
}

async function ensureUniqueSlug(slug) {
  const existingProducts = await supabaseRequest(
    `/shop_products?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`
  );

  if (existingProducts?.length) {
    const error = new Error("Product slug already exists.");
    error.status = 409;
    throw error;
  }
}

function validateProductCreate(product) {
  const name = cleanText(product?.name);
  const slug = cleanText(product?.slug);
  const category = cleanText(product?.category);
  const status = cleanText(product?.status || "draft");

  if (!name || !slug || !category) {
    const error = new Error("Product name, slug, and category are required.");
    error.status = 400;
    throw error;
  }

  if (!validProductStatuses.has(status)) {
    const error = new Error("Invalid product status.");
    error.status = 400;
    throw error;
  }

  return {
    name,
    slug,
    subtitle: nullableText(product.subtitle),
    description: nullableText(product.description),
    category,
    status,
    featured: Boolean(product.featured),
    sort_order: getInteger(product.sort_order, 0),
    cover_image_url: nullableText(product.cover_image_url),
  };
}

function buildVariantPatch(variant) {
  const status = cleanText(variant?.status || "active");
  const variantName = cleanText(variant?.variant_name);
  const price = getInteger(variant?.price, 0);
  const inventory = getInteger(variant?.inventory, 0);
  const compareAtPrice =
    variant?.compare_at_price === null ||
    variant?.compare_at_price === undefined ||
    cleanText(variant.compare_at_price) === ""
      ? null
      : getInteger(variant.compare_at_price, 0);

  if (!variantName) {
    const error = new Error("Variant name is required.");
    error.status = 400;
    throw error;
  }

  if (!validVariantStatuses.has(status)) {
    const error = new Error("Invalid variant status.");
    error.status = 400;
    throw error;
  }

  if (price < 0 || inventory < 0 || (compareAtPrice !== null && compareAtPrice < 0)) {
    const error = new Error("Variant price and inventory must be greater than or equal to 0.");
    error.status = 400;
    throw error;
  }

  return {
    sku: nullableText(variant.sku),
    variant_name: variantName,
    variant_option: nullableText(variant.variant_option),
    image_url: nullableText(variant.image_url),
    price,
    compare_at_price: compareAtPrice,
    inventory,
    status,
    sort_order: getInteger(variant.sort_order, 0),
    updated_at: new Date().toISOString(),
  };
}

function buildVariantCreate(variant, productId) {
  return {
    product_id: productId,
    ...buildVariantPatch(variant),
  };
}

function buildImagePatch(image) {
  const imageUrl = cleanText(image?.image_url);

  if (!imageUrl) {
    const error = new Error("Image URL is required.");
    error.status = 400;
    throw error;
  }

  return {
    image_url: imageUrl,
    alt: nullableText(image.alt),
    sort_order: getInteger(image.sort_order, 0),
  };
}

function buildImageCreate(image, productId) {
  return {
    product_id: productId,
    ...buildImagePatch(image),
  };
}

async function updateProduct(req, res) {
  const body = await readBody(req);
  const { id: productId, patch } = validateProductPatch(body?.product || {});
  const variants = Array.isArray(body?.variants) ? body.variants : [];
  const images = Array.isArray(body?.images) ? body.images : [];

  await supabaseRequest(`/shop_products?id=eq.${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  for (const variant of variants) {
    const variantId = cleanText(variant?.id);
    if (!variantId) continue;

    await supabaseRequest(
      `/shop_product_variants?id=eq.${encodeURIComponent(
        variantId
      )}&product_id=eq.${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(buildVariantPatch(variant)),
      }
    );
  }

  for (const image of images) {
    const imageId = cleanText(image?.id);
    if (!imageId) continue;

    await supabaseRequest(
      `/shop_product_images?id=eq.${encodeURIComponent(
        imageId
      )}&product_id=eq.${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(buildImagePatch(image)),
      }
    );
  }

  return sendJson(res, 200, { product: await loadProductById(productId) });
}

async function archiveIncompleteProduct(productId) {
  try {
    await supabaseRequest(`/shop_products?id=eq.${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "archived",
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (archiveError) {
    console.error("failed to archive incomplete product:", archiveError);
  }
}

async function createProduct(req, res) {
  const body = await readBody(req);
  const productPayload = validateProductCreate(body?.product || {});
  const variants = Array.isArray(body?.variants) ? body.variants : [];
  const images = Array.isArray(body?.images) ? body.images : [];

  if (!variants.length) {
    return sendJson(res, 400, { error: "At least one product variant is required." });
  }

  if (!images.length) {
    return sendJson(res, 400, { error: "At least one product image is required." });
  }

  await ensureUniqueSlug(productPayload.slug);

  const createdProducts = await supabaseRequest("/shop_products", {
    method: "POST",
    body: JSON.stringify(productPayload),
  });
  const createdProduct = createdProducts?.[0];

  if (!createdProduct?.id) {
    const error = new Error("Product create failed.");
    error.status = 500;
    throw error;
  }

  try {
    await supabaseRequest("/shop_product_variants", {
      method: "POST",
      body: JSON.stringify(
        variants.map((variant) => buildVariantCreate(variant, createdProduct.id))
      ),
    });

    await supabaseRequest("/shop_product_images", {
      method: "POST",
      body: JSON.stringify(
        images.map((image) => buildImageCreate(image, createdProduct.id))
      ),
    });
  } catch (detailError) {
    await archiveIncompleteProduct(createdProduct.id);
    const error = new Error(
      `Product details create failed. The product was archived. ${detailError.message || ""}`.trim()
    );
    error.status = 500;
    throw error;
  }

  return sendJson(res, 201, { product: await loadProductById(createdProduct.id) });
}

async function handleProductAction(req, res) {
  if (req.method === "GET") {
    const productId = cleanText(firstQueryValue(req.query?.id));
    if (!productId) {
      return sendJson(res, 400, { error: "Product id is required." });
    }

    return sendJson(res, 200, { product: await loadProductById(productId) });
  }

  if (req.method === "PATCH") {
    return updateProduct(req, res);
  }

  if (req.method === "POST") {
    return createProduct(req, res);
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return sendJson(res, 405, { error: "Method not allowed." });
}

async function loadInventoryMovements(req, res) {
  const productId = cleanText(firstQueryValue(req.query?.productId));
  const variantId = cleanText(firstQueryValue(req.query?.variantId));
  const movementType = cleanText(firstQueryValue(req.query?.movementType));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const page = getPage(firstQueryValue(req.query?.page));
  const offset = page * limit;
  const productFilter = productId
    ? `&product_id=eq.${encodeURIComponent(productId)}`
    : "";
  const variantFilter = variantId
    ? `&variant_id=eq.${encodeURIComponent(variantId)}`
    : "";
  const typeFilter =
    movementType && validInventoryMovementTypes.has(movementType)
      ? `&movement_type=eq.${encodeURIComponent(movementType)}`
      : "";
  const select =
    "id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_number,note,created_at,created_by";
  const movements = await supabaseRequest(
    `/shop_inventory_movements?select=${select}${productFilter}${variantFilter}${typeFilter}&order=created_at.desc&limit=${
      limit + 1
    }&offset=${offset}`
  );
  const visibleMovements = (movements || []).slice(0, limit);
  const productIds = [
    ...new Set(visibleMovements.map((movement) => movement.product_id).filter(Boolean)),
  ];
  const variantIds = [
    ...new Set(visibleMovements.map((movement) => movement.variant_id).filter(Boolean)),
  ];
  const productsById = new Map();
  const variantsById = new Map();

  if (productIds.length) {
    const products = await supabaseRequest(
      `/shop_products?select=id,slug,name&id=in.(${productIds.join(",")})`
    );

    for (const product of products || []) {
      productsById.set(product.id, product);
    }
  }

  if (variantIds.length) {
    const variants = await supabaseRequest(
      `/shop_product_variants?select=id,sku,variant_name,variant_option&id=in.(${variantIds.join(",")})`
    );

    for (const variant of variants || []) {
      variantsById.set(variant.id, variant);
    }
  }

  const hasMore = (movements || []).length > limit;

  return sendJson(res, 200, {
    movements: visibleMovements.map((movement) =>
      normalizeInventoryMovement(movement, productsById, variantsById)
    ),
    page,
    limit,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  });
}

async function lookupInventoryBySku(req, res) {
  const sku = cleanText(firstQueryValue(req.query?.sku));

  if (!sku) {
    return sendJson(res, 400, { error: "sku is required." });
  }

  const variants = await supabaseRequest(
    `/shop_product_variants?sku=eq.${encodeURIComponent(sku)}&select=*&limit=2`
  );

  if (!variants?.length) {
    return sendJson(res, 404, { error: "Product variant not found." });
  }

  if (variants.length > 1) {
    return sendJson(res, 409, {
      error: "商品編號重複，請先修正商品資料。",
    });
  }

  const variant = variants[0];
  const products = await supabaseRequest(
    `/shop_products?id=eq.${encodeURIComponent(variant.product_id)}&select=id,slug,name,category,status,cover_image_url&limit=1`
  );
  const product = products?.[0];

  if (!product) {
    return sendJson(res, 404, { error: "Product not found." });
  }

  return sendJson(res, 200, normalizeInventoryLookup(product, variant));
}

async function searchInventory(req, res) {
  const search = cleanText(firstQueryValue(req.query?.q));
  const limit = getPositiveInt(firstQueryValue(req.query?.limit), defaultLimit, maxLimit);
  const searchTerm = encodeURIComponent(`*${search.replace(/[(),]/g, " ")}*`);
  const productSearchFilter = search
    ? `&or=(name.ilike.${searchTerm},slug.ilike.${searchTerm},category.ilike.${searchTerm})`
    : "";
  const variantSearchFilter = search
    ? `&or=(sku.ilike.${searchTerm},variant_name.ilike.${searchTerm},variant_option.ilike.${searchTerm})`
    : "";
  const productMatches = await supabaseRequest(
    `/shop_products?select=id,slug,name,category,status,cover_image_url${productSearchFilter}&order=updated_at.desc&limit=20`
  );
  const variantMatches = await supabaseRequest(
    `/shop_product_variants?select=*&status=eq.active${variantSearchFilter}&order=updated_at.desc&limit=${limit}`
  );
  const productsById = new Map();
  const variantsById = new Map();

  for (const product of productMatches || []) {
    productsById.set(product.id, product);
  }

  for (const variant of variantMatches || []) {
    variantsById.set(variant.id, variant);
  }

  const productMatchIds = (productMatches || []).map((product) => product.id);
  if (productMatchIds.length) {
    const productVariants = await supabaseRequest(
      `/shop_product_variants?select=*&status=eq.active&product_id=in.(${productMatchIds.join(
        ","
      )})&order=sort_order.asc,created_at.asc`
    );

    for (const variant of productVariants || []) {
      variantsById.set(variant.id, variant);
    }
  }

  const missingProductIds = [
    ...new Set(
      Array.from(variantsById.values())
        .map((variant) => variant.product_id)
        .filter((productId) => productId && !productsById.has(productId))
    ),
  ];

  if (missingProductIds.length) {
    const products = await supabaseRequest(
      `/shop_products?select=id,slug,name,category,status,cover_image_url&id=in.(${missingProductIds.join(
        ","
      )})`
    );

    for (const product of products || []) {
      productsById.set(product.id, product);
    }
  }

  const results = Array.from(variantsById.values())
    .map((variant) => {
      const product = productsById.get(variant.product_id);
      return product ? normalizeInventorySearchItem(product, variant) : null;
    })
    .filter(Boolean)
    .slice(0, limit);

  return sendJson(res, 200, { results });
}

async function handleInventoryAdjustment(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = await readBody(req);
  const variantId = cleanText(body?.variant_id);
  const movementType = cleanText(body?.movement_type);
  const quantity = getRequiredInteger(body?.quantity, "quantity");

  if (!variantId) {
    return sendJson(res, 400, { error: "variant_id is required." });
  }

  if (!["stock_in", "stock_out", "adjustment"].includes(movementType)) {
    return sendJson(res, 400, { error: "Invalid movement_type." });
  }

  if (
    (movementType === "stock_in" || movementType === "stock_out") &&
    quantity <= 0
  ) {
    return sendJson(res, 400, { error: "Quantity must be greater than 0." });
  }

  if (movementType === "adjustment" && quantity < 0) {
    return sendJson(res, 400, { error: "Quantity must be greater than or equal to 0." });
  }

  try {
    const result = await supabaseRpc("adjust_shop_inventory", {
      adjustment_payload: {
        variant_id: variantId,
        movement_type: movementType,
        quantity,
        reference_type: "manual_adjustment",
        reference_number: nullableText(body?.reference_number),
        note: nullableText(body?.note),
        created_by: nullableText(body?.created_by) || "admin",
      },
    });
    const movement = result?.movement || null;

    return sendJson(res, 200, {
      inventory: Number(result?.inventory || 0),
      movement: movement ? normalizeInventoryMovement(movement) : null,
    });
  } catch (rpcError) {
    const knownMessage = getKnownInventoryErrorMessage(rpcError);
    if (knownMessage) {
      return sendJson(res, 409, { error: knownMessage });
    }

    throw rpcError;
  }
}

function normalizeManualSaleItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      variant_id: cleanText(item?.variant_id),
      quantity: getInteger(item?.quantity, 0),
    }))
    .filter((item) => item.variant_id && item.quantity > 0);
}

async function handleManualSale(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const body = await readBody(req);
  const paymentMethod = cleanText(body?.payment_method || "cash");
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = normalizeManualSaleItems(rawItems);

  if (!validPosPaymentMethods.has(paymentMethod)) {
    return sendJson(res, 400, { error: "Invalid payment_method." });
  }

  if (!items.length || items.length !== rawItems.length) {
    return sendJson(res, 400, { error: "At least one sale item is required." });
  }

  try {
    const order = await supabaseRpc("create_manual_sale_order", {
      sale_payload: {
        payment_method: paymentMethod,
        note: nullableText(body?.note) || "現場銷售",
        items,
      },
    });

    return sendJson(res, 201, { order });
  } catch (rpcError) {
    const knownMessage = getKnownManualSaleErrorMessage(rpcError);
    if (knownMessage) {
      return sendJson(res, 409, { error: knownMessage });
    }

    throw rpcError;
  }
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNonNegativeInteger(value) {
  return Math.max(0, Math.trunc(parseNumber(value, 0)));
}

function normalizeOptionalText(value) {
  const text = cleanText(value);
  return text || null;
}

function getWarehousePublicBaseUrl(baseUrl, key) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(key)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function getWarehouseTaipeiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getWarehouseR2Config() {
  const bucketName = cleanText(getServerEnv("R2_BUCKET_NAME"));
  const accessKeyId = cleanText(getServerEnv("R2_ACCESS_KEY_ID"));
  const secretAccessKey = cleanText(getServerEnv("R2_SECRET_ACCESS_KEY"));
  const endpoint = cleanText(getServerEnv("R2_ENDPOINT"));
  const publicBaseUrl = cleanText(getServerEnv("R2_PUBLIC_BASE_URL"));

  if (!bucketName || !accessKeyId || !secretAccessKey || !endpoint || !publicBaseUrl) {
    const error = new Error("R2 environment variables are not configured.");
    error.status = 500;
    throw error;
  }

  return {
    bucketName,
    publicBaseUrl,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

function warehouseMediaPrefix(targetType, targetId) {
  if (targetType === "supply") return `warehouse/supplies/${targetId}`;
  if (targetType === "furniture") return `warehouse/assets/${targetId}`;
  return `warehouse/housekeeping/${targetId}`;
}

async function assertWarehouseMediaTargetExists(targetType, targetId) {
  const tableByTargetType = {
    supply: "shop_supply_items",
    furniture: "shop_furniture_assets",
    housekeeping: "shop_housekeeping_records",
  };
  const table = tableByTargetType[targetType];
  if (!table || !targetId) {
    const error = new Error("照片對應資料不正確。");
    error.status = 400;
    throw error;
  }

  const rows = await supabaseRequest(
    `/${table}?id=eq.${encodeURIComponent(targetId)}&select=id&limit=1`
  );
  if (!Array.isArray(rows) || !rows.length) {
    const error = new Error("找不到照片對應的資料，請先儲存資料後再上傳照片。");
    error.status = 404;
    throw error;
  }
}

async function loadWarehouseMediaForTargets(targetType, targetIds) {
  const ids = [...new Set(targetIds.filter(Boolean))];
  if (!ids.length) return {};

  const rows = await supabaseRequest(
    `/shop_warehouse_media?target_type=eq.${encodeURIComponent(targetType)}&target_id=in.(${ids.join(",")})&select=*&order=sort_order.asc,created_at.asc`
  );

  return (Array.isArray(rows) ? rows : []).reduce((acc, media) => {
    const key = media.target_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(media);
    return acc;
  }, {});
}

function attachWarehouseMedia(rows, mediaById) {
  return rows.map((row) => {
    const media = mediaById[row.id] || [];
    return {
      ...row,
      media,
      main_media: media[0] || null,
    };
  });
}

async function loadWarehouseLocations(req, res) {
  const locations = await supabaseRequest(
    "/shop_warehouse_locations?select=*&order=sort_order.asc"
  );
  return sendJson(res, 200, { locations });
}

async function loadWarehouseDashboard(req, res) {
  const supplies = await supabaseRequest(
    "/shop_supply_items?select=id,quantity,safety_stock"
  );
  const items = Array.isArray(supplies) ? supplies : [];
  const lowStockCount = items.filter(
    (item) => Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.safety_stock)
  ).length;
  const outOfStockCount = items.filter((item) => Number(item.quantity) <= 0).length;
  return sendJson(res, 200, {
    lowStockCount,
    outOfStockCount,
    supplyCount: items.length,
  });
}

function filterWarehouseSupplies(items, { status = "", location = "", q = "" }) {
  const keyword = q.toLowerCase();
  return items.filter((item) => {
    const quantity = Number(item.quantity || 0);
    const safety = Number(item.safety_stock || 0);
    const matchesStatus =
      !status ||
      status === "all" ||
      (status === "low" && quantity > 0 && quantity <= safety) ||
      (status === "out" && quantity <= 0);
    const matchesLocation = !location || location === "all" || item.location_code === location;
    const matchesKeyword =
      !keyword ||
      [item.name, item.brand_spec, item.supplier, item.note]
        .some((value) => cleanText(value).toLowerCase().includes(keyword));

    return matchesStatus && matchesLocation && matchesKeyword;
  });
}

async function loadWarehouseSupplies(req, res) {
  const id = cleanText(firstQueryValue(req.query?.id));
  if (id) {
    const rows = await supabaseRequest(
      `/shop_supply_items?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    const item = Array.isArray(rows) ? rows[0] : null;
    if (!item) return sendJson(res, 404, { error: "找不到這筆備品。" });
    const mediaById = await loadWarehouseMediaForTargets("supply", [item.id]);
    return sendJson(res, 200, { item: attachWarehouseMedia([item], mediaById)[0] });
  }

  const rows = await supabaseRequest(
    "/shop_supply_items?select=*&order=updated_at.desc&limit=500"
  );
  const filtered = filterWarehouseSupplies(Array.isArray(rows) ? rows : [], {
    status: cleanText(firstQueryValue(req.query?.status)),
    location: cleanText(firstQueryValue(req.query?.location)),
    q: cleanText(firstQueryValue(req.query?.q)),
  });
  const mediaById = await loadWarehouseMediaForTargets("supply", filtered.map((item) => item.id));
  return sendJson(res, 200, { items: attachWarehouseMedia(filtered, mediaById) });
}

function normalizeSupplyPayload(body) {
  const locationCode = cleanText(body?.location_code);
  if (!warehouseLocationCodeSet.has(locationCode)) {
    const error = new Error("存放位置不正確。");
    error.status = 400;
    throw error;
  }

  return {
    name: cleanText(body?.name),
    brand_spec: normalizeOptionalText(body?.brand_spec),
    quantity: clampNonNegativeInteger(body?.quantity),
    safety_stock: clampNonNegativeInteger(body?.safety_stock),
    location_code: locationCode,
    unit_price: body?.unit_price === "" || body?.unit_price == null ? null : parseNumber(body?.unit_price, 0),
    supplier: normalizeOptionalText(body?.supplier),
    note: normalizeOptionalText(body?.note),
    updated_at: new Date().toISOString(),
  };
}

async function deleteWarehouseMediaRows(rows) {
  if (!rows.length) return;
  const { bucketName, client } = getWarehouseR2Config();
  try {
    await Promise.all(
      rows.map((media) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: media.r2_key,
          })
        )
      )
    );
  } catch {
    const error = new Error("R2 圖片刪除失敗，資料尚未刪除。");
    error.status = 502;
    throw error;
  }
}

async function deleteWarehouseRecord({ table, targetType, id }) {
  const mediaRows = await supabaseRequest(
    `/shop_warehouse_media?target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(id)}&select=*`
  );
  await deleteWarehouseMediaRows(Array.isArray(mediaRows) ? mediaRows : []);
  await supabaseRequest(
    `/shop_warehouse_media?target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  await supabaseRequest(`/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

async function handleWarehouseSupply(req, res) {
  if (req.method === "GET") return await loadWarehouseSupplies(req, res);

  if (req.method === "POST") {
    const body = await readBody(req);
    const payload = normalizeSupplyPayload(body);
    if (!payload.name) return sendJson(res, 400, { error: "請輸入品名。" });
    const created = await supabaseRequest("/shop_supply_items", {
      method: "POST",
      body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
    });
    return sendJson(res, 201, { item: created?.[0] || null });
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    const id = cleanText(body?.id);
    if (!id) return sendJson(res, 400, { error: "缺少備品 ID。" });
    const payload = normalizeSupplyPayload(body);
    if (!payload.name) return sendJson(res, 400, { error: "請輸入品名。" });
    const updated = await supabaseRequest(`/shop_supply_items?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return sendJson(res, 200, { item: updated?.[0] || null });
  }

  if (req.method === "DELETE") {
    const id = cleanText(firstQueryValue(req.query?.id));
    if (!id) return sendJson(res, 400, { error: "缺少備品 ID。" });
    await deleteWarehouseRecord({ table: "shop_supply_items", targetType: "supply", id });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

async function handleWarehouseSupplyQuantity(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
  const body = await readBody(req);
  const id = cleanText(body?.id);
  const delta = Math.trunc(parseNumber(body?.delta, 0));
  if (!id || !delta) return sendJson(res, 400, { error: "缺少調整資料。" });

  const rows = await supabaseRequest(
    `/shop_supply_items?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  );
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) return sendJson(res, 404, { error: "找不到這筆備品。" });

  const quantity = Math.max(0, Number(item.quantity || 0) + delta);
  const updated = await supabaseRequest(`/shop_supply_items?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity, updated_at: new Date().toISOString() }),
  });

  return sendJson(res, 200, { item: updated?.[0] || null });
}

function filterWarehouseFurniture(items, q = "") {
  const keyword = q.toLowerCase();
  if (!keyword) return items;
  return items.filter((item) =>
    [item.asset_name, item.asset_number, item.room_area]
      .some((value) => cleanText(value).toLowerCase().includes(keyword))
  );
}

function normalizeFurniturePayload(body) {
  return {
    asset_name: cleanText(body?.asset_name),
    asset_number: cleanText(body?.asset_number),
    original_amount: body?.original_amount === "" || body?.original_amount == null ? null : parseNumber(body?.original_amount, 0),
    room_area: normalizeOptionalText(body?.room_area),
    brand_model: normalizeOptionalText(body?.brand_model),
    vendor: normalizeOptionalText(body?.vendor),
    note: normalizeOptionalText(body?.note),
    updated_at: new Date().toISOString(),
  };
}

async function loadWarehouseFurniture(req, res) {
  const id = cleanText(firstQueryValue(req.query?.id));
  if (id) {
    const rows = await supabaseRequest(
      `/shop_furniture_assets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    const asset = Array.isArray(rows) ? rows[0] : null;
    if (!asset) return sendJson(res, 404, { error: "找不到這筆傢俱資產。" });
    const mediaById = await loadWarehouseMediaForTargets("furniture", [asset.id]);
    return sendJson(res, 200, { asset: attachWarehouseMedia([asset], mediaById)[0] });
  }

  const rows = await supabaseRequest(
    "/shop_furniture_assets?select=*&order=updated_at.desc&limit=500"
  );
  const filtered = filterWarehouseFurniture(
    Array.isArray(rows) ? rows : [],
    cleanText(firstQueryValue(req.query?.q))
  );
  const mediaById = await loadWarehouseMediaForTargets("furniture", filtered.map((item) => item.id));
  return sendJson(res, 200, { assets: attachWarehouseMedia(filtered, mediaById) });
}

async function handleWarehouseFurniture(req, res) {
  if (req.method === "GET") return await loadWarehouseFurniture(req, res);

  if (req.method === "POST" || req.method === "PATCH") {
    const body = await readBody(req);
    const payload = normalizeFurniturePayload(body);
    if (!payload.asset_name || !payload.asset_number) {
      return sendJson(res, 400, { error: "請輸入資產名稱與資產編號。" });
    }

    const duplicate = await supabaseRequest(
      `/shop_furniture_assets?asset_number=eq.${encodeURIComponent(payload.asset_number)}&select=id&limit=1`
    );
    const existingId = Array.isArray(duplicate) ? duplicate[0]?.id : "";
    if (existingId && (req.method === "POST" || existingId !== cleanText(body?.id))) {
      return sendJson(res, 409, { error: "資產編號不可重複。" });
    }

    if (req.method === "POST") {
      const created = await supabaseRequest("/shop_furniture_assets", {
        method: "POST",
        body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
      });
      return sendJson(res, 201, { asset: created?.[0] || null });
    }

    const id = cleanText(body?.id);
    if (!id) return sendJson(res, 400, { error: "缺少資產 ID。" });
    const updated = await supabaseRequest(`/shop_furniture_assets?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return sendJson(res, 200, { asset: updated?.[0] || null });
  }

  if (req.method === "DELETE") {
    const id = cleanText(firstQueryValue(req.query?.id));
    if (!id) return sendJson(res, 400, { error: "缺少資產 ID。" });
    await deleteWarehouseRecord({ table: "shop_furniture_assets", targetType: "furniture", id });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

function normalizeHousekeepingPayload(body) {
  const recordType = cleanText(body?.record_type);
  if (!["cleaning_completed", "checkout_issue"].includes(recordType)) {
    const error = new Error("拍攝類型不正確。");
    error.status = 400;
    throw error;
  }

  return {
    order_number: normalizeOptionalText(body?.order_number),
    room_area: cleanText(body?.room_area),
    record_type: recordType,
    captured_at: cleanText(body?.captured_at) || new Date().toISOString(),
    note: normalizeOptionalText(body?.note),
    related_asset_number: normalizeOptionalText(body?.related_asset_number),
    updated_at: new Date().toISOString(),
  };
}

function filterHousekeepingRecords(items, { q = "", type = "", date = "" }) {
  const keyword = q.toLowerCase();
  return items.filter((item) => {
    const matchesKeyword =
      !keyword ||
      [item.order_number, item.room_area, item.note, item.related_asset_number]
        .some((value) => cleanText(value).toLowerCase().includes(keyword));
    const matchesType = !type || type === "all" || item.record_type === type;
    const matchesDate = !date || cleanText(item.captured_at).startsWith(date);
    return matchesKeyword && matchesType && matchesDate;
  });
}

async function loadHousekeepingRecords(req, res) {
  const id = cleanText(firstQueryValue(req.query?.id));
  if (id) {
    const rows = await supabaseRequest(
      `/shop_housekeeping_records?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    const record = Array.isArray(rows) ? rows[0] : null;
    if (!record) return sendJson(res, 404, { error: "找不到這筆房務存證。" });
    const mediaById = await loadWarehouseMediaForTargets("housekeeping", [record.id]);
    return sendJson(res, 200, { record: attachWarehouseMedia([record], mediaById)[0] });
  }

  const rows = await supabaseRequest(
    "/shop_housekeeping_records?select=*&order=captured_at.desc&limit=500"
  );
  const filtered = filterHousekeepingRecords(Array.isArray(rows) ? rows : [], {
    q: cleanText(firstQueryValue(req.query?.q)),
    type: cleanText(firstQueryValue(req.query?.type)),
    date: cleanText(firstQueryValue(req.query?.date)),
  });
  const mediaById = await loadWarehouseMediaForTargets("housekeeping", filtered.map((item) => item.id));
  return sendJson(res, 200, { records: attachWarehouseMedia(filtered, mediaById) });
}

async function handleHousekeepingRecord(req, res) {
  if (req.method === "GET") return await loadHousekeepingRecords(req, res);

  if (req.method === "POST" || req.method === "PATCH") {
    const body = await readBody(req);
    const payload = normalizeHousekeepingPayload(body);
    if (!payload.room_area) return sendJson(res, 400, { error: "請輸入房間／區域。" });

    if (req.method === "POST") {
      const created = await supabaseRequest("/shop_housekeeping_records", {
        method: "POST",
        body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
      });
      return sendJson(res, 201, { record: created?.[0] || null });
    }

    const id = cleanText(body?.id);
    if (!id) return sendJson(res, 400, { error: "缺少房務存證 ID。" });
    const updated = await supabaseRequest(`/shop_housekeeping_records?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return sendJson(res, 200, { record: updated?.[0] || null });
  }

  if (req.method === "DELETE") {
    const id = cleanText(firstQueryValue(req.query?.id));
    if (!id) return sendJson(res, 400, { error: "缺少房務存證 ID。" });
    await deleteWarehouseRecord({ table: "shop_housekeeping_records", targetType: "housekeeping", id });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

async function handleWarehouseMediaUpload(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });

  const body = await readBody(req);
  const targetType = cleanText(body?.targetType);
  const targetId = cleanText(body?.targetId);
  const fileName = cleanText(body?.fileName);
  const contentType = cleanText(body?.contentType).toLowerCase();
  const size = Number(body?.size);
  const fileRule = allowedWarehouseFileTypes.get(contentType);

  if (!warehouseTargetTypes.has(targetType) || !targetId) {
    return sendJson(res, 400, { error: "缺少照片對應資料。" });
  }
  await assertWarehouseMediaTargetExists(targetType, targetId);
  if (!fileName) return sendJson(res, 400, { error: "缺少檔名。" });
  if (!fileRule) return sendJson(res, 400, { error: "只支援 JPG、PNG 或 WebP 圖片。" });
  if (!Number.isFinite(size) || size <= 0 || size > fileRule.maxSize) {
    return sendJson(res, 400, { error: "圖片大小不正確，單張上限 10MB。" });
  }

  const { bucketName, publicBaseUrl, client } = getWarehouseR2Config();
  const key = [
    warehouseMediaPrefix(targetType, targetId),
    getWarehouseTaipeiDate(),
    `${Date.now()}-${randomBytes(8).toString("hex")}.${fileRule.extension}`,
  ].join("/");

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: warehousePresignedUrlExpiresInSeconds }
  );

  return sendJson(res, 200, {
    ok: true,
    uploadUrl,
    fileName,
    contentType,
    size,
    key,
    publicUrl: getWarehousePublicBaseUrl(publicBaseUrl, key),
  });
}

async function handleWarehouseMedia(req, res) {
  if (req.method === "POST") {
    const body = await readBody(req);
    const targetType = cleanText(body?.target_type);
    const targetId = cleanText(body?.target_id);
    if (!warehouseTargetTypes.has(targetType) || !targetId) {
      return sendJson(res, 400, { error: "缺少照片對應資料。" });
    }
    await assertWarehouseMediaTargetExists(targetType, targetId);
    const created = await supabaseRequest("/shop_warehouse_media", {
      method: "POST",
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        r2_key: cleanText(body?.r2_key),
        public_url: cleanText(body?.public_url),
        file_name: normalizeOptionalText(body?.file_name),
        content_type: normalizeOptionalText(body?.content_type),
        size: Number.isFinite(Number(body?.size)) ? Number(body?.size) : null,
        sort_order: Math.trunc(parseNumber(body?.sort_order, 0)),
        metadata: body?.metadata || {},
      }),
    });
    return sendJson(res, 201, { media: created?.[0] || null });
  }

  if (req.method === "DELETE") {
    const id = cleanText(firstQueryValue(req.query?.id));
    if (!id) return sendJson(res, 400, { error: "缺少照片 ID。" });
    const rows = await supabaseRequest(
      `/shop_warehouse_media?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    const media = Array.isArray(rows) ? rows[0] : null;
    if (!media) return sendJson(res, 404, { error: "找不到這張照片。" });
    await deleteWarehouseMediaRows([media]);
    await supabaseRequest(`/shop_warehouse_media?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: "Method not allowed." });
}

export default async function handler(req, res) {
  const action = String(firstQueryValue(req.query?.action) || "").trim();

  try {
    requireAdmin(req);

    if (action === "instagram-oauth-start") {
      return await handleInstagramOAuthStart(req, res);
    }

    if (req.method === "GET" && action === "meta-status") {
      return await loadMetaStatus(req, res);
    }

    if (action === "debug-facebook-token") {
      return await handleDebugFacebookToken(req, res);
    }

    if (action === "publish-facebook-post") {
      return await handlePublishFacebookPost(req, res);
    }

    if (action === "publish-instagram-post") {
      return await handlePublishInstagramPost(req, res);
    }

    if (action === "publish-threads-post") {
      return await handlePublishThreadsPost(req, res);
    }

    if (action === "social-posts-sync") {
      return await handleSocialPostsSync(req, res);
    }

    if (req.method === "GET" && action === "social-posts") {
      return await loadSocialPosts(req, res);
    }

    if (action === "sync-facebook-post") {
      return await handleSyncFacebookPost(req, res);
    }

    if (action === "delete-facebook-post") {
      return await handleDeleteFacebookPost(req, res);
    }

    if (action === "exchange-meta-token") {
      return await handleExchangeMetaToken(req, res);
    }

    if (req.method === "GET" && action === "dashboard") {
      return await loadDashboard(req, res);
    }

    if (req.method === "GET" && action === "orders") {
      return await loadOrders(req, res);
    }

    if (req.method === "GET" && action === "order-items-export") {
      return await loadOrderItemsExport(req, res);
    }

    if (action === "order") {
      return await handleOrderAction(req, res);
    }

    if (req.method === "GET" && action === "products") {
      return await loadProducts(req, res);
    }

    if (action === "product") {
      return await handleProductAction(req, res);
    }

    if (req.method === "GET" && action === "inventory-movements") {
      return await loadInventoryMovements(req, res);
    }

    if (req.method === "GET" && action === "inventory-lookup") {
      return await lookupInventoryBySku(req, res);
    }

    if (req.method === "GET" && action === "inventory-search") {
      return await searchInventory(req, res);
    }

    if (action === "inventory-adjust") {
      return await handleInventoryAdjustment(req, res);
    }

    if (action === "manual-sale") {
      return await handleManualSale(req, res);
    }

    if (req.method === "GET" && action === "warehouse-dashboard") {
      return await loadWarehouseDashboard(req, res);
    }

    if (req.method === "GET" && action === "warehouse-locations") {
      return await loadWarehouseLocations(req, res);
    }

    if (action === "warehouse-supply") {
      return await handleWarehouseSupply(req, res);
    }

    if (action === "warehouse-supply-quantity") {
      return await handleWarehouseSupplyQuantity(req, res);
    }

    if (action === "warehouse-furniture-asset") {
      return await handleWarehouseFurniture(req, res);
    }

    if (action === "warehouse-housekeeping-record") {
      return await handleHousekeepingRecord(req, res);
    }

    if (action === "warehouse-media-upload") {
      return await handleWarehouseMediaUpload(req, res);
    }

    if (action === "warehouse-media") {
      return await handleWarehouseMedia(req, res);
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return sendJson(res, 405, { error: "Method or action not allowed." });
  } catch (error) {
    console.error("admin shop api error:", error);
    return sendJson(res, error.status || 500, {
      error:
        error.status === 401
          ? "Unauthorized."
          : error.status === 400 || error.status === 404 || error.status === 409
            ? error.message
            : "Admin shop request failed.",
    });
  }
}
