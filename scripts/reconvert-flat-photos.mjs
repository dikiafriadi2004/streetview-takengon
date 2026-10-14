/**
 * Script untuk reconvert foto flat yang sudah ada ke equirectangular 2:1
 * agar bisa ditampilkan sebagai bola 3D di Photo Sphere Viewer.
 *
 * Usage: node scripts/reconvert-flat-photos.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
const STORAGE_DIR = process.env.STORAGE_DIR ?? './storage';

// Same logic as apps/api/src/services/equirect.ts
async function toEquirectangular(inputBuffer) {
  const meta = await sharp(inputBuffer).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const ratio = srcW / srcH;

  // Already equirectangular
  if (ratio >= 1.9 && ratio <= 2.1) return inputBuffer;

  const targetW = Math.min(srcW, 8192);
  const targetH = Math.round(targetW / 2);

  const finalH = Math.min(Math.round((srcH / srcW) * targetW), targetH);
  const finalW = Math.round((srcW / srcH) * finalH);

  const left = Math.max(0, Math.round((targetW - finalW) / 2));
  const top  = Math.max(0, Math.round((targetH - finalH) / 2));

  const resized = await sharp(inputBuffer)
    .resize(finalW, finalH, { fit: 'fill' })
    .toBuffer();

  return sharp({
    create: { width: targetW, height: targetH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Get all flat photos
const [photos] = await conn.query(
  `SELECT id, file_path, thumb_path FROM photos WHERE projection = 'flat'`
);

console.log(`📷 Ditemukan ${photos.length} foto flat untuk dikonversi...\n`);

let ok = 0, skip = 0, fail = 0;

for (const photo of photos) {
  // file_path looks like: /media/photos/p_xxx.jpeg
  // Map to local filesystem: STORAGE_DIR + path without /media prefix
  const relPath = photo.file_path.replace(/^\/media\//, '');
  const fullPath = path.join(STORAGE_DIR, relPath);

  try {
    const buf = await fs.readFile(fullPath);
    const meta = await sharp(buf).metadata();
    const ratio = (meta.width ?? 1) / (meta.height ?? 1);

    if (ratio >= 1.9 && ratio <= 2.1) {
      console.log(`⏭  #${photo.id} sudah equirectangular (${meta.width}x${meta.height})`);
      skip++;
      continue;
    }

    console.log(`🔄 #${photo.id} ${meta.width}x${meta.height} rasio ${ratio.toFixed(2)} → konversi...`);

    const equiRect = await toEquirectangular(buf);

    // Overwrite file in-place (same path, now JPEG)
    const newPath = fullPath.replace(/\.[^.]+$/, '.jpg');
    await fs.writeFile(newPath, equiRect);

    // If extension changed, remove old file
    if (newPath !== fullPath) {
      await fs.unlink(fullPath).catch(() => {});
    }

    // Rebuild thumbnail from equirectangular
    const thumbRel = photo.thumb_path.replace(/^\/media\//, '');
    const thumbFull = path.join(STORAGE_DIR, thumbRel);
    const thumbBuf = await sharp(equiRect)
      .resize(640, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    await fs.writeFile(thumbFull, thumbBuf);

    // Update DB: set projection = equirectangular, update file_path if changed
    const newFilePath = photo.file_path.replace(/\.[^.]+$/, '.jpg');
    await conn.query(
      `UPDATE photos SET projection = 'equirectangular', file_path = ? WHERE id = ?`,
      [newFilePath, photo.id]
    );

    const newMeta = await sharp(equiRect).metadata();
    console.log(`   ✅ #${photo.id} selesai → ${newMeta.width}x${newMeta.height}`);
    ok++;

  } catch (err) {
    console.error(`   ❌ #${photo.id} gagal: ${err.message}`);
    fail++;
  }
}

console.log(`\n📊 Selesai: ${ok} dikonversi, ${skip} dilewati, ${fail} gagal`);
await conn.end();
