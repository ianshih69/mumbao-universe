import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { MumbaoChat } from "@/components/ai/MumbaoChat";
import { cn } from "@/lib/utils";

const mobilePositionStorageKey = "mumbaoChatMobileY";
const mobileMediaQuery = "(max-width: 639px)";
const dragThreshold = 8;
const minMobileBottom = 16;
const minMobileTop = 140;
const fallbackLauncherHeight = 112;

type DragSession = {
  pointerId: number;
  startY: number;
  startBottom: number;
  launcherHeight: number;
  hasDragged: boolean;
};

type MobileScrollLockSnapshot = {
  scrollY: number;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
};

export function MumbaoChatLauncher() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(() => shouldAutoOpenChat(location));
  const [isFooterMode, setIsFooterMode] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia(mobileMediaQuery).matches
      : false
  );
  const [isDragging, setIsDragging] = useState(false);
  const [mobileBottomOffset, setMobileBottomOffset] = useState<number | null>(null);
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const latestBottomOffsetRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const mobileScrollLockRef = useRef<MobileScrollLockSnapshot | null>(null);

  const hasCustomMobilePosition =
    isMobile && !isOpen && mobileBottomOffset !== null;
  const launcherStyle = hasCustomMobilePosition
    ? {
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.round(
          mobileBottomOffset
        )}px)`,
      }
    : undefined;

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

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return;
    }

    const media = window.matchMedia(mobileMediaQuery);
    const syncMobileState = () => {
      const nextIsMobile = media.matches;
      setIsMobile(nextIsMobile);

      if (!nextIsMobile) {
        setMobileBottomOffset(null);
        latestBottomOffsetRef.current = null;
        return;
      }

      const storedOffset = readStoredMobileBottom();
      if (storedOffset === null) {
        return;
      }

      const clampedOffset = clampMobileBottomOffset(
        storedOffset,
        getLauncherHeight(launcherButtonRef.current)
      );
      latestBottomOffsetRef.current = clampedOffset;
      setMobileBottomOffset(clampedOffset);
      storeMobileBottom(clampedOffset);
    };

    syncMobileState();
    media.addEventListener("change", syncMobileState);

    return () => {
      media.removeEventListener("change", syncMobileState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isMobile) {
      return;
    }

    const clampStoredPosition = () => {
      setMobileBottomOffset((currentOffset) => {
        if (currentOffset === null) {
          return currentOffset;
        }

        const clampedOffset = clampMobileBottomOffset(
          currentOffset,
          getLauncherHeight(launcherButtonRef.current)
        );
        latestBottomOffsetRef.current = clampedOffset;
        storeMobileBottom(clampedOffset);
        return clampedOffset;
      });
    };

    window.addEventListener("resize", clampStoredPosition);
    window.visualViewport?.addEventListener("resize", clampStoredPosition);

    return () => {
      window.removeEventListener("resize", clampStoredPosition);
      window.visualViewport?.removeEventListener("resize", clampStoredPosition);
    };
  }, [isMobile]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !isMobile ||
      !isOpen
    ) {
      return;
    }

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY || html.scrollTop || body.scrollTop || 0;

    mobileScrollLockRef.current = {
      scrollY,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";

    return () => {
      const lock = mobileScrollLockRef.current;
      if (!lock) {
        return;
      }

      body.style.position = lock.bodyPosition;
      body.style.top = lock.bodyTop;
      body.style.left = lock.bodyLeft;
      body.style.right = lock.bodyRight;
      body.style.width = lock.bodyWidth;
      body.style.overflow = lock.bodyOverflow;
      body.style.overscrollBehavior = lock.bodyOverscrollBehavior;
      html.style.overflow = lock.htmlOverflow;
      html.style.overscrollBehavior = lock.htmlOverscrollBehavior;
      mobileScrollLockRef.current = null;
      window.scrollTo({ top: lock.scrollY, left: 0, behavior: "auto" });
    };
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      const deltaY = event.clientY - session.startY;
      if (!session.hasDragged && Math.abs(deltaY) < dragThreshold) {
        return;
      }

      if (!session.hasDragged) {
        session.hasDragged = true;
        suppressNextClickRef.current = true;
        setIsDragging(true);
      }

      event.preventDefault();

      const nextOffset = clampMobileBottomOffset(
        session.startBottom - deltaY,
        session.launcherHeight
      );
      latestBottomOffsetRef.current = nextOffset;
      setMobileBottomOffset(nextOffset);
    };

    const finishDrag = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      if (session.hasDragged) {
        event.preventDefault();
        const finalOffset = latestBottomOffsetRef.current ?? session.startBottom;
        storeMobileBottom(finalOffset);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      dragSessionRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { passive: false });
    window.addEventListener("pointercancel", finishDrag, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  const handleLauncherPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!isMobile || isOpen) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const launcherHeight = getLauncherHeight(event.currentTarget);
    const currentBottom =
      mobileBottomOffset ??
      Math.max(minMobileBottom, getViewportHeight() - rect.bottom);
    const clampedBottom = clampMobileBottomOffset(currentBottom, launcherHeight);

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startBottom: clampedBottom,
      launcherHeight,
      hasDragged: false,
    };
    latestBottomOffsetRef.current = clampedBottom;
    suppressNextClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleLauncherClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressNextClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setIsOpen(true);
  };

  if (location === "/ai-chat") {
    return null;
  }

  const mobileChatPortal =
    isMobile && typeof document !== "undefined"
      ? createPortal(
      <div
        className={cn(
          "fixed inset-0 z-[90] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#fffaf2] md:hidden",
          !isOpen && "pointer-events-none hidden"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="?撖?AI摰Ｘ?"
      >
        <div className="flex flex-none items-center justify-end border-b border-white/70 bg-[#fff8ec]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)_+_0.75rem)] shadow-[0_8px_24px_rgba(111,88,71,0.08)]">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 text-sm font-medium text-[#6f5d50] shadow-[0_10px_26px_rgba(94,74,58,0.12)] outline-none backdrop-blur-xl transition-colors duration-200 hover:bg-[#fff2df] focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30"
            aria-expanded={isOpen}
            aria-label="關閉問慢寶"
          >
            <X className="size-4" aria-hidden="true" />
            關閉問慢寶
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <MumbaoChat
            compact
            isOpen={isOpen}
            renderContext="mobile-portal"
            className="h-full max-h-none rounded-none border-0 shadow-none"
          />
        </div>
      </div>,
      document.body
        )
      : null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[80] flex flex-col items-end gap-3 transition-[bottom] duration-300 sm:left-auto sm:right-6",
        isDragging && "transition-none duration-0",
        isFooterMode
          ? "footer-mode bottom-[calc(env(safe-area-inset-bottom,0px)_+_5rem)] sm:bottom-24"
          : "bottom-[calc(env(safe-area-inset-bottom,0px)_+_0.875rem)] sm:bottom-6"
      )}
      style={launcherStyle}
    >
      {mobileChatPortal}

      {!isMobile && (
        <div
          className={cn(
            "pointer-events-auto h-[min(620px,calc(100dvh_-_7.5rem_-_env(safe-area-inset-bottom,0px)))] w-full max-w-[390px] md:h-auto md:w-auto md:max-w-none",
            !isOpen && "hidden"
          )}
          aria-hidden={!isOpen}
        >
          <MumbaoChat compact isOpen={isOpen} renderContext="desktop-launcher" />
        </div>
      )}

      {!isMobile && isOpen ? (
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
      ) : !isOpen ? (
        <button
          ref={launcherButtonRef}
          type="button"
          onPointerDown={handleLauncherPointerDown}
          onClick={handleLauncherClick}
          className={cn(
            "group pointer-events-auto relative flex w-[104px] flex-col items-center justify-end border-0 bg-transparent text-[#5c5147] outline-none",
            "animate-[mumbao-float_5.8s_ease-in-out_infinite] transition-transform duration-500 ease-out hover:-translate-y-1 hover:scale-[1.04] focus-visible:ring-4 focus-visible:ring-[#9ec7b8]/30",
            "sm:w-[118px]",
            isMobile && "cursor-grab active:cursor-grabbing"
          )}
          style={{ touchAction: isMobile ? "none" : undefined }}
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
      ) : null}
    </div>
  );
}

function getViewportHeight() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.visualViewport?.height || window.innerHeight;
}

function getLauncherHeight(element: HTMLElement | null) {
  return element?.getBoundingClientRect().height || fallbackLauncherHeight;
}

function clampMobileBottomOffset(offset: number, launcherHeight: number) {
  if (typeof window === "undefined") {
    return offset;
  }

  const viewportHeight = getViewportHeight();
  const maxBottom = Math.max(
    minMobileBottom,
    viewportHeight - minMobileTop - launcherHeight
  );

  return Math.min(Math.max(offset, minMobileBottom), maxBottom);
}

function readStoredMobileBottom() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(mobilePositionStorageKey);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number.parseFloat(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function storeMobileBottom(offset: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(mobilePositionStorageKey, String(Math.round(offset)));
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
