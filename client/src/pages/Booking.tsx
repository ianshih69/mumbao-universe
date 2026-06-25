import { FormEvent, useState } from "react";
import { CalendarDays, CheckCircle2, Home, Search } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { checkBookingAvailability, submitBookingRequest } from "@/lib/bookings/bookingApi";

const emptyForm = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  check_in: "",
  check_out: "",
  guest_count: "",
  notes: "",
};

function fieldClassName() {
  return "h-12 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-28 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

export default function Booking() {
  const [form, setForm] = useState(emptyForm);
  const [availability, setAvailability] = useState<"unknown" | "available" | "unavailable">("unknown");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState("");

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
    if (field === "check_in" || field === "check_out") {
      setAvailability("unknown");
      setSubmittedRequestId("");
    }
  }

  async function handleCheckAvailability() {
    setIsChecking(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const result = await checkBookingAvailability(form.check_in, form.check_out);
      setAvailability(result.available ? "available" : "unavailable");
      setMessage(result.available ? "這段日期目前可以送出預約申請。" : "這段日期目前無法預約，請改選其他日期。");
    } catch (checkError) {
      setAvailability("unknown");
      setError(checkError instanceof Error ? checkError.message : "房況查詢失敗，請稍後再試。");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSubmittedRequestId("");
    try {
      const result = await submitBookingRequest(form);
      setSubmittedRequestId(result.request.id);
      setAvailability("available");
      setMessage("預約申請已送出。我們會人工確認房況後與您聯繫，尚未完成付款或正式成立訂房。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "預約申請送出失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf7f1] text-stone-900">
      <Header />
      <main className="px-4 pb-16 pt-32 md:px-8 md:pt-40">
        <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[20px] border border-[#eadfce] bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b08d73]">STime Villa Booking</p>
            <h1 className="mt-4 font-serif text-4xl font-light tracking-wide text-stone-900 md:text-5xl">
              預約 / 歸零
            </h1>
            <p className="mt-5 text-base leading-8 text-stone-600">
              慢慢蒔光一天只接一組客人。第一版線上訂房採「預約申請」：送出後由我們人工確認房況，再與您聯繫付款與訂房細節。
            </p>

            <div className="mt-8 grid gap-4">
              <div className="rounded-[12px] bg-[#f7f1e9] p-4">
                <div className="flex items-start gap-3">
                  <Home className="mt-0.5 h-5 w-5 text-[#8b6f5b]" />
                  <div>
                    <h2 className="font-semibold text-stone-900">包棟 villa 規則</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">同一天只接待一組旅人；若日期已被 Booking、官網、人工保留或維修封鎖，就無法送出申請。</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[12px] bg-[#f7f1e9] p-4">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 text-[#8b6f5b]" />
                  <div>
                    <h2 className="font-semibold text-stone-900">尚未接金流</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">此頁不會立即付款，也不會自動成立 confirmed 訂房，避免未人工確認前造成撞期。</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form className="rounded-[20px] border border-[#eadfce] bg-white p-6 shadow-sm md:p-8" onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-stone-900">查詢與送出預約申請</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">請先選擇入住與退房日期，再送出聯絡資料。</p>
              </div>
              {availability === "available" && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            </div>

            <div className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  入住日期
                  <input className={fieldClassName()} type="date" value={form.check_in} onChange={(event) => updateField("check_in", event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  退房日期
                  <input className={fieldClassName()} type="date" value={form.check_out} onChange={(event) => updateField("check_out", event.target.value)} />
                </label>
              </div>

              <Button type="button" variant="outline" className="h-11" onClick={() => void handleCheckAvailability()} disabled={isChecking || !form.check_in || !form.check_out}>
                <Search className="mr-2 h-4 w-4" />
                {isChecking ? "查詢中..." : "查詢可預約狀態"}
              </Button>

              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                姓名
                <input className={fieldClassName()} value={form.guest_name} onChange={(event) => updateField("guest_name", event.target.value)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  Email
                  <input className={fieldClassName()} type="email" value={form.guest_email} onChange={(event) => updateField("guest_email", event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                  電話
                  <input className={fieldClassName()} value={form.guest_phone} onChange={(event) => updateField("guest_phone", event.target.value)} />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                人數
                <input className={fieldClassName()} inputMode="numeric" value={form.guest_count} onChange={(event) => updateField("guest_count", event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                備註
                <textarea className={textareaClassName()} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="例如：同行人數、慶生需求、方便聯絡時間。" />
              </label>

              {message && <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">{message}</div>}
              {error && <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
              {submittedRequestId && (
                <div className="rounded-[8px] bg-[#f7f1e9] px-4 py-3 text-xs text-stone-500">
                  申請編號：{submittedRequestId}
                </div>
              )}

              <Button className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isSubmitting || availability === "unavailable"}>
                {isSubmitting ? "送出中..." : "送出預約申請"}
              </Button>
            </div>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
