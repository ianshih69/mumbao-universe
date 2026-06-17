import { useEffect, useState } from "react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminToken,
  getInitialAdminAuthStatus,
  type AdminAuthStatus,
} from "@/lib/shop/adminAuth";
import { fetchAdminAuditLogs, type AdminAuditLog } from "@/lib/shop/adminIdentityApi";

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

export default function AdminShopAuditLogs() {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ actor: "", module: "all", actionName: "all", date: "" });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(nextToken = token) {
    if (!nextToken) return;
    setIsLoading(true);
    try {
      const data = await fetchAdminAuditLogs(nextToken, filters);
      setLogs(data.logs || []);
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "讀取操作紀錄失敗。");
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
          <a className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" href="/admin/shop/login?redirect=/admin/shop/audit-logs">
            前往登入
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="audit" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">AUDIT LOGS</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">操作紀錄</h1>
          <p className="mt-2 text-sm text-stone-600">記錄重要寫入操作，不包含密碼、token 或 secret。</p>
        </div>

        <section className="mt-6 rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-end">
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>使用者 Email / 姓名</span>
              <input className={inputClass()} value={filters.actor} onChange={(event) => setFilters({ ...filters, actor: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>模組</span>
              <select className={inputClass()} value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })}>
                <option value="all">全部</option>
                <option value="auth">登入</option>
                <option value="users">使用者</option>
                <option value="warehouse">倉儲與資產</option>
                <option value="social">社群</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>動作</span>
              <select className={inputClass()} value={filters.actionName} onChange={(event) => setFilters({ ...filters, actionName: event.target.value })}>
                <option value="all">全部</option>
                <option value="create">新增</option>
                <option value="update">編輯</option>
                <option value="delete">刪除</option>
                <option value="adjust_quantity">數量調整</option>
                <option value="login">登入</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>日期</span>
              <input className={inputClass()} type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
            </label>
            <button className="rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white" onClick={() => void load()}>
              查詢
            </button>
          </div>
        </section>

        {notice ? <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">{notice}</div> : null}

        <section className="mt-6 space-y-3">
          {isLoading ? <p className="text-sm text-stone-500">讀取中...</p> : null}
          {logs.map((log) => (
            <article key={log.id} className="rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-stone-900">{log.description || `${log.module}.${log.action}`}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {log.actor_name || "系統"} {log.actor_email ? `｜${log.actor_email}` : ""} ｜ {formatDate(log.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">{log.module}</span>
                  <span className="rounded-full bg-[#efe5da] px-3 py-1 text-[#8b6f5b]">{log.action}</span>
                  {log.target_type ? <span className="rounded-full bg-white px-3 py-1 text-stone-500">{log.target_type}</span> : null}
                </div>
              </div>
            </article>
          ))}
          {!logs.length && !isLoading ? <p className="rounded-2xl bg-white p-5 text-sm text-stone-500">目前沒有符合條件的操作紀錄。</p> : null}
        </section>
      </div>
    </main>
  );
}
