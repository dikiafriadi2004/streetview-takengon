import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { authMiddleware } from '../../middleware/auth.js';
import { listSequences, createSequence, updateStatus } from '../../db/sequences.js';

const createSequenceSchema = z.object({
  title: z.string().min(1).max(150),
  camera: z.string().max(100).optional(),
  recordedAt: z.string().optional(),
});

export async function adminSequenceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/admin/sequences
  fastify.get(
    '/api/admin/sequences',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      const sequences = await listSequences();
      return reply.send(sequences);
    }
  );

  // POST /api/admin/sequences
  fastify.post(
    '/api/admin/sequences',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const parsed = createSequenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      const userId = parseInt(request.user!.sub, 10);
      const id = await createSequence({ userId, ...parsed.data });
      return reply.code(201).send({ id });
    }
  );

  // POST /api/admin/sequences/:id/upload (multipart: video mp4 + gpx)
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/sequences/:id/upload',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const sequenceId = parseInt(request.params.id, 10);
      if (isNaN(sequenceId)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sv-upload-'));
      let videoPath: string | null = null;
      let gpxPath: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            const filePart = part as MultipartFile;
            const dest = path.join(tmpDir, filePart.filename);
            const buffer = await filePart.toBuffer();
            await fs.writeFile(dest, buffer);

            if (filePart.fieldname === 'video' || filePart.filename.endsWith('.mp4')) {
              videoPath = dest;
            } else if (filePart.fieldname === 'gpx' || filePart.filename.endsWith('.gpx')) {
              gpxPath = dest;
            }
          }
        }

        if (!videoPath || !gpxPath) {
          return reply.code(400).send({
            error: {
              code: 'MISSING_FILES',
              message: 'File video (mp4) dan GPX diperlukan',
            },
          });
        }

        // Trigger pipeline asynchronously (in background)
        // The actual pipeline is in cli/import.ts
        // Here we just acknowledge receipt and return
        const storageDir = process.env.STORAGE_DIR ?? './storage';
        const spacing = 8; // default

        // Run import pipeline (non-blocking response)
        import('../../cli/import.js')
          .then(({ runImport }) =>
            runImport({
              inputPath: videoPath!,
              gpxPath: gpxPath!,
              title: `Sequence ${sequenceId}`,
              spacing,
              sequenceId,
              storageDir,
            })
          )
          .catch((err: Error) => {
            fastify.log.error({ err }, 'Pipeline import gagal');
          })
          .finally(async () => {
            await fs.rm(tmpDir, { recursive: true }).catch(() => {});
          });

        return reply.code(202).send({
          message: 'Unggahan diterima, sedang diproses',
          sequenceId,
        });
      } catch (err) {
        await fs.rm(tmpDir, { recursive: true }).catch(() => {});
        throw err;
      }
    }
  );

  // PATCH /api/admin/sequences/:id
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/sequences/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: { code: 'INVALID_ID', message: 'ID tidak valid' } });
      }

      const body = request.body as Record<string, unknown>;
      const statusSchema = z.object({
        status: z.enum(['draft', 'published', 'hidden']),
      });
      const parsed = statusSchema.safeParse(body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }

      await updateStatus(id, parsed.data.status);
      return reply.send({ message: 'Status diperbarui' });
    }
  );
}
