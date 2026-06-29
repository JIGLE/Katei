// Authentication: per-user accounts with an httpOnly session cookie.
//
// Bootstrapping: until at least one account has a password set, the app is in
// "setup" mode and registration is open so the first member can create an
// account. After that, creating further accounts requires being logged in.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const COOKIE_NAME = 'katei_session';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: 'auto' as const, // Secure flag set automatically when served over HTTPS.
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

interface UserRow {
  id: number;
  name: string;
  avatar_url: string | null;
  created_at: string;
  password_hash: string | null;
}

async function accountCount(): Promise<number> {
  const { rows } = await query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM users WHERE password_hash IS NOT NULL`,
  );
  return rows[0]?.c ?? 0;
}

function publicUser(u: UserRow) {
  return { id: u.id, name: u.name, avatar_url: u.avatar_url, created_at: u.created_at };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Whether first-run setup is still needed (no accounts with passwords yet).
  app.get('/status', async () => ({ needsSetup: (await accountCount()) === 0 }));

  // Current session user, or 401.
  app.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    const { rows } = await query<UserRow>(
      `SELECT id, name, avatar_url, created_at, password_hash FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (!rows.length) return reply.code(401).send({ error: 'Not authenticated' });
    return publicUser(rows[0]);
  });

  // Create an account. Open during first-run setup; otherwise requires auth.
  // If a member already exists by name without a password, the account is
  // "claimed" by setting its password — linking the login to that person.
  app.post<{ Body: { name: string; password: string } }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const setup = (await accountCount()) === 0;
      if (!setup) {
        try {
          await req.jwtVerify();
        } catch {
          return reply.code(403).send({ error: 'Registration requires an existing account' });
        }
      }

      const { name, password } = req.body;
      const hash = await hashPassword(password);

      const existing = await query<UserRow>(
        `SELECT id, name, avatar_url, created_at, password_hash FROM users WHERE name = $1`,
        [name],
      );

      let user: UserRow;
      if (existing.rows.length) {
        const found = existing.rows[0];
        if (found.password_hash) {
          return reply.code(409).send({ error: 'That name is already taken' });
        }
        // Claim the existing passwordless member row.
        const { rows } = await query<UserRow>(
          `UPDATE users SET password_hash = $1 WHERE id = $2
           RETURNING id, name, avatar_url, created_at, password_hash`,
          [hash, found.id],
        );
        user = rows[0];
      } else {
        const { rows } = await query<UserRow>(
          `INSERT INTO users (name, password_hash) VALUES ($1, $2)
           RETURNING id, name, avatar_url, created_at, password_hash`,
          [name, hash],
        );
        user = rows[0];
      }

      const token = app.jwt.sign({ id: user.id, name: user.name });
      reply.setCookie(COOKIE_NAME, token, cookieOptions);
      return reply.code(201).send(publicUser(user));
    },
  );

  // Log in with name + password.
  app.post<{ Body: { name: string; password: string } }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'password'],
          properties: {
            name: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, password } = req.body;
      const { rows } = await query<UserRow>(
        `SELECT id, name, avatar_url, created_at, password_hash FROM users WHERE name = $1`,
        [name],
      );
      const user = rows[0];
      if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
        return reply.code(401).send({ error: 'Invalid name or password' });
      }
      const token = app.jwt.sign({ id: user.id, name: user.name });
      reply.setCookie(COOKIE_NAME, token, cookieOptions);
      return publicUser(user);
    },
  );

  // Clear the session cookie.
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
};
