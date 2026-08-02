import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  LockKeyhole,
  LogOut,
  PackageSearch,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getCustomerSupabaseClient, normalizeCustomerEmail } from "@/lib/shop/customerAuthClient";
import {
  buildCustomerProfileUpdatePayload,
  customerProfileUnlockMs,
  getCustomerAccountOrderSummary,
  getCustomerAccountOrderTypeLabel,
  getCustomerAccountTotalPages,
  getCustomerEmailVerificationLabel,
  getCustomerMemberLevelLabel,
  hasDefaultShippingProfile,
} from "@/lib/shop/customerAccountView";
import {
  fetchCustomerOrderDetail,
  fetchCustomerOrders,
  type CustomerOrderDetail,
  type CustomerOrdersPage,
} from "@/lib/shop/customerOrdersApi";
import { type CustomerProfile, type CustomerProfileUpdatePayload } from "@/lib/shop/customerProfileApi";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/shop/labels";

type ProfileFormState = Required<CustomerProfileUpdatePayload>;

const EMPTY_FORM: ProfileFormState = {
  name: "",
  phone: "",
  default_postal_code: "",
  default_city: "",
  default_district: "",
  default_address: "",
};

function getProfileFormState(profile: CustomerProfile | null): ProfileFormState {
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

function formatCurrency(value: number) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getReadonlyValue(value?: string | null) {
  return String(value || "").trim() || "尚未設定";
}

function getEmailVerifiedFromUser(user: ReturnType<typeof useCustomerAuth>["user"]) {
  const authUser = user as
    | {
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
      }
    | null
    | undefined;
  return Boolean(authUser?.email_confirmed_at || authUser?.confirmed_at);
}

function getLevelBadgeClass(memberLevel: unknown) {
  if (memberLevel === "diamond") return "border-sky-200 bg-sky-50 text-sky-700";
  if (memberLevel === "vip") return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-[#eadfce] bg-[#f3eadf] text-[#765d4a]";
}

function getDefaultShippingLine(profile: CustomerProfile | null) {
  if (!profile || !hasDefaultShippingProfile(profile)) return "尚未設定";
  return [
    profile.default_postal_code,
    profile.default_city,
    profile.default_district,
    profile.default_address,
  ]
    .filter(Boolean)
    .join(" ");
}

function AccountField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#f0e5d7] bg-white/70 px-4 py-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-stone-900">{value}</dd>
    </div>
  );
}

export default function CustomerAccount() {
  const [, setLocation] = useLocation();
  const {
    user,
    session,
    profile,
    isLoading,
    isProfileLoading,
    isAuthenticated,
    profileError,
    refreshProfile,
    signOut,
    updateProfile,
  } = useCustomerAuth();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [isEditUnlocked, setIsEditUnlocked] = useState(false);
  const [unlockExpiresAt, setUnlockExpiresAt] = useState<number | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersData, setOrdersData] = useState<CustomerOrdersPage | null>(null);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrderDetail | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [isOrderDetailLoading, setIsOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState("");

  const readonlyEmail = useMemo(() => profile?.email || user?.email || "", [profile?.email, user?.email]);
  const memberLevel = profile?.member_level || "normal";
  const memberLevelLabel = getCustomerMemberLevelLabel(memberLevel);
  const emailVerified = Boolean(profile?.email_verified || getEmailVerifiedFromUser(user));
  const emailVerificationLabel = getCustomerEmailVerificationLabel(emailVerified);
  const displayName = getReadonlyValue(profile?.name || user?.user_metadata?.name || "");
  const totalOrderPages = ordersData
    ? getCustomerAccountTotalPages(ordersData.total, ordersData.pageSize)
    : 1;

  useEffect(() => {
    if (!isEditUnlocked) {
      setForm(getProfileFormState(profile));
    }
  }, [isEditUnlocked, profile]);

  useEffect(() => {
    if (!isEditUnlocked || !unlockExpiresAt) return undefined;

    const remainingMs = unlockExpiresAt - Date.now();
    if (remainingMs <= 0) {
      setIsEditUnlocked(false);
      setUnlockExpiresAt(null);
      setForm(getProfileFormState(profile));
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsEditUnlocked(false);
      setUnlockExpiresAt(null);
      setForm(getProfileFormState(profile));
      setMessage("");
      setError("");
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [isEditUnlocked, profile, unlockExpiresAt]);

  function updateField(field: keyof ProfileFormState, value: string) {
    if (!isEditUnlocked) return;
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function lockProfileEditor() {
    setIsEditUnlocked(false);
    setUnlockExpiresAt(null);
    setForm(getProfileFormState(profile));
    setPasswordInput("");
    setPasswordError("");
    setIsPasswordDialogOpen(false);
  }

  async function handleSignOut() {
    await signOut();
    setLocation("/");
  }

  async function handlePasswordConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentPassword = passwordInput;
    setPasswordError("");

    if (!readonlyEmail || !currentPassword) {
      setPasswordInput("");
      setPasswordError("密碼不正確，請重新輸入。");
      return;
    }

    setIsVerifyingPassword(true);
    try {
      const supabase = getCustomerSupabaseClient();
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: normalizeCustomerEmail(readonlyEmail),
        password: currentPassword,
      });

      if (verifyError) throw verifyError;

      setPasswordInput("");
      setIsPasswordDialogOpen(false);
      setIsEditUnlocked(true);
      setUnlockExpiresAt(Date.now() + customerProfileUnlockMs);
      setMessage("資料修改已解鎖");
      setError("");
    } catch {
      setPasswordInput("");
      setPasswordError("密碼不正確，請重新輸入。");
    } finally {
      setIsVerifyingPassword(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isEditUnlocked) {
      setError("請先完成密碼確認。");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = buildCustomerProfileUpdatePayload(form);
      const updatedProfile = await updateProfile(payload);
      setForm(getProfileFormState(updatedProfile));
      setIsEditUnlocked(false);
      setUnlockExpiresAt(null);
      setMessage("會員資料已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "會員資料更新失敗，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  }

  const loadOrders = useCallback(
    async (page = 1) => {
      if (!session?.access_token) return;

      setIsOrdersLoading(true);
      setOrdersError("");

      try {
        const nextData = await fetchCustomerOrders(session.access_token, page);
        setOrdersData(nextData);
        setOrdersPage(nextData.page);
        setSelectedOrder(null);
        setSelectedOrderNumber("");
        setOrderDetailError("");
      } catch (loadError) {
        setOrdersError(loadError instanceof Error ? loadError.message : "歷史訂單載入失敗，請稍後再試。");
      } finally {
        setIsOrdersLoading(false);
      }
    },
    [session?.access_token],
  );

  async function loadOrderDetail(orderNumber: string) {
    if (!session?.access_token) return;

    setSelectedOrderNumber(orderNumber);
    setSelectedOrder(null);
    setOrderDetailError("");
    setIsOrderDetailLoading(true);

    try {
      const detail = await fetchCustomerOrderDetail(session.access_token, orderNumber);
      setSelectedOrder(detail);
    } catch (detailError) {
      setOrderDetailError(detailError instanceof Error ? detailError.message : "訂單詳情載入失敗，請稍後再試。");
    } finally {
      setIsOrderDetailLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      void loadOrders(1);
    }
  }, [isAuthenticated, loadOrders, session?.access_token]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOrdersData(null);
      setOrdersPage(1);
      setOrdersError("");
      setSelectedOrder(null);
      setSelectedOrderNumber("");
      setOrderDetailError("");
      lockProfileEditor();
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">Member Center</p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">會員中心</h1>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <p className="text-sm text-stone-500">正在確認會員登入狀態...</p>
          </section>
        )}

        {!isLoading && !isAuthenticated && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl text-stone-900">請先登入會員</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
              登入後即可查看會員資料與歷史訂單。
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                <Link href="/account/login?returnTo=/account">登入</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
                <Link href="/account/register">註冊會員</Link>
              </Button>
            </div>
          </section>
        )}

        {!isLoading && isAuthenticated && (
          <div className="space-y-6">
            {isProfileLoading && (
              <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                <p className="text-sm text-stone-500">正在載入會員資料...</p>
              </section>
            )}

            {!isProfileLoading && profileError && (
              <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">會員資料載入失敗</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{profileError}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                    onClick={() => void refreshProfile()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    重新載入
                  </Button>
                </div>
              </section>
            )}

            {!isProfileLoading && !profileError && profile && (
              <>
                <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
                        <UserRound className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-[#9f7868]">會員身分</p>
                        <h2 className="mt-1 truncate font-serif text-3xl text-stone-900">{displayName}</h2>
                        <p className="mt-1 break-all text-sm text-stone-500">{readonlyEmail}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${getLevelBadgeClass(memberLevel)}`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {memberLevelLabel}
                      </span>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          emailVerified
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {emailVerified ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        Email {emailVerificationLabel}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Profile</p>
                      <h2 className="mt-1 font-serif text-2xl text-stone-900">我的會員資料</h2>
                    </div>
                    {!isEditUnlocked ? (
                      <Button
                        type="button"
                        className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                        onClick={() => {
                          setPasswordError("");
                          setPasswordInput("");
                          setIsPasswordDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        修改會員資料
                      </Button>
                    ) : (
                      <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                        資料修改已解鎖
                      </div>
                    )}
                  </div>

                  {!isEditUnlocked && (
                    <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                      <AccountField label="姓名" value={getReadonlyValue(profile.name)} />
                      <AccountField label="手機" value={getReadonlyValue(profile.phone)} />
                      <AccountField label="Email" value={readonlyEmail || "尚未設定"} />
                      <AccountField label="會員等級" value={memberLevelLabel} />
                      <AccountField label="Email 驗證狀態" value={emailVerificationLabel} />
                      <AccountField label="加入日期" value={formatDateTime(profile.created_at)} />
                      <AccountField label="預設郵遞區號" value={getReadonlyValue(profile.default_postal_code)} />
                      <AccountField label="預設縣市" value={getReadonlyValue(profile.default_city)} />
                      <AccountField label="預設區域" value={getReadonlyValue(profile.default_district)} />
                      <AccountField label="預設收件地址" value={getDefaultShippingLine(profile)} />
                    </dl>
                  )}

                  {isEditUnlocked && (
                    <form className="mt-6" onSubmit={handleSave}>
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
                        <label className="grid gap-2 text-sm text-stone-600">
                          預設郵遞區號
                          <input
                            className={fieldClassName()}
                            value={form.default_postal_code}
                            maxLength={20}
                            onChange={(event) => updateField("default_postal_code", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-stone-600">
                          預設縣市
                          <input
                            className={fieldClassName()}
                            value={form.default_city}
                            maxLength={80}
                            onChange={(event) => updateField("default_city", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-stone-600">
                          預設區域
                          <input
                            className={fieldClassName()}
                            value={form.default_district}
                            maxLength={80}
                            onChange={(event) => updateField("default_district", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-stone-600 sm:col-span-2">
                          預設收件地址
                          <input
                            className={fieldClassName()}
                            value={form.default_address}
                            maxLength={300}
                            onChange={(event) => updateField("default_address", event.target.value)}
                          />
                        </label>
                      </div>

                      <div className="mt-4 grid gap-2 rounded-[8px] border border-[#f0e5d7] bg-white/70 px-4 py-3 text-sm text-stone-500 sm:grid-cols-2">
                        <span>會員等級：{memberLevelLabel}</span>
                        <span>Email 驗證狀態：{emailVerificationLabel}</span>
                      </div>

                      {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
                      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="submit"
                          disabled={isSaving}
                          className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                        >
                          <Save className="h-4 w-4" />
                          {isSaving ? "儲存中..." : "儲存資料"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                          onClick={() => {
                            lockProfileEditor();
                            setMessage("");
                            setError("");
                          }}
                        >
                          <X className="h-4 w-4" />
                          取消修改
                        </Button>
                        <p className="text-xs leading-5 text-stone-500">
                          解鎖最多維持 10 分鐘；Email、會員等級與驗證狀態維持唯讀。
                        </p>
                      </div>
                    </form>
                  )}

                  {!isEditUnlocked && message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
                  {!isEditUnlocked && error && <p className="mt-4 text-sm text-red-700">{error}</p>}
                </section>
              </>
            )}

            <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <PackageSearch className="mt-1 h-5 w-5 text-[#9f7868]" />
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Orders</p>
                    <h2 className="mt-1 font-serif text-2xl text-stone-900">歷史訂單</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                      目前顯示會員帳號綁定的商城訂單；住宿紀錄待正式會員訂房關聯完成後再納入。
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                  disabled={isOrdersLoading || !session?.access_token}
                  onClick={() => void loadOrders(ordersPage)}
                >
                  <RotateCcw className="h-4 w-4" />
                  重新載入
                </Button>
              </div>

              {isOrdersLoading && <p className="mt-6 text-sm text-stone-500">正在載入歷史訂單...</p>}
              {ordersError && <p className="mt-6 text-sm text-red-700">{ordersError}</p>}

              {!isOrdersLoading && !ordersError && ordersData && ordersData.items.length === 0 && (
                <div className="mt-6 rounded-[8px] border border-dashed border-[#d7c6b5] bg-white/70 p-6 text-center text-sm text-stone-500">
                  目前還沒有歷史訂單。
                </div>
              )}

              {!isOrdersLoading && !ordersError && ordersData && ordersData.items.length > 0 && (
                <div className="mt-6 space-y-3">
                  {ordersData.items.map((order) => (
                    <article key={order.order_number} className="rounded-[8px] border border-[#eadfce] bg-white/80 p-4">
                      <div className="grid gap-4 lg:grid-cols-[7rem_minmax(0,1fr)_9rem_9rem_8rem] lg:items-center">
                        <div>
                          <p className="text-xs text-stone-500">訂單類型</p>
                          <p className="mt-1 text-sm font-semibold text-[#765d4a]">
                            {getCustomerAccountOrderTypeLabel("shop")}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="break-all text-sm font-semibold text-stone-900">{order.order_number}</p>
                          <p className="mt-1 text-xs text-stone-500">{formatDateTime(order.created_at)}</p>
                          <p className="mt-2 text-sm text-stone-600">{getCustomerAccountOrderSummary(order)}</p>
                        </div>
                        <div className="text-sm text-stone-600">
                          <p className="text-xs text-stone-500">金額</p>
                          <p className="mt-1 font-semibold text-stone-900">{formatCurrency(order.total)}</p>
                        </div>
                        <div className="text-sm text-stone-600">
                          <p className="text-xs text-stone-500">狀態</p>
                          <p className="mt-1">{getOrderStatusLabel(order.order_status)}</p>
                          <p className="mt-1 text-xs text-stone-500">{getPaymentStatusLabel(order.payment_status)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-full border-[#eadfce] bg-[#fffdf8] px-4 hover:bg-[#f3eadf]"
                          onClick={() => void loadOrderDetail(order.order_number)}
                        >
                          查看詳情
                        </Button>
                      </div>
                    </article>
                  ))}

                  <div className="flex flex-col gap-3 border-t border-[#eadfce] pt-4 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      第 {ordersData.page}／{totalOrderPages} 頁
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                        disabled={isOrdersLoading || ordersData.page <= 1}
                        onClick={() => void loadOrders(Math.max(1, ordersData.page - 1))}
                      >
                        上一頁
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                        disabled={isOrdersLoading || ordersData.page >= totalOrderPages}
                        onClick={() => void loadOrders(Math.min(totalOrderPages, ordersData.page + 1))}
                      >
                        下一頁
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {(isOrderDetailLoading || orderDetailError || selectedOrder) && (
              <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                {isOrderDetailLoading && (
                  <p className="text-sm text-stone-500">正在載入 {selectedOrderNumber || "訂單"} 詳情...</p>
                )}

                {!isOrderDetailLoading && orderDetailError && (
                  <p className="text-sm text-red-700">{orderDetailError}</p>
                )}

                {!isOrderDetailLoading && selectedOrder && (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Order Detail</p>
                        <h3 className="mt-1 font-serif text-2xl text-stone-900">{selectedOrder.order_number}</h3>
                        <p className="mt-1 text-sm text-stone-500">{formatDateTime(selectedOrder.created_at)}</p>
                      </div>
                      <div className="grid gap-1 text-sm text-stone-600 sm:text-right">
                        <span>訂單狀態：{getOrderStatusLabel(selectedOrder.order_status)}</span>
                        <span>付款狀態：{getPaymentStatusLabel(selectedOrder.payment_status)}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-[8px] border border-[#eadfce] bg-white/75 p-4 text-sm text-stone-600 sm:grid-cols-2">
                      <p>收件人：{selectedOrder.customer.name || "-"}</p>
                      <p>電話：{selectedOrder.customer.phone || "-"}</p>
                      <p>Email：{selectedOrder.customer.email || "-"}</p>
                      <p>地址：{selectedOrder.customer.address || "-"}</p>
                      <p>配送方式：{selectedOrder.shipping_carrier || "尚未設定"}</p>
                      <p>追蹤編號：{selectedOrder.tracking_number || "-"}</p>
                    </div>

                    <div className="space-y-3">
                      {selectedOrder.items.map((item, index) => (
                        <div
                          key={`${item.product_name}-${item.variant_name}-${index}`}
                          className="flex flex-col gap-2 rounded-[8px] border border-[#eadfce] bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-stone-900">{item.product_name || "商品"}</p>
                            <p className="mt-1 text-xs text-stone-500">
                              {[item.variant_name, item.variant_option].filter(Boolean).join(" / ") || "單一規格"}
                            </p>
                          </div>
                          <div className="flex gap-4 text-sm text-stone-600">
                            <span>x {item.quantity}</span>
                            <span>{formatCurrency(item.unit_price)}</span>
                            <span className="font-semibold text-stone-900">{formatCurrency(item.line_total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="ml-auto max-w-xs space-y-2 rounded-[8px] bg-white/75 p-4 text-sm">
                      <div className="flex justify-between text-stone-500">
                        <span>商品小計</span>
                        <span>{formatCurrency(selectedOrder.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-stone-500">
                        <span>運費</span>
                        <span>{formatCurrency(selectedOrder.shipping_fee)}</span>
                      </div>
                      <div className="flex justify-between border-t border-[#eadfce] pt-2 font-semibold text-stone-900">
                        <span>總計</span>
                        <span>{formatCurrency(selectedOrder.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[#9f7868]">Sign out</p>
                  <h2 className="mt-1 font-serif text-2xl text-stone-900">登出</h2>
                </div>
                <Button
                  variant="outline"
                  className="h-11 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  登出並回首頁
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>

      {isPasswordDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-5 py-8 backdrop-blur-sm">
          <form
            className="w-full max-w-md rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-xl"
            onSubmit={handlePasswordConfirm}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-2xl text-stone-900">確認目前密碼</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  為保護您的會員資料，請輸入目前帳號密碼。
                </p>
              </div>
            </div>
            <label className="mt-5 grid gap-2 text-sm text-stone-600">
              目前密碼
              <input
                className={fieldClassName()}
                type="password"
                autoComplete="current-password"
                value={passwordInput}
                onChange={(event) => {
                  setPasswordInput(event.target.value);
                  setPasswordError("");
                }}
              />
            </label>
            {passwordError && <p className="mt-3 text-sm text-red-700">{passwordError}</p>}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                onClick={() => {
                  setPasswordInput("");
                  setPasswordError("");
                  setIsPasswordDialogOpen(false);
                }}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isVerifyingPassword}
                className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              >
                {isVerifyingPassword ? "確認中..." : "確認並解鎖"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <Footer />
    </div>
  );
}
