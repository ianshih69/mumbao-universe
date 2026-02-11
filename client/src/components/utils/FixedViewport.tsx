"use client";

import { useEffect } from "react";

/**
 * 固定視窗高度變數，防止手機工具欄出現/消失時造成抖動
 * 只設置 CSS 變數 --vh，不改變滾動容器
 */
export default function FixedViewport() {
    useEffect(() => {
        // 只在移動設備上執行
        if (typeof window === "undefined" || !("ontouchstart" in window)) {
            return;
        }

        // 記錄最大視窗高度（工具欄隱藏時的高度）
        let maxHeight = window.innerHeight;

        // 只設置 CSS 變數，不改變滾動容器
        const setVhVariable = () => {
            const vh = maxHeight * 0.01;
            document.documentElement.style.setProperty("--vh", `${vh}px`);
        };

        // 初始化
        const init = () => {
            maxHeight = window.innerHeight;
            setVhVariable();
        };

        init();

        // 使用 requestAnimationFrame 確保在下一幀時再次設置
        requestAnimationFrame(() => {
            setVhVariable();
        });

        // 監聽視窗大小變化
        let resizeTimer: number | null = null;
        const handleResize = () => {
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }

            resizeTimer = window.setTimeout(() => {
                const currentHeight = window.innerHeight;
                if (currentHeight > maxHeight) {
                    maxHeight = currentHeight;
                    setVhVariable();
                } else if (Math.abs(currentHeight - maxHeight) > 50) {
                    maxHeight = currentHeight;
                    setVhVariable();
                }
            }, 100);
        };

        // 監聽 orientationchange（螢幕旋轉）
        const handleOrientationChange = () => {
            setTimeout(() => {
                maxHeight = window.innerHeight;
                setVhVariable();
            }, 200);
        };

        window.addEventListener("resize", handleResize, { passive: true });
        window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("orientationchange", handleOrientationChange);
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }
            // 只清理 CSS 變數
            document.documentElement.style.removeProperty("--vh");
        };
    }, []);

    return null;
}
