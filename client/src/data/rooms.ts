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
    roomNumber: "S521",
    name: "雲心 S521",
    slug: "room-521-yunxin",
    stars: "雙子 × 水瓶",
    zodiacIcons: [
      {
        src: "/images/zodiac/Gemini.png",
        alt: "雙子",
      },
      {
        src: "/images/zodiac/Aquarius.png",
        alt: "水瓶",
      },
    ],
    image: "/images/Room/S521.jpg",
    alt: "雲心 S521 房型圖片",
    tagline: "也許你的靈感，就藏在今晚的雲裡。",
    subtitle: "雙子 × 水瓶",
    intro: [
      "雲心艙是慢寶宇宙最有想像力的地方。",
      "雙子的靈動\n遇見水瓶的創意。",
      "這朵雲常常飄向未知的地方，\n帶著笑聲與奇妙的想法。",
      "慢寶喜歡在這裡發呆，\n因為每一次抬頭看天空，",
      "都可能看到新的星星。",
      "也許你的靈感，\n就藏在今晚的雲裡。",
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
    image: "/images/Room/S360.jpg",
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
    image: "/images/Room/S530.jpg",
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
    image: "/images/Room/S666.jpg",
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
        src: "/images/zodiac/Taurus-v2.png",
        alt: "金牛",
      },
    ],
    image: "/images/Room/S888.jpg",
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
