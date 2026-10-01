import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { facilitiesPhotos, facilitiesAlbums, facilitiesFullAlbumIds, facilitiesHero, facilitiesAlbumSelection } from "./facilitiesGallery";

describe("facilities public space albums", () => {
  it("contains every id from 1 to 24 exactly once, in the owner's editorial order", () => {
    expect(facilitiesFullAlbumIds).toEqual([5,2,4,24,8,15,7,20,23,14,9,17,18,12,22,16,1,6,3,21,13,11,19,10]);
    expect([...facilitiesFullAlbumIds].sort((a,b) => a-b)).toEqual(Array.from({length:24}, (_,i) => i+1));
    expect(facilitiesPhotos.map(photo => photo.id)).toEqual(Array.from({length:24}, (_,i) => i+1));
    expect(new Set(facilitiesPhotos.map(photo => photo.src)).size).toBe(24);
  });
  it("shares the responsive hero with the album data and preserves the ten body selections", () => {
    expect(facilitiesHero).toEqual({desktop:5,mobile:4});
    expect(Object.values(facilitiesAlbums).map(album => [...album.featured])).toEqual([[2,24,8],[20,23,14],[1,6,3],[13]]);
    expect(Object.values(facilitiesAlbums).map(album => album.ids.length)).toEqual([7,9,4,4]);
  });
  for (const [id, album] of Object.entries(facilitiesAlbums)) {
    const key = id as keyof typeof facilitiesAlbums;
    it(`starts ${key} at its own first photo and count`, () => {
      const selection = facilitiesAlbumSelection(key);
      expect(selection.index).toBe(0);
      expect(selection.images.map(photo => photo.id)).toEqual(album.ids);
    });
    it.each(album.featured)(`opens clicked body photo %i inside ${key}`, photoId => {
      const selection = facilitiesAlbumSelection(key, photoId);
      expect(selection.images[selection.index].id).toBe(photoId);
      expect(selection.images).toHaveLength(album.ids.length);
    });
  }
  it("opens pub-24 at 4/7, not at the beginning or in the full album", () => {
    expect(facilitiesAlbumSelection("living",24).index).toBe(3);
    expect(facilitiesAlbumSelection("all").images[0].id).toBe(5);
    expect(facilitiesAlbumSelection("all").images).toHaveLength(24);
    expect(() => facilitiesAlbumSelection("living",20)).toThrow();
  });
  it.each(facilitiesPhotos)("uses actual WebP dimensions and exact-case source for photo $id", photo => {
    expect(photo.src).toBe(`/images/public/pub-${photo.id}.webp`);
    const bytes = readFileSync(new URL(`../../public${photo.src}`, import.meta.url));
    expect(bytes.toString("ascii",0,4)).toBe("RIFF");
    expect(bytes.toString("ascii",8,12)).toBe("WEBP");
    let dimensions: number[] = [];
    for (let offset=12; offset+8<=bytes.length;) {
      const type=bytes.toString("ascii",offset,offset+4), size=bytes.readUInt32LE(offset+4), start=offset+8;
      if (type==="VP8X") { dimensions=[1+bytes.readUIntLE(start+4,3),1+bytes.readUIntLE(start+7,3)]; break; }
      if (type==="VP8 ") { dimensions=[bytes.readUInt16LE(start+6)&16383,bytes.readUInt16LE(start+8)&16383]; break; }
      if (type==="VP8L") { const value=bytes.readUInt32LE(start+1); dimensions=[(value&16383)+1,((value>>>14)&16383)+1]; break; }
      offset=start+size+size%2;
    }
    expect(dimensions).toEqual([photo.width,photo.height]);
    expect(photo.alt.length).toBeGreaterThan(8);
  });
});
