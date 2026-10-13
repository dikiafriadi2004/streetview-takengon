#!/usr/bin/env node
/**
 * CLI import pipeline: video 360° + GPX → photos in database
 * Usage: node src/cli/import.ts --input video.mp4 --gpx track.gpx --title 'Nama Ruas' --spacing 8
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { parseStringPromise } from 'xml2js';
import { pool } from '../db/pool.js';
import { createSequence, getNextSeqIndex } from '../db/sequences.js';
import { insertPhoto } from '../db/photos.js';
import { buildNeighborLinks } from '../services/neighbor.js';
import { bearing, smoothHeadings, haversineDistance } from '../services/heading.js';
import { createThumb } from '../services/thumbnail.js';
import { LocalStorageDriver } from '../storage/local.js';
import type { ResultSetHeader } from 'mysql2';

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
  time: Date;
}

interface ImportOptions {
  inputPath: string;
  gpxPath: string;
  title: string;
  spacing: number;
  sequenceId?: number;
  storageDir?: string;
}

export async function runImport(opts: ImportOptions): Promise<void> {
  const { inputPath, gpxPath, title, spacing } = opts;
  const storageDir = opts.storageDir ?? process.env.STORAGE_DIR ?? './storage';
  const storage = new LocalStorageDriver(storageDir);

  console.log(`📍 Memulai import: ${title}`);
  console.log(`   Video: ${inputPath}`);
  console.log(`   GPX: ${gpxPath}`);
  console.log(`   Jarak antar foto: ${spacing}m`);

  // Step 1: Parse GPX
  const gpxPoints = await parseGpx(gpxPath);
  if (gpxPoints.length < 2) {
    throw new Error('GPX harus memiliki minimal 2 titik');
  }

  // Filter out GPS jitter (spikes > 100m/s)
  const cleanPoints = filterGpxSpikes(gpxPoints);
  console.log(`   GPX: ${gpxPoints.length} titik → ${cleanPoints.length} setelah filter`);

  // Step 2: Calculate cumulative distances and frame times
  const frames = selectFramePositions(cleanPoints, spacing);
  console.log(`   Frame yang akan diekstrak: ${frames.length}`);

  if (frames.length === 0) {
    throw new Error('Tidak ada frame yang dapat diekstrak');
  }

  // Step 3: Get video duration to calculate timestamps
  const videoDuration = await getVideoDuration(inputPath);
  console.log(`   Durasi video: ${videoDuration.toFixed(1)}s`);

  // Step 4: Create or use sequence
  let sequenceId = opts.sequenceId;
  if (!sequenceId) {
    // Get admin user id
    const [users] = await pool.query<any[]>('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    const userId = users.length > 0 ? users[0].id : 1;
    sequenceId = await createSequence({ userId, title });
  }
  console.log(`   Sequence ID: ${sequenceId}`);

  // Step 5: Extract frames with ffmpeg
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sv-import-'));
  const needsReview: number[] = [];

  try {
    const photoIds: number[] = [];
    const photoPoints: Array<{ id: number; sequenceId: number; seqIndex: number; lat: number; lon: number }> = [];

    // Calculate headings
    const rawHeadings = frames.map((f, i) => {
      if (i < frames.length - 1) {
        return bearing(f.lat, f.lon, frames[i + 1].lat, frames[i + 1].lon);
      }
      return bearing(frames[i - 1].lat, frames[i - 1].lon, f.lat, f.lon);
    });
    const headings = smoothHeadings(rawHeadings);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const frameTime = (frame.cumulativeDist / frames[frames.length - 1].cumulativeDist) * videoDuration;
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.jpg`);

      // Extract single frame at timestamp
      await extractFrame(inputPath, frameTime, framePath);

      const photoKey = `photos/seq${sequenceId}_${String(i).padStart(5, '0')}.jpg`;
      const thumbKey = `thumbs/seq${sequenceId}_${String(i).padStart(5, '0')}.jpg`;

      const photoBuffer = await fs.readFile(framePath);
      await storage.save(photoKey, photoBuffer);
      await createThumb(framePath, path.join(tmpDir, `thumb_${i}.jpg`));
      const thumbBuffer = await fs.readFile(path.join(tmpDir, `thumb_${i}.jpg`));
      await storage.save(thumbKey, thumbBuffer);

      // Check if GPS data was missing for > 30s
      if (frame.gpsMissing) {
        needsReview.push(i);
      }

      const seqIndex = (await getNextSeqIndex(sequenceId)) + (photoIds.length > 0 ? 0 : 0);

      const photoId = await insertPhoto({
        sequenceId,
        seqIndex: i,
        lat: frame.lat,
        lon: frame.lon,
        headingDeg: headings[i],
        projection: 'equirectangular',
        filePath: storage.getUrl(photoKey),
        thumbPath: storage.getUrl(thumbKey),
        status: frame.gpsMissing ? 'draft' : 'draft',
      });

      photoIds.push(photoId);
      photoPoints.push({ id: photoId, sequenceId, seqIndex: i, lat: frame.lat, lon: frame.lon });

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`\r   Mengekstrak: ${i + 1}/${frames.length} frame...`);
      }
    }
    console.log(`\n   ✅ ${photoIds.length} foto disisipkan`);

    // Step 6: Build neighbor links
    const links = buildNeighborLinks(photoPoints);
    for (const link of links) {
      await pool.query<ResultSetHeader>(
        `INSERT IGNORE INTO photo_links (from_photo_id, to_photo_id, bearing_deg, distance_m)
         VALUES (?, ?, ?, ?)`,
        [link.fromPhotoId, link.toPhotoId, link.bearingDeg, link.distanceM]
      );
    }
    console.log(`   ✅ ${links.length} tautan tetangga dibuat`);

    // Calculate total distance
    const totalDist = frames[frames.length - 1]?.cumulativeDist ?? 0;

    // Summary
    console.log('\n📊 Ringkasan:');
    console.log(`   Jumlah foto: ${photoIds.length}`);
    console.log(`   Panjang ruas: ${(totalDist / 1000).toFixed(2)} km`);
    console.log(`   Status: draft (perlu ditinjau admin)`);
    if (needsReview.length > 0) {
      console.log(`   ⚠️  ${needsReview.length} foto perlu diperiksa (GPS hilang)`);
    }

  } finally {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {});
    await pool.end().catch(() => {});
  }
}

async function parseGpx(gpxPath: string): Promise<GpxPoint[]> {
  const content = await fs.readFile(gpxPath, 'utf-8');
  const parsed = await parseStringPromise(content, { explicitArray: false });

  const gpx = parsed.gpx;
  const trk = gpx.trk;
  if (!trk) throw new Error('Tidak ada track (trk) di GPX');

  const trkseg = Array.isArray(trk.trkseg) ? trk.trkseg[0] : trk.trkseg;
  const trkpts = Array.isArray(trkseg.trkpt) ? trkseg.trkpt : [trkseg.trkpt];

  return trkpts.map((pt: any) => ({
    lat: parseFloat(pt.$.lat),
    lon: parseFloat(pt.$.lon),
    ele: pt.ele ? parseFloat(pt.ele) : 0,
    time: pt.time ? new Date(pt.time) : new Date(0),
  }));
}

function filterGpxSpikes(points: GpxPoint[]): GpxPoint[] {
  if (points.length < 2) return points;

  const filtered: GpxPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = points[i];
    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const dt = Math.abs(curr.time.getTime() - prev.time.getTime()) / 1000;
    const speed = dt > 0 ? dist / dt : 0;

    // Filter out points > 100 m/s (360 km/h) - clear GPS error
    if (speed < 100) {
      filtered.push(curr);
    }
  }
  return filtered;
}

interface FramePosition {
  lat: number;
  lon: number;
  cumulativeDist: number;
  gpsMissing: boolean;
}

function selectFramePositions(points: GpxPoint[], spacingM: number): FramePosition[] {
  const frames: FramePosition[] = [];
  let cumulativeDist = 0;
  let lastFrameDist = 0;
  let lastGpsTime: Date = points[0].time;

  frames.push({
    lat: points[0].lat,
    lon: points[0].lon,
    cumulativeDist: 0,
    gpsMissing: false,
  });

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    cumulativeDist += dist;

    const timeDiff = Math.abs(curr.time.getTime() - lastGpsTime.getTime()) / 1000;
    const gpsMissing = timeDiff > 30;
    if (!gpsMissing) lastGpsTime = curr.time;

    while (cumulativeDist - lastFrameDist >= spacingM) {
      lastFrameDist += spacingM;
      // Interpolate position
      const t = (lastFrameDist - (cumulativeDist - dist)) / dist;
      const lat = prev.lat + t * (curr.lat - prev.lat);
      const lon = prev.lon + t * (curr.lon - prev.lon);

      frames.push({ lat, lon, cumulativeDist: lastFrameDist, gpsMissing });
    }
  }

  return frames;
}

async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);

    let output = '';
    proc.stdout.on('data', (d: Buffer) => (output += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()) || 60);
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

async function extractFrame(videoPath: string, timeS: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-ss', timeS.toFixed(3),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath,
    ]);

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code} at time ${timeS}`));
    });
    proc.on('error', reject);
  });
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes('import')) {
  const args = process.argv.slice(2);
  const opts: Partial<ImportOptions> = {};

  for (let i = 0; i < args.length; i += 2) {
    switch (args[i]) {
      case '--input': opts.inputPath = args[i + 1]; break;
      case '--gpx': opts.gpxPath = args[i + 1]; break;
      case '--title': opts.title = args[i + 1]; break;
      case '--spacing': opts.spacing = parseInt(args[i + 1], 10); break;
    }
  }

  if (!opts.inputPath || !opts.gpxPath || !opts.title) {
    console.error('Penggunaan: node import.ts --input video.mp4 --gpx track.gpx --title "Nama Ruas" [--spacing 8]');
    process.exit(1);
  }

  runImport({
    inputPath: opts.inputPath,
    gpxPath: opts.gpxPath,
    title: opts.title,
    spacing: opts.spacing ?? 8,
  }).catch((err) => {
    console.error('Import gagal:', err);
    process.exit(1);
  });
}
