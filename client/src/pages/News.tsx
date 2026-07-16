import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { newsItems } from "@/data/news";

const newsSeoTitle = "最新消息｜慢慢蒔光 STime Villa";
const newsSeoDescription =
  "慢慢蒔光 STime Villa 最新消息，包含試營運籌備、慢寶 MUMBAO 原創 IP、文創商品與 LINE 貼圖相關公告。";
const newsItemsPerPage = 6;

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

function getNewsTimeValue(date: string) {
  const [year, month] = date.split(".").map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return 0;
  }

  return year * 100 + month;
}

function getCurrentPage(pageCount: number, location: string) {
  const [, query = ""] = location.split("?");
  const search = new URLSearchParams(query);
  const page = Number.parseInt(search.get("page") || "1", 10);
  const safePage = Number.isFinite(page) ? page : 1;

  return Math.min(Math.max(safePage, 1), pageCount);
}

function getNewsPageHref(page: number) {
  return page <= 1 ? "/news" : `/news?page=${page}`;
}

export default function NewsPage() {
  const [location] = useLocation();

  useEffect(() => {
    document.title = newsSeoTitle;
    setMetaContent('meta[name="description"]', newsSeoDescription);
    setMetaContent('meta[property="og:title"]', newsSeoTitle);
    setMetaContent('meta[property="og:description"]', newsSeoDescription);
    setMetaContent('meta[property="twitter:title"]', newsSeoTitle);
    setMetaContent('meta[property="twitter:description"]', newsSeoDescription);
  }, []);

  const sortedNewsItems = newsItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const dateDiff = getNewsTimeValue(b.item.date) - getNewsTimeValue(a.item.date);

      return dateDiff || a.index - b.index;
    })
    .map(({ item }) => item);
  const pageCount = Math.max(1, Math.ceil(sortedNewsItems.length / newsItemsPerPage));
  const currentPage = getCurrentPage(pageCount, location);
  const pageStart = (currentPage - 1) * newsItemsPerPage;
  const paginatedNewsItems = sortedNewsItems.slice(pageStart, pageStart + newsItemsPerPage);
  const shouldShowPagination = pageCount > 1;

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="pt-28 md:pt-36">
        <section className="px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-20">
          <div className="mx-auto mb-8 max-w-6xl text-left">
            <a
              href="/#news"
              className="text-[13px] leading-6 text-[#75685d] transition hover:text-[#B77C4B] md:text-sm"
            >
              ← Back Home / 回首頁
            </a>
          </div>

          <div className="mx-auto max-w-5xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              LATEST NEWS
            </span>
            <h1 className="mt-4 text-4xl font-light tracking-wide text-[#3d332b] md:text-5xl">
              最新消息
            </h1>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-2 lg:gap-12">
            {paginatedNewsItems.map((item) => (
              <Link
                key={item.id}
                href={`/news/${item.slug}`}
                className="group block"
              >
                <article className="h-full overflow-hidden rounded-[12px] bg-[#fffdf8] shadow-[0_18px_50px_rgba(90,70,50,0.08)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_22px_60px_rgba(90,70,50,0.12)]">
                  <div className="bg-[#efe7dc] p-2">
                    <img
                      src={item.image}
                      alt={item.alt}
                      className="block h-auto w-full object-contain transition duration-700"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-5 px-6 py-7 md:px-8 md:py-8">
                    <div className="flex items-center gap-4 text-xs uppercase tracking-[0.18em] text-[#9a8676]">
                      <span>{item.date}</span>
                      <span className="h-px w-8 bg-[#ded1c1]" />
                      <span>{item.category}</span>
                    </div>
                    <h2 className="text-2xl font-light leading-relaxed text-[#3d332b] md:text-[1.7rem]">
                      {item.title}
                    </h2>
                    <p className="text-base leading-8 text-[#75685d]">
                      {item.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition group-hover:text-[#c58a54]">
                      Read More / 閱讀更多
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {shouldShowPagination && (
            <nav
              aria-label="最新消息分頁"
              className="mx-auto mt-14 flex max-w-6xl items-center justify-center gap-3 text-[13px] tracking-[0.08em] text-[#75685d] md:mt-16 md:gap-4 md:text-sm"
            >
              {currentPage > 1 ? (
                <Link
                  href={getNewsPageHref(currentPage - 1)}
                  className="transition hover:text-[#B77C4B]"
                >
                  ← 上一頁
                </Link>
              ) : (
                <span className="cursor-not-allowed text-[#b9aa9d]">← 上一頁</span>
              )}

              <div className="hidden items-center gap-2 sm:flex">
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                  <Link
                    key={page}
                    href={getNewsPageHref(page)}
                    aria-current={page === currentPage ? "page" : undefined}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full border px-3 transition ${
                      page === currentPage
                        ? "border-[#a57652] bg-[#f4eadf] text-[#3d332b]"
                        : "border-[#ded1c1] text-[#75685d] hover:border-[#B77C4B] hover:text-[#B77C4B]"
                    }`}
                  >
                    {page}
                  </Link>
                ))}
              </div>

              <span className="rounded-full border border-[#ded1c1] px-4 py-1.5 text-[#75685d] sm:hidden">
                {currentPage} / {pageCount}
              </span>

              {currentPage < pageCount ? (
                <Link
                  href={getNewsPageHref(currentPage + 1)}
                  className="transition hover:text-[#B77C4B]"
                >
                  下一頁 →
                </Link>
              ) : (
                <span className="cursor-not-allowed text-[#b9aa9d]">下一頁 →</span>
              )}
            </nav>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
