import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { CheckCircle2, Home, MessageCircle, Search, ShoppingBag } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

const orderLookupStoragePrefix = "mumbao-shop-order-lookup:";

function readOrderLookupToken(orderNumber: string) {
  try {
    return sessionStorage.getItem(`${orderLookupStoragePrefix}${orderNumber}`) || "";
  } catch {
    return "";
  }
}

export default function OrderComplete() {
  const [, params] = useRoute("/order-complete/:orderNumber");
  const orderNumber = decodeURIComponent(params?.orderNumber || "");
  const [lookupToken, setLookupToken] = useState("");

  useEffect(() => {
    if (!orderNumber) return;
    setLookupToken(readOrderLookupToken(orderNumber));
  }, [orderNumber]);

  const lookupHref = lookupToken
    ? `/order/lookup#token=${encodeURIComponent(lookupToken)}`
    : "";

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-4xl items-center px-5 py-32 md:px-8">
        <section className="w-full rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60 md:p-12">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm uppercase tracking-[0.24em] text-[#9f7868]">
            Order Complete
          </p>
          <h1 className="mt-3 font-serif text-4xl font-light">訂單已成立</h1>
          <div className="mx-auto mt-5 max-w-xl rounded-[8px] border border-[#f0e5d7] bg-white/75 px-5 py-4">
            <p className="text-xs text-stone-500">訂單編號</p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-stone-900">
              {orderNumber}
            </p>
          </div>
          <div className="mx-auto mt-6 max-w-2xl space-y-3 text-sm leading-7 text-stone-600">
            <p>
              感謝您的訂購。我們會盡快確認付款與出貨資訊，請保存訂單編號與查詢連結。
            </p>
            <p>
              會員功能即將推出，未來可更方便查看歷史訂單與快速結帳。
            </p>
            {!lookupToken && (
              <p className="rounded-[8px] border border-amber-100 bg-amber-50 px-4 py-3 text-amber-800">
                此頁目前沒有可用的查詢憑證。若您已重新整理頁面，請保存訂單編號並透過 LINE 聯絡我們確認訂單。
              </p>
            )}
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {lookupToken && (
              <Button asChild className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                <Link href={lookupHref}>
                  <Search className="h-4 w-4" />
                  查看訂單
                </Link>
              </Button>
            )}
            <Button asChild className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              <Link href="/shop">
                <ShoppingBag className="h-4 w-4" />
                繼續逛逛
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
              <Link href="/">
                <Home className="h-4 w-4" />
                回到首頁
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
              <a href="https://line.me/ti/p/@mumbao" target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                聯絡 LINE
              </a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
