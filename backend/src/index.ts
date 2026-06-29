// Katei API — Fastify bootstrap.
// In the single-image production build, this server also serves the
// compiled React SPA from ./public (copied in by the root Dockerfile).

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { verifyConnection, migrate, getOrCreateAuthSecret, seedSettingsFromEnv } from './db.js';
import { apiRoutes } from './routes/index.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { startScheduler } from './lib/notifications.js';
import { startBackupScheduler } from './lib/backups.js';

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

// Apply schema migrations, seed any env-provided settings, and load the
// persistent JWT secret before wiring auth.
await migrate();
await seedSettingsFromEnv();
const authSecret = await getOrCreateAuthSecret();

await app.register(cookie);
await app.register(jwt, {
  secret: authSecret,
  cookie: { cookieName: 'katei_session', signed: false },
});

// Guard used to require a valid session on protected routes.
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
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

// Public auth endpoints (login, register, logout, me, status).
await app.register(authRoutes, { prefix: '/api/auth' });

// All domain routers live under /api and require an authenticated session.
await app.register(async (instance) => {
  instance.addHook('onRequest', app.authenticate);
  await instance.register(apiRoutes, { prefix: '/api' });
  await instance.register(settingsRoutes, { prefix: '/api/settings' });
});

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
    // Begin the hourly sweep (recurring-event generation + due-soon reminders)
    // and the daily database backup.
    startScheduler(app.log);
    startBackupScheduler(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
