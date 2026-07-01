import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const breakfastImage = "/images/mumbao/breakfast.jpg";
const breakfastSeoTitle = "宜蘭在地名店早餐代訂｜慢慢蒔光 STime Villa";
const breakfastSeoDescription =
  "慢慢蒔光 STime Villa 提供宜蘭在地名店早餐代訂服務，每份 NT$250，讓旅人在入住的早晨以更自在的節奏慢慢開始一天。";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function Breakfast() {
  useEffect(() => {
    document.title = breakfastSeoTitle;
    setMetaContent('meta[name="description"]', breakfastSeoDescription);
    setMetaContent('meta[property="og:title"]', breakfastSeoTitle);
    setMetaContent('meta[property="og:description"]', breakfastSeoDescription);
    setMetaContent('meta[property="twitter:title"]', breakfastSeoTitle);
    setMetaContent(
      'meta[property="twitter:description"]',
      breakfastSeoDescription
    );
  }, []);

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3D332B] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="px-5 pb-20 pt-28 md:px-8 md:pb-28 md:pt-36">
        <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.48fr_0.52fr] lg:items-center lg:gap-16">
          <div className="overflow-hidden rounded-[12px] bg-[#efe7dc]">
            <img
              src={breakfastImage}
              alt="早餐代訂服務"
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>

          <article className="space-y-8">
            <header className="space-y-5">
              <span className="block text-xs font-medium uppercase tracking-[0.34em] text-[#a57652]">
                BREAKFAST SERVICE
              </span>
              <h1 className="text-4xl font-light leading-tight tracking-wide text-[#3D332B] md:text-[42px]">
                早餐代訂服務
              </h1>
              <p className="text-lg leading-9 text-[#75685d] md:text-xl">
                宜蘭在地名店早餐，讓早晨不用匆忙開始。
              </p>
            </header>

            <div className="space-y-6 text-base leading-[2.05] text-[#75685d] md:text-[17px] md:leading-[2.15]">
              <p>
                在慢慢蒔光的早晨，不一定要急著出門，也不一定要趕著安排第一個行程。你可以多睡一會兒，看看窗外的光，讓身體慢慢醒來。
              </p>
              <p>
                慢慢蒔光可協助旅人代訂宜蘭在地名店早餐，讓入住的早晨更輕鬆。無論是家庭、朋友同行，或帶著毛孩一起旅行，都可以用比較自在的節奏開始一天。
              </p>

              <section className="space-y-2">
                <h2 className="text-sm font-medium tracking-[0.18em] text-[#3D332B]">
                  早餐費用：
                </h2>
                <p>每份 NT$250</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium tracking-[0.18em] text-[#3D332B]">
                  服務說明：
                </h2>
                <p>
                  早餐為代訂服務，非房價內含項目。餐點內容會依合作店家當日供應為準，實際品項、包裝與供應狀況可能略有不同。
                </p>
                <p>
                  如有素食、特殊飲食需求或過敏疑慮，請提前告知。我們會盡量協助確認，但仍以店家實際可提供內容為準。
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-medium tracking-[0.18em] text-[#3D332B]">
                  預訂方式：
                </h2>
                <p>
                  如需代訂早餐，請於入住前或入住當日依管家通知時間告知份數。早餐送達或取餐方式，會依當日入住安排與現場說明為準。
                </p>
              </section>

              <p>
                在慢慢蒔光，早餐不是匆忙行程的開始，而是一段慢慢醒來的時間。
              </p>
            </div>

            <a
              href="/#experience"
              className="inline-flex items-center gap-2 pt-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54]"
            >
              <ArrowLeft className="h-4 w-4" />
              回到慢食慢遊
            </a>
          </article>
        </section>
      </main>

      <Footer />
    </div>
  );
}
