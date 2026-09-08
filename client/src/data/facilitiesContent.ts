export type FacilityFeature = {
  title: string;
  paragraphs: readonly string[];
};

export type FacilityChapter = {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  features: readonly FacilityFeature[];
};

// Owner-approved copy. Emoji stay in the source; chapter numbers lead the visual layer.
export const facilitiesContent = {
  label: "館內設施",
  brand: "慢慢蒔光｜館內藝術體驗與專屬禮遇",
  title: "住進一座可以過夜的當代藝術館",
  intro: [
    "慢慢蒔光不只是一間民宿，更是一座以台灣原創 IP「慢寶宇宙」為核心打造的沉浸式藝術空間。",
    "從館內策展、家具陳設到專屬備品，每一處細節都延伸自慢寶宇宙的療癒世界。在這裡，藝術不只是掛在牆上的作品，而是可以走進、觸摸、使用，甚至住上一晚的獨特體驗。",
  ],
  chapters: [
    {
      id: "art",
      number: "01",
      eyebrow: "ART & MUMBAO UNIVERSE",
      title: "🎨 慢寶宇宙沉浸式藝術策展",
      features: [
        {
          title: "台灣原創 IP 主題空間",
          paragraphs: ["全館以「慢寶宇宙」為策展核心，將原創藝術、空間設計與住宿體驗融為一體，打造一座真正可以住進去的藝術館。"],
        },
        {
          title: "持續策展｜慢寶宇宙原創藝術",
          paragraphs: [
            "館內常設多件慢寶宇宙獨家掛畫及原創藝術作品，並將隨著慢寶宇宙的創作發展，持續推出新作、更新展覽內容。",
            "讓每一次造訪，都能遇見不同的作品與驚喜，也讓慢慢蒔光成為一座持續生長的療癒藝術館。",
          ],
        },
        {
          title: "專屬美學餐廚空間",
          paragraphs: ["獨立規劃的質感餐廚場域，搭配精選餐具與完整設備，讓相聚、用餐與分享，也成為旅程中的生活美學體驗。"],
        },
        {
          title: "沉浸式慢寶主題麻將空間",
          paragraphs: ["獨立打造的藝術休閒空間，配置電動麻將桌，讓旅人沉浸在慢寶宇宙裡，享受自在歡聚的娛樂時光。"],
        },
        {
          title: "頂級影音 KTV 娛樂系統",
          paragraphs: ["高規格影音設備、震撼音響與熱門曲庫，打造專屬於旅人的沉浸式歡唱體驗。"],
        },
      ],
    },
    {
      id: "family",
      number: "02",
      eyebrow: "LITTLE DREAMERS",
      title: "👶 慢寶的稚心守護｜親子友善設施",
      features: [
        { title: "安心舒眠", paragraphs: ["備有摺疊式嬰兒床 2 組，陪伴小旅人安心入睡，讓親子住宿更加輕鬆。"] },
        { title: "純淨照護", paragraphs: ["提供奶瓶消毒鍋與摺疊式嬰兒澡盆，減輕親子旅行的準備負擔，讓照護時光更加從容。"] },
        { title: "童心探索", paragraphs: ["精選兒童繪本與玩具，讓孩子在故事、遊戲與想像中，自由探索慢寶宇宙的療癒世界。"] },
      ],
    },
    {
      id: "pets",
      number: "03",
      eyebrow: "PAWS & CARE",
      title: "🐾 慢寶的毛孩專屬禮遇",
      features: [
        { title: "Cirius Pet 近紅外線寵物熱敷墊", paragraphs: ["以科技帶來溫柔舒適的放鬆呵護，為毛孩準備更細緻、更有溫度的住宿體驗。"] },
        { title: "慢寶宇宙專屬寵物餐碗組", paragraphs: ["特別準備慢寶宇宙專屬餐器，讓毛孩也能擁有屬於自己的慢寶時光。"] },
        { title: "寵物安全活動圍籬", paragraphs: ["提供免費租借，為毛孩保留自在、安心的活動空間。"] },
        { title: "夏日毛孩水樂園｜5–10 月限定", paragraphs: ["設置毛孩專屬戲水池，並提供慢寶宇宙原創星座藝術浮板與專屬泳圈，邀請毛孩一起加入夏日藝術派對。"] },
      ],
    },
    {
      id: "summer",
      number: "04",
      eyebrow: "SUMMER ART ON WATER",
      title: "🌊 慢寶夏日水上藝術雙池｜5–10 月限定",
      features: [
        {
          title: "人寵分池・每組住客換水",
          paragraphs: [
            "戶外設置2座折疊式戲水池，分為旅客戲水池與毛孩專屬戲水池，讓大人、小朋友與毛孩都能擁有各自自在、安心的戲水空間。",
            "每組住客入住前皆重新換水，在陽光與自然景致之間，享受乾淨舒適的夏日時光。",
          ],
        },
        { title: "慢寶宇宙專屬水上藝術備品", paragraphs: ["提供慢寶宇宙原創星座藝術浮板與慢寶專屬泳圈，將藝術體驗從館內延伸至水面，打造只有在慢慢蒔光才能體驗與拍攝的夏日場景。"] },
      ],
    },
    {
      id: "night",
      number: "05",
      eyebrow: "NIGHT & TABLE",
      title: "🌙 星空、庭院與味蕾饗宴",
      features: [
        { title: "無垠星空露台", paragraphs: ["專屬的觀星與放鬆平台，在遼闊夜色之下，感受宜蘭緩慢而寧靜的生活節奏。"] },
        { title: "庭院美學烤肉專區", paragraphs: ["提供戶外烤肉場地與設備，讓親友相聚不只是一次聚餐，更是一場發生在庭院裡的美好生活體驗。"] },
        { title: "口袋名單私廚服務｜預約加購", paragraphs: ["精選優質私廚團隊到府料理，在慢寶宇宙的藝術空間裡，享用一場為旅人量身準備的專屬餐桌饗宴。"] },
      ],
    },
  ] satisfies readonly FacilityChapter[],
  closing: "慢慢蒔光，讓住宿不只是停留一晚，\n而是住進藝術裡，成為慢寶宇宙故事的一部分。",
} as const;
