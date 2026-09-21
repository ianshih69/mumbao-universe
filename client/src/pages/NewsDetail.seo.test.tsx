import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNewsBySlug, newsItems } from "@/data/news";
import NewsDetail from "./NewsDetail";

const effects = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => unknown) => { effects.push(effect); },
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));

// Execute the real component's metadata effects against a persistent head.
// Browser verification separately covers the production build's actual DOM.
class HeadElement {
  name = "";
  content = "";
  rel = "";
  href = "";
  id = "";
  type = "";
  textContent = "";
  attributes: Record<string, string> = {};
  constructor(public tag: string, private elements: HeadElement[]) {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  remove() {
    const index = this.elements.indexOf(this);
    if (index !== -1) this.elements.splice(index, 1);
  }
  matches(selector: string) {
    const match = selector.match(/^(meta|link)\[(name|property|rel)="([^"]+)"\]$/);
    if (!match) throw new Error(`Unsupported head selector: ${selector}`);
    const value = match[2] === "property" ? this.attributes.property
      : match[2] === "name" ? this.name : this.rel;
    return this.tag === match[1] && value === match[3];
  }
}

function createHeadDocument() {
  const elements: HeadElement[] = [];
  return {
    title: "",
    head: {
      appendChild: (element: HeadElement) => { elements.push(element); return element; },
      querySelector: (selector: string) => elements.find((element) => element.matches(selector)) ?? null,
      querySelectorAll: (selector: string) => elements.filter((element) => element.matches(selector)),
    },
    createElement: (tag: string) => new HeadElement(tag, elements),
    getElementById: (id: string) => elements.find((element) => element.id === id) ?? null,
  };
}

const target = "stime-villa-summer-preview-preparation";
const targetUrl = `https://www.mumbao.tw/news/${target}`;
let headDocument: ReturnType<typeof createHeadDocument>;

function visit(slug: string) {
  renderToStaticMarkup(<Router ssrPath={`/news/${slug}`}><NewsDetail /></Router>);
  for (const effect of effects.splice(0)) effect();
}

function expectArticleMetadata(slug: string) {
  const news = getNewsBySlug(slug)!;
  const title = news.seoTitle ?? `${news.title}｜最新消息｜慢慢蒔光 STime Villa`;
  const description = news.seoDescription ?? news.excerpt;
  const url = `https://www.mumbao.tw/news/${slug}`;
  expect(headDocument.title).toBe(title);
  expect(headDocument.head.querySelector('meta[name="description"]')?.content).toBe(description);
  expect(headDocument.head.querySelectorAll('meta[name="robots"]')).toHaveLength(0);
  expect(headDocument.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  expect(headDocument.head.querySelector('link[rel="canonical"]')?.href).toBe(url);
  for (const prefix of ["og", "twitter"]) {
    for (const [field, value] of Object.entries({ title, description, url })) {
      const selector = `meta[property="${prefix}:${field}"]`;
      expect(headDocument.head.querySelectorAll(selector)).toHaveLength(1);
      expect(headDocument.head.querySelector(selector)?.content).toBe(value);
    }
  }
}

function expectNotFoundMetadata() {
  expect(headDocument.title).toBe("找不到這篇最新消息｜慢慢蒔光 STime Villa");
  expect(headDocument.head.querySelector('meta[name="description"]')?.content).toBe("找不到這篇最新消息。");
  expect(headDocument.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
  expect(headDocument.head.querySelector('meta[name="robots"]')?.content).toBe("noindex,follow");
  expect(headDocument.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(0);
  expect(headDocument.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(0);
  expect(headDocument.head.querySelectorAll('meta[property="twitter:url"]')).toHaveLength(0);
  expect(headDocument.getElementById("news-article-json-ld")).toBeNull();
}

describe("News detail metadata transitions", () => {
  beforeEach(() => {
    headDocument = createHeadDocument();
    effects.length = 0;
    vi.stubGlobal("React", React);
    vi.stubGlobal("document", headDocument);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(newsItems.map((news) => news.slug))("allows indexing for valid article %s", (slug) => {
    visit(slug);
    expectArticleMetadata(slug);
  });

  it("keeps unknown articles noindex", () => {
    visit("nonexistent-seo-regression");
    expectNotFoundMetadata();
  });

  it("clears stale noindex on unknown -> valid routes", () => {
    visit("nonexistent-seo-regression");
    expectNotFoundMetadata();
    visit(target);
    expectArticleMetadata(target);
  });

  it("adds noindex and removes article metadata on valid -> unknown routes", () => {
    visit("mumbao-ip-copyright");
    expectArticleMetadata("mumbao-ip-copyright");
    visit("nonexistent-seo-regression");
    expectNotFoundMetadata();
  });

  it("replaces metadata across article routes without stale robots or JSON-LD", () => {
    for (const slug of ["mumbao-ip-copyright", target, "private-event-and-production-venue"]) {
      visit(slug);
      expectArticleMetadata(slug);
      const jsonLd = headDocument.getElementById("news-article-json-ld");
      if (slug === target) expect(jsonLd).toBeNull();
      else expect(JSON.parse(jsonLd!.textContent).mainEntityOfPage["@id"])
        .toBe(`https://www.mumbao.tw/news/${slug}`);
    }
  });
});

describe("News sitemap", () => {
  it("is valid XML and includes the public article exactly once", () => {
    const xml = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");
    expect(XMLValidator.validate(xml)).toBe(true);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    expect(parsed.urlset["@_xmlns"]).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");
    const urls = parsed.urlset.url.map((entry: { loc: string }) => entry.loc) as string[];
    expect(urls.filter((url) => url === targetUrl)).toHaveLength(1);
    expect(new Set(urls).size).toBe(urls.length);
    for (const value of urls) {
      const url = new URL(value);
      expect(url.origin).toBe("https://www.mumbao.tw");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(url.pathname).not.toMatch(/^\/(admin|checkout|cart|order-complete)(\/|$)/);
    }
  });
});
