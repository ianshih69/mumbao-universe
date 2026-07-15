export type RoomDetailContent = {
  id: number;
  roomNumber: string;
  name: string;
  slug: string;
  stars: string;
  zodiacIcons?: Array<{
    src: string;
    alt: string;
  }>;
  image: string;
  alt: string;
  tagline: string;
  subtitle: string;
  intro: string[];
  sectionTitle: string;
  sectionContent: string[];
  suitableTitle: string;
  suitableContent: string[];
  closing: string;
};

export const rooms: RoomDetailContent[] = [
  {
    id: 1,
    roomNumber: "S520",
    name: "伴雲 S520",
    slug: "room-520-yunshui",
    stars: "巨蟹 × 摩羯",
    zodiacIcons: [
      {
        src: "/images/zodiac/Cancer.png",
        alt: "巨蟹",
      },
      {
        src: "/images/zodiac/Capricorn.png",
        alt: "摩羯",
      },
    ],
    image: "/images/mumbao/room-1.jpg",
    alt: "伴雲 S520 房型圖片",
    tagline: "在這朵雲裡，你可以安心慢下來。",
    subtitle: "巨蟹 × 摩羯",
    intro: [
      "在慢寶宇宙裡，\n伴雲艙是最溫暖的地方。",
      "巨蟹的溫柔守護\n遇見摩羯的沉穩力量。",
      "一個像家的懷抱，\n一個像山一樣的依靠。",
      "慢寶常說：",
      "「在這朵雲裡，你可以安心慢下來。」",
      "今晚的慢寶守護者，\n陪你在雲上好好休息。",
    ],
    sectionTitle: "",
    sectionContent: [],
    suitableTitle: "",
    suitableContent: [],
    closing: "",
  },
  {
    id: 5,
    roomNumber: "S360",
    name: "畫雲 S360",
    slug: "room-360-senguang",
    stars: "天蠍 × 雙魚",
    zodiacIcons: [
      {
        src: "/images/zodiac/Scorpio.png",
        alt: "天蠍",
      },
      {
        src: "/images/zodiac/Pisces.png",
        alt: "雙魚",
      },
    ],
    image: "/images/mumbao/room-5.jpg",
    alt: "畫雲 S360 房型圖片",
    tagline: "有些夢，不用急著醒。",
    subtitle: "天蠍 × 雙魚",
    intro: [
      "畫雲艙是慢寶最有靈感的地方。",
      "天蠍的深邃\n遇見雙魚的夢境。",
      "這裡的雲朵像畫布，\n每個來到的人\n都會在心裡畫出自己的宇宙。",
      "慢寶悄悄說：",
      "「有些夢，不用急著醒。」",
      "今晚，就在雲裡慢慢做夢。",
    ],
    sectionTitle: "",
    sectionContent: [],
    suitableTitle: "",
    suitableContent: [],
    closing: "",
  },
  {
    id: 2,
    roomNumber: "S530",
    name: "雲間 S530",
    slug: "room-530-nuanjin",
    stars: "處女 × 射手",
    zodiacIcons: [
      {
        src: "/images/zodiac/Virgo.png",
        alt: "處女",
      },
      {
        src: "/images/zodiac/Sagittarius.png",
        alt: "射手",
      },
    ],
    image: "/images/mumbao/room-2.jpg",
    alt: "雲間 S530 房型圖片",
    tagline: "也許你的下一段故事，就在雲與雲之間。",
    subtitle: "處女 × 射手",
    intro: [
      "雲間艙是一朵自由的雲。",
      "處女的細緻\n遇見射手的遠方。",
      "一邊是秩序與安定，\n一邊是探索與冒險。",
      "慢寶喜歡坐在這裡看天空，\n因為每一片雲\n都在慢慢旅行。",
      "也許你的下一段故事，\n就在雲與雲之間。",
    ],
    sectionTitle: "",
    sectionContent: [],
    suitableTitle: "",
    suitableContent: [],
    closing: "",
  },
  {
    id: 4,
    roomNumber: "S666",
    name: "牧雲 S666",
    slug: "room-666-anhe",
    stars: "牡羊 × 獅子",
    zodiacIcons: [
      {
        src: "/images/zodiac/Aries.png",
        alt: "牡羊",
      },
      {
        src: "/images/zodiac/Leo.png",
        alt: "獅子",
      },
    ],
    image: "/images/mumbao/room-4.jpg",
    alt: "牧雲 S666 房型圖片",
    tagline: "如果你想發光，那就勇敢地站在雲上。",
    subtitle: "牡羊 × 獅子",
    intro: [
      "牧雲艙是慢寶宇宙最有活力的地方。",
      "牡羊的勇氣\n遇見獅子的光芒。",
      "這裡的雲朵像草原，\n自由又熱情。",
      "慢寶常說：",
      "「如果你想發光，\n那就勇敢地站在雲上。」",
      "今晚，讓星星為你喝采。",
    ],
    sectionTitle: "",
    sectionContent: [],
    suitableTitle: "",
    suitableContent: [],
    closing: "",
  },
  {
    id: 3,
    roomNumber: "S888",
    name: "雲容 S888",
    slug: "room-888-xinghuo",
    stars: "天秤 × 金牛",
    zodiacIcons: [
      {
        src: "/images/zodiac/Libra.png",
        alt: "天秤",
      },
      {
        src: "/images/zodiac/Taurus.png",
        alt: "金牛",
      },
    ],
    image: "/images/mumbao/room-3.jpg",
    alt: "雲容 S888 房型圖片",
    tagline: "美好的事物，都值得慢慢感受。",
    subtitle: "天秤 × 金牛",
    intro: [
      "雲容艙是一朵最優雅的雲。",
      "天秤的平衡\n遇見金牛的溫柔。",
      "這裡的一切都慢慢的：",
      "慢慢喝茶\n慢慢聊天\n慢慢看窗外的田野",
      "慢寶說：",
      "「美好的事物，\n都值得慢慢感受。」",
      "在這朵雲裡，\n時間會變得很柔軟。",
    ],
    sectionTitle: "",
    sectionContent: [],
    suitableTitle: "",
    suitableContent: [],
    closing: "",
  },
];

export function getRoomBySlug(slug: string) {
  return rooms.find((room) => room.slug === slug);
}
