import React from "react";
import { createHash } from "node:crypto";
import { parseFragment } from "parse5";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { stayGuideText, stayGuideSections } from "@/data/stayGuide";
import { contact, contactSocialLinks, contactMapHref } from "@/data/contact";

let pages: ReturnType<typeof import("../prerender").renderPublicPages>;
beforeAll(async () => {
  vi.stubGlobal("React", React);
  const { renderPublicPages } = await import("../prerender");
  pages = renderPublicPages();
});
afterAll(() => vi.unstubAllGlobals());

function text(node: any): string {
  return node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
}
function collect(node: any, attribute: string, result: any[] = []) {
  if (node.attrs?.some((attr: any) => attr.name === attribute)) result.push(node);
  for (const child of node.childNodes || []) collect(child, attribute, result);
  return result;
}

describe("owner-approved visitor pages", () => {
  it("preserves the normalized Appendix A bytes, including punctuation and emoji", () => {
    expect(createHash("sha256").update(stayGuideText).digest("hex"))
      .toBe("b1935640c97d76f6874cdeae3b27e77527f2ca2ccff1a51fa6ddc4fdbae31053");
  });

  it("renders every original text line in order, not only the source data", () => {
    const page = pages.find(page => page.pathname === "/stay-guide")!;
    const nodes = collect(parseFragment(page.body), "data-stay-copy");
    expect(nodes.map(text)).toEqual(stayGuideText.split("\n").filter(Boolean));
    expect(stayGuideSections).toHaveLength(7);
    for (const section of stayGuideSections) {
      expect(page.body).toContain(`href="#${section.id}"`);
      expect(page.body).toContain(`id="${section.id}"`);
    }
  });

  it("includes the page-specific layout classes in initial HTML before hydration", () => {
    for (const path of ["/stay-guide", "/contact"]) {
      const body = pages.find(page => page.pathname === path)!.body;
      expect(body).toContain('class="visitor-page"');
      expect(body).toContain('<main class="visitor-main">');
      expect(body).toContain('<h1 class="visitor-title"');
    }
  });

  it("reuses only the existing three configured social images and destinations", () => {
    expect(contactSocialLinks).toEqual([
      {href:"https://lin.ee/u3JpTa6",label:"LINE",src:"/images/social/brand/line.svg"},
      {href:"https://www.instagram.com/mumbao.tw/",label:"Instagram",src:"/images/social/brand/instagram.svg"},
      {href:"https://www.facebook.com/STimeVilla",label:"Facebook",src:"/images/social/brand/facebook.svg"},
    ]);
    const body = pages.find(page => page.pathname === "/contact")!.body;
    for (const link of contactSocialLinks) {
      expect(body).toContain(`href="${link.href}"`);
      expect(body).toContain(`src="${link.src}"`);
    }
    expect(body).toContain(`href="${contact.phoneHref}"`);
    expect(body).toContain(`href="mailto:${contact.email}"`);
    expect(body).toContain(contact.address);
    expect(body).toContain(contact.lineId);
    expect(new URL(contactMapHref).searchParams.get("query")).toBe(contact.address);
    expect(body).not.toContain("03-9225650");
  });
});
