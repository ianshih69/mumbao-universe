import { assertAiQualityServerOnly } from "./privacy.js";

export const aiQualityPersistenceTimeoutMs = 3000;

// The only Quality DB transport. No retries, response-body dumps or error objects.
export async function persistAiQualityTurn(payload, { fetchImpl = globalThis.fetch } = {}) {
  assertAiQualityServerOnly();
  const base = process.env.SUPABASE_URL;
  const credential = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !credential) return "configuration";
  const controller = new AbortController();
  let timer;
  try {
    const work = Promise.resolve().then(async () => {
      const response = await fetchImpl(base.replace(/\/$/, "") + "/rest/v1/rpc/record_ai_quality_turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: credential, Authorization: "Bearer " + credential },
        body: JSON.stringify({ p_turn: payload }),
        signal: controller.signal,
      });
      const status = response.status;
      // The RPC returns void; never read an error body that might echo private data.
      await response.body?.cancel().catch(() => {});
      if (status >= 200 && status < 300) return "saved";
      if (status === 401 || status === 403) return "permission";
      if (status === 404) return "missing_schema";
      if (status === 409) return "conflict";
      return "database";
    }).catch(() => controller.signal.aborted ? "timeout" : "network");
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve("timeout"); }, aiQualityPersistenceTimeoutMs);
    });
    return await Promise.race([work, timeout]);
  } catch {
    return "persistence";
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
