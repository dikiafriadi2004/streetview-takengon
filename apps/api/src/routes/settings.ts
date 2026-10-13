import type { FastifyInstance } from 'fastify';
import { getActive } from '../db/mapAreas.js';

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/settings/map
  fastify.get('/api/settings/map', async (_request, reply) => {
    const area = await getActive();

    if (!area) {
      // Return default values for Takengon
      return reply.send({
        name: 'Bawaan',
        center: { lat: 4.62, lon: 96.84 },
        zoom: 12,
        bounds: null,
      });
    }

    return reply.send({
      name: area.name,
      center: { lat: area.center_lat, lon: area.center_lon },
      zoom: area.zoom,
      bounds:
        area.min_lat !== null &&
        area.min_lon !== null &&
        area.max_lat !== null &&
        area.max_lon !== null
          ? {
              minLat: area.min_lat,
              minLon: area.min_lon,
              maxLat: area.max_lat,
              maxLon: area.max_lon,
            }
          : null,
    });
  });
}
