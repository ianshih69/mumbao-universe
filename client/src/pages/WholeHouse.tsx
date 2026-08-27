import { useEffect, type ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Link } from "wouter";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const wholeHouseSeoTitle =
  "宜蘭多人包棟民宿｜10～20人・KTV・烤肉・麻將｜慢慢蒔光 STime Villa";
const wholeHouseSeoDescription =
  "慢慢蒔光 STime Villa 位於宜蘭員山，提供10～20人多人包棟住宿，適合家庭、好友與團體旅行。了解住宿安排、KTV、麻將、烤肉、公共空間、停車與狗狗入住資訊。";
const wholeHouseCanonicalUrl = "https://www.mumbao.tw/stay/whole-house";
const wholeHouseRobotsContent = "noindex,follow";
const wholeHouseRobotsAttribute = "data-whole-house-robots";
const officialLineUrl = "https://lin.ee/u3JpTa6";

const groupSizes = ["10 人", "12 人", "14 人", "16 人", "18 人", "20 人"];

const roomGallery = [
  {
    src: "/images/whole-house/whole-house-room-01.webp",
    alt: "慢慢蒔光宜蘭員山包棟住宿主題房空間",
    className: "lg:row-span-2 lg:aspect-auto",
  },
  {
    src: "/images/whole-house/whole-house-room-02.webp",
    alt: "慢慢蒔光多人住宿房間空間",
    className: "",
  },
  {
    src: "/images/whole-house/whole-house-room-03.webp",
    alt: "慢慢蒔光宜蘭員山主題住宿空間",
    className: "",
  },
];

const sharedMoments = [
  {
    title: "KTV",
    image: "/images/whole-house/whole-house-ktv.webp",
    alt: "慢慢蒔光多人包棟歡唱設備",
    description:
      "吃完飯後不用急著散場，一起唱歌、聊天，把晚上的時間繼續留給彼此。",
  },
  {
    title: "麻將",
    image: "/images/whole-house/whole-house-mahjong.webp",
    alt: "慢慢蒔光多人包棟麻將空間",
    description: "想坐下來輕鬆玩幾圈，也有適合大家一起使用的麻將空間。",
  },
  {
    title: "烤肉",
    image: "/images/whole-house/whole-house-bbq.webp",
    alt: "慢慢蒔光包棟住宿戶外烤肉區",
    description:
      "如有烤肉需求，請於入住前提前告知；實際使用方式依場地、設備與當日規範確認，也可事先詢問食材代訂。",
  },
  {
    title: "公共空間",
    image: "/images/whole-house/whole-house-living.webp",
    alt: "慢慢蒔光包棟住宿共享公共空間",
    description:
      "不只是回房睡覺。客廳、餐廳與公共空間，才是一群人旅行真正一起待得最久的地方。",
  },
];

const dogFeatures = ["大型犬可入住", "可提供基本狗狗備品", "入住前需確認寵物規範"];

const familyNeeds = [
  {
    title: "嬰幼兒",
    description: "嬰兒床與澡盆可依現有數量安排，若有需要請於入住前先告知。",
  },
  {
    title: "孩子",
    description: "兒童住宿會依實際年齡與住宿方式確認，訂房前可先提供同行孩童年齡。",
  },
  {
    title: "長輩",
    description:
      "館內有一樓住宿空間，可依實際需求優先協助安排給長輩或行動較不方便的旅人。目前館內未設置完整無障礙設施，如有行動需求請於訂房前先告知。",
  },
];

const faqs = [
  {
    question: "慢慢蒔光適合幾人包棟？",
    answer:
      "目前以 10～20 人多人包棟為主要住宿方式。實際住宿安排會依入住人數與同行組成確認。",
  },
  {
    question: "有 KTV 嗎？",
    answer: "有提供歡唱設備，包棟入住期間可依館內使用方式使用。",
  },
  {
    question: "可以烤肉嗎？",
    answer:
      "如有烤肉需求，請於入住前提前告知。實際使用方式依場地、設備與當日規範確認，也可事先詢問食材代訂。",
  },
  {
    question: "有麻將嗎？",
    answer: "有提供適合多人一起使用的麻將空間。",
  },
  {
    question: "可以帶狗狗入住嗎？",
    answer:
      "可以。慢慢蒔光開放狗狗依規定入住，大型犬也可以同行。入住前請先告知狗狗數量與體型。",
  },
  {
    question: "可以停幾台車？",
    answer: "館內停車空間一般車輛約可停放 8 台，實際仍依車型與當日停放方式為準。",
  },
  {
    question: "帶小孩或長輩一起入住適合嗎？",
    answer:
      "可以。若有嬰幼兒或長輩同行，可於訂房前先告知實際需求，我們會依現有房間與備品狀況協助確認。",
  },
  {
    question: "入住與退房時間？",
    answer:
      "入住時間為 15:00～18:00，退房時間為 11:00 前。若預計較晚抵達，請提前告知。",
  },
];

function setMetaContent(selector: string, content: string) {
  const metaElements = Array.from(document.head.querySelectorAll<HTMLMetaElement>(selector));
  let meta = metaElements[0];

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

  metaElements.slice(1).forEach((element) => element.remove());
}

function setCanonicalUrl(url: string) {
  const canonicalLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
  );
  let canonical = canonicalLinks[0];

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }

  canonical.href = url;
  canonicalLinks.slice(1).forEach((link) => link.remove());
}

function setWholeHouseRobotsMeta() {
  const robotsMeta = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
  );
  let primaryRobotsMeta = robotsMeta[0];

  if (!primaryRobotsMeta) {
    primaryRobotsMeta = document.createElement("meta");
    primaryRobotsMeta.name = "robots";
    document.head.appendChild(primaryRobotsMeta);
  }

  primaryRobotsMeta.content = wholeHouseRobotsContent;
  primaryRobotsMeta.setAttribute(wholeHouseRobotsAttribute, "true");
  robotsMeta.slice(1).forEach((meta) => meta.remove());
}

function removeWholeHouseRobotsMeta() {
  document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]').forEach((meta) => {
    if (
      meta.getAttribute(wholeHouseRobotsAttribute) === "true" &&
      meta.content === wholeHouseRobotsContent
    ) {
      meta.remove();
    }
  });
}

function removeNewsArticleJsonLd() {
  document.getElementById("news-article-json-ld")?.remove();
}

function WholeHouseImage({
  src,
  alt,
  className = "",
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  return (
    <div className={`overflow-hidden bg-[#eee4d8] ${className}`}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  children,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <header
      className={`space-y-5 ${
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl text-left"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-[0.34em] text-[#a57652]">
        {eyebrow}
      </p>
      <h2 className="font-serif text-[32px] font-light leading-[1.35] text-[#3d332b] md:text-[42px]">
        {title}
      </h2>
      <div className="space-y-4 text-base leading-[2.05] text-[#75685d] md:text-[17px] md:leading-[2.15]">
        {children}
      </div>
    </header>
  );
}

export default function WholeHouse() {
  useEffect(() => {
    document.title = wholeHouseSeoTitle;
    setMetaContent('meta[name="description"]', wholeHouseSeoDescription);
    setMetaContent('meta[property="og:url"]', wholeHouseCanonicalUrl);
    setMetaContent('meta[property="og:title"]', wholeHouseSeoTitle);
    setMetaContent('meta[property="og:description"]', wholeHouseSeoDescription);
    setMetaContent('meta[property="twitter:url"]', wholeHouseCanonicalUrl);
    setMetaContent('meta[property="twitter:title"]', wholeHouseSeoTitle);
    setMetaContent('meta[property="twitter:description"]', wholeHouseSeoDescription);
    setCanonicalUrl(wholeHouseCanonicalUrl);
    setWholeHouseRobotsMeta();
    removeNewsArticleJsonLd();

    return () => {
      removeWholeHouseRobotsMeta();
    };
  }, []);

  return (
    <div className="min-h-screen-safe bg-[#fbf8f2] font-serif text-[#3d332b] selection:bg-[#c58a54] selection:text-white">
      <Header />

      <main>
        <section className="relative flex min-h-[480px] items-end overflow-hidden bg-[#2f2924] px-5 pb-14 pt-28 text-white md:min-h-[60vh] md:px-8 md:pb-20">
          <img
            src="/images/whole-house/whole-house-hero.webp"
            alt="慢慢蒔光宜蘭員山多人包棟住宿"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[#2f2924]/42" />
          <div className="relative z-10 mx-auto w-full max-w-6xl">
            <p className="text-xs font-medium uppercase tracking-[0.38em] text-white/78">
              WHOLE HOUSE STAY
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-[42px] font-light leading-[1.18] tracking-[0.02em] md:text-[68px]">
              <span className="block">宜蘭多人包棟</span>
              <span className="block">一起住進慢慢蒔光</span>
            </h1>
            <p className="mt-7 max-w-2xl whitespace-pre-line text-base leading-[2] text-white/86 md:text-xl md:leading-[2.05]">
              {`10～20 人的家庭旅行、好友聚會與多人住宿，
從空間、設備到狗狗同行，把旅程留給真正重要的人。`}
            </p>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <SectionIntro eyebrow="YOUR GROUP" title="你們幾個人？">
            <p>
              每一趟包棟旅行的組成都不一樣。慢慢蒔光以 10～20
              人多人包棟為主要住宿方式，不論奇數或偶數人數，都可以依實際入住人數與同行組成，確認適合的住宿安排。
            </p>
          </SectionIntro>

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#e4d6c5] bg-[#e4d6c5] sm:grid-cols-3 lg:grid-cols-6">
            {groupSizes.map((size) => (
              <div
                key={size}
                className="bg-[#fffdf8] px-4 py-8 text-center transition-colors duration-300 hover:bg-[#f7efe5]"
              >
                <p className="font-serif text-[34px] font-light leading-none text-[#3d332b] md:text-[38px]">
                  {size.replace(" 人", "")}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.24em] text-[#a57652]">Guests</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#f6efe6] px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.42fr_0.58fr] lg:items-start lg:gap-16">
            <SectionIntro eyebrow="STAY TOGETHER" title="大家怎麼住？" align="left">
              <p>
                一群朋友、幾個家庭，或帶著孩子與長輩一起旅行，需要的住宿方式都不一樣。
              </p>
              <p>
                慢慢蒔光會依實際入住人數與同行組成，協助確認適合的住宿空間與床位安排，讓大家住在一起，也保留各自休息的舒服距離。
              </p>
              <Link
                href="/rooms"
                className="inline-flex items-center gap-2 pt-4 text-sm font-medium tracking-[0.12em] text-[#9b704e] transition hover:translate-x-1 hover:text-[#c58a54]"
              >
                查看主題房型
                <ArrowRight className="h-4 w-4" />
              </Link>
            </SectionIntro>

            <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-2">
              {roomGallery.map((image) => (
                <WholeHouseImage
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  className={`aspect-[4/5] rounded-[12px] shadow-[0_20px_60px_rgba(90,70,50,0.08)] lg:aspect-[4/3] ${image.className}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <SectionIntro eyebrow="SHARED MOMENTS" title="住在一起，晚上也不用急著散場">
            <p>旅行最好玩的時候，常常是在行程結束以後。</p>
            <p>
              回到慢慢蒔光，可以唱歌、聊天、打幾圈麻將，也可以一起準備一頓烤肉，不用再趕著去下一個地方。
            </p>
          </SectionIntro>

          <div className="mx-auto mt-14 grid max-w-6xl gap-8 md:grid-cols-2 lg:gap-10">
            {sharedMoments.map((item) => (
              <article key={item.title} className="group">
                <WholeHouseImage
                  src={item.image}
                  alt={item.alt}
                  className="aspect-[4/3] rounded-[12px] shadow-[0_18px_48px_rgba(90,70,50,0.08)]"
                />
                <div className="mt-6 space-y-3">
                  <h3 className="font-serif text-[26px] font-light text-[#3d332b]">
                    {item.title}
                  </h3>
                  <p className="text-base leading-[2] text-[#75685d]">{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#fffdf8] px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.58fr_0.42fr] lg:items-center lg:gap-16">
            <WholeHouseImage
              src="/images/whole-house/whole-house-dog.webp"
              alt="慢慢蒔光狗狗友善包棟住宿"
              className="order-1 aspect-[4/3] rounded-[14px] shadow-[0_22px_64px_rgba(90,70,50,0.09)] lg:order-none"
            />
            <div className="order-2 space-y-8 lg:order-none">
              <SectionIntro eyebrow="DOG FRIENDLY STAY" title="狗狗也可以一起來" align="left">
                <p>慢慢蒔光開放狗狗依規定入住，大型犬也可以一起旅行。</p>
                <p>
                  入住前請先確認狗狗數量與體型，並遵守館內寵物入住規範，讓人與狗狗都能舒服地享受這段旅程。
                </p>
                <p>
                  館內可提供寵物圍籬、食碗、水碗與睡墊，實際依現場數量為準；狗狗慣用用品建議自行攜帶。
                </p>
              </SectionIntro>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {dogFeatures.map((feature) => (
                  <p
                    key={feature}
                    className="border-l border-[#d9c8b7] bg-[#fbf7f1] px-4 py-3 text-sm leading-7 text-[#6f6258]"
                  >
                    {feature}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.46fr_0.54fr] lg:items-center lg:gap-16">
            <div className="space-y-10">
              <SectionIntro
                eyebrow="FAMILY STAY"
                title={
                  <>
                    <span className="md:block">一家人一起來，</span>
                    <span className="md:block">也能慢慢住</span>
                  </>
                }
                align="left"
              >
                <p>多人旅行裡，常常不只有大人。</p>
                <p>
                  帶著孩子、嬰幼兒或長輩同行時，房間位置、空間動線與住宿備品，都會影響整趟旅行的舒服程度。
                </p>
              </SectionIntro>
              <div className="space-y-5">
                {familyNeeds.map((item) => (
                  <article key={item.title} className="border-t border-[#dfd1c0] pt-5">
                    <h3 className="text-lg font-light tracking-[0.08em] text-[#3d332b]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-base leading-[1.95] text-[#75685d]">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            <WholeHouseImage
              src="/images/whole-house/whole-house-family.webp"
              alt="慢慢蒔光家庭多人包棟住宿空間"
              className="aspect-[4/5] rounded-[14px] shadow-[0_22px_64px_rgba(90,70,50,0.09)] lg:aspect-[5/6]"
            />
          </div>
        </section>

        <section className="bg-[#f6efe6] px-5 py-20 md:px-8 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.52fr_0.48fr] lg:items-center lg:gap-16">
            <WholeHouseImage
              src="/images/whole-house/whole-house-parking.webp"
              alt="慢慢蒔光館內停車空間"
              className="aspect-[4/3] rounded-[14px] shadow-[0_22px_64px_rgba(90,70,50,0.08)]"
            />
            <SectionIntro
              eyebrow="PARKING"
              title={
                <>
                  <span className="md:block">大家一起開車來，</span>
                  <span className="md:block">也不用分散停車</span>
                </>
              }
              align="left"
            >
              <p>慢慢蒔光備有館內停車空間，一般車輛約可停放 8 台。</p>
              <p>
                實際停車數量仍會依車型與當日停放方式略有不同，若同行車輛較多，可以在入住前先和我們確認。
              </p>
            </SectionIntro>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <SectionIntro eyebrow="FAQ" title="包棟常見問題">
            <p>先整理幾個多人同行最常確認的問題，方便出發前慢慢對齊。</p>
          </SectionIntro>

          <Accordion
            type="multiple"
            className="mx-auto mt-10 max-w-4xl border-y border-[#e1d3c2]"
          >
            {faqs.map((item) => (
              <AccordionItem key={item.question} value={item.question} className="border-[#e1d3c2]">
                <AccordionPrimitive.Header asChild>
                  <div className="flex">
                    <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between gap-4 rounded-md py-6 text-left text-base font-normal leading-8 text-[#3d332b] outline-none transition hover:text-[#9b704e] focus-visible:ring-2 focus-visible:ring-[#b7957c]/40 md:text-lg [&[data-state=open]>svg]:rotate-180">
                      {item.question}
                      <ChevronDown className="h-4 w-4 shrink-0 text-[#a57652] transition-transform duration-200" />
                    </AccordionPrimitive.Trigger>
                  </div>
                </AccordionPrimitive.Header>
                <AccordionContent className="pb-7 text-base leading-[2] text-[#75685d]">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="relative overflow-hidden px-5 py-24 text-white md:px-8 md:py-32">
          <img
            src="/images/whole-house/whole-house-cta.webp"
            alt="慢慢蒔光多人包棟旅程"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[#2f2924]/50" />
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <p className="font-serif text-[36px] font-light leading-[1.38] md:text-[56px]">
              人都約好了，
              <span className="block">剩下的交給慢慢蒔光。</span>
            </p>
            <p className="mx-auto mt-6 max-w-2xl whitespace-pre-line text-base leading-[2] text-white/84 md:text-lg">
              {`想確認日期、入住人數或住宿安排，
歡迎透過官方 LINE 與我們聯繫。`}
            </p>
            <a
              href={officialLineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-9 inline-flex items-center justify-center border border-white/70 px-8 py-4 text-xs font-medium uppercase tracking-[0.24em] text-white transition duration-300 hover:bg-white hover:text-[#3d332b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              詢問包棟住宿
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
