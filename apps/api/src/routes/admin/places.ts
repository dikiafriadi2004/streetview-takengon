import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import {
  listPlaces,
  createPlace,
  updatePlace,
  deletePlace,
} from '../../db/places.js';

const placeSchema = z.object({
  name: z.string().min(1).max(150),
  category: z.string().max(50).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  photoId: z.number().int().positive().optional(),
});

const patchPlaceSchema = placeSchema.partial();

export async function adminPlaceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/admin/places
  fastify.get(
    '/api/admin/places',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      const places = await listPlaces();
      return reply.send(places);
    }
  );

  // POST /api/admin/places
  fastify.post(
    '/api/admin/places',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = placeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const id = await createPlace(parsed.data);
      return reply.code(201).send({ id });
    }
  );

  // PATCH /api/admin/places/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/places/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const parsed = patchPlaceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      await updatePlace(id, {
        name: parsed.data.name,
        category: parsed.data.category,
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        photoId: parsed.data.photoId,
      });
      return reply.send({ message: 'Tempat diperbarui' });
    }
  );

  // DELETE /api/admin/places/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/places/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }
      await deletePlace(id);
      return reply.send({ message: 'Tempat dihapus' });
    }
  );
}
