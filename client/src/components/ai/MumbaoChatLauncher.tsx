import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { MumbaoChat } from "@/components/ai/MumbaoChat";
import { cn } from "@/lib/utils";

export function MumbaoChatLauncher() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(() => shouldAutoOpenChat(location));

  useEffect(() => {
    if (shouldAutoOpenChat(location)) {
      setIsOpen(true);
    }
  }, [location]);

  if (location === "/ai-chat") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)_+_0.875rem)] left-[max(0.75rem,env(safe-area-inset-left,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[80] flex flex-col items-end gap-3 sm:left-auto sm:bottom-6 sm:right-6">
      {isOpen && (
        <div className="pointer-events-auto h-[min(620px,calc(100dvh_-_7.5rem_-_env(safe-area-inset-bottom,0px)))] w-full max-w-[390px] md:h-auto md:w-auto md:max-w-none">
          <MumbaoChat compact onRequestClose={() => setIsOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "group pointer-events-auto relative flex min-h-[96px] w-[92px] flex-col items-center justify-end border-0 bg-transparent pb-0 text-[#5c5147] outline-none",
          "animate-[mumbao-float_5.2s_ease-in-out_infinite] transition-transform duration-500 ease-out hover:-translate-y-1 hover:scale-[1.04] focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30",
          "sm:min-h-[116px] sm:w-[116px]"
        )}
        aria-expanded={isOpen}
        aria-label={isOpen ? "關閉問慢寶 AI客服" : "打開問慢寶 AI客服"}
      >
        {isOpen && (
          <span className="absolute right-1 top-2 z-20 flex size-6 items-center justify-center rounded-full bg-white/90 text-[#8a796a] shadow-[0_8px_18px_rgba(111,88,71,0.14)] sm:right-2 sm:size-7">
            <X className="size-4" aria-hidden="true" />
          </span>
        )}

        <span className="relative z-10 -mb-1 flex flex-col items-center transition-transform duration-500 ease-out group-hover:-translate-y-0.5">
          <img
            src="/images/stand.png"
            alt=""
            className="h-[66px] w-auto object-contain drop-shadow-[0_7px_10px_rgba(111,88,71,0.18)] sm:h-[82px]"
            draggable={false}
          />
        </span>

        <span className="relative z-10 flex h-8 min-w-[82px] items-center justify-center rounded-full border border-white/90 bg-[#fffaf2]/95 px-3 text-sm font-semibold tracking-wide text-[#66584f] shadow-[0_8px_18px_rgba(111,88,71,0.12)] backdrop-blur-md before:absolute before:-left-1 before:bottom-1 before:size-6 before:rounded-full before:bg-[#fffaf2] before:content-[''] after:absolute after:-right-1 after:bottom-1 after:size-6 after:rounded-full after:bg-[#fffaf2] after:content-[''] sm:h-9 sm:min-w-[98px] sm:px-4 sm:text-[15px]">
          <span className="absolute -top-2 left-5 size-6 rounded-full bg-white/95 sm:left-6 sm:size-7" aria-hidden="true" />
          <span className="absolute -top-2.5 left-1/2 size-8 -translate-x-1/2 rounded-full bg-[#fffaf2] sm:size-9" aria-hidden="true" />
          <span className="absolute -top-2 right-5 size-6 rounded-full bg-white/95 sm:right-6 sm:size-7" aria-hidden="true" />
          <span className="relative z-10">問慢寶</span>
        </span>
      </button>
    </div>
  );
}

function shouldAutoOpenChat(location: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    location === "/chat" ||
    new URLSearchParams(window.location.search).get("openChat") === "1"
  );
}
