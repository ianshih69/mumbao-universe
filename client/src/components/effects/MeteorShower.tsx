"use client";

import React, { useEffect, useRef } from "react";

type MeteorShowerProps = {
    intensity?: number; // 生成間隔 (ms)；數字越小越密集
    showBackground?: boolean; // 是否顯示夜空漸層背景
};

type Meteor = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    length: number;
    width: number;
    depthLevel: number; // 0=遠,1=中,2=近
    hue: number; // 預先計算的色調，避免每次繪製時重新計算
};

export default function MeteorShower({ intensity = 200, showBackground = true }: MeteorShowerProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const meteorsRef = useRef<Meteor[]>([]);
    const lastSpawnRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // 1. 偵測設備：行動裝置/平板
        const isMobile = window.innerWidth < 1024 || window.matchMedia("(pointer: coarse)").matches;

        // 2. 差異化畫質
        const dpr = isMobile ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));

        const resize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const spawnMeteor = () => {
            // 出生位置：整個上方(含螢幕上方外圍)
            const startX = window.innerWidth * (-0.2 + Math.random() * 1.4); // -20% ~ 120% 螢幕寬
            const startY = -100 - Math.random() * 100; // 從畫面上緣外一點進來

            // 角度群組：有的陡、有的平，影響它會掉到左邊還是滑到很下面
            const isSteep = Math.random() < 0.5;
            const baseMin = isSteep ? 120 : 140;
            const baseMax = isSteep ? 140 : 165;
            const angleDeg = baseMin + Math.random() * (baseMax - baseMin);
            const angle = (Math.PI / 180) * angleDeg;

            // 速度：2~5 (越大越快)
            const speed = 2 + Math.random() * 3;
            const vx = Math.cos(angle) * speed; // 應該是往左
            const vy = Math.sin(angle) * speed; // 應該是往下

            // 決定這顆流星的"景深等級"
            // 0 = 很遠 (小、暗、壽命短)
            // 1 = 中 (正常)
            // 2 = 近 (大顆、亮、拖很長)
            const depthLevel = Math.random() < 0.15 ? 2   // 15% 機率：超近，很大顆主角
                : Math.random() < 0.50 ? 1 // 35% 機率：中等
                    : 0;                       // 50% 機率：遠方小流星

            let width;
            let length;
            let maxLife;

            if (depthLevel === 0) {
                // 遠的：細、短、壽命短，像背景小塵
                width = 1 + Math.random() * 0.8;             // ~1 - 1.8
                length = 80 + Math.random() * 80;            // 比較短
                maxLife = 60 + Math.random() * 60;           // 比較快淡掉
            } else if (depthLevel === 1) {
                // 中距：一般你現在看到的那種
                width = 1.5 + Math.random() * 1.5;           // ~1.5 - 3
                length = 160 + Math.random() * 160;
                maxLife = 120 + Math.random() * 120;
            } else {
                // 近的：主角級，粗、長、留很久
                width = 2.5 + Math.random() * 2;             // ~2.5 - 4.5
                length = 240 + Math.random() * 260;          // 超長拖尾
                maxLife = 200 + Math.random() * 200;         // 可以飛到超下面才消失
            }

            // 預先計算 hue，避免每次繪製時重新計算
            const hue = 45 + Math.random() * 5;

            meteorsRef.current.push({
                x: startX,
                y: startY,
                vx,
                vy,
                life: 0,
                maxLife,
                length,
                width,
                depthLevel,
                hue, // 預先計算並存儲 hue
            } as any);
        };


        // 緩存背景漸層，避免每次都重新創建
        let backgroundGradient: CanvasGradient | null = null;
        let lastCanvasSize = { width: 0, height: 0 };

        const drawBackground = () => {
            if (!showBackground) return;

            // 只在 canvas 尺寸改變時重新創建漸層
            if (!backgroundGradient ||
                canvas.width !== lastCanvasSize.width ||
                canvas.height !== lastCanvasSize.height) {
                backgroundGradient = ctx.createRadialGradient(
                    canvas.width / (2 * dpr),
                    canvas.height / (3 * dpr),
                    0,
                    canvas.width / (2 * dpr),
                    canvas.height / (2 * dpr),
                    Math.max(canvas.width, canvas.height) / dpr
                );
                backgroundGradient.addColorStop(0, "#1a1a2f");
                backgroundGradient.addColorStop(1, "#050509");
                lastCanvasSize = { width: canvas.width, height: canvas.height };
            }

            ctx.fillStyle = backgroundGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        // ⭐ 畫星星形狀（五角星 + 發光）
        // cx, cy: 星星中心位置（流星頭）
        // size: 星星外半徑，會自動算內半徑
        // color: 星星的顏色 (hsla / rgba 皆可)
        const drawStar = (
            cx: number,
            cy: number,
            size: number,
            color: string
        ) => {
            const spikes = 5;               // 五角星
            const outerRadius = size;
            const innerRadius = size * 0.45; // 內側尖角
            let rot = (Math.PI / 2) * 3;
            let x = cx;
            let y = cy;
            const step = Math.PI / spikes;

            ctx.save(); // 先存狀態，等等好還原

            // 柔光暈（優化：限制最大 shadowBlur 以提升效能）
            ctx.shadowBlur = Math.min(size * 2, 15); // 減少 shadowBlur 並限制最大值
            ctx.shadowColor = color;

            ctx.beginPath();
            ctx.moveTo(cx, cy - outerRadius);
            for (let i = 0; i < spikes; i++) {
                x = cx + Math.cos(rot) * outerRadius;
                y = cy + Math.sin(rot) * outerRadius;
                ctx.lineTo(x, y);
                rot += step;

                x = cx + Math.cos(rot) * innerRadius;
                y = cy + Math.sin(rot) * innerRadius;
                ctx.lineTo(x, y);
                rot += step;
            }
            ctx.closePath();

            ctx.fillStyle = color;
            ctx.fill();

            // 還原狀態，避免影響尾巴
            ctx.restore();
        };

        // 畫一個錐形的尾巴 (沒有接縫)
        // headX, headY: 流星頭位置
        // nx, ny: 單位方向向量 (往流星運動方向的單位向量)
        // length: 尾巴長度
        // baseWidth: 接近頭端的寬度
        // hue / brightnessHead: 用來決定顏色
        const drawTaperedTail = (
            headX: number,
            headY: number,
            nx: number,
            ny: number,
            length: number,
            baseWidth: number,
            hue: number,
            brightnessHead: number
        ) => {
            // 計算尾端點
            const tailX = headX - nx * length;
            const tailY = headY - ny * length;

            // 垂直單位向量
            const px = -ny;
            const py = nx;

            // 尾巴橫向寬度（頭寬到尾細）
            // 比例不要太小，否則遠景流星會看起來像只有星星
            const headHalfW = baseWidth * 0.6;
            const tailHalfW = baseWidth * 0.15; // 原本 0.1 → 稍微加粗一點，避免太快消失

            // 四個角點
            const hx1 = headX + px * headHalfW;
            const hy1 = headY + py * headHalfW;
            const hx2 = headX - px * headHalfW;
            const hy2 = headY - py * headHalfW;

            const tx1 = tailX + px * tailHalfW;
            const ty1 = tailY + py * tailHalfW;
            const tx2 = tailX - px * tailHalfW;
            const ty2 = tailY - py * tailHalfW;

            // 金色漸層：頭端很實→尾端淡
            // 關鍵：第一段 alpha 一定要是 1，不要透明
            const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
            grad.addColorStop(0, `hsla(${hue}, 90%, ${brightnessHead - 5}%, 1)`);
            grad.addColorStop(1, `hsla(${hue}, 95%, ${brightnessHead + 25}%, 0)`);
            ctx.save();

            // Glow（光暈）一定要有，不然遠的那層會看起來「只有星星」
            // 優化：減少 shadowBlur 的計算，使用較小的值以提升效能
            ctx.shadowBlur = Math.min(baseWidth * 3, 20); // 限制最大 shadowBlur 以提升效能
            ctx.shadowColor = `hsla(${hue}, 100%, ${brightnessHead}%, 0.9)`; // 提高 0.9，讓靠星星那一段更明顯

            ctx.beginPath();
            ctx.moveTo(hx1, hy1);
            ctx.lineTo(tx1, ty1);
            ctx.lineTo(tx2, ty2);
            ctx.lineTo(hx2, hy2);
            ctx.closePath();

            ctx.fillStyle = grad;
            ctx.fill();

            ctx.restore();
        };

        const drawMeteor = (m: Meteor) => {
            // 方向單位向量（流星往前飛的方向）
            const speedLen = Math.hypot(m.vx, m.vy);
            const nx = m.vx / speedLen;
            const ny = m.vy / speedLen;

            // 流星頭座標
            const headX = m.x;
            const headY = m.y;

            // 視覺色調、亮度（使用預先計算的 hue）
            const hue = m.hue;
            const brightnessHead =
                m.depthLevel === 2 ? 85 :
                    m.depthLevel === 1 ? 75 :
                        60;

            // 星星顏色（頭的顏色 = 尾巴最亮端的顏色）
            const headColor = `hsla(${hue}, 90%, ${brightnessHead - 10}%, 1)`; // 深金，略暗

            // 星星大小（已經放大一倍版）
            let starSizeBase =
                m.depthLevel === 2 ? m.width * 3.2 :   // 近：最大顆
                    m.depthLevel === 1 ? m.width * 2.4 :   // 中
                        m.width * 1.8;    // 遠：小顆
            const starSize = starSizeBase * 3;       // 放大1.5倍

            // 尾巴基礎寬度（越近越粗，像飛在鏡頭前）
            const baseWidth =
                m.depthLevel === 2 ? m.width * 4.0 :  // 最近：超粗，像大流星
                    m.depthLevel === 1 ? m.width * 3.5 :  // 中距離：明顯
                        m.width * 3.0;   // 最遠：也不能太細

            // ------ 1) 先畫尾巴（錐形羽毛狀，沒有接縫） ------
            drawTaperedTail(
                headX,
                headY,
                nx,
                ny,
                m.length,
                baseWidth,
                hue,
                brightnessHead
            );

            // reset 陰影，避免影響星星繪製
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";

            // ------ 2) 再畫流星頭（星星）在最上層 ------
            drawStar(headX, headY, starSize, headColor);
        };

        // 限制流星最大數量，避免記憶體累積
        const MAX_METEORS = 25; // Slight adjustment for web

        const loop = (t: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBackground();

            const w = window.innerWidth;
            const h = window.innerHeight;

            // 生成頻率由 intensity 控制：每 intensity ms 生成 1~2 顆
            // 如果流星數量已達上限，暫停生成
            if (meteorsRef.current.length < MAX_METEORS && t - lastSpawnRef.current >= Math.max(60, intensity)) {
                spawnMeteor();
                if (Math.random() < 0.35 && meteorsRef.current.length < MAX_METEORS) {
                    spawnMeteor();
                }
                lastSpawnRef.current = t;
            }

            // 更新 & 繪製（只繪製在畫面內或附近的流星）
            meteorsRef.current.forEach((m) => {
                // 只更新和繪製在畫面附近的可見流星
                const isVisible = m.x > -300 && m.x < w + 300 && m.y > -300 && m.y < h + 300;

                if (isVisible) {
                    m.x += m.vx;
                    m.y += m.vy;
                    m.life += 1;
                    drawMeteor(m);
                } else {
                    // 不在可見範圍的流星只更新位置，不繪製
                    m.x += m.vx;
                    m.y += m.vy;
                    m.life += 1;
                }
            });

            // 移除離開畫面或壽命到期（更嚴格的過濾條件）
            meteorsRef.current = meteorsRef.current.filter((m) => {
                const stillAlive = m.life < m.maxLife;
                // 更嚴格地過濾：只保留在畫面附近的可見流星
                const notTooFarLeft = m.x > -200;
                const notTooFarRight = m.x < w + 200;
                const notTooFarUp = m.y > -200;
                const notTooFarDown = m.y < h + 200;
                return stillAlive && notTooFarLeft && notTooFarRight && notTooFarUp && notTooFarDown;
            });

            rafRef.current = requestAnimationFrame(loop);
        };

        resize();
        window.addEventListener("resize", resize);
        rafRef.current = requestAnimationFrame(loop);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            window.removeEventListener("resize", resize);
            meteorsRef.current = [];
        };
    }, [intensity, showBackground]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            style={{
                position: "fixed",
                left: 0,
                top: 0,
                width: "100vw",
                height: "100vh",
                // 讓流星跑在整個網站內容上面，但還是在抹布下面
                zIndex: 0,
                pointerEvents: "none",
                willChange: "contents", // GPU 加速
                transform: "translateZ(0)", // 強制 GPU 加速
            }}
        />
    );
}
