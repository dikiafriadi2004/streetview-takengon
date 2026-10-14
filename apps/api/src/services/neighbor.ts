import { bearing, haversineDistance } from './heading.js';

export interface PhotoPoint {
  id: number;
  sequenceId: number;
  seqIndex: number;
  lat: number;
  lon: number;
}

export interface PhotoLink {
  fromPhotoId: number;
  toPhotoId: number;
  bearingDeg: number;
  distanceM: number;
}

const MAX_CROSS_DIST_M = 30;   // raised from 15 to 30 for manual uploads
const MAX_NEIGHBORS = 6;

/**
 * Build neighbor links for a set of photos.
 * Links sequential photos within each sequence, and cross-sequence
 * photos within MAX_CROSS_DIST_M meters. Max MAX_NEIGHBORS per photo.
 */
export function buildNeighborLinks(photos: PhotoPoint[]): PhotoLink[] {
  const links: PhotoLink[] = [];

  // Group by sequence
  const sequences = new Map<number, PhotoPoint[]>();
  for (const p of photos) {
    if (!sequences.has(p.sequenceId)) sequences.set(p.sequenceId, []);
    sequences.get(p.sequenceId)!.push(p);
  }

  // Sort each sequence by seqIndex
  for (const [, seq] of sequences) {
    seq.sort((a, b) => a.seqIndex - b.seqIndex);
  }

  // Track neighbor count per photo
  const neighborCount = new Map<number, number>();
  const addLink = (from: PhotoPoint, to: PhotoPoint): boolean => {
    const fromCount = neighborCount.get(from.id) ?? 0;
    const toCount = neighborCount.get(to.id) ?? 0;
    if (fromCount >= MAX_NEIGHBORS || toCount >= MAX_NEIGHBORS) return false;

    const dist = haversineDistance(from.lat, from.lon, to.lat, to.lon);
    const bearFwd = bearing(from.lat, from.lon, to.lat, to.lon);
    const bearBwd = bearing(to.lat, to.lon, from.lat, from.lon);

    links.push({ fromPhotoId: from.id, toPhotoId: to.id, bearingDeg: bearFwd, distanceM: dist });
    links.push({ fromPhotoId: to.id, toPhotoId: from.id, bearingDeg: bearBwd, distanceM: dist });

    neighborCount.set(from.id, fromCount + 1);
    neighborCount.set(to.id, toCount + 1);
    return true;
  };

  // Sequential links within sequences
  for (const [, seq] of sequences) {
    for (let i = 0; i < seq.length - 1; i++) {
      addLink(seq[i], seq[i + 1]);
    }
  }

  // Cross-sequence links within MAX_CROSS_DIST_M
  const allPhotos = [...photos];
  for (let i = 0; i < allPhotos.length; i++) {
    for (let j = i + 1; j < allPhotos.length; j++) {
      const a = allPhotos[i];
      const b = allPhotos[j];
      // Skip same sequence (already linked sequentially)
      if (a.sequenceId === b.sequenceId) continue;
      const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
      if (dist < MAX_CROSS_DIST_M) {
        addLink(a, b);
      }
    }
  }

  return links;
}
