import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useMobileViewportHeight } from "@/hooks/useMobileViewportHeight";
import { getHomeHeroImage } from "@/lib/adminStore";
import { asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type CmsHeroContent = {
  desktopImageUrl: string;
  altText: string;
};

const defaultHeroImage = "/images/Main/STime.JPG";
const defaultHeroMobileImage = "/images/Main/STime-mobile.JPG";
const legacyHeroImage = "/images/Hero.webp";
const legacyMumbaoHeroImage = "/images/mumbao/STime.JPG";
const legacyMumbaoHeroMobileImage = "/images/mumbao/STime-mobile.JPG";

function resolveHeroImage(path: string) {
  const value = path.trim();
  if (
    !value ||
    value === legacyHeroImage ||
    value === legacyMumbaoHeroImage ||
    value === legacyMumbaoHeroMobileImage
  ) {
    return defaultHeroImage;
  }
  return value;
}

function resolveMobileHeroImage(path: string) {
  const resolved = resolveHeroImage(path);
  return resolved === defaultHeroImage ? defaultHeroMobileImage : resolved;
}

const heroCopy = {
  eyebrow: "走進慢寶宇宙繪本裡，體驗全台首創的原創繪本沉浸宇宙",
  title: "慢慢蒔光",
  titleEn: "STime Villa",
  quote: "什麼都不做，也值得被愛。",
};

export function Hero() {
  const height = useMobileViewportHeight();
  const heroImage = getHomeHeroImage();
  const [cmsHero, setCmsHero] = useState<CmsHeroContent | null>(null);

  useEffect(() => {
    let isCurrent = true;
    fetchSitePageContent("home")
      .then((content) => {
        if (!isCurrent) return;
        const hero = content.sections["home.hero"]?.content;
        if (!hero) return;
        setCmsHero({
          desktopImageUrl: asString(hero.desktop_image_url, heroImage.src),
          altText: asString(hero.alt_text, heroImage.alt),
        });
      })
      .catch(() => setCmsHero(null));

    return () => {
      isCurrent = false;
    };
  }, [heroImage.alt, heroImage.src]);

  const backgroundImage = resolveHeroImage(cmsHero?.desktopImageUrl || heroImage.src);
  const mobileBackgroundImage = resolveMobileHeroImage(cmsHero?.desktopImageUrl || heroImage.src);
  const backgroundAlt = cmsHero?.altText || heroImage.alt;

  return (
    <section
      className="relative w-full overflow-hidden transition-none"
      style={{ height: height ? `${height}px` : "100svh" }}
    >
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <picture className="block h-full w-full">
          <source media="(min-width: 768px)" srcSet={backgroundImage} />
          <img
            src={mobileBackgroundImage}
            alt={backgroundAlt}
            className="h-full w-full object-cover object-center"
            onError={(event) => {
              event.currentTarget.src = defaultHeroImage;
            }}
          />
        </picture>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,36,31,0.22)_0%,rgba(48,39,33,0.16)_42%,rgba(35,29,25,0.30)_100%)]" />
      </motion.div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <motion.div
          className="mx-auto max-w-5xl space-y-8 md:space-y-9"
          initial={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
            delay: 0.5,
          }}
        >
          <p className="mx-auto max-w-[330px] text-[15px] leading-[1.85] tracking-[0.06em] text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)] [text-wrap:balance] md:max-w-[740px] md:text-[21px] md:leading-[1.78] md:tracking-[0.095em]">
            {heroCopy.eyebrow}
          </p>

          <h1 className="font-serif font-light leading-none tracking-[0.16em] text-white">
            <span className="block text-[48px] sm:text-[52px] md:text-[82px] lg:text-[88px]">
              {heroCopy.title}
            </span>
            <span className="mt-4 block text-[36px] tracking-[0.18em] text-white/82 sm:text-[40px] md:text-[60px] lg:text-[68px]">
              {heroCopy.titleEn}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-2xl font-serif text-base font-light leading-relaxed tracking-[0.08em] text-white/92 drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)] md:mt-3 md:text-xl lg:text-2xl">
            {heroCopy.quote}
          </p>

        </motion.div>
      </div>
    </section>
  );
}
