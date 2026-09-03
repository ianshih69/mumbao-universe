import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Search } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { lookupBookingOrder } from "@/lib/bookings/bookingApi";

const genericLookupMessage = "查無符合的訂單資料，請確認輸入內容。";

function fieldClassName() {
  return "h-12 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

export default function BookingLookup() {
  const [, setLocation] = useLocation();
  const [bookingReference, setBookingReference] = useState("");
  const [contact, setContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await lookupBookingOrder({
        bookingReference,
        contact,
      });
      setLocation("/booking/manage");
    } catch (lookupError) {
      setError(
        lookupError instanceof Error && lookupError.message
          ? lookupError.message
          : genericLookupMessage,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white text-[#8b6f5b] hover:bg-[#f3eadf]">
          <Link href="/booking">
            <ArrowLeft className="h-4 w-4" />
            返回訂房
          </Link>
        </Button>

        <section className="mt-8 rounded-[8px] border border-[#eadfce] bg-white/95 p-6 shadow-sm shadow-stone-200/60 md:p-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">My Booking</p>
          <h1 className="mt-3 font-serif text-4xl font-light tracking-wide text-stone-900">
            訂單查詢
          </h1>
          <p className="mt-3 text-sm leading-7 text-stone-600">
            輸入訂房編號與訂房時留下的 Email 或手機號碼，即可查看訂單。
          </p>

          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              訂房編號
              <input
                className={fieldClassName()}
                inputMode="numeric"
                autoComplete="off"
                value={bookingReference}
                onChange={(event) => setBookingReference(event.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 位訂房編號"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-stone-700">
              Email 或手機號碼
              <input
                className={fieldClassName()}
                autoComplete="email"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="訂房時留下的聯絡方式"
              />
            </label>

            {error && (
              <div className="rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]"
              disabled={isSubmitting || bookingReference.length !== 10 || !contact.trim()}
            >
              <Search className="h-4 w-4" />
              {isSubmitting ? "查詢中..." : "查詢訂單"}
            </Button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
