// Scheduled database backups via pg_dump. A daily dump is written to a folder
// inside the PostgreSQL data volume so it persists across container restarts;
// the most recent N are kept and older ones pruned.

import type { FastifyBaseLogger } from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

// Inside the mounted data volume → survives restarts and redeploys.
export const BACKUP_DIR = process.env.BACKUP_DIR ?? '/var/lib/postgresql/data/katei_backups';
const RETENTION = Number(process.env.BACKUP_RETENTION ?? 7);
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const FILE_RE = /^katei_\d{4}-\d{2}-\d{2}\.sql$/;

/** Whether a name is a valid backup filename (guards against path traversal). */
export function isValidBackupName(name: string): boolean {
  return FILE_RE.test(name);
}

/** Absolute path for a validated backup name, or null if the name is unsafe. */
export function backupPath(name: string): string | null {
  return isValidBackupName(name) ? path.join(BACKUP_DIR, name) : null;
}

export interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
}

/** List available backups, newest first, with size and modified time. */
export async function listBackups(): Promise<BackupInfo[]> {
  let files: string[];
  try {
    files = (await readdir(BACKUP_DIR)).filter((f) => FILE_RE.test(f));
  } catch {
    return [];
  }
  const infos = await Promise.all(
    files.map(async (name) => {
      const s = await stat(path.join(BACKUP_DIR, name));
      return { name, size: s.size, created_at: s.mtime.toISOString() };
    }),
  );
  // Date-stamped names sort chronologically; newest first for display.
  return infos.sort((a, b) => b.name.localeCompare(a.name));
}

/** Delete the oldest dumps, keeping only the most recent RETENTION files. */
export async function pruneBackups(log?: FastifyBaseLogger): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(BACKUP_DIR)).filter((f) => FILE_RE.test(f));
  } catch {
    return; // directory not created yet — nothing to prune
  }
  // Date-stamped names sort chronologically, so the head is the oldest.
  files.sort();
  const stale = files.slice(0, Math.max(0, files.length - RETENTION));
  for (const f of stale) {
    try {
      await unlink(path.join(BACKUP_DIR, f));
      log?.info(`Pruned old backup ${f}`);
    } catch (err) {
      log?.error({ err, file: f }, 'Failed to prune backup');
    }
  }
}

/** Run a single pg_dump to a date-stamped file, then prune old dumps. */
export async function runBackup(log?: FastifyBaseLogger): Promise<string | null> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const outFile = path.join(BACKUP_DIR, `katei_${date}.sql`);

  try {
    // pg_dump reads the connection from --dbname; -f writes plain SQL.
    // --clean --if-exists makes the dump self-contained: restoring it onto an
    // existing database drops and recreates objects, so `psql -f dump.sql`
    // fully replaces current data with the snapshot.
    await execFileAsync('pg_dump', [
      '--dbname', config.databaseUrl,
      '--clean', '--if-exists',
      '-f', outFile,
    ]);
    log?.info(`Database backup written to ${outFile}`);
    await pruneBackups(log);
    return outFile;
  } catch (err) {
    log?.error({ err }, 'Database backup failed');
    return null;
  }
}

/** Start the daily backup scheduler. Runs once shortly after boot. */
export function startBackupScheduler(log: FastifyBaseLogger): void {
  const run = () => {
    runBackup(log).catch((err) => log.error({ err }, 'Backup run failed'));
  };
  setTimeout(run, 30_000); // after startup settles
  setInterval(run, BACKUP_INTERVAL_MS);
}
