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

function logCallbackStage(stage, details = {}) {
  console.info("[instagram-oauth-callback]", {
    stage,
    ...details,
  });
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

async function fetchInstagramProfile(accessToken) {
  const url = new URL("https://graph.instagram.com/v25.0/me");
  url.searchParams.set("fields", "user_id,username,name,account_type");
  url.searchParams.set("access_token", accessToken);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    logCallbackStage("instagram_me", { httpStatus: null });
    return { ok: false, profile: null };
  }

  logCallbackStage("instagram_me", { httpStatus: response.status });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, profile: null };
  }

  const profile = normalizeProfile(payload);
  if (!profile.userId || !profile.username) {
    return { ok: false, profile: null };
  }

  return { ok: true, profile };
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
    return redirectResult(res, "failed", "method_not_allowed");
  }

  const code = cleanText(firstQueryValue(req.query?.code)).replace(/#_$/, "");
  const state = cleanText(firstQueryValue(req.query?.state));
  const oauthError = cleanText(firstQueryValue(req.query?.error));
  const oauthErrorDescription = cleanText(
    firstQueryValue(req.query?.error_description)
  );
  const storedState = cleanText(parseCookies(req)[stateCookieName]);

  logCallbackStage("callback_received", {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasStateCookie: Boolean(storedState),
  });

  if (oauthError || oauthErrorDescription) {
    return redirectResult(
      res,
      "failed",
      "authorization_denied"
    );
  }

  if (!code) {
    return redirectResult(res, "failed", "missing_code");
  }

  if (!state) {
    return redirectResult(res, "failed", "missing_state");
  }

  if (!storedState) {
    return redirectResult(res, "failed", "state_cookie_missing");
  }

  const stateIsValid = stateMatches(storedState, state);
  logCallbackStage("state_validation", { matched: stateIsValid });
  if (!stateIsValid) {
    return redirectResult(res, "failed", "state_mismatch");
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
      "oauth_not_configured"
    );
  }

  const shortTokenForm = new URLSearchParams();
  shortTokenForm.set("client_id", appId);
  shortTokenForm.set("client_secret", appSecret);
  shortTokenForm.set("grant_type", "authorization_code");
  shortTokenForm.set("redirect_uri", redirectUri);
  shortTokenForm.set("code", code);

  let shortTokenResponse;
  try {
    shortTokenResponse = await fetch(
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
  } catch {
    logCallbackStage("short_token_exchange", { httpStatus: null });
    return redirectResult(
      res,
      "failed",
      "short_token_exchange_failed"
    );
  }

  logCallbackStage("short_token_exchange", {
    httpStatus: shortTokenResponse.status,
  });
  const shortTokenPayload = await shortTokenResponse
    .json()
    .catch(() => null);
  const shortTokenData = Array.isArray(shortTokenPayload?.data)
    ? shortTokenPayload.data[0]
    : shortTokenPayload;
  const shortLivedToken = cleanText(shortTokenData?.access_token);
  if (!shortTokenResponse.ok || !shortLivedToken) {
    return redirectResult(
      res,
      "failed",
      "short_token_exchange_failed"
    );
  }

  const longTokenUrl = new URL(
    "https://graph.instagram.com/access_token"
  );
  longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
  longTokenUrl.searchParams.set("client_secret", appSecret);
  longTokenUrl.searchParams.set("access_token", shortLivedToken);

  let longTokenResponse;
  try {
    longTokenResponse = await fetch(longTokenUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    logCallbackStage("long_token_exchange", { httpStatus: null });
    return redirectResult(
      res,
      "failed",
      "long_token_exchange_failed"
    );
  }

  logCallbackStage("long_token_exchange", {
    httpStatus: longTokenResponse.status,
  });
  const longTokenPayload = await longTokenResponse
    .json()
    .catch(() => null);
  const longLivedToken = cleanText(longTokenPayload?.access_token);
  const expiresIn = Number(longTokenPayload?.expires_in || 0);
  if (!longTokenResponse.ok || !longLivedToken) {
    return redirectResult(
      res,
      "failed",
      "long_token_exchange_failed"
    );
  }

  const profileResult = await fetchInstagramProfile(longLivedToken);
  if (!profileResult.ok || !profileResult.profile) {
    return redirectResult(res, "failed", "instagram_me_failed");
  }

  const profile = profileResult.profile;
  if (profile.username.toLowerCase() !== expectedUsername) {
    return redirectResult(res, "failed", "username_mismatch");
  }

  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

  try {
    await saveCredential({
      profile,
      accessToken: longLivedToken,
      expiresAt,
      grantedScopes: normalizeScopes(shortTokenData?.permissions),
    });
    logCallbackStage("credential_save", { succeeded: true });
  } catch {
    logCallbackStage("credential_save", { succeeded: false });
    return redirectResult(
      res,
      "failed",
      "credential_save_failed"
    );
  }

  return redirectResult(res, "success");
}
