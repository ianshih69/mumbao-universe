import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
import AdminShopNav from "@/components/shop/AdminShopNav";
import { Button } from "@/components/ui/button";
import {
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
} from "@/lib/shop/adminAuth";
import {
  isMissingSupabasePublicConfig,
  isSupabaseAuthUnauthorized,
  updateCurrentSupabasePassword,
  verifyCurrentSupabasePassword,
} from "@/lib/shop/supabaseAuthClient";

type PasswordField = "current" | "next" | "confirm";

const passwordLabels: Record<PasswordField, string> = {
  current: "目前密碼",
  next: "新密碼",
  confirm: "再輸入一次新密碼",
};

function inputClass() {
  return "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]";
}

function getPasswordError({
  currentPassword,
  nextPassword,
  confirmPassword,
}: {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
}) {
  if (!currentPassword) return "請輸入目前密碼。";
  if (nextPassword.length < 12) return "新密碼至少需要 12 碼。";
  if (nextPassword !== confirmPassword) return "新密碼與確認密碼不一致。";
  if (nextPassword === currentPassword) return "新密碼不可與目前密碼相同。";
  return "";
}

function PasswordInput({
  id,
  value,
  isVisible,
  onChange,
  onToggle,
  autoComplete,
}: {
  id: PasswordField;
  value: string;
  isVisible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-stone-700">
      <span>{passwordLabels[id]}</span>
      <span className="relative block">
        <input
          className={`${inputClass()} pr-12`}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
        />
        <button
          aria-label={isVisible ? `隱藏${passwordLabels[id]}` : `顯示${passwordLabels[id]}`}
          className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 transition hover:bg-[#f0e3d7] hover:text-[#7f6250]"
          type="button"
          onClick={onToggle}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

export default function AdminShopAccount() {
  const [, setLocation] = useLocation();
  const token = getAdminToken();
  const identity = getAdminIdentity();
  const email = identity?.email || "";
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visibleFields, setVisibleFields] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const redirectToLogin = () => {
    setLocation("/admin/shop/login?redirect=/admin/shop");
  };

  const logout = () => {
    clearAdminToken();
    redirectToLogin();
  };

  const toggleVisible = (field: PasswordField) => {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSuccess("");
    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedNextPassword = nextPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    const validationError = getPasswordError({
      currentPassword: trimmedCurrentPassword,
      nextPassword: trimmedNextPassword,
      confirmPassword: trimmedConfirmPassword,
    });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    if (!token || !email) {
      setMessage("登入狀態不完整，請重新登入後再試。");
      return;
    }

    setIsSaving(true);
    try {
      try {
        await verifyCurrentSupabasePassword(email.trim(), trimmedCurrentPassword);
      } catch (error) {
        if (isMissingSupabasePublicConfig(error)) {
          setMessage("尚未設定 Supabase 公開 Auth 設定，請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。");
        } else {
          setMessage("目前密碼錯誤，請重新輸入。");
        }
        return;
      }

      await updateCurrentSupabasePassword(token, trimmedNextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setSuccess("密碼已更新，請重新登入。");
      clearAdminToken();
      window.setTimeout(redirectToLogin, 1400);
    } catch (error) {
      if (isMissingSupabasePublicConfig(error)) {
        setMessage("尚未設定 Supabase 公開 Auth 設定，請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。");
      } else if (isSupabaseAuthUnauthorized(error)) {
        setMessage("登入狀態已失效，請重新登入。");
        clearAdminToken();
        window.setTimeout(redirectToLogin, 1200);
      } else {
        setMessage("密碼更新失敗，請稍後再試。");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-900">
        <section className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">MUMBAO Admin</p>
              <h1 className="text-2xl font-semibold">請先登入後台</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-stone-600">
            請使用個人管理員帳號登入後再修改帳號密碼。
          </p>
          <Link
            href="/admin/shop/login?redirect=/admin/shop/account"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white hover:bg-[#765d4a]"
          >
            使用個人帳號登入
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-7 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              帳號設定
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              修改目前登入帳號的 Supabase Auth 密碼。系統會先用目前密碼重新驗證一次。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminShopHeaderLinks />
            <Button variant="ghost" className="hidden rounded-full md:inline-flex" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="account" />

      <div className="mx-auto max-w-3xl px-5 py-6 md:px-8 md:py-8">
        <section className="rounded-[8px] border border-stone-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-stone-900">修改密碼</h2>
              <p className="mt-1 text-sm text-stone-500">
                目前帳號：{email || "未取得 Email，請重新登入"}
              </p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <PasswordInput
              id="current"
              value={currentPassword}
              isVisible={visibleFields.current}
              onChange={setCurrentPassword}
              onToggle={() => toggleVisible("current")}
              autoComplete="current-password"
            />
            <PasswordInput
              id="next"
              value={nextPassword}
              isVisible={visibleFields.next}
              onChange={setNextPassword}
              onToggle={() => toggleVisible("next")}
              autoComplete="new-password"
            />
            <PasswordInput
              id="confirm"
              value={confirmPassword}
              isVisible={visibleFields.confirm}
              onChange={setConfirmPassword}
              onToggle={() => toggleVisible("confirm")}
              autoComplete="new-password"
            />

            {message ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {message}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-stone-500">
                新密碼至少 12 碼，且不可與目前密碼相同。
              </p>
              <Button
                type="submit"
                className="h-11 rounded-full bg-[#8b6f5b] px-6 text-white hover:bg-[#765d4a]"
                disabled={isSaving || Boolean(success)}
              >
                {isSaving ? "更新中..." : "更新密碼"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
