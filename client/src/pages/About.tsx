import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

const aboutSeoTitle =
  "關於慢慢蒔光｜宜蘭員山包棟民宿・寵物友善住宿・慢寶 MUMBAO 原創 IP";
const aboutSeoDescription =
  "慢慢蒔光 STime Villa 是位於宜蘭員山的包棟民宿，以療癒空間、寵物友善與慢寶 MUMBAO 原創 IP 為核心，提供家庭、朋友與毛孩同行的宜蘭住宿體驗。";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function About() {
  const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" },
    },
  };

  useEffect(() => {
    document.title = aboutSeoTitle;
    setMetaContent('meta[name="description"]', aboutSeoDescription);
    setMetaContent('meta[property="og:title"]', aboutSeoTitle);
    setMetaContent('meta[property="og:description"]', aboutSeoDescription);
    setMetaContent('meta[property="twitter:title"]', aboutSeoTitle);
    setMetaContent('meta[property="twitter:description"]', aboutSeoDescription);
  }, []);

  return (
    <div className="min-h-screen-safe bg-background font-serif text-gray-700 selection:bg-[#E8A0BF] selection:text-white">
      <Header />

      <main className="pt-20">
        <section className="bg-[#FAFAFA] py-20 md:py-28">
          <div className="container mx-auto px-6 md:px-12">
            <div className="mx-auto flex max-w-4xl flex-col items-center space-y-12 text-center">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="relative w-full overflow-hidden rounded-lg shadow-2xl"
              >
                <img
                  src="/images/mumbao/living.JPG"
                  alt="慢慢蒔光 STime Villa 宜蘭員山包棟民宿的白色建築與山景倒影"
                  className="h-[400px] w-full object-cover transition-transform duration-[1.5s] hover:scale-105 md:h-[600px]"
                  loading="eager"
                />
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="space-y-8"
              >
                <div className="space-y-4">
                  <span className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    The Origin
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-5xl">
                    降落在員山的白雲基地
                  </h2>
                </div>

                <div className="mx-auto max-w-3xl space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-center md:text-lg md:leading-[2.18]">
                  <p>
                    宜蘭員山，是水與雲霧相遇的地方。慢慢蒔光 STime Villa 座落在山與田之間，是一座以包棟住宿、療癒空間、寵物友善與慢寶 MUMBAO 原創 IP 為核心的宜蘭員山包棟民宿。
                  </p>
                  <p>
                    慢寶 MUMBAO 是來自宇宙第七次元（7D）的高維靈魂，象徵柔軟、溫暖與願望守護。在這裡，慢寶不是裝飾，而是慢慢蒔光的精神核心：提醒每一位旅人，什麼都不做，也值得被愛。
                  </p>
                  <p>
                    慢慢蒔光想留給旅人的，不只是住宿，而是一段可以慢下來的時間。讓家庭、朋友與毛孩在山景、田野與安靜空間裡，重新回到自己的節奏。
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="bg-white py-20 md:py-28">
          <div className="container mx-auto px-6 md:px-12">
            <div className="grid grid-cols-1 items-center gap-14 md:grid-cols-2 md:gap-24">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="group relative order-1"
              >
                <div className="aspect-[3/4] overflow-hidden rounded-lg shadow-xl">
                  <img
                    src="/images/aboutMe_2.webp"
                    alt="慢慢蒔光室內柔和光線與留白空間"
                    className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    loading="lazy"
                  />
                </div>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="order-2 space-y-8"
              >
                <div className="space-y-4">
                  <span className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    The Space
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-4xl">
                    被雲與光包住的空間
                  </h2>
                </div>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    走進慢慢蒔光，你會看見柔和的弧線、留白的牆面與溫暖的光。空間不急著表現自己，而是安靜地接住旅人，讓身體與心慢慢放鬆下來。
                  </p>
                  <p>
                    這裡規劃了適合家庭、朋友與毛孩同行的公共空間與房型動線。無論是在房裡休息、在客廳聊天，或只是望著窗外的山與田發呆，都能感受到一段不被催促的停留。
                  </p>
                  <p>
                    我們希望慢慢蒔光不只是宜蘭住宿，而是一座可以安心呼吸的白雲基地。讓每一位來到這裡的人，都能把生活的速度放慢一點。
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="bg-[#FAFAFA] py-20 md:py-28">
          <div className="container mx-auto px-6 md:px-12">
            <div className="grid grid-cols-1 items-center gap-14 md:grid-cols-2 md:gap-24">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="order-2 space-y-8 md:order-1"
              >
                <div className="space-y-4">
                  <span className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    The Philosophy
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-4xl">
                    慢，是回到自己的節奏
                  </h2>
                </div>

                <blockquote className="border-l-2 border-primary/30 py-2 pl-6">
                  <p className="text-2xl font-light italic leading-relaxed tracking-wider text-primary/80 md:text-3xl">
                    「什麼都不做，也值得被愛。」
                  </p>
                </blockquote>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    現代世界常常催促我們要更快、要更好、要成為某種樣子。但慢寶想提醒你：存在本身就有價值，愛不是交換條件。
                  </p>
                  <p>
                    來到慢慢蒔光，我們不急著替你安排滿滿行程，而是留下一段空白。你可以望著稻田發呆、聽見自己的呼吸，也可以只是安靜地陪伴家人、朋友與毛孩。
                  </p>
                  <p>
                    慢慢蒔光想送給旅人的，是慢寶最重要的一句話：什麼都不做，也值得被愛。慢下來，找回自己的頻率，成為自己就很好了。
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeInUp}
                className="group relative order-1 md:order-2"
              >
                <div className="aspect-[3/4] overflow-hidden rounded-lg shadow-xl">
                  <img
                    src="/images/aboutMe_3.webp"
                    alt="慢慢蒔光宜蘭員山包棟民宿裡慢下來的空間氛圍"
                    className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    loading="lazy"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
