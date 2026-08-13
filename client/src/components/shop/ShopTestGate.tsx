import { type FormEvent, type ReactNode, useState } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  clearShopTestUnlocked,
  isShopTestPasswordValid,
  isShopTestUnlocked,
  markShopTestUnlocked,
} from "@/lib/shop/shopTestGate";

function fieldClassName() {
  return "h-12 rounded-[8px] border border-[#eadfce] bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-[#b7957c] focus:ring-2 focus:ring-[#eadfce]";
}

export function ShopTestModeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="fixed left-1/2 top-24 z-[45] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 rounded-[12px] border border-[#eadfce] bg-white/90 px-4 py-3 text-sm text-stone-600 shadow-sm backdrop-blur md:flex md:items-center md:justify-between">
      <span>測試模式｜慢寶商店目前尚未正式開放</span>
      <button
        type="button"
        className="mt-2 block text-xs font-medium text-stone-500 underline underline-offset-4 transition hover:text-[#765d4a] md:mt-0"
        onClick={onExit}
      >
        退出測試
      </button>
    </div>
  );
}

export function ShopTestGate({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(() => isShopTestUnlocked());
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isShopTestPasswordValid(passwordInput)) {
      setError("測試密碼錯誤");
      return;
    }

    markShopTestUnlocked();
    setPasswordInput("");
    setError("");
    setIsUnlocked(true);
  }

  function handleExit() {
    clearShopTestUnlocked();
    setPasswordInput("");
    setError("");
    setIsUnlocked(false);
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#fbf7f1] text-stone-900">
        <Header />
        <main className="px-4 pb-16 pt-32 md:px-8 md:pt-40">
          <section className="mx-auto max-w-xl rounded-[24px] border border-[#eadfce] bg-white/90 p-6 shadow-sm md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b08d73]">
              MUMBAO SHOP
            </p>
            <h1 className="mt-4 font-serif text-4xl font-light tracking-wide text-stone-900 md:text-5xl">
              商城準備中
            </h1>
            <p className="mt-5 text-base leading-8 text-stone-600">
              慢寶商店目前正在準備中，尚未正式開放。
            </p>
            <form className="mt-6 grid gap-4" onSubmit={handleUnlock}>
              <label className="grid gap-1.5 text-sm font-medium text-stone-700">
                請輸入測試密碼
                <input
                  className={fieldClassName()}
                  type="password"
                  value={passwordInput}
                  onChange={(event) => {
                    setPasswordInput(event.target.value);
                    setError("");
                  }}
                />
              </label>
              {error && (
                <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {error}
                </div>
              )}
              <Button className="h-12 bg-[#8b6f5b] hover:bg-[#765d4a]">
                進入測試
              </Button>
            </form>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <ShopTestModeBanner onExit={handleExit} />
      <div className="[&>div>main]:pt-44 [&>div>main]:md:pt-48">
        {children}
      </div>
    </>
  );
}
