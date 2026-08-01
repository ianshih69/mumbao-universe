import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, Trash2 } from "lucide-react";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
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
  deleteAdminMember,
  fetchAdminMemberDetail,
  fetchAdminMembers,
  fetchAdminSession,
  type AdminMember,
  type AdminMemberDetailResponse,
} from "@/lib/shop/adminIdentityApi";

const pageSize = 20;

function inputClassName(extra = "") {
  return `w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8] ${extra}`;
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getStatusClassName(member: AdminMember) {
  if (member.profile_status === "admin_user") return "bg-sky-100 text-sky-700";
  if (member.profile_status === "normal") return "bg-emerald-100 text-emerald-700";
  if (member.profile_status === "email_not_verified") return "bg-amber-100 text-amber-700";
  if (member.profile_status === "missing_profile") return "bg-rose-100 text-rose-700";
  return "bg-stone-200 text-stone-700";
}

function getVerifiedClassName(member: AdminMember) {
  return member.email_verified
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";
}

type DeleteDialogState = {
  member: AdminMember;
  detail: AdminMemberDetailResponse | null;
  confirmEmail: string;
  isLoading: boolean;
  isDeleting: boolean;
  error: string;
};

export default function AdminMembers() {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchLimited, setSearchLimited] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const identity = getAdminIdentity();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(nextToken = token, nextPage = page, search = activeSearch) {
    if (!nextToken) return;
    setIsLoading(true);
    setNotice("");
    try {
      const session = await fetchAdminSession(nextToken);
      setAdminSession({
        accessToken: nextToken,
        user: session.user,
        authMode: session.authMode,
      });
      const data = await fetchAdminMembers(nextToken, {
        page: nextPage,
        pageSize,
        search,
      });
      setMembers(data.members || []);
      setPage(data.page || nextPage);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setSearchLimited(Boolean(data.searchLimited));
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "讀取會員列表失敗。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (authStatus === "loggedIn" && token) void load(token, page, activeSearch);
  }, [authStatus, token, page, activeSearch]);

  const visibleRange = useMemo(() => {
    if (!total) return "0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}-${end}`;
  }, [page, total]);

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#f7f1e9] p-8 text-stone-600">確認登入狀態中...</main>;
  }

  if (authStatus === "loggedOut") {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-md rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">請先登入後台</h1>
          <p className="mt-2 text-sm text-stone-600">會員管理需要後台權限。</p>
          <a
            className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white"
            href="/admin/shop/login?redirect=/admin/members"
          >
            前往登入
          </a>
        </div>
      </main>
    );
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
  }

  async function openDeleteDialog(member: AdminMember) {
    setDeleteDialog({
      member,
      detail: null,
      confirmEmail: "",
      isLoading: true,
      isDeleting: false,
      error: "",
    });
    try {
      const detail = await fetchAdminMemberDetail(token, member.auth_user_id);
      setDeleteDialog((current) =>
        current?.member.auth_user_id === member.auth_user_id
          ? { ...current, detail, isLoading: false }
          : current
      );
    } catch (error) {
      setDeleteDialog((current) =>
        current?.member.auth_user_id === member.auth_user_id
          ? {
              ...current,
              isLoading: false,
              error: error instanceof Error ? error.message : "讀取會員刪除資訊失敗。",
            }
          : current
      );
    }
  }

  async function confirmDelete() {
    if (!deleteDialog || !deleteDialog.detail) return;
    const currentMember = deleteDialog.detail.member;
    setDeleteDialog({ ...deleteDialog, isDeleting: true, error: "" });
    try {
      const result = await deleteAdminMember(
        token,
        currentMember.auth_user_id,
        deleteDialog.confirmEmail
      );
      setNotice(result.message || "會員帳號已刪除。");
      setDeleteDialog(null);
      await load(token, page, activeSearch);
    } catch (error) {
      setDeleteDialog((current) =>
        current
          ? {
              ...current,
              isDeleting: false,
              error: error instanceof Error ? error.message : "會員帳號刪除失敗，請稍後再試。",
            }
          : current
      );
    }
  }

  const canDeleteSelected =
    Boolean(deleteDialog?.detail) &&
    Boolean(deleteDialog?.detail?.deletion.can_delete) &&
    !deleteDialog?.detail?.deletion.hasBusinessRecords &&
    normalizeEmail(deleteDialog?.confirmEmail || "") ===
      normalizeEmail(deleteDialog?.detail?.member.email || "");

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="members" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">MEMBERS</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">會員管理</h1>
            <p className="mt-2 text-sm text-stone-600">
              目前登入：{identity?.display_name || "後台使用者"}，角色：
              {identity?.role_name || identity?.role_code || "管理員"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminShopHeaderLinks onRefresh={() => void load()} isRefreshing={isLoading} />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
            {notice}
          </div>
        ) : null}

        <section className="mt-6 rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <form className="flex flex-col gap-3 md:flex-row md:items-center" onSubmit={handleSearch}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                className={inputClassName("pl-11")}
                placeholder="搜尋姓名、Email、手機"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <button
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              搜尋
            </button>
            {activeSearch ? (
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-600"
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setActiveSearch("");
                  setPage(1);
                }}
              >
                清除
              </button>
            ) : null}
          </form>
          <div className="mt-4 flex flex-col gap-2 text-sm text-stone-500 md:flex-row md:items-center md:justify-between">
            <p>
              {activeSearch ? `搜尋「${activeSearch}」` : "全部會員"}，顯示 {visibleRange}，共 {total} 筆
            </p>
            {searchLimited ? (
              <p className="text-amber-700">搜尋結果已達本次掃描上限，請縮小關鍵字。</p>
            ) : null}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 shadow-sm">
          <div className="hidden grid-cols-[1.1fr_1.5fr_1fr_0.8fr_1fr_1fr_1.1fr_0.7fr] gap-3 border-b border-stone-100 bg-[#fffaf4] px-5 py-3 text-xs font-semibold text-stone-500 md:grid">
            <span>姓名</span>
            <span>Email</span>
            <span>手機</span>
            <span>Email 驗證</span>
            <span>註冊日期</span>
            <span>最後登入</span>
            <span>會員資料狀態</span>
            <span>操作</span>
          </div>

          {isLoading ? <p className="px-5 py-8 text-sm text-stone-500">讀取中...</p> : null}

          {!isLoading && members.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-base font-semibold text-stone-800">沒有符合條件的會員</p>
              <p className="mt-2 text-sm text-stone-500">請調整搜尋條件後再試一次。</p>
            </div>
          ) : null}

          <div className="divide-y divide-stone-100">
            {members.map((member) => (
              <div
                key={member.auth_user_id}
                className="grid gap-3 px-5 py-4 text-sm text-stone-700 md:grid-cols-[1.1fr_1.5fr_1fr_0.8fr_1fr_1fr_1.1fr_0.7fr] md:items-center"
              >
                <div>
                  <p className="font-semibold text-stone-900">{member.name || "未填寫"}</p>
                  {!member.has_profile ? (
                    <p className="mt-1 text-xs text-rose-600">會員資料不完整</p>
                  ) : null}
                </div>
                <p className="break-all text-stone-700">{member.email || "-"}</p>
                <p>{member.phone || "-"}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getVerifiedClassName(member)}`}>
                  {member.email_verified_label}
                </span>
                <p className="text-xs text-stone-500">{formatDate(member.registered_at)}</p>
                <p className="text-xs text-stone-500">{formatDate(member.last_login_at)}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(member)}`}>
                  {member.profile_status_label}
                </span>
                <button
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={Boolean(member.is_admin_user)}
                  onClick={() => void openDeleteDialog(member)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  {member.is_admin_user ? "不可刪除" : "刪除"}
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-4 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
            <p>
              第 {page} / {totalPages} 頁
            </p>
            <div className="flex gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft className="h-4 w-4" />
                上一頁
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading || page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                下一頁
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {deleteDialog ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-stone-950/45 px-4 py-8">
          <div className="w-full max-w-lg rounded-[24px] border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-stone-900">刪除會員</h2>
                <p className="mt-1 text-sm text-stone-600">此操作不可復原。</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl bg-[#fffaf4] p-4 text-sm text-stone-700">
              <div className="flex justify-between gap-4">
                <span className="text-stone-500">姓名</span>
                <span className="font-medium text-stone-900">{deleteDialog.member.name || "未填寫"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-stone-500">Email</span>
                <span className="break-all font-medium text-stone-900">{deleteDialog.member.email}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-stone-500">註冊日期</span>
                <span className="font-medium text-stone-900">{formatDate(deleteDialog.member.registered_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-stone-500">是否已有訂單</span>
                <span className="font-medium text-stone-900">
                  {deleteDialog.isLoading
                    ? "確認中"
                    : deleteDialog.detail?.deletion.hasBusinessRecords
                      ? "是"
                      : "否"}
                </span>
              </div>
              {!deleteDialog.member.has_profile ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">會員資料不完整。</p>
              ) : null}
              {deleteDialog.detail?.deletion.hasBusinessRecords ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  此會員已有訂單或交易紀錄，為保留帳務資料，目前不能直接刪除。
                </p>
              ) : null}
              {deleteDialog.detail && !deleteDialog.detail.deletion.can_delete && !deleteDialog.detail.deletion.hasBusinessRecords ? (
                <p className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800">
                  後台管理員帳號不可從會員管理刪除。
                </p>
              ) : null}
            </div>

            <label className="mt-5 block text-sm font-medium text-stone-700">
              請輸入完整 Email 確認刪除
              <input
                className={inputClassName("mt-2")}
                value={deleteDialog.confirmEmail}
                onChange={(event) =>
                  setDeleteDialog((current) =>
                    current ? { ...current, confirmEmail: event.target.value, error: "" } : current
                  )
                }
              />
            </label>

            {deleteDialog.error ? (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {deleteDialog.error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-700"
                onClick={() => setDeleteDialog(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-full bg-rose-700 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteDialog.isLoading || deleteDialog.isDeleting || !canDeleteSelected}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {deleteDialog.isDeleting ? "刪除中..." : "確認刪除會員"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
