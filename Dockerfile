# Katei — single-image build.
# Compiles the React SPA and the Fastify API, then bundles the static
# frontend into the backend image so one container serves everything.

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
ENV NODE_ENV=production

# Production dependencies only.
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Compiled API + bundled SPA (served from ./public by Fastify).
COPY --from=backend /backend/dist ./dist
COPY --from=frontend /frontend/dist ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
