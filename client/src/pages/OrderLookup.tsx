import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, CheckCircle2, PackageSearch, Truck } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { lookupShopOrder } from "@/lib/shop/api";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import type { PublicOrderLookup } from "@/lib/shop/types";

const invalidLookupMessage = "查詢連結無效或已失效。";

const orderStatusLabels: Record<PublicOrderLookup["order_status"], string> = {
  pending_confirm: "待確認",
  pending_payment: "待付款",
  paid: "已付款",
  shipping: "出貨中",
  completed: "已完成",
  cancelled: "已取消",
};

const paymentStatusLabels: Record<PublicOrderLookup["payment_status"], string> = {
  pending: "待確認",
  confirmed: "已確認",
  failed: "付款失敗",
  refunded: "已退款",
};

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readTokenFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("token") || "";
}

export default function OrderLookup() {
  const [order, setOrder] = useState<PublicOrderLookup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const token = readTokenFromHash();
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      setError(invalidLookupMessage);
      setIsLoading(false);
      return;
    }

    lookupShopOrder(token)
      .then((nextOrder) => {
        if (!isMounted) return;
        setOrder(nextOrder);
        setError("");
      })
      .catch((lookupError) => {
        if (!isMounted) return;
        setError(
          lookupError instanceof Error && lookupError.message
            ? lookupError.message
            : "系統暫時無法查詢，請稍後再試。"
        );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white text-[#8b6f5b] hover:bg-[#f3eadf]">
            <Link href="/shop">
              <ArrowLeft className="h-4 w-4" />
              回到商城
            </Link>
          </Button>
          <p className="mt-6 text-sm uppercase tracking-[0.2em] text-[#9f7868]">
            Order Lookup
          </p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
            訂單查詢
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            此頁只會顯示查詢連結對應的訂單，收件資料已做遮罩保護。
          </p>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <PackageSearch className="mx-auto h-10 w-10 text-[#9f7868]" />
            <p className="mt-4 text-sm text-stone-600">正在查詢訂單...</p>
          </section>
        )}

        {!isLoading && error && (
          <section className="rounded-[8px] border border-red-100 bg-red-50 p-6 text-red-700">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <h2 className="font-semibold">無法查詢訂單</h2>
                <p className="mt-2 text-sm leading-6">{error}</p>
              </div>
            </div>
          </section>
        )}

        {!isLoading && order && (
          <section className="space-y-6">
            <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[#8b6f5b]">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-semibold">查詢成功</span>
                  </div>
                  <h2 className="mt-3 font-mono text-2xl font-semibold text-stone-900">
                    {order.order_number}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    建立時間：{formatDate(order.created_at)}
                  </p>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <span className="rounded-full bg-[#f3eadf] px-4 py-2 font-medium text-[#765d4a]">
                    訂單狀態：{orderStatusLabels[order.order_status] || order.order_status}
                  </span>
                  <span className="rounded-full bg-white px-4 py-2 font-medium text-stone-700 ring-1 ring-[#eadfce]">
                    付款狀態：{paymentStatusLabels[order.payment_status] || order.payment_status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                <h3 className="font-serif text-2xl text-stone-900">商品摘要</h3>
                <div className="mt-4 divide-y divide-[#f0e5d7]">
                  {order.items.map((item, index) => (
                    <div key={`${item.product_name}-${index}`} className="flex gap-4 py-4">
                      <div className="h-16 w-16 flex-none overflow-hidden rounded-[8px] bg-[#f3eadf]">
                        {item.product_image_url ? (
                          <img
                            src={item.product_image_url}
                            alt={item.product_name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-900">{item.product_name}</p>
                        <p className="mt-1 text-sm text-stone-500">
                          {getVariantLabel(item.variant_name, item.variant_option) || "一般規格"}
                        </p>
                        <p className="mt-2 text-sm text-stone-600">
                          {formatPrice(item.unit_price)} x {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium text-stone-900">{formatPrice(item.line_total)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                  <h3 className="font-serif text-2xl text-stone-900">收件資料</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">姓名</dt>
                      <dd className="text-right font-medium text-stone-800">{order.customer.name || "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">電話</dt>
                      <dd className="text-right font-medium text-stone-800">{order.customer.phone || "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">Email</dt>
                      <dd className="text-right font-medium text-stone-800">{order.customer.email || "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">地址</dt>
                      <dd className="text-right font-medium text-stone-800">{order.customer.address || "-"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-[#9f7868]" />
                    <h3 className="font-serif text-2xl text-stone-900">物流資訊</h3>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">物流公司</dt>
                      <dd className="text-right font-medium text-stone-800">{order.shipping_carrier || "尚未出貨"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-stone-500">物流單號</dt>
                      <dd className="text-right font-medium text-stone-800">{order.tracking_number || "尚未提供"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
                  <h3 className="font-serif text-2xl text-stone-900">金額</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-stone-500">商品小計</dt>
                      <dd>{formatPrice(order.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-500">運費</dt>
                      <dd>{formatPrice(order.shipping_fee)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-[#f0e5d7] pt-3 text-base font-semibold text-stone-900">
                      <dt>總額</dt>
                      <dd>{formatPrice(order.total)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
