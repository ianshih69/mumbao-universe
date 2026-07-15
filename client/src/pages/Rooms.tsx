import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { rooms } from "@/data/rooms";

const roomsSeoTitle = "房型介紹｜慢慢蒔光 STime Villa";
const roomsSeoDescription =
  "慢慢蒔光 STime Villa 五間公開主題房，結合房號、雙星守護與慢生活住宿氛圍，另有一間留給宇宙的隱藏星房。";

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function RoomsPage() {
  useEffect(() => {
    document.title = roomsSeoTitle;
    setMetaContent('meta[name="description"]', roomsSeoDescription);
    setMetaContent('meta[property="og:title"]', roomsSeoTitle);
    setMetaContent('meta[property="og:description"]', roomsSeoDescription);
    setMetaContent('meta[property="twitter:title"]', roomsSeoTitle);
    setMetaContent('meta[property="twitter:description"]', roomsSeoDescription);
  }, []);

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="pt-28 md:pt-36">
        <section className="px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-20">
          <div className="mx-auto mb-8 max-w-6xl text-left">
            <a
              href="/#rooms"
              className="text-[13px] leading-6 text-[#75685d] transition hover:text-[#b77c4b] md:text-sm"
            >
              ← Back Home / 回首頁
            </a>
          </div>

          <div className="mx-auto max-w-5xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              THE SANCTUARIES
            </span>
            <h1 className="mt-4 text-4xl font-light tracking-wide text-[#3d332b] md:text-5xl">
              房型介紹
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#75685d] md:text-lg md:leading-9">
              五間公開主題房，一間留給宇宙的隱藏星房。
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-3 xl:gap-12">
            {rooms.map((room) => (
              <Link
                key={room.id}
                href={`/rooms/${room.slug}`}
                className="group block"
              >
                <article className="h-full overflow-hidden rounded-[12px] bg-[#fffdf8] shadow-[0_18px_50px_rgba(90,70,50,0.08)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_22px_60px_rgba(90,70,50,0.12)]">
                  <div className="aspect-[4/3] overflow-hidden bg-[#efe7dc]">
                    <img
                      src={room.image}
                      alt={room.alt}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>

                  <div className="space-y-4 px-6 py-7 md:px-8 md:py-8">
                    <span className="block text-[10px] uppercase tracking-[0.24em] text-[#9a8676]">
                      ROOM {room.roomNumber}
                    </span>
                    <h2 className="flex flex-wrap items-center gap-y-1 text-[26px] font-light leading-tight tracking-wide text-[#3d332b] md:text-[28px]">
                      {room.zodiacIcons && room.zodiacIcons.length > 0 && (
                        <span className="mr-2.5 inline-flex items-center gap-2.5 overflow-visible md:mr-4 md:gap-3">
                          {room.zodiacIcons.map((icon) => (
                            <img
                              key={icon.src}
                              src={icon.src}
                              alt={icon.alt}
                              className={`h-[34px] w-[34px] object-contain md:h-10 md:w-10 ${
                                icon.src.includes("/Taurus")
                                  ? "scale-[0.94] -translate-y-0.5 md:-translate-y-1"
                                  : icon.alt === "巨蟹"
                                    ? "scale-[1.08]"
                                    : ""
                              }`}
                              loading="lazy"
                            />
                          ))}
                        </span>
                      )}
                      <span>{room.name}</span>
                    </h2>
                    <p className="text-sm tracking-[0.12em] text-[#75685d]">
                      守護星座｜{room.stars}
                    </p>
                    <p className="text-base leading-8 text-[#75685d]">
                      {room.tagline}
                    </p>
                    <span className="inline-flex items-center gap-2 pt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#a57652] transition group-hover:text-[#c58a54]">
                      View Room
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
