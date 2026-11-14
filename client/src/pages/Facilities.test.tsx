import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Facilities from "./Facilities";

import { facilitiesAlbums, facilitiesAlbumSelection, facilitiesPhoto, facilitiesHero } from "@/data/facilitiesGallery";
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

  it("renders the current cover and derived representatives, not closed-album images", () => {
    const html = render(), images = html.match(/<img\b[^>]*>/g) ?? [];
    const hero=facilitiesPhoto(facilitiesHero.desktop);
    expect(images).toHaveLength(1+Object.values(facilitiesAlbums).reduce((n,a)=>n+a.featured.length,0));
    expect(images[0]).toContain('src="'+hero.src+'"');
    expect(images[0]).toContain('width="'+hero.width+'" height="'+hero.height+'"');
    expect(images[0]).toContain('loading="eager"');
    images.slice(1).forEach(image => expect(image).toContain('loading="lazy"'));
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("查看全部 1 張照片");
    expect(html).not.toContain("立即預約");
    expect(readFileSync(new URL("./Facilities.module.css", import.meta.url), "utf8")).not.toContain("url(");
  });
  it("renders Appendix A once, with exact punctuation and reading order", () => {
    const approved = readFileSync(new URL("../data/__fixtures__/facilities-approved-20261114.txt", import.meta.url), "utf8");
    const nodes: any[] = [];
    const walk = (n: any) => { if (n.attrs?.some((a: any) => a.name === "data-approved-copy")) nodes.push(n); (n.childNodes ?? []).forEach(walk); };
    const text = (n: any): string => n.nodeName === "#text" ? n.value : (n.childNodes ?? []).map(text).join("");
    walk(parse(render()));
    expect(nodes.map(text).join("").replace(/\s/g, "")).toBe(approved.replace(/\s/g, ""));
    expect(render().match(/<h1\b/g)).toHaveLength(1);
  });
  it("renders the approved hero hierarchy and the live overview count", () => {
    const nodes: any[]=[];
    const walk=(n:any)=>{nodes.push(n);(n.childNodes??[]).forEach(walk);};
    const text=(n:any):string=>n.nodeName==="#text"?n.value:(n.childNodes??[]).map(text).join("");
    walk(parse(render()));
    const hero=nodes.find(n=>n.tagName==="section"&&n.attrs?.some((a:any)=>a.name==="aria-labelledby"&&a.value==="facilities-title"));
    const heroNodes:any[]=[];
    const descend=(n:any)=>{heroNodes.push(n);(n.childNodes??[]).forEach(descend);};
    descend(hero);
    expect(heroNodes.filter(n=>n.tagName==="p").map(text)).toEqual(["STAY EXPERIENCE館內設施","慢慢蒔光｜館內藝術體驗與專屬禮遇"]);
    expect(heroNodes.find(n=>n.tagName==="h1").childNodes.map(text)).toEqual(["住進一座","可以過夜的當代藝術館"]);
    expect(text(heroNodes.find(n=>n.tagName==="button"))).toBe("查看公共空間照片 · "+facilitiesAlbumSelection("all").images.length+"張");
  });
  it("puts one persistent hint on the final representative without nested interactive elements", () => {
    const buttons: any[] = [];
    const walk = (n: any) => { if (n.tagName === "button") buttons.push(n); (n.childNodes ?? []).forEach(walk); };
    const attr = (n: any, name: string) => n.attrs?.find((a: any) => a.name === name)?.value;
    const text = (n: any): string => n.nodeName === "#text" ? n.value : (n.childNodes ?? []).map(text).join("");
    walk(parse(render()));
    const photos = buttons.filter(b => attr(b, "aria-label")?.includes("放大照片："));
    expect(photos).toHaveLength(Object.values(facilitiesAlbums).reduce((n,a)=>n+a.featured.length,0));
    const hinted = photos.filter(b => text(b).includes("查看全部") || text(b) === "點擊放大");
    expect(hinted).toHaveLength(Object.values(facilitiesAlbums).filter(a=>a.ids.length).length);
    Object.entries(facilitiesAlbums).filter(([,data])=>data.ids.length).forEach(([album, data], index) => {
      const count = facilitiesAlbumSelection(album as keyof typeof facilitiesAlbums).images.length;
      const photo = facilitiesPhoto(data.featured[data.featured.length - 1]);
      const hint = count > 1 ? "查看全部 " + count + " 張照片" : "點擊放大";
      expect(text(hinted[index])).toBe(hint);
      expect(attr(hinted[index], "aria-label")).toBe(hint + "；放大照片：" + photo.alt);
      expect(attr(hinted[index].childNodes.find((c: any) => c.tagName === "img"), "src")).toBe(photo.src);
      expect(hinted[index].childNodes.some((c: any) => c.tagName === "button" || c.tagName === "a")).toBe(false);
    });
  });
  it('keeps the dog copy without an empty frame or album hint when that folder is empty', () => {
    const saved={...facilitiesAlbums.pets};
    try {
      facilitiesAlbums.pets.ids=[]; facilitiesAlbums.pets.featured=[];
      const html=render();
      expect(html).toContain('🐾 頂級寵物友善 ｜');
      expect(html).not.toContain('data-album="pets"');
    } finally { Object.assign(facilitiesAlbums.pets,saved); }
  });
  it('binds family and seasonal photos to their existing paragraphs without changing order or copy', () => {
    const nodes: any[]=[];
    const attr=(n:any,k:string)=>n.attrs?.find((a:any)=>a.name===k)?.value;
    const walk=(n:any)=>{if(attr(n,'data-feature'))nodes.push(n);(n.childNodes??[]).forEach(walk);};
    walk(parse(render()));
    const ids=nodes.map(n=>attr(n,'data-feature'));
    expect(ids.slice(ids.indexOf('dining'),ids.indexOf('collectors-gift')+1)).toEqual(['dining','family','mini-bar','collectors-gift']);
    for(const id of ['family','summer-pools'] as const){
      const node=nodes.find(n=>attr(n,'data-feature')===id);
      const photoGroup=node.childNodes.find((n:any)=>attr(n,'data-album')===id);
      expect(Boolean(photoGroup)).toBe(facilitiesAlbums[id].ids.length>0);
    }
  });
  it.each(['family','summer-pools'] as const)('preserves %s text with no photo frame when empty', id => {
    const saved={...facilitiesAlbums[id]};
    try {
      facilitiesAlbums[id].ids=[];facilitiesAlbums[id].featured=[];
      const html=render();
      expect(html).toContain('👶 親子與長輩的溫柔降落 ｜');
      expect(html).toContain('💦 慢寶夏日水上藝術雙池 ｜ 5–10 月限定');
      expect(html).toContain('每組住客入住前皆重新換水');
      expect(html).toContain('慢寶宇宙專屬水上藝術備品');
      expect(html).not.toContain('data-album="'+id+'"');
      expect(html).not.toContain('照片準備中');
    } finally {Object.assign(facilitiesAlbums[id],saved);}
  });
  it("keeps the URL and metadata lifecycle, sourcing description and image from this page", () => {
    const source = readFileSync(new URL("./Facilities.tsx", import.meta.url), "utf8");
    expect(source).toContain('const title = "館內設施｜慢慢蒔光 STime Villa"');
    expect(source).toContain('const url = "https://www.mumbao.tw/facilities"');
    expect(source).toContain('["name", "description", copy.intro[0]]');
    expect(source).toContain("facilitiesPhoto(facilitiesHero.desktop).src");
    expect(source).toContain("stale.forEach((node) => document.head.appendChild(node))");
  });
});
