import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { attachGalleryZoom, fittedExtent, PhotoSwipe } from "./galleryZoom";

// These are event-level tests against the installed D3 implementation, not
// physical-device evidence. The minimal DOM supplies only layout/event inputs.
class Surface extends EventTarget {
  style = { setProperty: vi.fn(), removeProperty: vi.fn() };
  dataset: Record<string, string> = {};
  clientLeft = 0;
  clientTop = 0;
  getBoundingClientRect() { return { left: 0, top: 0 }; }
}
const point = (identifier: number, clientX: number, clientY: number) => ({ identifier, clientX, clientY });
const cleanups: Array<() => void> = [];
function setup(width = 390, height = 600, imageWidth = 300, imageHeight = 600) {
  const stage = new Surface();
  const image = { style: { transform: "" } };
  const onSwipe = vi.fn(), onScale = vi.fn();
  const controller = attachGalleryZoom(stage as unknown as HTMLElement, image as HTMLImageElement,
    { width, height }, { width: imageWidth, height: imageHeight }, onSwipe, onScale);
  cleanups.push(controller.dispose);
  const touch = (type: string, touches: ReturnType<typeof point>[], changedTouches = touches) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { touches, changedTouches });
    stage.dispatchEvent(event);
  };
  const wheel = (deltaY: number, clientX = 170, clientY = 200, ctrlKey = false) => {
    const event = new Event("wheel", { cancelable: true });
    Object.assign(event, { deltaY, deltaMode: 0, clientX, clientY, ctrlKey, button: 0 });
    stage.dispatchEvent(event);
    return event;
  };
  const state = () => {
    const [, x, y, k] = image.style.transform.match(/translate\(([^p]+)px, ([^p]+)px\) scale\(([^)]+)\)/)!;
    return { x: Number(x), y: Number(y), k: Number(k) };
  };
  return { stage, image, touch, wheel, controller, onSwipe, onScale, state };
}
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); });

describe("native D3 wheel zoom", () => {
  beforeEach(() => vi.useFakeTimers());
  it("zooms without Ctrl around the cursor, updates scale and never swipes", () => {
    const h = setup(400, 600, 400, 600);
    expect(h.wheel(-100).defaultPrevented).toBe(true);
    const k = Math.pow(2, 0.2);
    expect(h.state().k).toBeCloseTo(k);
    expect(h.state().k).toBeLessThan(1.2);
    expect(h.state().x).toBeCloseTo(170 * (1 - k));
    expect(h.state().y).toBeCloseTo(200 * (1 - k));
    expect(h.onScale).toHaveBeenLastCalledWith(k);
    h.wheel(100);
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
    vi.advanceTimersByTime(151);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("accepts Ctrl-wheel trackpad pinch without requiring Ctrl for a mouse", () => {
    const h = setup(); h.wheel(-10, 170, 200, true);
    expect(h.state().k).toBeCloseTo(Math.pow(2, 0.2));
    vi.advanceTimersByTime(151);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("consumes wheel at both limits and recenters at fitted 1x", () => {
    const h = setup();
    expect(h.wheel(100).defaultPrevented).toBe(true);
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
    h.wheel(-5000);
    expect(h.state().k).toBe(4);
    vi.advanceTimersByTime(151);
    expect(h.wheel(-100).defaultPrevented).toBe(true);
    expect(h.state().k).toBe(4);
    h.wheel(5000);
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
    vi.advanceTimersByTime(151);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("shares transform with buttons, reset and the existing pan gesture", () => {
    const h = setup(); h.wheel(-500);
    expect(h.state().k).toBe(2);
    vi.advanceTimersByTime(151);
    h.controller.zoomTo(h.state().k * 1.5);
    expect(h.state().k).toBe(3);
    h.controller.zoomTo(h.state().k / 1.5);
    expect(h.state().k).toBe(2);
    const before = h.state();
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 150, 290)]);
    h.touch("touchend", [], [point(1, 150, 290)]);
    expect(h.state().x).toBeCloseTo(before.x - 40);
    expect(h.state().y).toBeCloseTo(before.y + 40);
    expect(h.onSwipe).not.toHaveBeenCalled();
    h.controller.reset();
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
    expect(h.onScale).toHaveBeenLastCalledWith(1);
  });
  it("removes wheel on dispose and rebinding does not double zoom", () => {
    const h = setup(); h.wheel(-100); h.controller.dispose();
    const before = h.state();
    expect(h.wheel(-100).defaultPrevented).toBe(false);
    expect(h.state()).toEqual(before);
    vi.advanceTimersByTime(151);
    expect(h.onSwipe).not.toHaveBeenCalled();
    const next = attachGalleryZoom(h.stage as unknown as HTMLElement, h.image as HTMLImageElement,
      { width: 390, height: 600 }, { width: 300, height: 600 }, h.onSwipe, h.onScale);
    cleanups.push(next.dispose);
    h.wheel(-100);
    expect(h.state().k).toBeCloseTo(Math.pow(2, 0.2));
  });
});

describe("lightbox gesture ownership", () => {
  it.each([-100, 100])("swipes at fitted 1x, delta=%s", dx => {
    const h = setup();
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 190 + dx, 255)]);
    h.touch("touchend", [], [point(1, 190 + dx, 255)]);
    expect(h.onSwipe).toHaveBeenCalledWith(dx < 0 ? 1 : -1);
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
  });
  it.each([[15, 4], [60, 90], [2, 100]])("does not swipe on jitter/vertical movement %s,%s", (x, y) => {
    const h = setup();
    h.touch("touchstart", [point(1, 100, 100)]);
    h.touch("touchmove", [point(1, 100 + x, 100 + y)]);
    h.touch("touchend", [], [point(1, 100 + x, 100 + y)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("pans horizontally and vertically at 2x without changing photo, including edges", () => {
    const h = setup(); h.controller.zoomTo(2);
    const before = h.state();
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 130, 170)]);
    expect(h.state().x).toBeLessThan(before.x);
    expect(h.state().y).toBeLessThan(before.y);
    h.touch("touchmove", [point(1, -5000, -5000)]);
    expect(h.state()).toEqual({ x: -300, y: -600, k: 2 });
    h.touch("touchend", [], [point(1, -5000, -5000)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("keeps a non-overflowing axis centered", () => {
    const h = setup(390, 600, 1200, 400); h.controller.zoomTo(2);
    const y = h.state().y;
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 80, 500)]);
    expect(h.state().y).toBeCloseTo(y);
    expect(h.state().x).not.toBe(-195);
  });
  it("pinches around the two-finger center, then continues one-finger pan without a jump", () => {
    const h = setup(400, 600, 400, 600);
    h.touch("touchstart", [point(1, 120, 200)]);
    h.touch("touchstart", [point(1, 120, 200), point(2, 220, 200)], [point(2, 220, 200)]);
    h.touch("touchmove", [point(1, 70, 200), point(2, 270, 200)]);
    expect(h.state()).toEqual({ x: -170, y: -200, k: 2 });
    const before = h.state();
    h.touch("touchend", [point(2, 270, 200)], [point(1, 70, 200)]);
    h.touch("touchmove", [point(2, 270, 200)]);
    expect(h.state()).toEqual(before);
    h.touch("touchmove", [point(2, 240, 230)]);
    expect(h.state()).toEqual({ x: before.x - 30, y: before.y + 30, k: 2 });
    h.touch("touchend", [], [point(2, 240, 230)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("pinch back to 1x stays locked until every finger lifts; the NEXT swipe works", () => {
    const h = setup();
    h.touch("touchstart", [point(1, 120, 200), point(2, 220, 200)]);
    h.touch("touchmove", [point(1, 70, 200), point(2, 270, 200)]);
    h.touch("touchmove", [point(1, 120, 200), point(2, 220, 200)]);
    expect(h.state().k).toBe(1);
    h.touch("touchend", [point(1, 120, 200)], [point(2, 220, 200)]);
    h.touch("touchmove", [point(1, 20, 200)]);
    h.touch("touchend", [], [point(1, 20, 200)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
    h.touch("touchstart", [point(3, 180, 200)]);
    h.touch("touchmove", [point(3, 80, 200)]);
    h.touch("touchend", [], [point(3, 80, 200)]);
    expect(h.onSwipe).toHaveBeenCalledOnce();
  });
  it("adding another finger cancels a pending photo swipe even without zoom movement", () => {
    const h = setup();
    h.touch("touchstart", [point(1, 180, 200)]);
    h.touch("touchmove", [point(1, 80, 200)]);
    h.touch("touchstart", [point(1, 80, 200), point(2, 220, 200)], [point(2, 220, 200)]);
    h.touch("touchend", [], [point(1, 80, 200), point(2, 220, 200)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it.each(["touchcancel", "pointercancel"])("cancels photo switching after %s", type => {
    const h = setup();
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 90, 250)]);
    if (type === "touchcancel") h.touch(type, [], [point(1, 90, 250)]);
    else { h.stage.dispatchEvent(new Event(type)); h.touch("touchend", [], [point(1, 90, 250)]); }
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("reset centers at fitted 1x and does not release an ongoing gesture's swipe lock", () => {
    const h = setup(); h.controller.zoomTo(3);
    h.touch("touchstart", [point(1, 190, 250)]);
    h.controller.reset();
    expect(h.state()).toEqual({ x: 0, y: 0, k: 1 });
    h.touch("touchend", [], [point(1, 40, 250)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
  });
  it("unmount removes handlers and a replacement photo/rotated surface starts centered", () => {
    const h = setup(); h.controller.zoomTo(3); h.controller.dispose();
    h.touch("touchstart", [point(1, 190, 250)]);
    h.touch("touchmove", [point(1, 90, 250)]);
    h.touch("touchend", [], [point(1, 90, 250)]);
    expect(h.onSwipe).not.toHaveBeenCalled();
    const next = setup(844, 300, 1200, 400);
    expect(next.state()).toEqual({ x: 0, y: 0, k: 1 });
  });
});

describe("integration boundaries", () => {
  it("fits portrait and landscape without cropping", () => {
    expect(fittedExtent({ width: 400, height: 600 }, { width: 300, height: 600 })).toEqual([[50, 0], [350, 600]]);
    expect(fittedExtent({ width: 400, height: 600 }, { width: 1200, height: 600 })).toEqual([[0, 200], [400, 400]]);
  });
  it("locks a vertical-first gesture even if it later moves horizontally", () => {
    const swipe = new PhotoSwipe();
    swipe.begin({ type: "mousedown", clientX: 100, clientY: 100 }, 1);
    swipe.move({ type: "mousemove", clientX: 100, clientY: 140 }, 1);
    expect(swipe.end({ type: "mouseup", clientX: 0, clientY: 140 })).toBe(0);
  });
  it("limits gesture ownership to the lightbox and remounts on photo/size/cancel", () => {
    const css = readFileSync(new URL("./RoomGallery.css", import.meta.url), "utf8");
    expect(css.match(/[^{}]+\{[^{}]*touch-action: none[^{}]*\}/g)).toHaveLength(1);
    expect(css).toMatch(/\.room-gallery-zoomSurface \{[^}]*touch-action: none/);
    expect(css).toMatch(/\.room-gallery-mainButton \{[^}]*touch-action: pan-y pinch-zoom/);
    const component = readFileSync(new URL("./RoomGalleryZoom.tsx", import.meta.url), "utf8");
    expect(component).toContain('key={`${image.src}:${view.width}:${view.height}:${generation}`}');
    expect(component).toContain('observer.disconnect()');
    expect(component).toContain('current.dispose()');
    const gallery = readFileSync(new URL("./RoomGallery.tsx", import.meta.url), "utf8");
    expect(gallery).not.toContain('event.target === event.currentTarget');
    expect(gallery).not.toContain('className="room-gallery-lightboxStage" {...swipeProps}');
  });
});
