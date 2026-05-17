import { useEffect } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getMumbaoImage, readAdminContent } from "@/lib/adminStore";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const symbols = [
  {
    title: "心電心",
    text: "慢寶頭上的紅色愛心，像宇宙訊號接收器。它能感應人們心中的願望，也能接收宇宙傳來的溫柔能量。",
  },
  {
    title: "星頻腮紅",
    text: "慢寶臉上的星星腮紅，是來自宇宙的幸福訊號。當星星閃爍時，代表祝福正在靠近。",
  },
  {
    title: "抱抱雲",
    text: "圍繞在慢寶脖子上的白色抱抱雲，象徵愛、包容與安全感。它像一個柔軟的擁抱，提醒你可以慢慢來。",
  },
  {
    title: "暖心袋 / 暖星袋",
    text: "慢寶胸前的愛心，是用來收納願望的地方。她會把旅人的願望放進暖心袋裡，慢慢保溫，陪它們發光。",
  },
  {
    title: "蒔光雲",
    text: "蒔光雲是慢寶降落地球的起點，也是願望能量的根源。它由願望之光凝聚而成，象徵希望、幸福與慢慢發生的美好。",
  },
  {
    title: "蒔光能量頭套",
    text: "當慢寶進入冥想狀態時，會戴上蒔光能量頭套，安靜接收宇宙智慧，讓心重新回到平靜。",
  },
];

const practices = ["自我接納。", "溫柔包容。", "心靈覺醒。", "宇宙連結。"];

const closingLines = [
  "你不需要證明什麼。",
  "你不需要改變，才值得被愛。",
  "你，就是宇宙最獨一無二的那道光。",
  "人很柔軟，也值得被抱緊。",
  "我接住你的願望，會一起實現它。",
  "即使你慢慢來，我一直都在。",
];

function setMetaDescription(content: string) {
  const selector = 'meta[name="description"]';
  const existingMeta = document.querySelector<HTMLMetaElement>(selector);

  if (existingMeta) {
    existingMeta.content = content;
    return;
  }

  const meta = document.createElement("meta");
  meta.name = "description";
  meta.content = content;
  document.head.appendChild(meta);
}

function ImagePanel({
  src,
  alt,
  className = "",
  fallbackSrc,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-stone-200/80 bg-[#F8F3EE] shadow-lg shadow-stone-200/60 ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        onError={(event) => {
          event.currentTarget.src = fallbackSrc;
        }}
      />
    </div>
  );
}

export default function Mumbao() {
  const adminContent = readAdminContent();
  const mumbaoImages = [1, 2, 3, 4, 5].map((index) =>
    getMumbaoImage(index, adminContent)
  );

  useEffect(() => {
    document.title = "認識慢寶｜慢慢蒔光 STime Villa";
    setMetaDescription(
      "認識慢慢蒔光的原創角色慢寶 MUMBAO，來自白雲基地的療癒小無尾熊，象徵陪伴、願望守護與慢下來的生活感。"
    );
  }, []);

  return (
    <div className="min-h-[100svh] bg-[#FBFAF7] text-stone-800 font-serif selection:bg-[#E8A0BF] selection:text-white">
      <Header />

      <main>
        <section className="relative overflow-hidden bg-[#342C28] pt-28 text-white md:pt-36">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(232,160,191,0.2),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_48%)]" />
          <div className="relative z-10 container mx-auto grid items-center gap-10 px-5 pb-16 md:min-h-[760px] md:grid-cols-[0.9fr_1.1fr] md:gap-12 md:px-12 md:pb-24">
            <motion.div
              className="max-w-2xl space-y-7 md:space-y-8"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: "easeOut" }}
            >
              <div className="space-y-3 md:space-y-4">
                <p className="text-xs uppercase tracking-[0.32em] text-white/70 md:text-sm md:tracking-[0.35em]">
                  Meet MUMBAO
                </p>
                <h1 className="text-4xl font-light leading-tight tracking-wide md:text-6xl">
                  認識慢寶
                </h1>
                <p className="text-xl font-light leading-relaxed tracking-[0.08em] text-white/90 md:text-3xl md:tracking-[0.12em]">
                  什麼都不做，也值得被愛。
                </p>
              </div>
              <div className="h-px w-24 bg-white/40" />
              <div className="space-y-4 text-[15px] leading-8 text-white/82 md:space-y-5 md:text-lg md:leading-loose">
                <p>慢寶 MUMBAO，是一隻來自宇宙的小無尾熊寶寶。</p>
                <p>
                  她擁有天生的療癒能力與宇宙心電感應，是柔軟、溫暖與願望守護的象徵。
                </p>
                <p>
                  在這個什麼都很快、什麼都要成功的世界裡，慢寶想提醒每一個疲憊的心：
                </p>
              </div>
              <div className="space-y-3 rounded-lg border border-white/15 bg-white/10 p-5 text-base leading-8 text-white/92 backdrop-blur-sm md:border-l md:border-white/35 md:bg-transparent md:p-0 md:pl-6 md:text-xl md:leading-relaxed">
                <p>你不需要一直證明自己。</p>
                <p>你不需要變得更好，才值得被愛。</p>
                <p>只要你存在，就已經很珍貴。</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: "easeOut", delay: 0.1 }}
            >
              <ImagePanel
                src={mumbaoImages[0].src}
                alt={mumbaoImages[0].alt}
                fallbackSrc="/images/mumbao/1.jpg"
                className="mx-auto aspect-[1/1] w-full max-w-[430px] bg-white/10 p-3 shadow-2xl shadow-black/20 md:aspect-[4/5] md:max-h-[560px] md:max-w-[520px]"
              />
            </motion.div>
          </div>
        </section>

        <section className="bg-white py-18 md:py-32">
          <div className="container mx-auto grid items-center gap-10 px-5 md:grid-cols-2 md:gap-20 md:px-12">
            <motion.div
              className="order-2 md:order-1"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={fadeInUp}
            >
              <ImagePanel
                src={mumbaoImages[1].src}
                alt={mumbaoImages[1].alt}
                fallbackSrc="/images/mumbao/2.jpg"
                className="mx-auto aspect-[1/1] w-full max-w-[430px] md:aspect-[4/5] md:max-w-none"
              />
            </motion.div>

            <motion.div
              className="order-1 space-y-8 md:order-2 md:space-y-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={fadeInUp}
            >
              <article className="space-y-5 rounded-lg bg-[#FBFAF7] p-5 md:bg-transparent md:p-0">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
                  Who Is MUMBAO
                </p>
                <h2 className="text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
                  慢寶是誰？
                </h2>
                <div className="space-y-4 text-[15px] leading-8 text-stone-600 md:space-y-5 md:text-lg md:leading-loose">
                  <p>
                    慢寶不只是可愛角色，她是一個來自宇宙、守護人類情緒與願望的療癒存在。
                  </p>
                  <p>
                    她不追求速度，也不追求表現。她慢慢地陪在你身邊，接住你的疲憊、願望與不安，讓你在生活裡重新感覺到柔軟、安心與被愛。
                  </p>
                </div>
                <blockquote className="rounded-lg border border-[#E8A0BF]/30 bg-white px-5 py-5 text-xl font-light leading-relaxed text-stone-900 shadow-sm md:border-l-2 md:bg-transparent md:py-2 md:pl-6 md:text-2xl md:shadow-none">
                  慢寶的核心信念是：
                  <br />
                  什麼都不做，也值得被愛。
                </blockquote>
              </article>

              <article className="space-y-5">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
                  Origin
                </p>
                <h2 className="text-3xl font-light tracking-wide text-stone-900 md:text-4xl">
                  慢寶的誕生
                </h2>
                <div className="space-y-4 text-[15px] leading-8 text-stone-600 md:space-y-5 md:text-lg md:leading-loose">
                  <p>
                    在第七次元 7D 的愛與願望之界，有兩道溫柔的宇宙能量——星穗 Xing Sui / X.S. 與 星源 Xing Yuan / X.Y.。
                  </p>
                  <p>星穗象徵愛與療癒，星源象徵穩定與守護。</p>
                  <p>
                    他們感應到地球上的人們，正在快速生活中逐漸忘記溫柔與真心。於是，他們以愛與願望之光，召喚出一個奇蹟生命。
                  </p>
                  <p>那個圓圓胖胖、眼睛閃著光的小無尾熊，就是慢寶。</p>
                  <p>
                    慢寶降落地球的第一步，踩在一片由願望之光凝聚而成的白雲上。那片雲，叫做：
                  </p>
                  <p className="text-2xl font-light tracking-wide text-stone-900">蒔光雲。</p>
                </div>
              </article>
            </motion.div>
          </div>
        </section>

        <section className="bg-[#F7F4EF] py-18 md:py-32">
          <div className="container mx-auto px-5 md:px-12">
            <motion.div
              className="mx-auto mb-10 max-w-3xl text-center md:mb-14"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
                Symbols
              </p>
              <h2 className="mt-4 text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
                慢寶的象徵元素
              </h2>
            </motion.div>

            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                variants={fadeInUp}
              >
                <ImagePanel
                  src={mumbaoImages[2].src}
                  alt={mumbaoImages[2].alt}
                  fallbackSrc="/images/mumbao/3.jpg"
                  className="mx-auto aspect-[1/1] w-full max-w-[430px] md:aspect-[4/5] md:max-w-none lg:sticky lg:top-28"
                />
              </motion.div>

              <div className="grid gap-4 md:grid-cols-2 md:gap-5">
                {symbols.map((symbol, index) => (
                  <motion.article
                    key={symbol.title}
                    className="rounded-lg border border-stone-200 bg-white/85 p-5 shadow-sm md:rounded-none md:p-6"
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.04, ease: "easeOut" }}
                    viewport={{ once: true, amount: 0.2 }}
                  >
                    <div className="mb-4 h-px w-10 bg-[#E8A0BF] md:mb-5" />
                    <h3 className="text-xl tracking-wide text-stone-900">{symbol.title}</h3>
                    <p className="mt-3 text-[15px] leading-8 text-stone-600 md:mt-4 md:text-base md:leading-loose">
                      {symbol.text}
                    </p>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-18 md:py-32">
          <div className="container mx-auto px-5 md:px-12">
            <motion.div
              className="mb-10 max-w-3xl md:mb-14"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
                Two States
              </p>
              <h2 className="mt-4 text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
                慢寶的兩種狀態
              </h2>
            </motion.div>

            <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
              <motion.article
                className="space-y-6 rounded-lg bg-[#FBFAF7] p-5 md:bg-transparent md:p-0"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                variants={fadeInUp}
              >
                <ImagePanel
                  src={mumbaoImages[3].src}
                  alt={mumbaoImages[3].alt}
                  fallbackSrc="/images/mumbao/4.jpg"
                  className="aspect-[1/1] w-full md:aspect-[4/5]"
                />
                <div className="space-y-4 md:space-y-5">
                  <h3 className="text-2xl font-light tracking-wide text-stone-900 md:text-3xl">
                    覺醒模式
                  </h3>
                  <div className="space-y-4 text-[15px] leading-8 text-stone-600 md:space-y-5 md:text-lg md:leading-loose">
                    <p>
                      覺醒模式的慢寶睜開眼睛，頭上有心電心，臉上有星頻腮紅，脖子圍著抱抱雲，胸前帶著暖心袋，腳下踩著蒔光雲。
                    </p>
                    <p>這時候的慢寶，正在把溫暖與祝福傳送給世界。</p>
                    <p>
                      淺奶茶色，代表發送溫暖。
                      <br />
                      淺粉米灰色，代表發送智慧。
                    </p>
                  </div>
                </div>
              </motion.article>

              <motion.article
                className="space-y-6 rounded-lg bg-[#FBFAF7] p-5 md:bg-transparent md:p-0"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                variants={fadeInUp}
              >
                <ImagePanel
                  src={mumbaoImages[4].src}
                  alt={mumbaoImages[4].alt}
                  fallbackSrc="/images/mumbao/5.jpg"
                  className="aspect-[1/1] w-full md:aspect-[4/5]"
                />
                <div className="space-y-4 md:space-y-5">
                  <h3 className="text-2xl font-light tracking-wide text-stone-900 md:text-3xl">
                    冥想模式
                  </h3>
                  <div className="space-y-4 text-[15px] leading-8 text-stone-600 md:space-y-5 md:text-lg md:leading-loose">
                    <p>
                      冥想模式的慢寶閉上眼睛，安靜盤坐。蒔光雲漂浮在頭上，她戴著蒔光能量頭套，雙手向上，接收宇宙傳來的柔光。
                    </p>
                    <p>這時候的慢寶，正在提醒你：</p>
                    <blockquote className="rounded-lg border border-[#E8A0BF]/30 bg-white px-5 py-5 text-xl font-light leading-relaxed text-stone-900 md:border-l-2 md:bg-transparent md:py-2 md:pl-6 md:text-2xl">
                      慢下來，不是停下來。
                      <br />
                      是回到自己的節奏裡。
                    </blockquote>
                  </div>
                </div>
              </motion.article>
            </div>
          </div>
        </section>

        <section className="bg-[#F7F4EF] py-18 md:py-32">
          <div className="container mx-auto grid gap-8 px-5 md:gap-12 md:px-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <motion.div
              className="space-y-4 md:space-y-5"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
                Brand Spirit
              </p>
              <h2 className="text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
                慢寶的品牌精神
              </h2>
            </motion.div>

            <motion.div
              className="space-y-6 text-[15px] leading-8 text-stone-600 md:space-y-7 md:text-lg md:leading-loose"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <p>
                慢寶相信，愛不是交換條件。愛是一種能量，是一種不需要證明也能存在的溫柔。
              </p>
              <div>
                <p className="mb-4 text-stone-900">慢寶想陪你練習：</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {practices.map((practice) => (
                    <div
                      key={practice}
                      className="rounded-lg border border-stone-200 bg-white/75 px-5 py-4 text-stone-800 shadow-sm md:rounded-none"
                    >
                      {practice}
                    </div>
                  ))}
                </div>
              </div>
              <p>
                在過勞、焦慮、孤單與迷失的時代，慢寶是一道來自台灣的療癒之光。
              </p>
              <div className="space-y-2 border-t border-stone-200 pt-7">
                <p className="text-lg leading-relaxed tracking-wide text-stone-900 md:text-xl">
                  MUMBAO — The Light of Slowness from Taiwan
                </p>
                <p>來自台灣的療癒之光，用「慢」的哲學擁抱世界。</p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="bg-white py-18 md:py-32">
          <motion.div
            className="container mx-auto max-w-4xl px-5 text-center md:px-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeInUp}
          >
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400 md:tracking-[0.3em]">
              A Note From MUMBAO
            </p>
            <h2 className="mt-4 text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
              慢寶想對你說
            </h2>
            <div className="mt-8 space-y-3 rounded-lg bg-[#FBFAF7] px-5 py-7 text-lg font-light leading-8 text-stone-700 md:mt-10 md:space-y-4 md:bg-transparent md:p-0 md:text-2xl md:leading-relaxed">
              {closingLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
