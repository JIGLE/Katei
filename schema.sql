-- Katei (家庭) — relational schema
-- Loaded automatically by the postgres container on first boot
-- (mounted into /docker-entrypoint-initdb.d/).
-- Tables are declared in dependency order so foreign keys resolve.

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email TEXT, -- optional; used for identity and (future) recovery
    avatar_url TEXT,
    password_hash TEXT,
    ntfy_url TEXT, -- per-member push notification topic URL (optional)
    kind VARCHAR(10) NOT NULL DEFAULT 'human', -- 'human' | 'pet' (pets never log in)
    birthday DATE, -- optional; drives birthday reminders for people & pets
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- 'admin' | 'member'; first account is admin
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Key/value store for app-level settings (e.g. the JWT signing secret).
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE money_streams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    is_recurring BOOLEAN DEFAULT TRUE,
    frequency VARCHAR(50) DEFAULT 'monthly', -- 'monthly', 'yearly', 'one-off'
    category VARCHAR(100),
    stream_type VARCHAR(20) NOT NULL DEFAULT 'expense', -- 'income' | 'expense' | 'savings'
    due_day SMALLINT NOT NULL DEFAULT 1,           -- day-of-month the stream falls due (1-31)
    due_shift VARCHAR(10) NOT NULL DEFAULT 'next',  -- 'none' | 'prev' | 'next' business-day adjustment
    automated BOOLEAN NOT NULL DEFAULT FALSE,       -- paid automatically (direct debit): no action, no reminder
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE household_events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL, -- 'deadline', 'payment', 'appointment', 'income'
    target_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    money_stream_id INT REFERENCES money_streams(id) ON DELETE SET NULL,
    actual_amount DECIMAL(10, 2),  -- amount actually paid (captured at "mark as paid"); bills vary
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One-time invite codes for onboarding new members (admin-issued).
CREATE TABLE invites (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- role granted to the account that redeems it
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    used_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A lightweight household activity log — the shared pulse shown on Overview.
CREATE TABLE activity (
    id SERIAL PRIMARY KEY,
    actor_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(40) NOT NULL, -- 'stream_added' | 'event_added' | 'event_done' | 'payment_paid' | 'member_added'
    summary TEXT NOT NULL,       -- the entity's name (e.g. 'Rent'), rendered into a sentence client-side
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Savings pots — named goals a contribution can target (holiday, furniture, …).
CREATE TABLE savings_goals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    target_amount DECIMAL(10, 2),     -- optional target; null = open-ended
    icon VARCHAR(16),                 -- optional emoji
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Savings ledger — set-aside money accumulates here. Household savings balance =
-- opening amount (app_settings 'savings_opening') + SUM(amount) of these entries.
-- Each entry may be allocated to a pot; null counts toward the default pot.
CREATE TABLE savings_entries (
    id SERIAL PRIMARY KEY,
    amount DECIMAL(10, 2) NOT NULL,   -- a contribution (positive) or withdrawal (negative)
    note TEXT,                        -- optional label, e.g. 'Bonus' or a recurring stream name
    occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
    money_stream_id INT REFERENCES money_streams(id) ON DELETE SET NULL,
    goal_id INT REFERENCES savings_goals(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Per-user in-app notifications (the header bell). ntfy is a parallel channel.
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,        -- 'reminder' | 'birthday' | 'assignment' | ...
    title TEXT NOT NULL,
    body TEXT,
    event_id INT REFERENCES household_events(id) ON DELETE SET NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Web Push subscriptions — one per member device/browser (VAPID).
CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, endpoint)
);

CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_id INT REFERENCES household_events(id) ON DELETE CASCADE,
    money_stream_id INT REFERENCES money_streams(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'owner'
);
