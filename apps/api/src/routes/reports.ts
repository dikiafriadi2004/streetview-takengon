import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createReport } from '../db/reports.js';

const reportSchema = z.object({
  photoId: z.number().int().positive(),
  type: z.enum(['privacy', 'wrong_location', 'other']),
  note: z.string().max(500).optional(),
});

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/reports — rate-limited to 5/min per IP via fastify rate-limit plugin
  fastify.post('/api/reports', async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_BODY', message: parsed.error.message },
      });
    }

    const id = await createReport(parsed.data);
    return reply.code(201).send({ id, message: 'Laporan berhasil dikirim' });
  });
}
