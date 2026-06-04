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
  getInitialAdminAuthStatus,
  getAdminToken,
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
import { cn } from "@/lib/utils";

const orderSourceLabels = {
  online: "官網訂單",
  pos: "現場銷售",
};

const orderStatusLabels = {
  pending_confirm: "待確認",
  pending_payment: "待付款",
  paid: "已付款",
  shipping: "出貨中",
  completed: "已完成",
  cancelled: "已取消",
};

const paymentStatusLabels = {
  pending: "待付款",
  confirmed: "已確認付款",
  failed: "付款失敗",
  refunded: "已退款",
};

const movementTypeLabels = {
  stock_in: "入庫",
  stock_out: "扣庫存",
  adjustment: "盤點調整",
  manual_sale: "現場銷售",
  online_order: "官網訂單",
  return_in: "退貨補回",
};

function formatDateTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "-";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone?: "stone" | "green" | "pink" | "amber";
}) {
  const toneClass = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-emerald-50 text-emerald-700",
    pink: "bg-pink-50 text-pink-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];

  return (
    <div className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
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
    </div>
  );
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
    <div className="grid gap-3 rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3 md:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-stone-900">
          {order.order_number}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {orderSourceLabels[order.order_source] || "官網訂單"}
        </p>
      </div>
      <p className="text-sm font-semibold text-stone-900">{formatPrice(order.total)}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">
          {paymentStatusLabels[order.payment_status] || order.payment_status}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-stone-600">
          {orderStatusLabels[order.order_status] || order.order_status}
        </span>
      </div>
      <p className="text-xs text-stone-500">{formatDateTime(order.created_at)}</p>
    </div>
  );
}

function RecentMovementRow({ movement }: { movement: AdminDashboardRecentMovement }) {
  const delta = Number(movement.quantity_delta || 0);

  return (
    <div className="rounded-[8px] border border-stone-100 bg-[#fbf7f1] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">
            {movement.product_name || "未命名商品"}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {getVariantLabel(movement.variant_name, movement.variant_option) || "-"}
          </p>
          {movement.sku && (
            <p className="mt-1 break-all font-mono text-xs text-stone-400">
              {movement.sku}
            </p>
          )}
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs text-stone-600">
          {movementTypeLabels[movement.movement_type] || movement.movement_type}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-[6px] bg-white p-2">
          <p className="text-stone-400">異動前</p>
          <p className="mt-1 font-semibold text-stone-900">
            {movement.quantity_before}
          </p>
        </div>
        <div className="rounded-[6px] bg-white p-2">
          <p className="text-stone-400">變化</p>
          <p
            className={cn(
              "mt-1 font-semibold",
              delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-stone-700"
            )}
          >
            {getDeltaText(delta)}
          </p>
        </div>
        <div className="rounded-[6px] bg-white p-2">
          <p className="text-stone-400">異動後</p>
          <p className="mt-1 font-semibold text-stone-900">
            {movement.quantity_after}
          </p>
        </div>
      </div>
      {(movement.note || movement.created_at) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <span>{movement.note || "-"}</span>
          <span>{formatDateTime(movement.created_at)}</span>
        </div>
      )}
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

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="今日銷售總額"
            value={formatPrice(today?.sales_total || 0)}
            detail={`官網 ${formatPrice(today?.online_sales_total || 0)} / POS ${formatPrice(
              today?.pos_sales_total || 0
            )}`}
            icon={TrendingUp}
            tone="green"
          />
          <SummaryCard
            title="今日訂單數"
            value={`${today?.order_count || 0} 筆`}
            detail={`官網 ${today?.online_order_count || 0} 筆 / POS ${
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
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <section className="rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    Recent Orders
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
                    Inventory Movements
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">最近 5 筆庫存異動</h2>
                </div>
                <PackageCheck className="h-5 w-5 text-[#8b6f5b]" />
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
                    Low Inventory
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">低庫存商品</h2>
                  <p className="mt-1 text-xs text-stone-500">顯示庫存 3 件以下，最多 10 筆。</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              {isDashboardLoading && !dashboard ? (
                <EmptyState text="低庫存資料載入中..." />
              ) : dashboard?.low_inventory.length ? (
                <div className="space-y-3">
                  {dashboard.low_inventory.map((item) => (
                    <div
                      key={item.variant_id}
                      className="rounded-[8px] border border-amber-100 bg-amber-50/60 p-3"
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
                    </div>
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
