import { useEffect } from "react";
import { useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getRoomBySlug } from "@/data/rooms";

const sharedNotice = [
  "房型設備、入住人數、床型與實際配置，請以訂房頁與現場安排為準。",
  "慢慢蒔光每一間房都有不同主題與氛圍，實際開放房型將依訂房狀況與包棟安排為準。",
];

function setMetaContent(selector: string, content: string) {
  const meta = document.head.querySelector<HTMLMetaElement>(selector);

  if (meta) {
    meta.content = content;
  }
}

export default function RoomDetail() {
  const [, params] = useRoute("/rooms/:slug");
  const room = getRoomBySlug(params?.slug || "");

  useEffect(() => {
    if (!room) {
      const notFoundTitle = "找不到這間房型｜慢慢蒔光 STime Villa";
      document.title = notFoundTitle;
      setMetaContent("meta[name=\"description\"]", "找不到這間房型。");
      return;
    }

    const pageTitle = `${room.name}主題房｜ROOM ${room.roomNumber}｜慢慢蒔光 STime Villa`;
    document.title = pageTitle;
    setMetaContent("meta[name=\"description\"]", room.subtitle || room.tagline);
    setMetaContent("meta[property=\"og:title\"]", pageTitle);
    setMetaContent("meta[property=\"og:description\"]", room.subtitle || room.tagline);
    setMetaContent("meta[property=\"twitter:title\"]", pageTitle);
    setMetaContent("meta[property=\"twitter:description\"]", room.subtitle || room.tagline);
  }, [room]);

  if (!room) {
    return (
      <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
        <Header />
        <main className="flex min-h-[70vh] items-center justify-center px-6 pt-28 md:pt-36">
          <section className="mx-auto max-w-xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.32em] text-[#a57652]">
              ROOM
            </span>
            <h1 className="mt-5 text-3xl font-light leading-relaxed md:text-4xl">
              找不到這間房型
            </h1>
            <a
              href="/#rooms"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back / 回房型介紹
            </a>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main className="px-5 pb-20 pt-28 md:px-8 md:pb-28 md:pt-36">
        <article className="mx-auto max-w-6xl">
          <header className="mx-auto max-w-4xl text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.34em] text-[#a57652]">
              ROOM {room.roomNumber}
            </span>
            <h1 className="mt-5 text-4xl font-light leading-tight tracking-wide text-[#3d332b] md:text-5xl">
              {room.name}主題房
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-9 text-[#75685d] md:text-xl">
              {room.subtitle}
            </p>
          </header>

          <div className="mx-auto mt-12 flex aspect-[4/3] w-full max-w-[920px] items-center justify-center overflow-hidden rounded-[14px] bg-[#fbf7f1] p-2 shadow-[0_16px_44px_rgba(90,70,50,0.08)] md:mt-16">
            <img
              src={room.image}
              alt={room.alt}
              className="block h-full w-full rounded-[10px] object-contain"
            />
          </div>

          <div className="mx-auto mt-14 max-w-3xl space-y-9 md:mt-16">
            <div className="space-y-6 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
              {room.intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <section className="space-y-4 border-t border-[#ded1c1] pt-8">
              <h2 className="text-sm font-medium tracking-[0.18em] text-[#3d332b]">
                {room.sectionTitle}
              </h2>
              <div className="space-y-4 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
                {room.sectionContent.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>

            <section className="space-y-4 border-t border-[#ded1c1] pt-8">
              <h2 className="text-sm font-medium tracking-[0.18em] text-[#3d332b]">
                {room.suitableTitle}
              </h2>
              <div className="space-y-4 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
                {room.suitableContent.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>

            <p className="border-t border-[#ded1c1] pt-8 text-base leading-[2.05] text-[#75685d] md:text-lg md:leading-[2.15]">
              {room.closing}
            </p>

            <section className="space-y-3 rounded-[12px] bg-white/55 p-5 text-sm leading-[2] text-[#7f7064] md:p-6 md:text-base">
              {sharedNotice.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>

            <a
              href="/#rooms"
              className="inline-flex items-center gap-2 pt-2 text-sm font-medium tracking-[0.08em] text-[#a57652] transition hover:text-[#c58a54] md:pt-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back / 回房型介紹
            </a>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
