import type { FastifyInstance } from 'fastify';
import { searchByName } from '../db/places.js';

export async function placeRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/places?q=
  fastify.get('/api/places', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const q = (query.q ?? '').trim();

    if (!q) {
      return reply.code(400).send({
        error: { code: 'MISSING_QUERY', message: 'Parameter q diperlukan' },
      });
    }

    const places = await searchByName(q);
    return reply.send(
      places.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lat: p.lat,
        lon: p.lon,
      }))
    );
  });
}
