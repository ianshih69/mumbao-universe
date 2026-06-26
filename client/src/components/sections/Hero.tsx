import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useMobileViewportHeight } from "@/hooks/useMobileViewportHeight";
import { getHomeHeroImage } from "@/lib/adminStore";
import { asString, fetchSitePageContent } from "@/lib/site/siteContentApi";

type CmsHeroContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  buttonText: string;
  buttonHref: string;
  desktopImageUrl: string;
  altText: string;
};

const fallbackHero = {
  eyebrow: "慢下來，回到有光的地方",
  title: "慢慢蒔光\nSTime Villa",
  subtitle: "宜蘭員山包棟 villa，一天只接待一組客人。",
  body: "在山與田之間，留一段安靜給自己、家人與毛孩。",
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
          eyebrow: asString(hero.eyebrow),
          title: asString(hero.title),
          subtitle: asString(hero.subtitle),
          body: asString(hero.body),
          buttonText: asString(hero.button_text),
          buttonHref: asString(hero.button_href, "/booking"),
          desktopImageUrl: asString(hero.desktop_image_url, heroImage.src),
          altText: asString(hero.alt_text, heroImage.alt),
        });
      })
      .catch(() => setCmsHero(null));

    return () => {
      isCurrent = false;
    };
  }, [heroImage.alt, heroImage.src]);

  const backgroundImage = cmsHero?.desktopImageUrl || heroImage.src;
  const backgroundAlt = cmsHero?.altText || heroImage.alt;
  const title = cmsHero?.title || fallbackHero.title;

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
            event.currentTarget.src = "/images/Hero.webp";
          }}
        />
        <div className="absolute inset-0 bg-black/30" />
      </motion.div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <motion.div
          className="space-y-5 md:space-y-8"
          initial={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
            delay: 0.5,
          }}
        >
          <p className="text-sm uppercase tracking-[0.3em] text-white/90 opacity-80 md:text-base">
            {cmsHero?.eyebrow || fallbackHero.eyebrow}
          </p>

          <h1 className="font-serif text-3xl font-light leading-tight tracking-widest md:text-6xl lg:text-7xl">
            {title.split("\n").map((line, index, list) => (
              <span key={`${line}-${index}`}>
                {line}
                {index < list.length - 1 && <br />}
              </span>
            ))}
          </h1>

          <div className="mx-auto my-5 h-[1px] w-24 bg-white/50 md:my-8" />

          <p className="mx-auto max-w-2xl font-serif text-base font-light leading-relaxed tracking-wide opacity-90 md:text-lg lg:text-xl">
            {cmsHero?.subtitle || fallbackHero.subtitle}
          </p>

          <p className="mx-auto max-w-3xl text-sm leading-7 tracking-wide text-white/85 md:text-base md:leading-8">
            {cmsHero?.body || fallbackHero.body}
          </p>

          {cmsHero?.buttonText && (
            <Button
              asChild
              className="rounded-full bg-white/90 px-6 py-5 text-sm font-semibold tracking-[0.18em] text-[#765d4a] shadow-sm transition hover:bg-white"
            >
              <Link href={cmsHero.buttonHref}>{cmsHero.buttonText}</Link>
            </Button>
          )}
        </motion.div>

        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.6,
            ease: "easeOut",
            delay: 1.1,
          }}
        >
          <Button
            variant="outline"
            size="lg"
            className="group h-16 w-16 rounded-full border-white/30 bg-white/10 backdrop-blur-sm transition-all duration-500 hover:scale-110 hover:bg-white/20"
          >
            <Play className="h-6 w-6 fill-white text-white transition-transform group-hover:scale-110" />
          </Button>
          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/70">Watch Film</p>
        </motion.div>
      </div>
    </section>
  );
}
