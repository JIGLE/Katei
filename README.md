# Katei 家庭

A premium, Japandi-inspired household obligation awareness system. Self-hosted via Docker Compose, targeted for TrueNAS SCALE.

## Stack

| Layer | Technology |
|---|---|
| Backend API | Fastify + TypeScript (node:alpine) |
| Database | PostgreSQL 16 |
| DB access | Raw SQL via node-postgres (`pg`) |
| Frontend | React + TypeScript + Tailwind CSS v3 (Vite) |
| Serving | nginx (static SPA + `/api` reverse proxy) |

## Quick Start

```bash
cp .env.example .env
# Edit .env — set a real POSTGRES_PASSWORD

docker compose up --build
```

- Frontend: http://localhost:8080
- Backend health: http://localhost:3000/health

On the first run the `postgres` container auto-initialises from `schema.sql`.

## Project Structure

```
katei/
├── docker-compose.yml
├── .env.example
├── schema.sql              # DDL — users, money_streams, household_events, assignments
├── backend/                # Fastify REST API
│   ├── Dockerfile
│   └── src/
│       ├── index.ts        # Bootstrap, /health
│       ├── config.ts
│       ├── db.ts           # pg Pool + query helper
│       └── routes/         # users | money-streams | events | assignments
└── frontend/               # React SPA (Vite build → nginx)
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── App.tsx
        ├── components/BottomNav.tsx
        └── pages/          # Overview | Timeline | MoneyFlow | Household
```

## Development (without Docker)

```bash
# Terminal 1 — backend
cd backend && npm install && npm run dev

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` → `http://localhost:3000`.

## Domains

| Tab | Route | Purpose |
|---|---|---|
| Overview | `/` | Household control tower — what needs attention now |
| Timeline | `/timeline` | Chronological stream of upcoming events and deadlines |
| Money Flow | `/money` | Recurring costs, utilities, subscriptions |
| Household | `/household` | Family members, roles, and operational assignments |
