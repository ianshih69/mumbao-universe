import { createAdminApiError, getAdminToken } from "@/lib/shop/adminAuth";

export type QualityEvent = {
  id: string; event_type: string; severity: string; capability_id: string | null;
  created_at: string; reviewed_at: string | null; feedback_category: string | null;
  signal_code: string | null; question: string; answer: string;
};
export type QualityOverview = {
  conversations: number; positive: number; negative: number; high_risk: number; problem_turns: number;
  categories: Record<string, number>; limited: boolean; sample_limit: number;
};
export type QualityDetail = QualityEvent & {
  execution: Record<string, string | number | boolean>;
  metadata: Record<string, string | number | boolean>;
  context: { relative: string; role: string; text: string; created_at: string }[];
};
export type QualityHealth = {
  conversation_rows: number; message_rows: number; event_rows: number; review_rows: number;
  eval_rows: number; cleanup_due_count: number; oldest_message_at: string | null;
  message_retention_days: number; event_retention_days: number;
};
export async function fetchQualityAdmin<T>(action: string, query: Record<string, string> = {}, signal?: AbortSignal, body?: object) {
  const response = await fetch("/api/admin-ai-quality?" + new URLSearchParams({ action, ...query }), {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + getAdminToken(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.code === "not_initialized" ? "AI 品質資料尚未初始化。" : "AI 品質資料暫時無法讀取。";
    throw createAdminApiError(response.status, { code: payload.code, message });
  }
  return payload as { enabled: boolean; data: T };
}
