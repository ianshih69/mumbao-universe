import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminShopOrderDetail } from "@/lib/shop/adminOrdersApi";
import { formatPrice, getVariantLabel } from "@/lib/shop/format";
import {
  getOrderSourceLabel,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "@/lib/shop/labels";

type OrderPrintViewProps = {
  order: AdminShopOrderDetail;
  onClose: () => void;
};

function formatDateTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "-";

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}/${getPart("month")}/${getPart("day")} ${getPart(
    "hour"
  )}:${getPart("minute")}`;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-stone-900">{value || "-"}</dd>
    </div>
  );
}

export default function OrderPrintView({ order, onClose }: OrderPrintViewProps) {
  return (
    <div className="order-print-root fixed inset-0 z-50 overflow-y-auto bg-stone-950/45 px-4 py-6 print:bg-white print:p-0">
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          .no-print,
          .order-print-actions {
            display: none !important;
          }

          .order-print-root {
            position: static !important;
            inset: auto !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }

          .order-print-root * {
            box-sizing: border-box !important;
            overflow: visible !important;
          }

          .order-print-dialog {
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            height: auto !important;
          }

          .order-print-sheet {
            box-shadow: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 180mm !important;
            height: auto !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 auto !important;
            color: #1c1917 !important;
            page-break-before: auto !important;
            page-break-after: auto !important;
            page-break-inside: auto !important;
          }

          .order-print-sheet header {
            padding-bottom: 8px !important;
          }

          .order-print-sheet h1 {
            font-size: 22px !important;
            line-height: 1.2 !important;
          }

          .order-print-sheet h2 {
            font-size: 13px !important;
          }

          .order-print-sheet dl {
            padding: 8px !important;
            gap: 6px !important;
          }

          .order-print-info-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
            margin-top: 12px !important;
          }

          .order-print-section {
            margin-top: 12px !important;
          }

          .order-print-sheet th {
            padding: 5px 6px !important;
          }

          .order-print-sheet td {
            padding: 6px !important;
          }

          .order-print-total {
            margin-top: 10px !important;
            padding: 8px !important;
          }
        }
      `}</style>

      <div className="order-print-dialog mx-auto max-w-4xl">
        <div className="order-print-actions mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-white p-3 shadow-lg shadow-stone-900/10">
          <div>
            <p className="text-sm font-semibold text-stone-900">備貨單預覽</p>
            <p className="text-xs text-stone-500">確認內容後即可列印或截圖留存。</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full bg-white"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              關閉
            </Button>
            <Button
              type="button"
              className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]"
              onClick={() => window.print()}
            >
              列印
            </Button>
          </div>
        </div>

        <section className="order-print-sheet rounded-[8px] border border-stone-200 bg-white p-8 text-stone-900 shadow-2xl shadow-stone-900/15">
          <header className="border-b-2 border-stone-900 pb-5">
            <p className="text-xs tracking-[0.24em] text-stone-500">MUMBAO SHOP</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h1 className="font-serif text-3xl font-semibold tracking-wide">
                慢慢蒔光｜備貨單
              </h1>
              <p className="text-sm text-stone-500">
                建立時間：{formatDateTime(order.created_at)}
              </p>
            </div>
          </header>

          <div className="order-print-info-grid mt-6 grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="text-sm font-semibold text-stone-900">訂單資訊</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-[8px] border border-stone-200 p-4">
                <Field label="訂單編號" value={order.order_number} />
                <Field label="訂單來源" value={getOrderSourceLabel(order.order_source)} />
                <Field label="訂單狀態" value={getOrderStatusLabel(order.order_status)} />
                <Field label="付款狀態" value={getPaymentStatusLabel(order.payment_status)} />
                <Field label="付款方式" value={getPaymentMethodLabel(order.payment_method)} />
                <Field label="總金額" value={formatPrice(order.total)} />
              </dl>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-stone-900">顧客資訊</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-[8px] border border-stone-200 p-4">
                <Field label="顧客姓名" value={order.customer_name} />
                <Field label="電話" value={order.customer_phone} />
                <Field label="Email" value={order.customer_email} />
                <div className="col-span-2">
                  <Field label="地址" value={order.shipping_address} />
                </div>
                <div className="col-span-2">
                  <Field label="備註" value={order.note} />
                </div>
              </dl>
            </section>
          </div>

          {(order.shipping_carrier || order.tracking_number) && (
            <section className="order-print-section mt-5">
              <h2 className="text-sm font-semibold text-stone-900">出貨資訊</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-[8px] border border-stone-200 p-4">
                {order.shipping_carrier && (
                  <Field label="物流方式" value={order.shipping_carrier} />
                )}
                {order.tracking_number && (
                  <Field label="物流單號" value={order.tracking_number} />
                )}
              </dl>
            </section>
          )}

          <section className="order-print-section mt-7">
            <h2 className="text-sm font-semibold text-stone-900">商品明細</h2>
            <div className="mt-3 overflow-hidden rounded-[8px] border border-stone-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#fbf7f1] text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">商品名稱</th>
                    <th className="px-3 py-2 font-medium">規格</th>
                    <th className="px-3 py-2 text-right font-medium">單價</th>
                    <th className="px-3 py-2 text-right font-medium">數量</th>
                    <th className="px-3 py-2 text-right font-medium">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t border-stone-100">
                      <td className="px-3 py-3 align-top font-medium text-stone-900">
                        {item.product_name}
                      </td>
                      <td className="px-3 py-3 align-top text-stone-600">
                        {getVariantLabel(item.variant_name, item.variant_option)}
                      </td>
                      <td className="px-3 py-3 text-right align-top text-stone-700">
                        {formatPrice(item.unit_price)}
                      </td>
                      <td className="px-3 py-3 text-right align-top text-stone-700">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-3 text-right align-top font-semibold text-stone-900">
                        {formatPrice(item.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="order-print-total ml-auto mt-6 w-full max-w-sm space-y-2 rounded-[8px] border border-stone-200 p-4 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>商品小計</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>運費</span>
              <span>{formatPrice(order.shipping_fee)}</span>
            </div>
            <div className="border-t border-stone-200 pt-3">
              <div className="flex justify-between text-lg font-semibold text-stone-900">
                <span>總金額</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
