import { Link } from "wouter";
import { MumbaoChat } from "@/components/ai/MumbaoChat";

export default function AiChat() {
  return (
    <main className="min-h-screen-safe bg-[#f7efe6] px-4 py-5 text-[#5c5147] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-3xl flex-col gap-4 sm:min-h-[calc(100svh-4rem)]">
        <Link
          href="/"
          className="w-fit rounded-full bg-white/80 px-4 py-2 text-sm text-[#76695f] shadow-sm transition hover:bg-white"
        >
          回到白雲基地
        </Link>
        <div className="min-h-0 flex-1">
          <MumbaoChat className="min-h-[640px] sm:min-h-0" />
        </div>
      </div>
    </main>
  );
}
