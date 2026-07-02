// Authentication: per-user accounts with an httpOnly session cookie.
//
// Bootstrapping: until at least one account has a password set, the app is in
// "setup" mode and registration is open so the first member can create an
// account. After that, creating further accounts requires being logged in.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hit, clear } from '../lib/ratelimit.js';

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
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  password_hash: string | null;
  role: string;
}

const USER_COLS = 'id, name, email, avatar_url, created_at, password_hash, role';

async function accountCount(): Promise<number> {
  const { rows } = await query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM users WHERE password_hash IS NOT NULL`,
  );
  return rows[0]?.c ?? 0;
}

interface InviteRow {
  id: number;
  role: string;
}

/** Validate an invite code: must exist, be unused, and not expired. */
async function validInvite(code: string): Promise<InviteRow | null> {
  const { rows } = await query<InviteRow>(
    `SELECT id, role FROM invites
      WHERE code = $1 AND used_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [code],
  );
  return rows[0] ?? null;
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar_url: u.avatar_url,
    role: u.role,
    created_at: u.created_at,
  };
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
      `SELECT ${USER_COLS} FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (!rows.length) return reply.code(401).send({ error: 'Not authenticated' });
    return publicUser(rows[0]);
  });

  // Public: validate an invite code so the join screen can show its state.
  // Throttled per IP — this is otherwise a free invite-code oracle.
  app.get<{ Params: { code: string } }>('/invite/:code', async (req, reply) => {
    const gate = hit(`invitecheck:${req.ip}`, 20);
    if (!gate.ok) {
      reply.header('Retry-After', String(gate.retryAfterSec));
      return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
    }
    const invite = await validInvite(req.params.code);
    return invite ? { valid: true, role: invite.role } : { valid: false };
  });

  // Create an account. The very first account (setup) becomes admin and needs
  // no invite. After that, registration requires a valid one-time invite code,
  // which also determines the new account's role. If a passwordless member row
  // already exists by name, the account "claims" it by setting its password.
  app.post<{ Body: { name: string; password: string; invite_code?: string } }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            invite_code: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      // Throttle per IP: registration doubles as the invite-code redeemer, so
      // unthrottled it is the other half of the invite brute-force surface.
      const regGate = hit(`register:${req.ip}`, 10);
      if (!regGate.ok) {
        reply.header('Retry-After', String(regGate.retryAfterSec));
        return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
      }

      const setup = (await accountCount()) === 0;

      let role = 'admin'; // first account
      let invite: InviteRow | null = null;
      if (!setup) {
        if (!req.body.invite_code) {
          return reply.code(403).send({ error: 'An invite is required to join' });
        }
        invite = await validInvite(req.body.invite_code);
        if (!invite) {
          return reply.code(403).send({ error: 'This invite is invalid or has expired' });
        }
        role = invite.role;
      }

      const { name, password } = req.body;
      const hash = await hashPassword(password);

      const existing = await query<UserRow>(
        `SELECT ${USER_COLS} FROM users WHERE name = $1`,
        [name],
      );

      let user: UserRow;
      if (existing.rows.length) {
        const found = existing.rows[0];
        if (found.password_hash) {
          return reply.code(409).send({ error: 'That name is already taken' });
        }
        // Claim the existing passwordless member row, applying the invite role.
        const { rows } = await query<UserRow>(
          `UPDATE users SET password_hash = $1, role = $2 WHERE id = $3
           RETURNING ${USER_COLS}`,
          [hash, role, found.id],
        );
        user = rows[0];
      } else {
        const { rows } = await query<UserRow>(
          `INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3)
           RETURNING ${USER_COLS}`,
          [name, hash, role],
        );
        user = rows[0];
      }

      if (invite) {
        await query(
          `UPDATE invites SET used_at = CURRENT_TIMESTAMP, used_by = $1 WHERE id = $2`,
          [user.id, invite.id],
        );
      }

      const token = app.jwt.sign({ id: user.id, name: user.name, role: user.role });
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
      // Throttle brute force: bucket by name + client IP.
      const key = `login:${name.toLowerCase()}:${req.ip}`;
      const gate = hit(key);
      if (!gate.ok) {
        reply.header('Retry-After', String(gate.retryAfterSec));
        return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
      }
      const { rows } = await query<UserRow>(
        `SELECT ${USER_COLS} FROM users WHERE name = $1`,
        [name],
      );
      const user = rows[0];
      if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
        return reply.code(401).send({ error: 'Invalid name or password' });
      }
      clear(key); // successful login resets the counter
      const token = app.jwt.sign({ id: user.id, name: user.name, role: user.role });
      reply.setCookie(COOKIE_NAME, token, cookieOptions);
      return publicUser(user);
    },
  );

  // Change the logged-in user's password (requires the current one).
  app.post<{ Body: { current_password: string; new_password: string } }>(
    '/password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['current_password', 'new_password'],
          properties: {
            current_password: { type: 'string', minLength: 1, maxLength: 200 },
            new_password: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      const { rows } = await query<UserRow>(
        `SELECT ${USER_COLS} FROM users WHERE id = $1`,
        [req.user.id],
      );
      const user = rows[0];
      if (!user || !user.password_hash) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      // Throttle current-password guessing from a stolen session.
      const key = `pwchange:${user.id}`;
      const gate = hit(key);
      if (!gate.ok) {
        reply.header('Retry-After', String(gate.retryAfterSec));
        return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
      }
      if (!(await verifyPassword(req.body.current_password, user.password_hash))) {
        return reply.code(403).send({ error: 'Current password is incorrect' });
      }
      clear(key);
      const hash = await hashPassword(req.body.new_password);
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, user.id]);
      return { ok: true };
    },
  );

  // Clear the session cookie.
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
};
