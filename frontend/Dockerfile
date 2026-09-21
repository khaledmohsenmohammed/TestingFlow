# syntax=docker/dockerfile:1
# Frontend built with Vite and served as a static site by nginx on Cloud Run.
# Build context = repo root (the npm workspaces lockfile lives there):
#   docker build -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=<url> -t <image> .

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci -w @testingflow/frontend --include-workspace-root

COPY frontend ./frontend
# Vite inlines env vars at build time; CI passes the backend Cloud Run URL here.
ARG VITE_API_BASE_URL
RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build -w @testingflow/frontend

# ── Runtime ────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime
# nginx listens on 8080 (Cloud Run's default $PORT); SPA fallback for routing.
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
