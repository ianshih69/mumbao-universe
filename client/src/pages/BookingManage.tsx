import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Clock3, Copy, FileText, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import {
  fetchBookingManageSession,
  reportBookingManageBankTransfer,
  submitBookingCancellation,
  type BookingCancellationReasonCode,
  type BookingManageResult,
} from "@/lib/bookings/bookingApi";
import {
  bookingPaymentRemainingSeconds,
  createBookingPaymentClockSync,
  formatBookingPaymentCountdown,
} from "@/lib/bookings/bookingPaymentView";

const reasonOptions: Array<{ value: BookingCancellationReasonCode; label: string }> = [
  { value: "schedule_change", label: "行程變更" },
  { value: "guest_count_change", label: "同行人數變動" },
  { value: "weather", label: "天候因素" },
  { value: "other", label: "其他" },
];

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function textareaClassName() {
  return "min-h-24 rounded-[8px] border border-[#eadfce] bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

function formatTwd(value?: number | null) {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function row(label: string, value: string | number | null | undefined) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#f1e8dc] py-3 last:border-b-0">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-900">{value || "-"}</dd>
    </div>
  );
}

function roomLabel(order: BookingManageResult["booking"]) {
  const option = order.selectedRoomOption;
  if (option) {
    return `${option.roomCount} 間房｜雙人床 ${option.doubleBedCount} 張｜可睡 ${option.sleepCapacity} 人`;
  }
  return order.roomCount ? `${order.roomCount} 間房` : "依訂房安排";
}

function breakfastLabel(order: BookingManageResult["booking"]) {
  const count = order.breakfastEntries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  return count > 0 ? `${count} 份` : "未加購";
}

export default function BookingManage() {
  const [data, setData] = useState<BookingManageResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [bankLast5, setBankLast5] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isReportingPayment, setIsReportingPayment] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<BookingCancellationReasonCode>("schedule_change");
  const [reasonText, setReasonText] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    let active = true;
    fetchBookingManageSession()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setError("查無有效的訂單管理連線，請重新查詢訂單。");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clockSync = useMemo(
    () => createBookingPaymentClockSync(data?.payment.serverNow),
    [data?.payment.serverNow],
  );
  const remainingSeconds = bookingPaymentRemainingSeconds({
    deadline: data?.payment.holdExpiresAt,
    clockSync,
    currentTimeMs: nowMs,
  });
  const paymentDeadlinePassed = remainingSeconds <= 0;
  const canReportPayment = Boolean(data?.actions.canReportBankTransfer && !paymentDeadlinePassed);

  const handlePaymentSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPaymentError("");
    setIsReportingPayment(true);
    try {
      const result = await reportBookingManageBankTransfer({
        bankLast5,
        payerName,
        notes: paymentNotes,
      });
      setData(result);
      setPaymentOpen(false);
      setBankLast5("");
      setPayerName("");
      setPaymentNotes("");
    } catch (submitError) {
      setPaymentError(submitError instanceof Error ? submitError.message : "目前無法送出匯款資料，請稍後再試。");
    } finally {
      setIsReportingPayment(false);
    }
  };

  const handleCancelSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (reasonCode === "other" && !reasonText.trim()) {
      setCancelError("請簡短填寫取消原因。");
      return;
    }
    setCancelError("");
    setIsCancelling(true);
    try {
      const result = await submitBookingCancellation({ reasonCode, reasonText });
      setData(result);
      setCancelOpen(false);
    } catch (submitError) {
      setCancelError(submitError instanceof Error ? submitError.message : "目前無法送出取消處理，請稍後再試。");
    } finally {
      setIsCancelling(false);
    }
  };

  const copyText = async (value: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">My Booking</p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">我的訂單</h1>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-white/95 p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8b6f5b]" />
            <p className="mt-4 text-sm text-stone-600">正在讀取訂單...</p>
          </section>
        )}

        {!isLoading && error && (
          <section className="rounded-[8px] border border-red-100 bg-red-50 p-6 text-red-700">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <h2 className="font-semibold">無法查看訂單</h2>
                <p className="mt-2 text-sm leading-6">{error}</p>
                <Button asChild className="mt-4 bg-[#8b6f5b] hover:bg-[#765d4a]">
                  <Link href="/booking/lookup">重新查詢</Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        {!isLoading && data && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-6">
              <div className="rounded-[8px] border border-[#eadfce] bg-white/95 p-6 shadow-sm shadow-stone-200/60">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[#8b6f5b]">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-semibold">{data.booking.statusLabel}</span>
                    </div>
                    <h2 className="mt-3 font-mono text-2xl font-semibold text-stone-900">
                      {data.booking.bookingReference}
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatDate(data.booking.checkIn)} - {formatDate(data.booking.checkOut)}｜{data.booking.nights} 晚
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f3eadf] px-4 py-2 text-sm font-medium text-[#765d4a]">
                    {data.payment.label || "付款狀態確認中"}
                  </span>
                </div>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-white/95 p-6">
                <h3 className="font-serif text-2xl text-stone-900">訂房內容</h3>
                <dl className="mt-4 text-sm">
                  {row("入住 / 退房", `${formatDate(data.booking.checkIn)} - ${formatDate(data.booking.checkOut)}`)}
                  {row("晚數", `${data.booking.nights} 晚`)}
                  {row("人數", `成人 ${data.booking.adults}｜孩童 ${data.booking.children}｜嬰幼兒 ${data.booking.infants}`)}
                  {row("房間配置", roomLabel(data.booking))}
                  {row("早餐", breakfastLabel(data.booking))}
                  {row("寵物", data.booking.hasPets ? `${data.booking.dogCount || 0} 隻` : "無")}
                  {row("訂房總額", formatTwd(data.booking.quotedTotal))}
                  {row("訂金", formatTwd(data.booking.depositAmount))}
                  {row("尾款", formatTwd(data.booking.balanceAmount))}
                </dl>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-white/95 p-6">
                <h3 className="font-serif text-2xl text-stone-900">付款資訊</h3>
                <p className="mt-3 text-sm font-semibold text-[#765d4a]">{data.payment.label}</p>

                {canReportPayment && data.payment.bank && (
                  <div className="mt-5 rounded-[8px] border border-[#eadfce] bg-[#fffaf3] p-4">
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-5 w-5 text-[#8b6f5b]" />
                      <div>
                        <p className="text-xs text-stone-500">付款期限</p>
                        <p className="mt-1 font-mono text-2xl font-semibold text-[#765d4a]">
                          {formatBookingPaymentCountdown(remainingSeconds)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">{formatDateTime(data.payment.holdExpiresAt)}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      {row("本次應付訂金", formatTwd(data.booking.depositAmount))}
                      {row("銀行", `${data.payment.bank.name} ${data.payment.bank.code}`)}
                      {row("分行", data.payment.bank.branch)}
                      {row("戶名", data.payment.bank.accountName)}
                    </dl>
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#765d4a]"
                      onClick={() => copyText(data.payment.bank?.accountNumber || "")}
                    >
                      <Copy className="h-4 w-4" />
                      複製帳號
                    </button>
                    {!paymentOpen && (
                      <Button className="mt-5 bg-[#8b6f5b] hover:bg-[#765d4a]" onClick={() => setPaymentOpen(true)}>
                        我已完成匯款
                      </Button>
                    )}
                  </div>
                )}

                {paymentOpen && (
                  <form className="mt-5 grid gap-4 border-t border-[#f1e8dc] pt-5" onSubmit={handlePaymentSubmit}>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      匯款帳號末五碼
                      <input
                        className={fieldClassName()}
                        inputMode="numeric"
                        maxLength={5}
                        value={bankLast5}
                        onChange={(event) => setBankLast5(event.target.value.replace(/\D/g, "").slice(0, 5))}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      匯款人姓名
                      <input className={fieldClassName()} value={payerName} onChange={(event) => setPayerName(event.target.value)} />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      備註
                      <textarea className={textareaClassName()} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
                    </label>
                    {paymentError && <p className="text-sm text-red-700">{paymentError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" className="bg-[#8b6f5b] hover:bg-[#765d4a]" disabled={isReportingPayment || bankLast5.length !== 5}>
                        {isReportingPayment ? "送出中..." : "送出匯款資料"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                        取消
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-[8px] border border-[#eadfce] bg-white/95 p-5">
                <h3 className="font-serif text-2xl text-stone-900">聯絡資訊</h3>
                <dl className="mt-4 text-sm">
                  {row("Email", data.booking.contact.email)}
                  {row("手機", data.booking.contact.phone)}
                </dl>
              </div>

              <div className="rounded-[8px] border border-[#eadfce] bg-white/95 p-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#8b6f5b]" />
                  <h3 className="font-serif text-2xl text-stone-900">取消狀態</h3>
                </div>
                <p className="mt-3 text-sm font-semibold text-[#765d4a]">{data.cancellation.statusLabel}</p>
                {data.cancellation.publicNote && (
                  <p className="mt-2 rounded-[8px] bg-[#fffaf3] px-3 py-2 text-sm leading-6 text-stone-600">
                    {data.cancellation.publicNote}
                  </p>
                )}
                <p className="mt-4 text-sm leading-6 text-stone-500">
                  退款狀態：尚未處理。取消訂房不代表已完成退款。
                </p>

                {(data.actions.canDirectCancel || data.actions.canRequestCancellation) && !cancelOpen && (
                  <Button
                    type="button"
                    variant={data.actions.canDirectCancel ? "destructive" : "outline"}
                    className="mt-5 w-full"
                    onClick={() => setCancelOpen(true)}
                  >
                    {data.actions.canDirectCancel ? "取消訂房" : "申請取消訂房"}
                  </Button>
                )}

                {cancelOpen && (
                  <form className="mt-5 grid gap-4 border-t border-[#f1e8dc] pt-5" onSubmit={handleCancelSubmit}>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      取消原因
                      <select className={fieldClassName()} value={reasonCode} onChange={(event) => setReasonCode(event.target.value as BookingCancellationReasonCode)}>
                        {reasonOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                      補充說明
                      <textarea className={textareaClassName()} value={reasonText} onChange={(event) => setReasonText(event.target.value)} />
                    </label>
                    {!data.actions.canDirectCancel && (
                      <p className="text-xs leading-5 text-stone-500">
                        送出後將由館主確認取消與後續退款事宜；送出申請不代表訂房已立即取消。
                      </p>
                    )}
                    {data.actions.canDirectCancel && (
                      <p className="text-xs leading-5 text-stone-500">
                        送出後將取消訂房並重新開放日期；不會自動建立退款。
                      </p>
                    )}
                    {cancelError && <p className="text-sm text-red-700">{cancelError}</p>}
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" disabled={isCancelling} className="bg-[#8b6f5b] hover:bg-[#765d4a]">
                        {isCancelling ? "送出中..." : "確認送出"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                        返回
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </aside>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
