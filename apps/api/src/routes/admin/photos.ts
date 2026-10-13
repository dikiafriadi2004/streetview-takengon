import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import sharp from 'sharp';
import { authMiddleware } from '../../middleware/auth.js';
import {
  listAdminPhotos,
  updateStatus,
  updateLocation,
  insertPhoto,
  deletePhoto,
} from '../../db/photos.js';
import { findOrCreateManualSequence, getNextSeqIndex } from '../../db/sequences.js';
import { readGpsExif } from '../../services/exif.js';
import { createThumb } from '../../services/thumbnail.js';
import { buildNeighborLinks } from '../../services/neighbor.js';
import { LocalStorageDriver } from '../../storage/local.js';
import { pool } from '../../db/pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

function getStorage(): LocalStorageDriver {
  const dir = process.env.STORAGE_DIR ?? './storage';
  return new LocalStorageDriver(dir);
}

const MAX_PHOTO_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function adminPhotoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/admin/photos?sequenceId=&status=
  fastify.get(
    '/api/admin/photos',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const filter: { sequenceId?: number; status?: string } = {};
      if (query.sequenceId) filter.sequenceId = parseInt(query.sequenceId, 10);
      if (query.status) filter.status = query.status;

      const photos = await listAdminPhotos(filter);
      return reply.send(photos);
    }
  );

  // PATCH /api/admin/photos/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/photos/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const patchSchema = z.object({
        status: z.enum(['draft', 'published', 'hidden']).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lon: z.number().min(-180).max(180).optional(),
        northOffsetDeg: z.number().min(-360).max(360).optional(),
      });

      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      const { status, lat, lon, northOffsetDeg } = parsed.data;

      if (status) await updateStatus(id, status);
      if (lat !== undefined && lon !== undefined) {
        await updateLocation(id, lat, lon, northOffsetDeg);
      } else if (northOffsetDeg !== undefined) {
        await updateLocation(id, 0, 0, northOffsetDeg);
      }

      return reply.send({ message: 'Foto diperbarui' });
    }
  );

  // POST /api/admin/photos (multipart upload)
  fastify.post(
    '/api/admin/photos',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sv-photo-'));
      let fileBuffer: Buffer | null = null;
      let originalFilename = 'photo.jpg';
      let mimeType = '';
      const fields: Record<string, string> = {};

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            const fp = part as MultipartFile;
            mimeType = fp.mimetype;
            originalFilename = fp.filename;
            fileBuffer = await fp.toBuffer();
          } else {
            fields[part.fieldname] = (part as { value: string }).value;
          }
        }

        if (!fileBuffer) {
          return reply.code(400).send({
            error: { code: 'MISSING_FILE', message: 'File foto diperlukan' },
          });
        }

        if (!ALLOWED_MIME.has(mimeType)) {
          return reply.code(400).send({
            error: { code: 'INVALID_TYPE', message: 'Format file harus JPEG, PNG, atau WebP' },
          });
        }

        if (fileBuffer.length > MAX_PHOTO_SIZE) {
          return reply.code(400).send({
            error: { code: 'FILE_TOO_LARGE', message: 'Ukuran file maksimal 25 MB' },
          });
        }

        // Validate image dimensions
        const meta = await sharp(fileBuffer).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;

        const projection = fields.projection ?? 'equirectangular';
        if (projection === 'equirectangular') {
          const ratio = width / height;
          if (ratio < 1.9 || ratio > 2.1) {
            return reply.code(400).send({
              error: {
                code: 'INVALID_RATIO',
                message: 'Foto 360° equirectangular harus memiliki rasio 2:1',
              },
            });
          }
        }

        // Read EXIF GPS if lat/lon not provided
        let lat = fields.lat ? parseFloat(fields.lat) : NaN;
        let lon = fields.lon ? parseFloat(fields.lon) : NaN;

        if (isNaN(lat) || isNaN(lon)) {
          const tmpFile = path.join(tmpDir, originalFilename);
          await fs.writeFile(tmpFile, fileBuffer);
          const gps = await readGpsExif(tmpFile);
          if (gps) {
            lat = gps.lat;
            lon = gps.lon;
          }
        }

        if (isNaN(lat) || isNaN(lon)) {
          return reply.code(400).send({
            error: { code: 'MISSING_LOCATION', message: 'Koordinat GPS diperlukan' },
          });
        }

        const headingDeg = fields.headingDeg ? parseFloat(fields.headingDeg) : 0;
        const status = (fields.status as 'draft' | 'published' | 'hidden') ?? 'draft';

        // Save files via storage driver
        const storage = getStorage();
        const ext = path.extname(originalFilename) || '.jpg';
        const timestamp = Date.now();
        const photoKey = `photos/p_${timestamp}${ext}`;
        const thumbKey = `thumbs/t_${timestamp}.jpg`;

        const photoUrl = await storage.save(photoKey, fileBuffer);

        // Create thumbnail
        const thumbBuffer = await sharp(fileBuffer)
          .resize(640, undefined, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        await storage.save(thumbKey, thumbBuffer);

        // Get or create 'Input manual' sequence
        const userId = parseInt(request.user!.sub, 10);
        const sequenceId = await findOrCreateManualSequence(userId);
        const seqIndex = await getNextSeqIndex(sequenceId);

        // Insert photo
        const photoId = await insertPhoto({
          sequenceId,
          seqIndex,
          lat,
          lon,
          headingDeg,
          projection: projection as 'equirectangular' | 'flat',
          filePath: photoUrl,
          thumbPath: storage.getUrl(thumbKey),
          status,
        });

        // Build links to nearby photos (within 15m)
        const [nearbyRows] = await pool.query<RowDataPacket[]>(
          `SELECT id,
                  ST_Y(location) AS lat,
                  ST_X(location) AS lon,
                  sequence_id,
                  seq_index
           FROM photos
           WHERE id != ?
             AND ST_Distance_Sphere(location,
               ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326, 'axis-order=long-lat')
             ) < 15`,
          [photoId, lon, lat]
        );

        if (nearbyRows.length > 0) {
          const allPhotos = [
            { id: photoId, sequenceId, seqIndex, lat, lon },
            ...nearbyRows.map((r) => ({
              id: r.id as number,
              sequenceId: r.sequence_id as number,
              seqIndex: r.seq_index as number,
              lat: r.lat as number,
              lon: r.lon as number,
            })),
          ];
          const links = buildNeighborLinks(allPhotos);
          for (const link of links) {
            await pool.query<ResultSetHeader>(
              `INSERT IGNORE INTO photo_links (from_photo_id, to_photo_id, bearing_deg, distance_m)
               VALUES (?, ?, ?, ?)`,
              [link.fromPhotoId, link.toPhotoId, link.bearingDeg, link.distanceM]
            );
          }
        }

        return reply.code(201).send({
          id: photoId,
          url: photoUrl,
          thumbUrl: storage.getUrl(thumbKey),
          lat,
          lon,
          headingDeg,
          projection,
          status,
        });
      } finally {
        await fs.rm(tmpDir, { recursive: true }).catch(() => {});
      }
    }
  );

  // DELETE /api/admin/photos/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/photos/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      // Get file paths before deleting
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT file_path, thumb_path FROM photos WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Foto tidak ditemukan' } });
      }

      // Delete files from storage
      const storage = getStorage();
      const filePath = rows[0].file_path as string;
      const thumbPath = rows[0].thumb_path as string;

      // Extract key from URL path
      const fileKey = filePath.replace('/media/', '');
      const thumbKey = thumbPath.replace('/media/', '');

      await storage.delete(fileKey).catch(() => {});
      await storage.delete(thumbKey).catch(() => {});

      // Delete from database (photo_links + photo)
      await deletePhoto(id);

      return reply.send({ message: 'Foto dihapus' });
    }
  );
}
