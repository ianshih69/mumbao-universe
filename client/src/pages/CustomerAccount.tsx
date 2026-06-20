import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LogOut, PackageSearch, RotateCcw, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import type { CustomerProfileUpdatePayload } from "@/lib/shop/customerProfileApi";

type AccountTab = "profile" | "address" | "orders";

type ProfileFormState = Required<CustomerProfileUpdatePayload>;

const EMPTY_FORM: ProfileFormState = {
  name: "",
  phone: "",
  default_postal_code: "",
  default_city: "",
  default_district: "",
  default_address: "",
};

const DISABLED_ACCOUNT_MESSAGE = "此會員帳號目前已停用，請聯絡客服。";

function getProfileFormState(profile: ReturnType<typeof useCustomerAuth>["profile"]): ProfileFormState {
  if (!profile) return EMPTY_FORM;
  return {
    name: profile.name || "",
    phone: profile.phone || "",
    default_postal_code: profile.default_postal_code || "",
    default_city: profile.default_city || "",
    default_district: profile.default_district || "",
    default_address: profile.default_address || "",
  };
}

function fieldClassName() {
  return "h-11 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

export default function CustomerAccount() {
  const [, setLocation] = useLocation();
  const {
    user,
    profile,
    isLoading,
    isProfileLoading,
    isAuthenticated,
    profileError,
    refreshProfile,
    signOut,
    updateProfile,
  } = useCustomerAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(getProfileFormState(profile));
  }, [profile]);

  const readonlyEmail = useMemo(() => profile?.email || user?.email || "", [profile?.email, user?.email]);
  const isAccountDisabled = profileError === DISABLED_ACCOUNT_MESSAGE;

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  async function handleSignOut() {
    await signOut();
    setLocation("/shop");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      await updateProfile(form);
      setMessage("會員資料已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "會員資料暫時無法更新，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">Member Center</p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">會員中心</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            管理你的會員基本資料與預設收件資訊。訪客結帳仍然可以照常使用。
          </p>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <p className="text-sm text-stone-500">正在讀取會員登入狀態...</p>
          </section>
        )}

        {!isLoading && !isAuthenticated && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl text-stone-900">請先登入會員</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
              登入後即可管理會員資料。尚未登入也可以繼續逛商城與完成訪客結帳。
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                <Link href="/account/login?returnTo=/account">登入</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
                <Link href="/account/register">建立會員帳號</Link>
              </Button>
            </div>
          </section>
        )}

        {!isLoading && isAuthenticated && (
          <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9f7868]">Signed in</p>
                  <p className="truncate text-sm font-medium text-stone-800">{readonlyEmail || "會員帳號"}</p>
                </div>
              </div>

              <nav className="mt-5 grid gap-2">
                {[
                  ["profile", "個人資料"],
                  ["address", "預設收件資料"],
                  ["orders", "歷史訂單"],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    className={`rounded-full px-4 py-2 text-left text-sm transition ${
                      activeTab === tab
                        ? "bg-[#8b6f5b] text-white"
                        : "bg-white text-stone-600 hover:bg-[#f3eadf]"
                    }`}
                    onClick={() => setActiveTab(tab as AccountTab)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <Button
                variant="outline"
                className="mt-5 h-10 w-full rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                登出
              </Button>
            </aside>

            <div className="space-y-4">
              {isProfileLoading && (
                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <p className="text-sm text-stone-500">正在讀取會員資料...</p>
                </div>
              )}

              {!isProfileLoading && profileError && (
                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-serif text-2xl text-stone-900">
                        {isAccountDisabled ? "會員帳號已停用" : "會員資料讀取失敗"}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{profileError}</p>
                    </div>
                    {!isAccountDisabled && (
                      <Button
                        variant="outline"
                        className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                        onClick={() => void refreshProfile()}
                      >
                        <RotateCcw className="h-4 w-4" />
                        重新讀取
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {!isProfileLoading && !profileError && (
                <>
                  {activeTab !== "orders" && (
                    <form
                      className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60"
                      onSubmit={handleSave}
                    >
                      <div className="mb-5">
                        <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">
                          {activeTab === "profile" ? "Profile" : "Shipping"}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl text-stone-900">
                          {activeTab === "profile" ? "個人資料" : "預設收件資料"}
                        </h2>
                      </div>

                      {activeTab === "profile" && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-2 text-sm text-stone-600 sm:col-span-2">
                            Email
                            <input
                              className={`${fieldClassName()} bg-[#f7f0e8] text-stone-500`}
                              value={readonlyEmail}
                              readOnly
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            姓名
                            <input
                              className={fieldClassName()}
                              value={form.name}
                              maxLength={80}
                              onChange={(event) => updateField("name", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            手機
                            <input
                              className={fieldClassName()}
                              value={form.phone}
                              maxLength={40}
                              onChange={(event) => updateField("phone", event.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {activeTab === "address" && (
                        <div className="grid gap-4 sm:grid-cols-3">
                          <label className="grid gap-2 text-sm text-stone-600">
                            郵遞區號
                            <input
                              className={fieldClassName()}
                              value={form.default_postal_code}
                              maxLength={20}
                              onChange={(event) => updateField("default_postal_code", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            縣市
                            <input
                              className={fieldClassName()}
                              value={form.default_city}
                              maxLength={80}
                              onChange={(event) => updateField("default_city", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600">
                            區域
                            <input
                              className={fieldClassName()}
                              value={form.default_district}
                              maxLength={80}
                              onChange={(event) => updateField("default_district", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-2 text-sm text-stone-600 sm:col-span-3">
                            詳細地址
                            <input
                              className={fieldClassName()}
                              value={form.default_address}
                              maxLength={300}
                              onChange={(event) => updateField("default_address", event.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
                      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="submit"
                          disabled={isSaving}
                          className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                        >
                          {isSaving ? "儲存中..." : "儲存會員資料"}
                        </Button>
                        <p className="text-xs leading-5 text-stone-500">
                          Email 由登入帳號管理，如需更改 Email，未來會提供獨立驗證流程。
                        </p>
                      </div>
                    </form>
                  )}

                  {activeTab === "orders" && (
                    <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                      <div className="flex items-start gap-3">
                        <PackageSearch className="mt-1 h-5 w-5 text-[#9f7868]" />
                        <div>
                          <h2 className="font-serif text-2xl text-stone-900">歷史訂單即將推出</h2>
                          <p className="mt-2 text-sm leading-6 text-stone-500">
                            下一階段會加入會員訂單綁定與歷史訂單查詢。本頁目前不顯示假資料。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
