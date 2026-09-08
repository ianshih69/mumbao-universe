import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aboutUniverseParagraphs } from "./aboutContent";

const approvedText = "在浩瀚的宇宙中，每顆星辰都蘊含著古老的行星能量。我們以神秘而浪漫的希臘神話為靈感，一手點亮了『慢寶宇宙』。我們把諸神的祝福與星軌的溫柔凝聚在此，邀請你住進這場穿越千年的浪漫神話，漫遊在時間之外。」在這裡，時間不是向外流逝，而是向內共振。這座星軌矩陣映射著你深邃的高維靈魂，我們透過純粹的藝術氛圍，將靈性的療癒能量實體化。慢寶將化身為最溫柔的引路人，輕輕喚醒那個在喧囂塵世中、被遺忘許久的內在小孩。允許自己褪去社會的武裝，什麼都不做，在這裡與最初的自己深深相擁，感受靈魂本自具足的愛。";

describe("About universe copy integrity", () => {
  it("preserves the complete owner-approved text without any character changes or duplication", () => {
    expect(aboutUniverseParagraphs.join("")).toBe(approvedText);
  });

  it("uses the four approved paragraph boundaries, retaining the closing quotation mark in A", () => {
    expect(aboutUniverseParagraphs).toHaveLength(4);
    expect(aboutUniverseParagraphs[0].endsWith("漫遊在時間之外。」")).toBe(true);
    expect(aboutUniverseParagraphs[1].startsWith("在這裡，時間不是向外流逝")).toBe(true);
    expect(aboutUniverseParagraphs[1].endsWith("將靈性的療癒能量實體化。")).toBe(true);
    expect(aboutUniverseParagraphs[2].startsWith("慢寶將化身為最溫柔的引路人")).toBe(true);
    expect(aboutUniverseParagraphs[2].endsWith("被遺忘許久的內在小孩。")).toBe(true);
    expect(aboutUniverseParagraphs[3].startsWith("允許自己褪去社會的武裝")).toBe(true);
    expect(aboutUniverseParagraphs[3].endsWith("感受靈魂本自具足的愛。")).toBe(true);
  });

  it("renders one universe group and removes the old inline short version", () => {
    const source = readFileSync(new URL("../pages/About.tsx", import.meta.url), "utf8");
    expect(source.match(/aboutUniverseParagraphs\.map\(/g)).toHaveLength(1);
    expect(source.match(/data-about-universe/g)).toHaveLength(1);
    expect(source).not.toContain("我們把諸神的祝福與星軌的溫柔凝結在此");
    expect(source).not.toContain("在浩瀚的宇宙中");
  });
});
