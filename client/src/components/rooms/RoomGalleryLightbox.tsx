import type { ComponentProps, KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { RoomGalleryZoom } from "./RoomGalleryZoom";
import type { RoomGalleryImage } from "./RoomGallery";
import "./RoomGallery.css";

type Props = {
  image: RoomGalleryImage;
  title: string;
  selected: number;
  count: number;
  onSelect: (index: number) => void;
  theme?: "dark" | "cream";
  onCloseAutoFocus?: ComponentProps<typeof Dialog.Content>["onCloseAutoFocus"];
};

// Dialog.Root stays with the caller so existing room triggers keep their focus behavior.
export function RoomGalleryLightbox({ image, title, selected, count, onSelect, theme = "dark", onCloseAutoFocus }: Props) {
  function keys(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(selected + (event.key === "ArrowRight" ? 1 : -1));
  }
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="room-gallery-overlay" data-theme={theme} />
      <Dialog.Content className="room-gallery-lightbox" data-theme={theme} aria-describedby={undefined}
        onKeyDown={keys} onCloseAutoFocus={onCloseAutoFocus}>
        <div className="room-gallery-lightboxHeader">
          <Dialog.Title className="room-gallery-title">{title}</Dialog.Title>
          <Dialog.Close className="room-gallery-lightboxControl" aria-label="關閉照片" title="關閉照片">
            <X aria-hidden="true" size={24} />
          </Dialog.Close>
        </div>
        <RoomGalleryZoom image={image} onSwipe={direction => onSelect(selected + direction)} />
        <div className="room-gallery-lightboxFooter">
          <button type="button" className="room-gallery-lightboxControl" aria-label="上一張照片" title="上一張照片" onClick={() => onSelect(selected - 1)}>
            <ChevronLeft aria-hidden="true" size={24} />
          </button>
          <span aria-live="polite" aria-atomic="true">{selected + 1} / {count}</span>
          <button type="button" className="room-gallery-lightboxControl" aria-label="下一張照片" title="下一張照片" onClick={() => onSelect(selected + 1)}>
            <ChevronRight aria-hidden="true" size={24} />
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
