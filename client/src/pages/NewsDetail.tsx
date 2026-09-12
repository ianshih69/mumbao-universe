import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getNewsBySlug, type NewsItem } from "@/data/news";

const siteOrigin = "https://www.mumbao.tw";
const noindexNewsSlugs = new Set(["stime-villa-summer-preview-preparation"]);
const newsArticleJsonLdId = "news-article-json-ld";
const newsArticleSlugs = new Set([
  "mumbao-line-stickers-coming-soon",
  "mumbao-goods-coming-soon",
  "stime-villa-website-updates",
  "mumbao-universe-starry-fashion-exhibition-2026",
]);

function setMetaContent(selector: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (!meta) {
    const nameMatch = selector.match(/^meta\[name="([^"]+)"\]$/);
    const propertyMatch = selector.match(/^meta\[property="([^"]+)"\]$/);

    if (nameMatch || propertyMatch) {
      meta = document.createElement("meta");

      if (nameMatch) {
        meta.name = nameMatch[1];
      } else if (propertyMatch) {
        meta.setAttribute("property", propertyMatch[1]);
      }

      document.head.appendChild(meta);
    }
  }

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

function removeMetaElements(selector: string) {
  document.head.querySelectorAll<HTMLMetaElement>(selector).forEach((meta) => {
    meta.remove();
  });
}

function removeCanonicalUrl() {
  document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]').forEach((canonical) => {
    canonical.remove();
  });
}

function setRobotsNoindex() {
  const robotsMeta = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'),
  );
  let primaryRobotsMeta = robotsMeta[0];

  if (!primaryRobotsMeta) {
    primaryRobotsMeta = document.createElement("meta");
    primaryRobotsMeta.name = "robots";
    document.head.appendChild(primaryRobotsMeta);
  }

  primaryRobotsMeta.content = "noindex,follow";
  robotsMeta.slice(1).forEach((meta) => meta.remove());
}

function getAbsoluteUrl(path: string) {
  return new URL(path, `${siteOrigin}/`).href;
}

function removeNewsArticleJsonLd() {
  document.getElementById(newsArticleJsonLdId)?.remove();
}

function upsertNewsArticleJsonLd(news: NewsItem, canonicalUrl: string) {
  let script = document.getElementById(newsArticleJsonLdId) as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement("script");
    script.id = newsArticleJsonLdId;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: news.title,
    description: news.excerpt,
    image: getAbsoluteUrl(news.image),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    author: {
      "@type": "Organization",
      name: "慢慢蒔光 STime Villa",
      url: `${siteOrigin}/`,
    },
    publisher: {
      "@type": "Organization",
      name: "慢慢蒔光 STime Villa",
      logo: {
        "@type": "ImageObject",
        url: `${siteOrigin}/images/logo.webp`,
      },
    },
  });
}

export default function NewsDetail() {
  const [, params] = useRoute("/news/:slug");
  const news = getNewsBySlug(params?.slug || "");

  useEffect(() => {
    if (!news) {
      const notFoundTitle = "找不到這篇最新消息｜慢慢蒔光 STime Villa";
      const notFoundDescription = "找不到這篇最新消息。";
      document.title = notFoundTitle;
      setMetaContent("meta[name=\"description\"]", notFoundDescription);
      setMetaContent("meta[property=\"og:title\"]", notFoundTitle);
      setMetaContent("meta[property=\"og:description\"]", notFoundDescription);
      setMetaContent("meta[property=\"twitter:title\"]", notFoundTitle);
      setMetaContent("meta[property=\"twitter:description\"]", notFoundDescription);
      setRobotsNoindex();
      removeCanonicalUrl();
      removeMetaElements("meta[property=\"og:url\"]");
      removeMetaElements("meta[property=\"twitter:url\"]");
      removeNewsArticleJsonLd();
      return;
    }

    const pageTitle = `${news.title}｜最新消息｜慢慢蒔光 STime Villa`;
    const canonicalUrl = `${siteOrigin}/news/${news.slug}`;

    document.title = pageTitle;
    setMetaContent("meta[name=\"description\"]", news.excerpt);
    setMetaContent("meta[property=\"og:url\"]", canonicalUrl);
    setMetaContent("meta[property=\"og:title\"]", pageTitle);
    setMetaContent("meta[property=\"og:description\"]", news.excerpt);
    setMetaContent("meta[property=\"twitter:url\"]", canonicalUrl);
    setMetaContent("meta[property=\"twitter:title\"]", pageTitle);
    setMetaContent("meta[property=\"twitter:description\"]", news.excerpt);
    setCanonicalUrl(canonicalUrl);

    if (noindexNewsSlugs.has(news.slug)) {
      setRobotsNoindex();
      removeNewsArticleJsonLd();
    } else {
      removeMetaElements("meta[name=\"robots\"]");
    }

    if (newsArticleSlugs.has(news.slug)) {
      upsertNewsArticleJsonLd(news, canonicalUrl);
    } else {
      removeNewsArticleJsonLd();
    }
  }, [news]);

  if (!news) {
    return (
      <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
        <Header />
        <main className="flex min-h-[70vh] items-center justify-center px-5 pt-28 md:pt-36">
          <section className="mx-auto max-w-xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              LATEST NEWS
            </span>
            <h1 className="mt-5 text-3xl font-light leading-relaxed md:text-4xl">
              找不到這篇最新消息
            </h1>
            <Link
              href="/news"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to News / 回最新消息
            </Link>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  const imageFirst = news.detailLayout === "image-first";
  const cover = (
    <div className={`mx-auto flex aspect-[4/3] w-full max-w-[900px] items-center justify-center overflow-hidden rounded-[14px] bg-[#fbf7f1] p-2 shadow-[0_16px_44px_rgba(90,70,50,0.08)] ${imageFirst ? "" : "mt-14 md:mt-16"}`}>
      <img
        src={news.image}
        alt={news.alt}
        className="block h-full w-full rounded-[10px] object-contain"
      />
    </div>
  );

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="pt-28 md:pt-36">
        <article className="px-5 pb-20 pt-14 md:px-8 md:pb-28 md:pt-20">
          {imageFirst && cover}
          <header className={`mx-auto flex flex-col items-center text-center ${imageFirst ? "mt-10 max-w-3xl md:mt-14" : "max-w-5xl"}`}>
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              LATEST NEWS
            </span>
            <div className="mt-5 flex items-center justify-center gap-4 text-xs uppercase tracking-[0.18em] text-[#9a8676]">
              <span>{news.category}</span>
              <span className="h-px w-8 bg-[#ded1c1]" />
              <span>{news.date}</span>
            </div>
            <h1 className={`mx-auto mt-6 text-center font-light text-[#3d332b] ${imageFirst ? "max-w-3xl text-[28px] leading-[1.6] tracking-normal md:text-4xl md:leading-[1.55]" : "max-w-[940px] text-[32px] leading-[1.42] tracking-wide md:text-5xl md:leading-[1.4]"}`}>
              {news.title}
            </h1>
          </header>

          {!imageFirst && cover}

          <div className={`mx-auto space-y-8 ${imageFirst ? "mt-10 max-w-2xl md:mt-12" : "mt-14 max-w-3xl md:mt-16"}`}>
            {imageFirst ? (
              <p className="text-xl font-light leading-[1.9] text-[#a57652] md:text-2xl">
                {news.detailTitle}
              </p>
            ) : (
              <h2 className="text-2xl font-light leading-relaxed text-[#3d332b] md:text-3xl">
                {news.detailTitle}
              </h2>
            )}
            <div className="space-y-6 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
              {news.content.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {news.highlights && (
              <section className="pt-4 md:pt-6" aria-labelledby="news-highlights">
                <h2 id="news-highlights" className="text-xl font-light leading-relaxed text-[#3d332b] md:text-2xl">
                  {news.highlights.title}
                </h2>
                <ul className="mt-5 list-disc space-y-4 pl-5 text-base leading-[2.05] text-[#75685d] marker:text-[#c78f9e] md:mt-6 md:text-lg md:leading-[2.15]">
                  {news.highlights.items.map((item) => (
                    <li key={item} className="pl-1">{item}</li>
                  ))}
                </ul>
              </section>
            )}
            <Link
              href="/news"
              className="inline-flex items-center gap-2 pt-4 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54] md:pt-6"
            >
              ← 返回最新消息
            </Link>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
