import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Facilities from "./Facilities";
import { facilitiesContent as copy } from "@/data/facilitiesContent";
import { facilitiesAlbums, facilitiesAlbumSelection, facilitiesPhoto } from "@/data/facilitiesGallery";
import { parse } from "parse5";

const viewport = vi.hoisted(() => ({ height: null as number | null }));
vi.mock("@/hooks/useMobileViewportHeight", () => ({
  useMobileViewportHeight: () => viewport.height,
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));

const stylesheet = postcss.parse(readFileSync(new URL("./Facilities.module.css", import.meta.url), "utf8"));
const render = () => renderToStaticMarkup(<Router ssrPath="/facilities"><Facilities /></Router>);

describe("Facilities hero viewport contract", () => {
  beforeEach(() => {
    viewport.height = null;
    // The Node Vitest config uses classic JSX, unlike the app's React Vite plugin.
    vi.stubGlobal("React", React);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps the CSS fallback before Home's shared viewport hook is ready", () => {
    expect(render()).not.toContain('style="--facilities-hero-height:');
  });

  it.each([812, 844, 932])("uses 80 percent of the shared viewport snapshot (%i)", (height) => {
    viewport.height = height;
    expect(render()).toContain(`style="--facilities-hero-height:${height * 0.8}px"`);
  });

  it("limits the snapshot override to mobile and preserves desktop height and the minimum", () => {
    const heights: { media: string | null; property: string; value: string }[] = [];
    stylesheet.walkRules(".hero", (rule) => {
      rule.walkDecls(/^(min-)?height$/, (declaration) => {
        heights.push({
          media: rule.parent?.type === "atrule" ? rule.parent.params : null,
          property: declaration.prop,
          value: declaration.value,
        });
      });
    });
    expect(heights).toEqual([
      { media: null, property: "height", value: "min(80svh, 820px)" },
      { media: null, property: "min-height", value: "460px" },
      { media: "(max-width: 767px)", property: "height", value: "min(var(--facilities-hero-height, 80svh), 820px)" },
    ]);
  });

  it("reserves hero image dimensions and loads only the hero eagerly", () => {
    const images = render().match(/<img\b[^>]*>/g) ?? [];
    expect(images).toHaveLength(11);
    expect(images[0]).toContain('src="/images/public/pub-5.webp"');
    expect(images[0]).toContain('width="3452" height="2847"');
    expect(images[0]).toContain('loading="eager"');
    expect(images[0]).toContain('fetchPriority="high"');
    images.slice(1).forEach((image) => expect(image).toContain('loading="lazy"'));
  });

  it("uses one responsive hero, not two hidden images or unconditional image preloads", () => {
    const html = render();
    expect(html).toContain('<source media="(max-width: 767px)" srcSet="/images/public/pub-4.webp" width="3258" height="4344"');
    expect(html.match(/<picture>/g)).toHaveLength(1);
    expect(html).not.toContain('rel="preload"');
  });

  it("shows only the ten approved body photos, without closed album images or old content photos", () => {
    const html = render();
    const sources = Array.from(html.matchAll(/<img[^>]+src="([^"]+)"/g), match => match[1]);
    expect(sources).toEqual([5, 2, 24, 8, 20, 23, 14, 1, 6, 3, 13].map(id => `/images/public/pub-${id}.webp`));
    expect(html).not.toContain('role="dialog"');
    for (const old of ["aboutMe-4.jpg", "aboutMumbao-1.jpg", "aboutMe-3.jpg", "S530.jpg"]) expect(html).not.toContain(old);
    expect(readFileSync(new URL("./Facilities.module.css", import.meta.url), "utf8")).not.toContain("url(");
  });

  it("renders every approved original copy block and condition, with all five chapters and the same booking destination", () => {
    const html = render();
    function text(node: any): string {
      return node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
    }
    const body = text(parse(html));
    for (const value of [copy.label, copy.brand, copy.title, ...copy.intro, copy.closing]) expect(body).toContain(value);
    for (const chapter of copy.chapters) {
      const title = chapter.title.slice(chapter.title.indexOf(" ") + 1);
      expect(body).toContain(title);
      expect(html).toContain(`aria-labelledby="${chapter.id}-title"`);
      for (const feature of chapter.features) {
        expect(body).toContain(feature.title);
        for (const paragraph of feature.paragraphs) expect(body).toContain(paragraph);
      }
    }
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="/booking"');
    expect(body).toContain("立即預約");
  });

  it("offers all five album entries without changing metadata or the existing SEO share image", () => {
    const html = render();
    for (const label of ["查看公共空間照片 · 24張", "查看客廳照片 · 7張", "查看藝術與陳設 · 9張", "查看餐廚照片 · 4張", "查看館內角落 · 4張"]) expect(html).toContain(label);
    const source = readFileSync(new URL("./Facilities.tsx", import.meta.url), "utf8");
    expect(source).toContain('const title = "館內設施｜慢慢蒔光 STime Villa"');
    expect(source).toContain('const url = "https://www.mumbao.tw/facilities"');
    expect(source).toContain('const photo = "https://www.mumbao.tw/images/aboutMe/aboutMe-4.jpg"');
    expect(source).toContain('["name", "description", copy.intro[0]]');
  });

  it("puts one visible album hint inside the last existing photo button of each group", () => {
    const buttons: any[] = [];
    const visit = (node: any) => {
      if (node.tagName === "button") buttons.push(node);
      for (const child of node.childNodes ?? []) visit(child);
    };
    const attr = (node: any, name: string) => node.attrs?.find((item: any) => item.name === name)?.value;
    const text = (node: any): string => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
    visit(parse(render()));
    const photoButtons = buttons.filter(button => attr(button, "aria-label")?.includes("放大照片："));
    expect(photoButtons).toHaveLength(10);
    const hinted = photoButtons.filter(button => text(button).includes("查看全部"));
    expect(hinted).toHaveLength(Object.keys(facilitiesAlbums).length);
    Object.entries(facilitiesAlbums).forEach(([album, data], index) => {
      const count = facilitiesAlbumSelection(album as keyof typeof facilitiesAlbums).images.length;
      const photo = facilitiesPhoto(data.featured[data.featured.length - 1]);
      expect(text(hinted[index])).toBe(`查看全部 ${count} 張照片`);
      expect(attr(hinted[index], "aria-label")).toBe(`查看全部 ${count} 張照片；放大照片：${photo.alt}`);
      expect(attr(hinted[index].childNodes.find((child: any) => child.tagName === "img"), "src")).toBe(photo.src);
      expect(hinted[index].childNodes.some((child: any) => child.tagName === "button" || child.tagName === "a")).toBe(false);
    });
  });
});
