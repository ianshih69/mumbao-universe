import { useEffect } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const softReveal: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.8, ease: "easeOut" } },
};

const mumbaoImages = {
  hero: {
    src: "/images/mumbao/m3.jpg",
    alt: "彩色慢寶站在蒔光雲上",
  },
  front: {
    src: "/images/mumbao/m1.jpg",
    alt: "慢寶正面素描設定圖",
  },
  back: {
    src: "/images/mumbao/m2.jpg",
    alt: "慢寶背面的星情光輪素描圖",
  },
};

const heroParagraphs = [
  "慢寶是一隻來自宇宙的高維靈魂，擁有天生的療癒能力與宇宙心電感應。",
  "他柔軟、溫暖，像是一份來自星際的祝福，守護著每一個人的願望與心情。",
  "慢寶不追求成功，也不急著變快。他的存在，是想提醒來到這裡的你：慢慢來，也沒有關係。成為自己，就已經很好了。",
  "在這個總是催促人們要快、要努力、要證明自己的世界裡，慢寶帶來的是另一種溫柔的力量。他陪你放慢腳步，安心休息，也陪你重新聽見自己心裡的聲音。",
];

const secretCards = [
  {
    title: "心電心",
    text: "頭上的粉紅色愛心，叫做心電心，是慢寶與宇宙連線的地方。它能感應宇宙的能量，也能接收到人們心裡悄悄許下的願望。",
  },
  {
    title: "星頻腮紅",
    text: "臉上的星星，是星頻腮紅。當慢寶進入覺醒模式時，星星會像宇宙的祝福一樣閃爍。它提醒你：相信自己，也把願望交給宇宙，幸運就會慢慢靠近。",
  },
  {
    title: "抱抱雲",
    text: "脖子上的白色雲朵，叫做抱抱雲。它蓬鬆柔軟，象徵愛、包容與被擁抱的感覺。就像慢寶想告訴你的：人很柔軟，也值得被抱緊。",
  },
  {
    title: "暖星袋",
    text: "胸前的粉紅色愛心口袋，是暖星袋。它會收納旅人的願望，替那些還沒實現的心願保溫。也許現在還看不見結果，但慢寶會陪你一起守著它。",
  },
  {
    title: "蒔光雲",
    text: "腳下的雲朵，叫做蒔光雲。它是由願望之光聚成的雲，也是慢寶降落地球的起點。蒔光雲象徵幸福、希望，以及慢慢長出來的美好。",
  },
];

const storyParagraphs = [
  "慢寶來自第七次元的愛與願望之界。",
  "在宇宙深處，有兩道溫柔的能量——星穗與星源。",
  "星穗，是愛與療癒的使者。她能傾聽願望與眼淚，讓脆弱慢慢變成光。",
  "星源，是穩定與守護的存在。他用安靜而堅定的力量，為迷失的靈魂創造一個可以安心呼吸的空間。",
  "當他們感應到地球上的人們漸漸遺忘了溫柔與真心，便用愛與願望之光，召喚出一個奇蹟生命。",
  "那個圓圓胖胖、眼睛閃著光的高維靈魂，就是慢寶。",
  "慢寶降落地球的第一步，踩在蒔光雲上。從那一刻起，他便開始守護每一顆疲憊的心，陪伴每一個還在努力生活的人。",
];

const starrySoulParagraphs = [
  "慢寶背後的星星，不只是裝飾。它有一個可愛的小名，叫做「星星屁」；真正的名字，是星情光輪。",
  "當慢寶從第七次元降臨地球時，宇宙在他身上留下這枚光之印記。它是慢寶存在的證明，也是情緒能量的核心。",
  "星情光輪承載著愛與情緒的頻率。即使慢寶安靜不說話，它也會持續溫柔發光，提醒你：你不是偶然來到這個世界，你本來就帶著屬於自己的光。",
  "即使慢慢來，即使什麼都不做，你依然值得被愛與守護。",
];

const quotes = [
  "你不需要證明什麼。",
  "你不需要改變才值得被愛。",
  "慢慢來，我一直都在。",
];

const closingParagraphs = [
  "慢寶誕生於宇宙願望之雲，是為了療癒、守護與傳遞幸福而來。",
  "他不是單純的角色，而是一份關於愛、陪伴、慢下來與自我接納的信念。",
  "在這間民宿裡，慢寶會陪你一起把時間放慢。讓風、光、雲和安靜的片刻，慢慢把心裡的疲憊鬆開。",
  "願你來到這裡時，可以不用急著成為誰。只要好好休息，好好呼吸，好好成為自己。",
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

function StoryImage({
  src,
  alt,
  className = "",
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  return (
    <motion.figure
      className={`overflow-hidden rounded-[28px] border border-white/80 bg-white/70 p-3 shadow-[0_18px_45px_rgba(90,65,45,0.10)] ${className}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.25 }}
      variants={softReveal}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        className="h-full w-full rounded-[22px] object-contain"
      />
    </motion.figure>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#C8A98B]">
      {children}
    </p>
  );
}

export default function Mumbao() {
  useEffect(() => {
    document.title = "認識慢寶｜MUMBAO";
    setMetaDescription(
      "認識慢寶 MUMBAO，來自宇宙的療癒之光，用慢的哲學陪伴旅人放慢腳步，回到自己。"
    );
  }, []);

  return (
    <div className="min-h-[100svh] overflow-hidden bg-[#FFF9F2] text-[#5F5148] font-serif selection:bg-[#E8B6B6] selection:text-white">
      <Header />

      <main>
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_15%,rgba(232,182,182,0.24),transparent_30%),linear-gradient(135deg,#FFF9F2_0%,#FAF5EF_52%,#F7EFE6_100%)] pt-28 md:pt-36">
          <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-white/45 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 md:grid-cols-[1fr_0.9fr] md:gap-12 md:px-8 md:pb-24">
            <motion.div
              className="space-y-7"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="space-y-4">
                <SectionLabel>Meet MUMBAO</SectionLabel>
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold leading-tight tracking-[0.03em] text-[#3F352F] md:text-6xl">
                    認識慢寶
                  </h1>
                  <p className="text-xl leading-relaxed tracking-[0.05em] text-[#8A7B72] md:text-2xl">
                    MUMBAO｜來自宇宙的療癒之光
                  </p>
                </div>
              </div>

              <div className="max-w-xl rounded-[22px] border border-[#E8B6B6]/45 bg-white/75 px-5 py-4 text-sm leading-relaxed tracking-[0.03em] text-[#6E5E54] shadow-[0_16px_38px_rgba(90,65,45,0.07)] backdrop-blur md:px-6 md:text-base">
                <p>首次公開日：2026年6月18日</p>
                <p>著作者：X.Y.</p>
                <p>© 2026 X.Y. / MUMBAO. All Rights Reserved.</p>
              </div>

              <blockquote className="rounded-[24px] border border-[#E8B6B6]/50 bg-white/70 px-6 py-5 text-2xl font-semibold leading-relaxed tracking-[0.03em] text-[#3F352F] shadow-[0_18px_45px_rgba(90,65,45,0.08)] backdrop-blur md:text-3xl">
                什麼都不做，也值得被愛。
              </blockquote>

              <div className="space-y-4 text-base leading-[1.9] tracking-[0.03em] text-[#5F5148] md:text-lg">
                {heroParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </motion.div>

            <StoryImage
              src={mumbaoImages.hero.src}
              alt={mumbaoImages.hero.alt}
              loading="eager"
              className="mx-auto aspect-[4/5] w-full max-w-[460px] bg-[rgba(255,255,255,0.78)] md:max-w-[500px]"
            />
          </div>
        </section>

        <section className="bg-[#FAF5EF] py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 md:grid-cols-[0.82fr_1.18fr] md:px-8">
            <div className="space-y-6 md:sticky md:top-28">
              <motion.div
                className="space-y-4"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeInUp}
              >
                <SectionLabel>Little Secrets</SectionLabel>
                <h2 className="text-3xl font-semibold tracking-[0.03em] text-[#3F352F] md:text-4xl">
                  慢寶身上的小祕密
                </h2>
                <p className="max-w-xl text-base leading-[1.9] tracking-[0.03em] text-[#8A7B72] md:text-lg">
                  慢寶身上的每一個元素，都有屬於自己的意義。這些小小的符號，是他與宇宙、願望、愛與療癒連結的方式。
                </p>
              </motion.div>

              <StoryImage
                src={mumbaoImages.front.src}
                alt={mumbaoImages.front.alt}
                className="aspect-[4/5] w-full bg-[rgba(255,255,255,0.78)]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {secretCards.map((card, index) => (
                <motion.article
                  key={card.title}
                  className="rounded-[24px] border border-white/80 bg-[rgba(255,255,255,0.78)] p-5 shadow-[0_18px_45px_rgba(90,65,45,0.08)]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: index * 0.04, ease: "easeOut" }}
                  viewport={{ once: true, amount: 0.2 }}
                >
                  <div className="mb-4 h-2 w-12 rounded-full bg-[#E8B6B6]" />
                  <h3 className="text-xl font-semibold tracking-[0.03em] text-[#3F352F]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.85] tracking-[0.03em] text-[#5F5148]">
                    {card.text}
                  </p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#FFF9F2] py-16 md:py-24">
          <motion.div
            className="mx-auto max-w-[760px] px-5 text-center md:px-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeInUp}
          >
            <SectionLabel>Story</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-[0.03em] text-[#3F352F] md:text-4xl">
              慢寶的故事
            </h2>
            <div className="mt-8 rounded-[28px] border border-white/80 bg-white/70 px-6 py-8 text-left shadow-[0_18px_45px_rgba(90,65,45,0.08)] md:px-10 md:py-10">
              <div className="space-y-5 text-base leading-[1.9] tracking-[0.03em] text-[#5F5148] md:text-lg">
                {storyParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="bg-[#F7EFE6] py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.92fr_1.08fr] md:gap-14 md:px-8">
            <StoryImage
              src={mumbaoImages.back.src}
              alt={mumbaoImages.back.alt}
              className="aspect-[4/5] w-full bg-[rgba(255,255,255,0.78)] md:order-2"
            />

            <motion.div
              className="space-y-6 md:order-1"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <div className="space-y-4">
                <SectionLabel>STARRY SOUL MARK</SectionLabel>
                <h2 className="text-3xl font-semibold tracking-[0.03em] text-[#3F352F] md:text-4xl">
                  星情光輪
                </h2>
              </div>

              <div className="space-y-5 text-base leading-[1.9] tracking-[0.03em] text-[#5F5148] md:text-lg">
                {starrySoulParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>

              <div className="rounded-[24px] border border-[#E8B6B6]/45 bg-white/65 px-6 py-6 shadow-[0_18px_45px_rgba(90,65,45,0.08)]">
                <p className="text-xl font-semibold leading-[1.8] tracking-[0.03em] text-[#3F352F] md:text-2xl">
                  那不是一顆星，
                  <br />
                  是宇宙替你保留下來的一段光。
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="bg-[#FFF9F2] py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <motion.div
              className="mx-auto max-w-3xl text-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeInUp}
            >
              <SectionLabel>A Note From MUMBAO</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-[0.03em] text-[#3F352F] md:text-4xl">
                慢寶想對你說
              </h2>
            </motion.div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {quotes.map((quote, index) => (
                <motion.article
                  key={quote}
                  className="rounded-[26px] border border-white/80 bg-white/75 px-6 py-8 text-center shadow-[0_18px_45px_rgba(90,65,45,0.08)]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: index * 0.06, ease: "easeOut" }}
                  viewport={{ once: true, amount: 0.25 }}
                >
                  <p className="text-xl font-semibold leading-[1.75] tracking-[0.03em] text-[#3F352F]">
                    {quote}
                  </p>
                </motion.article>
              ))}
            </div>

            <motion.div
              className="mx-auto mt-10 max-w-[780px] space-y-5 text-base leading-[1.9] tracking-[0.03em] text-[#5F5148] md:text-lg"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={fadeInUp}
            >
              {closingParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </motion.div>

            <motion.div
              className="mx-auto mt-12 max-w-3xl rounded-[30px] border border-[#E8B6B6]/45 bg-[rgba(255,255,255,0.78)] px-6 py-8 text-center shadow-[0_18px_45px_rgba(90,65,45,0.10)] md:px-10"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.25 }}
              variants={fadeInUp}
            >
              <p className="text-2xl font-semibold leading-relaxed tracking-[0.03em] text-[#3F352F] md:text-3xl">
                什麼都不做，也值得被愛。
              </p>
              <div className="mt-6 space-y-2 text-sm leading-relaxed tracking-[0.08em] text-[#8A7B72] md:text-base">
                <p>MUMBAO 慢寶｜The Light of Slowness from Taiwan</p>
                <p>來自台灣的療癒之光，用「慢」的哲學擁抱世界。</p>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
