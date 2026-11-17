<div align="center">

# Katei

**A calm, self-hosted home for your household's plans, shopping and gift lists.**

[![CI](https://github.com/JIGLE/Katei/actions/workflows/ci.yml/badge.svg)](https://github.com/JIGLE/Katei/actions/workflows/ci.yml)
[![Build & Push to GHCR](https://github.com/JIGLE/Katei/actions/workflows/docker.yml/badge.svg)](https://github.com/JIGLE/Katei/actions/workflows/docker.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Image: ghcr.io/jigle/katei](https://img.shields.io/badge/image-ghcr.io%2Fjigle%2Fkatei-2b3137?logo=docker&logoColor=white)](https://github.com/JIGLE/Katei/pkgs/container/katei)

</div>

Katei (家庭, "household") is a mobile-first progressive web app that keeps a
household aware of what is coming up: what to buy, where to go, what to pay and
whose birthday is next. It runs as a single Docker container with its own
database, and is built for home servers such as TrueNAS SCALE.

- **Overview** that answers "what do we need to get, go to and pay soon?" at a glance
- **Timeline** of appointments, deadlines and recurring obligations
- **Money Flow** for recurring costs, utilities, subscriptions and savings goals
- **Lists** for shopping (grouped by store) and gift wishlists, shareable by link
- **Household** members, roles and assignments, with per-person privacy
- Installable on phones, with push or [ntfy](https://ntfy.sh) reminders and daily backups
- Available in English, German, French, Spanish, Italian and Dutch

**Contents:** [Stack](#stack) · [Quick start](#quick-start) ·
[Development](#development-without-docker) ·
[Deploying](#deploying-to-truenas-scale-custom-app-gui) · [Domains](#domains) ·
[Contributing](#contributing) · [License](#license)

## Stack

| Layer     | Technology                                                                |
| --------- | ------------------------------------------------------------------------- |
| App       | Fastify + TypeScript serving REST API **and** the built SPA (node:alpine) |
| Database  | PostgreSQL 16 (bundled inside the app image)                              |
| DB access | Raw SQL via node-postgres (`pg`)                                          |
| Frontend  | React + TypeScript + Tailwind CSS v3 (Vite)                               |

Everything runs in **one container**. PostgreSQL starts via `entrypoint.sh`, the schema is applied on first boot, then Fastify serves the SPA and API. One volume mount persists the database.

## Quick start

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
        └── pages/          # Overview | Timeline | MoneyFlow | Lists | Household
```

## Development (without Docker)

```bash
# Terminal 1 — backend (API only; no ./public in dev, so SPA serving is skipped)
cd backend && npm install && npm run dev

# Terminal 2 — frontend (Vite dev server, proxies /api → localhost:3000)
cd frontend && npm install && npm run dev
```

A local postgres instance is required for dev. The `DATABASE_URL` env var must be set.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup and the checks CI runs.

## Deploying to TrueNAS SCALE (Custom App GUI)

Images are built and pushed to GHCR automatically by GitHub Actions on every push to `main`.

**Apps → Discover Apps → Custom App** — fill in the form:

| Field                                      | Value                                                   |
| ------------------------------------------ | ------------------------------------------------------- |
| Image Repository                           | `ghcr.io/jigle/katei`                                   |
| Image Tag                                  | `latest`, or a version such as `1.2.0` to pin a release |
| Env `POSTGRES_PASSWORD`                    | your strong password                                    |
| Env `NODE_ENV`                             | `production`                                            |
| Env `JWT_SECRET` _(optional, recommended)_ | a long random string                                    |
| Host Port                                  | `8080` → Container Port `3000`                          |
| Volume host path                           | `/mnt/HDD/app-data/databases/katei`                     |
| Volume mount path                          | `/var/lib/postgresql/data`                              |

> Create the `/mnt/HDD/app-data/databases/katei` dataset in TrueNAS before deploying.

On first start, the container initialises PostgreSQL, creates the `katei` user/database, and loads `schema.sql` automatically. Subsequent restarts skip the init step.

### Settings that survive a DB reset

The session secret and notification settings live in the database. Set these
optional env vars to make them authoritative on every boot, so a wiped volume
self-heals instead of logging everyone out or silently stopping reminders:

| Env var      | Effect                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET` | Pins the session-signing secret. Set this so logins survive redeploys and DB resets. If unset, a random secret is generated once and reused. |
| `NTFY_URL`   | Seeds the ntfy topic URL (otherwise managed in the UI).                                                                                      |
| `LEAD_DAYS`  | Seeds how many days ahead reminders fire (default `3`).                                                                                      |

### Backups

A `pg_dump` runs daily and is written to `katei_backups/` **inside the data
volume**, keeping the most recent 7 (configurable via `BACKUP_RETENTION`). Since
it lives in the mounted volume, backups persist across restarts and redeploys.
Each dump is self-contained (`--clean --if-exists`), so restoring replaces the
current database with the snapshot.

From **Settings → Backups** you can take a backup on demand and download any
snapshot to keep it off-box.

**Restore** with the bundled helper (lists snapshots, then restores the chosen
one, with a confirmation prompt):

```bash
docker exec -it <container> /app/restore.sh                    # list backups
docker exec -it <container> /app/restore.sh katei_2026-06-30.sql
```

The app also auto-generates events for recurring money streams — a "monthly"
stream named _Rent_ spawns a _Rent due_ event for the first of next month, so
recurring obligations show up on the timeline without manual entry.

Point a Cloudflare Tunnel (or reverse proxy) at `<truenas-ip>:8080`.

Future deploys: `git push` → Actions rebuilds `ghcr.io/jigle/katei:latest` → hit **Update** in TrueNAS.

## Domains

| Tab        | Route        | Purpose                                                                                                                                                                            |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview   | `/`          | The daily glance — what to get, go to, and pay soon. Deliberately carries no money amounts; shortcuts into Shopping and Gifts, dated payment/appointment rows, birthdays, activity |
| Timeline   | `/timeline`  | Chronological stream of upcoming events and deadlines                                                                                                                              |
| Money Flow | `/money`     | Recurring costs, utilities, subscriptions                                                                                                                                          |
| Lists      | `/lists`     | Shopping list (grouped by store) and gift lists — everyone's own wishlist plus everyone else's, including people outside the household                                             |
| Household  | `/household` | Family members, roles, and operational assignments                                                                                                                                 |

A gift list can be shared via a revocable link at `/gift/:token` — reachable
with no session, for people who aren't Katei users at all.

## AI-assisted development

This repository uses a two-layer approach:

- **Graphify (development knowledge):** map code relationships first, then read only targeted files.
- **Graphiti (runtime knowledge):** optional event/relationship memory for diagnostics and AI investigation.

### Development flow (preferred)

1. Graphify traversal
2. Identify smallest relevant file set
3. Targeted file reads
4. Implementation and validation

Avoid broad repository scans unless Graphify cannot answer the question.

### Copilot setup workflow

[`.github/workflows/copilot-setup-steps.yml`](.github/workflows/copilot-setup-steps.yml) preinstalls project dependencies and Graphify tooling, then builds `graphify-out/graph.json` so cloud-agent sessions start with deterministic setup.

### Optional Graphiti runtime integration

Graphiti is additive only. PostgreSQL remains the source of truth.

Environment variables:

| Env var               | Effect                                                   |
| --------------------- | -------------------------------------------------------- |
| `GRAPHITI_URL`        | Base URL for Graphiti API (enables integration when set) |
| `GRAPHITI_API_KEY`    | Optional bearer token for Graphiti API                   |
| `GRAPHITI_TIMEOUT_MS` | Optional request timeout (default `2000`)                |

Admin endpoints:

- `GET /api/settings/graphiti` — integration status
- `POST /api/settings/graphiti/query` — bounded retrieval (`query`, optional `limit` up to 20)

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
local setup, coding conventions and pull request checklist, and follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Notable changes are tracked in the
[changelog](CHANGELOG.md).

## Security

Please report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## License

Katei is licensed under the [Apache License 2.0](LICENSE).
