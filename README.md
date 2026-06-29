# Katei 家庭

A premium, Japandi-inspired household obligation awareness system. Self-hosted via Docker Compose, targeted for TrueNAS SCALE.

## Stack

| Layer | Technology |
|---|---|
| App | Fastify + TypeScript serving REST API **and** the built SPA (node:alpine) |
| Database | PostgreSQL 16 (bundled inside the app image) |
| DB access | Raw SQL via node-postgres (`pg`) |
| Frontend | React + TypeScript + Tailwind CSS v3 (Vite) |

Everything runs in **one container**. PostgreSQL starts via `entrypoint.sh`, the schema is applied on first boot, then Fastify serves the SPA and API. One volume mount persists the database.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set a real POSTGRES_PASSWORD

docker compose up --build
```

- App (SPA + API): http://localhost:8080
- Health: http://localhost:8080/health

## Project Structure

```
katei/
├── Dockerfile              # 3-stage build: frontend → backend → runtime + postgres
├── entrypoint.sh           # init postgres on first boot, then start node
├── docker-compose.yml      # single katei service
├── schema.sql              # DDL — users, money_streams, household_events, assignments
├── .env.example
├── backend/                # Fastify REST API (also serves the bundled SPA)
│   └── src/
│       ├── index.ts        # Bootstrap, /health, static SPA serving
│       ├── config.ts
│       ├── db.ts           # pg Pool + query helper
│       └── routes/         # users | money-streams | events | assignments
└── frontend/               # React SPA (Vite build → bundled into app image)
    └── src/
        ├── App.tsx
        ├── components/BottomNav.tsx
        └── pages/          # Overview | Timeline | MoneyFlow | Household
```

## Development (without Docker)

```bash
# Terminal 1 — backend (API only; no ./public in dev, so SPA serving is skipped)
cd backend && npm install && npm run dev

# Terminal 2 — frontend (Vite dev server, proxies /api → localhost:3000)
cd frontend && npm install && npm run dev
```

A local postgres instance is required for dev. The `DATABASE_URL` env var must be set.

## Deploying to TrueNAS SCALE (Custom App GUI)

Images are built and pushed to GHCR automatically by GitHub Actions on every push to `main`.

**Apps → Discover Apps → Custom App** — fill in the form:

| Field | Value |
|---|---|
| Image Repository | `ghcr.io/jigle/katei` |
| Image Tag | `latest` |
| Env `POSTGRES_PASSWORD` | your strong password |
| Env `NODE_ENV` | `production` |
| Env `JWT_SECRET` *(optional, recommended)* | a long random string |
| Host Port | `8080` → Container Port `3000` |
| Volume host path | `/mnt/HDD/app-data/databases/katei` |
| Volume mount path | `/var/lib/postgresql/data` |

> Create the `/mnt/HDD/app-data/databases/katei` dataset in TrueNAS before deploying.

On first start, the container initialises PostgreSQL, creates the `katei` user/database, and loads `schema.sql` automatically. Subsequent restarts skip the init step.

### Settings that survive a DB reset

The session secret and notification settings live in the database. Set these
optional env vars to make them authoritative on every boot, so a wiped volume
self-heals instead of logging everyone out or silently stopping reminders:

| Env var | Effect |
|---|---|
| `JWT_SECRET` | Pins the session-signing secret. Set this so logins survive redeploys and DB resets. If unset, a random secret is generated once and reused. |
| `NTFY_URL` | Seeds the ntfy topic URL (otherwise managed in the UI). |
| `LEAD_DAYS` | Seeds how many days ahead reminders fire (default `3`). |

### Backups

A `pg_dump` runs daily and is written to `katei_backups/` **inside the data
volume**, keeping the most recent 7 (configurable via `BACKUP_RETENTION`). Since
it lives in the mounted volume, backups persist across restarts and redeploys.
To restore: `psql --dbname "$DATABASE_URL" -f katei_YYYY-MM-DD.sql`.

The app also auto-generates events for recurring money streams — a "monthly"
stream named *Rent* spawns a *Rent due* event for the first of next month, so
recurring obligations show up on the timeline without manual entry.

Point a Cloudflare Tunnel (or reverse proxy) at `<truenas-ip>:8080`.

Future deploys: `git push` → Actions rebuilds `ghcr.io/jigle/katei:latest` → hit **Update** in TrueNAS.

## Domains

| Tab | Route | Purpose |
|---|---|---|
| Overview | `/` | Household control tower — what needs attention now |
| Timeline | `/timeline` | Chronological stream of upcoming events and deadlines |
| Money Flow | `/money` | Recurring costs, utilities, subscriptions |
| Household | `/household` | Family members, roles, and operational assignments |
