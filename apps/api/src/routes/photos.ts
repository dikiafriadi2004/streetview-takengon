import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findNearest, findById } from '../db/photos.js';
import { pool } from '../db/pool.js';
import type { RowDataPacket } from 'mysql2';

const STORAGE_BASE = process.env.STORAGE_BASE ?? '';

function buildPhotoUrl(filePath: string): string {
  if (filePath.startsWith('/media/') || filePath.startsWith('http')) return filePath;
  return `${STORAGE_BASE}/media/${filePath}`;
}

function buildThumbUrl(thumbPath: string): string {
  if (thumbPath.startsWith('/media/') || thumbPath.startsWith('http')) return thumbPath;
  return `${STORAGE_BASE}/media/${thumbPath}`;
}

export async function photoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/photos/nearest?lat=&lon=&maxM=30
  fastify.get('/api/photos/nearest', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const schema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
      maxM: z.coerce.number().min(1).max(500).optional().default(30),
    });

    const parsed = schema.safeParse(query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_PARAMS', message: parsed.error.message },
      });
    }

    const { lat, lon, maxM } = parsed.data;
    const photo = await findNearest(lat, lon, maxM);

    if (!photo) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Tidak ada foto dalam jangkauan' },
      });
    }

    return reply.send({
      id: photo.id,
      url: buildPhotoUrl(photo.file_path),
      thumbUrl: buildThumbUrl(photo.thumb_path),
      lat: Number(photo.lat),
      lon: Number(photo.lon),
      headingDeg: Number(photo.heading_deg),
      northOffsetDeg: Number(photo.north_offset_deg),
      projection: photo.projection,
      distM: Number(photo.dist_m),
    });
  });

  // GET /api/photos/thumb/:id — redirect to thumbnail media URL (used for prefetch)
  fastify.get<{ Params: { id: string } }>('/api/photos/thumb/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT thumb_path FROM photos WHERE id = ? AND status = 'published'`,
      [id]
    );

    if (!rows.length) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Foto tidak ditemukan' } });
    }

    const thumbPath = rows[0].thumb_path as string;
    return reply.redirect(302, buildThumbUrl(thumbPath));
  });

  // GET /api/photos/:id
  fastify.get<{ Params: { id: string } }>('/api/photos/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
    }

    const photo = await findById(id);
    if (!photo) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Foto tidak ditemukan' } });
    }

    return reply.send({
      id: photo.id,
      url: buildPhotoUrl(photo.file_path),
      thumbUrl: buildThumbUrl(photo.thumb_path),
      lat: Number(photo.lat),
      lon: Number(photo.lon),
      headingDeg: Number(photo.heading_deg),
      northOffsetDeg: Number(photo.north_offset_deg),
      projection: photo.projection,
      panoData: photo.pano_data
        ? (typeof photo.pano_data === 'string' ? JSON.parse(photo.pano_data) : photo.pano_data)
        : null,
      near: photo.near,
      neighbors: photo.neighbors.map((n) => ({
        id: n.id,
        bearingDeg: Number(n.bearingDeg),
        distanceM: Number(n.distanceM),
      })),
    });
  });
}
