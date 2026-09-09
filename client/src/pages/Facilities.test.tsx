import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import postcss from "postcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Facilities from "./Facilities";

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
    expect(images).toHaveLength(4);
    expect(images[0]).toContain('src="/images/aboutMe/aboutMe-4.jpg"');
    expect(images[0]).toContain('width="1086" height="1448"');
    expect(images[0]).toContain('loading="eager"');
    expect(images[0]).toContain('fetchPriority="high"');
    images.slice(1).forEach((image) => expect(image).toContain('loading="lazy"'));
  });
});
