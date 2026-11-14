import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { facilitiesContent as copy } from "./facilitiesContent";
import { withFacilitiesNavigation } from "../lib/site/facilitiesNavigation";

describe("facilities approved content 2026-11-14", () => {
  it("preserves Appendix A verbatim in reading order, ignoring only layout whitespace", () => {
    const approved = readFileSync(new URL("./__fixtures__/facilities-approved-20261114.txt", import.meta.url), "utf8");
    const actual = [...copy.chapters.flatMap(c => [c.title, ...c.intro, ...c.features.flatMap(f => [f.title, ...f.paragraphs])]), copy.closing].join("\n");
    expect(actual.replace(/\s/g, "")).toBe(approved.replace(/\s/g, ""));
  });
  it("keeps five chapters and nine core features in the approved order", () => {
    expect(copy.chapters.map(c => c.id)).toEqual(["brand", "core", "summer", "pets", "night"]);
    expect(copy.chapters[1].features.map(f => f.id)).toEqual(["zodiac-space", "afternoon-tea", "living-ktv", "mahjong", "barbecue", "dining", "family", "mini-bar", "collectors-gift"]);
    expect(copy.chapters[1].features[8].title).toBe("🎁 宇宙的雙向奔赴｜專屬藏家禮 ｜");
  });
});

describe("facilities drawer entry", () => {
  const rooms = { label: "房型介紹", href: "/#rooms", internal: false };
  const booking = { label: "線上訂房", href: "/booking", internal: true };
  const facilities = { label: "館內設施", href: "/facilities", internal: true };
  const about = { label: "關於我們", href: "/about", internal: true };
  const news = { label: "最新消息", href: "/#news", internal: false };

  it("inserts exactly between rooms and booking without mutating the input", () => {
    const original = Object.freeze([about, rooms, booking, news]);
    expect(withFacilitiesNavigation(original)).toEqual([about, rooms, facilities, booking, news]);
    expect(original).toEqual([about, rooms, booking, news]);
  });

  it("also supports CMS room routes and preserves other CMS properties", () => {
    const cmsRooms = { ...rooms, href: "/rooms", internal: true, sort_order: 4 };
    expect(withFacilitiesNavigation([about, cmsRooms, booking, news]))
      .toEqual([about, cmsRooms, facilities, booking, news]);
  });

  it("normalizes and deduplicates a CMS entry without duplicating the page link", () => {
    const cms = [facilities, about, rooms, { ...facilities, href: "/old-facilities" }, booking];
    expect(withFacilitiesNavigation(cms)).toEqual([about, rooms, facilities, booking]);
  });

  it("is idempotent", () => {
    const once = withFacilitiesNavigation([about, rooms, booking]);
    expect(withFacilitiesNavigation(once)).toEqual(once);
  });

  it("places before booking if CMS omits rooms", () => {
    expect(withFacilitiesNavigation([about, booking, news])).toEqual([about, facilities, booking, news]);
  });

  it("preserves unrelated CMS order if the neighboring entries are omitted", () => {
    expect(withFacilitiesNavigation([news, about])).toEqual([news, about, facilities]);
  });
});
