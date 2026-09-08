import { useEffect, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useMobileViewportHeight } from "@/hooks/useMobileViewportHeight";
import { facilitiesContent as copy, type FacilityChapter, type FacilityFeature } from "@/data/facilitiesContent";
import styles from "./Facilities.module.css";

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reducedMotion ? 0 : 0.65, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function ChapterHeading({ chapter, seasonal = false }: { chapter: FacilityChapter; seasonal?: boolean }) {
  const title = chapter.title.slice(chapter.title.indexOf(" ") + 1);
  return (
    <div className={styles.chapterHeading}>
      <div className={styles.chapterMeta}>
        <p className={styles.eyebrow}><span>{chapter.number}</span>{chapter.eyebrow}</p>
        {seasonal && <p className={styles.season} aria-hidden="true">MAY — OCT</p>}
      </div>
      <h2 id={`${chapter.id}-title`}>
        {title.split("｜").map((part, index) => <span className={styles.titlePhrase} key={part}>{index > 0 ? "｜" : ""}{part}</span>)}
      </h2>
    </div>
  );
}

function Feature({ feature, id }: { feature: FacilityFeature; id?: string }) {
  return (
    <div className={styles.feature} id={id}>
      <h3>{feature.title}</h3>
      <div className={styles.body}>
        {feature.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </div>
  );
}

function useFacilitiesMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    const title = "館內設施｜慢慢蒔光 STime Villa";
    const url = "https://www.mumbao.tw/facilities";
    const photo = "https://www.mumbao.tw/images/aboutMe/aboutMe-4.jpg";
    const restore: (() => void)[] = [];
    document.title = title;

    const metadata = [
      ["name", "description", copy.intro[0]],
      ["property", "og:title", title],
      ["property", "og:description", copy.intro[0]],
      ["property", "og:url", url],
      ["property", "og:type", "website"],
      ["property", "og:image", photo],
      ["property", "twitter:title", title],
      ["property", "twitter:description", copy.intro[0]],
      ["property", "twitter:url", url],
      ["property", "twitter:image", photo],
    ];
    for (const [attribute, name, content] of metadata) {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      const meta = existing ?? document.createElement("meta");
      const previous = meta.content;
      meta.setAttribute(attribute, name);
      meta.content = content;
      if (!existing) document.head.appendChild(meta);
      restore.push(() => { if (existing) meta.content = previous; else meta.remove(); });
    }

    const existingCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonical = existingCanonical ?? document.createElement("link");
    const previousHref = canonical.href;
    canonical.rel = "canonical";
    canonical.href = url;
    if (!existingCanonical) document.head.appendChild(canonical);

    // A client-side visit from a news article must not retain its article/noindex metadata.
    const stale = Array.from(document.head.querySelectorAll('#news-article-json-ld, meta[name="robots"][content="noindex,follow"]'));
    stale.forEach((node) => node.remove());
    return () => {
      document.title = previousTitle;
      restore.forEach((reset) => reset());
      if (existingCanonical) canonical.href = previousHref;
      else canonical.remove();
      stale.forEach((node) => document.head.appendChild(node));
    };
  }, []);
}

export default function Facilities() {
  useFacilitiesMetadata();
  const viewportHeight = useMobileViewportHeight();
  const heroStyle = viewportHeight === null ? undefined : {
    "--facilities-hero-height": `${viewportHeight * 0.8}px`,
  } as CSSProperties;
  const [art, family, pets, summer, night] = copy.chapters;

  return (
    <div className={styles.page}>
      <Header />
      <main>
        <section className={styles.hero} style={heroStyle} aria-labelledby="facilities-title">
          <img
            className={styles.heroImage}
            src="/images/aboutMe/aboutMe-4.jpg"
            alt="慢慢蒔光館內拱門、玻璃磚與餐桌空間"
            width="1086"
            height="1448"
            loading="eager"
            fetchPriority="high"
          />
          <div className={styles.heroShade} aria-hidden="true" />
          <Reveal className={styles.heroContent}>
            <p className={styles.heroEyebrow}>STAY EXPERIENCE<span>{copy.label}</span></p>
            <p className={styles.brand}>{copy.brand}</p>
            <h1 id="facilities-title"><span>{copy.title.slice(0, 4)}</span><span>{copy.title.slice(4)}</span></h1>
          </Reveal>
        </section>

        <div className={`${styles.container} ${styles.intro}`}>
          <Reveal className={styles.body}>
            {copy.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </Reveal>
        </div>

        <section className={`${styles.container} ${styles.chapter} ${styles.art}`} aria-labelledby="art-title">
          <Reveal><ChapterHeading chapter={art} /></Reveal>
          <div className={styles.artLead}>
            <Reveal>
              <img className={styles.artImage} src="/images/aboutMumbao/aboutMumbao-1.jpg" alt="慢寶宇宙原創掛畫，兩個慢寶站在雲朵上" width="953" height="831" loading="lazy" />
            </Reveal>
            <Reveal className={styles.artNarrative}>
              <Feature feature={art.features[0]} />
              <Feature feature={art.features[1]} />
            </Reveal>
          </div>
          <div className={styles.artDetails}>
            <Reveal className={styles.dining}>
              <img className={styles.diningImage} src="/images/aboutMe/aboutMe-3.jpg" alt="慢慢蒔光餐廚空間的木質餐桌、曲線櫥櫃與吊燈" aria-describedby="facilities-dining" width="900" height="1200" loading="lazy" />
            </Reveal>
            <Reveal>
              <Feature feature={art.features[2]} id="facilities-dining" />
              <div className={styles.entertainment}>
                <Feature feature={art.features[3]} />
                <Feature feature={art.features[4]} />
              </div>
            </Reveal>
          </div>
        </section>

        <section className={`${styles.chapter} ${styles.family}`} aria-labelledby="family-title">
          <div className={`${styles.container} ${styles.familyGrid}`}>
            <Reveal>
              <ChapterHeading chapter={family} />
              <img className={styles.roomImage} src="/images/Room/S530.jpg" alt="慢慢蒔光客房的床鋪、窗景與慢寶擺飾" width="1200" height="900" loading="lazy" />
            </Reveal>
            <Reveal className={styles.familyFeatures}>
              {family.features.map((feature) => <Feature key={feature.title} feature={feature} />)}
            </Reveal>
          </div>
        </section>

        <section className={`${styles.container} ${styles.chapter} ${styles.pets}`} aria-labelledby="pets-title">
          <Reveal><ChapterHeading chapter={pets} /></Reveal>
          <ol className={styles.petFeatures}>
            {pets.features.map((feature, index) => (
              <li key={feature.title}>
                <Reveal className={styles.petItem}>
                  <span className={styles.featureNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <Feature feature={feature} />
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.chapter} ${styles.summer}`} aria-labelledby="summer-title">
          <div className={styles.container}>
            <Reveal>
              <ChapterHeading chapter={summer} seasonal />
            </Reveal>
            <div className={styles.summerFeatures}>
              {summer.features.map((feature, index) => (
                <Reveal key={feature.title} className={index === 0 ? styles.summerLead : undefined}>
                  <Feature feature={feature} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.container} ${styles.chapter} ${styles.night}`} aria-labelledby="night-title">
          <Reveal><ChapterHeading chapter={night} /></Reveal>
          <div className={styles.nightFeatures}>
            {night.features.map((feature, index) => (
              <Reveal key={feature.title}>
                <p className={styles.featureLabel} aria-hidden="true">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {["AFTER DARK", "GARDEN", "PRIVATE TABLE"][index]}
                </p>
                <Feature feature={feature} />
              </Reveal>
            ))}
          </div>
        </section>

        <section className={styles.closing} aria-label="慢慢蒔光">
          <Reveal className={styles.container}>
            <p className={styles.closingQuote}>{copy.closing}</p>
            <Link href="/booking" className={styles.bookingLink}>
              立即預約<ArrowRight size={17} aria-hidden="true" />
            </Link>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
