import { Link } from "wouter";
import { MumbaoChat } from "@/components/ai/MumbaoChat";

export default function AiChat() {
  return (
    <main className="h-screen-safe overflow-hidden bg-[#f7efe6] px-4 pb-[calc(env(safe-area-inset-bottom,0px)_+_1.25rem)] pt-5 text-[#5c5147] sm:px-6 sm:py-8">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4">
        <Link
          href="/"
          className="w-fit rounded-full bg-white/80 px-4 py-2 text-sm text-[#76695f] shadow-sm transition hover:bg-white"
        >
          回到白雲基地
        </Link>
        <div className="min-h-0 flex-1">
          <MumbaoChat className="min-h-0" />
        </div>
      </div>
    </main>
  );
}
