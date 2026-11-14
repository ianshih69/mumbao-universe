import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Images, ZoomIn } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useMobileViewportHeight } from "@/hooks/useMobileViewportHeight";
import { facilitiesContent as copy, type FacilityFeature } from "@/data/facilitiesContent";
import { facilitiesAlbums, facilitiesHero, facilitiesPhoto, facilitiesAlbumSelection, type FacilitiesAlbumId, type FacilitiesGroupId } from "@/data/facilitiesGallery";
import { RoomGalleryLightbox } from "@/components/rooms/RoomGalleryLightbox";
import styles from "./Facilities.module.css";

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion();
  return <motion.div className={className} initial={reducedMotion ? false : { opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }}
    transition={{ duration: reducedMotion ? 0 : 0.65, ease: "easeOut" }}>{children}</motion.div>;
}
type OpenAlbum = (album: FacilitiesAlbumId, trigger: HTMLButtonElement, photoId?: string) => void;

function PhotoGroup({ album, onOpen }: { album: FacilitiesGroupId; onOpen: OpenAlbum }) {
  const data = facilitiesAlbums[album];
  const count = facilitiesAlbumSelection(album).images.length;
  if (!count) return null;
  return <div className={styles.photoGroup + " " + styles[data.layout]} data-album={album}>
    {data.featured.map((id, index) => {
      const photo = facilitiesPhoto(id);
      const showHint = index === data.featured.length - 1;
      const hint = count > 1 ? "查看全部 " + count + " 張照片" : "點擊放大";
      return <button type="button" key={id} className={styles.photoButton}
        aria-label={(showHint ? hint + "；" : "") + "放大照片：" + photo.alt}
        onClick={event => onOpen(album, event.currentTarget, id)}>
        <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
        {showHint && <span className={styles.albumHint} aria-hidden="true">
          {count > 1 ? <Images size={16} /> : <ZoomIn size={16} />}
          <span className={styles.albumHintLabel}>{count > 1 ? <><span>查看全部</span>{" "}<span>{count} 張照片</span></> : hint}</span>
        </span>}
      </button>;
    })}
  </div>;
}
function Feature({ feature, onOpen }: { feature: FacilityFeature; onOpen: OpenAlbum }) {
  const hasPhotos = feature.album && facilitiesAlbums[feature.album].ids.length > 0;
  return <div id={"facilities-" + feature.id} data-feature={feature.id}
    className={hasPhotos ? styles.albumSection : styles.textFeature}>
    <Reveal className={styles.feature}>
      <h3 data-approved-copy>{feature.title}</h3>
      <div className={styles.body}>
        {feature.paragraphs.map(paragraph => <p data-approved-copy key={paragraph}>{paragraph}</p>)}
      </div>
    </Reveal>
    {feature.album && <PhotoGroup album={feature.album} onOpen={onOpen} />}
  </div>;
}

function useFacilitiesMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    const title = "館內設施｜慢慢蒔光 STime Villa";
    const url = "https://www.mumbao.tw/facilities";
    const photo = "https://www.mumbao.tw" + facilitiesPhoto(facilitiesHero.desktop).src;
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
  const [open, setOpen] = useState(false);
  const [album, setAlbum] = useState<FacilitiesAlbumId>("all");
  const [selected, setSelected] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const albumData = facilitiesAlbumSelection(album);
  const overviewCount = facilitiesAlbumSelection("all").images.length;
  const hero = facilitiesPhoto(facilitiesHero.desktop);
  const openAlbum: OpenAlbum = (nextAlbum, button, photoId) => {
    if (!facilitiesAlbumSelection(nextAlbum).images.length) return;
    trigger.current = button;
    setAlbum(nextAlbum);
    setSelected(facilitiesAlbumSelection(nextAlbum, photoId).index);
    setOpen(true);
  };
  const viewportHeight = useMobileViewportHeight();
  const heroStyle = viewportHeight === null ? undefined : {
    "--facilities-hero-height": (viewportHeight * 0.8) + "px",
  } as CSSProperties;
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <div className={styles.page}>
      <Header />
      <main>
        <section className={styles.hero} style={heroStyle} aria-labelledby="facilities-title">
          <img className={styles.heroImage} src={hero.src} alt={hero.alt}
            width={hero.width} height={hero.height} loading="eager" fetchPriority="high" />
          <div className={styles.heroShade} aria-hidden="true" />
          <Reveal className={styles.heroContent}>
            <p className={styles.heroEyebrow}><span>STAY EXPERIENCE</span><span className={styles.heroDivider} aria-hidden="true" /><span>館內設施</span></p>
            <p className={styles.heroSubtitle}>慢慢蒔光｜館內藝術體驗與專屬禮遇</p>
            <h1 id="facilities-title"><span>住進一座</span><span>可以過夜的當代藝術館</span></h1>
            {overviewCount > 0 && <button type="button" className={styles.heroAlbum} onClick={event => openAlbum("all", event.currentTarget)}>
              <Images size={18} aria-hidden="true" />查看公共空間照片 · {overviewCount}張
            </button>}
          </Reveal>
        </section>
        <article data-facilities-copy>
          {copy.chapters.map(chapter => <section key={chapter.id} data-chapter={chapter.id}
            className={styles.chapter + " " + styles[chapter.id]} aria-labelledby={chapter.id + "-title"}>
            <div className={styles.container}>
              <Reveal className={styles.chapterHeading}>
                <h2 id={chapter.id + "-title"} data-approved-copy>{chapter.title}</h2>
              </Reveal>
              {chapter.intro.length > 0 && <Reveal className={styles.intro}>
                {chapter.intro.map((paragraph, index) => <p data-approved-copy key={paragraph}
                  className={chapter.id === "brand" && index === 1 ? styles.artistQuote : undefined}>{paragraph}</p>)}
              </Reveal>}
              <div className={styles.features}>
                {chapter.features.map(feature => <Feature key={feature.id} feature={feature} onOpen={openAlbum} />)}
              </div>
            </div>
          </section>)}
          <div className={styles.closing}>
            <Reveal className={styles.container}><p className={styles.closingQuote} data-approved-copy>{copy.closing}</p></Reveal>
          </div>
        </article>
      </main>
      <Footer />
    </div>
    {open && <RoomGalleryLightbox key={album} image={albumData.images[selected]} title={albumData.title} theme="cream"
      selected={selected} count={albumData.images.length}
      onSelect={index => setSelected((index + albumData.images.length) % albumData.images.length)}
      onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }} />}
  </Dialog.Root>;
}
