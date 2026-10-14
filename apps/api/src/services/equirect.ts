import sharp from 'sharp';

export interface PanoMetadata {
  width: number;
  height: number;
  /** Horizontal field of view in degrees (0–360) */
  croppedWidth: number;
  /** Vertical field of view in degrees (0–180) */
  croppedHeight: number;
  /** Offset from top of full equirectangular (degrees, 0 = top) */
  poseHeading: number;
  posePitch: number;
  poseRoll: number;
}

/**
 * Instead of padding with black, keep the original image and return
 * panoData so Photo Sphere Viewer knows exactly which portion of the
 * sphere this image covers.
 *
 * For a partial panorama (e.g. 360°×50° vertical strip from a phone):
 *  - fullWidth  = 4 * imageWidth  (full equirect at same resolution)
 *  - fullHeight = 2 * imageWidth
 *  - croppedX   = 0 (starts at left edge)
 *  - croppedY   = computed to place strip at horizon
 */
export interface PsvPanoData {
  fullWidth: number;
  fullHeight: number;
  croppedWidth: number;
  croppedHeight: number;
  croppedX: number;
  croppedY: number;
}

/**
 * Compute PSV panoData for any panorama image.
 *
 * If the image is already equirectangular (ratio ~2:1), returns null
 * (PSV will use the full image as a sphere).
 *
 * If the image is a partial panorama (wide & short), returns panoData
 * so PSV renders it immersively without black bars.
 */
export async function getPanoData(inputBuffer: Buffer): Promise<PsvPanoData | null> {
  const meta = await sharp(inputBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('Dimensi gambar tidak valid');

  const ratio = w / h;

  // Already equirectangular — no panoData needed
  if (ratio >= 1.9 && ratio <= 2.1) return null;

  // For a 360° horizontal panorama, the full equirect would be w × (w/2).
  // The image covers the full 360° horizontally but only a partial strip vertically.
  // Vertical coverage = (h / (w/2)) * 180°
  const fullWidth  = w;
  const fullHeight = Math.round(w / 2);

  // Place the strip at the vertical center (equator)
  const croppedX = 0;
  const croppedY = Math.round((fullHeight - h) / 2);

  return {
    fullWidth,
    fullHeight,
    croppedWidth:  w,
    croppedHeight: h,
    croppedX,
    croppedY,
  };
}

/**
 * Save image as-is (no padding). Just normalize to JPEG.
 * Returns the buffer unchanged if already JPEG; re-encodes PNG/WebP.
 */
export async function normalizePhoto(inputBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(inputBuffer).metadata();
  if (meta.format === 'jpeg') return inputBuffer;
  return sharp(inputBuffer).jpeg({ quality: 92 }).toBuffer();
}
