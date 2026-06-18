import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import {
  bootstrapSuperAdmin,
  fetchAdminBootstrapStatus,
  loginAdminAccount,
} from "@/lib/shop/adminIdentityApi";

const labels = {
  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",
  accountLoginFailed: "登入失敗，請確認 Email 與密碼。",
  pageTitle: "後台登入",
  accountIntro: "請使用個人管理員帳號登入。密碼由 Supabase Auth 管理。",
  password: "密碼",
  loggingIn: "登入中...",
  accountLogin: "使用個人帳號登入",
  bootstrapTitle: "建立第一位超級管理員",
  bootstrapIntro: "僅在尚無任何後台帳號時可使用。初始密碼會使用目前的 ADMIN_PASSWORD。",
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
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBootstrapAvailable, setIsBootstrapAvailable] = useState(false);
  const [bootstrapForm, setBootstrapForm] = useState({
    displayName: "",
    email: "",
    adminPassword: "",
  });
  const [showBootstrapPassword, setShowBootstrapPassword] = useState(false);

  const redirectTo = new URLSearchParams(window.location.search).get("redirect") || "/admin/shop";

  useEffect(() => {
    let isCurrent = true;
    fetchAdminBootstrapStatus()
      .then((status) => {
        if (isCurrent) setIsBootstrapAvailable(status.available);
      })
      .catch(() => {
        if (isCurrent) setIsBootstrapAvailable(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

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

  async function handleBootstrap(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    try {
      await bootstrapSuperAdmin({
        displayName: bootstrapForm.displayName.trim(),
        email: bootstrapForm.email.trim(),
        adminPassword: bootstrapForm.adminPassword,
      });
      setEmail(bootstrapForm.email.trim());
      setPassword("");
      setBootstrapForm({ displayName: "", email: "", adminPassword: "" });
      setIsBootstrapAvailable(false);
      setMessage("第一位 super_admin 已建立，請使用 Email 與 ADMIN_PASSWORD 登入。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "建立第一位 super_admin 失敗。");
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
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-stone-700">{message}</div>
            ) : null}
            <button
              className="w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? labels.loggingIn : labels.accountLogin}
            </button>
          </form>
        </section>

        {isBootstrapAvailable ? (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">{labels.bootstrapTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{labels.bootstrapIntro}</p>
            <form className="mt-5 space-y-3" onSubmit={handleBootstrap}>
              <input
                className={inputClass()}
                value={bootstrapForm.displayName}
                onChange={(event) =>
                  setBootstrapForm({ ...bootstrapForm, displayName: event.target.value })
                }
                placeholder="姓名"
              />
              <input
                className={inputClass()}
                type="email"
                value={bootstrapForm.email}
                onChange={(event) =>
                  setBootstrapForm({ ...bootstrapForm, email: event.target.value })
                }
                placeholder="Email"
                autoComplete="email"
              />
              <div className="relative">
                <input
                  className={inputClass() + " pr-12"}
                  type={showBootstrapPassword ? "text" : "password"}
                  value={bootstrapForm.adminPassword}
                  onChange={(event) =>
                    setBootstrapForm({ ...bootstrapForm, adminPassword: event.target.value })
                  }
                  placeholder="ADMIN_PASSWORD"
                  autoComplete="off"
                />
                <button
                  aria-label={passwordToggleLabel(showBootstrapPassword)}
                  className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 transition hover:bg-[#f0e3d7] hover:text-[#7f6250]"
                  type="button"
                  onClick={() => setShowBootstrapPassword((value) => !value)}
                >
                  {showBootstrapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                className="w-full rounded-full border border-[#8b6f5b] bg-white px-5 py-3 text-sm font-semibold text-[#8b6f5b] disabled:opacity-60"
                disabled={isSubmitting}
              >
                建立 super_admin
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
