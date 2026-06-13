import { timingSafeEqual } from "node:crypto";
import {
  firstQueryValue,
  getServerEnv,
  supabaseRequest,
} from "../server/shopShared.js";

const stateCookieName = "mumbao_instagram_oauth_state";
const expectedUsername = "mumbao.tw";
const redirectUri = "https://mumbao.tw/api/instagram-oauth-callback";
const socialPageUrl = "https://mumbao.tw/admin/shop/social";

function cleanText(value) {
  return String(value ?? "").trim();
}

function parseCookies(req) {
  const cookies = {};
  const cookieHeader = String(req.headers?.cookie || "");

  for (const entry of cookieHeader.split(";")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) continue;

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!name) continue;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

function clearStateCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${stateCookieName}=; Path=/api; Domain=mumbao.tw; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function stateMatches(expected, received) {
  const expectedBuffer = Buffer.from(cleanText(expected));
  const receivedBuffer = Buffer.from(cleanText(received));

  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function redirectResult(res, status, reason = "") {
  const target = new URL(socialPageUrl);
  target.searchParams.set("instagram_oauth", status);
  if (reason) target.searchParams.set("reason", reason);

  res.statusCode = 302;
  res.setHeader("Location", target.toString());
  res.end();
}

function normalizeProfile(payload) {
  const profile = Array.isArray(payload?.data) ? payload.data[0] : payload;
  return {
    userId: cleanText(profile?.user_id || profile?.id),
    username: cleanText(profile?.username),
    name: cleanText(profile?.name),
    accountType: cleanText(profile?.account_type),
  };
}

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.map((scope) => cleanText(scope)).filter(Boolean);
  }

  return cleanText(value)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function safeMetaReason(status, payload) {
  const code = Number(payload?.error?.code || 0);
  if (code === 190 || status === 401) return "INSTAGRAM_TOKEN_INVALID";
  if (code === 10 || code === 200 || status === 403) {
    return "INSTAGRAM_PERMISSION_DENIED";
  }
  return "INSTAGRAM_META_REQUEST_FAILED";
}

async function fetchInstagramProfile(accessToken) {
  const url = new URL("https://graph.instagram.com/v25.0/me");
  url.searchParams.set("fields", "user_id,username,name,account_type");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("Instagram profile request failed.");
    error.safeReason = safeMetaReason(response.status, payload);
    throw error;
  }

  const profile = normalizeProfile(payload);
  if (!profile.userId || !profile.username) {
    const error = new Error("Instagram profile is incomplete.");
    error.safeReason = "INSTAGRAM_PROFILE_INCOMPLETE";
    throw error;
  }

  return profile;
}

async function saveCredential({
  profile,
  accessToken,
  expiresAt,
  grantedScopes,
}) {
  const now = new Date().toISOString();
  await supabaseRequest(
    "/shop_social_platform_credentials?on_conflict=platform",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        platform: "instagram",
        external_user_id: profile.userId,
        username: profile.username,
        account_name: profile.name || null,
        account_type: profile.accountType || null,
        access_token: accessToken,
        token_expires_at: expiresAt,
        granted_scopes: grantedScopes,
        updated_at: now,
      }),
    }
  );
}

export default async function handler(req, res) {
  clearStateCookie(res);

  if (req.method !== "GET") {
    return redirectResult(res, "failed", "METHOD_NOT_ALLOWED");
  }

  const code = cleanText(firstQueryValue(req.query?.code)).replace(/#_$/, "");
  const state = cleanText(firstQueryValue(req.query?.state));
  const oauthError = cleanText(firstQueryValue(req.query?.error));
  const oauthErrorDescription = cleanText(
    firstQueryValue(req.query?.error_description)
  );
  const storedState = cleanText(parseCookies(req)[stateCookieName]);

  if (oauthError || oauthErrorDescription) {
    return redirectResult(
      res,
      "failed",
      "INSTAGRAM_AUTHORIZATION_DENIED"
    );
  }

  if (!stateMatches(storedState, state)) {
    return redirectResult(
      res,
      "failed",
      "INSTAGRAM_OAUTH_STATE_INVALID"
    );
  }

  if (!code) {
    return redirectResult(
      res,
      "failed",
      "INSTAGRAM_AUTHORIZATION_CODE_MISSING"
    );
  }

  const appId = cleanText(getServerEnv("INSTAGRAM_APP_ID"));
  const appSecret = cleanText(getServerEnv("INSTAGRAM_APP_SECRET"));
  const configuredRedirectUri = cleanText(
    getServerEnv("INSTAGRAM_REDIRECT_URI")
  );
  if (
    !appId ||
    !appSecret ||
    configuredRedirectUri !== redirectUri
  ) {
    return redirectResult(
      res,
      "failed",
      "INSTAGRAM_OAUTH_NOT_CONFIGURED"
    );
  }

  try {
    const shortTokenForm = new URLSearchParams();
    shortTokenForm.set("client_id", appId);
    shortTokenForm.set("client_secret", appSecret);
    shortTokenForm.set("grant_type", "authorization_code");
    shortTokenForm.set("redirect_uri", redirectUri);
    shortTokenForm.set("code", code);

    const shortTokenResponse = await fetch(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: shortTokenForm,
        signal: AbortSignal.timeout(15000),
      }
    );
    const shortTokenPayload = await shortTokenResponse
      .json()
      .catch(() => null);
    if (!shortTokenResponse.ok) {
      return redirectResult(
        res,
        "failed",
        safeMetaReason(shortTokenResponse.status, shortTokenPayload)
      );
    }

    const shortTokenData = Array.isArray(shortTokenPayload?.data)
      ? shortTokenPayload.data[0]
      : shortTokenPayload;
    const shortLivedToken = cleanText(shortTokenData?.access_token);
    if (!shortLivedToken) {
      return redirectResult(
        res,
        "failed",
        "INSTAGRAM_SHORT_TOKEN_MISSING"
      );
    }

    const longTokenUrl = new URL(
      "https://graph.instagram.com/access_token"
    );
    longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("access_token", shortLivedToken);

    const longTokenResponse = await fetch(longTokenUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const longTokenPayload = await longTokenResponse
      .json()
      .catch(() => null);
    if (!longTokenResponse.ok) {
      return redirectResult(
        res,
        "failed",
        safeMetaReason(longTokenResponse.status, longTokenPayload)
      );
    }

    const longLivedToken = cleanText(longTokenPayload?.access_token);
    const expiresIn = Number(longTokenPayload?.expires_in || 0);
    if (!longLivedToken) {
      return redirectResult(
        res,
        "failed",
        "INSTAGRAM_LONG_TOKEN_MISSING"
      );
    }

    const profile = await fetchInstagramProfile(longLivedToken);
    if (profile.username.toLowerCase() !== expectedUsername) {
      return redirectResult(
        res,
        "failed",
        "INSTAGRAM_USERNAME_MISMATCH"
      );
    }

    const expiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    await saveCredential({
      profile,
      accessToken: longLivedToken,
      expiresAt,
      grantedScopes: normalizeScopes(shortTokenData?.permissions),
    });

    return redirectResult(res, "success");
  } catch (error) {
    return redirectResult(
      res,
      "failed",
      cleanText(error?.safeReason) || "INSTAGRAM_OAUTH_FAILED"
    );
  }
}
