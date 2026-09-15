import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNewsBySlug, newsItems } from "@/data/news";
import NewsPage from "./News";
import NewsDetail from "./NewsDetail";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));

const slug = "mumbao-universe-starry-fashion-exhibition-2026";
const title = "【慢寶宇宙・首部曲】2026 宜蘭最治癒的「星晴時尚展」，這次我們住進去！";
const approvedText = "奢華，是懂得把時間浪費在美好的事物上。｜慢慢蒔光【星晴時尚】首部曲開展正文：當原創藝術IP 遇上極致空間美學 —— 慢慢蒔光 STime Villa 顛覆您對宜蘭包棟的想像。2026 年 11 月，我們以「慢寶宇宙・星晴時尚」為題，將美學展覽搬進了員山鄉的獨棟villa中。精心設計的十二星座主題房型，將時尚軟裝與光影美學完美融合，為您的家族聚會、好友慶生或品牌活動，打造前所未有的「策展級住宿體驗」。【展出亮點】空間即展品： 沉浸式體驗慢寶原創 IP 的療癒美學。高規格包棟： 專屬奢華空間，兼顧寵物友善的精緻細節。專屬您的度假儀式感。";
const article = getNewsBySlug(slug)!;
const renderDetail = (path = slug) => renderToStaticMarkup(
  <Router ssrPath={`/news/${path}`}><NewsDetail /></Router>,
);

describe("News exhibition article", () => {
  beforeEach(() => { vi.stubGlobal("React", React); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("adds exactly one article with unique IDs and slugs", () => {
    expect(newsItems).toHaveLength(7);
    expect(newsItems.filter((item) => item.slug === slug)).toHaveLength(1);
    expect(new Set(newsItems.map((item) => item.id)).size).toBe(newsItems.length);
    expect(new Set(newsItems.map((item) => item.slug)).size).toBe(newsItems.length);
    expect(article.id).toBe(5);
    expect(getNewsBySlug("unknown")).toBeUndefined();
  });

  it("preserves every approved character, using the lead separator as a paragraph boundary", () => {
    expect(article.title).toBe(title);
    expect(article.detailTitle + "｜" + article.content.join("")
      + article.highlights!.title + article.highlights!.items.join("")).toBe(approvedText);
    expect(article.content).toHaveLength(3);
    expect(article.highlights!.items).toHaveLength(3);
    expect(article.content).toContain(article.excerpt);
  });

  it("uses the supplied case-sensitive JPEG path for its cover", () => {
    expect(article.image).toBe("/images/News/News-5.JPG");
    const image = readFileSync(new URL("../../public/images/News/News-5.JPG", import.meta.url));
    expect(Array.from(image.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it("renders the image, title, lead, three paragraphs and three highlights in order", () => {
    const html = renderDetail();
    const parts = ["<img", `<h1`, title, article.detailTitle, ...article.content,
      article.highlights!.title, ...article.highlights!.items];
    let previous = -1;
    for (const part of parts) {
      const position = html.indexOf(part);
      expect(position, part).toBeGreaterThan(previous);
      previous = position;
    }
    for (const text of [title, article.detailTitle, ...article.content, ...article.highlights!.items]) {
      expect(html.split(text)).toHaveLength(2);
    }
    expect(html.match(/<li\b/g)).toHaveLength(3);
    expect(html.match(/<p\b/g)).toHaveLength(4);
    expect(html).toContain('aria-labelledby="news-highlights"');
    expect(html).toContain('href="/news"');
    expect(html).not.toContain("<br");
  });

  it("retains the existing 4:3 image treatment with a narrower article measure", () => {
    const html = renderDetail();
    expect(html).toContain("aspect-[4/3]");
    expect(html).toContain("object-contain");
    expect(html).toContain("max-w-2xl");
    expect(html).toContain("md:leading-[2.15]");
  });

  it("appears on the existing list with the same title, excerpt, image and detail link", () => {
    const html = renderToStaticMarkup(<Router ssrPath="/news"><NewsPage /></Router>);
    expect(html).toContain(`href="/news/${slug}"`);
    expect(html).toContain(title);
    expect(html).toContain(article.excerpt);
    expect(html).toContain(`src="${article.image}"`);
    expect(html.match(/<article\b/g)).toHaveLength(6);
    expect(html.indexOf(title)).toBeLessThan(html.indexOf(newsItems.find((item) => item.id === 1)!.title));
  });

  it.each(newsItems.filter((item) => item.id < 5))(
    "preserves the existing title-first rendering for $slug",
    (item) => {
      const html = renderDetail(item.slug);
      expect(item.detailLayout).toBeUndefined();
      expect(item.highlights).toBeUndefined();
      expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<img"));
      expect(html).toContain(item.title);
      expect(html).toContain(item.detailTitle);
      item.content.forEach((paragraph) => expect(html).toContain(paragraph));
      expect(html).not.toContain('id="news-highlights"');
    },
  );

  it("preserves the missing-article fallback", () => {
    const html = renderDetail("unknown");
    expect(html).toContain("找不到這篇最新消息");
    expect(html).toContain('href="/news"');
    expect(html).not.toContain("<img");
  });
});

describe("News original IP article", () => {
  const ipSlug = "mumbao-ip-copyright";
  const ipArticle = getNewsBySlug(ipSlug)!;
  const paragraphs = [
    "很高興向喜愛慢慢蒔光的旅人分享這個好消息！",
    "為了守護這隻從第七維度降落的慢靈魂，我們的原創 IP「慢寶 MUMBAO」已經正式取得多國智慧財產權與著作權保護囉！",
    "這意味著，無論在台灣還是海外，慢寶與他的白雲基地，都是全宇宙獨一無二的合法存在。",
    "未來不論是民宿內的十二星座主題房，或是即將上架的文創周邊，我們都會持續用最高的規格，為大家保護這塊純淨的療癒空間。",
    "謝謝大家陪著慢寶一起長大。",
    "接下來，也請期待我們的全新周邊登場吧！",
  ];

  beforeEach(() => { vi.stubGlobal("React", React); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("preserves the approved title, excerpt, date and all six paragraphs verbatim", () => {
    expect(ipArticle.id).toBe(6);
    expect(ipArticle.title).toBe("慢寶宇宙的奇幻旅程：我們拿到身分證啦！");
    expect(ipArticle.excerpt).toBe("原創 IP「慢寶 MUMBAO」正式取得多國智慧財產權與著作權保護，慢寶宇宙的奇幻旅程，也正式迎來新的里程碑。");
    expect(ipArticle.date).toBe("2026.09.14");
    expect([ipArticle.detailTitle, ...ipArticle.content]).toEqual(paragraphs);
    expect(newsItems.filter((item) => item.slug === ipSlug)).toHaveLength(1);
  });

  it("presents the supplied poster without an outer card while retaining its dimensions", () => {
    expect(ipArticle.image).toBe("/images/News/News-6.JPG");
    const image = readFileSync(new URL("../../public/images/News/News-6.JPG", import.meta.url));
    expect(Array.from(image.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    const html = renderDetail(ipSlug);
    expect(html).toContain(`src="${ipArticle.image}"`);
    expect(html).toContain("object-contain");
    expect(html).toContain("aspect-[4/3]");
    expect(html).toContain("max-w-[900px]");
    expect(html).toContain("rounded-[4px]");
    expect(html).not.toContain("bg-[#fbf7f1]");
    expect(html).not.toContain("rounded-[14px]");
    expect(html).not.toContain("shadow-[0_16px_44px_rgba(90,70,50,0.08)]");
    expect(html).not.toMatch(/(?:\s|\")p-2(?:\s|\")/);
    expect(html).toContain("max-w-2xl");
    expect(html).toContain("space-y-6");
    expect(html).toContain("md:leading-[2.15]");
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<h1"));
  });

  it.each(newsItems.filter((item) => ![6, 7].includes(item.id)))(
    "retains the original cover framing for $slug",
    (item) => {
      const html = renderDetail(item.slug);
      expect(html).toContain("bg-[#fbf7f1]");
      expect(html).toContain("rounded-[14px]");
      expect(html).toContain("rounded-[10px]");
      expect(html).toContain("shadow-[0_16px_44px_rgba(90,70,50,0.08)]");
      expect(html).toMatch(/(?:\s|\")p-2(?:\s|\")/);
    },
  );

  it("renders each paragraph exactly once, in order, with a return link", () => {
    const html = renderDetail(ipSlug);
    let previous = html.indexOf(ipArticle.title);
    for (const text of paragraphs) {
      const position = html.indexOf(text);
      expect(position).toBeGreaterThan(previous);
      expect(html.split(text)).toHaveLength(2);
      previous = position;
    }
    expect(html.match(/<p\b/g)).toHaveLength(6);
    expect(html).toContain('href="/news"');
    expect(html).not.toContain("<br");
    expect(html).not.toContain("<strong");
  });

  it("provides the approved metadata without changing existing article SEO defaults", () => {
    expect(ipArticle.seoTitle).toBe("慢寶宇宙的奇幻旅程：我們拿到身分證啦！｜慢慢蒔光 STime Villa");
    expect(ipArticle.seoDescription).toBe("原創 IP「慢寶 MUMBAO」正式取得多國智慧財產權與著作權保護，從十二星座主題房到文創周邊，慢寶宇宙持續守護屬於旅人的療癒空間。");
    for (const item of newsItems.filter((item) => item.id < 5)) {
      expect(item.seoTitle).toBeUndefined();
      expect(item.seoDescription).toBeUndefined();
    }
  });
});

describe("News private event and production venue article", () => {
  const venueSlug = "private-event-and-production-venue";
  const venueArticle = getNewsBySlug(venueSlug)!;
  const activityItems = [
    "💍 浪漫求婚",
    "👭 閨蜜同遊",
    "🥂 婚前單身派對",
    "👶 寶寶抓周",
    "🩵🩷 寶寶性別揭曉派對",
    "🎎 迎娶與婚禮儀式",
    "👨‍👩‍👧‍👦 家族聚會",
    "🎉 公司尾牙與團隊活動",
    "💼 包棟商務會議",
    "📷 人像、商品及品牌形象攝影",
    "🎬 MV、廣告與微電影拍攝",
  ];

  beforeEach(() => { vi.stubGlobal("React", React); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("uses the approved data, case-sensitive image path and SEO metadata", () => {
    expect(venueArticle.id).toBe(7);
    expect(venueArticle.title).toBe("慢慢蒔光，不只是一間民宿");
    expect(venueArticle.date).toBe("2026.09.15");
    expect(venueArticle.excerpt).toBe("一座可以過夜的當代藝術館，也能成為求婚、抓周、婚禮儀式、品牌攝影、商務會議與影像創作等重要時刻的專屬場景。");
    expect(venueArticle.image).toBe("/images/News/News-7.jpg");
    expect(venueArticle.seoTitle).toBe("慢慢蒔光，不只是一間民宿｜宜蘭包棟・包場・攝影場地｜STime Villa");
    expect(venueArticle.seoDescription).toBe("慢慢蒔光是一座可以過夜的當代藝術館，提供宜蘭包棟、求婚、抓周、迎娶、商務會議、品牌攝影、MV 與微電影拍攝等多元包場需求，每日僅接待一組旅客。");
    const image = readFileSync(new URL("../../public/images/News/News-7.jpg", import.meta.url));
    expect(Array.from(image.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it("renders the lead, editorial copy, activity grid, venue facts, notice and official LINE link", () => {
    const html = renderDetail(venueSlug);
    const orderedContent = [
      venueArticle.detailTitle,
      ...venueArticle.content,
      venueArticle.highlights!.title,
      ...activityItems,
      ...venueArticle.postContent!,
      ...venueArticle.infoLines!,
      venueArticle.notice!,
      `${venueArticle.contact!.text}<a`,
      venueArticle.contact!.label,
    ];
    let previous = html.indexOf(venueArticle.title);
    for (const text of orderedContent) {
      const position = html.indexOf(text, previous + 1);
      expect(position, text).toBeGreaterThan(previous);
      previous = position;
    }
    expect(venueArticle.highlights!.items).toEqual(activityItems);
    expect(html.match(/<li\b/g)).toHaveLength(11);
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain('aria-label="場地資訊"');
    expect(html).toContain('href="https://lin.ee/u3JpTa6"');
    expect(html).toContain('target="_blank"');
  });

  it("uses the same unframed cover treatment as News-6 without changing framed articles", () => {
    const html = renderDetail(venueSlug);
    expect(html).toContain('src="/images/News/News-7.jpg"');
    expect(html).toContain("object-contain");
    expect(html).toContain("max-w-[900px]");
    expect(html).toContain("rounded-[4px]");
    expect(html).not.toContain("bg-[#fbf7f1]");
    expect(html).not.toContain("shadow-[0_16px_44px_rgba(90,70,50,0.08)]");
  });

  it("appears on the first News page after the 2026.11 article under existing sorting", () => {
    const html = renderToStaticMarkup(<Router ssrPath="/news"><NewsPage /></Router>);
    expect(html).toContain(`href="/news/${venueSlug}"`);
    expect(html).toContain(venueArticle.title);
    expect(html).toContain(venueArticle.excerpt);
    expect(html).toContain(`src="${venueArticle.image}"`);
    expect(html.match(/<article\b/g)).toHaveLength(6);
    expect(html.indexOf(article.title)).toBeLessThan(html.indexOf(venueArticle.title));
    expect(html.indexOf(venueArticle.title)).toBeLessThan(html.indexOf(getNewsBySlug("mumbao-ip-copyright")!.title));
  });

  it("keeps the seventh and oldest article reachable on the existing second page", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/news" ssrSearch="?page=2"><NewsPage /></Router>,
    );
    expect(html.match(/<article\b/g)).toHaveLength(1);
    expect(html).toContain("慢慢蒔光官網資訊陸續更新");
    expect(html).toContain("2 / 2");
  });
});
