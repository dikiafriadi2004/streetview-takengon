const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculate compass bearing from point 1 to point 2 (0–360°, 0 = north).
 */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return ((Math.atan2(y, x) * RAD_TO_DEG + 360) % 360);
}

/**
 * Smooth headings with a 3-point moving average.
 * First and last points use 2-point average.
 */
export function smoothHeadings(headings: number[]): number[] {
  if (headings.length === 0) return [];
  if (headings.length === 1) return [...headings];

  const result: number[] = new Array(headings.length);

  for (let i = 0; i < headings.length; i++) {
    if (i === 0) {
      result[i] = circularMean([headings[0], headings[1]]);
    } else if (i === headings.length - 1) {
      result[i] = circularMean([headings[i - 1], headings[i]]);
    } else {
      result[i] = circularMean([headings[i - 1], headings[i], headings[i + 1]]);
    }
  }

  return result;
}

/**
 * Circular mean of angles in degrees.
 */
function circularMean(angles: number[]): number {
  let sinSum = 0;
  let cosSum = 0;
  for (const a of angles) {
    sinSum += Math.sin(a * DEG_TO_RAD);
    cosSum += Math.cos(a * DEG_TO_RAD);
  }
  return ((Math.atan2(sinSum, cosSum) * RAD_TO_DEG + 360) % 360);
}

/**
 * Calculate haversine distance between two geographic points in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δφ = (lat2 - lat1) * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
