import { FormEvent, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getCustomerAuthErrorMessage } from "@/lib/shop/customerAuthClient";

export default function ForgotPassword() {
  const { sendPasswordReset } = useCustomerAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await sendPasswordReset(email);
      setMessage("若此 Email 已註冊，我們已寄出密碼重設信。");
    } catch (resetError) {
      setError(getCustomerAuthErrorMessage(resetError, "暫時無法寄出重設信，請稍後再試。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-md items-center px-5 py-32">
        <section className="w-full rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <KeyRound className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9f7868]">Password Reset</p>
            <h1 className="mt-2 font-serif text-3xl font-light">忘記密碼</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              輸入註冊 Email，我們會寄送密碼重設連結。
            </p>
          </div>

          {message && (
            <div className="mb-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="h-11 w-full rounded-[8px] border border-[#eadfce] bg-white px-4 pl-10 text-sm text-stone-800 outline-none transition focus:border-[#9f7868] focus:ring-2 focus:ring-[#ead8c8]"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </span>
            </label>
            <Button
              className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "寄送中..." : "寄送重設信"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-stone-500">
            想起密碼了？{" "}
            <Link className="font-medium text-[#8b6f5b] hover:text-[#765d4a]" href="/account/login">
              返回登入
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
