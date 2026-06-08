import { Link, useRoute } from "wouter";
import { CheckCircle2, Home, MessageCircle, ShoppingBag } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

export default function OrderComplete() {
  const [, params] = useRoute("/order-complete/:orderNumber");
  const orderNumber = params?.orderNumber || "";

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
          <h1 className="mt-3 font-serif text-4xl font-light">訂單已送出</h1>
          <div className="mx-auto mt-5 max-w-xl rounded-[8px] border border-[#f0e5d7] bg-white/75 px-5 py-4">
            <p className="text-xs text-stone-500">訂單編號</p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-stone-900">
              {decodeURIComponent(orderNumber)}
            </p>
          </div>
          <div className="mx-auto mt-6 max-w-2xl space-y-3 text-sm leading-7 text-stone-600">
            <p>
              你的訂單已成功建立。付款採人工確認，請依管家後續提供的付款資訊完成付款。
            </p>
            <p>
              慢慢蒔光管家會再確認付款、庫存與出貨安排；若有急件、改地址或大量訂購需求，也可以直接聯繫我們。
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Button asChild className="h-11 rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
              <Link href="/shop">
                <ShoppingBag className="h-4 w-4" />
                返回宇宙碎品商店
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
              <Link href="/shop">
                <Home className="h-4 w-4" />
                繼續逛商品
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
              <a href="https://line.me/ti/p/@mumbao" target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                聯繫 LINE / 管家
              </a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
