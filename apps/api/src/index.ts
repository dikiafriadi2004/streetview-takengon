import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { coverageRoutes } from './routes/coverage.js';
import { photoRoutes } from './routes/photos.js';
import { placeRoutes } from './routes/places.js';
import { reportRoutes } from './routes/reports.js';
import { settingsRoutes } from './routes/settings.js';
import { adminAuthRoutes } from './routes/admin/auth.js';
import { adminSequenceRoutes } from './routes/admin/sequences.js';
import { adminPhotoRoutes } from './routes/admin/photos.js';
import { adminPlaceRoutes } from './routes/admin/places.js';
import { adminReportRoutes } from './routes/admin/reports.js';
import { adminMapAreaRoutes } from './routes/admin/mapAreas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  bodyLimit: 30 * 1024 * 1024, // 30 MB
});

// Plugins
await fastify.register(fastifyCookie);

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB for video uploads
  },
});

await fastify.register(fastifyRateLimit, {
  global: false,
  max: 100,
  timeWindow: '1 minute',
});

// Apply rate limit specifically to report endpoint
fastify.addHook('onRoute', (routeOptions) => {
  if (routeOptions.url === '/api/reports' && routeOptions.method === 'POST') {
    routeOptions.config = { rateLimit: { max: 5, timeWindow: '1 minute' } };
  }
});

// Serve static media files from storage
const rawStorageDir = process.env.STORAGE_DIR ?? './storage';
const storageDir = path.isAbsolute(rawStorageDir)
  ? rawStorageDir
  : path.resolve(process.cwd(), rawStorageDir);
await fastify.register(fastifyStatic, {
  root: storageDir,
  prefix: '/media/',
  decorateReply: false,
});

// CORS for development
fastify.addHook('onSend', async (request, reply) => {
  const origin = request.headers.origin;
  if (origin) {
    void reply.header('Access-Control-Allow-Origin', origin);
    void reply.header('Access-Control-Allow-Credentials', 'true');
    void reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    void reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
});

fastify.options('*', async (_request, reply) => {
  return reply.code(204).send();
});

// Register routes
await fastify.register(coverageRoutes);
await fastify.register(photoRoutes);
await fastify.register(placeRoutes);
await fastify.register(reportRoutes);
await fastify.register(settingsRoutes);
await fastify.register(adminAuthRoutes);
await fastify.register(adminSequenceRoutes);
await fastify.register(adminPhotoRoutes);
await fastify.register(adminPlaceRoutes);
await fastify.register(adminReportRoutes);
await fastify.register(adminMapAreaRoutes);

// Health check
fastify.get('/health', async () => ({ status: 'ok' }));

const port = parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await fastify.listen({ port, host });
  fastify.log.info(`Server berjalan di http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
