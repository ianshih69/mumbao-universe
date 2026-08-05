import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { aboutOriginContent } from "@/data/aboutContent";
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
                  src="/images/aboutMe/aboutMe-1.jpg"
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
                    {aboutOriginContent.eyebrow}
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-5xl">
                    {aboutOriginContent.title}
                  </h2>
                </div>

                <div className="mx-auto max-w-3xl space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-center md:text-lg md:leading-[2.18]">
                  {aboutOriginContent.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
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
                    src="/images/aboutMe/aboutMe-2.jpg"
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
                    THE SPACE
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-4xl">
                    一座可以住進去的療癒世界
                  </h2>
                </div>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    慢慢蒔光將慢寶宇宙、十二星座、藝術與療癒，轉化成可以被真實感受的空間。
                  </p>
                  <p>
                    從房型、畫作、光線到每一件文創作品，都不是單純的裝飾，而是慢寶傳遞陪伴與能量的方式。
                  </p>
                  <p>
                    旅人住進的，不只是一個房間，而是一段被溫柔接住、慢慢充電的時間。
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
                    THE PHILOSOPHY
                  </span>
                  <h2 className="text-3xl font-light tracking-wide text-gray-800 md:text-4xl">
                    慢，是讓靈魂重新充電
                  </h2>
                </div>

                <blockquote className="border-l-2 border-primary/30 py-2 pl-6">
                  <p className="text-2xl font-light italic leading-relaxed tracking-wider text-primary/80 md:text-3xl">
                    「什麼都不做，也值得被愛。」
                  </p>
                </blockquote>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    世界總是催促人前進，但慢寶想提醒我們：休息並不是落後，停下來也不是浪費。
                  </p>
                  <p>
                    真正的療癒，不是逃離生活，而是在疲憊時願意照顧自己；在喧鬧中，仍然記得自己的聲音。
                  </p>
                  <p>
                    慢慢蒔光希望成為一座白雲充電基地，讓每一位來到這裡的旅人，都能卸下疲憊，再帶著柔軟而充足的能量回到生活。
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
                    src="/images/aboutMe/aboutMe-3.jpg"
                    alt="慢慢蒔光宜蘭員山包棟民宿裡慢下來的空間氛圍"
                    className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    loading="lazy"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="bg-[#FAFAFA] px-6 pb-20 pt-2 text-center md:px-12 md:pb-28">
          <a
            href="/#about"
            className="inline-flex items-center justify-center border border-[#8b6f5b]/25 px-8 py-4 text-xs uppercase tracking-widest text-[#5f4d40] transition-all duration-500 hover:bg-[#8b6f5b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b6f5b]/30"
          >
            返回關於慢慢蒔光
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}
