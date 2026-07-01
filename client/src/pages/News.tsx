import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { newsItems } from "@/data/news";

const newsSeoTitle = "最新消息｜慢慢蒔光 STime Villa";
const newsSeoDescription =
  "慢慢蒔光 STime Villa 最新消息，包含試營運籌備、慢寶 MUMBAO 原創 IP、文創商品與 LINE 貼圖相關公告。";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function NewsPage() {
  useEffect(() => {
    document.title = newsSeoTitle;
    setMetaContent('meta[name="description"]', newsSeoDescription);
    setMetaContent('meta[property="og:title"]', newsSeoTitle);
    setMetaContent('meta[property="og:description"]', newsSeoDescription);
    setMetaContent('meta[property="twitter:title"]', newsSeoTitle);
    setMetaContent('meta[property="twitter:description"]', newsSeoDescription);
  }, []);

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="pt-28 md:pt-36">
        <section className="px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-20">
          <div className="mx-auto max-w-5xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              LATEST NEWS
            </span>
            <h1 className="mt-4 text-4xl font-light tracking-wide text-[#3d332b] md:text-5xl">
              最新消息
            </h1>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-2 lg:gap-12">
            {newsItems.map((item) => (
              <Link
                key={item.id}
                href={`/news/${item.slug}`}
                className="group block"
              >
                <article className="h-full overflow-hidden rounded-[12px] bg-[#fffdf8] shadow-[0_18px_50px_rgba(90,70,50,0.08)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_22px_60px_rgba(90,70,50,0.12)]">
                  <div className="aspect-[4/3] overflow-hidden bg-[#efe7dc]">
                    <img
                      src={item.image}
                      alt={item.alt}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
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
        </section>
      </main>

      <Footer />
    </div>
  );
}
