const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};
const supabaseTimeoutMs = 8000;

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", jsonHeaders["Content-Type"]);
  res.end(JSON.stringify(body));
}

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    restUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    rpcUrl: `${url.replace(/\/$/, "")}/rest/v1/rpc`,
    serviceRoleKey,
  };
}

export async function supabaseRequest(path, options = {}) {
  const { restUrl, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), supabaseTimeoutMs);

  try {
    const response = await fetch(`${restUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...options.headers,
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(data?.message || `Supabase request failed: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function supabaseRpc(functionName, payload) {
  const { rpcUrl, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), supabaseTimeoutMs);

  try {
    const response = await fetch(`${rpcUrl}/${functionName}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(data?.message || `Supabase RPC failed: ${response.status}`);
      error.details = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

export function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
