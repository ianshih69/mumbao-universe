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
const aboutCanonicalUrl = "https://www.mumbao.tw/about";

function setMetaContent(selector: string, content: string) {
  const metas = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>(selector)
  );
  let meta = metas[0];

  if (!meta) {
    meta = document.createElement("meta");
    const nameMatch = selector.match(/^meta\[name="([^"]+)"\]$/);
    const propertyMatch = selector.match(/^meta\[property="([^"]+)"\]$/);

    if (nameMatch) {
      meta.name = nameMatch[1];
    } else if (propertyMatch) {
      meta.setAttribute("property", propertyMatch[1]);
    }

    document.head.appendChild(meta);
  }

  meta.content = content;
  metas.slice(1).forEach((duplicate) => duplicate.remove());
}

function setCanonicalUrl(url: string) {
  const canonicalLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
  );
  let canonical = canonicalLinks[0];

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }

  canonical.href = url;
  canonicalLinks.slice(1).forEach((link) => link.remove());
}

function removeStaleNoindexRobots() {
  document.head
    .querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
    .forEach((meta) => {
      if (meta.content === "noindex,follow") {
        meta.remove();
      }
    });
}

function removeNewsArticleJsonLd() {
  document.getElementById("news-article-json-ld")?.remove();
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
    setMetaContent('meta[property="og:url"]', aboutCanonicalUrl);
    setMetaContent('meta[property="twitter:url"]', aboutCanonicalUrl);
    setCanonicalUrl(aboutCanonicalUrl);
    removeStaleNoindexRobots();
    removeNewsArticleJsonLd();
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
                    被時間遺忘的暖星袋
                  </h2>
                </div>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    走進這座基地，你會發現空間裡充滿了流動的弧線與留白。這是慢寶的堅持：「人很柔軟，不該被尖銳的直角劃傷。」
                  </p>
                  <p>
                    每一扇窗，都是為了引入星源的守護之光；每一個角落，都像是一個巨大的「暖星袋」，用來收納你無處安放的願望與嘆息。
                  </p>
                  <p>
                    在這裡，建築不說話，它只是安靜地擁抱你。就像慢寶總是靜靜地陪伴，不急著要你變好，只希望你「存在」。當你躺在床上，感受窗外員山的風輕輕吹過，請閉上眼。此刻的你，正被宇宙溫柔地接住。
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
                    慢，是一種靈魂的特權
                  </h2>
                </div>

                <blockquote className="border-l-2 border-primary/30 py-2 pl-6">
                  <p className="text-xl font-light italic leading-[1.85] tracking-wider text-primary/80 sm:text-2xl md:text-3xl">
                    “什麼都不做，<span className="inline-block">也值得被愛.</span>”
                  </p>
                </blockquote>

                <div className="space-y-6 text-justify text-base leading-[2.15] text-[#75685d] md:text-lg md:leading-[2.18]">
                  <p>
                    現代世界告訴我們要快、要優秀、要成為某種樣子。但慢寶來自的宇宙，有著另一套法則：「愛是一種能量，不是交換條件。」
                  </p>
                  <p>
                    來到慢慢蒔光，我們不提供行程表，只提供「空白」。我們邀請你練習浪費時間，練習對著稻田發呆，練習聽見自己心跳的頻率。
                  </p>
                  <p>
                    請記住慢寶送給地球最珍貴的禮物：「什麼都不做，也值得被愛。」找回你的頻率，成為自己就很好了。
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
