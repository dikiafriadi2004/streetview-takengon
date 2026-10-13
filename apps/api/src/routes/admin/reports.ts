import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { listReports, resolveReport } from '../../db/reports.js';

export async function adminReportRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/admin/reports?status=open
  fastify.get(
    '/api/admin/reports',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const reports = await listReports(query.status);
      return reply.send(reports);
    }
  );

  // PATCH /api/admin/reports/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/reports/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const schema = z.object({
        status: z.literal('resolved'),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      await resolveReport(id);
      return reply.send({ message: 'Laporan diselesaikan' });
    }
  );
}
