import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAdminIdentity } from "@/lib/shop/adminAuth";
import { hasAdminNavPermission } from "@/components/admin/adminNavigation";
import { fetchQualityAdmin, type QualityDetail, type QualityEvent, type QualityHealth, type QualityOverview } from "@/lib/aiQualityAdmin";
import { negativeFeedbackLabels } from "@/components/ai/AiAnswerFeedback";

const eventLabels: Record<string, string> = {
  negative_feedback: "負面回饋", generic_fallback: "Fallback", possible_misunderstanding: "疑似誤解",
  repeated_question: "重複提問", unnecessary_clarification: "不必要澄清", context_lost_signal: "上下文訊號",
  wrong_mutation_signal: "錯誤變更訊號", provider_schema_reject: "Provider 格式拒絕", provider_error: "Provider 錯誤",
  manual_escalation: "人工協助", owner_correction: "人工更正", knowledge_gap_candidate: "知識缺口候選", tool_gap_candidate: "工具缺口候選",
};
const typeOptions = [["all","全部類型"],["negative","負面回饋"],["fallback","Fallback"],["context","Context"],
  ["mutation","Wrong Mutation"],["provider","Provider Error"],["clarification","Clarification"],["pending","Pending"],["budget","Provider Budget"]];
const control = "min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:opacity-40";
const time = (value: string | null) => value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "—";
const booleanLabel = (value: unknown) => value === true ? "YES" : value === false ? "NO" : "—";
const errorText = (error: unknown) => error instanceof Error ? error.message : "AI 品質資料暫時無法讀取。";
const eventName = (event: QualityEvent) => event.signal_code === "pending_disappeared" ? "Pending 完整性"
  : event.signal_code === "provider_budget_exceeded" ? "Provider 呼叫超額" : eventLabels[event.event_type] || event.event_type;
type Cursor = { before_at: string; before_id: string };

export default function AdminAiImprovement() {
  const [days,setDays] = useState("7"), [type,setType] = useState("all"), [severity,setSeverity] = useState("all");
  const [reviewed,setReviewed] = useState("pending"), [tab,setTab] = useState("events");
  const [cursors,setCursors] = useState<Cursor[]>([]), [revision,setRevision] = useState(0);
  const [events,setEvents] = useState<QualityEvent[]>([]), [overview,setOverview] = useState<QualityOverview | null>(null);
  const [health,setHealth] = useState<QualityHealth | null>(null), [hasMore,setHasMore] = useState(false);
  const [loading,setLoading] = useState(true), [enabled,setEnabled] = useState(true), [error,setError] = useState("");
  const [selected,setSelected] = useState<string | null>(null), [detail,setDetail] = useState<QualityDetail | null>(null);
  const [detailError,setDetailError] = useState(""), [saving,setSaving] = useState(false);
  const canReview = hasAdminNavPermission(getAdminIdentity(),"ai_quality.review");
  const execution = { ...detail?.metadata, ...detail?.execution };
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void (async () => {
      if (tab === "health") {
        const response = await fetchQualityAdmin<QualityHealth>("health",{},controller.signal);
        if (controller.signal.aborted) return;
        setEnabled(response.enabled); setHealth(response.data || null);
      } else {
        const response = await fetchQualityAdmin<{ events: QualityEvent[]; has_more: boolean }>("list",
          { days,type,severity,reviewed,...cursor },controller.signal);
        if (controller.signal.aborted) return;
        setEnabled(response.enabled); setEvents(response.data?.events || []); setHasMore(response.data?.has_more || false);
        if (response.enabled) {
          const metrics = await fetchQualityAdmin<QualityOverview>("overview",{ days },controller.signal);
          if (!controller.signal.aborted) setOverview(metrics.data);
        }
      }
    })().catch(e => { if (!controller.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[days,type,severity,reviewed,cursor,revision,tab]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null); setDetailError("");
    void fetchQualityAdmin<QualityDetail>("detail",{event_id:selected},controller.signal)
      .then(response => { if (!controller.signal.aborted) {
        if (response.enabled) setDetail(response.data);
        else setDetailError("AI 品質資料功能尚未啟用。");
      } })
      .catch(e => { if (!controller.signal.aborted) setDetailError(errorText(e)); });
    return () => controller.abort();
  },[selected]);
  async function markReviewed() {
    if (!detail || saving) return;
    setSaving(true); setDetailError("");
    try {
      const result = await fetchQualityAdmin<{reviewed:boolean}>("review",{},undefined,{event_id:detail.id});
      if (!result.enabled || !result.data?.reviewed) throw new Error("AI 品質資料功能尚未啟用。");
      setSelected(null); setRevision(n => n+1);
    } catch(e) { setDetailError(errorText(e)); }
    finally { setSaving(false); }
  }
  function filter(setter: (v:string)=>void, value:string) { setCursors([]); setter(value); }
  return (
    <div className="mx-auto min-h-full w-full min-w-0 max-w-7xl space-y-6 bg-white px-4 py-5 text-neutral-800 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">AI 改善中心</h1>
        <button className={control} type="button" title="重新整理" aria-label="重新整理" disabled={loading}
          onClick={() => setRevision(n=>n+1)}><RefreshCw size={16} /></button>
      </header>
      <div className="flex gap-6 border-b border-neutral-200" role="tablist" aria-label="品質資料">
        {[["events","品質事件"],["health","資料健康"]].map(([value,label]) => <button type="button" role="tab" key={value}
          aria-selected={tab===value} onClick={()=>setTab(value)}
          className={"min-h-11 border-b-2 text-sm focus-visible:outline focus-visible:outline-2 " +
            (tab===value ? "border-neutral-800 font-semibold" : "border-transparent text-neutral-500")}>{label}</button>)}
      </div>
      {error ? <p role="alert" className="py-8 text-sm text-red-700">{error}</p>
        : !enabled ? <p className="py-8 text-sm text-neutral-500">AI 品質資料功能尚未啟用。</p>
        : tab === "health" ? loading ? <p role="status">載入中…</p> : health && (
          <section className="space-y-6">
            <h2 className="text-base font-semibold">資料健康</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
              {([["對話",health.conversation_rows],["訊息",health.message_rows],["事件",health.event_rows],
                ["檢視項目",health.review_rows],["Eval",health.eval_rows],["待清理",health.cleanup_due_count]] as const)
                .map(([label,value])=><div key={label}><dt className="text-sm text-neutral-500">{label}</dt><dd className="mt-1 text-xl">{value}</dd></div>)}
            </dl>
            <p className="text-sm">最早保留訊息：{time(health.oldest_message_at)}</p>
            <p className="text-sm text-neutral-500">訊息保留 30 天 · 事件保留 90 天</p>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="quality-days">時間</label>
              <select id="quality-days" className={control} value={days} onChange={e=>filter(setDays,e.target.value)}>
                <option value="7">近 7 天</option><option value="30">近 30 天</option>
              </select>
              <label className="sr-only" htmlFor="quality-type">類型</label>
              <select id="quality-type" className={control} value={type} onChange={e=>filter(setType,e.target.value)}>
                {typeOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}
              </select>
              <label className="sr-only" htmlFor="quality-severity">嚴重程度</label>
              <select id="quality-severity" className={control} value={severity} onChange={e=>filter(setSeverity,e.target.value)}>
                <option value="all">全部嚴重程度</option><option value="high">High / Critical</option><option value="other">其他程度</option>
              </select>
              <label className="sr-only" htmlFor="quality-reviewed">檢視狀態</label>
              <select id="quality-reviewed" className={control} value={reviewed} onChange={e=>filter(setReviewed,e.target.value)}>
                <option value="pending">待檢視</option><option value="reviewed">已檢視</option><option value="all">全部狀態</option>
              </select>
            </div>
            {loading ? <p className="py-8 text-sm" role="status">載入中…</p> : <>
              {overview && <section className="space-y-5 border-b border-neutral-200 pb-6">
                <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                  {([["期間對話",overview.conversations],["負面回饋",overview.negative],["高風險訊號",overview.high_risk],
                    ["疑似問題回合",overview.problem_turns]] as const).map(([label,value])=><div key={label}>
                    <dt className="text-sm text-neutral-500">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}
                </dl>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-emerald-800"><ThumbsUp size={14}/>有幫助 {overview.positive}</span>
                  <span className="inline-flex items-center gap-2 text-rose-800"><ThumbsDown size={14}/>沒幫助 {overview.negative}</span>
                  {Object.entries(negativeFeedbackLabels).map(([key,label])=><span key={key} className="text-neutral-500">{label} {overview.categories[key] || 0}</span>)}
                </div>
                {overview.limited && <p role="status" className="text-xs text-amber-800">統計範圍：最近 5,000 筆事件及對話，非全期間總數。</p>}
              </section>}
              {events.length === 0 ? <p className="py-10 text-sm text-neutral-500">目前沒有需要檢視的 AI 品質事件。</p>
                : <ul className="divide-y divide-neutral-200">
                  {events.map(event=><li key={event.id}>
                    <button type="button" onClick={()=>setSelected(event.id)}
                      className="w-full min-w-0 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500">
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span className="font-semibold text-neutral-800">{eventName(event)}</span>
                        <span className={["high","critical"].includes(event.severity) ? "text-red-700" : ""}>{event.severity}</span>
                        <span className="break-all">{event.capability_id || "—"}</span>
                        <span>{time(event.created_at)}</span><span>{event.reviewed_at ? "已檢視" : "待檢視"}</span>
                      </div>
                      <p className="line-clamp-2 break-words text-sm leading-6">{event.question || "文字已依保存期限移除"}</p>
                      <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-neutral-500">{event.answer}</p>
                    </button>
                  </li>)}
                </ul>}
              <div className="flex items-center justify-end gap-3">
                <button className={control} type="button" title="上一頁" aria-label="上一頁" disabled={!cursors.length}
                  onClick={()=>setCursors(v=>v.slice(0,-1))}><ChevronLeft size={16}/></button>
                <span className="text-sm">第 {cursors.length+1} 頁</span>
                <button className={control} type="button" title="下一頁" aria-label="下一頁" disabled={!hasMore || !events.length}
                  onClick={()=>{const last=events[events.length-1];setCursors(v=>[...v,{before_at:last.created_at,before_id:last.id}]);}}>
                  <ChevronRight size={16}/></button>
              </div>
            </>}
          </>
        )}
      <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg bg-white text-neutral-800">
          <DialogHeader><DialogTitle>品質事件</DialogTitle><DialogDescription>{detail ? eventName(detail) : "載入中…"}</DialogDescription></DialogHeader>
          {detailError && <p role="alert" className="text-sm text-red-700">{detailError}</p>}
          {detail && <div className="min-w-0 space-y-5 text-sm">
            <p className="break-words">{detail.capability_id || "—"} · {detail.severity} · {time(detail.created_at)}</p>
            {detail.feedback_category && <p>{negativeFeedbackLabels[detail.feedback_category as keyof typeof negativeFeedbackLabels]}</p>}
            <dl className="grid grid-cols-2 gap-3 border-y border-neutral-200 py-4">
              <div><dt className="text-neutral-500">Provider used</dt><dd>{booleanLabel(execution.provider_used)}</dd></div>
              <div><dt className="text-neutral-500">Provider calls</dt><dd>{execution.provider_call_count ?? "—"}</dd></div>
              <div><dt className="text-neutral-500">Scenario changed</dt><dd>{booleanLabel(execution.scenario_changed)}</dd></div>
              <div><dt className="text-neutral-500">Pending</dt><dd>{execution.pending_created ? "created" : execution.pending_consumed ? "consumed"
                : execution.pending_created === false && execution.pending_consumed === false ? "unchanged" : "—"}</dd></div>
            </dl>
            {detail.context.length ? detail.context.map((turn,index)=><section key={index} className="space-y-1">
              <h3 className="text-xs font-semibold text-neutral-500">{turn.relative==="current" ? "本輪" : turn.relative==="before" ? "前文" : "後文"} · {turn.role==="user" ? "客人" : "慢寶"}</h3>
              <p className="whitespace-pre-wrap break-words leading-7">{turn.text}</p>
            </section>) : <p className="text-neutral-500">文字已依保存期限移除。</p>}
            {detail.metadata.signal_code && <p className="break-words text-xs">Signal: {detail.metadata.signal_code}</p>}
            <button className={control + " inline-flex items-center gap-2"} type="button" disabled={!canReview || saving || !!detail.reviewed_at}
              onClick={()=>void markReviewed()}><Check size={16}/>{detail.reviewed_at ? "已檢視" : "標記已檢視"}</button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
