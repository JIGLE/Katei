# Katei backend — multi-stage build on node:alpine

# --- Stage 1: build ---
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (incl. dev) for the TypeScript compile.
COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Default port (overridable via BACKEND_PORT env).
EXPOSE 3000

CMD ["node", "dist/index.js"]
