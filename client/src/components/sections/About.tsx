import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function About() {
  return (
    <section className="relative z-10 overflow-hidden bg-[#F9F9F9] py-16 md:py-24 lg:py-28">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col items-center gap-12 md:gap-16 lg:flex-row lg:gap-24">

          {/* Image Side */}
          <motion.div
            className="group relative w-full lg:w-1/2"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div className="relative aspect-square overflow-hidden rounded-lg shadow-xl transition-shadow duration-500 hover:shadow-2xl md:aspect-[4/5]">
              <img
                src="/images/mumbao/living.JPG"
                alt="慢慢蒔光 STime Villa 宜蘭員山包棟民宿的白色建築與山景倒影"
                width={900}
                height={1125}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 border border-white/20 m-4 pointer-events-none rounded-lg" />
            </div>
          </motion.div>

          {/* Text Side - Teaser Content */}
          <motion.div
            className="w-full space-y-8 lg:w-1/2"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div>
              <span className="text-[12px] font-medium tracking-[0.32em] text-[#B77C4B] md:text-[13px]">
                About STime Villa
              </span>
              <h2 className="mt-4 font-serif text-3xl leading-[1.35] text-[#3D332B] md:text-4xl lg:text-5xl">
                降落在員山的<br />
                <span className="italic text-[#6F6258]">白雲基地</span>
              </h2>
              <p className="mt-5 text-[15px] leading-[1.9] text-[#8A7667] md:text-[16px]">
                宜蘭員山包棟民宿｜寵物友善住宿｜慢寶 MUMBAO 原創 IP
              </p>
            </div>

            <div className="space-y-6 text-justify font-serif text-base leading-[2.08] text-[#75685d] md:text-[17px] md:leading-[2.1]">
              <p>
                宜蘭員山，是水與雲霧相遇的地方。慢慢蒔光 STime Villa 座落在山與田之間，以包棟住宿、療癒空間與寵物友善為基礎，打造一座讓家庭、朋友與毛孩都能自在停留的白雲基地。
              </p>
              <p>
                慢寶 MUMBAO 是來自宇宙第七次元（7D）的高維靈魂，象徵柔軟、溫暖與願望守護。在慢慢蒔光，這份陪伴會出現在公共空間、房型細節與文創商品裡，讓旅人住進的不只是宜蘭民宿，也是一段慢下來的時光。
              </p>
              <blockquote className="border-l border-[#d6c3ad] pl-5 italic leading-[2] text-[#6F6258]">
                「在這裡，慢不是停滯，而是回到自己的節奏；雲停下來，時間也慢了。」
              </blockquote>
            </div>

            <a
              href="/about"
              aria-label="閱讀慢慢蒔光宜蘭員山包棟民宿的品牌故事"
              className="group inline-flex items-center border border-[#8b6f5b]/25 px-8 py-5 text-xs uppercase tracking-widest text-[#5f4d40] transition-all duration-500 hover:bg-[#8b6f5b] hover:text-white"
            >
              OUR STORY / 關於慢慢蒔光
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
