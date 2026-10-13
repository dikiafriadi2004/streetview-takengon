import { describe, it, expect } from 'vitest';
import { buildNeighborLinks } from '../neighbor.js';
import type { PhotoPoint } from '../neighbor.js';

describe('buildNeighborLinks()', () => {
  it('5 sequential photos in one sequence → 4 bidirectional links (8 total)', () => {
    const photos: PhotoPoint[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      sequenceId: 1,
      seqIndex: i,
      lat: 4.629 + i * 0.00009,
      lon: 96.835,
    }));

    const links = buildNeighborLinks(photos);
    expect(links).toHaveLength(8); // 4 pairs × 2 directions
  });

  it('creates links for consecutive photos in both directions', () => {
    const photos: PhotoPoint[] = [
      { id: 1, sequenceId: 1, seqIndex: 0, lat: 4.629, lon: 96.835 },
      { id: 2, sequenceId: 1, seqIndex: 1, lat: 4.629, lon: 96.836 },
    ];

    const links = buildNeighborLinks(photos);
    expect(links).toHaveLength(2);
    expect(links.some(l => l.fromPhotoId === 1 && l.toPhotoId === 2)).toBe(true);
    expect(links.some(l => l.fromPhotoId === 2 && l.toPhotoId === 1)).toBe(true);
  });

  it('cross-sequence photos within 10m → creates links', () => {
    // Two photos from different sequences, ~8m apart
    const photos: PhotoPoint[] = [
      { id: 1, sequenceId: 1, seqIndex: 0, lat: 4.629000, lon: 96.835000 },
      { id: 2, sequenceId: 2, seqIndex: 0, lat: 4.629072, lon: 96.835000 }, // ~8m north
    ];

    const links = buildNeighborLinks(photos);
    // Should have cross-sequence links
    expect(links.some(l => l.fromPhotoId === 1 && l.toPhotoId === 2)).toBe(true);
    expect(links.some(l => l.fromPhotoId === 2 && l.toPhotoId === 1)).toBe(true);
  });

  it('cross-sequence photos >15m → no cross links', () => {
    // Two photos from different sequences, ~20m apart
    const photos: PhotoPoint[] = [
      { id: 1, sequenceId: 1, seqIndex: 0, lat: 4.629000, lon: 96.835000 },
      { id: 2, sequenceId: 2, seqIndex: 0, lat: 4.629180, lon: 96.835000 }, // ~20m north
    ];

    const links = buildNeighborLinks(photos);
    expect(links).toHaveLength(0);
  });

  it('respects MAX_NEIGHBORS (6) limit', () => {
    // Create 10 photos all at the same spot from different sequences
    const photos: PhotoPoint[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      sequenceId: i + 1,
      seqIndex: 0,
      lat: 4.629000 + i * 0.000001, // tiny offset, all within 1m of center
      lon: 96.835000,
    }));

    const links = buildNeighborLinks(photos);
    // Count outgoing links per photo
    const outgoing = new Map<number, number>();
    for (const l of links) {
      outgoing.set(l.fromPhotoId, (outgoing.get(l.fromPhotoId) ?? 0) + 1);
    }
    for (const [, count] of outgoing) {
      expect(count).toBeLessThanOrEqual(6);
    }
  });
});
