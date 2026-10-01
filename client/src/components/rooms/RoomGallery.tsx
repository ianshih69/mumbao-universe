import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RoomGalleryLightbox } from "./RoomGalleryLightbox";
import "./RoomGallery.css";

export type RoomGalleryImage = { src: string; alt: string; width: number; height: number };
type Props = { images: readonly RoomGalleryImage[]; roomName: string; lightboxTheme?: "dark" | "cream" };

export function RoomGallery({ images, roomName, lightboxTheme = "dark" }: Props) {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [visibleThumbs, setVisibleThumbs] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [thumbRef, thumbs] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", dragFree: true });
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const active = images[selected];
  const select = useCallback((index: number) => {
    const next = (index + images.length) % images.length;
    setSelected(next);
    thumbs?.scrollTo(next);
  }, [images.length, thumbs]);

  useEffect(() => {
    if (!thumbs) return;
    const reveal = () => setVisibleThumbs(current => Array.from(new Set([...current, ...thumbs.slidesInView()])));
    reveal();
    thumbs.on("slidesInView", reveal).on("reInit", reveal);
    return () => { thumbs.off("slidesInView", reveal).off("reInit", reveal); };
  }, [thumbs]);

  function keys(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    select(selected + (event.key === "ArrowRight" ? 1 : -1));
  }
  function start(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary) { gesture.current = null; return; }
    if (event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    swiped.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event: PointerEvent<HTMLElement>) {
    const from = gesture.current;
    gesture.current = null;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      swiped.current = true;
      select(selected + (dx < 0 ? 1 : -1));
    }
  }
  const swipeProps = { onPointerDown: start, onPointerUp: finish, onPointerCancel: () => { gesture.current = null; } };
  const count = `${selected + 1} / ${images.length}`;

  return (
    <section className="room-gallery-gallery" aria-label={`${roomName} 照片`} aria-roledescription="carousel" onKeyDown={keys}>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="room-gallery-stage">
          <Dialog.Trigger asChild>
            <button type="button" className="room-gallery-mainButton" aria-label={`放大照片：${active.alt}`}
              {...swipeProps} onClick={event => { if (swiped.current) { event.preventDefault(); swiped.current = false; } }}>
              <img key={active.src} src={active.src} alt={active.alt} width={active.width} height={active.height}
                className="room-gallery-mainImage" loading={selected === 0 ? "eager" : "lazy"}
                fetchPriority={selected === 0 ? "high" : "auto"} decoding="async" draggable={false} />
            </button>
          </Dialog.Trigger>
          <button type="button" className={`room-gallery-arrow room-gallery-previous`} aria-label="上一張照片" title="上一張照片" onClick={() => select(selected - 1)}>
            <ChevronLeft aria-hidden="true" size={22} />
          </button>
          <button type="button" className={`room-gallery-arrow room-gallery-next`} aria-label="下一張照片" title="下一張照片" onClick={() => select(selected + 1)}>
            <ChevronRight aria-hidden="true" size={22} />
          </button>
          <span className="room-gallery-counter" aria-live="polite" aria-atomic="true">{count}</span>
        </div>

        <div className="room-gallery-thumbnailRow">
          <button type="button" className="room-gallery-stripArrow" aria-label="向前捲動縮圖" title="向前捲動縮圖" onClick={() => thumbs?.scrollPrev()}>
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <div ref={thumbRef} className="room-gallery-thumbnailViewport">
            <div className="room-gallery-thumbnails">
              {images.map((image, index) => (
                <div className="room-gallery-thumbnailSlide" key={image.src}>
                  <button type="button" className="room-gallery-thumbnail" aria-label={`第 ${index + 1} 張：${image.alt}`}
                    aria-pressed={selected === index} onClick={() => select(index)} onFocus={() => thumbs?.scrollTo(index)}>
                    {visibleThumbs.includes(index) && <img src={image.src} alt={image.alt} width={image.width} height={image.height}
                      loading="lazy" decoding="async" draggable={false} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="room-gallery-stripArrow" aria-label="向後捲動縮圖" title="向後捲動縮圖" onClick={() => thumbs?.scrollNext()}>
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>

        <RoomGalleryLightbox image={active} title={roomName} selected={selected} count={images.length}
          onSelect={select} theme={lightboxTheme} />
      </Dialog.Root>
    </section>
  );
}
