// PostgreSQL access layer — a single shared connection pool (node-postgres).
// Domain routers import `query` for parameterised SQL against schema.sql.

import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Run a parameterised query against the pool.
 * @example query<{ id: number }>('SELECT id FROM users WHERE id = $1', [1])
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Verify connectivity at boot; throws if the database is unreachable. */
export async function verifyConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

/**
 * Idempotent schema migrations applied at startup. schema.sql only runs when
 * the database is first created, so changes to existing deployments live here.
 */
export async function migrate(): Promise<void> {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  // Per-member notification URL — reminders for a member's assignments go here.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ntfy_url TEXT`);
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
  );
  // Timestamp a reminder was sent for an event, so we don't notify twice.
  await query(`ALTER TABLE household_events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP`);
  // Timestamp the one-time overdue escalation, separate from the pre-due
  // reminder — an item crossing its date deserves its own single nudge.
  await query(`ALTER TABLE household_events ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP`);
  // Budgeting: classify streams and schedule their recurrence.
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS stream_type TEXT NOT NULL DEFAULT 'expense'`);
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS due_day SMALLINT NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS due_shift TEXT NOT NULL DEFAULT 'next'`);
  // Automated (direct-debit) streams generate no actionable event / reminder.
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS automated BOOLEAN NOT NULL DEFAULT FALSE`);
  // Amount actually paid, captured when a payment is marked paid (bills vary).
  await query(`ALTER TABLE household_events ADD COLUMN IF NOT EXISTS actual_amount DECIMAL(10, 2)`);
  // Per-member roles + one-time invite codes (Phase 2: real household accounts).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member'`);
  // Backfill: the role column defaults to 'member', so accounts that predate it
  // (including the original owner) came out as members and got locked out of
  // household management. If no admin exists, promote the earliest real account
  // so someone can always manage members and invites. Idempotent + self-healing.
  await query(
    `UPDATE users SET role = 'admin'
      WHERE id = (
        SELECT id FROM users WHERE password_hash IS NOT NULL ORDER BY id ASC LIMIT 1
      )
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
  );
  // Optional email for identity / future recovery.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  // Non-human members (pets) + birthdays — a household is everyone who lives there.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'human'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE`);
  // Household activity log — the shared pulse shown on Overview.
  await query(
    `CREATE TABLE IF NOT EXISTS activity (
       id SERIAL PRIMARY KEY,
       actor_id INT REFERENCES users(id) ON DELETE SET NULL,
       action VARCHAR(40) NOT NULL,
       summary TEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Savings ledger — a household's set-aside money accumulates here. The balance
  // is the opening amount (app_settings 'savings_opening') plus these entries, so
  // one-time deposits and confirmed recurring contributions both count.
  await query(
    `CREATE TABLE IF NOT EXISTS savings_entries (
       id SERIAL PRIMARY KEY,
       amount DECIMAL(10, 2) NOT NULL,
       note TEXT,
       occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
       money_stream_id INT REFERENCES money_streams(id) ON DELETE SET NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Savings pots — named goals (holiday, furniture, …) a contribution can target.
  await query(
    `CREATE TABLE IF NOT EXISTS savings_goals (
       id SERIAL PRIMARY KEY,
       name VARCHAR(80) NOT NULL,
       target_amount DECIMAL(10, 2),
       icon VARCHAR(16),
       is_default BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  await query(`ALTER TABLE savings_entries ADD COLUMN IF NOT EXISTS goal_id INT REFERENCES savings_goals(id) ON DELETE SET NULL`);
  // Ensure exactly one default pot exists, seeded from the legacy single goal
  // amount; existing entries fall under it (goal_id NULL is treated as default).
  const { rows: defRows } = await query<{ id: number }>(`SELECT id FROM savings_goals WHERE is_default = TRUE LIMIT 1`);
  if (!defRows.length) {
    const target = await getSetting('savings_goal');
    await query(
      `INSERT INTO savings_goals (name, target_amount, icon, is_default) VALUES ($1, $2, $3, TRUE)`,
      ['General', target && Number(target) > 0 ? Number(target) : null, '🐷'],
    );
  }
  // Per-user in-app notifications (the header bell). ntfy remains a parallel channel.
  await query(
    `CREATE TABLE IF NOT EXISTS notifications (
       id SERIAL PRIMARY KEY,
       user_id INT REFERENCES users(id) ON DELETE CASCADE,
       type VARCHAR(40) NOT NULL,
       title TEXT NOT NULL,
       body TEXT,
       event_id INT REFERENCES household_events(id) ON DELETE SET NULL,
       read_at TIMESTAMP,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Web Push subscriptions — one per member device/browser. Reminders are pushed
  // here (VAPID); the ntfy integration has been removed.
  await query(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
       id SERIAL PRIMARY KEY,
       user_id INT REFERENCES users(id) ON DELETE CASCADE,
       endpoint TEXT NOT NULL,
       p256dh TEXT NOT NULL,
       auth TEXT NOT NULL,
       user_agent TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE (user_id, endpoint)
     )`,
  );
  // Shopping list — the household's shared, fast-moving staples list.
  await query(
    `CREATE TABLE IF NOT EXISTS shopping_items (
       id SERIAL PRIMARY KEY,
       name VARCHAR(120) NOT NULL,
       note TEXT,
       added_by INT REFERENCES users(id) ON DELETE SET NULL,
       is_done BOOLEAN NOT NULL DEFAULT FALSE,
       done_at TIMESTAMP,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Items can be grouped by where they're bought (Groceries / IKEA / ...).
  await query(`ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS store VARCHAR(80)`);
  // Gift lists — one wishlist per household member (lazily created) or per
  // external person (a friend/relative who isn't a Katei user). A list's
  // items are visible in full to everyone EXCEPT the list's own owner: the
  // owner always sees their own items as untouched ideas (status/attribution
  // masked at the API layer), so surprises survive shared devices/accounts.
  await query(
    `CREATE TABLE IF NOT EXISTS gift_lists (
       id SERIAL PRIMARY KEY,
       owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
       external_name VARCHAR(120),
       share_token TEXT UNIQUE,
       created_by INT REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT gift_lists_owner_xor_external CHECK (
         (owner_user_id IS NOT NULL AND external_name IS NULL) OR
         (owner_user_id IS NULL AND external_name IS NOT NULL)
       )
     )`,
  );
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS gift_lists_owner_uidx
       ON gift_lists(owner_user_id) WHERE owner_user_id IS NOT NULL`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS gift_items (
       id SERIAL PRIMARY KEY,
       list_id INT NOT NULL REFERENCES gift_lists(id) ON DELETE CASCADE,
       title VARCHAR(160) NOT NULL,
       url TEXT,
       link_title TEXT,
       link_site TEXT,
       price DECIMAL(10, 2),
       currency VARCHAR(3),
       status VARCHAR(10) NOT NULL DEFAULT 'idea',
       added_by INT REFERENCES users(id) ON DELETE SET NULL,
       bought_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
       bought_by_note VARCHAR(60),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Pre-existing installs: gift_items used to reference recipient_id
  // directly. Fold each distinct recipient into a lazily-created gift_lists
  // row, point items at it, then drop the old column. Guarded so it only
  // ever runs once, on the first boot after upgrade.
  {
    const { rows: legacy } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'gift_items' AND column_name = 'recipient_id'
       ) AS exists`,
    );
    await query(`ALTER TABLE gift_items ADD COLUMN IF NOT EXISTS list_id INT REFERENCES gift_lists(id) ON DELETE CASCADE`);
    if (legacy[0].exists) {
      await query(
        `INSERT INTO gift_lists (owner_user_id)
         SELECT DISTINCT recipient_id FROM gift_items
         ON CONFLICT (owner_user_id) WHERE owner_user_id IS NOT NULL DO NOTHING`,
      );
      await query(
        `UPDATE gift_items g SET list_id = gl.id
         FROM gift_lists gl WHERE gl.owner_user_id = g.recipient_id AND g.list_id IS NULL`,
      );
      await query(`ALTER TABLE gift_items ALTER COLUMN list_id SET NOT NULL`);
      await query(`ALTER TABLE gift_items DROP COLUMN recipient_id`);
    }
  }
  await query(`ALTER TABLE gift_items ADD COLUMN IF NOT EXISTS bought_by_user_id INT REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE gift_items ADD COLUMN IF NOT EXISTS bought_by_note VARCHAR(60)`);
  // Savings pots can point at the thing being saved for.
  await query(`ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS url TEXT`);
  await query(`ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS link_title TEXT`);
  await query(`ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS link_site TEXT`);
  await query(
    `CREATE TABLE IF NOT EXISTS invites (
       id SERIAL PRIMARY KEY,
       code TEXT UNIQUE NOT NULL,
       role VARCHAR(20) NOT NULL DEFAULT 'member',
       created_by INT REFERENCES users(id) ON DELETE SET NULL,
       expires_at TIMESTAMP,
       used_at TIMESTAMP,
       used_by INT REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );

  // Private money streams: visible only to their owner (see routes/money-streams.ts
  // and lib/privacy.ts). CASCADE on activity.money_stream_id is deliberate — a
  // null there reads as "not linked to anything private" = always visible, so an
  // orphaned row must vanish with its stream rather than silently un-hide.
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS private BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE activity ADD COLUMN IF NOT EXISTS money_stream_id INT REFERENCES money_streams(id) ON DELETE CASCADE`);

  await resyncSequences();
}

// Tables with a SERIAL `id` whose sequence must track max(id).
const SERIAL_TABLES = [
  'users', 'money_streams', 'household_events', 'assignments',
  'invites', 'activity', 'notifications', 'savings_entries', 'savings_goals', 'push_subscriptions',
  'shopping_items', 'gift_items', 'gift_lists',
];

/**
 * Realign each SERIAL id sequence to max(id). Restoring a dump with `pg_restore`
 * (or a manual data load) inserts rows without advancing the sequence, so the
 * next INSERT reuses an existing id and fails with a duplicate-key error — which
 * looks like "adding anything fails with a server error". Running this on every
 * boot self-heals a restored database. Idempotent and safe on a fresh one.
 */
export async function resyncSequences(): Promise<void> {
  for (const table of SERIAL_TABLES) {
    try {
      await query(
        `SELECT setval(
           pg_get_serial_sequence($1, 'id'),
           GREATEST(COALESCE((SELECT max(id) FROM ${table}), 0), 1),
           (SELECT count(*) > 0 FROM ${table})
         )`,
        [table],
      );
    } catch {
      // A table may not exist yet on a partially-migrated DB — skip it.
    }
  }
}

/** Read a single app setting, or null if unset. */
export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Upsert a single app setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

/**
 * Seed a setting only when it is not already present. Used for env-provided
 * defaults so a wiped settings table (or fresh volume) self-heals, while UI
 * changes still persist across restarts instead of being clobbered every boot.
 */
export async function setSettingIfAbsent(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
    [key, value],
  );
}

/**
 * Fetch the JWT signing secret. If JWT_SECRET is set in the environment it is
 * authoritative (upserted every boot) so sessions survive a wiped settings
 * table or fresh volume. Otherwise a random secret is generated and persisted
 * once, so zero-config deployments still keep sessions across restarts.
 */
export async function getOrCreateAuthSecret(): Promise<string> {
  if (config.jwtSecret) {
    await setSetting('auth_secret', config.jwtSecret);
    return config.jwtSecret;
  }
  const secret = randomBytes(48).toString('hex');
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('auth_secret', $1)
     ON CONFLICT (key) DO NOTHING`,
    [secret],
  );
  const { rows } = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'auth_secret'`,
  );
  return rows[0].value;
}

/**
 * Seed settings from the environment as initial *defaults* when provided. These
 * are written only if the key is absent (seed-once), so they populate a fresh /
 * wiped settings table but never clobber values the household later changes in
 * the UI — otherwise e.g. TZ (set in most containers) would silently revert the
 * saved timezone on every restart.
 */
export async function seedSettingsFromEnv(): Promise<void> {
  if (config.leadDays) await setSettingIfAbsent('notify_lead_days', config.leadDays);
  if (config.country) await setSettingIfAbsent('country', config.country);
  if (config.defaultCurrency) await setSettingIfAbsent('default_currency', config.defaultCurrency);
  if (config.locale) await setSettingIfAbsent('locale', config.locale);
  if (config.timezone) await setSettingIfAbsent('timezone', config.timezone);
  if (config.language) await setSettingIfAbsent('language', config.language);
}
