# syntax=docker/dockerfile:1
# Multi-stage build for the TestingFlow backend.
# IMPORTANT: build context must be the REPO ROOT (not ./backend) because this is
# an npm workspaces monorepo and the lockfile lives at the repo root.
#   docker build -f backend/Dockerfile -t <image> .

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# OpenSSL is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install deps using the root lockfile, scoped to the backend workspace.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci -w @testingflow/backend --include-workspace-root

# Generate the Prisma client, then compile TypeScript -> dist/.
COPY backend/prisma ./backend/prisma
RUN npm run prisma:generate -w @testingflow/backend
COPY backend/tsconfig.json backend/tsconfig.build.json ./backend/
COPY backend/src ./backend/src
# build:prod uses tsconfig.build.json which excludes src/__tests__ from dist.
RUN npm run build:prod -w @testingflow/backend

# NOTE: dev deps are intentionally kept — the runtime CMD shells out to the
# `prisma` CLI (a devDependency) for `migrate deploy` on container start.

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# All backend deps (incl. the generated Prisma client) hoist to the root
# node_modules; Node resolves them from /app/backend by walking up the tree.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/package.json ./backend/package.json

WORKDIR /app/backend

# Cloud Run injects PORT (default 8080); src/config/env.ts reads it.
EXPOSE 8080

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
