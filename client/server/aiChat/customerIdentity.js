const supabaseTimeoutMs = 8000;

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing for AI chat customer identity");
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    serviceRoleKey,
  };
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), supabaseTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyAccessToken(accessToken) {
  if (!accessToken) {
    return null;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user?.id ? user : null;
}

async function supabaseRequest(path) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Supabase request failed: ${response.status}`);
  }

  return data;
}

async function getCustomerProfile(authUserId) {
  if (!authUserId) {
    return null;
  }

  const rows = await supabaseRequest(
    `/shop_customer_profiles?auth_user_id=eq.${encodeURIComponent(
      authUserId
    )}&is_active=eq.true&select=id,auth_user_id,email,name,is_active&limit=1`
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function resolveCustomerIdentity(req) {
  const accessToken = getBearerToken(req);
  const authUser = await verifyAccessToken(accessToken);

  if (!authUser?.id) {
    return null;
  }

  const profile = await getCustomerProfile(authUser.id);

  if (!profile) {
    return null;
  }

  return {
    authUserId: authUser.id,
    customerProfileId: profile.id || null,
    customerEmail: String(profile.email || authUser.email || "").toLowerCase(),
    customerName: profile.name || "",
  };
}

export function buildCustomerSessionPatch(customerIdentity, session = {}) {
  if (!customerIdentity?.authUserId) {
    return {};
  }

  const patch = {
    auth_user_id: customerIdentity.authUserId,
    customer_profile_id: customerIdentity.customerProfileId || null,
    customer_email: customerIdentity.customerEmail || null,
  };

  if (!session.linked_at) {
    patch.linked_at = new Date().toISOString();
  }

  return patch;
}

export function isSessionOwnedByCustomer(session, customerIdentity) {
  return Boolean(
    session?.auth_user_id &&
      customerIdentity?.authUserId &&
      String(session.auth_user_id) === String(customerIdentity.authUserId)
  );
}
