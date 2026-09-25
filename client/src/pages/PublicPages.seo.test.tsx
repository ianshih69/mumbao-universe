import React from "react";
import { readFileSync } from "node:fs";
import { parse } from "parse5";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPublicPageSeo, prerenderPaths } from "@/lib/publicPageSeo";
import { getRoomBySlug } from "@/data/rooms";
import { renderPageHtml } from "../../scripts/prerender.mjs";

const template = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8"
);
const sitemap = readFileSync(
  new URL("../../public/sitemap.xml", import.meta.url),
  "utf8"
);
const expected = [
  ["/mumbao", "認識慢寶｜MUMBAO", "認識慢寶"],
  [
    "/rooms",
    "房型介紹｜十二星座主題房・宜蘭員山｜慢慢蒔光 STime Villa",
    "房型介紹",
  ],
  [
    "/rooms/room-360-senguang",
    "畫雲 S360｜ROOM S360｜慢慢蒔光 STime Villa",
    "畫雲 S360",
  ],
  [
    "/rooms/room-530-nuanjin",
    "雲間 S530｜ROOM S530｜慢慢蒔光 STime Villa",
    "雲間 S530",
  ],
  [
    "/rooms/room-666-anhe",
    "牧雲 S666｜ROOM S666｜慢慢蒔光 STime Villa",
    "牧雲 S666",
  ],
  [
    "/rooms/room-888-xinghuo",
    "雲容 S888｜ROOM S888｜慢慢蒔光 STime Villa",
    "雲容 S888",
  ],
];
let pages: ReturnType<typeof import("../prerender").renderPublicPages>;
beforeAll(async () => {
  vi.stubGlobal("React", React);
  const { renderPublicPages } = await import("../prerender");
  pages = renderPublicPages();
});
afterAll(() => vi.unstubAllGlobals());

describe.each(expected)("public HTML %s", (pathname, title, h1) => {
  it("uses the existing route metadata, not homepage metadata", () => {
    expect(getPublicPageSeo(pathname)).toMatchObject({
      title,
      canonical: `https://www.mumbao.tw${pathname}`,
    });
  });
  it("renders the real component body with one H1 and no hidden initial text", () => {
    const page = pages.find(entry => entry.pathname === pathname)!;
    expect(page.body.match(/<h1\b/g)).toHaveLength(1);
    expect(page.body).toContain(h1);
    expect(page.body).not.toContain("opacity:0");
    expect(page.body).toContain('href="/mumbao"');
    if (pathname.startsWith("/rooms/")) {
      const room = getRoomBySlug(pathname.slice(7))!;
      expect(page.body).toContain(room.roomNumber);
      for (const paragraph of room.intro)
        expect(page.body).toContain(paragraph);
    }
    if (pathname === "/rooms") {
      for (const [route] of expected.slice(2))
        expect(page.body).toContain(`href="${route}"`);
    }
  });
  it("emits parseable HTML with page-specific metadata and hydration marker", () => {
    const page = pages.find(entry => entry.pathname === pathname)!;
    const html = renderPageHtml(template, page);
    expect(parse(html).nodeName).toBe("#document");
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`content="${page.description}"`);
    expect(html).toContain(`rel="canonical" href="${page.canonical}"`);
    expect(html).toContain('data-prerendered="true"');
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
    expect(html).toContain(h1);
  });
  it("has exactly one matching sitemap URL", () => {
    expect(
      sitemap.split(`<loc>https://www.mumbao.tw${pathname}</loc>`)
    ).toHaveLength(2);
  });
});

it("only prerenders the six approved paths, not News, booking, or missing rooms", () => {
  expect([...prerenderPaths]).toEqual(expected.map(([pathname]) => pathname));
  expect(getPublicPageSeo("/rooms/not-a-room")).toBeUndefined();
  expect(
    getPublicPageSeo("/news/stime-villa-summer-preview-preparation")
  ).toBeUndefined();
  expect(getPublicPageSeo("/booking")).toBeUndefined();
});

it("fails the build rather than silently emitting an app shell", () => {
  expect(() => renderPageHtml(template, { ...pages[0], body: "" })).toThrow(
    "Missing H1"
  );
  expect(() => renderPageHtml("<html></html>", pages[0])).toThrow(
    "missing required markup"
  );
});

describe("Vercel nested prerender routing", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")
  );
  const rewrites: { source: string; destination: string }[] = config.rewrites;
  const fallbackIndex = rewrites.findIndex(
    route => route.source === "/((?!api(?:/|$)).*)"
  );

  it.each(expected.slice(2))(
    "explicitly serves %s before the SPA fallback",
    pathname => {
      const index = rewrites.findIndex(route => route.source === pathname);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallbackIndex);
      expect(rewrites[index].destination).toBe(`${pathname}/index.html`);
    }
  );

  it("keeps missing rooms and unrelated pages on the existing SPA fallback", () => {
    expect(rewrites[fallbackIndex]).toEqual({
      source: "/((?!api(?:/|$)).*)",
      destination: "/index.html",
    });
    expect(rewrites.filter(route => route.source.startsWith("/rooms"))).toEqual(
      expected.slice(2).map(([pathname]) => ({
        source: pathname,
        destination: `${pathname}/index.html`,
      }))
    );
    expect(rewrites.slice(0, 2)).toEqual([
      { source: "/api/admin-ai-quality", destination: "/api/ai-quality" },
      { source: "/api/ai-quality-feedback", destination: "/api/ai-quality" },
    ]);
  });
});
