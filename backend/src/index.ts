// Katei API — Fastify bootstrap.
// The app itself is wired in app.ts (buildApp); this file applies migrations,
// loads the persistent JWT secret, builds the app, listens, and starts the
// background schedulers. In the single-image production build, the app also
// serves the compiled React SPA from ./public (copied in by the Dockerfile).

import { config } from './config.js';
import { verifyConnection, migrate, getOrCreateAuthSecret, seedSettingsFromEnv } from './db.js';
import { buildApp } from './app.js';
import { startScheduler } from './lib/notifications.js';
import { startBackupScheduler } from './lib/backups.js';

// Apply schema migrations, seed any env-provided settings, and load the
// persistent JWT secret before wiring auth.
await migrate();
await seedSettingsFromEnv();
const authSecret = await getOrCreateAuthSecret();

const app = await buildApp({ jwtSecret: authSecret, logger: true, corsOrigins: config.corsOrigins });

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
