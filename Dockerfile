# Katei — single-container build.
# Bundles the React SPA, Fastify API, and PostgreSQL into one image.
# On first boot, entrypoint.sh initialises the DB and loads schema.sql.

# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build backend ---
# Also produces the runtime's node_modules: install everything (tsc needs the
# devDependencies), compile, then prune the dev tree away in place. Stage 3
# copies the result rather than installing a second time — that second install
# was the single slowest step in the image build (~7 min for 176 packages).
FROM node:20-alpine AS backend
WORKDIR /backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
RUN npm prune --omit=dev

# --- Stage 3: runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

# Install PostgreSQL (server + client tools for pg_isready / psql).
RUN apk add --no-cache postgresql16 postgresql16-client su-exec

ENV NODE_ENV=production
ENV PGDATA=/var/lib/postgresql/data

# Production Node dependencies — the pruned tree from the backend stage (same
# base image, so sharp's native musl binaries carry over intact).
COPY backend/package*.json ./
COPY --from=backend /backend/node_modules ./node_modules

# Compiled API.
COPY --from=backend /backend/dist ./dist

# Bundled SPA (served by Fastify from ./public).
COPY --from=frontend /frontend/dist ./public

# Schema — loaded by entrypoint on first boot.
COPY schema.sql ./schema.sql

# Entrypoint + restore helper scripts.
COPY entrypoint.sh /entrypoint.sh
COPY restore.sh /app/restore.sh
RUN chmod +x /entrypoint.sh /app/restore.sh

VOLUME ["/var/lib/postgresql/data"]

EXPOSE 3000

CMD ["/entrypoint.sh"]
