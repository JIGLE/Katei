// Fastify application factory. Builds and wires the app (plugins, auth guard,
// routes, optional static SPA) but does NOT listen or start schedulers — so it
// can be driven by `app.inject()` in tests without side effects. The production
// bootstrap (index.ts) computes the JWT secret, calls this, then listens.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyConnection } from './db.js';
import { apiRoutes } from './routes/index.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { calendarRoutes } from './routes/calendar.js';

export interface BuildAppOptions {
  jwtSecret: string;
  logger?: boolean;
  /** Serve the bundled SPA from ./public when present (production image). */
  serveStatic?: boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  // Avatar uploads — cap at 2 MB, one file per request.
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
  await app.register(jwt, {
    secret: opts.jwtSecret,
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

  // Turn unhandled errors into clean, logged responses rather than opaque 500s.
  // Postgres errors carry a 5-char SQLSTATE `code`; map the common ones to a 4xx
  // with a friendly message so the UI can show something useful (and we log the
  // real cause). Anything else stays a generic 500.
  const PG_ERRORS: Record<string, [number, string]> = {
    '23505': [409, 'That already exists.'],
    '23503': [400, 'A linked item no longer exists.'],
    '23502': [400, 'A required value is missing.'],
    '22P02': [400, 'That value is not valid.'],
  };
  app.setErrorHandler((error, req, reply) => {
    // Fastify schema validation failures are already client errors.
    if (error.validation) {
      return reply.code(400).send({ error: error.message });
    }
    const pgCode = (error as { code?: unknown }).code;
    if (typeof pgCode === 'string' && PG_ERRORS[pgCode]) {
      const [status, message] = PG_ERRORS[pgCode];
      req.log.error({ err: error, pgCode }, 'Database error');
      return reply.code(status).send({ error: message });
    }
    const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) req.log.error({ err: error }, 'Unhandled error');
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
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

  // Public iCalendar feed — token-gated, no session (calendar apps can't send one).
  await app.register(calendarRoutes, { prefix: '/api/calendar' });

  // All domain routers live under /api and require an authenticated session.
  await app.register(async (instance) => {
    instance.addHook('onRequest', app.authenticate);
    await instance.register(apiRoutes, { prefix: '/api' });
    await instance.register(settingsRoutes, { prefix: '/api/settings' });
  });

  // Serve the bundled SPA when present (production single-image build). In dev
  // and tests this is skipped because ./public does not exist.
  if (opts.serveStatic ?? true) {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const publicDir = path.join(dirname, '..', 'public');
    if (existsSync(publicDir)) {
      await app.register(fastifyStatic, { root: publicDir });
      app.setNotFoundHandler((req, reply) => {
        if (req.method === 'GET' && !req.url.startsWith('/api')) {
          return reply.sendFile('index.html');
        }
        return reply.code(404).send({ error: 'Not found' });
      });
      app.log.info(`Serving SPA from ${publicDir}`);
    }
  }

  return app;
}
