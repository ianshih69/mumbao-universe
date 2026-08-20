import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useLocation } from "wouter";
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
  fetchAdminMembers,
  fetchAdminSession,
  type AdminMember,
} from "@/lib/shop/adminIdentityApi";

const pageSize = 10;

const memberLevelOptions = [
  { value: "all", label: "全部" },
  { value: "normal", label: "普通會員" },
  { value: "vip", label: "VIP會員" },
  { value: "diamond", label: "鑽石會員" },
];

const profileStatusOptions = [
  { value: "all", label: "全部" },
  { value: "normal", label: "正常" },
  { value: "email_not_verified", label: "尚未驗證" },
  { value: "missing_profile", label: "資料不完整" },
];

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

function getStatusClassName(member: AdminMember) {
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

function getMemberLevelClassName(member: AdminMember) {
  if (member.member_level === "diamond") return "bg-sky-100 text-sky-700";
  if (member.member_level === "vip") return "bg-purple-100 text-purple-700";
  return "bg-stone-100 text-stone-700";
}

function getPartnerName(member: AdminMember) {
  return member.partner_name?.trim() || "—";
}

export default function AdminMembers() {
  const [, setLocation] = useLocation();
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [memberLevel, setMemberLevel] = useState("all");
  const [profileStatus, setProfileStatus] = useState("all");
  const [activeMemberLevel, setActiveMemberLevel] = useState("all");
  const [activeProfileStatus, setActiveProfileStatus] = useState("all");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchLimited, setSearchLimited] = useState(false);
  const identity = getAdminIdentity();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(
    nextToken = token,
    nextPage = page,
    search = activeSearch,
    level = activeMemberLevel,
    status = activeProfileStatus
  ) {
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
        memberLevel: level,
        profileStatus: status,
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
      setNotice(error instanceof Error ? error.message : "會員資料暫時無法讀取，請稍後再試。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (authStatus === "loggedIn" && token) {
      void load(token, page, activeSearch, activeMemberLevel, activeProfileStatus);
    }
  }, [authStatus, token, page, activeSearch, activeMemberLevel, activeProfileStatus]);

  const visibleRange = useMemo(() => {
    if (!total) return "0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}-${end}`;
  }, [page, total]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
    setActiveMemberLevel(memberLevel);
    setActiveProfileStatus(profileStatus);
  }

  function clearFilters() {
    setSearchInput("");
    setActiveSearch("");
    setMemberLevel("all");
    setProfileStatus("all");
    setActiveMemberLevel("all");
    setActiveProfileStatus("all");
    setPage(1);
  }

  function openMemberDetail(member: AdminMember) {
    setLocation(`/admin/members/${encodeURIComponent(member.auth_user_id)}`);
  }

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#f7f1e9] p-8 text-stone-600">確認登入狀態...</main>;
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

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="members" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">MEMBERS</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">會員管理</h1>
            <p className="mt-2 text-sm text-stone-600">
              目前管理員：{identity?.display_name || "後台使用者"}，權限：
              {identity?.role_name || identity?.role_code || "Admin"}
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
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto]" onSubmit={handleSearch}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                className={inputClassName("pl-11")}
                placeholder="搜尋姓名、Email、手機、合作店家"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <select
              className={inputClassName()}
              value={memberLevel}
              onChange={(event) => setMemberLevel(event.target.value)}
            >
              {memberLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  會員等級：{option.label}
                </option>
              ))}
            </select>
            <select
              className={inputClassName()}
              value={profileStatus}
              onChange={(event) => setProfileStatus(event.target.value)}
            >
              {profileStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  會員狀態：{option.label}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              搜尋
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-600"
              type="button"
              onClick={clearFilters}
            >
              清除
            </button>
          </form>
          <div className="mt-4 flex flex-col gap-2 text-sm text-stone-500 md:flex-row md:items-center md:justify-between">
            <p>
              {activeSearch || activeMemberLevel !== "all" || activeProfileStatus !== "all"
                ? "篩選結果"
                : "全部會員"}
              ，共 {total} 筆；目前顯示 {visibleRange}
            </p>
            {searchLimited ? (
              <p className="text-amber-700">搜尋已達安全掃描上限，若資料很多請縮小條件。</p>
            ) : null}
          </div>
        </section>

        <section className="mt-6 overflow-x-auto rounded-[24px] border border-stone-200 bg-white/90 shadow-sm">
          <div className="hidden min-w-[1180px] grid-cols-[1fr_1.35fr_0.9fr_0.85fr_1.15fr_0.9fr_1fr_1fr_1fr_0.85fr] gap-3 border-b border-stone-100 bg-[#fffaf4] px-5 py-3 text-xs font-semibold text-stone-500 md:grid">
            <span>姓名</span>
            <span>Email</span>
            <span>手機</span>
            <span>會員等級</span>
            <span>合作店家</span>
            <span>Email 驗證</span>
            <span>註冊日期</span>
            <span>最後登入</span>
            <span>會員資料狀態</span>
            <span>查看詳情</span>
          </div>

          {isLoading ? <p className="px-5 py-8 text-sm text-stone-500">讀取中...</p> : null}

          {!isLoading && members.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-base font-semibold text-stone-800">沒有符合條件的會員。</p>
              <p className="mt-2 text-sm text-stone-500">請調整搜尋字或篩選條件。</p>
            </div>
          ) : null}

          <div className="divide-y divide-stone-100">
            {members.map((member) => (
              <button
                key={member.auth_user_id}
                className="grid w-full gap-3 px-5 py-4 text-left text-sm text-stone-700 transition hover:bg-[#fffaf4] md:min-w-[1180px] md:grid-cols-[1fr_1.35fr_0.9fr_0.85fr_1.15fr_0.9fr_1fr_1fr_1fr_0.85fr] md:items-center"
                onClick={() => openMemberDetail(member)}
                type="button"
              >
                <div>
                  <p className="font-semibold text-stone-900">{member.name || "未填姓名"}</p>
                  {!member.has_profile ? (
                    <p className="mt-1 text-xs text-rose-600">會員資料不完整</p>
                  ) : null}
                </div>
                <p className="break-all text-stone-700">{member.email || "-"}</p>
                <p>{member.phone || "-"}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getMemberLevelClassName(member)}`}>
                  {member.member_level_label}
                </span>
                <p className="max-w-[14rem] truncate text-stone-700" title={member.partner_name?.trim() || undefined}>
                  <span className="font-medium text-stone-500 md:hidden">合作店家：</span>
                  {getPartnerName(member)}
                </p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getVerifiedClassName(member)}`}>
                  {member.email_verified_label}
                </span>
                <p className="text-xs text-stone-500">{formatDate(member.registered_at)}</p>
                <p className="text-xs text-stone-500">{formatDate(member.last_login_at)}</p>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(member)}`}>
                  {member.profile_status_label}
                </span>
                <span className="inline-flex h-10 w-fit items-center justify-center rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold text-[#765d4a]">
                  查看詳情
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-4 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
            <p>
              第 {page}／{totalPages} 頁
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
    </main>
  );
}
