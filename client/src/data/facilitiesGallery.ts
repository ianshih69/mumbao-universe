import type { RoomGalleryImage } from "@/components/rooms/RoomGallery";

export type FacilitiesPhoto = RoomGalleryImage & { id: number };

export const facilitiesPhotos: readonly FacilitiesPhoto[] = [
  { id: 1, src: "/images/public/pub-1.webp", alt: "木質餐桌、廚房櫥櫃與吊燈全景", width: 2653, height: 3537 },
  { id: 2, src: "/images/public/pub-2.webp", alt: "雲朵沙發、圓形茶几與拱形壁爐的客廳", width: 3258, height: 4344 },
  { id: 3, src: "/images/public/pub-3.webp", alt: "餐桌上的慢寶圖樣杯具與麵包籃", width: 1087, height: 1447 },
  { id: 4, src: "/images/public/pub-4.webp", alt: "窗邊光影下的雲朵沙發、茶几與壁爐", width: 3258, height: 4344 },
  { id: 5, src: "/images/public/pub-5.webp", alt: "慢慢蒔光客廳的沙發、落地窗與館內陳設", width: 3452, height: 2847 },
  { id: 6, src: "/images/public/pub-6.webp", alt: "餐桌、玻璃磚與拱形展示櫃", width: 1086, height: 1448 },
  { id: 7, src: "/images/public/pub-7.webp", alt: "慢寶抱枕單椅與燭台休憩角落", width: 1086, height: 1448 },
  { id: 8, src: "/images/public/pub-8.webp", alt: "窗邊單椅、木質立燈與閱讀邊桌", width: 1086, height: 1448 },
  { id: 9, src: "/images/public/pub-9.webp", alt: "展示櫃中的慢寶掛畫與飾品陳設", width: 1086, height: 1448 },
  { id: 10, src: "/images/public/pub-10.webp", alt: "木地板、落地窗簾與造型座椅的室內空間", width: 1086, height: 1448 },
  { id: 11, src: "/images/public/pub-11.webp", alt: "拱門旁的樓梯、欄杆與館內走廊", width: 1097, height: 1434 },
  { id: 12, src: "/images/public/pub-12.webp", alt: "帶有慢寶圖樣與燈光的雲朵造型主題壁牌", width: 1306, height: 1205 },
  { id: 13, src: "/images/public/pub-13.webp", alt: "串連玄關、玻璃磚與餐桌的館內走廊", width: 1086, height: 1448 },
  { id: 14, src: "/images/public/pub-14.webp", alt: "拱形燈光下的四幅掛畫與木櫃陳設", width: 1078, height: 1459 },
  { id: 15, src: "/images/public/pub-15.webp", alt: "暖光中的慢寶抱枕單椅與黑色燭台", width: 1448, height: 1086 },
  { id: 16, src: "/images/public/pub-16.webp", alt: "慢寶圖樣布面上的兩件韓文包裝物件", width: 1448, height: 1086 },
  { id: 17, src: "/images/public/pub-17.webp", alt: "窗簾旁的四幅慢寶掛畫與木質矮櫃", width: 1086, height: 1448 },
  { id: 18, src: "/images/public/pub-18.webp", alt: "日光下的慢寶圖樣木框掛畫", width: 1086, height: 1448 },
  { id: 19, src: "/images/public/pub-19.webp", alt: "館內白色花瓣造型吊燈", width: 1254, height: 1254 },
  { id: 20, src: "/images/public/pub-20.webp", alt: "玻璃磚旁的拱形展示櫃與藝術陳設", width: 1086, height: 1448 },
  { id: 21, src: "/images/public/pub-21.webp", alt: "餐桌燭台與後方的玻璃磚展示空間", width: 1086, height: 1448 },
  { id: 22, src: "/images/public/pub-22.webp", alt: "木櫃上的粉色花藝與三支燭台", width: 1448, height: 1086 },
  { id: 23, src: "/images/public/pub-23.webp", alt: "慢寶木作、掛畫與花藝陳設", width: 1086, height: 1448 },
  { id: 24, src: "/images/public/pub-24.webp", alt: "拱形壁爐旁的單椅、茶几與杯具", width: 2176, height: 2896 },
];

export const facilitiesAlbums = {
  living: { title: "雲朵客廳與休憩角落", label: "查看客廳照片", ids: [5, 2, 4, 24, 8, 15, 7], featured: [2, 24, 8] },
  art: { title: "原創藝術與館內陳設", label: "查看藝術與陳設", ids: [20, 23, 14, 9, 17, 18, 12, 22, 16], featured: [20, 23, 14] },
  dining: { title: "專屬美學餐廚空間", label: "查看餐廚照片", ids: [1, 6, 3, 21], featured: [1, 6, 3] },
  circulation: { title: "館內光影與動線", label: "查看館內角落", ids: [13, 11, 19, 10], featured: [13] },
} as const;

export type FacilitiesAlbumId = keyof typeof facilitiesAlbums | "all";
export const facilitiesHero = { desktop: 5, mobile: 4 } as const;
export const facilitiesFullAlbumIds = [
  ...facilitiesAlbums.living.ids, ...facilitiesAlbums.art.ids,
  ...facilitiesAlbums.dining.ids, ...facilitiesAlbums.circulation.ids,
] as const;

export function facilitiesPhoto(id: number): FacilitiesPhoto {
  const photo = facilitiesPhotos.find(photo => photo.id === id);
  if (!photo) throw new Error(`Unknown facilities photo: ${id}`);
  return photo;
}

export function facilitiesAlbumSelection(album: FacilitiesAlbumId, photoId?: number) {
  const ids: readonly number[] = album === "all" ? facilitiesFullAlbumIds : facilitiesAlbums[album].ids;
  const index = photoId === undefined ? 0 : ids.indexOf(photoId);
  if (index < 0) throw new Error("Photo does not belong to this facilities album");
  return {
    title: album === "all" ? "公共空間" : facilitiesAlbums[album].title,
    images: ids.map(facilitiesPhoto),
    index,
  };
}
