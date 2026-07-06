import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { MumbaoChat } from "@/components/ai/MumbaoChat";
import { cn } from "@/lib/utils";

export function MumbaoChatLauncher() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(() => shouldAutoOpenChat(location));
  const [isFooterMode, setIsFooterMode] = useState(false);

  useEffect(() => {
    if (shouldAutoOpenChat(location)) {
      setIsOpen(true);
    }
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const footer = document.querySelector("footer");
    if (!footer) {
      setIsFooterMode(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFooterMode(entry.isIntersecting);
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(footer);

    return () => observer.disconnect();
  }, [location]);

  if (location === "/ai-chat") {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[80] flex flex-col items-end gap-3 transition-[bottom] duration-300 sm:left-auto sm:right-6",
        isFooterMode
          ? "footer-mode bottom-[calc(env(safe-area-inset-bottom,0px)_+_5rem)] sm:bottom-24"
          : "bottom-[calc(env(safe-area-inset-bottom,0px)_+_0.875rem)] sm:bottom-6"
      )}
    >
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
            "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-white/80 bg-[#fff8ec]/95 px-4 text-sm font-medium text-[#6f5d50] shadow-[0_10px_26px_rgba(94,74,58,0.14)] outline-none backdrop-blur-xl",
            "animate-[mumbao-card-in_200ms_ease-out_both] transition-colors duration-200 hover:bg-[#fff2df] focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30"
          )}
          aria-expanded={isOpen}
          aria-label="關閉問慢寶"
        >
          <X className="size-4" aria-hidden="true" />
          關閉問慢寶
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

  const params = new URLSearchParams(window.location.search);

  return (
    window.location.pathname === "/chat" ||
    location === "/chat" ||
    params.get("openChat") === "1" ||
    params.get("liff") === "1" ||
    params.get("fromLine") === "1"
  );
}
