import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { News } from "@/components/sections/News";
import { Experience } from "@/components/sections/Experience";
import { Rooms } from "@/components/sections/Rooms";
import { BookingCTA } from "@/components/sections/BookingCTA";
import FlyingMascot from "@/components/effects/FlyingMascot";
import MeteorShower from "@/components/effects/MeteorShower";

const enableCruisingMascot =
  import.meta.env.NEXT_PUBLIC_ENABLE_CRUISING_MASCOT === "true";
const homeSeoTitle =
  "慢慢蒔光 STime Villa 民宿｜宜蘭包棟住宿・寵物友善｜官網";
const homeSeoDescription =
  "慢慢蒔光 STime Villa 是位於宜蘭的包棟民宿，結合慢寶宇宙 MUMBAO Universe 原創 IP、寵物友善與療癒住宿空間，適合家庭旅遊、朋友聚會、生日慶祝與宜蘭包棟住宿。這裡是慢慢蒔光 STime Villa 官方網站。";
const homeSocialDescription =
  "慢慢蒔光 STime Villa 是位於宜蘭的包棟民宿，結合慢寶宇宙 MUMBAO Universe 原創 IP、寵物友善與療癒住宿空間，提供宜蘭包棟住宿、家庭旅遊、朋友聚會與療癒主題住宿體驗。";
const homeCanonicalUrl = "https://www.mumbao.tw/";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

function setCanonicalUrl(url: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }

  canonical.href = url;
}

export default function Home() {
  useEffect(() => {
    document.title = homeSeoTitle;
    setMetaContent('meta[name="description"]', homeSeoDescription);
    setMetaContent('meta[property="og:url"]', homeCanonicalUrl);
    setMetaContent('meta[property="og:title"]', homeSeoTitle);
    setMetaContent('meta[property="og:description"]', homeSocialDescription);
    setMetaContent('meta[property="twitter:url"]', homeCanonicalUrl);
    setMetaContent('meta[property="twitter:title"]', homeSeoTitle);
    setMetaContent('meta[property="twitter:description"]', homeSocialDescription);
    setCanonicalUrl(homeCanonicalUrl);
  }, []);

  return (
    <div className="min-h-screen-safe bg-background font-sans selection:bg-[#E8A0BF] selection:text-white">
      <MeteorShower intensity={300} showBackground={false} opacity={0.14} />
      {enableCruisingMascot && <FlyingMascot />}
      <Header />

      <main>
        <div id="about">
          <Hero />
        </div>
        <section className="relative z-10 bg-[#fbf7f1] px-5 pb-8 pt-14 md:px-8 md:pb-8 md:pt-16">
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <p className="text-[12px] font-medium uppercase tracking-[0.32em] text-[#B77C4B] md:text-[13px]">
              MUMBAO UNIVERSE STAY
            </p>
            <h2 className="mt-4 font-serif text-[28px] font-light leading-[1.62] text-[#3D332B] md:text-[38px]">
              住進慢寶宇宙，感受慢下來的宜蘭時光
            </h2>
            <p className="mt-5 text-[15px] leading-[1.9] text-[#8A7667] md:text-[16px]">
              宜蘭包棟住宿｜寵物友善｜慢寶宇宙主題民宿
            </p>
            <p className="mx-auto mt-6 max-w-[820px] text-base leading-[2.2] text-[#75685d] md:text-[17px] md:leading-[2.18]">
              慢慢蒔光 STime Villa 是位於宜蘭員山的包棟民宿，以療癒空間、寵物友善與慢寶 MUMBAO 原創 IP 為核心，為家庭、朋友與毛孩同行的旅人，留一段安靜自在的停留。從公共空間、房型設計到文創商品，讓慢寶的柔軟、溫暖與陪伴，安靜地出現在每一次住宿裡。
            </p>
          </div>
        </section>
        <About />
        <div id="news">
          <News />
        </div>
        <div id="experience">
          <Experience />
        </div>
        <div id="rooms">
          <Rooms />
        </div>
        <div id="booking">
          <BookingCTA />
        </div>
      </main>

      <Footer />
    </div>
  );
}
