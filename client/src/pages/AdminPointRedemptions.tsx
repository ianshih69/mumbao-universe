import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, RefreshCw, XCircle } from "lucide-react";
import AdminShopHeaderLinks from "@/components/shop/AdminShopHeaderLinks";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminIdentity,
  getAdminToken,
  getInitialAdminAuthStatus,
  type AdminAuthStatus,
} from "@/lib/shop/adminAuth";
import {
  completeAdminPointRedemption,
  fetchAdminPointRedemptionDetail,
  fetchAdminPointRedemptions,
  fetchAdminSession,
  rejectAdminPointRedemption,
  type AdminPointRedemption,
  type AdminPointRedemptionStatus,
} from "@/lib/shop/adminIdentityApi";

const statusOptions: Array<{ value: "all" | AdminPointRedemptionStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待處理" },
  { value: "completed", label: "已完成" },
  { value: "rejected", label: "未通過" },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPoints(value: number) {
  return `${Number(value || 0).toLocaleString("zh-TW")} 點`;
}

function statusLabel(status: AdminPointRedemptionStatus) {
  if (status === "completed") return "已完成";
  if (status === "rejected") return "未通過";
  return "待處理";
}

function statusClassName(status: AdminPointRedemptionStatus) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function canUseAdminUpdatePermission() {
  const identity = getAdminIdentity();
  const permissions = identity?.permissions || [];
  return Boolean(identity?.role_code === "super_admin" || permissions.includes("*") || permissions.includes("users.update"));
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-[12px] border border-stone-200 bg-white px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-stone-900">{value || "-"}</p>
    </div>
  );
}

export default function AdminPointRedemptions() {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>("checking");
  const [token, setToken] = useState("");
  const [redemptions, setRedemptions] = useState<AdminPointRedemption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"all" | AdminPointRedemptionStatus>("all");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRedemption, setSelectedRedemption] = useState<AdminPointRedemption | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [isMutating, setIsMutating] = useState(false);
  const canUpdate = canUseAdminUpdatePermission();

  useEffect(() => {
    const nextToken = getAdminToken();
    setToken(nextToken);
    setAuthStatus(getInitialAdminAuthStatus());
  }, []);

  async function load(nextToken = token, nextPage = page, nextStatus = status) {
    if (!nextToken) return;
    setIsLoading(true);
    setNotice("");
    try {
      await fetchAdminSession(nextToken);
      const data = await fetchAdminPointRedemptions(nextToken, {
        page: nextPage,
        status: nextStatus,
      });
      setRedemptions(data.redemptions || []);
      setPage(data.page || nextPage);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setNotice(error instanceof Error ? error.message : "積分兌換資料載入失敗，請稍後再試。");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(id: string) {
    if (!token) return;
    setSelectedId(id);
    setSelectedRedemption(null);
    setDetailError("");
    setIsDetailLoading(true);
    try {
      const data = await fetchAdminPointRedemptionDetail(token, id);
      setSelectedRedemption(data.redemption);
    } catch (error) {
      if (error instanceof Error && error.message === adminAuthExpiredMessage) {
        clearAdminToken();
        setAuthStatus("loggedOut");
      }
      setDetailError(error instanceof Error ? error.message : "兌換申請詳情載入失敗，請稍後再試。");
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function completeRedemption() {
    if (!token || !selectedRedemption) return;
    if (!window.confirm(`確認已完成 NT$${selectedRedemption.points.toLocaleString("zh-TW")} 的合作回饋匯款？`)) {
      return;
    }

    setIsMutating(true);
    setDetailError("");
    setNotice("");
    try {
      const data = await completeAdminPointRedemption(token, selectedRedemption.id);
      setSelectedRedemption(data.redemption);
      setNotice("兌換申請已標記為完成。");
      await load(token, page, status);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "兌換申請處理失敗，請稍後再試。");
    } finally {
      setIsMutating(false);
    }
  }

  async function rejectRedemption() {
    if (!token || !selectedRedemption) return;
    const reason = window.prompt("請輸入未通過原因，例如：銀行帳號資料不完整");
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setDetailError("請輸入未通過原因。");
      return;
    }

    setIsMutating(true);
    setDetailError("");
    setNotice("");
    try {
      const data = await rejectAdminPointRedemption(token, selectedRedemption.id, trimmedReason);
      setSelectedRedemption(data.redemption);
      setNotice("兌換申請已標記為未通過。");
      await load(token, page, status);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "兌換申請處理失敗，請稍後再試。");
    } finally {
      setIsMutating(false);
    }
  }

  useEffect(() => {
    if (authStatus === "loggedIn" && token) {
      void load(token, page, status);
    }
  }, [authStatus, token, page, status]);

  const visibleRange = useMemo(() => {
    if (!total) return "0";
    const start = (page - 1) * 10 + 1;
    const end = Math.min(page * 10, total);
    return `${start}-${end}`;
  }, [page, total]);

  if (authStatus === "checking") {
    return <main className="min-h-screen bg-[#f7f1e9] p-8 text-stone-600">確認管理員登入狀態...</main>;
  }

  if (authStatus === "loggedOut") {
    return (
      <main className="min-h-screen bg-[#f7f1e9] px-4 py-12">
        <div className="mx-auto max-w-md rounded-[24px] border border-stone-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900">請先登入後台</h1>
          <p className="mt-2 text-sm text-stone-600">積分兌換需要管理員權限。</p>
          <a
            className="mt-6 inline-flex rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold text-white"
            href="/admin/shop/login?redirect=/admin/point-redemptions"
          >
            前往登入
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f1e9]">
      <AdminShopNav current="point-redemptions" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#b08d73]">POINT REDEMPTIONS</p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-900">積分兌換</h1>
            <p className="mt-2 text-sm text-stone-600">管理鑽石會員的合作回饋兌換申請。</p>
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

        {notice ? <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">{notice}</div> : null}

        <section className="mt-6 rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">兌換申請列表</h2>
              <p className="mt-1 text-sm text-stone-500">
                第 {visibleRange} 筆，共 {total} 筆
              </p>
            </div>
            <select
              className="h-11 rounded-[12px] border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none focus:border-[#9a7a63] focus:ring-2 focus:ring-[#ead8c8]"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as "all" | AdminPointRedemptionStatus);
                setPage(1);
                setSelectedId("");
                setSelectedRedemption(null);
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? <p className="mt-6 text-sm text-stone-500">正在載入兌換申請...</p> : null}

          {!isLoading && redemptions.length === 0 ? (
            <div className="mt-6 rounded-[16px] border border-dashed border-stone-300 bg-[#fbf7f1] p-8 text-center text-sm text-stone-500">
              目前沒有符合條件的兌換申請。
            </div>
          ) : null}

          {!isLoading && redemptions.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th className="py-3 pr-4">申請日期</th>
                    <th className="py-3 pr-4">會員</th>
                    <th className="py-3 pr-4">合作店家</th>
                    <th className="py-3 pr-4">專屬優惠碼</th>
                    <th className="py-3 pr-4">兌換積分</th>
                    <th className="py-3 pr-4">銀行</th>
                    <th className="py-3 pr-4">戶名</th>
                    <th className="py-3 pr-4">帳號末四碼</th>
                    <th className="py-3 pr-4">狀態</th>
                    <th className="py-3 text-right">查看</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {redemptions.map((item) => (
                    <tr key={item.id} className={selectedId === item.id ? "bg-[#fbf7f1]" : ""}>
                      <td className="py-3 pr-4 text-stone-600">{formatDate(item.requested_at)}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-stone-900">{item.member_name || "-"}</p>
                        <p className="text-xs text-stone-500">{item.member_email || "-"}</p>
                      </td>
                      <td className="py-3 pr-4 text-stone-600">{item.partner_name || "-"}</td>
                      <td className="py-3 pr-4 text-stone-600">{item.exclusive_code || "-"}</td>
                      <td className="py-3 pr-4 font-semibold text-stone-900">{formatPoints(item.points)}</td>
                      <td className="py-3 pr-4 text-stone-600">{item.bank_name || "-"}</td>
                      <td className="py-3 pr-4 text-stone-600">{item.account_holder || "-"}</td>
                      <td className="py-3 pr-4 text-stone-600">{item.account_last4 || "-"}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-700 hover:bg-stone-50"
                          type="button"
                          onClick={() => void loadDetail(item.id)}
                        >
                          <Eye className="h-4 w-4" />
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              第 {page}／{totalPages} 頁
            </span>
            <div className="flex gap-2">
              <button
                className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                上一頁
              </button>
              <button
                className="inline-flex h-9 items-center gap-1 rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={isLoading || page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                下一頁
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {(selectedId || detailError) && (
          <section className="mt-6 rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#b08d73]">DETAIL</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">兌換申請詳情</h2>
                <p className="mt-2 text-sm text-stone-500">完整銀行帳號僅在此詳情區顯示。</p>
              </div>
              {selectedRedemption ? (
                <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-sm font-medium ${statusClassName(selectedRedemption.status)}`}>
                  {statusLabel(selectedRedemption.status)}
                </span>
              ) : null}
            </div>

            {isDetailLoading ? <p className="mt-6 text-sm text-stone-500">正在載入詳情...</p> : null}
            {detailError ? <p className="mt-6 text-sm text-red-700">{detailError}</p> : null}

            {!isDetailLoading && selectedRedemption ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <DetailField label="會員姓名" value={selectedRedemption.member_name} />
                  <DetailField label="Email" value={selectedRedemption.member_email} />
                  <DetailField label="合作店家" value={selectedRedemption.partner_name} />
                  <DetailField label="專屬優惠碼" value={selectedRedemption.exclusive_code} />
                  <DetailField label="申請積分" value={formatPoints(selectedRedemption.points)} />
                  <DetailField label="申請時間" value={formatDate(selectedRedemption.requested_at)} />
                  <DetailField label="銀行" value={selectedRedemption.bank_name} />
                  <DetailField label="戶名" value={selectedRedemption.account_holder} />
                  <DetailField label="完整銀行帳號" value={selectedRedemption.account_number || selectedRedemption.account_number_masked} />
                </div>

                {selectedRedemption.rejection_reason ? (
                  <div className="rounded-[12px] border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    未通過原因：{selectedRedemption.rejection_reason}
                  </div>
                ) : null}

                {selectedRedemption.status === "pending" && canUpdate ? (
                  <div className="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row">
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#8b6f5b] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={isMutating}
                      onClick={() => void completeRedemption()}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      確認已完成匯款
                    </button>
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      disabled={isMutating}
                      onClick={() => void rejectRedemption()}
                    >
                      <XCircle className="h-4 w-4" />
                      未通過
                    </button>
                  </div>
                ) : null}

                {selectedRedemption.status === "pending" && !canUpdate ? (
                  <p className="text-sm text-stone-500">處理兌換申請需要 users.update 權限。</p>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
