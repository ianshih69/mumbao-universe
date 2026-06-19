import { useEffect, useMemo, useState } from "react";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
  getInitialAdminAuthStatus,
  type AdminAuthStatus,
  type AdminIdentity,
} from "@/lib/shop/adminAuth";
import {
  deleteAdminAuditLog,
  deleteAdminAuditLogs,
  fetchAdminAuditLogs,
  type AdminAuditLog,
} from "@/lib/shop/adminIdentityApi";

const pageSize = 10;

type DeleteConfirmState = {
  mode: "single" | "batch";
  logs: AdminAuditLog[];
} | null;

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

function logSummary(log: AdminAuditLog) {
  return log.description || `${log.module}.${log.action}`;
}

function getSelectedTimeRange(logs: AdminAuditLog[]) {
  const timestamps = logs
    .map((log) => log.created_at)
    .filter(Boolean)
    .sort();
  return {
    earliest: timestamps[0] || null,
    latest: timestamps[timestamps.length - 1] || null,
  };
}

export default function AdminShopAuditLogs() {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ actor: "", module: "all", actionName: "all", date: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const isSuperAdmin = identity?.role_code === "super_admin";
  const selectedLogs = useMemo(
    () => logs.filter((log) => selectedIds.has(log.id)),
    [logs, selectedIds]
  );
  const allPageSelected = logs.length > 0 && logs.every((log) => selectedIds.has(log.id));

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setIdentity(getAdminIdentity());
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  function handleAuthError(error: unknown) {
    if (error instanceof Error && error.message === adminAuthExpiredMessage) {
      clearAdminToken();
      setAuthStatus("loggedOut");
      setIdentity(null);
      return true;
    }
    return false;
  }

  async function load(nextToken = token, nextPage = page) {
    if (!nextToken) return;
    setIsLoading(true);
    try {
      const data = await fetchAdminAuditLogs(nextToken, {
        ...filters,
        page: nextPage,
        pageSize,
      });
      const items = data.items || data.logs || [];
      setLogs(items);
      setPage(data.page || nextPage);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSelectedIds(new Set());
    } catch (error) {
      handleAuthError(error);
      setNotice(error instanceof Error ? error.message : "讀取操作紀錄失敗。");
    } finally {
      setIsLoading(false);
    }
  }

  function updateFilters(nextFilters: typeof filters) {
    setFilters(nextFilters);
    setPage(1);
    setSelectedIds(new Set());
  }

  function handleSearch() {
    setPage(1);
    setSelectedIds(new Set());
    void load(token, 1);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectPage() {
    setSelectedIds((current) => {
      if (allPageSelected) return new Set();
      const next = new Set(current);
      for (const log of logs) next.add(log.id);
      return next;
    });
  }

  function openSingleDelete(log: AdminAuditLog) {
    if (!isSuperAdmin) return;
    setDeleteConfirm({ mode: "single", logs: [log] });
  }

  function openBatchDelete() {
    if (!isSuperAdmin || !selectedLogs.length) return;
    setDeleteConfirm({ mode: "batch", logs: selectedLogs });
  }

  async function confirmDelete() {
    if (!token || !deleteConfirm?.logs.length || !isSuperAdmin) return;

    const ids = deleteConfirm.logs.map((log) => log.id);
    setNotice("");
    setIsBatchDeleting(deleteConfirm.mode === "batch");
    if (deleteConfirm.mode === "single") setDeletingLogId(ids[0]);

    try {
      if (deleteConfirm.mode === "single") {
        await deleteAdminAuditLog(token, ids[0]);
      } else {
        await deleteAdminAuditLogs(token, ids);
      }

      setDeleteConfirm(null);
      setSelectedIds(new Set());
      setNotice(deleteConfirm.mode === "single" ? "操作紀錄已刪除。" : `已刪除 ${ids.length} 筆操作紀錄。`);
      const nextPage = logs.length <= ids.length && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await load(token, nextPage);
      }
    } catch (error) {
      handleAuthError(error);
      setNotice(error instanceof Error ? error.message : "刪除操作紀錄失敗。");
    } finally {
      setDeletingLogId("");
      setIsBatchDeleting(false);
    }
  }

  useEffect(() => {
    if (authStatus === "loggedIn" && token) void load(token, page);
  }, [authStatus, token, page]);

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

  const confirmLogs = deleteConfirm?.logs || [];
  const confirmRange = getSelectedTimeRange(confirmLogs);
  const isDeleting = isBatchDeleting || Boolean(deletingLogId);

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
              <input className={inputClass()} value={filters.actor} onChange={(event) => updateFilters({ ...filters, actor: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>模組</span>
              <select className={inputClass()} value={filters.module} onChange={(event) => updateFilters({ ...filters, module: event.target.value })}>
                <option value="all">全部</option>
                <option value="auth">登入</option>
                <option value="users">使用者</option>
                <option value="warehouse">倉儲與資產</option>
                <option value="audit_logs">操作紀錄</option>
                <option value="social">社群</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>動作</span>
              <select className={inputClass()} value={filters.actionName} onChange={(event) => updateFilters({ ...filters, actionName: event.target.value })}>
                <option value="all">全部</option>
                <option value="create">新增</option>
                <option value="update">編輯</option>
                <option value="delete">刪除</option>
                <option value="delete_audit_log">刪除操作紀錄</option>
                <option value="delete_audit_logs">批次刪除操作紀錄</option>
                <option value="adjust_quantity">數量調整</option>
                <option value="login">登入</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">
              <span>日期</span>
              <input className={inputClass()} type="date" value={filters.date} onChange={(event) => updateFilters({ ...filters, date: event.target.value })} />
            </label>
            <button className="rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isLoading} onClick={handleSearch}>
              查詢
            </button>
          </div>
        </section>

        {notice ? <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">{notice}</div> : null}

        <section className="mt-6 space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-600 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>共 {total} 筆</span>
              <span>第 {page} 頁 / 共 {totalPages} 頁</span>
              {isSuperAdmin ? (
                <>
                  <label className="inline-flex items-center gap-2 font-medium text-stone-700">
                    <input
                      checked={allPageSelected}
                      className="h-4 w-4 rounded border-stone-300 text-[#8b6f5b]"
                      disabled={isDeleting || !logs.length}
                      onChange={toggleSelectPage}
                      type="checkbox"
                    />
                    全選本頁
                  </label>
                  <span>已選 {selectedIds.size} 筆</span>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin ? (
                <button
                  className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!selectedIds.size || isDeleting}
                  onClick={openBatchDelete}
                  type="button"
                >
                  {isBatchDeleting ? "刪除中..." : "刪除已選"}
                </button>
              ) : null}
              <button
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page <= 1 || isLoading || isDeleting}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                上一頁
              </button>
              <button
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page >= totalPages || isLoading || isDeleting}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                下一頁
              </button>
            </div>
          </div>

          {isLoading ? <p className="text-sm text-stone-500">讀取中...</p> : null}
          {logs.map((log) => (
            <article key={log.id} className="rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 gap-3">
                  {isSuperAdmin ? (
                    <input
                      checked={selectedIds.has(log.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-[#8b6f5b]"
                      disabled={isDeleting}
                      onChange={() => toggleSelected(log.id)}
                      type="checkbox"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">{logSummary(log)}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {log.actor_name || "系統"} {log.actor_email ? `｜${log.actor_email}` : ""} ｜ {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">{log.module}</span>
                  <span className="rounded-full bg-[#efe5da] px-3 py-1 text-[#8b6f5b]">{log.action}</span>
                  {log.target_type ? <span className="rounded-full bg-white px-3 py-1 text-stone-500">{log.target_type}</span> : null}
                  {isSuperAdmin ? (
                    <button
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isDeleting}
                      onClick={() => openSingleDelete(log)}
                      type="button"
                    >
                      {deletingLogId === log.id ? "刪除中..." : "刪除"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!logs.length && !isLoading ? <p className="rounded-2xl bg-white p-5 text-sm text-stone-500">目前沒有符合條件的操作紀錄。</p> : null}
        </section>
      </div>

      {deleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-8">
          <div className="w-full max-w-lg rounded-[24px] border border-stone-200 bg-white p-6 shadow-xl">
            <p className="text-xs uppercase tracking-[0.22em] text-red-500">DELETE AUDIT LOGS</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              確認刪除 {confirmLogs.length} 筆操作紀錄
            </h2>
            <div className="mt-4 space-y-2 rounded-2xl bg-[#f7f1e9] p-4 text-sm text-stone-700">
              <p>已選筆數：{confirmLogs.length}</p>
              <p>最早時間：{formatDate(confirmRange.earliest)}</p>
              <p>最晚時間：{formatDate(confirmRange.latest)}</p>
              <div>
                <p className="font-medium text-stone-800">摘要預覽</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {confirmLogs.slice(0, 3).map((log) => (
                    <li key={log.id}>{logSummary(log)}</li>
                  ))}
                  {confirmLogs.length > 3 ? <li>另有 {confirmLogs.length - 3} 筆...</li> : null}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-red-600">刪除後無法復原。</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-600 disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => setDeleteConfirm(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {isDeleting ? "刪除中..." : `確認刪除 ${confirmLogs.length} 筆`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
