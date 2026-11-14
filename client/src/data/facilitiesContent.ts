import type { FacilitiesGroupId } from "./facilitiesGallery";

export type FacilityFeature = { id: string; title: string; paragraphs: readonly string[]; album?: FacilitiesGroupId };
export type FacilityChapter = { id: string; title: string; intro: readonly string[]; features: readonly FacilityFeature[] };

// Owner-approved copy: 2026-11-14, Appendix A. No editorial rewriting.
export const facilitiesContent = {
  "intro": [
    "誰說包棟度假，只能在「頂級品味」與「極致娛樂」之間二選一？🥂✨",
    "「我在當代，畫當代。」 🖌️🌌",
    "走進「慢慢蒔光」，不只是住進一間 Villa，而是直接住進了獨創藝術品的靈魂裡，享受獨一無二的沉浸式體驗。"
  ],
  "chapters": [
    {
      "id": "brand",
      "title": "【品牌引言】",
      "intro": [
        "誰說包棟度假，只能在「頂級品味」與「極致娛樂」之間二選一？🥂✨",
        "「我在當代，畫當代。」 🖌️🌌",
        "走進「慢慢蒔光」，不只是住進一間 Villa，而是直接住進了獨創藝術品的靈魂裡，享受獨一無二的沉浸式體驗。"
      ],
      "features": [
        {
          "id": "brand-original",
          "title": "台灣原創 IP 主題空間",
          "paragraphs": [
            "全館以「慢寶宇宙」為策展核心，所見的系列角色、來自宇宙的慢靈魂療癒家族、星宿故事以及全棟專屬軟裝設計，皆為館方獨立原創。我們將原創藝術、空間設計與住宿體驗融為一體，打造一座真正可以住進去的當代藝術館。",
            "在這裡，奶色白牆與稻田交織出頂級的自然採光，每一個角落，都是攝影棚等級的當代美學。但最浪漫的是，當夜幕低垂，你可以一邊享受極致的視覺饗宴，一邊徹底解放台灣人熱愛聚會的「包棟靈魂」！"
          ],
          "album": "brand-original"
        }
      ]
    },
    {
      "id": "core",
      "title": "【核心空間與全齡體驗】",
      "intro": [
        "這次度假，讓最可愛的 #慢寶宇宙 全程溫柔陪伴："
      ],
      "features": [
        {
          "id": "zodiac-space",
          "title": "✨ 沉浸式十二星座空間 ｜",
          "paragraphs": [
            "全館採用仿生雲朵式懸浮吊頂與內嵌雲層燈光。全棟以奶白畫布為底，將線條留給天花板的雲朵弧度，讓宜蘭員山最純淨的自然光，像水彩一樣在牆面自由暈染。搭配專屬原創藝術策展與獨家畫作，在星宿故事的療癒祝福中沉沉入睡。（館內規劃 5 間獨立客房，貼心配置 7 套專屬衛浴，房內均配有 55-65 吋大螢幕電視與獨家原創軟裝）。"
          ],
          "album": "zodiac-space"
        },
        {
          "id": "afternoon-tea",
          "title": "☕ 慢靈魂迎賓下午茶 ｜",
          "paragraphs": [
            "午後陽光灑落奶白大廳與稻田窗景，在專屬慢寶宇宙餐具與在地美味的陪伴下，與親友共享靜謐優雅的下午茶時光，讓味蕾也跟著慢下來。"
          ],
          "album": "afternoon-tea"
        },
        {
          "id": "living-ktv",
          "title": "🎤 極致歡唱 KTV ｜",
          "paragraphs": [
            "在奶白色大客廳的 85 吋大螢幕電視與頂級音響圍繞下，和最重要的人一起唱出你們的故事。"
          ],
          "album": "living-ktv"
        },
        {
          "id": "mahjong",
          "title": "🀄 沉浸式麻將房 ｜",
          "paragraphs": [
            "圍繞在特製獨家慢寶宇宙軟裝與變裝慢寶的可愛氛圍中，搭配過山車電動麻將桌，讓摸牌也變得無比優雅。"
          ],
          "album": "mahjong"
        },
        {
          "id": "barbecue",
          "title": "🥩 星空微醺烤肉 ｜",
          "paragraphs": [
            "在員山鄉清涼的夜風中生起炭火，大口吃肉、小酌微醺，享受最純粹的相聚時光。"
          ]
        },
        {
          "id": "dining",
          "title": "🍳 美拉德中古奶油餐廚 ｜",
          "paragraphs": [
            "專屬獨立自然光空間，備有慢寶宇宙質感餐具。包棟獨享專屬料理舞台，無論輕食、深夜火鍋，甚至是提早預約星級到府私廚料理，都能優雅落座。"
          ],
          "album": "dining"
        },
        {
          "id": "family",
          "title": "👶 親子與長輩的溫柔降落 ｜",
          "paragraphs": [
            "一樓設有免爬樓梯的暖心孝親房。館內更備妥頂級保姆級備品：摺疊式嬰兒床、奶瓶消毒鍋、嬰兒澡盆、兒童繪本與玩具推車。不論是帶上阿公阿嬤，還是家裡的小寶貝，都能輕鬆享受頂級度假。"
          ],
          "album": "family"
        },
        {
          "id": "mini-bar",
          "title": "🛸 登陸限定！星際旅客火箭筒 Mini 吧 ｜",
          "paragraphs": [
            "降落慢慢蒔光的第一站，先到火箭筒報到！慢慢蒔光特製的能量補給站，裡面不只有嘴饞必備的小零食，還貼心準備了宜蘭在地超濃醇香豆奶！一口喝下，直接開啟極致療癒的一天 🥛✨"
          ],
          "album": "mini-bar"
        },
        {
          "id": "collectors-gift",
          "title": "🎁 宇宙的雙向奔赴｜專屬藏家禮 ｜",
          "paragraphs": [
            "退房時，別忘了走進館內的 #慢寶宇宙 專櫃，帶走來自宇宙的祝福。這份獨家限定的文創禮，讓這份獨一無二的療癒，在退房後繼續溫暖你的日常生活。"
          ],
          "album": "collectors-gift"
        }
      ]
    },
    {
      "id": "summer",
      "title": "【季節限定體驗】",
      "intro": [],
      "features": [
        {
          "id": "summer-pools",
          "title": "💦 慢寶夏日水上藝術雙池 ｜ 5–10 月限定",
          "paragraphs": [
            "• 人寵分池・每組住客換水：戶外設置 2 座折疊式戲水池，分為旅客戲水池與毛孩專屬戲水池，讓大人、小朋友與毛孩都能擁有各自自在、安心的戲水空間。每組住客入住前皆重新換水，在陽光與自然景致之間，享受乾淨舒適的夏日時光。",
            "• 慢寶宇宙專屬水上藝術備品：提供慢寶宇宙原創星座藝術浮板與慢寶專屬泳圈，將藝術體驗從館內延伸至水面，打造只有在慢慢蒔光才能體驗與拍攝的夏日場景。"
          ],
          "album": "summer-pools"
        }
      ]
    },
    {
      "id": "pets",
      "title": "【毛孩友善禮遇】",
      "intro": [],
      "features": [
        {
          "id": "pets",
          "title": "🐾 頂級寵物友善 ｜",
          "album": "pets",
          "paragraphs": [
            "誰說住進當代藝術館，只能把最愛的毛孩留在家？館內特別備妥 Cirius Pet 近紅外線寵物熱敷墊、專屬餐碗與活動圍籬，讓毛孩也能化身雜誌名模，跟著你一起優雅度假。（🐶 貼心提醒：毛孩不上床與沙發，入住需酌收清潔費與押金唷！）"
          ]
        }
      ]
    },
    {
      "id": "night",
      "title": "【星空、庭院與味蕾饗宴】",
      "intro": [],
      "features": [
        {
          "id": "terrace",
          "title": "01 ｜ AFTER DARK ‧ 無垠星空露台",
          "paragraphs": [
            "專屬的觀星與放鬆平台，在遼闊夜色之下，感受宜蘭緩慢而寧靜的生活節奏。"
          ]
        },
        {
          "id": "garden",
          "title": "02 ｜ GARDEN ‧ 庭院美學烤肉專區",
          "paragraphs": [
            "提供戶外烤肉場地與設備，讓親友相聚不只是一次聚餐，更是一場發生在庭院裡的美好生活體驗。"
          ]
        },
        {
          "id": "private-table",
          "title": "03 ｜ PRIVATE TABLE ‧ 口袋名單私廚服務（預約加購）",
          "paragraphs": [
            "精選優質私廚團隊到府料理，在慢寶宇宙的藝術空間裡，享用一場為旅人量身準備的專屬餐桌饗宴。"
          ]
        }
      ]
    }
  ],
  "closing": "慢慢蒔光，讓住宿不只是停留一晚，而是住進藝術裡，成為慢寶宇宙故事的一部分。"
} satisfies { intro: readonly string[]; chapters: readonly FacilityChapter[]; closing: string };
