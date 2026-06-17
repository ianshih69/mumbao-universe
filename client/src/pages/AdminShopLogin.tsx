import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { loginAdminAccount, loginLegacyAdminPassword } from "@/lib/shop/adminIdentityApi";

const labels = {
  showPassword: "\u986f\u793a\u5bc6\u78bc",
  hidePassword: "\u96b1\u85cf\u5bc6\u78bc",
  accountLoginFailed: "\u767b\u5165\u5931\u6557\uff0c\u8acb\u78ba\u8a8d Email \u8207\u5bc6\u78bc\u3002",
  enterLegacyPassword: "\u8acb\u5148\u8f38\u5165\u820a\u7248\u5171\u7528\u5bc6\u78bc\u3002",
  legacyLoginFailed: "\u820a\u7248\u5171\u7528\u5bc6\u78bc\u767b\u5165\u5931\u6557\uff0c\u8acb\u78ba\u8a8d\u5bc6\u78bc\u8207\u4f3a\u670d\u5668\u8a2d\u5b9a\u3002",
  pageTitle: "\u5f8c\u53f0\u767b\u5165",
  accountIntro: "\u8acb\u4f7f\u7528\u500b\u4eba\u7ba1\u7406\u54e1\u5e33\u865f\u767b\u5165\u3002\u5bc6\u78bc\u7531 Supabase Auth \u7ba1\u7406\uff0c\u4e0d\u6703\u5132\u5b58\u5728\u5f8c\u53f0\u8cc7\u6599\u8868\u3002",
  password: "\u5bc6\u78bc",
  loggingIn: "\u767b\u5165\u4e2d...",
  accountLogin: "\u4f7f\u7528\u500b\u4eba\u5e33\u865f\u767b\u5165",
  legacyTitle: "\u820a\u7248\u5171\u7528\u5bc6\u78bc",
  legacyIntro: "\u904e\u6e21\u671f\u9593\u53ef\u4f7f\u7528 ADMIN_PASSWORD \u767b\u5165\u3002\u7cfb\u7d71\u53ea\u6703\u63db\u767c 60 \u5206\u9418\u77ed\u6548 session token\uff0c\u4e0d\u6703\u5728\u700f\u89bd\u5668\u4fdd\u5b58\u539f\u59cb\u5bc6\u78bc\u3002",
  legacyPlaceholder: "\u8f38\u5165\u820a\u7248 ADMIN_PASSWORD",
  legacyLogin: "\u4f7f\u7528\u820a\u7248\u5171\u7528\u5bc6\u78bc\u767b\u5165",
};

function inputClass() {
  return "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]";
}

function passwordToggleLabel(isVisible: boolean) {
  return isVisible ? labels.hidePassword : labels.showPassword;
}

export default function AdminShopLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showLegacyPassword, setShowLegacyPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = new URLSearchParams(window.location.search).get("redirect") || "/admin/shop";

  async function handleAccountLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    try {
      await loginAdminAccount(email.trim(), password);
      setPassword("");
      setLocation(redirectTo);
    } catch {
      setMessage(labels.accountLoginFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLegacyLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!legacyPassword.trim()) {
      setMessage(labels.enterLegacyPassword);
      return;
    }
    setMessage("");
    setIsSubmitting(true);
    try {
      await loginLegacyAdminPassword(legacyPassword.trim());
      setLegacyPassword("");
      setLocation(redirectTo);
    } catch {
      setMessage(labels.legacyLoginFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">MUMBAO ADMIN</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">{labels.pageTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">{labels.accountIntro}</p>

          <form className="mt-8 space-y-4" onSubmit={handleAccountLogin}>
            <label className="block space-y-1.5 text-sm font-medium text-stone-700">
              <span>Email</span>
              <input
                className={inputClass()}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-stone-700">
              <span>{labels.password}</span>
              <span className="relative block">
                <input
                  className={inputClass() + " pr-12"}
                  type={showAccountPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <button
                  aria-label={passwordToggleLabel(showAccountPassword)}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 transition hover:bg-[#f0e3d7] hover:text-[#7f6250]"
                  type="button"
                  onClick={() => setShowAccountPassword((value) => !value)}
                >
                  {showAccountPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {message ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
            ) : null}
            <button
              className="w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? labels.loggingIn : labels.accountLogin}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">{labels.legacyTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{labels.legacyIntro}</p>
          <form className="mt-5 space-y-3" onSubmit={handleLegacyLogin}>
            <div className="relative">
              <input
                className={inputClass() + " pr-12"}
                type={showLegacyPassword ? "text" : "password"}
                value={legacyPassword}
                onChange={(event) => setLegacyPassword(event.target.value)}
                placeholder={labels.legacyPlaceholder}
                autoComplete="off"
              />
              <button
                aria-label={passwordToggleLabel(showLegacyPassword)}
                className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 transition hover:bg-[#f0e3d7] hover:text-[#7f6250]"
                type="button"
                onClick={() => setShowLegacyPassword((value) => !value)}
              >
                {showLegacyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              className="w-full rounded-full border border-[#8b6f5b] bg-white px-5 py-3 text-sm font-semibold text-[#8b6f5b] disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? labels.loggingIn : labels.legacyLogin}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
