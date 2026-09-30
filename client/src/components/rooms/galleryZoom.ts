import { select } from "d3-selection";
import { dragEnable } from "d3-drag";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";

type Point = { clientX: number; clientY: number; identifier?: number };
type Input = { type: string; touches?: ArrayLike<Point>; changedTouches?: ArrayLike<Point>; clientX?: number; clientY?: number; button?: number; ctrlKey?: boolean; preventDefault?: () => void };
export type Size = { width: number; height: number };

// This policy never moves an image. D3 alone owns pinch/pan; we only decide
// whether its completed, unzoomed single-contact gesture is a photo swipe.
export class PhotoSwipe {
  private origin: Point | null = null;
  private blocked = false;
  begin(event: Input, scale: number) {
    this.origin = event.touches?.[0] ?? { clientX: event.clientX!, clientY: event.clientY! };
    this.blocked = scale > 1 || (event.touches?.length ?? 1) > 1;
  }
  lock() { this.blocked = true; }
  move(event: Input, scale: number) {
    if (scale > 1 || (event.touches?.length ?? 1) > 1) this.lock();
    const point = event.touches?.[0] ?? event as Point;
    if (this.origin && Math.abs(point.clientY - this.origin.clientY) > 12 &&
      Math.abs(point.clientY - this.origin.clientY) > Math.abs(point.clientX - this.origin.clientX)) this.lock();
  }
  end(event: Input): number {
    const from = this.origin;
    this.origin = null;
    if (!from || this.blocked || /cancel/.test(event.type) || event.touches?.length) return 0;
    const to = event.changedTouches?.[0] ?? event as Point;
    if (from.identifier !== to.identifier) return 0;
    const dx = to.clientX - from.clientX, dy = to.clientY - from.clientY;
    return Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0;
  }
}

export function fittedExtent(view: Size, image: Size): [[number, number], [number, number]] {
  const fit = Math.min(view.width / image.width, view.height / image.height);
  const width = image.width * fit, height = image.height * fit;
  return [[(view.width - width) / 2, (view.height - height) / 2],
    [(view.width + width) / 2, (view.height + height) / 2]];
}

export function attachGalleryZoom(stage: HTMLElement, image: HTMLImageElement, view: Size, size: Size,
  onSwipe: (direction: number) => void, onScale: (scale: number) => void) {
  const selection = select<HTMLElement, unknown>(stage);
  const swipe = new PhotoSwipe();
  let transform: ZoomTransform = zoomIdentity;
  let mouseActive = false;
  let disposed = false;
  const behavior = zoom<HTMLElement, unknown>()
    .extent([[0, 0], [view.width, view.height]])
    .translateExtent(fittedExtent(view, size))
    .scaleExtent([1, 4]).duration(0).touchable(true).clickDistance(6)
    .filter((event: Input) => {
      if (disposed) return false;
      if (event.type === "wheel") {
        // D3 ignores wheel at scale limits; still consume it on this surface.
        event.preventDefault?.();
        swipe.lock();
      }
      if ((event.touches?.length ?? 0) > 1) swipe.lock();
      return !event.button && (!event.ctrlKey || event.type === "wheel");
    })
    .on("start.gallery", (event: D3ZoomEvent<HTMLElement, unknown>) => {
      if (!event.sourceEvent) return;
      if (event.sourceEvent.type === "wheel") { swipe.lock(); return; }
      mouseActive = event.sourceEvent.type === "mousedown";
      swipe.begin(event.sourceEvent, transform.k);
    })
    .on("zoom.gallery", (event: D3ZoomEvent<HTMLElement, unknown>) => {
      if (disposed) return;
      transform = event.transform;
      if (event.sourceEvent) swipe.move(event.sourceEvent, transform.k);
      image.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`;
      stage.dataset.zoom = String(transform.k);
      onScale(transform.k);
    })
    .on("end.gallery", (event: D3ZoomEvent<HTMLElement, unknown>) => {
      mouseActive = false;
      if (disposed || !event.sourceEvent) return;
      const direction = swipe.end(event.sourceEvent);
      if (direction) onSwipe(direction);
    });
  selection.call(behavior).on("dblclick.zoom", null);
  selection.call(behavior.transform, zoomIdentity);
  const cancel = () => swipe.lock();
  stage.addEventListener("pointercancel", cancel);
  stage.addEventListener("touchcancel", cancel, true);
  return {
    zoomTo(scale: number) { swipe.lock(); selection.call(behavior.scaleTo, scale); },
    reset() { swipe.lock(); selection.call(behavior.transform, zoomIdentity); },
    dispose() {
      disposed = true;
      swipe.lock();
      selection.on(".zoom", null);
      stage.removeEventListener("pointercancel", cancel);
      stage.removeEventListener("touchcancel", cancel, true);
      if (mouseActive) {
        const window = stage.ownerDocument.defaultView!;
        select(window).on("mousemove.zoom mouseup.zoom", null);
        dragEnable(window);
      }
    },
  };
}
