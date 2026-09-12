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
    expect(newsItems).toHaveLength(5);
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
    expect(html.match(/<article\b/g)).toHaveLength(5);
    expect(html.indexOf(title)).toBeLessThan(html.indexOf(newsItems[1].title));
  });

  it.each(newsItems.filter((item) => item.id !== 5))(
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
