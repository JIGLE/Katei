// Uploaded member avatars live in a subdirectory of the data volume (persisted
// like the backups). Files are served back through GET /api/avatars/:file.

import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const AVATAR_DIR = process.env.AVATAR_DIR ?? '/var/lib/postgresql/data/katei_avatars';

// Only bare filenames we generate — blocks path traversal on the serve route.
const NAME_RE = /^[A-Za-z0-9_]+\.(jpg|png)$/;

export function isValidAvatarName(name: string): boolean {
  return NAME_RE.test(name);
}

/** Resolve a stored avatar to an absolute path, or null if the name is unsafe. */
export function avatarPath(name: string): string | null {
  return isValidAvatarName(name) ? path.join(AVATAR_DIR, name) : null;
}

/** Persist an avatar for a user and return its public URL (/api/avatars/<file>). */
export async function saveAvatar(userId: number, buf: Buffer, ext: 'jpg' | 'png'): Promise<string> {
  await mkdir(AVATAR_DIR, { recursive: true });
  const name = `${userId}_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
  await writeFile(path.join(AVATAR_DIR, name), buf);
  return `/api/avatars/${name}`;
}
