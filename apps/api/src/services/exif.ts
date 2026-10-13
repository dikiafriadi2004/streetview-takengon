import { exiftool } from 'exiftool-vendored';

export interface GpsCoords {
  lat: number;
  lon: number;
}

/**
 * Read GPS coordinates from image EXIF data.
 * Returns null if no GPS data found.
 */
export async function readGpsExif(filePath: string): Promise<GpsCoords | null> {
  try {
    const tags = await exiftool.read(filePath);
    const lat = tags.GPSLatitude;
    const lon = tags.GPSLongitude;

    if (lat === undefined || lon === undefined) return null;

    // exiftool-vendored returns decimal degrees with sign from Ref
    return {
      lat: typeof lat === 'number' ? lat : parseFloat(String(lat)),
      lon: typeof lon === 'number' ? lon : parseFloat(String(lon)),
    };
  } catch {
    return null;
  }
}
