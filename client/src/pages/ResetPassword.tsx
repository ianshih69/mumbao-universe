import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getCustomerAuthErrorMessage } from "@/lib/shop/customerAuthClient";

function inputClass() {
  return "h-11 w-full rounded-[8px] border border-[#eadfce] bg-white px-4 text-sm text-stone-800 outline-none transition focus:border-[#9f7868] focus:ring-2 focus:ring-[#ead8c8]";
}

export default function ResetPassword() {
  const { session, isLoading, updatePassword, signOut } = useCustomerAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || session || message) return;
    setError("密碼重設連結無效或已過期，請重新申請。");
  }, [isLoading, message, session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!session) {
      setError("密碼重設連結無效或已過期，請重新申請。");
      return;
    }
    if (password.length < 12) {
      setError("新密碼至少需要 12 碼。");
      return;
    }
    if (password !== confirmPassword) {
      setError("新密碼與確認密碼不一致。");
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      await signOut();
      setMessage("密碼已更新，請使用新密碼重新登入。");
    } catch (resetError) {
      setError(getCustomerAuthErrorMessage(resetError, "密碼更新失敗，請稍後再試。"));
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
            <p className="text-xs uppercase tracking-[0.2em] text-[#9f7868]">Reset Password</p>
            <h1 className="mt-2 font-serif text-3xl font-light">重設密碼</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              請設定新的會員登入密碼。
            </p>
          </div>

          {message && (
            <div className="mb-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              {message}
              <div className="mt-3">
                <Button asChild size="sm" className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                  <Link href="/account/login">前往登入</Link>
                </Button>
              </div>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <p className="text-center text-sm text-stone-500">正在確認重設連結...</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm font-medium text-stone-700">
                <span>新密碼</span>
                <span className="relative block">
                  <input
                    className={`${inputClass()} pr-12`}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={!session || Boolean(message)}
                    required
                  />
                  <button
                    aria-label={showPassword ? "隱藏新密碼" : "顯示新密碼"}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-[#f3eadf]"
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <label className="block space-y-2 text-sm font-medium text-stone-700">
                <span>確認新密碼</span>
                <span className="relative block">
                  <input
                    className={`${inputClass()} pr-12`}
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={!session || Boolean(message)}
                    required
                  />
                  <button
                    aria-label={showConfirmPassword ? "隱藏確認密碼" : "顯示確認密碼"}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-[#f3eadf]"
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <Button
                className="h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                disabled={!session || Boolean(message) || isSubmitting}
                type="submit"
              >
                {isSubmitting ? "更新中..." : "更新密碼"}
              </Button>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
