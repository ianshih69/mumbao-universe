import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
  getInitialAdminAuthStatus,
  setAdminSession,
  type AdminAuthStatus,
} from "@/lib/shop/adminAuth";
import {
  createAdminUser,
  fetchAdminSession,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
} from "@/lib/shop/adminIdentityApi";

const roleOptions = [
  { value: "super_admin", label: "超級管理員" },
  { value: "admin", label: "一般管理員" },
  { value: "housekeeper", label: "管家" },
  { value: "cleaner", label: "清潔人員" },
];

function inputClass() {
  return "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminShopUsers() {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    password: "",
    role_code: "cleaner",
    is_active: true,
  });
  const identity = getAdminIdentity();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(nextToken = token, options: { rethrow?: boolean } = {}) {
    if (!nextToken) return [];
    setIsLoading(true);
    try {
      const session = await fetchAdminSession(nextToken);
      setAdminSession({ accessToken: nextToken, user: session.user, authMode: session.authMode });
      const data = await fetchAdminUsers(nextToken);
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      return nextUsers;
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "讀取使用者失敗。");
      if (options.rethrow) throw error;
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (authStatus === "loggedIn" && token) void load(token);
  }, [authStatus, token]);

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#f7f1e9] p-8 text-stone-600">確認登入狀態中...</main>;
  }

  if (authStatus === "loggedOut") {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-md rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">請先登入後台</h1>
          <p className="mt-2 text-sm text-stone-600">使用者管理需要後台權限。</p>
          <a className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" href="/admin/shop/login?redirect=/admin/shop/users">
            前往登入
          </a>
        </div>
      </main>
    );
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    const currentToken = token || getAdminToken();
    if (!currentToken) {
      clearAdminToken();
      setAuthStatus("loggedOut");
      return;
    }

    setIsCreating(true);
    try {
      const data = await createAdminUser(currentToken, {
        ...form,
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
      });
      if (!data.user?.id) {
        throw new Error("使用者建立回應不完整，請重新整理確認。");
      }
      const nextUsers = await load(currentToken, { rethrow: true });
      if (!nextUsers.some((user) => user.id === data.user.id)) {
        throw new Error("使用者已建立，但列表重新讀取未包含新帳號，請重新整理確認。");
      }
      setForm({ display_name: "", email: "", password: "", role_code: "cleaner", is_active: true });
      setShowInitialPassword(false);
      setNotice("使用者已建立。");
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setShowInitialPassword(false);
      setNotice(error instanceof Error ? error.message : "建立使用者失敗。");
    } finally {
      setIsCreating(false);
    }
  }

  async function patchUser(id: string, payload: Record<string, unknown>) {
    setNotice("");
    try {
      await updateAdminUser(token, id, payload);
      setNotice("使用者已更新。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新使用者失敗。");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="users" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">ADMIN USERS</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">後台使用者</h1>
            <p className="mt-2 text-sm text-stone-600">
              目前登入：{identity?.display_name || "後台使用者"}，角色：{identity?.role_name || identity?.role_code || "管理員"}
            </p>
          </div>
          <button
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600"
            onClick={() => void load()}
          >
            重新整理
          </button>
        </div>

        {notice ? <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">{notice}</div> : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">新增使用者</h2>
            <form className="mt-4 space-y-3" onSubmit={handleCreate}>
              <input className={inputClass()} placeholder="姓名" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} />
              <input className={inputClass()} placeholder="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <div className="relative">
                <input
                  className={`${inputClass()} pr-12`}
                  placeholder="初始密碼"
                  type={showInitialPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
                <button
                  aria-label={showInitialPassword ? "隱藏密碼" : "顯示密碼"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                  onClick={() => setShowInitialPassword((visible) => !visible)}
                  type="button"
                >
                  {showInitialPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <select className={inputClass()} value={form.role_code} onChange={(event) => setForm({ ...form, role_code: event.target.value })}>
                {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                啟用帳號
              </label>
              <button
                className="w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreating}
              >
                {isCreating ? "建立中..." : "新增使用者"}
              </button>
            </form>
          </section>
        </div>

        <section className="mt-6 rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">使用者列表</h2>
          {isLoading ? <p className="mt-4 text-sm text-stone-500">讀取中...</p> : null}
          <div className="mt-4 space-y-3">
            {users.map((user) => (
              <div key={user.id} className="grid gap-3 rounded-2xl border border-stone-200 bg-[#fffaf4] p-4 md:grid-cols-[1.2fr_1.2fr_1fr_0.8fr_1.4fr] md:items-center">
                <div>
                  <p className="font-semibold text-stone-900">{user.display_name}</p>
                  <p className="text-sm text-stone-500">{user.email}</p>
                </div>
                <select className={inputClass()} value={user.role_code} onChange={(event) => void patchUser(user.id, { role_code: event.target.value })}>
                  {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
                  {user.is_active ? "啟用" : "停用"}
                </span>
                <p className="text-xs text-stone-500">最後登入<br />{formatDate(user.last_login_at)}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm" onClick={() => {
                    const displayName = window.prompt("請輸入新的姓名", user.display_name);
                    if (displayName) void patchUser(user.id, { display_name: displayName });
                  }}>
                    編輯姓名
                  </button>
                  <button className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm" onClick={() => {
                    const password = window.prompt("請輸入新的臨時密碼");
                    const trimmedPassword = password?.trim() || "";
                    if (trimmedPassword) void patchUser(user.id, { password: trimmedPassword });
                  }}>
                    重設密碼
                  </button>
                  <button className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" onClick={() => void patchUser(user.id, { is_active: !user.is_active })}>
                    {user.is_active ? "停用" : "啟用"}
                  </button>
                </div>
              </div>
            ))}
            {!users.length && !isLoading ? <p className="text-sm text-stone-500">目前尚未建立後台使用者。</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
