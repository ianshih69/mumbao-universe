import { useEffect, useState } from "react";
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
import { consumeCustomerEmailVerificationSuccessNotice } from "@/lib/shop/customerAuthClient";

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
  const [verificationNotice, setVerificationNotice] = useState("");

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

  useEffect(() => {
    setVerificationNotice(consumeCustomerEmailVerificationSuccessNotice());
  }, []);

  return (
    <div className="min-h-screen-safe bg-background font-sans selection:bg-[#E8A0BF] selection:text-white">
      <MeteorShower intensity={300} showBackground={false} opacity={0.14} />
      {enableCruisingMascot && <FlyingMascot />}
      <Header />
      {verificationNotice && (
        <div
          className="fixed left-1/2 top-24 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[8px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 shadow-sm"
          role="status"
        >
          {verificationNotice}
        </div>
      )}

      <main>
        <div>
          <Hero />
        </div>
        <section className="relative z-10 bg-[#fbf7f1] px-5 pb-8 pt-14 md:px-8 md:pb-8 md:pt-16">
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <p className="text-[12px] font-medium uppercase tracking-[0.32em] text-[#B77C4B] md:text-[13px]">
              MUMBAO UNIVERSE STAY
            </p>
            <h2 className="mx-auto mt-4 max-w-5xl font-serif text-[28px] font-light leading-[1.48] text-[#3D332B] md:text-[36px] md:leading-[1.36]">
              被雲與光擁抱的空間
            </h2>
            <div className="mx-auto mt-6 max-w-[820px] space-y-5 text-base leading-[2.2] text-[#75685d] md:text-[17px] md:leading-[2.18]">
              <p>
                慢慢蒔光的每一個角落，都以「慢」為出發點設計。
              </p>
              <p>
                柔和的光線、留白的空間、藝術與自然交織的氛圍，不是為了炫耀設計，而是希望身體與心，都能慢慢安靜下來。
              </p>
              <p>
                十二星座房型、慢寶藝術作品與收藏，散落在住宿的每個角落。你不是走進一間民宿，而是一步步探索慢寶宇宙，感受那些藏在細節裡的驚喜與陪伴。
              </p>
            </div>
          </div>
        </section>
        <div id="about" className="scroll-mt-[120px]">
          <About />
        </div>
        <div id="news" className="scroll-mt-[120px]">
          <News />
        </div>
        <Experience />
        <div id="rooms" className="scroll-mt-[120px]">
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
