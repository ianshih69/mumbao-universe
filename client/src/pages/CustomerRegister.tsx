import { FormEvent, useState } from "react";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  getCustomerAuthErrorMessage,
  isCustomerEmailMayExistError,
  normalizeCustomerEmail,
} from "@/lib/shop/customerAuthClient";

function inputClass() {
  return "h-11 w-full rounded-[8px] border border-[#eadfce] bg-white px-4 text-sm text-stone-800 outline-none transition focus:border-[#9f7868] focus:ring-2 focus:ring-[#ead8c8]";
}

export default function CustomerRegister() {
  const { signUp } = useCustomerAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [showAccountRecoveryLinks, setShowAccountRecoveryLinks] = useState(false);
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validateForm() {
    if (!form.name.trim()) return "請輸入姓名。";
    if (!form.phone.trim()) return "請輸入手機。";
    if (!normalizeCustomerEmail(form.email)) return "請輸入 Email。";
    if (form.password.length < 12) return "密碼至少需要 12 碼。";
    if (form.password !== form.confirmPassword) return "密碼與確認密碼不一致。";
    return "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setShowAccountRecoveryLinks(false);
    setSuccess("");

    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp({
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
      });
      setForm({
        name: "",
        phone: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      setShowPassword(false);
      setShowConfirmPassword(false);
      setSuccess("註冊成功，請至信箱完成 Email 驗證。驗證完成後即可開始使用會員功能。");
    } catch (error) {
      setShowAccountRecoveryLinks(isCustomerEmailMayExistError(error));
      setMessage(getCustomerAuthErrorMessage(error, "註冊暫時無法完成，請稍後再試。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-lg items-center px-5 py-32">
        <section className="w-full rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <UserPlus className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9f7868]">Create Account</p>
            <h1 className="mt-2 font-serif text-3xl font-light">建立會員帳號</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              第一版會員功能會先提供登入與密碼管理，會員資料與訂單紀錄即將推出。
            </p>
          </div>

          {success && (
            <div className="mb-4 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
              {success}
              <div className="mt-3">
                <Button asChild size="sm" className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                  <Link href="/account/login">前往登入</Link>
                </Button>
              </div>
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-[8px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
              {showAccountRecoveryLinks && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="rounded-full bg-white">
                    <Link href="/account/login">前往登入</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-full bg-white">
                    <Link href="/account/forgot-password">忘記密碼</Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium text-stone-700">
                <span>姓名</span>
                <input
                  className={inputClass()}
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-stone-700">
                <span>手機</span>
                <input
                  className={inputClass()}
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  autoComplete="tel"
                  required
                />
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>Email</span>
              <input
                className={inputClass()}
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>密碼</span>
              <span className="relative block">
                <input
                  className={`${inputClass()} pr-12`}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  autoComplete="new-password"
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

            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>確認密碼</span>
              <span className="relative block">
                <input
                  className={`${inputClass()} pr-12`}
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                  autoComplete="new-password"
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
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "建立中..." : "建立會員帳號"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-stone-500">
            已有帳號？{" "}
            <Link className="font-medium text-[#8b6f5b] hover:text-[#765d4a]" href="/account/login">
              前往登入
            </Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
