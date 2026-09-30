import { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { attachGalleryZoom, type Size } from "./galleryZoom";
import type { RoomGalleryImage } from "./RoomGallery";

type Props = { image: RoomGalleryImage; onSwipe: (direction: number) => void };

function ZoomSurface({ image, view, onSwipe, onCancel }: Props & { view: Size; onCancel: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const controller = useRef<ReturnType<typeof attachGalleryZoom> | null>(null);
  const swipe = useRef(onSwipe);
  swipe.current = onSwipe;
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const current = attachGalleryZoom(stage.current!, photo.current!, view, image,
      direction => swipe.current(direction), setScale);
    controller.current = current;
    window.addEventListener("blur", onCancel);
    return () => {
      window.removeEventListener("blur", onCancel);
      current.dispose();
      controller.current = null;
    };
  }, [image, view, onCancel]);

  return <>
    <div ref={stage} className="room-gallery-zoomSurface" data-zoom={scale}
      onPointerCancel={onCancel} onContextMenu={event => event.preventDefault()}>
      <img ref={photo} src={image.src} alt={image.alt} width={image.width} height={image.height}
        className="room-gallery-mainImage room-gallery-zoomImage" decoding="async" draggable={false} />
    </div>
    <div className="room-gallery-zoomControls" role="group" aria-label="照片縮放">
      <button type="button" className="room-gallery-lightboxControl" aria-label="縮小照片" title="縮小照片"
        disabled={scale <= 1} onClick={() => controller.current?.zoomTo(scale / 1.5)}><ZoomOut aria-hidden="true" size={20} /></button>
      <output aria-label="圖片縮放倍率">{Math.round(scale * 100)}%</output>
      <button type="button" className="room-gallery-lightboxControl" aria-label="放大照片" title="放大照片"
        disabled={scale >= 4} onClick={() => controller.current?.zoomTo(scale * 1.5)}><ZoomIn aria-hidden="true" size={20} /></button>
      <button type="button" className="room-gallery-lightboxControl" aria-label="還原完整照片" title="還原完整照片"
        onClick={() => controller.current?.reset()}><RotateCcw aria-hidden="true" size={20} /></button>
    </div>
  </>;
}

export function RoomGalleryZoom({ image, onSwipe }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Size>({ width: 0, height: 0 });
  const [generation, setGeneration] = useState(0);
  const cancel = useRef(() => setGeneration(current => current + 1)).current;
  useEffect(() => {
    const element = frame.current!;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      setView(current => current.width === width && current.height === height ? current : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} className="room-gallery-lightboxStage">
    {view.width > 0 && view.height > 0 && <ZoomSurface
      key={`${image.src}:${view.width}:${view.height}:${generation}`} image={image} view={view}
      onSwipe={onSwipe} onCancel={cancel} />}
  </div>;
}
