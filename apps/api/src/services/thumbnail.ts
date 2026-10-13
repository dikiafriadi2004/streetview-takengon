import sharp from 'sharp';

/**
 * Create a thumbnail from an image file using sharp.
 * Resizes to the specified width, preserving aspect ratio.
 */
export async function createThumb(
  inputPath: string,
  outputPath: string,
  width = 640
): Promise<void> {
  await sharp(inputPath)
    .resize(width, undefined, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}
