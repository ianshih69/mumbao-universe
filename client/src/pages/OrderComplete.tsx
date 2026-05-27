import { Link, useRoute } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

export default function OrderComplete() {
  const [, params] = useRoute("/order-complete/:orderNumber");
  const orderNumber = params?.orderNumber || "";

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-3xl items-center px-5 py-32 md:px-8">
        <section className="w-full rounded-[8px] border border-stone-200 bg-white p-8 text-center shadow-sm md:p-12">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#e9f2ee] text-[#527467]">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">
            Order Complete
          </p>
          <h1 className="mt-3 font-serif text-4xl font-light">訂單已送出</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            訂單編號
            <span className="mx-2 font-semibold text-stone-900">{decodeURIComponent(orderNumber)}</span>
            已建立。第一版採人工確認付款，慢慢蒔光會再與你確認付款方式、金額與出貨安排。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-full bg-[#527467] text-white hover:bg-[#456257]">
              <Link href="/shop">繼續逛文創商品</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full bg-white">
              <Link href="/">回到官網首頁</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
