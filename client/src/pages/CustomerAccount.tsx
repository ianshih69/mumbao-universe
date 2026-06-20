import { LogOut, PackageSearch, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

export default function CustomerAccount() {
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, signOut } = useCustomerAuth();

  async function handleSignOut() {
    await signOut();
    setLocation("/shop");
  }

  return (
    <div className="min-h-screen bg-[#fbf8f2] text-stone-900">
      <Header />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-32 md:px-8 md:pt-40">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#9f7868]">
            Member Center
          </p>
          <h1 className="mt-2 font-serif text-4xl font-light tracking-wide">
            會員中心
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            會員資料與歷史訂單功能即將推出；目前可先管理登入狀態。
          </p>
        </div>

        {isLoading && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <p className="text-sm text-stone-500">正在確認會員登入狀態...</p>
          </section>
        )}

        {!isLoading && !isAuthenticated && (
          <section className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-8 text-center shadow-sm shadow-stone-200/60">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="font-serif text-2xl text-stone-900">請先登入會員</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
              訪客仍可直接購物與結帳；登入會員後，未來可查看歷史訂單與快速結帳。
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-full bg-[#8b6f5b] text-white hover:bg-[#765d4a]">
                <Link href="/account/login?returnTo=/account">登入</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]">
                <Link href="/account/register">建立會員帳號</Link>
              </Button>
            </div>
          </section>
        )}

        {!isLoading && isAuthenticated && (
          <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-5 shadow-sm shadow-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3eadf] text-[#8b6f5b]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#9f7868]">Signed in</p>
                  <p className="truncate text-sm font-medium text-stone-800">
                    {user?.email || "會員帳號"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-5 h-10 w-full rounded-full border-[#eadfce] bg-white hover:bg-[#f3eadf]"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                登出
              </Button>
            </aside>

            <div className="space-y-4">
              <div className="rounded-[8px] border border-[#eadfce] bg-[#fffdf8] p-6 shadow-sm shadow-stone-200/60">
                <div className="flex items-start gap-3">
                  <PackageSearch className="mt-1 h-5 w-5 text-[#9f7868]" />
                  <div>
                    <h2 className="font-serif text-2xl text-stone-900">會員功能即將推出</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                      下一階段會加入會員資料、常用收件資料與歷史訂單。現在的訪客結帳、查詢連結與購物車流程都會維持可用。
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[8px] border border-[#eadfce] bg-white/70 p-4">
                  <p className="text-sm font-semibold text-stone-900">會員資料</p>
                  <p className="mt-2 text-sm text-stone-500">即將推出</p>
                </div>
                <div className="rounded-[8px] border border-[#eadfce] bg-white/70 p-4">
                  <p className="text-sm font-semibold text-stone-900">歷史訂單</p>
                  <p className="mt-2 text-sm text-stone-500">即將推出</p>
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
