# Katei — single-container build.
# Bundles the React SPA, Fastify API, and PostgreSQL into one image.
# On first boot, entrypoint.sh initialises the DB and loads schema.sql.

# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: build backend ---
FROM node:20-alpine AS backend
WORKDIR /backend
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# --- Stage 3: runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

# Install PostgreSQL (server + client tools for pg_isready / psql).
RUN apk add --no-cache postgresql16 postgresql16-client su-exec

ENV NODE_ENV=production
ENV PGDATA=/var/lib/postgresql/data

# Production Node dependencies.
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Compiled API.
COPY --from=backend /backend/dist ./dist

# Bundled SPA (served by Fastify from ./public).
COPY --from=frontend /frontend/dist ./public

# Schema — loaded by entrypoint on first boot.
COPY schema.sql ./schema.sql

# Entrypoint script.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/var/lib/postgresql/data"]

EXPOSE 3000

CMD ["/entrypoint.sh"]
