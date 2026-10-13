import { describe, it, expect } from 'vitest';
import { bearing, smoothHeadings, haversineDistance } from '../heading.js';

describe('bearing()', () => {
  it('due east: bearing(4.629, 96.835, 4.629, 96.860) ≈ 89–91°', () => {
    const b = bearing(4.629, 96.835, 4.629, 96.860);
    expect(b).toBeGreaterThan(88);
    expect(b).toBeLessThan(92);
  });

  it('due north: bearing(0, 0, 1, 0) ≈ 0°', () => {
    const b = bearing(0, 0, 1, 0);
    expect(b).toBeCloseTo(0, 0);
  });

  it('due south: bearing(1, 0, 0, 0) ≈ 180°', () => {
    const b = bearing(1, 0, 0, 0);
    expect(b).toBeCloseTo(180, 0);
  });

  it('due west: bearing(0, 10, 0, 0) ≈ 270°', () => {
    const b = bearing(0, 10, 0, 0);
    expect(b).toBeCloseTo(270, 0);
  });
});

describe('smoothHeadings()', () => {
  it('[10, 20, 30, 40, 50] → [15, 20, 30, 40, 45]', () => {
    const result = smoothHeadings([10, 20, 30, 40, 50]);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeCloseTo(15, 0);
    expect(result[1]).toBeCloseTo(20, 0);
    expect(result[2]).toBeCloseTo(30, 0);
    expect(result[3]).toBeCloseTo(40, 0);
    expect(result[4]).toBeCloseTo(45, 0);
  });

  it('single element returns same value', () => {
    expect(smoothHeadings([45])).toEqual([45]);
  });

  it('empty array returns empty', () => {
    expect(smoothHeadings([])).toEqual([]);
  });
});

describe('haversineDistance()', () => {
  it('same point → 0m', () => {
    expect(haversineDistance(4.629, 96.835, 4.629, 96.835)).toBe(0);
  });

  it('~2.5km apart gives reasonable distance', () => {
    const d = haversineDistance(4.629, 96.835, 4.629, 96.860);
    // At lat ~4.6°, 0.025° longitude ≈ 2770m
    expect(d).toBeGreaterThan(2600);
    expect(d).toBeLessThan(3000);
  });
});
