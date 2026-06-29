# Katei 家庭

A premium, Japandi-inspired household obligation awareness system. Self-hosted via Docker Compose, targeted for TrueNAS SCALE.

## Stack

| Layer | Technology |
|---|---|
| App | Fastify + TypeScript serving REST API **and** the built SPA (node:alpine) |
| Database | PostgreSQL 16 |
| DB access | Raw SQL via node-postgres (`pg`) |
| Frontend | React + TypeScript + Tailwind CSS v3 (Vite) |

The frontend is compiled and bundled into the backend image, so a single
application container serves both the SPA and the `/api` routes. Only
PostgreSQL runs as a separate container.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set a real POSTGRES_PASSWORD

docker compose up --build
```

- App (SPA + API): http://localhost:8080
- Health: http://localhost:8080/health

On the first run the `postgres` container auto-initialises from `schema.sql`.

## Project Structure

```
katei/
├── Dockerfile              # single-image build (frontend + backend)
├── docker-compose.yml      # app + postgres
├── .env.example
├── schema.sql              # DDL — users, money_streams, household_events, assignments
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

## Deploying to TrueNAS SCALE (Custom App)

Images are built and pushed to GHCR automatically by GitHub Actions on every
push to `main`. To deploy:

1. **Apps → Discover Apps → Custom App**
2. Paste a compose spec using the prebuilt image:

   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       restart: unless-stopped
       environment:
         POSTGRES_USER: katei
         POSTGRES_PASSWORD: your_strong_password
         POSTGRES_DB: katei
       volumes:
         - /mnt/tank/katei-pgdata:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U katei -d katei"]
         interval: 5s
         timeout: 5s
         retries: 10

     app:
       image: ghcr.io/jigle/katei:latest
       restart: unless-stopped
       environment:
         DATABASE_URL: postgresql://katei:your_strong_password@postgres:5432/katei
         NODE_ENV: production
       ports:
         - "8080:3000"
       depends_on:
         postgres:
           condition: service_healthy
   ```

   > Create the `/mnt/tank/katei-pgdata` dataset first; the schema is baked
   > into the image and auto-loads on first boot.

3. Point a Cloudflare Tunnel (or reverse proxy) at `<truenas-ip>:8080`.

Future deploys are just `git push` — Actions rebuilds `ghcr.io/jigle/katei:latest`,
then hit **Update** on the app in TrueNAS.

## Domains

| Tab | Route | Purpose |
|---|---|---|
| Overview | `/` | Household control tower — what needs attention now |
| Timeline | `/timeline` | Chronological stream of upcoming events and deadlines |
| Money Flow | `/money` | Recurring costs, utilities, subscriptions |
| Household | `/household` | Family members, roles, and operational assignments |
