// Katei API — Fastify bootstrap.
// In the single-image production build, this server also serves the
// compiled React SPA from ./public (copied in by the root Dockerfile).

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { verifyConnection } from './db.js';
import { apiRoutes } from './routes/index.js';

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

// Liveness + database connectivity probe.
app.get('/health', async () => {
  let db = 'disconnected';
  try {
    await verifyConnection();
    db = 'connected';
  } catch (err) {
    app.log.error(err);
  }
  return { status: 'ok', db };
});

// All domain routers live under /api.
await app.register(apiRoutes, { prefix: '/api' });

// Serve the bundled SPA when present (production single-image build).
// In local dev the Vite dev server serves the frontend instead, so this
// block is skipped because ./public does not exist.
const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dirname, '..', 'public');
if (existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });

  // SPA fallback — any non-API GET returns index.html so react-router
  // handles client-side routing.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  app.log.info(`Serving SPA from ${publicDir}`);
}

const start = async () => {
  try {
    await verifyConnection();
    app.log.info('Database connection verified.');
  } catch (err) {
    app.log.error({ err }, 'Database unreachable at startup — continuing; /health will report status.');
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
