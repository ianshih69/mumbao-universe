import { useEffect, useMemo, useState } from "react";
import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildQrFileName,
  buildVariantQrValue,
  createQrDataUrl,
} from "@/lib/shop/qrCode";
import { cn } from "@/lib/utils";

type VariantQrCodeProps = {
  sku?: string | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
};

export default function VariantQrCode({
  sku,
  title = "商品 QR code",
  subtitle,
  compact = false,
  className,
}: VariantQrCodeProps) {
  const normalizedSku = sku?.trim() || "";
  const qrValue = useMemo(
    () => (normalizedSku ? buildVariantQrValue(normalizedSku) : ""),
    [normalizedSku]
  );
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    if (!qrValue) {
      setDataUrl("");
      setError("");
      return;
    }

    createQrDataUrl(qrValue, compact ? 168 : 220)
      .then((nextDataUrl) => {
        if (!isActive) return;
        setDataUrl(nextDataUrl);
        setError("");
      })
      .catch(() => {
        if (!isActive) return;
        setDataUrl("");
        setError("QR code 產生失敗");
      });

    return () => {
      isActive = false;
    };
  }, [compact, qrValue]);

  const downloadQr = () => {
    if (!dataUrl || !normalizedSku) return;

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = buildQrFileName(normalizedSku);
    link.click();
  };

  if (!normalizedSku) {
    return (
      <div
        className={cn(
          "rounded-[8px] border border-dashed border-stone-200 bg-white p-4 text-sm text-stone-400",
          className
        )}
      >
        請先填商品編號
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[8px] border border-stone-100 bg-white p-4",
        className
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{title}</p>
          {subtitle && <p className="mt-1 text-xs text-stone-500">{subtitle}</p>}
        </div>
        <QrCode className="h-5 w-5 shrink-0 text-[#8b6f5b]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex justify-center rounded-[8px] bg-[#fffaf5] p-3">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={`${normalizedSku} QR code`}
              className={cn(
                "aspect-square object-contain",
                compact ? "size-32" : "size-40"
              )}
            />
          ) : (
            <div
              className={cn(
                "flex aspect-square items-center justify-center rounded-[6px] bg-stone-50 text-xs text-stone-400",
                compact ? "size-32" : "size-40"
              )}
            >
              {error || "產生中..."}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="break-all font-mono text-xs text-stone-500">{qrValue}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full bg-white sm:w-auto"
            onClick={downloadQr}
            disabled={!dataUrl}
          >
            <Download className="h-4 w-4" />
            下載 QR code
          </Button>
        </div>
      </div>
    </div>
  );
}
