import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// backups.ts reads BACKUP_DIR / BACKUP_RETENTION and config.databaseUrl at module
// load, so set the environment before importing it.
const BACKUP_DIR = path.join(await mkdtemp(path.join(tmpdir(), 'katei-bk-')), 'backups');
process.env.BACKUP_DIR = BACKUP_DIR;
process.env.BACKUP_RETENTION = '3';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { pruneBackups } = await import('./backups.js');

async function seed(names: string[]) {
  await rm(BACKUP_DIR, { recursive: true, force: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  for (const n of names) await writeFile(path.join(BACKUP_DIR, n), 'SQL');
}

after(async () => {
  await rm(path.dirname(BACKUP_DIR), { recursive: true, force: true });
});

test('pruneBackups keeps only the newest RETENTION dumps', async () => {
  await seed([
    'katei_2026-06-25.sql',
    'katei_2026-06-26.sql',
    'katei_2026-06-27.sql',
    'katei_2026-06-28.sql',
    'katei_2026-06-29.sql',
  ]);
  await pruneBackups();
  const left = (await readdir(BACKUP_DIR)).sort();
  assert.deepEqual(left, [
    'katei_2026-06-27.sql',
    'katei_2026-06-28.sql',
    'katei_2026-06-29.sql',
  ]);
});

test('pruneBackups leaves non-matching files untouched', async () => {
  await seed([
    'katei_2026-06-01.sql',
    'katei_2026-06-02.sql',
    'katei_2026-06-03.sql',
    'katei_2026-06-04.sql',
    'notes.txt',
    'katei_backup.sql', // wrong shape — not date-stamped
  ]);
  await pruneBackups();
  const left = (await readdir(BACKUP_DIR)).sort();
  // One dated dump pruned (4 → 3); the two non-matching files survive.
  assert.deepEqual(left, [
    'katei_2026-06-02.sql',
    'katei_2026-06-03.sql',
    'katei_2026-06-04.sql',
    'katei_backup.sql',
    'notes.txt',
  ]);
});

test('pruneBackups does nothing when fewer than RETENTION dumps exist', async () => {
  await seed(['katei_2026-06-10.sql', 'katei_2026-06-11.sql']);
  await pruneBackups();
  assert.equal((await readdir(BACKUP_DIR)).length, 2);
});

test('pruneBackups handles a missing directory without throwing', async () => {
  await rm(BACKUP_DIR, { recursive: true, force: true });
  await assert.doesNotReject(pruneBackups());
});
