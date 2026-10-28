# syntax=docker/dockerfile:1.7
#
# Targets:
#   runtime (default) — the API served by Cloud Run service `hodi-api`
#   migrate           — runs `prisma migrate deploy`; used by Cloud Run job `hodi-migrate`
#
#   docker build -t hodi-api .
#   docker build --target migrate -t hodi-migrate .

ARG NODE_IMAGE=node:22-slim

# ── deps + build ────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ── migrations (full deps: needs the prisma CLI) ────────────────────────────────
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── production dependencies only ────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── runtime ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8080
# Cloud Run sends SIGTERM before stopping an instance; Nest's shutdown hooks drain and close.
CMD ["node", "dist/main.js"]
