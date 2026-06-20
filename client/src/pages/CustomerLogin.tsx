import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LogIn, Mail } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { getCustomerAuthErrorMessage, getSafeAccountReturnTo } from "@/lib/shop/customerAuthClient";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

function authInputClass() {
  return "h-11 w-full rounded-[8px] border border-[#eadfce] bg-white px-4 text-sm text-stone-800 outline-none transition focus:border-[#9f7868] focus:ring-2 focus:ring-[#ead8c8]";
}

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { signIn, isLoading, isAuthenticated } = useCustomerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const returnTo = getSafeAccountReturnTo(searchParams.get("returnTo"));
  const verified = searchParams.get("verified") === "1";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      setLocation(returnTo);
    } catch (error) {
      setMessage(getCustomerAuthErrorMessage(error, "登入失敗，請稍後再試。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation(returnTo);
    }
  }, [isAuthenticated, isLoading, returnTo, setLocation]);

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-md items-center px-5 py-32">
        <section className="w-full rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <LogIn className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9f7868]">Member Login</p>
            <h1 className="mt-2 font-serif text-3xl font-light">會員登入</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              登入後未來可更方便查看訂單與快速結帳。
            </p>
          </div>

          {verified && (
            <div className="mb-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Email 驗證完成，現在可以登入。
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  className={`${authInputClass()} pl-10`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>密碼</span>
              <span className="relative block">
                <input
                  className={`${authInputClass()} pr-12`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-[#f3eadf]"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <Button
              className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              disabled={isSubmitting || isLoading}
              type="submit"
            >
              {isSubmitting ? "登入中..." : "登入"}
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-stone-500">
            <Link className="font-medium text-[#8b6f5b] hover:text-[#765d4a]" href="/account/forgot-password">
              忘記密碼
            </Link>
            <Link className="font-medium text-[#8b6f5b] hover:text-[#765d4a]" href="/account/register">
              建立會員帳號
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
