import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  LogOut,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  type AdminAuthStatus,
  adminAuthExpiredMessage,
  clearAdminToken,
  getAdminToken,
  getInitialAdminAuthStatus,
  isAdminAuthError,
  setAdminToken,
} from "@/lib/shop/adminAuth";
import {
  type AdminDashboardRecentMovement,
  type AdminDashboardRecentOrder,
  type AdminShopDashboard,
  fetchAdminShopDashboard,
} from "@/lib/shop/adminDashboardApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import {
  getInventoryMovementLabel,
  getOrderSourceLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from "@/lib/shop/labels";
import { cn } from "@/lib/utils";

function getTaipeiDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  return {
    year: parts.find((part) => part.type === "year")?.value || "",
    month: parts.find((part) => part.type === "month")?.value || "",
    day: parts.find((part) => part.type === "day")?.value || "",
    hour: parts.find((part) => part.type === "hour")?.value || "",
    minute: parts.find((part) => part.type === "minute")?.value || "",
  };
}

function formatDateTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "-";

  const parts = getTaipeiDateParts(new Date(value));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatTodayDate() {
  const parts = getTaipeiDateParts(new Date());
  return `${parts.year}/${parts.month}/${parts.day}`;
}

function getDeltaText(delta: number) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "stone",
  href,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone?: "stone" | "green" | "pink" | "amber";
  href?: string;
}) {
  const toneClass = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-emerald-50 text-emerald-700",
    pink: "bg-pink-50 text-pink-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  const baseClass =
    "rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm transition";
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-stone-900">{value}</p>
        </div>
        <div className={cn("flex size-10 items-center justify-center rounded-full", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{detail}</p>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(baseClass, "block hover:-translate-y-0.5 hover:border-[#b99aa2] hover:shadow-md")}
      >
        {content}
      </a>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-stone-200 bg-white/70 p-6 text-center text-sm text-stone-400">
      {text}
    </div>
  );
}

function RecentOrderRow({ order }: { order: AdminDashboardRecentOrder }) {
  return (
    <a
      href="/admin/shop/orders"
      className="grid gap-3 rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3 transition hover:border-[#b99aa2] hover:bg-[#f4ece2] md:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] md:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-stone-900">{order.order_number}</p>
        <p className="mt-1 text-xs text-stone-500">
          {getOrderSourceLabel(order.order_source)}
        </p>
      </div>
      <p className="text-sm font-semibold text-stone-900">{formatPrice(order.total)}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">
          {getPaymentStatusLabel(order.payment_status)}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">
          {getOrderStatusLabel(order.order_status)}
        </span>
      </div>
      <p className="text-xs text-stone-500">{formatDateTime(order.created_at)}</p>
    </a>
  );
}

function RecentMovementRow({ movement }: { movement: AdminDashboardRecentMovement }) {
  const delta = Number(movement.quantity_delta || 0);

  return (
    <div className="rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">
            {movement.product_name || "未命名商品"}
          </p>
          <p className="mt-1 text-xs text-stone-500">{formatDateTime(movement.created_at)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs text-stone-600">
          {getInventoryMovementLabel(movement.movement_type)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded-full bg-white px-2.5 py-1 font-semibold",
            delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-stone-700"
          )}
        >
          {getDeltaText(delta)}
        </span>
        <span className="text-stone-500">
          {movement.quantity_before} -&gt; {movement.quantity_after}
        </span>
      </div>
    </div>
  );
}

export default function AdminShopHome() {
  const [token, setTokenState] = useState(() => getAdminToken());
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus>(() =>
    getInitialAdminAuthStatus()
  );
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isChecking, setIsChecking] = useState(Boolean(token));
  const [dashboard, setDashboard] = useState<AdminShopDashboard | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const handleAuthFailure = useCallback(() => {
    clearAdminToken();
    setTokenState("");
    setAuthStatus("loggedOut");
    setLoginError(adminAuthExpiredMessage);
    setDashboard(null);
    setDashboardError("");
  }, []);

  const loadDashboard = useCallback(
    async (nextToken = token) => {
      if (!nextToken) return;

      setIsDashboardLoading(true);
      setDashboardError("");
      try {
        const nextDashboard = await fetchAdminShopDashboard(nextToken);
        setDashboard(nextDashboard);
        setAuthStatus("loggedIn");
        setLoginError("");
      } catch (error) {
        if (isAdminAuthError(error)) {
          handleAuthFailure();
          return;
        }
        setDashboardError(error instanceof Error ? error.message : "儀表板載入失敗");
      } finally {
        setIsDashboardLoading(false);
        setIsChecking(false);
      }
    },
    [handleAuthFailure, token]
  );

  useEffect(() => {
    if (!token) return;

    let isCurrent = true;
    setIsChecking(true);
    setAuthStatus("checking");

    loadDashboard(token).finally(() => {
      if (!isCurrent) return;
    });

    return () => {
      isCurrent = false;
    };
  }, [loadDashboard, token]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const nextToken = password.trim();

    if (!nextToken) {
      setLoginError("請輸入 ADMIN_PASSWORD");
      return;
    }

    setIsChecking(true);
    setAuthStatus("checking");
    try {
      const nextDashboard = await fetchAdminShopDashboard(nextToken);
      setAdminToken(nextToken);
      setTokenState(nextToken);
      setDashboard(nextDashboard);
      setAuthStatus("loggedIn");
      setPassword("");
      setLoginError("");
      setDashboardError("");
    } catch (error) {
      clearAdminToken();
      setAuthStatus("loggedOut");
      setLoginError(error instanceof Error ? error.message : adminAuthExpiredMessage);
    } finally {
      setIsChecking(false);
    }
  };

  const logout = () => {
    clearAdminToken();
    setTokenState("");
    setAuthStatus("loggedOut");
    setPassword("");
    setLoginError("");
    setDashboard(null);
    setDashboardError("");
  };

  if (!token && authStatus === "checking") {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-500">
        <p className="text-sm">確認登入狀態中...</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#f7f2ea] px-5 text-stone-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-[8px] border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/70"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-[#8b6f5b] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                MUMBAO Admin
              </p>
              <h1 className="text-2xl font-semibold">商城後台登入</h1>
            </div>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="請輸入 ADMIN_PASSWORD"
            className="h-11 rounded-[8px]"
            disabled={isChecking}
          />
          {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
          <Button
            type="submit"
            className="mt-5 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
            disabled={isChecking}
          >
            {isChecking ? "登入確認中..." : "登入商城後台"}
          </Button>
        </form>
      </main>
    );
  }

  const today = dashboard?.today;

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-7 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              商城後台
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              集中管理慢寶商品、訂單、庫存、入庫與現場銷售。今日統計使用台灣時間。
            </p>
            {isChecking && (
              <p className="mt-2 text-xs text-stone-400">確認登入狀態中...</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-white"
              onClick={() => loadDashboard()}
              disabled={isDashboardLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isDashboardLoading && "animate-spin")} />
              重新整理
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="home" />

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 md:px-8 md:py-8">
        {dashboardError && (
          <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            {dashboardError}
          </div>
        )}

        <section className="space-y-3">
          <p className="text-sm text-stone-500">
            統計日期：{formatTodayDate()}，台灣時間 00:00 至目前
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="今日銷售總額"
              value={formatPrice(today?.sales_total || 0)}
              detail={`官網 ${formatPrice(today?.online_sales_total || 0)} / 現場銷售 ${formatPrice(
                today?.pos_sales_total || 0
              )}`}
              icon={TrendingUp}
              tone="green"
            />
            <SummaryCard
              title="今日訂單數"
              value={`${today?.order_count || 0} 筆`}
              detail={`官網訂單 ${today?.online_order_count || 0} 筆｜現場銷售 ${
                today?.pos_order_count || 0
              } 筆`}
              icon={ClipboardList}
              tone="pink"
            />
            <SummaryCard
              title="待確認官網訂單"
              value={`${dashboard?.pending_online_order_count || 0} 筆`}
              detail="官網訂單且狀態為待確認。"
              icon={AlertTriangle}
              tone="amber"
              href="/admin/shop/orders"
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    最近訂單
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">最近 5 筆訂單</h2>
                </div>
                <Clock className="h-5 w-5 text-[#8b6f5b]" />
              </div>
              {isDashboardLoading && !dashboard ? (
                <EmptyState text="儀表板資料載入中..." />
              ) : dashboard?.recent_orders.length ? (
                <div className="space-y-3">
                  {dashboard.recent_orders.map((order) => (
                    <RecentOrderRow key={order.id} order={order} />
                  ))}
                </div>
              ) : (
                <EmptyState text="目前沒有訂單資料。" />
              )}
            </section>

            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    最近庫存異動
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">最近 5 筆庫存異動</h2>
                </div>
                <a
                  href="/admin/shop/inventory"
                  className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600 hover:bg-stone-50"
                >
                  查看全部
                </a>
              </div>
              {isDashboardLoading && !dashboard ? (
                <EmptyState text="庫存異動載入中..." />
              ) : dashboard?.recent_movements.length ? (
                <div className="space-y-3">
                  {dashboard.recent_movements.map((movement) => (
                    <RecentMovementRow key={movement.id} movement={movement} />
                  ))}
                </div>
              ) : (
                <EmptyState text="目前沒有庫存異動資料。" />
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    低庫存商品
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">低庫存商品</h2>
                  <p className="mt-1 text-xs text-stone-500">
                    顯示庫存 3 件以下，最多 10 筆。
                  </p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              {isDashboardLoading && !dashboard ? (
                <EmptyState text="低庫存資料載入中..." />
              ) : dashboard?.low_inventory.length ? (
                <div className="space-y-3">
                  {dashboard.low_inventory.map((item) => (
                    <a
                      key={item.variant_id}
                      href="/admin/shop/inventory"
                      className="block rounded-[8px] border border-amber-100 bg-amber-50/60 p-3 transition hover:border-amber-300 hover:bg-amber-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {item.product_name || "未命名商品"}
                          </p>
                          <p className="mt-1 text-xs text-stone-500">
                            {getVariantLabel(item.variant_name, item.variant_option) || "-"}
                          </p>
                          {item.sku && (
                            <p className="mt-1 break-all font-mono text-xs text-stone-400">
                              {item.sku}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {item.inventory} 件
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState text="目前沒有低庫存商品。" />
              )}
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
