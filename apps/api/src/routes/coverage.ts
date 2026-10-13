import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCoverageGeoJSON } from '../db/sequences.js';

const bboxSchema = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);

export async function coverageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/coverage', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const bboxStr = query.bbox;

    if (!bboxStr || !bboxSchema.safeParse(bboxStr).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_BBOX',
          message: 'Parameter bbox diperlukan: minLon,minLat,maxLon,maxLat',
        },
      });
    }

    const [minLon, minLat, maxLon, maxLat] = bboxStr.split(',').map(Number);

    const features = await getCoverageGeoJSON({ minLon, minLat, maxLon, maxLat });

    return reply.send({
      type: 'FeatureCollection',
      features,
    });
  });
}
