import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from 'virtual:facilities-photos';
import { createFacilitiesGallery, facilitiesAlbums, facilitiesFullAlbumIds, facilitiesHero, facilitiesAlbumSelection, facilitiesPhoto } from './facilitiesGallery';

describe('directory-managed facilities albums', () => {
  it('derives every representative, cover, count and overview from the same inventory', () => {
    expect(Object.values(manifest.albums).map(a => a.directory)).toEqual(['01-brand','02-zodiac','03-afternoon-tea','04-ktv','05-mahjong','06-dining','07-child','08-mini-bar','09-gift','10-swim','11-dog']);
    for (const [id, album] of Object.entries(manifest.albums)) {
      const key = id as keyof typeof facilitiesAlbums;
      expect(facilitiesAlbums[key].ids).toEqual(album.images.map(p => p.id));
      expect(facilitiesAlbums[key].featured).toEqual(album.images.slice(0, album.displayCount).map(p => p.id));
      const sequence = album.images.map(p => BigInt(p.sequence));
      expect(sequence).toEqual([...sequence].sort((a,b) => a < b ? -1 : 1));
      for (const p of album.images) expect(facilitiesAlbumSelection(key,p.id).images[facilitiesAlbumSelection(key,p.id).index]).toEqual(p);
    }
    expect(facilitiesFullAlbumIds).toEqual(Object.values(manifest.albums).flatMap(a => a.images.map(p => p.id)));
    expect(facilitiesFullAlbumIds).not.toContain(manifest.cover.id);
    expect(facilitiesHero.desktop).toBe(manifest.cover.id);
  });
  it('matches deployed-file bytes and content-versioned URLs, without hardcoded photo names', () => {
    for (const p of [manifest.cover, ...Object.values(manifest.albums).flatMap(a => a.images)]) {
      const u = new URL(p.src, 'http://local');
      const bytes = readFileSync(new URL('../../public' + decodeURIComponent(u.pathname), import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(p.sha256);
      expect(u.searchParams.get('v')).toBe(p.sha256);
      expect(p.width).toBeGreaterThan(0); expect(p.height).toBeGreaterThan(0);
    }
  });
  it('rejects cross-album identities and unknown photos', () => {
    expect(() => facilitiesAlbumSelection('mahjong', manifest.cover.id)).toThrow();
    expect(() => facilitiesPhoto('not-a-photo')).toThrow();
  });
  it.each([0,1,2,4])('handles %i dog photos and Mini-bar growth without another photo list', count => {
    const data = structuredClone(manifest);
    const images = Array.from({length:count}, (_,i) => ({...manifest.cover,id:'test/'+i,filename:i+'.webp',sequence:String(i)}));
    data.albums.pets.images = images;
    data.albums['mini-bar'].images = images.map(p => ({...p,id:'mini/'+p.id}));
    const gallery = createFacilitiesGallery(data);
    expect(gallery.albums.pets.featured).toHaveLength(Math.min(2,count));
    expect(gallery.albums['mini-bar'].featured).toHaveLength(Math.min(1,count));
    expect(gallery.selection('pets').images).toHaveLength(count);
    expect(gallery.selection('mini-bar').images).toHaveLength(count);
    expect(gallery.fullAlbumIds).toEqual(Object.values(data.albums).flatMap(a=>a.images.map(p=>p.id)));
  });
  it('preserves equal-content photos in separate owner-selected albums', () => {
    const data=structuredClone(manifest);
    data.albums.pets.images=[{...data.cover,id:'pets/test.webp'}];
    data.albums['mini-bar'].images=[{...data.cover,id:'mini/test.webp'}];
    const gallery=createFacilitiesGallery(data);
    expect(gallery.fullAlbumIds).toContain('pets/test.webp');
    expect(gallery.fullAlbumIds).toContain('mini/test.webp');
  });
  it.each([0,1,2,5])('derives family and seasonal representatives and overview order for %i photos', count => {
    const data=structuredClone(manifest);
    for(const id of ['family','summer-pools'] as const) data.albums[id].images=Array.from({length:count},(_,i)=>({...data.cover,id:id+'/'+i,sequence:String(i)}));
    const gallery=createFacilitiesGallery(data);
    expect(gallery.albums.family.featured).toHaveLength(Math.min(2,count));
    expect(gallery.albums['summer-pools'].featured).toHaveLength(Math.min(3,count));
    expect(gallery.fullAlbumIds).toEqual(Object.values(data.albums).flatMap(a=>a.images.map(p=>p.id)));
    expect(gallery.selection('summer-pools').images).toHaveLength(count);
    expect(gallery.selection('family').images).toHaveLength(count);
  });
});
