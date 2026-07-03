import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const slowGuideSeoTitle =
  "慢遊私選｜宜蘭散步風景・在地小吃・午後小食｜慢慢蒔光 STime Villa";
const slowGuideSeoDescription =
  "慢慢蒔光 STime Villa 整理屋主走過也喜歡的宜蘭日常，包含散步風景、在地小吃與午後小食，留給想慢慢走的旅人參考。";

const guideSections = [
  {
    title: "散步風景",
    description:
      "適合慢慢走、看看山、田與宜蘭日常風景的地方。不是趕行程，而是把時間留給呼吸、光線與路上的小發現。",
  },
  {
    title: "在地小吃",
    description:
      "屋主自己喜歡，也適合旅人順路品嚐的小吃。不是排行榜，而是一些住在宜蘭時會想再去一次的日常味道。",
  },
  {
    title: "午後小食",
    description:
      "適合午後放慢腳步的甜點、點心、輕食或小店。下雨也好、放空也好，找個地方坐一下，讓旅程不用一直趕路。",
  },
];

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function SlowGuide() {
  useEffect(() => {
    document.title = slowGuideSeoTitle;
    setMetaContent('meta[name="description"]', slowGuideSeoDescription);
    setMetaContent('meta[property="og:title"]', slowGuideSeoTitle);
    setMetaContent('meta[property="og:description"]', slowGuideSeoDescription);
    setMetaContent('meta[property="twitter:title"]', slowGuideSeoTitle);
    setMetaContent(
      'meta[property="twitter:description"]',
      slowGuideSeoDescription
    );
  }, []);

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3D332B] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="px-5 pb-20 pt-28 md:px-8 md:pb-28 md:pt-36">
        <section className="mx-auto max-w-6xl">
          <header className="mx-auto max-w-3xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.34em] text-[#a57652]">
              SLOW GUIDE
            </span>
            <h1 className="mt-5 text-4xl font-light leading-tight tracking-wide text-[#3D332B] md:text-[46px]">
              慢遊・私選
            </h1>
            <p className="mt-6 text-lg leading-9 text-[#75685d] md:text-xl">
              屋主走過也喜歡的宜蘭日常，留給想慢慢走的旅人。
            </p>
          </header>

          <article className="mx-auto mt-12 max-w-[760px] space-y-6 text-base leading-[2.08] text-[#75685d] md:text-[17px] md:leading-[2.16]">
            <p>
              慢慢蒔光不只是一個停留的地方，也是一段認識宜蘭的入口。
            </p>
            <p>
              我們整理了一些自己去過、喜歡，也覺得適合旅人慢慢走訪的地方。它們不一定是祕境，也不一定是最熱門的打卡點，但有些適合散步，有些適合吃點東西，有些適合午後坐下來，讓時間慢一點。
            </p>
            <p>
              這份清單會依季節、營業狀況與屋主實際走訪經驗慢慢更新。出發前仍建議確認店家營業時間與現場狀況。
            </p>
          </article>

          <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
            {guideSections.map((section) => (
              <section
                key={section.title}
                className="rounded-[10px] border border-[#e8dccf] bg-white/70 p-6 md:p-7"
              >
                <h2 className="text-xl font-light tracking-[0.1em] text-[#3D332B]">
                  {section.title}
                </h2>
                <p className="mt-5 text-[15px] leading-[2] text-[#75685d] md:text-base">
                  {section.description}
                </p>
              </section>
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-[760px] text-sm leading-[2] text-[#8A7667] md:text-[15px]">
            慢遊私選會依實際走訪經驗與季節慢慢更新。店家營業時間、品項與現場狀況可能調整，出發前請以店家官方資訊為準。
          </p>

          <div className="mt-10 text-center">
            <a
              href="/#experience"
              className="inline-flex items-center gap-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back / 回到慢食慢遊
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
