import { useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

export const negativeFeedbackLabels = {
  incorrect_answer: "答錯了",
  misunderstood_question: "沒理解我的問題",
  repeated_question: "一直重複問",
  too_verbose: "太囉嗦",
  other: "其他",
} as const;
type Category = keyof typeof negativeFeedbackLabels;
type Vote = { polarity: "positive" | "negative"; category?: Category };
const buttonStyle = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:opacity-50 aria-pressed:bg-stone-100 aria-pressed:text-stone-800 hover:bg-stone-100";

export default function AiAnswerFeedback({ token }: { token: string }) {
  const [vote, setVote] = useState<Vote | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  async function submit(next: Vote) {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setNotice("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/ai-quality-feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...next }), signal: controller.signal,
      });
      if (!response.ok || (await response.json()).ok !== true) throw new Error();
      setVote(next);
      setExpanded(false);
      setNotice("謝謝你的回饋。");
    } catch { setNotice("回饋暫時無法送出"); }
    finally { clearTimeout(timer); busy.current = false; setSubmitting(false); }
  }
  return (
    <div className="min-w-0 max-w-full text-stone-500" aria-label="回答回饋" aria-busy={submitting}>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={buttonStyle} aria-label="有幫助" aria-pressed={vote?.polarity === "positive"}
          disabled={submitting} onClick={() => void submit({ polarity: "positive" })}>
          <ThumbsUp size={14} aria-hidden="true" />有幫助
        </button>
        <button type="button" className={buttonStyle} aria-label="沒幫助" aria-pressed={vote?.polarity === "negative"}
          aria-expanded={expanded} disabled={submitting} onClick={() => setExpanded(!expanded)}>
          <ThumbsDown size={14} aria-hidden="true" />沒幫助
        </button>
      </div>
      {expanded && <fieldset className="mt-1 flex min-w-0 flex-wrap gap-1">
        <legend className="sr-only">回饋原因</legend>
        {(Object.entries(negativeFeedbackLabels) as [Category, string][]).map(([category, label]) => (
          <button key={category} type="button" className={buttonStyle} aria-label={label}
            aria-pressed={vote?.polarity === "negative" && vote.category === category} disabled={submitting}
            onClick={() => void submit({ polarity: "negative", category })}>{label}</button>
        ))}
      </fieldset>}
      {notice && <p className="px-2 py-1 text-xs leading-5" role="status">{notice}</p>}
    </div>
  );
}
