import { useEffect, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

type LegalSection = {
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  title: string;
  description: string;
  canonicalPath: string;
  updatedAt: string;
  introduction: ReactNode;
  sections: LegalSection[];
};

const siteName = "慢慢蒔光 villa｜慢寶宇宙";
const siteOrigin = "https://www.mumbao.tw";

function setMetaContent(selector: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (!meta) {
    meta = document.createElement("meta");
    const nameMatch = selector.match(/meta\[name="([^"]+)"\]/);
    const propertyMatch = selector.match(/meta\[property="([^"]+)"\]/);

    if (nameMatch) meta.name = nameMatch[1];
    if (propertyMatch) meta.setAttribute("property", propertyMatch[1]);
    document.head.appendChild(meta);
  }

  meta.content = content;
}

function setCanonicalUrl(url: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }

  canonical.href = url;
}

export function LegalPage({
  title,
  description,
  canonicalPath,
  updatedAt,
  introduction,
  sections,
}: LegalPageProps) {
  useEffect(() => {
    const pageTitle = `${title}｜${siteName}`;
    const canonicalUrl = `${siteOrigin}${canonicalPath}`;

    document.title = pageTitle;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', pageTitle);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[property="twitter:title"]', pageTitle);
    setMetaContent('meta[property="twitter:description"]', description);
    setMetaContent('meta[property="twitter:url"]', canonicalUrl);
    setCanonicalUrl(canonicalUrl);
  }, [canonicalPath, description, title]);

  return (
    <div className="min-h-screen-safe bg-[#f8f4ed] text-stone-800 selection:bg-[#e8c8c0] selection:text-stone-900">
      <Header />

      <main className="px-5 pb-16 pt-32 md:px-8 md:pb-24 md:pt-40">
        <article className="mx-auto max-w-4xl overflow-hidden rounded-[8px] border border-[#eadfce] bg-white shadow-sm">
          <header className="border-b border-[#eadfce] bg-[#fffaf5] px-6 py-10 md:px-12 md:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9f7868]">
              STime Villa / MUMBAO
            </p>
            <h1 className="mt-3 font-serif text-3xl font-light tracking-wide text-stone-900 md:text-5xl">
              {title}
            </h1>
            <h2 className="mt-7 font-serif text-xl font-medium tracking-wide text-stone-900 md:text-2xl">
              1. 前言
            </h2>
            <div className="mt-3 text-base leading-8 text-stone-600 md:text-lg md:leading-9">
              {introduction}
            </div>
            <p className="mt-5 text-sm text-stone-400">
              最後更新日期：{updatedAt}
            </p>
          </header>

          <div className="space-y-10 px-6 py-10 md:px-12 md:py-14">
            {sections.map((section, index) => (
              <section key={section.title} className="scroll-mt-28">
                <h2 className="font-serif text-xl font-medium tracking-wide text-stone-900 md:text-2xl">
                  {index + 2}. {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-base leading-8 text-stone-600">
                  {section.content}
                </div>
              </section>
            ))}

            <aside className="rounded-[8px] border border-[#eadfce] bg-[#fffaf5] p-5 text-sm leading-7 text-stone-600">
              <p className="font-semibold text-stone-900">
                官網建置與營運說明
              </p>
              <p className="mt-1">
                慢慢蒔光 villa｜慢寶宇宙官網目前仍在建置中，預計於
                2026 年夏季開放。最新服務內容與營運資訊以官網公告為準。
              </p>
            </aside>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
