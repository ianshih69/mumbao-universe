import { Link } from "wouter";

export default function Chat() {
  return (
    <main className="min-h-screen bg-[#f7efe6] px-5 py-8 text-[#5c5147]">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img
            src="/images/stand.png"
            alt="慢寶"
            className="h-24 w-auto object-contain drop-shadow-[0_12px_24px_rgba(111,88,71,0.16)]"
            draggable={false}
          />
          <div className="rounded-full border border-white/80 bg-white/70 px-5 py-2 text-sm font-semibold tracking-wide text-[#66584f] shadow-[0_10px_28px_rgba(111,88,71,0.12)] backdrop-blur-xl">
            問慢寶客服載入中
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-wide text-[#5c5147] sm:text-3xl">
          問慢寶 AI客服
        </h1>
        <p className="mt-3 max-w-md text-sm leading-7 text-[#7b6d63] sm:text-base">
          白雲基地小幫手正在右下角開啟。你可以詢問住宿、包棟、寵物、停車、入住時間，或慢寶的故事。
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full bg-white/80 px-5 py-2 text-sm font-medium text-[#76695f] shadow-sm transition hover:bg-white"
        >
          回到首頁
        </Link>
      </div>
    </main>
  );
}
