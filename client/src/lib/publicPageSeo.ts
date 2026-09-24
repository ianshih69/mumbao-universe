import { getRoomBySlug } from "@/data/rooms";

const origin = "https://www.mumbao.tw";

export const mumbaoSeo = {
  title: "認識慢寶｜MUMBAO",
  description:
    "認識慢寶 MUMBAO，來自宇宙的療癒之光，用慢的哲學陪伴旅人放慢腳步，回到自己。",
  canonical: `${origin}/mumbao`,
};

export const roomsSeo = {
  title: "房型介紹｜十二星座主題房・宜蘭員山｜慢慢蒔光 STime Villa",
  description:
    "慢慢蒔光 STime Villa 位於宜蘭員山，五間公開主題房以慢寶宇宙與十二星座為靈感，透過雙星守護、房號與藝術空間，延伸包棟住宿的療癒體驗。",
  canonical: `${origin}/rooms`,
};

const roomDescriptions: Record<string, string> = {
  "room-521-yunxin":
    "雲心 S521 是慢慢蒔光 STime Villa 的雙子 × 水瓶主題房，融合慢寶宇宙與十二星座創作，在宜蘭員山感受屬於雙子與水瓶的自由靈感。",
  "room-360-senguang":
    "畫雲 S360 是慢慢蒔光 STime Villa 的天蠍 × 雙魚主題房，融合慢寶宇宙與十二星座創作，在宜蘭員山展開帶有夢境與想像的住宿體驗。",
  "room-530-nuanjin":
    "雲間 S530 是慢慢蒔光 STime Villa 的處女 × 射手主題房，融合慢寶宇宙與十二星座創作，在宜蘭員山感受細膩與自由交會的住宿空間。",
  "room-666-anhe":
    "牧雲 S666 是慢慢蒔光 STime Villa 的牡羊 × 獅子主題房，融合慢寶宇宙與十二星座創作，在宜蘭員山感受熱情、自信與勇氣交織的住宿氛圍。",
  "room-888-xinghuo":
    "雲容 S888 是慢慢蒔光 STime Villa 的天秤 × 金牛主題房，融合慢寶宇宙與十二星座創作，在宜蘭員山感受美感、平衡與慢生活交織的住宿空間。",
};

export function getRoomSeo(slug: string) {
  const room = getRoomBySlug(slug);
  if (!room) return undefined;
  return {
    title: `${room.name}｜ROOM ${room.roomNumber}｜慢慢蒔光 STime Villa`,
    description: roomDescriptions[slug] || room.subtitle || room.tagline,
    canonical: `${origin}/rooms/${slug}`,
  };
}

// Deliberately scoped: News and all other routes keep their existing SPA behavior.
export const prerenderPaths = [
  "/mumbao",
  "/rooms",
  "/rooms/room-360-senguang",
  "/rooms/room-530-nuanjin",
  "/rooms/room-666-anhe",
  "/rooms/room-888-xinghuo",
] as const;

export function getPublicPageSeo(pathname: string) {
  if (pathname === "/mumbao") return mumbaoSeo;
  if (pathname === "/rooms") return roomsSeo;
  if (pathname.startsWith("/rooms/")) return getRoomSeo(pathname.slice(7));
  return undefined;
}
