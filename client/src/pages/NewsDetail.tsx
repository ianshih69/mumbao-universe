import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getNewsBySlug } from "@/data/news";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function NewsDetail() {
  const [, params] = useRoute("/news/:slug");
  const news = getNewsBySlug(params?.slug || "");

  useEffect(() => {
    if (!news) {
      const notFoundTitle = "找不到這篇最新消息｜慢慢蒔光 STime Villa";
      document.title = notFoundTitle;
      setMetaContent("meta[name=\"description\"]", "找不到這篇最新消息。");
      return;
    }

    const pageTitle = `${news.title}｜最新消息｜慢慢蒔光 STime Villa`;
    document.title = pageTitle;
    setMetaContent("meta[name=\"description\"]", news.excerpt);
    setMetaContent("meta[property=\"og:title\"]", pageTitle);
    setMetaContent("meta[property=\"og:description\"]", news.excerpt);
    setMetaContent("meta[property=\"twitter:title\"]", pageTitle);
    setMetaContent("meta[property=\"twitter:description\"]", news.excerpt);
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

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="pt-28 md:pt-36">
        <article className="px-5 pb-20 pt-14 md:px-8 md:pb-28 md:pt-20">
          <header className="mx-auto max-w-4xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              LATEST NEWS
            </span>
            <div className="mt-5 flex items-center justify-center gap-4 text-xs uppercase tracking-[0.18em] text-[#9a8676]">
              <span>{news.category}</span>
              <span className="h-px w-8 bg-[#ded1c1]" />
              <span>{news.date}</span>
            </div>
            <h1 className="mt-6 text-4xl font-light leading-relaxed tracking-wide text-[#3d332b] md:text-5xl">
              {news.title}
            </h1>
          </header>

          <div className="mx-auto mt-14 grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
            <div className="overflow-hidden rounded-[12px] bg-[#efe7dc] shadow-[0_22px_60px_rgba(90,70,50,0.12)]">
              <img
                src={news.image}
                alt={news.alt}
                className="aspect-[4/5] w-full object-cover md:aspect-[5/4] lg:aspect-[4/5]"
              />
            </div>

            <div className="space-y-8">
              <h2 className="text-2xl font-light leading-relaxed text-[#3d332b] md:text-3xl">
                {news.detailTitle}
              </h2>
              <div className="space-y-6 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
                {news.content.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <Link
                href="/news"
                className="inline-flex items-center gap-2 pt-4 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to News / 回最新消息
              </Link>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
