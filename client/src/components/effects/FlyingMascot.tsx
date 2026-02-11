"use client";

import { useEffect, useRef } from "react";

export default function FlyingMascot() {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const mascotRef = useRef<HTMLDivElement>(null);

    const TRAVEL_MS = 5200;
    const EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
    const PADDING_X = 24;
    const PADDING_TOP = 80;
    const PADDING_BOTTOM = 120;

    useEffect(() => {
        if (typeof window === "undefined") return;

        const wrapper = wrapperRef.current;
        const el = mascotRef.current;
        if (!wrapper || !el) return;

        // 🔒 判斷是否手機（coarse = 手指）
        const isMobile = window.matchMedia("(pointer: coarse)").matches;

        const viewportWidth =
            window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight =
            window.innerHeight || document.documentElement.clientHeight || 0;

        const pickTarget = () => {
            const width = Math.max(1, viewportWidth - PADDING_X * 2);
            const height = Math.max(
                1,
                viewportHeight - (PADDING_TOP + PADDING_BOTTOM)
            );

            const x = PADDING_X + Math.random() * width;
            const y = PADDING_TOP + Math.random() * height;

            return { x, y };
        };

        wrapper.style.opacity = "1";
        wrapper.style.transition = "opacity 0.25s ease-out";

        el.style.willChange = "transform";
        el.style.backfaceVisibility = "hidden";
        el.style.transform = "translate3d(10px, 10px, 0)";
        el.style.transitionProperty = "transform";

        let cancel = false;
        let timer: number | null = null;
        let isPaused = false;
        let scrollTimeout: number | null = null;

        const moveOnce = () => {
            if (cancel || isPaused) return;

            const { x, y } = pickTarget();
            el.style.transitionDuration = `${TRAVEL_MS}ms`;
            el.style.transitionTimingFunction = EASE;
            el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
                y
            )}px, 0)`;

            timer = window.setTimeout(moveOnce, TRAVEL_MS);
        };

        // 📌 只有手機才要隱藏 / 暫停
        const handleScroll = () => {
            if (!isMobile) return; // 🟢 桌機不會進來，不會消失
            if (cancel) return;

            if (!isPaused) {
                isPaused = true;
                wrapper.style.opacity = "0";
            }

            if (timer) {
                window.clearTimeout(timer);
                timer = null;
            }

            if (scrollTimeout) {
                window.clearTimeout(scrollTimeout);
            }

            scrollTimeout = window.setTimeout(() => {
                if (cancel) return;
                isPaused = false;
                wrapper.style.opacity = "1";
                moveOnce();
            }, 200);
        };

        // 📌 綁定 scroll → 只有手機有效
        window.addEventListener("scroll", handleScroll, { passive: true });

        moveOnce();

        return () => {
            cancel = true;
            if (timer) window.clearTimeout(timer);
            if (scrollTimeout) window.clearTimeout(scrollTimeout);
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);

    return (
        <div
            ref={wrapperRef}
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ opacity: 1 }}
        >
            <div ref={mascotRef} className="absolute top-0 left-0">
                <div className="relative w-32 sm:w-40 md:w-48">
                    <img
                        src="/images/cloud.webp"
                        alt="cloud"
                        className="block w-[65%] h-auto mx-auto animate-pulse-slow relative z-0"
                        loading="lazy"
                        decoding="async"
                    />
                    <img
                        src="/images/dog.webp"
                        alt="dog"
                        className="absolute left-1/2 w-[50%] h-auto z-10"
                        style={{
                            transform: "translateX(-55%)",
                            bottom: "calc(50% + 0px)",
                        }}
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            </div>
        </div>
    );
}
