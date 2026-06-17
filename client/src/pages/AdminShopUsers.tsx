import { useEffect, useState } from "react";
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
  bootstrapSuperAdmin,
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
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    password: "",
    role_code: "cleaner",
    is_active: true,
  });
  const [bootstrapForm, setBootstrapForm] = useState({
    legacyAdminPassword: "",
    displayName: "",
    email: "",
    password: "",
  });

  const identity = getAdminIdentity();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(nextToken = token) {
    if (!nextToken) return;
    setIsLoading(true);
    try {
      const session = await fetchAdminSession(nextToken);
      setAdminSession({ accessToken: nextToken, user: session.user, authMode: session.authMode });
      const data = await fetchAdminUsers(nextToken);
      setUsers(data.users || []);
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "讀取使用者失敗。");
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
    try {
      await createAdminUser(token, form);
      setForm({ display_name: "", email: "", password: "", role_code: "cleaner", is_active: true });
      setNotice("使用者已建立。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立使用者失敗。");
    }
  }

  async function handleBootstrap(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    try {
      await bootstrapSuperAdmin(bootstrapForm);
      setBootstrapForm({ legacyAdminPassword: "", displayName: "", email: "", password: "" });
      setNotice("第一位 super_admin 已建立，請使用個人帳號登入。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立 super_admin 失敗。");
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
              <input className={inputClass()} placeholder="初始密碼" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <select className={inputClass()} value={form.role_code} onChange={(event) => setForm({ ...form, role_code: event.target.value })}>
                {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                啟用帳號
              </label>
              <button className="w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white">新增使用者</button>
            </form>
          </section>

          <section className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">建立第一位 super_admin</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              僅在系統尚無任何後台帳號時可使用。需要輸入舊版 ADMIN_PASSWORD。
            </p>
            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleBootstrap}>
              <input className={inputClass()} placeholder="舊版 ADMIN_PASSWORD" type="password" value={bootstrapForm.legacyAdminPassword} onChange={(event) => setBootstrapForm({ ...bootstrapForm, legacyAdminPassword: event.target.value })} />
              <input className={inputClass()} placeholder="姓名" value={bootstrapForm.displayName} onChange={(event) => setBootstrapForm({ ...bootstrapForm, displayName: event.target.value })} />
              <input className={inputClass()} placeholder="Email" type="email" value={bootstrapForm.email} onChange={(event) => setBootstrapForm({ ...bootstrapForm, email: event.target.value })} />
              <input className={inputClass()} placeholder="初始密碼" type="password" value={bootstrapForm.password} onChange={(event) => setBootstrapForm({ ...bootstrapForm, password: event.target.value })} />
              <button className="rounded-full border border-[#8b6f5b] bg-white px-5 py-3 text-sm font-semibold text-[#8b6f5b] md:col-span-2">建立 super_admin</button>
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
                    if (password) void patchUser(user.id, { password });
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
