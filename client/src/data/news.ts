export type NewsItem = {
  id: number;
  slug: string;
  category: string;
  date: string;
  title: string;
  excerpt: string;
  detailTitle: string;
  content: string[];
  image: string;
  alt: string;
};

export const newsItems: NewsItem[] = [
  {
    id: 1,
    slug: "mumbao-line-stickers-coming-soon",
    category: "LINE",
    date: "2026.07",
    title: "慢寶 LINE 貼圖即將上架",
    excerpt:
      "慢寶 MUMBAO 將以日常貼圖的形式，陪你把溫柔、慢下來與「什麼都不做，也值得被愛」帶進每一天的對話裡。",
    detailTitle: "讓慢寶，把溫柔帶進日常對話",
    content: [
      "慢寶 MUMBAO 的 LINE 貼圖正在準備上架中。這次會以日常陪伴、溫柔回應與慢下來的心情為核心，讓慢寶在每一次對話裡接住你的情緒。",
      "貼圖內容將延伸慢寶的核心精神：「什麼都不做，也值得被愛。」不論是想說早安、想給朋友一點鼓勵，或只是想用可愛的方式表達今天想慢一點，慢寶都會陪你一起出現。",
      "實際上架時間與下載資訊，將以慢慢蒔光官網與官方社群公告為準。",
    ],
    image: "/images/mumbao/News-1.JPG",
    alt: "慢寶 LINE 貼圖即將上架",
  },
  {
    id: 2,
    slug: "stime-villa-summer-preview-preparation",
    category: "Preview",
    date: "2026.07",
    title: "慢慢蒔光暑假試營運籌備中",
    excerpt:
      "慢慢蒔光 STime Villa 正在為暑假試營運做最後準備，包含空間整理、房型體驗、入住動線與服務細節，期待與旅人慢慢相見。",
    detailTitle: "在正式迎接旅人之前，先把每一個細節慢慢準備好",
    content: [
      "慢慢蒔光 STime Villa 正在為暑假試營運進行最後籌備。從公共空間、房型體驗、入住動線到服務細節，我們希望每一段停留都能保有安靜、自在與被好好接住的感覺。",
      "這裡不是急著完成的地方，而是一座慢慢整理、慢慢靠近旅人的白雲基地。未來將提供適合家庭、朋友與毛孩同行的包棟住宿體驗，讓旅人在山與田之間，留下一段真正能放慢的時間。",
      "試營運相關日期、訂房方式與入住資訊，將以官網最新公告為準。",
    ],
    image: "/images/mumbao/News-2.JPG",
    alt: "慢慢蒔光暑假試營運籌備中",
  },
  {
    id: 3,
    slug: "mumbao-goods-coming-soon",
    category: "Goods",
    date: "2026.07",
    title: "慢寶文創商品準備上架",
    excerpt:
      "以慢寶 MUMBAO 原創 IP 為核心的文創商品正在準備中，未來將陸續推出貼近住宿體驗與日常陪伴的小物。",
    detailTitle: "把慢寶的柔軟、溫暖與陪伴，帶回日常",
    content: [
      "慢寶 MUMBAO 原創 IP 文創商品正在準備中。未來商品將延伸慢寶的療癒精神，讓柔軟、溫暖與陪伴不只停留在住宿空間，也能成為日常生活裡的小小提醒。",
      "我們希望每一件文創商品，都不只是紀念品，而是能承載慢寶想傳遞的那句話：「什麼都不做，也值得被愛。」",
      "商品品項、上架時間與購買方式，將於慢慢蒔光官網與官方社群陸續公開。",
    ],
    image: "/images/mumbao/News-3.JPG",
    alt: "慢寶文創商品準備上架",
  },
  {
    id: 4,
    slug: "stime-villa-website-updates",
    category: "News",
    date: "2026.07",
    title: "慢慢蒔光官網資訊陸續更新",
    excerpt:
      "慢慢蒔光官網正在持續整理中，未來將陸續更新房型、入住資訊、慢寶介紹與相關公告。",
    detailTitle: "關於住宿、房型與慢寶宇宙的內容，會在這裡慢慢整理",
    content: [
      "慢慢蒔光 STime Villa 官方網站正在持續更新中。未來將陸續整理房型介紹、入住資訊、寵物友善說明、交通方式、慢寶 MUMBAO 原創 IP 介紹與相關最新公告。",
      "我們希望官網不只是提供資訊的地方，也是一個能慢慢認識慢慢蒔光與慢寶宇宙的入口。關於試營運、文創商品、LINE 貼圖與住宿體驗的最新消息，都會在這裡逐步公開。",
      "正式資訊仍以慢慢蒔光官網公告為準。",
    ],
    image: "/images/mumbao/News-4.JPG",
    alt: "慢慢蒔光官網資訊陸續更新",
  },
];

export function getNewsBySlug(slug: string) {
  return newsItems.find((item) => item.slug === slug);
}
