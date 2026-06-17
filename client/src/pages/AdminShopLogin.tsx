import { useState } from "react";
import { useLocation } from "wouter";
import { loginAdminAccount } from "@/lib/shop/adminIdentityApi";
import { setAdminSession } from "@/lib/shop/adminAuth";

function inputClass() {
  return "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]";
}

export default function AdminShopLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = new URLSearchParams(window.location.search).get("redirect") || "/admin/shop";

  async function handleAccountLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    try {
      await loginAdminAccount(email.trim(), password);
      setLocation(redirectTo);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLegacyLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!legacyPassword.trim()) {
      setMessage("請輸入舊版共用密碼。");
      return;
    }
    setAdminSession({
      accessToken: legacyPassword.trim(),
      authMode: "legacy",
      user: {
        authMode: "legacy",
        display_name: "舊版共用密碼",
        role_code: "legacy_admin",
        role_name: "舊版共用密碼",
        permissions: ["*"],
        is_active: true,
      },
    });
    setLocation(redirectTo);
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">MUMBAO ADMIN</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">後台登入</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            請使用個人 Email 與密碼登入。密碼由 Supabase Auth 管理，不會存放在自建資料表。
          </p>

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
              <span>密碼</span>
              <input
                className={inputClass()}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {message ? (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
            ) : null}
            <button
              className="w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "登入中..." : "使用個人帳號登入"}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">過渡期：舊版共用密碼</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            第一階段仍保留 ADMIN_PASSWORD，方便建立第一位 super_admin 與安全過渡。完成新帳號測試後，可再停用舊流程。
          </p>
          <form className="mt-5 space-y-3" onSubmit={handleLegacyLogin}>
            <input
              className={inputClass()}
              type="password"
              value={legacyPassword}
              onChange={(event) => setLegacyPassword(event.target.value)}
              placeholder="輸入舊版 ADMIN_PASSWORD"
              autoComplete="off"
            />
            <button className="w-full rounded-full border border-[#8b6f5b] bg-white px-5 py-3 text-sm font-semibold text-[#8b6f5b]">
              使用舊版共用密碼進入
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
