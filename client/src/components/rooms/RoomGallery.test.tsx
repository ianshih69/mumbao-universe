import React from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { parse } from "parse5";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { s521Gallery } from "@/data/s521Gallery";
import { s888Gallery } from "@/data/s888Gallery";
import { s360Gallery } from "@/data/s360Gallery";
import { s530Gallery } from "@/data/s530Gallery";
import { rooms } from "@/data/rooms";
import { RoomGallery } from "./RoomGallery";
import RoomDetail from "@/pages/RoomDetail";
import RoomsPage from "@/pages/Rooms";
import { Rooms as HomeRooms } from "@/components/sections/Rooms";
import { getRoomSeo } from "@/lib/publicPageSeo";

vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function elements(html: string, tag: string): Array<Record<string, string>> {
  const found: Array<Record<string, string>> = [];
  function walk(node: any) {
    if (node.tagName === tag) found.push(Object.fromEntries(node.attrs.map((a: any) => [a.name, a.value])));
    for (const child of node.childNodes || []) walk(child);
  }
  walk(parse(html));
  return found;
}

describe("Room editorial photo collections", () => {
  it("preserves the exact 12-photo editorial sequence, not numeric order", () => {
    expect(s521Gallery.map(image => image.src)).toEqual([3, 11, 4, 5, 6, 1, 2, 12, 8, 7, 9, 10]
      .map(n => `/images/Room/S521/S521-${n}.webp`));
    expect(new Set(s521Gallery.map(image => image.alt)).size).toBe(12);
  });
  it.each([...s521Gallery, ...s888Gallery, ...s360Gallery, ...s530Gallery])("matches actual WebP dimensions for $src", image => {
    const bytes = readFileSync(new URL(`../../../public${image.src}`, import.meta.url));
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    let dimensions: number[] = [];
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (type === "VP8X") { dimensions = [1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3)]; break; }
      if (type === "VP8 ") { dimensions = [bytes.readUInt16LE(start + 6) & 16383, bytes.readUInt16LE(start + 8) & 16383]; break; }
      if (type === "VP8L") { const value = bytes.readUInt32LE(start + 1); dimensions = [(value & 16383) + 1, ((value >>> 14) & 16383) + 1]; break; }
      offset = start + size + size % 2;
    }
    expect(dimensions).toEqual([image.width, image.height]);
  });
});

describe("RoomGallery initial output", () => {
  const render = () => renderToStaticMarkup(<RoomGallery images={s521Gallery} roomName="雲心 S521" />);
  it("prioritizes only S521-3, reserves its real dimensions and starts at 1 / 12", () => {
    const html = render(), images = elements(html, "img");
    expect(images[0]).toMatchObject({ src: s521Gallery[0].src, width: "2196", height: "2896", loading: "eager", fetchpriority: "high", decoding: "async" });
    expect(images.filter(image => image.loading === "eager")).toHaveLength(1);
    expect(html).toContain("1 / 12");
  });
  it("keeps initial thumbnail sources bounded and lazy, with no closed lightbox images", () => {
    const html = render(), images = elements(html, "img");
    expect(images).toHaveLength(7);
    expect(new Set(images.map(image => image.src)).size).toBe(6);
    expect(images.slice(1).every(image => image.loading === "lazy" && image.decoding === "async")).toBe(true);
    expect(elements(html, "div").some(element => element.role === "dialog")).toBe(false);
  });
  it("provides all ordered thumbnail controls, selected state, and labeled arrows", () => {
    const buttons = elements(render(), "button");
    const thumbs = buttons.filter(button => button["aria-label"]?.startsWith("第 "));
    expect(thumbs.map(button => button["aria-label"])).toEqual(s521Gallery.map((image, i) => `第 ${i + 1} 張：${image.alt}`));
    expect(thumbs.filter(button => button["aria-pressed"] === "true")).toHaveLength(1);
    expect(buttons.some(button => button["aria-label"] === "上一張照片")).toBe(true);
    expect(buttons.some(button => button["aria-label"] === "下一張照片")).toBe(true);
  });
});

describe("Room detail isolation", () => {
  it("replaces only the S521 detail image, before the unchanged story", () => {
    const room = rooms.find(room => room.roomNumber === "S521")!;
    const html = renderToStaticMarkup(<Router ssrPath={`/rooms/${room.slug}`}><RoomDetail /></Router>);
    expect(html).not.toContain('src="/images/Room/S521.jpg"');
    expect(html).toContain(s521Gallery[0].src);
    expect(html).toContain(room.name);
    expect(html).toContain(room.subtitle);
    for (const paragraph of room.intro) expect(html).toContain(paragraph);
    expect(html.indexOf(s521Gallery[0].src, html.indexOf("<main"))).toBeLessThan(html.indexOf(room.intro[0]));
    expect(room.image).toBe(s521Gallery[0].src);
    expect(html).not.toContain("房型設備、入住人數、床型與實際配置");
    expect(html).not.toContain("慢慢蒔光每一間房都有不同主題與氛圍");
    expect(elements(html, "section").some(section => section.class?.includes("bg-white/55"))).toBe(false);
    expect(html).toContain("Back / 回房型介紹");
  });
  it.each(rooms.filter(room => !["S521", "S888", "S360", "S530"].includes(room.roomNumber)))("leaves $roomNumber on its original photo", room => {
    const html = renderToStaticMarkup(<Router ssrPath={`/rooms/${room.slug}`}><RoomDetail /></Router>);
    expect(html).toContain(`src="${room.image}"`);
    expect(html).not.toContain("/images/Room/S521/");
    expect(html).toContain("房型設備、入住人數、床型與實際配置");
    for (const paragraph of room.intro) expect(html).toContain(paragraph);
  });
});

describe("S521 card previews", () => {
  it.each([
    ["homepage carousel", HomeRooms],
    ["rooms listing", RoomsPage],
  ] as const)("uses the gallery cover and focal point in %s without changing other cards", (_, Component) => {
    const html = renderToStaticMarkup(<Router ssrPath="/rooms"><Component /></Router>);
    const images = elements(html, "img");
    expect(images.filter(image => image.src === s521Gallery[0].src)).toHaveLength(1);
    expect(images.find(image => image.src === s521Gallery[0].src)).toMatchObject({ style: "object-position:50% 45%" });
    expect(html).not.toContain('src="/images/Room/S521.jpg"');
    for (const room of rooms) {
      expect(html).toContain(room.name);
      expect(html).toContain(`/rooms/${room.slug}`);
      if (room.roomNumber !== "S521") {
        expect(images.find(image => image.src === room.image)?.style).toBe(
          room.imagePosition ? `object-position:${room.imagePosition}` : undefined,
        );
        expect(html).toContain(`src="${room.image}"`);
      }
    }
  });
});

describe("S530 gallery integration", () => {
  it("preserves all nine photos in the approved editorial sequence", () => {
    expect(s530Gallery.map(image => image.src)).toEqual([8, 3, 7, 1, 4, 5, 2, 6, 9]
      .map(n => `/images/Room/S530/S530-${n}.webp`));
    expect(new Set(s530Gallery.map(image => image.alt)).size).toBe(9);
  });
  it("prioritizes only S530-8 with bounded lazy thumbnails and ordered controls", () => {
    const html = renderToStaticMarkup(<RoomGallery images={s530Gallery} roomName="雲間 S530" lightboxTheme="cream" />);
    const images = elements(html, "img");
    expect(images[0]).toMatchObject({ src: s530Gallery[0].src, width: "2172", height: "2896", loading: "eager", fetchpriority: "high", decoding: "async" });
    expect(images.filter(image => image.loading === "eager")).toHaveLength(1);
    expect(images).toHaveLength(7);
    expect(new Set(images.map(image => image.src)).size).toBe(6);
    expect(images.slice(1).every(image => image.loading === "lazy" && image.decoding === "async")).toBe(true);
    expect(html).toContain("1 / 9");
    expect(elements(html, "button").filter(button => button["aria-label"]?.startsWith("第 "))
      .map(button => button["aria-label"])).toEqual(s530Gallery.map((image, i) => `第 ${i + 1} 張：${image.alt}`));
  });
  it("keeps the existing route, metadata and story without the entire white notice", () => {
    const room = rooms.find(room => room.roomNumber === "S530")!;
    const html = renderToStaticMarkup(<Router ssrPath="/rooms/room-530-nuanjin"><RoomDetail /></Router>);
    expect(room.slug).toBe("room-530-nuanjin");
    expect(room.image).toBe(s530Gallery[0].src);
    expect(html).not.toContain('src="/images/Room/S530.jpg"');
    expect(html).toContain(s530Gallery[0].src);
    expect(html).toContain(room.name);
    expect(html).toContain(room.subtitle);
    for (const paragraph of room.intro) expect(html).toContain(paragraph);
    expect(html.indexOf(s530Gallery[0].src, html.indexOf("<main"))).toBeLessThan(html.indexOf(room.intro[0]));
    expect(html).not.toContain("房型設備、入住人數、床型與實際配置");
    expect(html).not.toContain("慢慢蒔光每一間房都有不同主題與氛圍");
    expect(elements(html, "section").some(section => section.class?.includes("bg-white/55"))).toBe(false);
    expect(html).toContain("Back / 回房型介紹");
    expect(getRoomSeo(room.slug)).toMatchObject({
      title: "雲間 S530｜ROOM S530｜慢慢蒔光 STime Villa",
      canonical: "https://www.mumbao.tw/rooms/room-530-nuanjin",
    });
  });
  it.each([
    ["homepage carousel", HomeRooms],
    ["rooms listing", RoomsPage],
  ] as const)("uses S530-8 with its focal point in %s and preserves earlier covers", (_, Component) => {
    const html = renderToStaticMarkup(<Router ssrPath="/rooms"><Component /></Router>);
    const images = elements(html, "img");
    for (const gallery of [s530Gallery, s360Gallery, s521Gallery, s888Gallery]) {
      expect(images.filter(image => image.src === gallery[0].src)).toHaveLength(1);
    }
    expect(images.find(image => image.src === s530Gallery[0].src)?.style).toBe("object-position:50% 70%");
    expect(html).not.toContain('src="/images/Room/S530.jpg"');
    expect(html).toContain("/rooms/room-530-nuanjin");
  });
});

describe("S360 gallery integration", () => {
  it("preserves all nine photos in the approved editorial sequence", () => {
    expect(s360Gallery.map(image => image.src)).toEqual([1, 6, 3, 4, 2, 5, 8, 7, 9]
      .map(n => `/images/Room/S360/S360-${n}.webp`));
    expect(new Set(s360Gallery.map(image => image.alt)).size).toBe(9);
  });
  it("prioritizes only the first cover with bounded lazy thumbnails and ordered controls", () => {
    const html = renderToStaticMarkup(<RoomGallery images={s360Gallery} roomName="畫雲 S360" lightboxTheme="cream" />);
    const images = elements(html, "img");
    expect(images[0]).toMatchObject({ src: s360Gallery[0].src, width: "2896", height: "2172", loading: "eager", fetchpriority: "high", decoding: "async" });
    expect(images.filter(image => image.loading === "eager")).toHaveLength(1);
    expect(images).toHaveLength(7);
    expect(new Set(images.map(image => image.src)).size).toBe(6);
    expect(images.slice(1).every(image => image.loading === "lazy" && image.decoding === "async")).toBe(true);
    expect(html).toContain("1 / 9");
    expect(elements(html, "button").filter(button => button["aria-label"]?.startsWith("第 "))
      .map(button => button["aria-label"])).toEqual(s360Gallery.map((image, i) => `第 ${i + 1} 張：${image.alt}`));
  });
  it("keeps the existing route, metadata and story without the entire white notice", () => {
    const room = rooms.find(room => room.roomNumber === "S360")!;
    const html = renderToStaticMarkup(<Router ssrPath="/rooms/room-360-senguang"><RoomDetail /></Router>);
    expect(room.slug).toBe("room-360-senguang");
    expect(room.image).toBe(s360Gallery[0].src);
    expect(html).not.toContain('src="/images/Room/S360.jpg"');
    expect(html).toContain(s360Gallery[0].src);
    expect(html).toContain(room.name);
    expect(html).toContain(room.subtitle);
    for (const paragraph of room.intro) expect(html).toContain(paragraph);
    expect(html.indexOf(s360Gallery[0].src, html.indexOf("<main"))).toBeLessThan(html.indexOf(room.intro[0]));
    expect(html).not.toContain("房型設備、入住人數、床型與實際配置");
    expect(html).not.toContain("慢慢蒔光每一間房都有不同主題與氛圍");
    expect(elements(html, "section").some(section => section.class?.includes("bg-white/55"))).toBe(false);
    expect(html).toContain("Back / 回房型介紹");
    expect(getRoomSeo(room.slug)).toMatchObject({
      title: "畫雲 S360｜ROOM S360｜慢慢蒔光 STime Villa",
      canonical: "https://www.mumbao.tw/rooms/room-360-senguang",
    });
  });
  it.each([
    ["homepage carousel", HomeRooms],
    ["rooms listing", RoomsPage],
  ] as const)("uses S360-1 in %s without changing the previous gallery covers", (_, Component) => {
    const html = renderToStaticMarkup(<Router ssrPath="/rooms"><Component /></Router>);
    const images = elements(html, "img");
    for (const gallery of [s360Gallery, s521Gallery, s888Gallery]) {
      expect(images.filter(image => image.src === gallery[0].src)).toHaveLength(1);
    }
    expect(html).not.toContain('src="/images/Room/S360.jpg"');
    expect(html).toContain("/rooms/room-360-senguang");
  });
});

describe("S888 gallery integration", () => {
  it("retains stable gallery classes when the prerender worker ignores CSS imports", () => {
    const result = buildSync({
      entryPoints: [fileURLToPath(new URL("./RoomGallery.tsx", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
      packages: "external", loader: { ".css": "empty", ".module.css": "empty" },
    });
    const module = { exports: {} as { RoomGallery: typeof RoomGallery } };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      createRequire(import.meta.url), module, module.exports,
    );
    const html = renderToStaticMarkup(React.createElement(module.exports.RoomGallery, { images: s888Gallery, roomName: "雲容 S888" }));
    const css = readFileSync(new URL("./RoomGallery.css", import.meta.url), "utf8");
    expect(elements(html, "section")[0].class).toBe("room-gallery-gallery");
    expect(elements(html, "img")[0].class).toBe("room-gallery-mainImage");
    expect(css).toContain(".room-gallery-mainImage");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain(".room-gallery-thumbnailSlide");
  });
  it("preserves the 11-photo editorial sequence and unique descriptions", () => {
    expect(s888Gallery.map(image => image.src)).toEqual([2, 11, 7, 5, 4, 1, 3, 6, 9, 10, 8]
      .map(n => `/images/Room/S888/S888-${n}.webp`));
    expect(new Set(s888Gallery.map(image => image.alt)).size).toBe(11);
  });
  it("uses the existing gallery with one eager cover, bounded lazy thumbnails and 1 / 11", () => {
    const html = renderToStaticMarkup(<RoomGallery images={s888Gallery} roomName="雲容 S888" lightboxTheme="cream" />);
    const images = elements(html, "img");
    expect(images[0]).toMatchObject({ src: s888Gallery[0].src, width: "2896", height: "2172", loading: "eager", fetchpriority: "high", decoding: "async" });
    expect(images.filter(image => image.loading === "eager")).toHaveLength(1);
    expect(images).toHaveLength(7);
    expect(new Set(images.map(image => image.src)).size).toBe(6);
    expect(images.slice(1).every(image => image.loading === "lazy" && image.decoding === "async")).toBe(true);
    expect(html).toContain("1 / 11");
    expect(elements(html, "button").filter(button => button["aria-label"]?.startsWith("第 "))
      .map(button => button["aria-label"])).toEqual(s888Gallery.map((image, i) => `第 ${i + 1} 張：${image.alt}`));
  });
  it("keeps the existing route, metadata and story, removing the entire notice only for gallery rooms", () => {
    const room = rooms.find(room => room.roomNumber === "S888")!;
    const html = renderToStaticMarkup(<Router ssrPath="/rooms/room-888-xinghuo"><RoomDetail /></Router>);
    expect(room.slug).toBe("room-888-xinghuo");
    expect(room.image).toBe(s888Gallery[0].src);
    expect(html).not.toContain('src="/images/Room/S888.jpg"');
    expect(html).toContain(s888Gallery[0].src);
    expect(html).toContain(room.name);
    expect(html).toContain(room.subtitle);
    for (const paragraph of room.intro) expect(html).toContain(paragraph);
    expect(html.indexOf(s888Gallery[0].src, html.indexOf("<main"))).toBeLessThan(html.indexOf(room.intro[0]));
    expect(html).not.toContain("房型設備、入住人數、床型與實際配置");
    expect(html).not.toContain("慢慢蒔光每一間房都有不同主題與氛圍");
    expect(elements(html, "section").some(section => section.class?.includes("bg-white/55"))).toBe(false);
    expect(html).toContain("Back / 回房型介紹");
    expect(getRoomSeo(room.slug)).toMatchObject({
      title: "雲容 S888｜ROOM S888｜慢慢蒔光 STime Villa",
      canonical: "https://www.mumbao.tw/rooms/room-888-xinghuo",
    });
  });
  it.each([
    ["homepage carousel", HomeRooms],
    ["rooms listing", RoomsPage],
  ] as const)("uses S888-2 in %s without changing S521's cover", (_, Component) => {
    const html = renderToStaticMarkup(<Router ssrPath="/rooms"><Component /></Router>);
    const images = elements(html, "img");
    expect(images.filter(image => image.src === s888Gallery[0].src)).toHaveLength(1);
    expect(images.filter(image => image.src === s521Gallery[0].src)).toHaveLength(1);
    expect(html).not.toContain('src="/images/Room/S888.jpg"');
    expect(html).toContain("/rooms/room-888-xinghuo");
  });
});
