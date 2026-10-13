import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import {
  listMapAreas,
  createMapArea,
  updateMapArea,
  deleteMapArea,
  activateMapArea,
  getActive,
} from '../../db/mapAreas.js';

// Base object for create (required fields) and patch (partial)
const mapAreaBaseObject = z.object({
  name: z.string().min(1).max(100),
  centerLat: z.number().min(-90).max(90),
  centerLon: z.number().min(-180).max(180),
  zoom: z.number().int().min(1).max(19),
  minLat: z.number().min(-90).max(90).optional(),
  minLon: z.number().min(-180).max(180).optional(),
  maxLat: z.number().min(-90).max(90).optional(),
  maxLon: z.number().min(-180).max(180).optional(),
});

// Partial schema for PATCH (no superRefine needed for partial updates)
const mapAreaPatchSchema = mapAreaBaseObject.partial();

const mapAreaSchema = mapAreaBaseObject
  .superRefine((data, ctx) => {
    const hasBounds =
      data.minLat !== undefined ||
      data.minLon !== undefined ||
      data.maxLat !== undefined ||
      data.maxLon !== undefined;

    if (hasBounds) {
      if (
        data.minLat === undefined ||
        data.minLon === undefined ||
        data.maxLat === undefined ||
        data.maxLon === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Jika batas diisi, semua 4 nilai (minLat, minLon, maxLat, maxLon) wajib diisi',
        });
        return;
      }

      if (data.minLat >= data.maxLat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minLat harus lebih kecil dari maxLat',
          path: ['minLat'],
        });
      }
      if (data.minLon >= data.maxLon) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'minLon harus lebih kecil dari maxLon',
          path: ['minLon'],
        });
      }

      // Center must be within bounds
      if (
        data.minLat !== undefined &&
        data.maxLat !== undefined &&
        (data.centerLat < data.minLat || data.centerLat > data.maxLat)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Titik pusat harus berada di dalam batas wilayah',
          path: ['centerLat'],
        });
      }
      if (
        data.minLon !== undefined &&
        data.maxLon !== undefined &&
        (data.centerLon < data.minLon || data.centerLon > data.maxLon)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Titik pusat harus berada di dalam batas wilayah',
          path: ['centerLon'],
        });
      }
    }
  });

export async function adminMapAreaRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/admin/map-areas
  fastify.get(
    '/api/admin/map-areas',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      const areas = await listMapAreas();
      return reply.send(areas);
    }
  );

  // POST /api/admin/map-areas
  fastify.post(
    '/api/admin/map-areas',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = mapAreaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.issues.map(i => i.message).join('; ') },
        });
      }
      const id = await createMapArea(parsed.data);
      return reply.code(201).send({ id });
    }
  );

  // PATCH /api/admin/map-areas/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/map-areas/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const parsed = mapAreaPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      await updateMapArea(id, {
        name: parsed.data.name,
        centerLat: parsed.data.centerLat,
        centerLon: parsed.data.centerLon,
        zoom: parsed.data.zoom,
        minLat: parsed.data.minLat,
        minLon: parsed.data.minLon,
        maxLat: parsed.data.maxLat,
        maxLon: parsed.data.maxLon,
      });
      return reply.send({ message: 'Wilayah diperbarui' });
    }
  );

  // DELETE /api/admin/map-areas/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/map-areas/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      // Cannot delete active area
      const active = await getActive();
      if (active && active.id === id) {
        return reply.code(400).send({
          error: { code: 'CANNOT_DELETE_ACTIVE', message: 'Tidak dapat menghapus wilayah yang aktif' },
        });
      }

      await deleteMapArea(id);
      return reply.send({ message: 'Wilayah dihapus' });
    }
  );

  // POST /api/admin/map-areas/:id/activate
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/map-areas/:id/activate',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }
      await activateMapArea(id);
      return reply.send({ message: 'Wilayah diaktifkan' });
    }
  );
}
