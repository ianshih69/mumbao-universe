import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useMobileViewportHeight } from "@/hooks/useMobileViewportHeight";
import { getHomeHeroImage } from "@/lib/adminStore";
import { asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type CmsHeroContent = {
  desktopImageUrl: string;
  altText: string;
};

const defaultHeroImage = "/images/mumbao/STime.JPG";
const legacyHeroImage = "/images/Hero.webp";

function resolveHeroImage(path: string) {
  const value = path.trim();
  if (!value || value === legacyHeroImage) return defaultHeroImage;
  return value;
}

const heroCopy = {
  eyebrow: "慢下來，回到有光的地方",
  title: "慢慢蒔光",
  titleEn: "STime Villa",
  quote: "什麼都不做，也值得被愛。",
  location: "宜蘭員山包棟民宿",
  body: "在山與田之間，留一段安靜的停留。",
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
        <img
          src={backgroundImage}
          alt={backgroundAlt}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.src = defaultHeroImage;
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,36,31,0.22)_0%,rgba(48,39,33,0.16)_42%,rgba(35,29,25,0.30)_100%)]" />
      </motion.div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <motion.div
          className="mx-auto max-w-5xl space-y-8 md:space-y-10"
          initial={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
            delay: 0.5,
          }}
        >
          <p className="text-xs tracking-[0.28em] text-white/85 md:text-sm">
            {heroCopy.eyebrow}
          </p>

          <h1 className="font-serif font-light leading-none tracking-[0.16em] text-white">
            <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
              {heroCopy.title}
            </span>
            <span className="mt-4 block text-2xl tracking-[0.18em] text-white/82 sm:text-3xl md:text-6xl lg:text-7xl">
              {heroCopy.titleEn}
            </span>
          </h1>

          <p className="mx-auto max-w-2xl font-serif text-base font-light leading-relaxed tracking-[0.08em] text-white/90 md:text-xl lg:text-2xl">
            {heroCopy.quote}
          </p>

          <div className="space-y-4 text-white/84">
            <p className="text-sm font-medium tracking-[0.24em] md:text-base">
              {heroCopy.location}
            </p>
            <p className="mx-auto max-w-2xl text-sm leading-7 tracking-[0.08em] md:text-base md:leading-8">
              {heroCopy.body}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
