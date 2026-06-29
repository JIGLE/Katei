// Katei API — Fastify bootstrap.

import Fastify from 'fastify';
import cors from '@fastify/cors';
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
