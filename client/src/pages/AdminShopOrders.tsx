import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  LogOut,
  PackageSearch,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminShopNav from "@/components/shop/AdminShopNav";
import {
  type AdminOrderStatus,
  type AdminOrderSource,
  type AdminPaymentStatus,
  type AdminShopOrderDetail,
  type AdminShopOrderSummary,
  fetchAdminShopOrder,
  fetchAdminShopOrders,
  updateAdminShopOrderStatus,
} from "@/lib/shop/adminOrdersApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/shop/labels";
import {
  adminAuthExpiredMessage,
  clearAdminToken as clearStoredAdminToken,
  getAdminToken,
  isAdminAuthError,
  setAdminToken as setStoredAdminToken,
} from "@/lib/shop/adminAuth";
import { cn } from "@/lib/utils";

const orderListLimit = 30;

const orderStatusLabels: Record<AdminOrderStatus, string> = ORDER_STATUS_LABELS;

const paymentStatusLabels: Record<AdminPaymentStatus, string> = PAYMENT_STATUS_LABELS;

const orderSourceLabels: Record<AdminOrderSource, string> = ORDER_SOURCE_LABELS;

const orderStatusOptions: Array<{ value: "" | AdminOrderStatus; label: string }> = [
  { value: "", label: "全部狀態" },
  { value: "pending_confirm", label: ORDER_STATUS_LABELS.pending_confirm },
  { value: "pending_payment", label: ORDER_STATUS_LABELS.pending_payment },
  { value: "paid", label: ORDER_STATUS_LABELS.paid },
  { value: "shipping", label: ORDER_STATUS_LABELS.shipping },
  { value: "completed", label: ORDER_STATUS_LABELS.completed },
  { value: "cancelled", label: ORDER_STATUS_LABELS.cancelled },
];

const orderSourceOptions: Array<{ value: "" | AdminOrderSource; label: string }> = [
  { value: "", label: "全部來源" },
  { value: "online", label: ORDER_SOURCE_LABELS.online },
  { value: "pos", label: ORDER_SOURCE_LABELS.pos },
];

const paymentStatusOptions: Array<{ value: AdminPaymentStatus; label: string }> = [
  { value: "pending", label: PAYMENT_STATUS_LABELS.pending },
  { value: "confirmed", label: PAYMENT_STATUS_LABELS.confirmed },
  { value: "failed", label: PAYMENT_STATUS_LABELS.failed },
  { value: "refunded", label: PAYMENT_STATUS_LABELS.refunded },
];

function getStoredAdminToken() {
  return getAdminToken();
}

function saveAdminToken(token: string) {
  setStoredAdminToken(token);
}

function clearAdminToken() {
  clearStoredAdminToken();
}

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

function StatusPill({
  children,
  tone = "stone",
}: {
  children: React.ReactNode;
  tone?: "stone" | "green" | "pink" | "red";
}) {
  const toneClass = {
    stone: "border-stone-200 bg-stone-50 text-stone-600",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    pink: "border-pink-100 bg-pink-50 text-pink-700",
    red: "border-red-100 bg-red-50 text-red-600",
  }[tone];

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", toneClass)}>
      {children}
    </span>
  );
}

function getOrderTone(status: AdminOrderStatus) {
  if (status === "completed") return "green";
  if (status === "cancelled") return "red";
  if (status === "paid" || status === "shipping") return "pink";
  return "stone";
}

function getPaymentTone(status: AdminPaymentStatus) {
  if (status === "confirmed") return "green";
  if (status === "failed" || status === "refunded") return "red";
  return "stone";
}

export default function AdminShopOrders() {
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<AdminShopOrderSummary[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminShopOrderDetail | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | AdminOrderStatus>("");
  const [source, setSource] = useState<"" | AdminOrderSource>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftOrderStatus, setDraftOrderStatus] = useState<AdminOrderStatus>("pending_confirm");
  const [draftPaymentStatus, setDraftPaymentStatus] = useState<AdminPaymentStatus>("pending");

  const handleAuthFailure = useCallback(() => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setLoginError(adminAuthExpiredMessage);
    setError("");
  }, []);

  const selectedSummary = useMemo(
    () => orders.find((order) => order.order_number === selectedOrderNumber),
    [orders, selectedOrderNumber]
  );

  const loadOrders = useCallback(
    async ({ nextPage = 0, append = false }: { nextPage?: number; append?: boolean } = {}) => {
      if (!token) return;

      setIsLoading(true);
      try {
        const data = await fetchAdminShopOrders({
          token,
          q: search,
          status,
          source,
          page: nextPage,
          limit: orderListLimit,
        });
        const nextOrders = data.orders || [];

        setOrders((current) => (append ? [...current, ...nextOrders] : nextOrders));
        setPage(typeof data.nextPage === "number" ? data.nextPage : nextPage + 1);
        setHasMore(Boolean(data.hasMore));
        setError("");
      } catch (loadError) {
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "訂單載入失敗。");
      } finally {
        setIsLoading(false);
      }
    },
    [handleAuthFailure, search, source, status, token]
  );

  const loadOrderDetail = useCallback(
    async (orderNumber: string) => {
      if (!token || !orderNumber) return;

      setSelectedOrderNumber(orderNumber);
      setIsDetailLoading(true);
      try {
        const detail = await fetchAdminShopOrder(token, orderNumber);
        setSelectedOrder(detail);
        setDraftOrderStatus(detail.order_status);
        setDraftPaymentStatus(detail.payment_status);
        setError("");
      } catch (loadError) {
        if (isAdminAuthError(loadError)) {
          handleAuthFailure();
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "訂單明細載入失敗。");
      } finally {
        setIsDetailLoading(false);
      }
    },
    [handleAuthFailure, token]
  );

  useEffect(() => {
    if (!token) return;
    loadOrders({ nextPage: 0 });
  }, [loadOrders, token]);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    const nextToken = password.trim();

    if (!nextToken) {
      setLoginError("請輸入管理密碼。");
      return;
    }

    saveAdminToken(nextToken);
    setToken(nextToken);
    setLoginError("");
  };

  const logout = () => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setOrders([]);
    setSelectedOrderNumber("");
    setSelectedOrder(null);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSelectedOrderNumber("");
    setSelectedOrder(null);
    loadOrders({ nextPage: 0 });
  };

  const saveStatuses = async () => {
    if (!token || !selectedOrder) return;

    setIsSaving(true);
    try {
      const nextOrder = await updateAdminShopOrderStatus({
        token,
        orderNumber: selectedOrder.order_number,
        order_status: draftOrderStatus,
        payment_status: draftPaymentStatus,
      });
      setSelectedOrder(nextOrder);
      setOrders((current) =>
        current.map((order) =>
          order.order_number === nextOrder.order_number
            ? {
                ...order,
                order_status: nextOrder.order_status,
                payment_status: nextOrder.payment_status,
                updated_at: nextOrder.updated_at,
              }
            : order
        )
      );
      setError("");
    } catch (saveError) {
      if (isAdminAuthError(saveError)) {
        handleAuthFailure();
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "狀態更新失敗。");
    } finally {
      setIsSaving(false);
    }
  };

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
              <h1 className="text-2xl font-semibold">商城訂單管理</h1>
            </div>
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="請輸入 ADMIN_PASSWORD"
            className="h-11 rounded-[8px]"
          />
          {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}
          <Button type="submit" className="mt-5 h-11 w-full rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
            進入訂單管理
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#f7f2ea] text-stone-900">
      <header className="border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              MUMBAO Shop Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-wide">
              商城訂單管理
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-full bg-white"
              onClick={() => loadOrders({ nextPage: 0 })}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              重新整理
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      <AdminShopNav current="orders" />

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_420px] md:px-8 md:py-8">
        <section className="space-y-4">
          <form
            onSubmit={submitSearch}
            className="rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_190px_190px_auto] md:items-center">
              <label className="flex h-11 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋訂單編號、姓名、電話"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as "" | AdminOrderStatus);
                  setSelectedOrderNumber("");
                  setSelectedOrder(null);
                }}
                className="h-11 rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
              >
                {orderStatusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value as "" | AdminOrderSource);
                  setSelectedOrderNumber("");
                  setSelectedOrder(null);
                }}
                className="h-11 rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
              >
                {orderSourceOptions.map((option) => (
                  <option key={option.value || "all-source"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button type="submit" className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                搜尋
              </Button>
            </div>
          </form>

          {error && (
            <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-[8px] border border-stone-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1.2fr_1fr_0.9fr_0.9fr] gap-3 border-b border-stone-100 bg-[#fbf7f1] px-4 py-3 text-xs font-medium text-stone-500 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr]">
              <span>訂單</span>
              <span>顧客</span>
              <span className="hidden md:block">金額</span>
              <span>付款</span>
              <span>狀態</span>
              <span className="hidden md:block">建立時間</span>
            </div>

            {orders.length === 0 ? (
              <div className="px-5 py-14 text-center text-stone-400">
                <PackageSearch className="mx-auto mb-3 h-9 w-9" />
                <p>{isLoading ? "訂單載入中..." : "目前沒有符合條件的訂單。"}</p>
              </div>
            ) : (
              orders.map((order) => {
                const isSelected = selectedOrderNumber === order.order_number;

                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => loadOrderDetail(order.order_number)}
                    className={cn(
                      "grid w-full grid-cols-[1.2fr_1fr_0.9fr_0.9fr] gap-3 border-b border-stone-100 px-4 py-3 text-left text-sm transition last:border-b-0 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr]",
                      isSelected ? "bg-[#f4ece2]" : "bg-white hover:bg-stone-50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-stone-900">
                        {order.order_number}
                      </span>
                      <span className="mt-1 inline-flex rounded-full bg-[#f4ece2] px-2 py-0.5 text-xs text-[#765d4a]">
                        {orderSourceLabels[order.order_source || "online"]}
                      </span>
                      <span className="mt-1 block text-xs text-stone-400 md:hidden">
                        {formatPrice(order.total)}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-stone-800">
                        {order.customer_name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-stone-400">
                        {order.customer_phone}
                      </span>
                    </span>
                    <span className="hidden font-medium text-stone-800 md:block">
                      {formatPrice(order.total)}
                    </span>
                    <StatusPill tone={getPaymentTone(order.payment_status)}>
                      {paymentStatusLabels[order.payment_status]}
                    </StatusPill>
                    <StatusPill tone={getOrderTone(order.order_status)}>
                      {orderStatusLabels[order.order_status]}
                    </StatusPill>
                    <span className="hidden text-xs text-stone-500 md:block">
                      {formatDateTime(order.created_at)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {hasMore && (
            <Button
              variant="outline"
              className="w-full rounded-full bg-white"
              disabled={isLoading}
              onClick={() => loadOrders({ nextPage: page, append: true })}
            >
              載入更多訂單
            </Button>
          )}
        </section>

        <aside className="h-fit rounded-[8px] border border-stone-200 bg-white p-5 shadow-sm">
          {isDetailLoading ? (
            <div className="py-12 text-center text-sm text-stone-400">
              訂單明細載入中...
            </div>
          ) : selectedOrder ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    訂單明細
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selectedOrder.order_number}
                  </h2>
                </div>
                <ClipboardList className="h-6 w-6 text-[#b99aa2]" />
              </div>

              <div className="grid gap-2 text-sm text-stone-600">
                <p><span className="font-medium text-stone-900">姓名：</span>{selectedOrder.customer_name}</p>
                <p><span className="font-medium text-stone-900">訂單來源：</span>{orderSourceLabels[selectedOrder.order_source || "online"]}</p>
                <p><span className="font-medium text-stone-900">電話：</span>{selectedOrder.customer_phone}</p>
                <p><span className="font-medium text-stone-900">Email：</span>{selectedOrder.customer_email || "-"}</p>
                <p><span className="font-medium text-stone-900">地址：</span>{selectedOrder.shipping_address}</p>
                {selectedOrder.note && (
                  <p><span className="font-medium text-stone-900">備註：</span>{selectedOrder.note}</p>
                )}
              </div>

              <div className="grid gap-3 rounded-[8px] bg-[#fbf7f1] p-4">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">訂單狀態</span>
                  <select
                    value={draftOrderStatus}
                    onChange={(event) =>
                      setDraftOrderStatus(event.target.value as AdminOrderStatus)
                    }
                    className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3"
                  >
                    {orderStatusOptions
                      .filter((option) => option.value)
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-stone-900">付款狀態</span>
                  <select
                    value={draftPaymentStatus}
                    onChange={(event) =>
                      setDraftPaymentStatus(event.target.value as AdminPaymentStatus)
                    }
                    className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3"
                  >
                    {paymentStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  onClick={saveStatuses}
                  disabled={isSaving}
                  className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "儲存中..." : "儲存狀態"}
                </Button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">商品明細</h3>
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-[8px] border border-stone-100 p-3"
                  >
                    <img
                      src={item.product_image_url || "/images/logo.webp"}
                      alt={item.product_name}
                      className="aspect-square rounded-[6px] bg-[#f6f1ea] object-cover"
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-stone-900">
                        {item.product_name}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {getVariantLabel(item.variant_name, item.variant_option)}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-stone-500">
                          {formatPrice(item.unit_price)} x {item.quantity}
                        </span>
                        <span className="font-semibold text-stone-900">
                          {formatPrice(item.line_total)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-stone-100 pt-4 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>商品小計</span>
                  <span>{formatPrice(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>運費</span>
                  <span>{formatPrice(selectedOrder.shipping_fee)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-stone-900">
                  <span>總金額</span>
                  <span>{formatPrice(selectedOrder.total)}</span>
                </div>
                <p className="pt-2 text-xs text-stone-400">
                  建立時間：{formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-stone-400">
              <ClipboardList className="mx-auto mb-3 h-9 w-9" />
              <p>{selectedSummary ? "請稍候..." : "選擇一筆訂單查看明細。"}</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
