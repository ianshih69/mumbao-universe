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
      <MeteorShower intensity={300} showBackground={false} />
      {enableCruisingMascot && <FlyingMascot />}
      <Header />

      <main>
        <div id="about">
          <Hero />
        </div>
        <section className="bg-[#fbf7f1] px-5 py-10 md:px-8 md:py-14">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9f7868]">
              STime Villa Official
            </p>
            <h1 className="mt-3 font-serif text-2xl font-light tracking-wide text-stone-900 md:text-4xl">
              慢慢蒔光 STime Villa 民宿
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-stone-600 md:text-lg md:leading-9">
              慢慢蒔光 STime Villa 是位於宜蘭的包棟民宿，結合慢寶宇宙 MUMBAO Universe 原創 IP、寵物友善與療癒住宿空間，適合家庭旅遊、朋友聚會、生日慶祝與宜蘭包棟住宿。
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
