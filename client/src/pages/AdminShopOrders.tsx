import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  LogOut,
  PackageSearch,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminShopNav from "@/components/shop/AdminShopNav";
import OrderPrintView from "@/components/shop/OrderPrintView";
import {
  type AdminOrderStatus,
  type AdminOrderSource,
  type AdminPaymentStatus,
  type AdminTrackingFilter,
  type AdminShopOrderDetail,
  type AdminShopOrderItemExportRow,
  type AdminShopOrderSummary,
  fetchAdminShopOrder,
  fetchAdminShopOrderItemsForExport,
  fetchAdminShopOrders,
  fetchAdminShopOrdersForExport,
  updateAdminShopOrderStatus,
  updateAdminShopOrderShipping,
} from "@/lib/shop/adminOrdersApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  getPaymentMethodLabel,
} from "@/lib/shop/labels";
import {
  adminAuthExpiredMessage,
  clearAdminToken as clearStoredAdminToken,
  getAdminToken,
  isAdminAuthError,
  setAdminToken as setStoredAdminToken,
} from "@/lib/shop/adminAuth";
import { loginLegacyAdminPassword } from "@/lib/shop/adminIdentityApi";
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

const paymentStatusFilterOptions: Array<{
  value: "" | AdminPaymentStatus;
  label: string;
}> = [
  { value: "", label: "全部付款" },
  { value: "pending", label: PAYMENT_STATUS_LABELS.pending },
  { value: "confirmed", label: PAYMENT_STATUS_LABELS.confirmed },
];

const trackingFilterOptions: Array<{ value: AdminTrackingFilter; label: string }> = [
  { value: "", label: "全部物流" },
  { value: "with", label: "有物流單號" },
  { value: "without", label: "無物流單號" },
];

function getInitialOrderQuery() {
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const querySource = params.get("source") || "";
  const queryStatus = params.get("status") || "";
  const queryPaymentStatus = params.get("paymentStatus") || "";
  const queryOrderNumber = params.get("orderNumber") || "";
  const querySearch = params.get("q") || "";
  const validSource = orderSourceOptions.some(
    (option) => option.value && option.value === querySource
  );
  const validStatus = orderStatusOptions.some(
    (option) => option.value && option.value === queryStatus
  );
  const validPaymentStatus = paymentStatusFilterOptions.some(
    (option) => option.value && option.value === queryPaymentStatus
  );

  return {
    search: queryOrderNumber || querySearch,
    orderNumber: queryOrderNumber,
    status: validStatus ? (queryStatus as AdminOrderStatus) : "",
    source: validSource ? (querySource as AdminOrderSource) : "",
    paymentStatus: validPaymentStatus ? (queryPaymentStatus as AdminPaymentStatus) : "",
  };
}

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

function escapeCsvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function formatDateForFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function buildOrdersCsv(orders: AdminShopOrderSummary[]) {
  const headers = [
    "訂單編號",
    "建立時間",
    "訂單來源",
    "顧客姓名",
    "電話",
    "Email",
    "地址",
    "付款方式",
    "付款狀態",
    "訂單狀態",
    "商品小計",
    "運費",
    "總金額",
    "物流方式",
    "物流單號",
    "顧客備註",
    "內部備註",
  ];
  const rows = orders.map((order) => [
    order.order_number,
    formatDateTime(order.created_at),
    orderSourceLabels[order.order_source || "online"],
    order.customer_name,
    order.customer_phone,
    order.customer_email || "",
    order.shipping_address || "",
    getPaymentMethodLabel(order.payment_method),
    paymentStatusLabels[order.payment_status],
    orderStatusLabels[order.order_status],
    order.subtotal,
    order.shipping_fee,
    order.total,
    order.shipping_carrier || "",
    order.tracking_number || "",
    order.note || "",
    order.internal_note || "",
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");
}

function buildOrderItemsCsv(rows: AdminShopOrderItemExportRow[]) {
  const headers = [
    "訂單編號",
    "建立時間",
    "訂單來源",
    "顧客姓名",
    "電話",
    "Email",
    "訂單狀態",
    "付款狀態",
    "物流方式",
    "物流單號",
    "商品名稱",
    "規格名稱",
    "規格選項",
    "SKU",
    "單價",
    "數量",
    "小計",
    "訂單總金額",
    "內部備註",
  ];
  const csvRows = rows.map((row) => [
    row.order_number,
    formatDateTime(row.created_at),
    orderSourceLabels[row.order_source || "online"],
    row.customer_name,
    row.customer_phone,
    row.customer_email || "",
    orderStatusLabels[row.order_status],
    paymentStatusLabels[row.payment_status],
    row.shipping_carrier || "",
    row.tracking_number || "",
    row.product_name,
    row.variant_name || "",
    row.variant_option || "",
    row.sku || "",
    row.unit_price,
    row.quantity,
    row.line_total,
    row.order_total,
    row.internal_note || "",
  ]);

  return [headers, ...csvRows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminShopOrders() {
  const [initialQuery] = useState(() => getInitialOrderQuery());
  const autoOpenOrderNumberRef = useRef(initialQuery.orderNumber);
  const hasAutoOpenedOrderRef = useRef(false);
  const [token, setToken] = useState(() => getStoredAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<AdminShopOrderSummary[]>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminShopOrderDetail | null>(null);
  const [search, setSearch] = useState(initialQuery.search);
  const [status, setStatus] = useState<"" | AdminOrderStatus>(initialQuery.status);
  const [source, setSource] = useState<"" | AdminOrderSource>(initialQuery.source);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"" | AdminPaymentStatus>(
    initialQuery.paymentStatus
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [trackingFilter, setTrackingFilter] = useState<AdminTrackingFilter>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isItemsExporting, setIsItemsExporting] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [error, setError] = useState("");
  const [quickActionMessage, setQuickActionMessage] = useState("");
  const [draftOrderStatus, setDraftOrderStatus] = useState<AdminOrderStatus>("pending_confirm");
  const [draftPaymentStatus, setDraftPaymentStatus] = useState<AdminPaymentStatus>("pending");
  const [draftShippingCarrier, setDraftShippingCarrier] = useState("");
  const [draftTrackingNumber, setDraftTrackingNumber] = useState("");
  const [draftInternalNote, setDraftInternalNote] = useState("");
  const [isShippingSaving, setIsShippingSaving] = useState(false);
  const [shippingSaveMessage, setShippingSaveMessage] = useState("");

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
          paymentStatus: paymentStatusFilter,
          dateFrom,
          dateTo,
          tracking: trackingFilter,
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
    [
      dateFrom,
      dateTo,
      handleAuthFailure,
      paymentStatusFilter,
      search,
      source,
      status,
      token,
      trackingFilter,
    ]
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
        setDraftShippingCarrier(detail.shipping_carrier || "");
        setDraftTrackingNumber(detail.tracking_number || "");
        setDraftInternalNote(detail.internal_note || "");
        setShippingSaveMessage("");
        setIsPrintOpen(false);
        setQuickActionMessage("");
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
    if (
      !token ||
      isLoading ||
      hasAutoOpenedOrderRef.current ||
      !autoOpenOrderNumberRef.current ||
      orders.length !== 1
    ) {
      return;
    }

    hasAutoOpenedOrderRef.current = true;
    loadOrderDetail(orders[0].order_number);
  }, [isLoading, loadOrderDetail, orders, token]);

  useEffect(() => {
    if (!token) return;
    loadOrders({ nextPage: 0 });
  }, [loadOrders, token]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const legacyPassword = password.trim();

    if (!legacyPassword) {
      setLoginError("??? ADMIN_PASSWORD");
      return;
    }

    try {
      const session = await loginLegacyAdminPassword(legacyPassword);
      saveAdminToken(session.accessToken);
      setToken(session.accessToken);
      setPassword("");
      setLoginError("");
    } catch (error) {
      clearAdminToken();
      setToken("");
      setLoginError(error instanceof Error ? error.message : adminAuthExpiredMessage);
    }
  };

  const logout = () => {
    clearAdminToken();
    setToken("");
    setPassword("");
    setOrders([]);
    setSelectedOrderNumber("");
    setSelectedOrder(null);
    setIsPrintOpen(false);
    setQuickActionMessage("");
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSelectedOrderNumber("");
    setSelectedOrder(null);
    setIsPrintOpen(false);
    setQuickActionMessage("");
    loadOrders({ nextPage: 0 });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setSource("");
    setPaymentStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setTrackingFilter("");
    setSelectedOrderNumber("");
    setSelectedOrder(null);
    setIsPrintOpen(false);
    setQuickActionMessage("");
  };

  const updateSelectedOrderStatuses = async ({
    order_status,
    payment_status,
    confirmMessage,
    successMessage,
  }: {
    order_status?: AdminOrderStatus;
    payment_status?: AdminPaymentStatus;
    confirmMessage?: string;
    successMessage?: string;
  }) => {
    if (!token || !selectedOrder) return;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setIsSaving(true);
    try {
      const nextOrder = await updateAdminShopOrderStatus({
        token,
        orderNumber: selectedOrder.order_number,
        order_status,
        payment_status,
      });
      setSelectedOrder(nextOrder);
      setDraftOrderStatus(nextOrder.order_status);
      setDraftPaymentStatus(nextOrder.payment_status);
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
      setQuickActionMessage(successMessage || "");
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

  const saveStatuses = async () => {
    await updateSelectedOrderStatuses({
      order_status: draftOrderStatus,
      payment_status: draftPaymentStatus,
      successMessage: "訂單狀態已更新。",
    });
  };

  const saveShipping = async () => {
    if (!token || !selectedOrder) return;

    setIsShippingSaving(true);
    setShippingSaveMessage("");
    try {
      const nextOrder = await updateAdminShopOrderShipping({
        token,
        orderNumber: selectedOrder.order_number,
        shipping_carrier: draftShippingCarrier || undefined,
        tracking_number: draftTrackingNumber || undefined,
        internal_note: draftInternalNote || undefined,
      });
      setSelectedOrder(nextOrder);
      setShippingSaveMessage("出貨資訊已儲存。");
      setError("");
    } catch (saveError) {
      if (isAdminAuthError(saveError)) {
        handleAuthFailure();
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "出貨資訊儲存失敗。");
    } finally {
      setIsShippingSaving(false);
    }
  };

  const exportOrdersCsv = async () => {
    if (!token) return;

    setIsExporting(true);
    try {
      const data = await fetchAdminShopOrdersForExport({
        token,
        q: search,
        status,
        source,
        paymentStatus: paymentStatusFilter,
        dateFrom,
        dateTo,
        tracking: trackingFilter,
      });
      const csv = buildOrdersCsv(data.orders || []);
      downloadCsv(`mumbao-orders-${formatDateForFileName()}.csv`, csv);
      setError("");
    } catch (exportError) {
      if (isAdminAuthError(exportError)) {
        handleAuthFailure();
        return;
      }
      setError(exportError instanceof Error ? exportError.message : "訂單匯出失敗。");
    } finally {
      setIsExporting(false);
    }
  };

  const exportOrderItemsCsv = async () => {
    if (!token) return;

    setIsItemsExporting(true);
    try {
      const data = await fetchAdminShopOrderItemsForExport({
        token,
        q: search,
        status,
        source,
        paymentStatus: paymentStatusFilter,
        dateFrom,
        dateTo,
        tracking: trackingFilter,
      });
      const csv = buildOrderItemsCsv(data.rows || []);
      downloadCsv(`mumbao-order-items-${formatDateForFileName()}.csv`, csv);
      setError("");
    } catch (exportError) {
      if (isAdminAuthError(exportError)) {
        handleAuthFailure();
        return;
      }
      setError(
        exportError instanceof Error ? exportError.message : "商品明細匯出失敗。"
      );
    } finally {
      setIsItemsExporting(false);
    }
  };

  const selectedOrderSource = selectedOrder?.order_source || "online";
  const isSelectedOnlineOrder = selectedOrderSource === "online";
  const isWaitingForPayment =
    isSelectedOnlineOrder &&
    selectedOrder &&
    (selectedOrder.order_status === "pending_confirm" ||
      selectedOrder.payment_status === "pending");
  const isPaidOrder =
    isSelectedOnlineOrder &&
    selectedOrder &&
    !isWaitingForPayment &&
    selectedOrder.order_status === "paid";
  const isShippingOrder =
    isSelectedOnlineOrder &&
    selectedOrder &&
    !isWaitingForPayment &&
    selectedOrder.order_status === "shipping";
  const isCompletedOrder =
    isSelectedOnlineOrder && selectedOrder?.order_status === "completed";
  const isCancelledOrder =
    isSelectedOnlineOrder && selectedOrder?.order_status === "cancelled";
  const canCancelOrder = Boolean(isWaitingForPayment || isPaidOrder || isShippingOrder);

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
    <>
      <main className="no-print min-h-[100svh] bg-[#f7f2ea] text-stone-900">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex h-11 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 sm:col-span-2 xl:col-span-3">
                <Search className="h-4 w-4 text-stone-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋訂單編號、姓名、電話、Email、物流單號"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  訂單狀態
                </span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as "" | AdminOrderStatus);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  className="h-11 w-full rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
                >
                  {orderStatusOptions.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  訂單來源
                </span>
                <select
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value as "" | AdminOrderSource);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  className="h-11 w-full rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
                >
                  {orderSourceOptions.map((option) => (
                    <option key={option.value || "all-source"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  付款狀態
                </span>
                <select
                  value={paymentStatusFilter}
                  onChange={(event) => {
                    setPaymentStatusFilter(event.target.value as "" | AdminPaymentStatus);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  className="h-11 w-full rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
                >
                  {paymentStatusFilterOptions.map((option) => (
                    <option key={option.value || "all-payment"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  開始日期
                </span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  aria-label="開始日期"
                  className="h-11 w-full rounded-full border-stone-200 bg-white px-4 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  結束日期
                </span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  aria-label="結束日期"
                  className="h-11 w-full rounded-full border-stone-200 bg-white px-4 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-xs font-medium text-stone-500">
                  物流單號
                </span>
                <select
                  value={trackingFilter}
                  onChange={(event) => {
                    setTrackingFilter(event.target.value as AdminTrackingFilter);
                    setSelectedOrderNumber("");
                    setSelectedOrder(null);
                  }}
                  className="h-11 w-full rounded-full border border-stone-200 bg-white px-4 text-sm outline-none"
                >
                  {trackingFilterOptions.map((option) => (
                    <option key={option.value || "all-tracking"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 xl:col-span-3 xl:grid-cols-4">
                <Button type="submit" className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                  搜尋
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  onClick={clearFilters}
                >
                  清除篩選
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  onClick={exportOrdersCsv}
                  disabled={isExporting}
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? "匯出中..." : "匯出訂單總表 CSV"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                  onClick={exportOrderItemsCsv}
                  disabled={isItemsExporting}
                >
                  <Download className="h-4 w-4" />
                  {isItemsExporting ? "匯出中..." : "匯出商品明細 CSV"}
                </Button>
              </div>
            </div>
          </form>

          {error && (
            <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="rounded-[8px] border border-stone-200 bg-white p-3 shadow-sm">
            {orders.length === 0 ? (
              <div className="px-5 py-14 text-center text-stone-400">
                <PackageSearch className="mx-auto mb-3 h-9 w-9" />
                <p>{isLoading ? "訂單載入中..." : "目前沒有符合條件的訂單。"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const isSelected = selectedOrderNumber === order.order_number;
                  const customerName =
                    order.customer_name?.trim() ||
                    (order.order_source === "pos" ? "POS 現場銷售" : "未填姓名");

                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => loadOrderDetail(order.order_number)}
                      className={cn(
                        "block w-full cursor-pointer rounded-[8px] border p-4 text-left transition",
                        isSelected
                          ? "border-[#b99aa2] bg-[#f4ece2] shadow-sm ring-1 ring-inset ring-[#b99aa2]"
                          : "border-stone-100 bg-[#fbf7f1] hover:-translate-y-0.5 hover:border-[#b99aa2] hover:bg-[#f4ece2] hover:shadow-sm"
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all font-mono text-xs font-semibold leading-5 text-stone-900 md:text-[13px]">
                              {order.order_number}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#765d4a]">
                              {orderSourceLabels[order.order_source || "online"]}
                            </span>
                          </div>
                          <p className="text-base font-semibold leading-6 text-stone-900">
                            {order.items_summary || "尚無商品明細"}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
                            <span>{customerName}</span>
                            {order.customer_phone && <span>{order.customer_phone}</span>}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 md:min-w-[260px] md:items-end">
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <StatusPill tone={getPaymentTone(order.payment_status)}>
                              {paymentStatusLabels[order.payment_status]}
                            </StatusPill>
                            <StatusPill tone={getOrderTone(order.order_status)}>
                              {orderStatusLabels[order.order_status]}
                            </StatusPill>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 md:justify-end">
                            <span className="text-xs text-stone-500">
                              {formatDateTime(order.created_at)}
                            </span>
                            <span className="text-base font-semibold text-[#8b6f5b]">
                              {formatPrice(order.total)}
                            </span>
                          </div>
                          <span className="inline-flex w-fit rounded-full bg-[#8b6f5b] px-3 py-1.5 text-sm font-semibold text-white">
                            查看
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
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
                <div className="flex flex-col items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full bg-white text-stone-700"
                    onClick={() => setIsPrintOpen(true)}
                  >
                    <Printer className="h-4 w-4" />
                    列印備貨單
                  </Button>
                  <ClipboardList className="h-6 w-6 text-[#b99aa2]" />
                </div>
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

              <div className="rounded-[8px] border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">
                      訂單處理快捷操作
                    </h3>
                    {isPaidOrder && (
                      <p className="mt-1 text-xs leading-relaxed text-stone-500">
                        目前可先以「已付款」作為備貨中過渡。
                      </p>
                    )}
                  </div>
                  <StatusPill tone={getOrderTone(selectedOrder.order_status)}>
                    {orderStatusLabels[selectedOrder.order_status]}
                  </StatusPill>
                </div>

                {selectedOrderSource === "pos" ? (
                  <div className="mt-4 rounded-[8px] border border-[#eadfd2] bg-[#fbf7f1] p-3 text-sm leading-relaxed text-stone-600">
                    此為現場銷售訂單，通常已完成付款與庫存扣除。
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {quickActionMessage && (
                      <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        {quickActionMessage}
                      </div>
                    )}
                    {isCompletedOrder ? (
                      <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
                        訂單已完成。
                      </div>
                    ) : isCancelledOrder ? (
                      <div className="rounded-[8px] border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                        訂單已取消。
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {isWaitingForPayment && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving}
                            className="justify-center rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            onClick={() =>
                              updateSelectedOrderStatuses({
                                payment_status: "confirmed",
                                order_status: "paid",
                                successMessage: "已確認付款，訂單狀態已改為已付款。",
                              })
                            }
                          >
                            確認付款
                          </Button>
                        )}
                        {isPaidOrder && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving}
                            className="justify-center rounded-full border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                            onClick={() =>
                              updateSelectedOrderStatuses({
                                order_status: "shipping",
                                successMessage: "訂單已標記為出貨中。",
                              })
                            }
                          >
                            標記出貨中
                          </Button>
                        )}
                        {isShippingOrder && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving}
                            className="justify-center rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                            onClick={() =>
                              updateSelectedOrderStatuses({
                                order_status: "completed",
                                confirmMessage: "確定要將這筆訂單標記為已完成嗎？",
                                successMessage: "訂單已標記為已完成。",
                              })
                            }
                          >
                            標記已完成
                          </Button>
                        )}
                        {canCancelOrder && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isSaving}
                            className="justify-center rounded-full border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            onClick={() =>
                              updateSelectedOrderStatuses({
                                order_status: "cancelled",
                                confirmMessage:
                                  "確定要取消這筆訂單嗎？此操作只會變更訂單狀態，不會自動補回庫存。",
                                successMessage: "訂單已標記為已取消。",
                              })
                            }
                          >
                            取消訂單
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
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

              <div className="grid gap-3 rounded-[8px] bg-[#fbf7f1] p-4">
                <h3 className="text-sm font-semibold text-stone-900">出貨與內部備註</h3>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-900">物流方式</span>
                  <input
                    type="text"
                    value={draftShippingCarrier}
                    onChange={(event) => setDraftShippingCarrier(event.target.value)}
                    placeholder="例：黑貓、郵局、7-11、面交、自取"
                    className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3 text-sm outline-none focus:border-[#8b6f5b]"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-900">物流單號</span>
                  <input
                    type="text"
                    value={draftTrackingNumber}
                    onChange={(event) => setDraftTrackingNumber(event.target.value)}
                    placeholder="輸入追蹤號碼"
                    className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3 text-sm outline-none focus:border-[#8b6f5b]"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-900">
                    內部備註
                    <span className="ml-1 text-xs font-normal text-stone-400">（顧客不可見）</span>
                  </span>
                  <textarea
                    value={draftInternalNote}
                    onChange={(event) => setDraftInternalNote(event.target.value)}
                    placeholder="後台內部使用，顧客不會看到此備註"
                    rows={3}
                    className="w-full resize-none rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#8b6f5b]"
                  />
                </label>
                {shippingSaveMessage && (
                  <div className="rounded-[8px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {shippingSaveMessage}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={saveShipping}
                  disabled={isShippingSaving}
                  className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
                >
                  <Save className="h-4 w-4" />
                  {isShippingSaving ? "儲存中..." : "儲存出貨資訊"}
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

      {isPrintOpen && selectedOrder && (
        <OrderPrintView order={selectedOrder} onClose={() => setIsPrintOpen(false)} />
      )}
    </>
  );
}
