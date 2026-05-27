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
      <div
        className={cn(
          "pointer-events-auto h-[min(620px,calc(100dvh_-_7.5rem_-_env(safe-area-inset-bottom,0px)))] w-full max-w-[390px] md:h-auto md:w-auto md:max-w-none",
          !isOpen && "hidden"
        )}
        aria-hidden={!isOpen}
      >
        <MumbaoChat compact isOpen={isOpen} />
      </div>

      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={cn(
            "group pointer-events-auto relative flex w-full max-w-[390px] items-end gap-4 overflow-hidden rounded-[34px] border border-white/80 bg-[#fff8ec]/95 px-5 py-4 text-left text-[#6f5d50] shadow-[0_20px_52px_rgba(94,74,58,0.18)] outline-none backdrop-blur-xl",
            "animate-[mumbao-card-in_240ms_ease-out_both] transition-transform duration-500 ease-out hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30",
            "sm:w-[400px] sm:max-w-none sm:gap-5 sm:rounded-[36px] sm:px-6 sm:py-5"
          )}
          aria-expanded={isOpen}
          aria-label="關閉問慢寶 AI客服"
        >
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(255,248,236,0.42)_58%,rgba(242,229,208,0.48))]" />
          <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/90" />
          <span className="absolute right-3 top-3 z-30 flex size-7 items-center justify-center rounded-full bg-white/90 text-[#8a796a] shadow-[0_8px_18px_rgba(111,88,71,0.14)]">
            <X className="size-4" aria-hidden="true" />
          </span>

          <span className="relative z-10 min-w-0 flex-1 self-start pb-1 pr-1 pt-1 sm:pt-1.5">
            <span className="block text-[13px] leading-6 text-[#756357] sm:text-sm sm:leading-7">
              任何問題都可以詢問慢寶客服；若客服無法協助處理，您可輸入
              <strong className="font-semibold text-[#4f4036]">「人工客服」</strong>
              ，將由管家為您回覆，謝謝。
            </span>
          </span>

          <span className="relative z-10 flex w-[88px] flex-none flex-col items-center justify-end sm:w-[98px]">
            <img
              src="/images/stand.png"
              alt=""
              className="h-[90px] w-auto animate-[mumbao-character-float_4.8s_ease-in-out_infinite] object-contain drop-shadow-[0_10px_16px_rgba(94,74,58,0.2)] transition-transform duration-700 ease-out group-hover:-translate-y-1 sm:h-[108px]"
              draggable={false}
            />
            <span className="-mt-1 rounded-full bg-white/75 px-3 py-1 text-sm font-semibold tracking-wide text-[#66584f] shadow-[0_6px_14px_rgba(111,88,71,0.12)] backdrop-blur-sm">
              問慢寶
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            "group pointer-events-auto relative flex w-[104px] flex-col items-center justify-end border-0 bg-transparent text-[#5c5147] outline-none",
            "animate-[mumbao-float_5.8s_ease-in-out_infinite] transition-transform duration-500 ease-out hover:-translate-y-1 hover:scale-[1.04] focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30",
            "sm:w-[118px]"
          )}
          aria-expanded={isOpen}
          aria-label="打開問慢寶 AI客服"
        >
          <img
            src="/images/stand.png"
            alt=""
            className="h-[78px] w-auto object-contain drop-shadow-[0_9px_14px_rgba(94,74,58,0.2)] sm:h-[92px]"
            draggable={false}
          />
          <span className="-mt-1 rounded-full border border-white/80 bg-[#fff8ec]/95 px-4 py-1.5 text-sm font-semibold tracking-wide text-[#66584f] shadow-[0_8px_18px_rgba(111,88,71,0.14)] backdrop-blur-md">
            問慢寶
          </span>
        </button>
      )}
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
