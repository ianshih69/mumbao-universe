import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newsItems, getNewsBySlug } from "@/data/news";
import { News } from "@/components/sections/News";
import { getPublicPageSeo } from "@/lib/publicPageSeo";
import { renderPageHtml } from "../../scripts/prerender.mjs";
import NewsPage from "./News";
import NewsDetail from "./NewsDetail";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));

const slug = "mumbao-universe-goes-global";
const pathname = `/news/${slug}`;
const title = "從宜蘭出發，讓慢寶宇宙一步步走向世界";
const paragraphs = [
  "這幾天，慢慢蒔光又收到一份值得紀念的文件——來自日本文化廳的著作權登記。",
  "從美國、中國的著作權登記，到台灣公證，再到這次的日本，每一步，都是我們認真守護原創的足跡。",
  "對我們來說，這些文件背後，是無數次的畫稿修改、角色調整，以及把想像一點一點變成現實的日子。",
  "從慢寶頭上的小愛心，到陪你坐下的雲朵沙發；從畫裡的星座故事，到可以真正走進去的房間，我們一直努力把「慢寶宇宙」帶進現實。",
  "慢慢蒔光顛覆傳統旅宿的想像，讓住宿也能成為一場走進原創藝術的美學體驗療癒旅程。",
  "讓你在雲朵、色彩與故事之間，放下緊繃的肩膀，找回那個還會做夢、還會被小事感動的自己。",
  "謝謝每一位喜歡慢寶、支持慢慢蒔光的人。",
  "這個從宜蘭長出來的小小宇宙，正帶著你們的喜歡，慢慢走向更遠的地方。",
];
const article = getNewsBySlug(slug)!;

describe("News-8 approved article", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());

  it("retains every approved character and the exact excerpt", () => {
    expect(article).toMatchObject({ id: 8, title, date: "2026.10.09", category: "NEWS" });
    expect(article.content).toEqual(paragraphs);
    expect(article.excerpt).toBe(paragraphs[0]);
    expect(article.detailTitle).toBeUndefined();
    expect(article.highlights).toBeUndefined();
    expect(article.contact).toBeUndefined();
  });

  it("renders one H1 and all paragraphs exactly once without invented headings", () => {
    const html = renderToStaticMarkup(<Router ssrPath={pathname}><NewsDetail /></Router>);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.split(title)).toHaveLength(2);
    expect(html.match(/<p\b/g)).toHaveLength(8);
    let previous = -1;
    for (const paragraph of paragraphs) {
      const index = html.indexOf(paragraph);
      expect(index).toBeGreaterThan(previous);
      expect(html.split(paragraph)).toHaveLength(2);
      previous = index;
    }
    expect(html).not.toMatch(/<h[2-6]\b|<strong\b|<br\b/);
    expect(html).toContain("object-contain");
    expect(html).toContain("leading-[2.05]");
    expect(html).toContain("md:leading-[2.15]");
    expect(html).toContain("space-y-6");
    expect(html).not.toContain("rounded-");
  });

  it("keeps the approved JPEG bytes, with no derivative filename", () => {
    expect(article.image).toBe("/images/News/News-8.jpg");
    const bytes = readFileSync(new URL("../../public/images/News/News-8.jpg", import.meta.url));
    expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
    expect(bytes.length).toBe(891328);
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("556f537bbfcf9ae141008d43865a71ddc0a80a284cefb7fa9831d6a1298af152");
  });

  it("is first on News and becomes the homepage default feature", () => {
    expect(newsItems[0]).toBe(article);
    const html = renderToStaticMarkup(<Router ssrPath="/news"><NewsPage /></Router>);
    expect(html.indexOf(`href="${pathname}"`)).toBeLessThan(
      html.indexOf('href="/news/private-event-and-production-venue"'),
    );
    expect(html.indexOf(title)).toBeLessThan(html.indexOf(newsItems[2].title));
    expect(html).toContain(article.excerpt);
    const home = renderToStaticMarkup(<Router ssrPath="/"><News /></Router>);
    expect(home.indexOf(title)).toBeLessThan(home.indexOf(newsItems[1].title));
    expect(home).toContain('src="/images/News/News-8.jpg"');
  });

  it("keeps all seven older articles reachable across pagination", () => {
    expect(newsItems.filter(item => item.id !== 8).map(item => item.id)).toEqual([7, 6, 5, 1, 2, 3, 4]);
    const pages = ["", "?page=2"].map(search => renderToStaticMarkup(
      <Router ssrPath="/news" ssrSearch={search}><NewsPage /></Router>,
    )).join("");
    for (const item of newsItems) {
      expect(pages.split(`href="/news/${item.slug}"`)).toHaveLength(2);
      expect(getNewsBySlug(item.slug)).toBe(item);
    }
  });

  it("includes canonical, title, description and image in initial HTML", () => {
    const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const seo = getPublicPageSeo(pathname)!;
    const html = renderPageHtml(template, {
      ...seo, pathname,
      body: renderToStaticMarkup(<Router ssrPath={pathname}><NewsDetail /></Router>),
    });
    expect(html).toContain(`<title>${article.seoTitle}</title>`);
    expect(html).toContain(`rel="canonical" href="https://www.mumbao.tw${pathname}"`);
    for (const prefix of ["og", "twitter"]) {
      expect(html).toContain(`property="${prefix}:image" content="https://www.mumbao.tw/images/News/News-8.jpg"`);
    }
    expect(html).toContain(`content="${paragraphs[0]}"`);
  });
});
