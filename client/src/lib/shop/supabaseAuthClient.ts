type SupabaseAuthError = Error & {
  status?: number;
  code?: string;
};

function createAuthError(message: string, status?: number, code?: string): SupabaseAuthError {
  const error = new Error(message) as SupabaseAuthError;
  error.status = status;
  error.code = code;
  return error;
}

function getSupabasePublicConfig() {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !anonKey) {
    throw createAuthError(
      "Supabase public Auth config is missing.",
      500,
      "missing_public_config"
    );
  }

  return {
    supabaseUrl: String(supabaseUrl).replace(/\/$/, ""),
    anonKey: String(anonKey),
  };
}

async function parseAuthResponse(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    msg?: string;
    message?: string;
  };
}

function getAuthErrorMessage(data: Awaited<ReturnType<typeof parseAuthResponse>>) {
  return data.error_description || data.message || data.msg || data.error || "Supabase Auth request failed.";
}

export async function verifyCurrentSupabasePassword(email: string, password: string) {
  const { supabaseUrl, anonKey } = getSupabasePublicConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseAuthResponse(response);

  if (!response.ok || !data.access_token) {
    throw createAuthError(getAuthErrorMessage(data), response.status, data.error);
  }
}

export async function updateCurrentSupabasePassword(accessToken: string, password: string) {
  const { supabaseUrl, anonKey } = getSupabasePublicConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const data = await parseAuthResponse(response);

  if (!response.ok) {
    throw createAuthError(getAuthErrorMessage(data), response.status, data.error);
  }
}

export function isMissingSupabasePublicConfig(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as SupabaseAuthError).code === "missing_public_config"
  );
}

export function isSupabaseAuthUnauthorized(error: unknown) {
  return error instanceof Error && "status" in error && (error as SupabaseAuthError).status === 401;
}
