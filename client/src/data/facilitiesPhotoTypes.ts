import type { RoomGalleryImage } from '@/components/rooms/RoomGallery';

export type FacilitiesGroupId = 'brand-original' | 'zodiac-space' | 'afternoon-tea' | 'living-ktv' | 'mahjong' | 'dining' | 'family' | 'mini-bar' | 'collectors-gift' | 'summer-pools' | 'pets';
export type FacilitiesPhoto = RoomGalleryImage & { id: string; filename: string; sequence: string; sha256: string };
export type FacilitiesLayout = 'pairLead' | 'triple' | 'pair' | 'landscape' | 'portrait';
export type FacilitiesManifest = {
  version: string;
  cover: FacilitiesPhoto;
  albums: Record<FacilitiesGroupId, { directory: string; id: FacilitiesGroupId; title: string; displayCount: number; layout: FacilitiesLayout; images: FacilitiesPhoto[] }>;
  ignored: string[];
  absentOptionalDirectories: string[];
  duplicates: string[][];
  files: { path: string; sha256: string; bytes: number }[];
};
