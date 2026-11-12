# ============================================================================
# Jobaton OSS — Single-container Docker build
# Serves both API + static frontend from one Node.js process
# ============================================================================

# --- Stage 1: Install + Build ---
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json

# Install deps (better-sqlite3 needs native compilation)
RUN pnpm install --no-frozen-lockfile
RUN npx --yes esbuild@0.21.5 --version || true

# Copy source
COPY api/ api/
COPY web/ web/

# Build frontend (Vite → web/dist/)
RUN pnpm --filter web build

# Build API (tsup → api/dist/)
RUN pnpm --filter api build

# --- Stage 2: Production runtime ---
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy built API
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/package.json ./package.json

# Copy built frontend to be served as static files
COPY --from=build /app/web/dist ./public

# Install production deps (better-sqlite3 needs native build)
RUN npm install --omit=dev

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV API_PORT=3001
# Must listen on all interfaces inside the container; exposure is controlled by the published port.
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

CMD ["node", "dist/index.js"]
