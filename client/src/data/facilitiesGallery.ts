import manifest from 'virtual:facilities-photos';
import type { FacilitiesGroupId, FacilitiesPhoto, FacilitiesLayout, FacilitiesManifest } from './facilitiesPhotoTypes';
export type { FacilitiesGroupId, FacilitiesPhoto } from './facilitiesPhotoTypes';
export type FacilitiesAlbumId = FacilitiesGroupId | 'all';

export function createFacilitiesGallery(data: FacilitiesManifest) {
  const albums = Object.fromEntries(Object.entries(data.albums).map(([id, album]) => {
    const featured = album.images.slice(0, album.displayCount).map(p => p.id);
    let layout = album.layout;
    if (featured.length === 1 && ['pair', 'pairLead', 'triple'].includes(layout)) layout = 'portrait';
    if (featured.length === 2 && layout === 'triple') layout = 'pair';
    return [id, { title: album.title, directory: album.directory, ids: album.images.map(p => p.id), featured, layout }];
  })) as Record<FacilitiesGroupId, { title: string; directory: string; ids: string[]; featured: string[]; layout: FacilitiesLayout }>;
  const photos = [data.cover, ...Object.values(data.albums).flatMap(album => album.images)];
  // Do not deduplicate equal content across owner-managed albums.
  const fullAlbumIds = Object.values(albums).flatMap(album => album.ids);
  function photo(id: string): FacilitiesPhoto {
    const found = photos.find(p => p.id === id);
    if (!found) throw new Error('Unknown facilities photo: ' + id);
    return found;
  }
  function selection(album: FacilitiesAlbumId, photoId?: string) {
    const ids = album === 'all' ? fullAlbumIds : albums[album].ids;
    const index = photoId === undefined ? 0 : ids.indexOf(photoId);
    if (index < 0) throw new Error('Photo does not belong to this facilities album');
    return { title: album === 'all' ? '館內設施' : albums[album].title, images: ids.map(photo), index };
  }
  return { albums, photos, fullAlbumIds, photo, selection, hero: { desktop: data.cover.id, mobile: data.cover.id } };
}
const gallery = createFacilitiesGallery(manifest);
export const facilitiesAlbums = gallery.albums;
export const facilitiesPhotos = gallery.photos;
export const facilitiesHero = gallery.hero;
export const facilitiesFullAlbumIds = gallery.fullAlbumIds;
export const facilitiesPhoto = gallery.photo;
export const facilitiesAlbumSelection = gallery.selection;
