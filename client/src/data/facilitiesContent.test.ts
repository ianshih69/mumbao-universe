import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { facilitiesContent as copy } from "./facilitiesContent";
import { withFacilitiesNavigation } from "../lib/site/facilitiesNavigation";

describe("facilities approved content", () => {
  it("preserves all 47 owner-provided copy blocks verbatim, including punctuation and quantities", () => {
    const blocks = [
      copy.label, copy.brand, copy.title, ...copy.intro,
      ...copy.chapters.flatMap((chapter) => [
        chapter.title,
        ...chapter.features.flatMap((feature) => [feature.title, ...feature.paragraphs]),
      ]),
      copy.closing,
    ];
    expect(blocks).toHaveLength(47);
    // Fingerprint independently calculated from the owner's complete approved copy block.
    expect(createHash("sha256").update(blocks.join("\n\n")).digest("hex"))
      .toBe("b9e7a028706bd08206b8b3026d76a1c7c1c46967fbd1dec3ba5d3b4efbd1108d");
  });

  it("keeps five uniquely addressable chapters in reading order", () => {
    expect(copy.chapters.map((chapter) => chapter.id)).toEqual(["art", "family", "pets", "summer", "night"]);
    expect(copy.chapters.map((chapter) => chapter.features.length)).toEqual([5, 3, 4, 2, 3]);
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
